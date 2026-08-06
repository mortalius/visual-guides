/* ============================================================
   Путь трейса - расчётное ядро (pure functions, no DOM)
   ------------------------------------------------------------
   Единственный источник цифр для Воронки, Резолвера, Таймлайна и
   подписей Атласа потерь. Если считать в каждой линзе отдельно,
   представления разойдутся в числах - для материала про
   количественный итог это смертельно.

   Экспортирует глобали, потребляемые data.js и app.js:
     DEFAULT_COHORTS, buildPolicies, vote, resolve,
     collectorFunnel, tempoFunnel, blockSlicing,
     widthOf / MIN_W / MAX_W / GAMMA, fmtPct, fmtNum
   ============================================================ */
"use strict";

/** Трафик как когорты: доля объёма × признаки. Детерминированно, без монетки. */
const DEFAULT_COHORTS = [
  { id: 'err',      label: 'ошибки',     share: 0.02, error: true,  latencyMs: 120 },
  { id: 'fast',     label: '< 250 мс',   share: 0.78, error: false, latencyMs: 120 },
  { id: 'mid',      label: '250-500 мс', share: 0.12, error: false, latencyMs: 380 },
  { id: 'slow',     label: '500-750 мс', share: 0.05, error: false, latencyMs: 620 },
  { id: 'veryslow', label: '> 750 мс',   share: 0.03, error: false, latencyMs: 900 },
];

/**
 * Политики tail_sampling. Структура повторяет конфиг процессора:
 * type + вложенные and_sub_policy для составных.
 */
function buildPolicies(p) {
  return [
    { name: 'errors-policy', type: 'status_code', statusCodes: ['ERROR'] },
    { name: '750ms-latency', type: 'latency', thresholdMs: 750 },
    { name: '500ms-latency', type: 'and', sub: [
      { name: 'latency-check', type: 'latency', thresholdMs: 500 },
      { name: 'probabilistic', type: 'probabilistic', pct: p.pct500 },
    ]},
    { name: '250ms-latency', type: 'and', sub: [
      { name: 'latency-check', type: 'latency', thresholdMs: 250 },
      { name: 'probabilistic', type: 'probabilistic', pct: p.pct250 },
    ]},
    { name: 'baseline', type: 'probabilistic', pct: p.baseline },
  ];
}

/** Голос одной (возможно составной) политики по когорте. */
function vote(policy, cohort) {
  switch (policy.type) {
    case 'status_code':
      return { decision: cohort.error ? 'sampled' : 'not_sampled', p: cohort.error ? 1 : 0 };
    case 'latency':
      return cohort.latencyMs >= policy.thresholdMs
        ? { decision: 'sampled', p: 1 }
        : { decision: 'not_sampled', p: 0 };
    case 'probabilistic':
      return { decision: 'sampled', p: policy.pct / 100, probabilistic: true };
    case 'drop':
      return { decision: 'drop', p: 0 };
    case 'and': {
      // AND: все под-политики должны сказать «да». Детерминированные части
      // работают как 0/1, вероятностная даёт свою p.
      let p = 1, anyProb = false;
      for (const s of policy.sub) {
        const v = vote(s, cohort);
        if (v.probabilistic) { anyProb = true; p = Math.min(p, v.p); }
        else if (v.p === 0) return { decision: 'not_sampled', p: 0 };
      }
      return { decision: p > 0 ? 'sampled' : 'not_sampled', p, probabilistic: anyProb };
    }
    default:
      return { decision: 'not_sampled', p: 0 };
  }
}

/**
 * Резолвинг набора политик по когорте.
 *
 * Порядок разрешения процессора: drop → inverted-not-sample → sample
 *                              → inverted-sample → иначе not sampled.
 * Ключевое: это OR с вето, а НЕ AND. Любая политика, сказавшая «sample»,
 * отправляет трейс дальше; drop перебивает всех.
 *
 * correlated=true - как в реальном процессоре: все probabilistic-политики
 * хешируют один trace ID одной и той же солью (defaultHashSalt="default-hash-seed",
 * FNV-1a над salt||traceID), поэтому решения ВЛОЖЕНЫ: прошедший 25% проходит и 50%.
 * Итог = max(p_i), а не 1-Π(1-p_i).
 *
 * correlated=false - распространённое неверное допущение, оставлено для сравнения.
 */
function resolve(cohort, policies, correlated = true) {
  const votes = policies.map(pol => ({ name: pol.name, type: pol.type, ...vote(pol, cohort) }));

  if (votes.some(v => v.decision === 'drop')) {
    return { decision: 'drop', p: 0, votes, reason: 'политика drop - вето, перебивает любые sample' };
  }
  const deterministic = votes.filter(v => v.decision === 'sampled' && !v.probabilistic && v.p === 1);
  if (deterministic.length) {
    return { decision: 'sampled', p: 1, votes,
             reason: `«${deterministic[0].name}» голосует sample безусловно - одной достаточно` };
  }
  const probs = votes.filter(v => v.probabilistic && v.p > 0).map(v => v.p);
  if (!probs.length) {
    return { decision: 'not_sampled', p: 0, votes, reason: 'ни одна политика не проголосовала sample' };
  }
  const p = correlated
    ? Math.max(...probs)
    : 1 - probs.reduce((acc, x) => acc * (1 - x), 1);
  return {
    decision: 'probabilistic', p, votes,
    reason: correlated
      ? `общий hash salt ⇒ решения вложены, итог = max(${probs.map(fmtPct).join(', ')})`
      : `допущение независимости ⇒ 1-Π(1-p) по (${probs.map(fmtPct).join(', ')})`,
  };
}

/** Воронка акта 2: когорты → политики → sampled/dropped. */
function collectorFunnel(params) {
  const policies = buildPolicies(params);
  const cohorts = params.cohorts || DEFAULT_COHORTS;
  const rows = cohorts.map(c => {
    const r = resolve(c, policies, params.correlated);
    const head = params.headRatio / 100;              // head sampling в SDK
    const afterHead = c.share * head;
    return { cohort: c, ...r, afterHead, kept: afterHead * r.p, dropped: afterHead * (1 - r.p) };
  });
  const total = cohorts.reduce((s, c) => s + c.share, 0);
  const afterHead = rows.reduce((s, r) => s + r.afterHead, 0);
  const kept = rows.reduce((s, r) => s + r.kept, 0);
  return {
    rows, total, afterHead, kept,
    droppedHead: total - afterHead,
    droppedTail: afterHead - kept,
    keptOfAll: kept / total,
  };
}

/** Акт 1: head sampling в SDK - простое сужение 100% → X%. */
function headFunnel(params) {
  const cohorts = params.cohorts || DEFAULT_COHORTS;
  const total = cohorts.reduce((s, c) => s + c.share, 0);
  const ratio = params.headRatio / 100;
  return {
    total, ratio,
    rows: cohorts.map(c => ({ cohort: c, kept: c.share * ratio, dropped: c.share * (1 - ratio) })),
    kept: total * ratio,
    dropped: total * (1 - ratio),
  };
}

/**
 * Акт 3: отбросы Tempo по трём лимитам ingestion.
 * Числа абстрактные - показываем механику и порядок величины, не прогноз.
 */
function tempoFunnel(input, params) {
  const rateCap = params.rateLimitPct / 100;
  const rateLimited = Math.max(0, input - input * rateCap);
  let flow = input - rateLimited;
  const tooLarge = flow * (params.tooLargeShare / 100);
  flow -= tooLarge;
  const liveCap = params.liveTracesPct / 100;
  const liveExceeded = Math.max(0, flow - flow * liveCap);
  flow -= liveExceeded;
  return {
    input, rateLimited, tooLarge, liveExceeded,
    stored: flow,
    losses: [
      { at: 'distributor', error: 'RATE_LIMITED', value: rateLimited,
        tune: 'rate_limit_bytes, burst_size_bytes' },
      { at: 'distributor', error: 'TRACE_TOO_LARGE', value: tooLarge,
        tune: 'max_bytes_per_trace, max_live_traces_bytes' },
      { at: 'ingester', error: 'LIVE_TRACES_EXCEEDED', value: liveExceeded,
        tune: 'max_traces_per_user', cost: 'память ingester ∝ лимиту; править requests/limits и HPA' },
    ],
  };
}

/** Нарезка длинного трейса на блоки: сколько блоков и почему. */
function blockSlicing(params) {
  const { traceDurationMin, idlePeriodS, livePeriodS, gapS } = params;
  const durS = traceDurationMin * 60;
  // Трейс режется, когда пауза между спанами превышает trace_idle_period,
  // либо когда трейс живёт дольше trace_live_period.
  const cutByIdle = gapS > idlePeriodS;
  const byLive = Math.max(1, Math.ceil(durS / livePeriodS));
  const blocks = cutByIdle ? Math.max(byLive, 2) : byLive;
  return {
    durS, blocks, cutByIdle, byLive,
    fragmentMetric: blocks > 1
      ? 'rootless_trace_flushed_to_wal / disconnected_trace_flushed_to_wal'
      : null,
  };
}

/**
 * Акт 4: сколько блоков читает запрос.
 * lookup по trace ID читает ВСЕ блоки (он не знает, где лежит трейс, и обязан
 * собрать его целиком); TraceQL-поиск отсекает блоки по времени и bloom-фильтрам,
 * поэтому у фрагментированного трейса может показать только часть.
 */
function readPath(params) {
  const b = blockSlicing(params);
  const scanned = Math.max(1, Math.min(b.blocks, Math.ceil(b.blocks * (params.traceqlScanPct / 100))));
  return {
    blocks: b.blocks,
    lookupBlocks: b.blocks,          // всегда все
    traceqlBlocks: scanned,
    complete: scanned >= b.blocks,
    missedFraction: (b.blocks - scanned) / b.blocks,
  };
}

/* ---- шкала ширины Sankey (DESIGN.md §3.7) ----
   Линейная ширина прячет малые потоки: 3% от общего объёма ≈ нитка в 1px.
   Сжимаем динамический диапазон степенью γ и держим пол по минимуму.
   Ширины после γ-сжатия НЕ пропорциональны - поэтому у каждой ленты
   обязательна подпись процентом (это правило проверяется self-test'ом). */
const MIN_W = 3, MAX_W = 116, GAMMA = 0.5;
const widthOf = (value, total, gamma = GAMMA, maxW = MAX_W) =>
  value <= 0 ? 0 : Math.max(MIN_W, Math.pow(value / total, gamma) * maxW);

/** Фиксированная разрядность: 0.39% / 12.8% / 100%, никогда 12.7999999%. */
const fmtPct = v => {
  const p = v * 100;
  if (p === 0) return '0%';
  if (p < 0.1) return p.toFixed(3).replace(/0+$/, '') + '%';
  if (p < 10) return (Math.round(p * 100) / 100) + '%';
  return (Math.round(p * 10) / 10) + '%';
};

/** Секунды в человеческую подпись оси: 90s → «1.5м», 30s → «30с». */
const fmtNum = s => s >= 60 ? `${Math.round(s / 6) / 10}м` : `${s}с`;
