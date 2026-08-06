/* ============================================================
   Путь трейса - поведение (no content here)
   ------------------------------------------------------------
   Зависит от глобалей:
     model.js - resolve/collectorFunnel/tempoFunnel/blockSlicing/
                headFunnel/readPath/widthOf/fmtPct/fmtNum
     data.js  - ACTS/LENSES/MATRIX/COPY/ROLES/KNOBS/CONFIGS/
                LOSS_POINTS/VERSIONS
   DOM-контракт (id) задан в index.html.

   Один STATE + render(): любое изменение (акт, линза, ручка,
   переключатель модели) перерисовывает и схему, и панель из
   пересчитанной модели. Объём взаимодействия этого не перерастает,
   а расхождение чисел между линзами становится невозможным.
   ============================================================ */
"use strict";

const STATE = {
  act: 'collector',        // ядро материала - начинаем с него
  lens: 'funnel',
  correlated: true,        // модель вероятностных политик: max(p) - верная
  params: {
    headRatio: 100, baseline: 3, pct250: 25, pct500: 50,
    rateLimitPct: 97, tooLargeShare: 1.5, liveTracesPct: 96,
    traceDurationMin: 2, idlePeriodS: 30, livePeriodS: 150, gapS: 5,
    decisionWaitS: 10, spanArrivalS: 3, lateSpanS: 14,
    traceqlScanPct: 50,
  },
};

/* ---------------- helpers ---------------- */

const $ = id => document.getElementById(id);
const SVGNS = 'http://www.w3.org/2000/svg';

function el(tag, attrs = {}, text) {
  const n = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v != null) n.setAttribute(k, v);
  if (text != null) n.textContent = text;
  return n;
}
function svgRoot(w, h, label) {
  const s = el('svg', { class: 'diagram', viewBox: `0 0 ${w} ${h}`, role: 'img' });
  if (label) s.appendChild(el('title', {}, label));
  return s;
}
/** Обёртка с горизонтальным скроллом - схема не сжимается до нечитаемости. */
function mount(parent, svg) {
  const d = document.createElement('div');
  d.className = 'diagram-scroll';
  d.appendChild(svg);
  parent.appendChild(d);
}
function defsArrows(svg) {
  const defs = el('defs');
  const mk = (id, stroke) => {
    const m = el('marker', { id, viewBox: '0 0 10 10', refX: 8.5, refY: 5,
      markerWidth: 7, markerHeight: 7, orient: 'auto-start-reverse' });
    m.appendChild(el('path', { d: 'M0.5,0.5 L9,5 L0.5,9.5', fill: 'none',
      stroke, 'stroke-width': 1.6, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    return m;
  };
  defs.appendChild(mk('ar', 'var(--border-2)'));
  defs.appendChild(mk('ar-cfg', 'var(--text-3)'));
  defs.appendChild(mk('ar-keep', 'var(--accent-keep)'));
  defs.appendChild(mk('ar-drop', 'var(--accent-drop)'));
  svg.appendChild(defs);
}

/**
 * Узел схемы. hue - имя категорийного токена роли (--c-*), НЕ семантического:
 * роль узла и судьба трейса - два независимых измерения (DESIGN.md §1).
 */
function node(g, { x, y, w, h, kind, title, sub, hue, cls = '', cost }) {
  const gg = el('g', { class: `node ${cls}`.trim(), style: hue ? `--na:var(${hue})` : null });
  gg.appendChild(el('rect', { class: 'node-box', x, y, width: w, height: h, rx: 8 }));
  if (cls.includes('stateful')) {
    gg.appendChild(el('rect', { class: 'state-hatch', x: x + 4, y: y + 4,
      width: w - 8, height: h - 8, rx: 5 }));
  }
  let ty = y + 17;
  if (kind) { gg.appendChild(el('text', { class: 'node-kind', x: x + 11, y: ty }, kind)); ty += 15; }
  gg.appendChild(el('text', { class: 'node-title', x: x + 11, y: kind ? ty : y + h / 2 + (sub ? -1 : 4) }, title));
  if (sub) gg.appendChild(el('text', { class: 'node-sub', x: x + 11, y: (kind ? ty : y + h / 2 - 1) + 14 }, sub));
  if (cost) gg.appendChild(el('text', { class: 'state-cost', x: x + 11, y: y + h - 7 }, cost));
  g.appendChild(gg);
  return gg;
}
/** Ребро: «куда идёт». Толщина постоянна - объём несут ленты (DESIGN.md §3.3). */
function edge(g, d, { cls = '', label, lx, ly, marker } = {}) {
  const gg = el('g', { class: `edge ${cls}`.trim() });
  gg.appendChild(el('path', { d, 'marker-end': `url(#${marker || (cls.includes('config') ? 'ar-cfg'
    : cls.includes('keep') ? 'ar-keep' : cls.includes('drop') ? 'ar-drop' : 'ar')})` }));
  if (label) gg.appendChild(el('text', { class: 'edge-label', x: lx, y: ly, 'text-anchor': 'middle' }, label));
  g.appendChild(gg);
  return gg;
}
function hline(g, x0, y0, x1, y1, opts) { return edge(g, `M${x0},${y0} L${x1},${y1}`, opts); }
/** Кривая-лента между двумя вертикальными отрезками. */
function ribbon(g, x0, y0, w0, x1, y1, w1, cls) {
  if (w0 <= 0 || w1 <= 0) return;              // нулевой поток не рисуем вовсе
  const mx = (x0 + x1) / 2;
  g.appendChild(el('path', { class: `ribbon ${cls}`,
    d: `M${x0},${y0} C${mx},${y0} ${mx},${y1} ${x1},${y1} L${x1},${y1 + w1} `
     + `C${mx},${y1 + w1} ${mx},${y0 + w0} ${x0},${y0 + w0} Z` }));
}
function txt(g, x, y, cls, s, anchor) {
  g.appendChild(el('text', { class: cls, x, y, 'text-anchor': anchor }, s));
}

/* ---------------- side panel builders ---------------- */

function sect(parent, heading) {
  const d = document.createElement('div');
  d.className = 'sect';
  if (heading) d.innerHTML = `<p class="sect-h">${heading}</p>`;
  parent.appendChild(d);
  return d;
}
function html(parent, markup) {
  const d = document.createElement('div');
  d.innerHTML = markup;
  while (d.firstChild) parent.appendChild(d.firstChild);
}
function knob(parent, key) {
  const c = KNOBS[key], v = STATE.params[key];
  const wrap = document.createElement('div');
  wrap.className = 'knob';
  wrap.innerHTML =
    `<div class="knob-label"><span class="kn">${c.label}${c.code ? ` <code>${c.code}</code>` : ''}</span>` +
    `<span class="val">${v}${c.unit || ''}</span></div>` +
    `<input type="range" min="${c.min}" max="${c.max}" step="${c.step || 1}" value="${v}" ` +
    `aria-label="${c.label}">` +
    (c.hint ? `<div class="hint">${c.hint}</div>` : '');
  wrap.querySelector('input').addEventListener('input', e => {
    STATE.params[key] = Number(e.target.value);
    render();
  });
  parent.appendChild(wrap);
}
/** Дисклеймер живёт рядом с ручками, а не в подвале (DESIGN.md §3.11). */
function knobsSection(parent, keys) {
  const s = sect(parent, 'Живые ручки');
  html(s, `<div class="callout"><b>Расчёт иллюстративный, не прогноз.</b>
    Числа абстрактные: показывают механику и порядок величины, а не предсказание
    для конкретного окружения.</div>`);
  const fs = document.createElement('fieldset');
  fs.className = 'knobs';
  parent.appendChild(fs);
  keys.forEach(k => knob(fs, k));
  s.appendChild(fs);
  return s;
}
/** Фрагмент конфига: свёрнут по умолчанию - подтверждающий материал. */
function configSection(parent, key, summary = 'Фрагмент конфига') {
  const raw = CONFIGS[key].replace(/\{\{(\w+)\}\}/g, (_, k) => STATE.params[k]);
  const esc = raw.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  // подсветка: комментарии → ключи → значения после двоеточия
  const lit = esc
    .replace(/(#[^\n]*)/g, '<span class="c">$1</span>')
    .replace(/^(\s*-?\s*)([\w.\/-]+)(:)/gm, '$1<span class="yk">$2</span>$3')
    .replace(/(:\s)([^\n<#]+)$/gm, (m, a, b) => `${a}<span class="v">${b}</span>`);
  const d = document.createElement('details');
  d.className = 'cfg';
  d.innerHTML = `<summary>${summary}</summary><pre class="cfg-pre">${lit}</pre>`;
  parent.appendChild(d);
}
function rolesLegend(parent, ids) {
  const s = sect(parent, 'Цвет = роль узла');
  const rows = ROLES.filter(r => ids.includes(r.cls)).map(r =>
    `<tr><td class="sw"><i style="--sw:var(${r.hue})"></i></td>` +
    `<td><b>${r.label}</b> - ${r.desc}</td></tr>`).join('');
  html(s, `<table class="legend-tbl">${rows}</table>`);
  return s;
}
/** Легенда модификаторов линий под схемой - держать синхронной со схемой. */
function edgeLegend(parent, items) {
  const d = document.createElement('div');
  d.className = 'legend';
  d.innerHTML = items.map(([cls, label]) =>
    `<span class="lg"><span class="${cls.startsWith('lg-') ? cls : 'lg-line ' + cls}"></span>${label}</span>`
  ).join('');
  parent.appendChild(d);
}

/* ═══════════════════════════════════════════════════════════════
   АКТ 1: РОЖДЕНИЕ
   ═══════════════════════════════════════════════════════════════ */

function birthMap(board, side) {
  const W = 900, H = 300;
  const svg = svgRoot(W, H, 'Рождение трейса и пропагация контекста');
  defsArrows(svg);
  const g = el('g'); svg.appendChild(g);

  node(g, { x: 16, y: 96, w: 152, h: 74, kind: 'APP + SDK', title: 'service-a',
    sub: 'создаёт root span', hue: '--c-rose' });
  node(g, { x: 232, y: 96, w: 168, h: 74, kind: 'SAMPLER', title: 'parentbased',
    sub: 'traceidratio · 1 решение', hue: '--c-violet' });
  node(g, { x: 464, y: 96, w: 168, h: 74, kind: 'PROPAGATION', title: 'traceparent',
    sub: 'W3C · flags=01', hue: '--c-blue' });
  node(g, { x: 700, y: 96, w: 184, h: 74, kind: 'EXPORT', title: 'OTLP',
    sub: 'gRPC/HTTP → collector', hue: '--c-teal' });

  // подписи рёбер поднимаем над стрелкой: зазоры между узлами уже подписей,
  // и на уровне стрелки текст наезжал бы на соседнюю рамку
  hline(g, 168, 133, 230, 133, { label: 'старт спана', lx: 199, ly: 92 });
  hline(g, 400, 133, 462, 133, { label: 'решение', lx: 431, ly: 92 });
  hline(g, 632, 133, 698, 133, { label: 'batch', lx: 665, ly: 92 });

  // downstream: решение наследуется, а не переспрашивается
  node(g, { x: 464, y: 208, w: 168, h: 62, kind: 'DOWNSTREAM', title: 'service-b',
    sub: 'наследует решение', hue: '--c-rose', cls: 'control' });
  edge(g, 'M548,170 C548,188 548,192 548,206', { cls: 'attach',
    label: 'parentbased: не решает заново', lx: 548, ly: 194 });

  txt(g, 16, 40, 'col-head', 'ЧТО ЗДЕСЬ РЕШАЕТСЯ');
  txt(g, 16, 62, 'node-sub', 'решение о семплинге принимается один раз - в корне трейса,');
  txt(g, 16, 76, 'node-sub', 'и дальше только передаётся; ни коллектор, ни Tempo не увидят отброшенного');

  mount(board, svg);
  edgeLegend(board, [['', 'путь данных'], ['attach', 'наследование решения'], ['cfg', 'не основной поток']]);

  html(board, `<div class="note"><b>Необратимость.</b> Head sampling - единственное место на всём
    пути, где данные не «отбрасываются по правилу», а <b>просто не создаются</b>. Всё остальное -
    коллектор с политиками, лимиты Tempo - работает уже с тем, что SDK пропустил.
    Поэтому <code>parentbased</code> важен: если бы каждый сервис решал заново, трейс распался бы
    на несвязанные куски по границам сервисов.</div>`);

  side.dataset.badge = 'Акт 1';
  html(side, `<div class="side-title-src" hidden></div>`);
  rolesLegend(side, ['source', 'policy', 'process', 'transport']);
  const s = sect(side, 'Consistent probability sampling');
  html(s, `<p>Современная альтернатива простому ratio: доля кодируется в <code>tracestate</code>
    (<code>th</code> - threshold, <code>rv</code> - randomness), поэтому решение
    <b>воспроизводимо и сравнимо</b> между участниками, а не зависит от того, кто первый бросил монетку.
    Это прямой мост к оговорке (б) в линзе Резолвера: при feature gate <code>usetracestate</code>
    коллектор считает вероятности по той же W3C-рандомности.</p>`);
  const c = sect(side, 'Фрагмент конфига');
  configSection(c, 'sdk', 'Переменные окружения SDK');
}

function birthFunnel(board, side) {
  const f = headFunnel(STATE.params);
  const W = 900, H = 330;
  const svg = svgRoot(W, H, 'Воронка head sampling');
  const g = el('g'); svg.appendChild(g);

  const xSrc = 20, wSrc = 150, xSink = 700, wSink = 168;
  txt(g, xSrc, 22, 'col-head', 'КОГОРТЫ ТРАФИКА');
  txt(g, xSink, 22, 'col-head', 'ИТОГ');

  const ROW = 52, TOP = 40;
  const keptW = widthOf(f.kept, f.total), dropW = widthOf(f.dropped, f.total);
  const keptTop = TOP + 10, dropTop = keptTop + Math.max(46, keptW) + 44;

  // Ленты keep и drop одной когорты выходят из РАЗНЫХ точек её правого края
  // (keep сверху, drop под ним), иначе они накладываются и дают грязную
  // тёмную полосу вместо двух читаемых потоков.
  let ky = keptTop, dy = dropTop;
  f.rows.forEach((r, i) => {
    const y = TOP + i * ROW;
    const w1 = widthOf(r.kept, f.total, GAMMA, 60);
    const w2 = widthOf(r.dropped, f.total, GAMMA, 60);
    const total = w1 + w2 + (w1 && w2 ? 2 : 0);
    let sy = y + 20 - total / 2;                        // центрируем стопку по узлу
    if (r.kept > 0) { ribbon(g, xSrc + wSrc, sy, w1, xSink, ky, w1, 'keep'); ky += w1 + 2; sy += w1 + 2; }
    if (r.dropped > 0) { ribbon(g, xSrc + wSrc, sy, w2, xSink, dy, w2, 'drop'); dy += w2 + 2; }
  });

  f.rows.forEach((r, i) => {
    const y = TOP + i * ROW;
    node(g, { x: xSrc, y, w: wSrc, h: 40, title: r.cohort.label,
      sub: `${fmtPct(r.cohort.share)} объёма`, hue: '--c-rose' });
    txt(g, xSrc + wSrc + 10, y + 4, 'n-pct keep', fmtPct(r.kept / f.total));
  });

  node(g, { x: xSink, y: keptTop, w: wSink, h: Math.max(46, keptW), title: 'стартовало',
    sub: `${fmtPct(f.kept / f.total)} от общего`, hue: '--c-emerald', cls: 'keep' });
  node(g, { x: xSink, y: dropTop, w: wSink, h: Math.max(46, dropW), title: 'не создано',
    sub: `${fmtPct(f.dropped / f.total)} от общего`, hue: '--c-rose', cls: 'drop' });

  txt(g, 20, H - 8, 'scale-note',
    'ширина - от общего объёма, шкала нелинейная (γ=0.5); проценты подписаны у каждого потока');

  mount(board, svg);
  html(board, `<div class="note"><b>Срез неизбирателен.</b> При
    <code>ratio = ${STATE.params.headRatio}%</code> все когорты режутся <b>одинаково</b>: и ошибки,
    и медленные трейсы теряют ту же долю, что и быстрые - SDK на момент решения ещё не знает, чем
    трейс закончится. Именно поэтому существует <code>tail_sampling</code>: решать «по факту» можно
    только позже, когда трейс уже собран. Обратная сторона - то, что срезано здесь,
    tail-политики восстановить не могут.</div>`);

  side.dataset.badge = 'Акт 1';
  knobsSection(side, ['headRatio']);
  const s = sect(side, 'Итог');
  html(s, `<p>Стартует <span class="num keep">${fmtPct(f.ratio)}</span> трейсов.
    Дальше по пути это <b>потолок</b>: ни один механизм ниже не может дать больше.</p>`);
  const c = sect(side, 'Фрагмент конфига');
  configSection(c, 'sdk', 'Переменные окружения SDK');
}

/* ═══════════════════════════════════════════════════════════════
   АКТ 2: КОЛЛЕКТОР
   ═══════════════════════════════════════════════════════════════ */

function collectorMap(board, side) {
  const W = 940, H = 340;
  const svg = svgRoot(W, H, 'Pipeline-граф коллектора');
  defsArrows(svg);
  const g = el('g'); svg.appendChild(g);

  node(g, { x: 16, y: 132, w: 142, h: 70, kind: 'RECEIVER', title: 'otlp',
    sub: '1 инстанс · fan-out', hue: '--c-cyan' });

  const rows = [
    { y: 26,  name: 'logs',    procs: ['memory_limiter', 'batch', 'transform'], exp: 'loki' },
    { y: 132, name: 'metrics', procs: ['memory_limiter', 'batch'], exp: 'victoriametrics' },
    { y: 238, name: 'traces',  procs: ['memory_limiter', 'tail_sampling', 'batch'], exp: 'tempo' },
  ];

  for (const r of rows) {
    hline(g, 148, 167, 214, r.y + 30);
    txt(g, 218, r.y + 10, 'node-sub', `pipeline ${r.name}`);
    let x = 214;
    // ширина колонок процессоров одинаковая: подпись самого длинного
    // (memory_limiter) + внутренние отступы, иначе текст выходит за рамку
    const PW = 128;
    for (const p of r.procs) {
      const stateful = p === 'tail_sampling';
      node(g, { x, y: r.y + 16, w: PW, h: stateful ? 50 : 40, title: p,
        hue: stateful ? '--c-violet' : '--c-blue',
        cls: stateful ? 'stateful' : '',
        cost: stateful ? 'буфер ∝ num_traces' : null });
      x += PW + 12;
    }
    hline(g, x - 6, r.y + 36, x + 18, r.y + 36);
    node(g, { x: x + 20, y: r.y + 16, w: 132, h: 40, title: r.exp, hue: '--c-teal' });
  }

  txt(g, 16, 224, 'col-head', 'СВЯЗЬ СИНХРОННАЯ');
  txt(g, 16, 244, 'node-sub', 'медленный pipeline');
  txt(g, 16, 258, 'node-sub', 'тормозит соседей');
  txt(g, 16, 272, 'node-sub', 'на том же receiver\'е');

  mount(board, svg);
  edgeLegend(board, [['', 'путь данных'],
    ['lg-sw" style="--sw:var(--c-violet)', 'stateful - держит буфер в памяти'],
    ['lg-sw" style="--sw:var(--c-cyan)', 'receiver - один инстанс на все pipeline\'ы']]);

  html(board, `<div class="note"><b>Асимметрия fan-out.</b>
    Один <code>otlp</code>-receiver питает все три pipeline'а, и связь между ними синхронная -
    поэтому один медленный pipeline создаёт backpressure для остальных, висящих на том же
    receiver'е. Процессоры не шарятся: <code>memory_limiter</code> в pipeline <code>logs</code> и
    в <code>traces</code> - два независимых инстанса. Именно поэтому второй бэкенд для трейсов,
    добавленный как отдельный pipeline со своим <code>tail_sampling</code>, <b>удваивает буфер
    в памяти</b>, хотя набор политик тот же.</div>`);

  side.dataset.badge = 'Акт 2';
  rolesLegend(side, ['receive', 'process', 'policy', 'transport']);
  const s = sect(side, 'Цена второго бэкенда');
  html(s, `<p>Два pipeline'а с <code>tail_sampling</code> - это два circular buffer'а по
    <code>num_traces</code> каждый. Дешевле развести объёмы через
    <code>forward</code> + <code>probabilistic_sampler</code>: один буфер, разные доли на выходе.</p>`);
  const c = sect(side, 'Фрагмент конфига');
  configSection(c, 'pipeline', 'service.pipelines');
}

function collectorFunnelLens(board, side) {
  const f = collectorFunnel({ ...STATE.params, correlated: STATE.correlated });
  const total = f.total;

  const W = 940, ROW = 58, TOP = 42;
  const xCohort = 16, wCohort = 138;
  const xDec = 230, wDec = 160;
  const xSink = 740, wSink = 180;

  const keptRows = f.rows.filter(r => r.kept > 0);
  const dropRows = f.rows.filter(r => r.dropped > 0);
  const sum = (rows, k) => rows.reduce((s, r) => s + widthOf(r[k], total) + 3, 0);
  const keptH = Math.max(46, sum(keptRows, 'kept'));
  const dropH = Math.max(46, sum(dropRows, 'dropped'));
  const H = Math.max(f.rows.length * ROW + TOP, keptH + dropH + 58 + TOP) + 34;

  const svg = svgRoot(W, H, 'Воронка объёмов tail_sampling');
  const g = el('g'); svg.appendChild(g);

  txt(g, xCohort, 22, 'col-head', 'КОГОРТЫ ТРАФИКА');
  txt(g, xDec, 22, 'col-head', 'РЕШЕНИЕ ПОЛИТИК');
  txt(g, xSink, 22, 'col-head', 'ИТОГ');

  const keptTop = TOP, dropTop = TOP + keptH + 46;

  // ленты первыми, коробки поверх
  let ky = keptTop, dy = dropTop;
  f.rows.forEach((r, i) => {
    const y = TOP + i * ROW, xf = xDec + wDec;
    if (r.kept > 0) { const w = widthOf(r.kept, total); ribbon(g, xf, y + 6, w, xSink, ky, w, 'keep'); ky += w + 3; }
    if (r.dropped > 0) { const w = widthOf(r.dropped, total); ribbon(g, xf, y + 22, w, xSink, dy, w, 'drop'); dy += w + 3; }
  });

  node(g, { x: xSink, y: keptTop, w: wSink, h: keptH, title: 'доедет',
    sub: `${fmtPct(f.kept / total)} от общего`, hue: '--c-emerald', cls: 'keep' });
  node(g, { x: xSink, y: dropTop, w: wSink, h: dropH, title: 'отброшено',
    sub: `${fmtPct((total - f.kept) / total)} от общего`, hue: '--c-rose', cls: 'drop' });

  f.rows.forEach((r, i) => {
    const y = TOP + i * ROW, c = r.cohort;
    node(g, { x: xCohort, y, w: wCohort, h: 44, title: c.label,
      sub: `${fmtPct(c.share)} объёма`, hue: '--c-rose' });
    const dec = r.p === 1 ? 'sample 100%' : r.decision === 'drop' ? 'drop' : fmtPct(r.p);
    const winner = r.votes.filter(v => v.p > 0)[0];
    node(g, { x: xDec, y, w: wDec, h: 44, title: dec, sub: winner ? winner.name : 'нет голосов',
      hue: r.p === 1 ? '--c-emerald' : r.p === 0 ? '--c-rose' : '--c-amber',
      cls: r.p === 1 ? 'keep' : r.p === 0 ? 'drop' : 'warn' });
    hline(g, xCohort + wCohort, y + 22, xDec - 2, y + 22);
    txt(g, xDec + wDec + 10, y + 2, `n-pct ${r.kept > 0 ? 'keep' : 'drop'}`, fmtPct(r.kept / total));
  });

  txt(g, xCohort, H - 8, 'scale-note',
    'ширина - от общего объёма, шкала нелинейная (γ=0.5); процент подписан у каждой ленты');

  mount(board, svg);
  html(board, `<div class="note">
    Head sampling пропустил <b>${fmtPct(f.afterHead / total)}</b>,
    <code>tail_sampling</code> оставил <b>${fmtPct(f.keptOfAll)}</b> исходного объёма.
    Из отброшенного: ${fmtPct(f.droppedHead / total)} срезано в SDK,
    ${fmtPct(f.droppedTail / total)} - политиками.<br><br>
    <b>Ключевое:</b> <code>baseline: ${STATE.params.baseline}%</code> не означает, что доедет
    ${STATE.params.baseline}% - ошибки и медленные трейсы забирают свою долю <i>поверх</i> baseline,
    потому что политики работают как OR, а не как AND.</div>`);

  side.dataset.badge = 'Акт 2';
  knobsSection(side, ['headRatio', 'baseline', 'pct250', 'pct500']);
  const s = sect(side, 'Итог');
  html(s, `<p>Доедет <span class="num keep">${fmtPct(f.keptOfAll)}</span> от всего,
    что произошло в приложениях.</p>
    <p>Из них безусловно сохранено (ошибки + &gt;750 мс):
    <span class="num">${fmtPct(f.rows.filter(r => r.p === 1).reduce((a, r) => a + r.kept, 0) / total)}</span>
    - эту часть baseline не контролирует.</p>`);
  const c = sect(side, 'Фрагмент конфига');
  configSection(c, 'tail', 'tail_sampling');
}

function collectorTimeline(board, side) {
  const p = STATE.params;
  const W = 940, H = 330;
  const svg = svgRoot(W, H, 'Таймлайн decision_wait и late spans');
  const g = el('g'); svg.appendChild(g);

  const x0 = 150, x1 = 900, axisY = 262;
  const maxS = Math.max(p.decisionWaitS, p.lateSpanS) + 4;
  const tx = s => x0 + (s / maxS) * (x1 - x0);

  // ось с круглыми тиками
  g.appendChild(el('line', { class: 'axis', x1: x0, y1: axisY, x2: x1, y2: axisY }));
  const step = maxS > 24 ? 4 : maxS > 12 ? 2 : 1;
  for (let s = 0; s <= maxS; s += step) {
    g.appendChild(el('line', { class: 'axis', x1: tx(s), y1: axisY, x2: tx(s), y2: axisY + 5 }));
    txt(g, tx(s), axisY + 19, 'axis-label', `${s}s`, 'middle');
  }

  // окно decision_wait
  const wEnd = tx(p.decisionWaitS);
  g.appendChild(el('rect', { class: 'band', x: x0, y: 48, width: wEnd - x0, height: axisY - 48, rx: 4 }));
  txt(g, (x0 + wEnd) / 2, 40, 'band-label', `decision_wait = ${p.decisionWaitS}s`, 'middle');

  // спаны трейса в окне
  txt(g, 16, 76, 'row-label', 'спаны трейса');
  for (let i = 0; i < 5; i++) {
    const s = (p.spanArrivalS / 4) * i;
    g.appendChild(el('rect', { class: 'span-bar', x: tx(s), y: 62, width: 20, height: 13 }));
  }

  // момент решения
  g.appendChild(el('line', { class: 'marker-line', x1: wEnd, y1: 48, x2: wEnd, y2: axisY }));
  txt(g, wEnd + 7, 58, 'marker-label', 'решение');

  // late span
  const lx = tx(p.lateSpanS);
  g.appendChild(el('rect', { class: 'span-bar late', x: lx, y: 62, width: 20, height: 13 }));
  txt(g, lx + 10, 54, 'node-sub', 'late', 'middle');

  // три судьбы
  const fates = [
    { y: 116, hue: 'var(--accent-keep)', t: 'Решение ещё в буфере',
      d: 'late span наследует решение трейса - трейс целостен' },
    { y: 164, hue: 'var(--accent-drop)', t: 'Буфер вытеснен, кэша нет',
      d: 'решаем заново ⇒ части трейса получают РАЗНЫЕ решения' },
    { y: 212, hue: 'var(--primary)', t: 'decision_cache помнит trace ID',
      d: 'решение восстановлено по ID - трейс целостен' },
  ];
  for (const f of fates) {
    g.appendChild(el('rect', { class: 'fate-swatch', x: 16, y: f.y - 12, width: 6, height: 32, fill: f.hue }));
    txt(g, 32, f.y, 'row-label', f.t);
    txt(g, 32, f.y + 15, 'node-sub', f.d);
  }

  mount(board, svg);
  html(board, `<div class="note"><b>Решение принимается однократно</b> - в момент истечения
    <code>decision_wait</code>. Средний сценарий - главная причина рваных трейсов, приходящая
    <i>не</i> от балансировщика: без <code>decision_cache</code> опоздавшие спаны одного и того же
    трейса могут быть и оставлены, и отброшены. Метрика этого -
    <code>sampling_trace_dropped_too_early</code>.</div>`);

  side.dataset.badge = 'Акт 2';
  knobsSection(side, ['decisionWaitS', 'spanArrivalS', 'lateSpanS']);
  const s = sect(side, 'Что происходит сейчас');
  html(s, p.lateSpanS > p.decisionWaitS
    ? `<div class="callout">Опоздавший спан приходит <b>через
       ${p.lateSpanS - p.decisionWaitS}s после решения</b> - в игру вступает одна из трёх судеб.</div>`
    : `<p>Опоздавший спан успевает в окно <code>decision_wait</code> и попадает в общее решение -
       трейс целостен независимо от кэша.</p>`);
  const c = sect(side, 'Фрагмент конфига');
  configSection(c, 'tail', 'tail_sampling');
}

function collectorResolver(board, side) {
  const policies = buildPolicies(STATE.params);
  const cohorts = DEFAULT_COHORTS;

  const W = 940, rowH = 34, x0 = 150, colW = 132;
  const H = 64 + cohorts.length * rowH + 24;
  const svg = svgRoot(W, H, 'Матрица голосов политик');
  const g = el('g'); svg.appendChild(g);

  // шапка: имя политики (Inter) + тип (mono); порядок = порядок разрешения
  policies.forEach((pol, i) => {
    const cx = x0 + i * colW + colW / 2;
    txt(g, cx, 24, 'node-title', pol.name.replace(/-policy|-latency/, ''), 'middle');
    txt(g, cx, 38, 'node-sub', pol.type, 'middle');
  });
  const fx = x0 + policies.length * colW + 18;
  txt(g, fx + 24, 31, 'col-head', 'ИТОГ', 'middle');
  g.appendChild(el('line', { class: 'result-sep', x1: fx - 8, y1: 16, x2: fx - 8, y2: H - 20 }));
  txt(g, x0, 12, 'scale-note', '→ порядок разрешения: слева направо, первое совпадение выигрывает');

  cohorts.forEach((c, r) => {
    const y = 56 + r * rowH;
    txt(g, 16, y + 18, 'row-label', c.label);
    const res = resolve(c, policies, STATE.correlated);
    res.votes.forEach((v, i) => {
      const x = x0 + i * colW;
      const cls = v.p === 0 ? 'no' : v.probabilistic ? 'prob' : 'yes';
      const gg = el('g', { class: `vote ${cls}` });
      gg.appendChild(el('rect', { x: x + 6, y: y + 3, width: colW - 14, height: 24, rx: 3 }));
      gg.appendChild(el('text', { x: x + (colW - 8) / 2, y: y + 19 },
        v.p === 1 ? 'sample' : v.p > 0 ? fmtPct(v.p) : '-'));
      g.appendChild(gg);
    });
    txt(g, fx + 24, y + 19, `n-pct ${res.p > 0 ? 'keep' : 'drop'}`,
      res.p === 1 ? '100%' : fmtPct(res.p), 'middle');
  });

  mount(board, svg);
  edgeLegend(board, [
    ['lg-sw" style="--sw:var(--accent-keep)', 'безусловное sample'],
    ['lg-sw" style="--sw:var(--accent-warning)', 'sample с вероятностью'],
    ['lg-sw" style="--sw:var(--border-muted)', 'политика не проголосовала'],
  ]);

  const mid = resolve(cohorts.find(c => c.id === 'mid'), policies, STATE.correlated);
  html(board, `<div class="note"><b>Порядок разрешения:</b>
    <code>drop</code> → inverted-not-sample → <code>sample</code> → inverted-sample →
    иначе not sampled. Первое совпадение выигрывает, поэтому одной проголосовавшей политики
    достаточно, а <code>drop</code> нельзя перебить никаким количеством <code>sample</code>.<br><br>
    <b>Когорта «250-500 мс»:</b> ${mid.reason} ⇒ <b>${fmtPct(mid.p)}</b>.</div>`);

  side.dataset.badge = 'Акт 2';
  const s = sect(side, 'Модель вероятностных политик');
  html(s, `<p>Все <code>probabilistic</code>-политики хешируют один trace ID
    <b>одной и той же солью</b> (<code>defaultHashSalt</code>, FNV-1a над
    <code>salt||traceID</code>). Решения поэтому <b>вложены</b>: трейс, прошедший 25%,
    проходит и 50%. Итог - <code>max(p)</code>, а не <code>1-Π(1-p)</code>.</p>`);

  const btn = document.createElement('button');
  btn.className = 'toggle';
  btn.setAttribute('aria-pressed', String(STATE.correlated));
  btn.innerHTML = STATE.correlated
    ? `<span>Модель: <code>max(p)</code></span><span class="tg-state">верная</span>`
    : `<span>Модель: <code>1-Π(1-p)</code></span><span class="tg-state">неверная</span>`;
  btn.addEventListener('click', () => { STATE.correlated = !STATE.correlated; render(); });
  s.appendChild(btn);
  html(s, STATE.correlated
    ? `<p style="margin-top:10px">Соответствует реальному процессору: соль общая,
       хеш детерминированный.</p>`
    : `<div class="callout" style="margin-top:10px"><b>Распространённое неверное допущение.</b>
       Даёт завышенный результат: для когорты «250-500 мс» 27.25% вместо 25%.
       Оставлено для сравнения - именно оно объясняет, почему интуиция
       «вероятности складываются» ошибочна.</div>`);

  const cv = sect(side, 'Границы модели');
  html(cv, `<div class="caveat">
    <span class="cv-h">Оговорки</span>
    <p><b>(а)</b> Если оператор задал политикам <b>разные</b> <code>hashSalt</code> - они
      декоррелируются, и верной становится вторая формула.</p>
    <p><b>(б)</b> При feature gate <code>usetracestate</code> FNV-путь обходится в пользу
      W3C-рандомности (<code>rv</code> из <code>tracestate</code>) - мост к consistent
      probability sampling из акта 1.</p>
    <p><b>(в)</b> <code>invert_match</code> / InvertSampled встретите в старых конфигах;
      современная замена - <code>drop</code> / <code>not</code>.</p>
  </div>`);
}

function collectorSharding(board, side) {
  const W = 940, H = 350;
  const svg = svgRoot(W, H, 'Шардирование коллекторов и локальность trace ID');
  defsArrows(svg);
  const g = el('g'); svg.appendChild(g);

  const scenes = [
    { y: 8,   bad: true,  title: 'Round-robin: трейс размазан по подам' },
    { y: 186, bad: false, title: 'loadbalancing exporter по trace ID' },
  ];

  for (const sc of scenes) {
    const hue = sc.bad ? '--c-rose' : '--c-emerald';
    const cls = sc.bad ? 'drop' : 'keep';
    txt(g, 16, sc.y + 16, 'row-label', sc.title);
    g.appendChild(el('text', { class: 'node-kind', x: 16, y: sc.y + 16,
      style: `--na:var(${hue})`, opacity: 0 }));

    node(g, { x: 16, y: sc.y + 44, w: 108, h: 44, title: 'спаны', sub: 'один trace ID', hue: '--c-rose' });
    node(g, { x: 168, y: sc.y + 44, w: 148, h: 44, title: sc.bad ? 'round-robin' : 'LB по trace ID',
      sub: sc.bad ? 'слепой к ID' : 'консистентный хеш', hue, cls });
    hline(g, 124, sc.y + 66, 166, sc.y + 66);

    for (let i = 0; i < 3; i++) {
      const py = sc.y + 28 + i * 38;
      const active = sc.bad || i === 1;
      edge(g, `M316,${sc.y + 66} C356,${sc.y + 66} 366,${py + 15} 400,${py + 15}`,
        { cls: active ? (sc.bad ? 'drop' : 'keep') : 'config' });
      node(g, { x: 402, y: py, w: 150, h: 30, title: `collector-${i}`,
        hue: active ? hue : '--c-blue', cls: active ? cls : 'control' });
      if (active) {
        txt(g, 562, py + 20, 'node-sub',
          sc.bad ? 'решает по фрагменту' : (i === 1 ? 'видит трейс целиком' : ''));
      }
    }
    node(g, { x: 748, y: sc.y + 44, w: 176, h: 44, title: sc.bad ? 'битый трейс' : 'целый трейс',
      sub: sc.bad ? 'части решены по-разному' : 'одно решение на трейс', hue, cls });
    hline(g, 722, sc.y + 66, 746, sc.y + 66, { cls });
  }

  mount(board, svg);
  edgeLegend(board, [['drop', 'фрагмент решается изолированно'], ['keep', 'трейс целиком в один инстанс'],
    ['cfg', 'инстанс не задействован для этого trace ID']]);

  html(board, `<div class="note">При обычном round-robin каждый инстанс видит лишь часть спанов
    и голосует по ней: у одного фрагмента латентность 80 мс, у другого - 700 мс, решения расходятся.
    В UI это выглядит как рваный трейс, причём <i>независимо</i> от late spans и фрагментации блоков -
    это три разные причины одного симптома. Решение - <code>loadbalancing</code> exporter,
    маршрутизирующий по trace ID.</div>`);

  side.dataset.badge = 'Акт 2';
  const s = sect(side, 'Три причины рваного трейса');
  html(s, `<p>1. <b>Балансировка не по trace ID</b> - эта линза.<br>
    2. <b>Late spans</b> без <code>decision_cache</code> - Таймлайн, акт 2.<br>
    3. <b>Фрагментация блоков</b> в Tempo - Таймлайн, акт 3.</p>
    <p>Причины независимы: устранение одной не лечит остальные. Именно поэтому линза
    Шардирование живёт и в акте 2, и в акте 3 - как контраст «сломано» / «решено системно».</p>`);
  const c = sect(side, 'Фрагмент конфига');
  configSection(c, 'lb', 'loadbalancing exporter');
}

/* ═══════════════════════════════════════════════════════════════
   АКТ 3: TEMPO WRITE PATH
   ═══════════════════════════════════════════════════════════════ */

function tempoMap(board, side) {
  const W = 940, H = 290;
  const svg = svgRoot(W, H, 'Write path Tempo');
  defsArrows(svg);
  const g = el('g'); svg.appendChild(g);

  const chain = [
    { x: 16,  w: 132, kind: 'ЛИМИТЫ', t: 'distributor', s: 'три лимита', hue: '--c-cyan', cls: 'drop' },
    { x: 186, w: 128, kind: 'РОУТИНГ', t: 'hash ring', s: 'по trace ID', hue: '--c-violet' },
    { x: 352, w: 148, kind: 'ПАМЯТЬ', t: 'ingester', s: 'live → WAL', hue: '--c-blue', cls: 'stateful drop' },
    { x: 538, w: 138, kind: 'БЛОК', t: 'completed', s: 'flushed block', hue: '--c-emerald' },
    { x: 714, w: 130, kind: 'S3', t: 'object storage', s: 'долгое хранение', hue: '--c-emerald' },
  ];
  chain.forEach((n, i) => {
    node(g, { x: n.x, y: 78, w: n.w, h: 62, kind: n.kind, title: n.t, sub: n.s, hue: n.hue,
      cls: n.cls || '', cost: n.cls && n.cls.includes('stateful') ? 'live traces в RAM' : null });
    if (i) hline(g, chain[i - 1].x + chain[i - 1].w, 109, n.x - 2, 109);
  });

  node(g, { x: 714, y: 196, w: 130, h: 56, kind: 'ФОН', title: 'compactor',
    sub: 'block_retention', hue: '--c-teal', cls: 'control' });
  edge(g, 'M779,140 C779,168 779,174 779,194', { cls: 'config' });
  txt(g, 856, 220, 'node-sub', 'компакция');
  txt(g, 856, 234, 'node-sub', 'и удаление');

  txt(g, 16, 40, 'col-head', 'КРАСНАЯ РАМКА - ГДЕ ТЕРЯЮТСЯ ТРЕЙСЫ');
  txt(g, 16, 58, 'node-sub', 'distributor: RATE_LIMITED, TRACE_TOO_LARGE · ingester: LIVE_TRACES_EXCEEDED, фрагментация');

  mount(board, svg);
  edgeLegend(board, [['', 'путь данных'], ['cfg', 'фоновый процесс, не запись'],
    ['lg-sw" style="--sw:var(--accent-drop)', 'точка отброса']]);

  html(board, `<div class="note"><b>Сноска про монолит.</b>
    Топология нарисована распределённая (Tempo 2.9.0, чарт <code>tempo-distributed</code>) -
    иначе не объяснить hash ring и шардирование. В монолитном single-binary варианте
    (Tempo 2.7.1, преобладает в парке) это <i>модули одного процесса</i>: механика лимитов
    и границ блоков та же, сетевых хопов между компонентами нет.</div>`);

  side.dataset.badge = 'Акт 3';
  const s = sect(side, 'Атлас потерь: акт 3');
  const rows = LOSS_POINTS.filter(l => l.act === 'tempo').map(l =>
    `<tr><td class="sw"><i style="--sw:var(--accent-drop)"></i></td><td>
      <b>${l.at}</b> - ${l.error ? `<code>${l.error}</code>` : 'плановое удаление'}<br>
      <span style="color:var(--text-muted)">тюнинг: <code>${l.tune.split(',')[0]}</code></span>
     </td></tr>`).join('');
  html(s, `<table class="legend-tbl">${rows}</table>`);
  const c = sect(side, 'Фрагмент конфига');
  configSection(c, 'limits', 'overrides.defaults');
}

function tempoFunnelLens(board, side) {
  const p = STATE.params;
  const cf = collectorFunnel({ ...p, correlated: STATE.correlated });
  const t = tempoFunnel(cf.kept, p);
  const total = cf.total;

  const W = 940, H = 330;
  const svg = svgRoot(W, H, 'Воронка лимитов ingestion Tempo');
  const g = el('g'); svg.appendChild(g);

  // Ширина масштабируется от ВХОДА этого акта, а не от общего объёма: потери
  // Tempo ~1% от всего трафика и на глобальной шкале были бы неразличимы.
  // Проценты остаются от общего - иначе акты нельзя сопоставить (DESIGN.md §3.7).
  const BAR = 104;
  const wOf = v => v <= 0 ? 0 : Math.max(MIN_W, Math.pow(v / t.input, 0.65) * BAR);

  const y = 56, STEP = 224;
  const stages = [
    { t: 'после tail', v: t.input },
    { t: 'после rate limit', v: t.input - t.rateLimited },
    { t: 'после size limit', v: t.input - t.rateLimited - t.tooLarge },
    { t: 'в S3', v: t.stored },
  ];
  const losses = [null, ...t.losses];
  let x = 24;

  stages.forEach((s, i) => {
    const w = wOf(s.v), last = i === stages.length - 1;
    g.appendChild(el('rect', { class: `stage-bar ${last ? 'keep' : 'flow'}`,
      x, y: y + (BAR - w) / 2, width: 28, height: w, rx: 2 }));
    txt(g, x + 14, y + BAR + 24, 'node-sub', s.t, 'middle');
    txt(g, x + 14, y + BAR + 39, `n-pct ${last ? 'keep' : ''}`, fmtPct(s.v / total), 'middle');
    if (last) return;

    const nx = x + STEP, nw = wOf(stages[i + 1].v);
    ribbon(g, x + 28, y + (BAR - w) / 2, w, nx, y + (BAR - nw) / 2, nw, 'flow');

    const L = losses[i + 1];
    if (L && L.value > 0) {
      const lw = wOf(L.value), lx = nx - 74;
      ribbon(g, x + 28, y + (BAR + w) / 2 - lw, lw, lx, y + 186, lw, 'drop');
      // у каждого отвода три подписи: метрика, процент, параметр (DESIGN.md §3.8)
      txt(g, lx + lw / 2, y + 206, 'n-metric', L.error, 'middle');
      txt(g, lx + lw / 2, y + 221, 'n-pct drop', fmtPct(L.value / total), 'middle');
      txt(g, lx + lw / 2, y + 236, 'n-tune', L.tune.split(',')[0], 'middle');
    }
    x = nx;
  });

  txt(g, 24, 30, 'col-head', 'ВХОД - ИТОГ АКТА 2');
  txt(g, 24, H - 8, 'scale-note',
    'ширина - относительно входа ЭТОГО акта (иначе однопроцентные потери неразличимы); проценты - от общего объёма');

  mount(board, svg);
  html(board, `<div class="note">
    Из всего, что произошло в приложениях, до объектного хранилища доедет
    <b><span class="num keep">${fmtPct(t.stored / total)}</span></b>.
    Семплинг срезал ${fmtPct(1 - cf.keptOfAll)}, лимиты Tempo - ещё
    ${fmtPct((t.input - t.stored) / total)}.<br><br>
    <b>Лимиты - не семплинг:</b> они режут не «лишнее», а то, что не поместилось,
    то есть теряются в том числе ошибки и медленные трейсы, которые политики
    специально сохранили.</div>`);

  side.dataset.badge = 'Акт 3';
  knobsSection(side, ['rateLimitPct', 'tooLargeShare', 'liveTracesPct']);
  const s = sect(side, 'Что ломает тюнинг');
  html(s, LOSS_POINTS.filter(l => l.act === 'tempo' && l.cost).slice(0, 3).map(l =>
    `<p><code>${l.tune.split(',')[0]}</code> ↑ - ${l.cost}</p>`).join(''));
  const c = sect(side, 'Фрагмент конфига');
  configSection(c, 'limits', 'overrides.defaults');
}

function tempoTimeline(board, side) {
  const p = STATE.params;
  const b = blockSlicing(p);

  const W = 940, H = 290;
  const svg = svgRoot(W, H, 'Границы блоков и фрагментация трейса');
  const g = el('g'); svg.appendChild(g);

  const x0 = 24, x1 = 916, axisY = 212, span = x1 - x0;
  const tx = s => x0 + (s / b.durS) * span;

  g.appendChild(el('line', { class: 'axis', x1: x0, y1: axisY, x2: x1, y2: axisY }));
  const stepS = Math.max(30, Math.round(b.durS / 8 / 30) * 30);
  for (let s = 0; s <= b.durS; s += stepS) {
    g.appendChild(el('line', { class: 'axis', x1: tx(s), y1: axisY, x2: tx(s), y2: axisY + 5 }));
    txt(g, tx(s), axisY + 19, 'axis-label', fmtNum(s), 'middle');
  }

  const bw = span / b.blocks;
  for (let i = 0; i < b.blocks; i++) {
    g.appendChild(el('rect', { class: `block-box ${b.blocks > 1 ? 'frag' : ''}`,
      x: x0 + i * bw + 2, y: 70, width: bw - 4, height: 132, rx: 5 }));
    txt(g, x0 + i * bw + bw / 2, 62, 'node-sub', `блок ${i + 1}`, 'middle');
  }

  const n = 26;
  for (let i = 0; i < n; i++) {
    g.appendChild(el('rect', { class: 'span-bar', x: tx((b.durS / n) * i), y: 126,
      width: Math.max(4, span / n - 4), height: 15 }));
  }
  txt(g, x0, 34, 'col-head',
    `ТРЕЙС ${p.traceDurationMin} МИН → ${b.blocks} ${b.blocks === 1 ? 'БЛОК' : 'БЛОКА'} · СПАНЫ ОДНОГО ТРЕЙСА`);

  mount(board, svg);
  edgeLegend(board, [
    ['lg-sw" style="--sw:var(--accent-keep)', 'трейс целиком в одном блоке'],
    ['lg-sw" style="--sw:var(--accent-warning)', 'трейс нарезан - фрагментация'],
    ['lg-sw" style="--sw:var(--primary)', 'спан'],
  ]);

  html(board, `<div class="note">
    Трейс длиной ${p.traceDurationMin} мин при <code>trace_live_period=${p.livePeriodS}s</code>
    и паузе между спанами ${p.gapS}s ложится в <b>${b.blocks}</b>
    ${b.blocks === 1 ? 'блок' : 'блока'}.
    ${b.blocks > 1 ? `Метрики этого: <code>${b.fragmentMetric}</code>. ` : ''}<br><br>
    <b>Следствие для чтения:</b> lookup по trace ID читает все блоки и соберёт трейс целиком;
    TraceQL-поиск читает подмножество блоков и может показать только фрагмент - один и тот же
    трейс выглядит по-разному в зависимости от способа запроса. Разбор - линза Таймлайн акта 4.</div>`);

  side.dataset.badge = 'Акт 3';
  knobsSection(side, ['traceDurationMin', 'idlePeriodS', 'livePeriodS', 'gapS']);
  const s = sect(side, 'Почему режется');
  html(s, b.cutByIdle
    ? `<div class="callout">Пауза ${p.gapS}s превышает
       <code>trace_idle_period=${p.idlePeriodS}s</code> ⇒ ingester считает трейс завершённым
       и флашит его, а продолжение попадёт в следующий блок.</div>`
    : `<p>Пауза ${p.gapS}s не превышает <code>trace_idle_period=${p.idlePeriodS}s</code> ⇒
       по простою трейс не режется.</p>`);
  html(s, `<p>По времени жизни: ${b.byLive > 1
    ? `${p.traceDurationMin} мин / ${p.livePeriodS}s ⇒ <span class="num warn">${b.byLive}</span> блока.`
    : `трейс короче <code>trace_live_period</code> - по этой причине не режется.`}</p>`);
  const c = sect(side, 'Фрагмент конфига');
  configSection(c, 'ingester', 'ingester');
}

function tempoSharding(board, side) {
  const W = 940, H = 310;
  const svg = svgRoot(W, H, 'Consistent hash ring в Tempo');
  defsArrows(svg);
  const g = el('g'); svg.appendChild(g);

  node(g, { x: 16, y: 132, w: 138, h: 62, kind: 'РОУТИНГ', title: 'distributor',
    sub: 'хеширует trace ID', hue: '--c-cyan' });

  const cx = 400, cy = 162, R = 88;
  g.appendChild(el('circle', { cx, cy, r: R, fill: 'none', stroke: 'var(--border-muted)',
    'stroke-width': 2, 'stroke-dasharray': '3 3' }));
  txt(g, cx, cy - R - 12, 'col-head', 'CONSISTENT HASH RING', 'middle');
  const ings = 6, chosen = [1, 2, 3];
  for (let i = 0; i < ings; i++) {
    const a = (i / ings) * Math.PI * 2 - Math.PI / 2;
    const px = cx + Math.cos(a) * R, py = cy + Math.sin(a) * R;
    const on = chosen.includes(i);
    g.appendChild(el('circle', { cx: px, cy: py, r: on ? 15 : 10,
      fill: on ? 'var(--accent-keep-weak)' : 'var(--bg-surface-2)',
      stroke: on ? 'var(--accent-keep)' : 'var(--border-muted)', 'stroke-width': on ? 2 : 1 }));
    g.appendChild(el('text', { class: 'node-sub', x: px, y: py + 4, 'text-anchor': 'middle',
      style: on ? 'fill:var(--accent-keep);font-weight:700' : null }, `i${i}`));
  }
  txt(g, cx, cy - 2, 'row-label', 'trace ID', 'middle');
  txt(g, cx, cy + 14, 'node-sub', '→ 3 реплики', 'middle');
  hline(g, 154, 162, cx - R - 8, 162);

  node(g, { x: 556, y: 132, w: 168, h: 62, kind: 'КВОРУМ', title: 'replication_factor: 3',
    sub: 'запись подтверждена', hue: '--c-emerald', cls: 'keep' });
  hline(g, cx + R + 8, 162, 554, 162, { cls: 'keep' });
  node(g, { x: 756, y: 132, w: 168, h: 62, kind: 'РЕЗУЛЬТАТ', title: 'трейс целиком',
    sub: 'в одном наборе реплик', hue: '--c-emerald', cls: 'keep' });
  hline(g, 724, 162, 754, 162, { cls: 'keep' });

  txt(g, 16, 30, 'col-head', 'ТА ЖЕ ЗАДАЧА, ЧТО В АКТЕ 2 - РЕШЁННАЯ СИСТЕМНО');

  mount(board, svg);
  edgeLegend(board, [['keep', 'трейс целиком'],
    ['lg-sw" style="--sw:var(--accent-keep)', 'выбранные реплики для этого trace ID'],
    ['lg-sw" style="--sw:var(--bg-surface-2)', 'остальные ingester\'ы']]);

  html(board, `<div class="note"><b>Контраст с актом 2.</b>
    В коллекторе локальность trace ID приходится обеспечивать самому - отдельным
    <code>loadbalancing</code> exporter'ом, и без него <code>tail_sampling</code> тихо
    деградирует, без ошибок в логах. Tempo решает ту же задачу встроенно: hash ring по trace ID
    плюс <code>replication_factor</code>, поэтому все спаны трейса гарантированно попадают
    в один набор ingester'ов. Одна задача, два уровня зрелости решения.</div>`);

  side.dataset.badge = 'Акт 3';
  const s = sect(side, 'Зачем реплики');
  html(s, `<p><code>replication_factor: 3</code> - не только надёжность: при рестарте или
    скейлинге ingester'а трейс остаётся доступен с других реплик, а ring перестраивается
    без потери локальности для остальных trace ID.</p>`);
  const cv = sect(side, 'Границы модели');
  html(cv, `<div class="caveat"><span class="cv-h">Оговорка</span>
    <p>В single-binary варианте (Tempo 2.7.1) ring существует, но состоит из одного узла -
    механика та же, наглядности никакой. Схема нарисована для распределённого варианта
    именно поэтому.</p></div>`);
}

/* ═══════════════════════════════════════════════════════════════
   АКТ 4: ЧТЕНИЕ И ПРОИЗВОДНЫЕ
   ═══════════════════════════════════════════════════════════════ */

function readMap(board, side) {
  const W = 940, H = 330;
  const svg = svgRoot(W, H, 'Путь чтения и metrics-generator');
  defsArrows(svg);
  const g = el('g'); svg.appendChild(g);

  node(g, { x: 16, y: 78, w: 148, h: 62, kind: 'ЗАПРОС', title: 'Grafana',
    sub: 'TraceQL или trace ID', hue: '--c-rose' });
  node(g, { x: 192, y: 78, w: 156, h: 62, kind: 'ШАРДИНГ', title: 'query-frontend',
    sub: 'режет на подзапросы', hue: '--c-cyan' });
  node(g, { x: 386, y: 78, w: 138, h: 62, kind: 'ПОИСК', title: 'querier',
    sub: 'опрашивает блоки', hue: '--c-blue' });
  node(g, { x: 562, y: 44, w: 152, h: 54, kind: 'ГОРЯЧЕЕ', title: 'ingester',
    sub: 'ещё в памяти', hue: '--c-emerald' });
  node(g, { x: 562, y: 118, w: 152, h: 54, kind: 'ХОЛОДНОЕ', title: 'блоки в S3',
    sub: 'bloom + индекс', hue: '--c-emerald' });

  hline(g, 154, 109, 190, 109);
  hline(g, 348, 109, 384, 109);
  edge(g, 'M524,109 C548,109 548,71 560,71');
  edge(g, 'M524,109 C548,109 548,145 560,145');
  txt(g, 736, 70, 'node-sub', 'свежие трейсы');
  txt(g, 736, 146, 'node-sub', 'всё остальное');

  // производные данные - отдельная ветка от записи, не от чтения
  node(g, { x: 386, y: 226, w: 200, h: 66, kind: 'ПРОИЗВОДНЫЕ', title: 'metrics-generator',
    sub: 'span-metrics, service-graphs', hue: '--c-fuchsia', cls: 'stateful',
    cost: 'цена = кардинальность' });
  edge(g, 'M455,172 C455,196 455,202 455,224', { cls: 'config', label: 'те же спаны', lx: 508, ly: 200 });
  node(g, { x: 648, y: 234, w: 148, h: 50, title: 'Prometheus', sub: 'remote write', hue: '--c-teal' });
  hline(g, 586, 259, 646, 259, { cls: 'config' });

  txt(g, 16, 40, 'col-head', 'ДВА РЕЖИМА ЗАПРОСА - РАЗНОЕ ЧИСЛО ЧИТАЕМЫХ БЛОКОВ');
  txt(g, 16, 198, 'col-head', 'ПРОИЗВОДНЫЕ ДАННЫЕ');
  txt(g, 16, 218, 'node-sub', 'строятся при записи,');
  txt(g, 16, 232, 'node-sub', 'а не при чтении');

  mount(board, svg);
  edgeLegend(board, [['', 'путь запроса'], ['cfg', 'поток при записи, не запрос'],
    ['lg-sw" style="--sw:var(--c-fuchsia)', 'производные данные']]);

  html(board, `<div class="note"><b>Цена metrics-generator измеряется кардинальностью,
    а не объёмом.</b> <code>span-metrics</code> создаёт серию на каждую комбинацию
    <code>dimensions</code>, <code>service-graphs</code> - на каждую пару сервисов. Добавить
    в <code>dimensions</code> поле с высокой кардинальностью (<code>user_id</code>, URL с
    идентификатором) - значит умножить число серий, и это ударит в Prometheus, а не в Tempo.
    <code>local-blocks</code> нужен для TraceQL-метрик и держит свои блоки локально - ещё одна
    статья расхода памяти.</div>`);

  side.dataset.badge = 'Акт 4';
  rolesLegend(side, ['source', 'receive', 'process', 'store', 'derived']);
  const s = sect(side, 'Три процессора');
  html(s, `<p><code>span-metrics</code> - RED-метрики (rate/errors/duration) по спанам.<br><br>
    <code>service-graphs</code> - граф вызовов: серия на пару сервисов, растёт квадратично
    от их числа.<br><br>
    <code>local-blocks</code> - локальные блоки для TraceQL-метрик по «горячим» данным.</p>`);
  const c = sect(side, 'Фрагмент конфига');
  configSection(c, 'metricsgen', 'metrics_generator');
}

function readTimeline(board, side) {
  const p = STATE.params;
  const r = readPath(p);

  const W = 940, H = 320;
  const svg = svgRoot(W, H, 'Чтение фрагментированного трейса');
  const g = el('g'); svg.appendChild(g);

  const x0 = 150, x1 = 916, span = x1 - x0;
  const bw = span / r.blocks;

  // ряд блоков как «данные»
  txt(g, x0, 30, 'col-head', `ТРЕЙС ЛЕЖИТ В ${r.blocks} ${r.blocks === 1 ? 'БЛОКЕ' : 'БЛОКАХ'}`);
  for (let i = 0; i < r.blocks; i++) {
    g.appendChild(el('rect', { class: `block-box ${r.blocks > 1 ? 'frag' : ''}`,
      x: x0 + i * bw + 3, y: 44, width: bw - 6, height: 46, rx: 5 }));
    txt(g, x0 + i * bw + bw / 2, 72, 'node-sub', `блок ${i + 1}`, 'middle');
  }

  // два режима чтения
  const modes = [
    { y: 128, label: 'lookup', mode: 'по trace ID', n: r.lookupBlocks,
      cls: 'keep', hue: '--c-emerald', verdict: 'трейс собран целиком' },
    { y: 216, label: 'TraceQL', mode: 'поиск, отсечение', n: r.traceqlBlocks,
      cls: r.complete ? 'keep' : 'warn', hue: r.complete ? '--c-emerald' : '--c-amber',
      verdict: r.complete ? 'все блоки попали в выборку' : 'трейс неполон' },
  ];

  for (const m of modes) {
    node(g, { x: 16, y: m.y, w: 126, h: 58, title: m.label, sub: m.mode, hue: m.hue, cls: m.cls });
    const accent = m.cls === 'keep' ? 'var(--accent-keep)' : 'var(--accent-warning)';
    for (let i = 0; i < r.blocks; i++) {
      const on = i < m.n;
      // fill/stroke через style, а не через атрибуты: правило .block-box в CSS
      // перебивает presentation-атрибуты, и «прочитан частично» красился зелёным
      g.appendChild(el('rect', { class: 'block-box', x: x0 + i * bw + 3, y: m.y + 6,
        width: bw - 6, height: 40, rx: 5,
        style: on ? `fill:${accent};fill-opacity:.16;stroke:${accent}`
                  : 'fill:var(--bg-surface-2);fill-opacity:1;stroke:var(--border)' }));
      txt(g, x0 + i * bw + bw / 2, m.y + 31,
        on ? `n-pct ${m.cls === 'keep' ? 'keep' : 'warn'}` : 'axis-label', on ? '✓' : '-', 'middle');
    }
    txt(g, x0, m.y + 68, `n-pct ${m.cls === 'keep' ? 'keep' : 'warn'}`,
      `${m.n} из ${r.blocks} блоков · ${m.verdict}`);
  }

  mount(board, svg);
  edgeLegend(board, [
    ['lg-sw" style="--sw:var(--accent-keep)', 'блок прочитан'],
    ['lg-sw" style="--sw:var(--accent-warning)', 'прочитан частично / выборочно'],
    ['lg-sw" style="--sw:var(--bg-surface-2)', 'блок не прочитан'],
  ]);

  html(board, `<div class="note"><b>Один трейс, два ответа.</b>
    ${r.complete
      ? 'При текущих параметрах TraceQL захватывает все блоки, и оба режима дают одинаковый результат.'
      : `TraceQL читает <b>${r.traceqlBlocks}</b> из <b>${r.blocks}</b> блоков и вернёт
         <b>${fmtPct(1 - r.missedFraction)}</b> трейса, тогда как lookup по trace ID соберёт его
         целиком. Это не баг: поиск обязан отсекать блоки, иначе каждый запрос читал бы всё
         хранилище.`}<br><br>
    Практическое следствие: <b>«трейс рваный в поиске, но целый по ссылке» - ожидаемое
    поведение фрагментированного трейса</b>, а не потеря данных. Лечится не на чтении,
    а границами блоков в акте 3.</div>`);

  side.dataset.badge = 'Акт 4';
  knobsSection(side, ['traceDurationMin', 'livePeriodS', 'gapS', 'traceqlScanPct']);
  const s = sect(side, 'Почему lookup читает всё');
  html(s, `<p>Запрос по trace ID не знает, в каких блоках лежит трейс, - индекса
    «trace ID → блок» на весь период нет. Поэтому он опрашивает все блоки в окне поиска,
    отсекая их только bloom-фильтром. Дороже по I/O, зато полный ответ.</p>
    <p>TraceQL-поиск наоборот: сначала отсекает блоки по времени и предикатам, и уже
    в выживших ищет спаны. Дешевле - но у фрагментированного трейса часть блоков
    в выборку не попадает.</p>`);
  const cv = sect(side, 'Границы модели');
  html(cv, `<div class="caveat"><span class="cv-h">Оговорка</span>
    <p>Доля читаемых TraceQL блоков здесь - ручка, а не расчёт: реальное отсечение зависит
    от предикатов запроса, окна времени и bloom-фильтров. Показан <b>механизм</b>
    асимметрии, не её точная величина.</p></div>`);
}

/* ---------------- renderer registry ---------------- */

const RENDERERS = {
  birth:     { map: birthMap, funnel: birthFunnel },
  collector: { map: collectorMap, funnel: collectorFunnelLens, timeline: collectorTimeline,
               resolver: collectorResolver, sharding: collectorSharding },
  tempo:     { map: tempoMap, funnel: tempoFunnelLens, timeline: tempoTimeline,
               sharding: tempoSharding },
  read:      { map: readMap, timeline: readTimeline },
};

/* ---------------- nav ---------------- */

function renderTabs() {
  const box = $('tabs');
  box.innerHTML = '';
  for (const a of ACTS) {
    const b = document.createElement('button');
    b.className = 'tab';
    b.dataset.act = a.id;
    b.setAttribute('role', 'tab');
    b.setAttribute('aria-selected', String(a.id === STATE.act));
    b.innerHTML = `<span class="tab-idx">${a.idx}</span>` +
      `<span class="tab-title">${a.title}</span><span class="tab-sub">${a.sub}</span>`;
    b.addEventListener('click', () => {
      STATE.act = a.id;
      // линза переиспользуется между актами; если здесь она погашена -
      // переходим на первую живую, а не показываем пустой экран
      if (MATRIX[a.id][STATE.lens] !== true) {
        STATE.lens = LENSES.find(l => MATRIX[a.id][l.id] === true).id;
      }
      render();
    });
    box.appendChild(b);
  }
}

function renderLenses() {
  const box = $('lenses');
  box.innerHTML = '';
  for (const l of LENSES) {
    const cell = MATRIX[STATE.act][l.id];
    const b = document.createElement('button');
    b.className = 'lens';
    b.setAttribute('role', 'tab');
    b.textContent = l.title;
    if (cell === true) {
      b.setAttribute('aria-selected', String(l.id === STATE.lens));
      b.addEventListener('click', () => { STATE.lens = l.id; render(); });
    } else {
      // погашена, но видима: причина - в title и в aria-description
      b.setAttribute('aria-disabled', 'true');
      b.setAttribute('aria-selected', 'false');
      b.title = cell;
      b.setAttribute('aria-description', cell);
    }
    box.appendChild(b);
  }
  const live = LENSES.filter(l => MATRIX[STATE.act][l.id] === true).length;
  const hint = document.createElement('span');
  hint.className = 'lens-hint';
  hint.textContent = `${live} из ${LENSES.length} линз · погашенные объясняют причину при наведении`;
  box.appendChild(hint);
}

function renderColorKey() {
  $('color-key').innerHTML =
    `<span class="ck-title">Цвет = роль узла</span>` +
    ROLES.map(r => `<span class="ck ${r.cls}">${r.label}</span>`).join('');
}

function renderVersions() {
  $('versions').innerHTML = VERSIONS.map(v =>
    `<span style="--sw:var(${v.hue})">${v.label}${v.note ? ` · ${v.note}` : ''}</span>`).join('');
}

/* ---------------- main render ---------------- */

function render() {
  document.querySelector('.wrap').dataset.act = STATE.act;
  renderTabs();
  renderLenses();

  const key = `${STATE.act}/${STATE.lens}`;
  const copy = COPY[key] || {};
  const act = ACTS.find(a => a.id === STATE.act);
  const lens = LENSES.find(l => l.id === STATE.lens);

  $('lens-title').innerHTML = copy.title || `${lens.title}: ${act.title}`;
  $('lens-hint').innerHTML = copy.hint || '';
  $('lens-lede').innerHTML = copy.lede || '';

  const board = $('lens-panel'), side = $('side-body');
  board.innerHTML = ''; side.innerHTML = '';
  // перезапустить fadeUp: без этого смена линзы не читается как смена вида
  board.style.animation = 'none'; void board.offsetWidth; board.style.animation = '';

  $('side-kind').textContent = lens.title;
  $('side-title').textContent = act.title;

  const fn = RENDERERS[STATE.act] && RENDERERS[STATE.act][STATE.lens];
  if (fn) fn(board, side);
  else renderPlaceholder(board, side, act, lens);

  $('side-badge').textContent = side.dataset.badge || `Акт ${ACTS.indexOf(act) + 1}`;
  delete side.dataset.badge;
}

function renderPlaceholder(board, side, act, lens) {
  html(board, `<div class="placeholder">
    <h3>Линза в работе</h3>
    <p>Каркас заложен, содержимое появится в следующей волне наполнения.</p>
  </div>`);
  const s = sect(side, 'Порядок наполнения');
  html(s, `<ul class="roadmap">
    <li class="done"><span class="rm-m">✓</span><span>Каркас, тема, расчётное ядро</span></li>
    <li class="done"><span class="rm-m">✓</span><span>Акт 2 - коллектор, все пять линз</span></li>
    <li class="done"><span class="rm-m">✓</span><span>Акт 3 - Tempo write path</span></li>
    <li class="done"><span class="rm-m">✓</span><span>Акты 1 и 4</span></li>
    <li class="todo"><span class="rm-m">○</span><span>Оверлей «Атлас потерь»</span></li>
    <li class="todo"><span class="rm-m">○</span><span>Шесть сценариев-пресетов</span></li>
  </ul>`);
}

/* ═══════════════════════════════════════════════════════════════
   SELFTEST - ?selftest=1
   Единственная защита количественного материала от тихого
   расхождения цифр между линзами.
   ═══════════════════════════════════════════════════════════════ */

function selftest() {
  const out = [], near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
  const ok = (name, cond, detail = '') =>
    out.push(`${cond ? '✓' : '✗ FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);

  /* --- когорты и резолвинг --- */
  const total = DEFAULT_COHORTS.reduce((s, c) => s + c.share, 0);
  ok('сумма долей когорт = 1', near(total, 1), `= ${total}`);

  const P = { headRatio: 100, baseline: 3, pct250: 25, pct500: 50 };
  const pol = buildPolicies(P);

  ok('когорта ошибок = 100%', resolve(DEFAULT_COHORTS[0], pol, true).p === 1);
  const vs = resolve(DEFAULT_COHORTS.find(c => c.id === 'veryslow'), pol, true);
  ok('> 750 мс = 100% (латентность безусловна)', vs.p === 1, `p=${vs.p}`);

  const midC = DEFAULT_COHORTS.find(c => c.id === 'mid');
  const midCorr = resolve(midC, pol, true), midIndep = resolve(midC, pol, false);
  ok('mid, correlated = max(25%, 3%) = 25%', near(midCorr.p, 0.25), fmtPct(midCorr.p));
  ok('mid, independent = 1-0.75·0.97 ≈ 27.25%', near(midIndep.p, 1 - 0.75 * 0.97), fmtPct(midIndep.p));
  ok('correlated даёт НЕ больше independent', midCorr.p <= midIndep.p);
  ok('fast падает на baseline = 3%',
    near(resolve(DEFAULT_COHORTS.find(c => c.id === 'fast'), pol, true).p, 0.03));

  const dropped = resolve(DEFAULT_COHORTS[0], [{ name: 'kill', type: 'drop' }, ...pol], true);
  ok('drop - вето: перебивает sample по ошибке',
    dropped.decision === 'drop' && dropped.p === 0, dropped.decision);

  /* --- воронки --- */
  const f = collectorFunnel({ ...P, correlated: true });
  ok('воронка: kept + dropped = вход', near(f.kept + f.droppedTail, f.afterHead));
  ok('воронка: head+tail потери + kept = total',
    near(f.droppedHead + f.droppedTail + f.kept, f.total));
  ok('итог больше baseline (OR, а не AND)', f.keptOfAll > P.baseline / 100,
    `${fmtPct(f.keptOfAll)} > ${P.baseline}%`);
  const half = collectorFunnel({ ...P, headRatio: 50, correlated: true });
  ok('head sampling 50% делит итог вдвое', near(half.kept, f.kept / 2),
    `${fmtPct(half.keptOfAll)} vs ${fmtPct(f.keptOfAll)}`);

  const hf = headFunnel({ headRatio: 40 });
  ok('акт 1: head 40% ⇒ kept 40%, баланс сходится',
    near(hf.kept, 0.4) && near(hf.kept + hf.dropped, hf.total), fmtPct(hf.kept / hf.total));
  ok('акт 1: срез неизбирателен - все когорты режутся одинаково',
    hf.rows.every(r => near(r.kept / r.cohort.share, 0.4)));

  const t = tempoFunnel(1, { rateLimitPct: 97, tooLargeShare: 1.5, liveTracesPct: 96 });
  ok('Tempo: баланс потоков = вход',
    near(t.stored + t.rateLimited + t.tooLarge + t.liveExceeded, 1));
  ok('Tempo: все три точки отброса ненулевые',
    t.rateLimited > 0 && t.tooLarge > 0 && t.liveExceeded > 0);
  ok('Tempo: при снятых лимитах теряется 0',
    near(tempoFunnel(1, { rateLimitPct: 100, tooLargeShare: 0, liveTracesPct: 100 }).stored, 1));

  /* --- блоки и чтение --- */
  const b1 = blockSlicing({ traceDurationMin: 1, idlePeriodS: 30, livePeriodS: 150, gapS: 5 });
  ok('короткий трейс = 1 блок', b1.blocks === 1, `blocks=${b1.blocks}`);
  const b2 = blockSlicing({ traceDurationMin: 10, idlePeriodS: 30, livePeriodS: 150, gapS: 5 });
  ok('трейс 10 мин при live=150s = 4 блока', b2.blocks === 4, `blocks=${b2.blocks}`);
  const b3 = blockSlicing({ traceDurationMin: 1, idlePeriodS: 30, livePeriodS: 150, gapS: 45 });
  ok('пауза > idle_period режет трейс', b3.blocks >= 2 && b3.cutByIdle, `blocks=${b3.blocks}`);

  const rp = readPath({ traceDurationMin: 10, idlePeriodS: 30, livePeriodS: 150, gapS: 5,
    traceqlScanPct: 50 });
  ok('акт 4: lookup читает все блоки', rp.lookupBlocks === rp.blocks, `${rp.lookupBlocks}/${rp.blocks}`);
  ok('акт 4: TraceQL читает подмножество', rp.traceqlBlocks < rp.blocks && rp.traceqlBlocks >= 1,
    `${rp.traceqlBlocks}/${rp.blocks}`);
  ok('акт 4: неполный ответ ⇒ complete=false', rp.complete === false);
  const rpFull = readPath({ traceDurationMin: 10, idlePeriodS: 30, livePeriodS: 150, gapS: 5,
    traceqlScanPct: 100 });
  ok('акт 4: при 100% TraceQL полон', rpFull.complete === true && rpFull.missedFraction === 0);

  /* --- шкала ширины --- */
  ok('widthOf: малый поток не тоньше пола', widthOf(0.0001, 1) >= MIN_W,
    widthOf(0.0001, 1).toFixed(2) + 'px');
  ok('widthOf: нулевой поток = 0 (не рисуется)', widthOf(0, 1) === 0);
  ok('widthOf: монотонность по величине', widthOf(0.5, 1) > widthOf(0.05, 1));
  ok('widthOf: γ-шкала делает малый поток видимым (нелинейность)',
    widthOf(0.02, 1) / MAX_W > 0.02 * 2, `${(widthOf(0.02, 1) / MAX_W * 100).toFixed(1)}% ширины на 2% объёма`);

  /* --- форматирование чисел --- */
  ok('fmtPct: фиксированная разрядность, без хвостов',
    fmtPct(0.128) === '12.8%' && fmtPct(1) === '100%' && !/\d{5,}/.test(fmtPct(0.1279999)),
    `${fmtPct(0.128)} / ${fmtPct(1)} / ${fmtPct(0.1279999)}`);

  /* --- матрица и контент --- */
  const live = Object.values(MATRIX).reduce((n, row) =>
    n + Object.values(row).filter(v => v === true).length, 0);
  ok('матрица: 13 живых комбинаций из 20', live === 13, `= ${live}`);
  ok('матрица: каждая погашенная линза объясняет причину',
    Object.values(MATRIX).every(row =>
      Object.values(row).every(v => v === true || (typeof v === 'string' && v.length > 20))));
  const missing = [];
  for (const [act, row] of Object.entries(MATRIX)) {
    for (const [lens, v] of Object.entries(row)) {
      if (v !== true) continue;
      if (!(RENDERERS[act] && RENDERERS[act][lens])) missing.push(`${act}/${lens} renderer`);
      if (!COPY[`${act}/${lens}`]) missing.push(`${act}/${lens} copy`);
    }
  }
  ok('каждая живая комбинация имеет рендерер и текст', missing.length === 0,
    missing.length ? missing.join(', ') : 'все 13 покрыты');

  ok('Атлас потерь: у каждой точки есть параметр тюнинга и цена',
    LOSS_POINTS.every(l => l.tune && l.cost), `${LOSS_POINTS.length} точек`);
  ok('все ручки описаны в KNOBS',
    Object.keys(STATE.params).every(k => KNOBS[k]),
    Object.keys(STATE.params).filter(k => !KNOBS[k]).join(', ') || 'все');

  /* --- рендер всех живых комбинаций + переполнение подписей ---
     SVG не переносит текст, поэтому длинная подпись молча вылезает за рамку
     узла или за viewBox. Замер getComputedTextLength() - требование DESIGN.md
     §4; здесь он автоматизирован, чтобы правка текста не ломала схему тихо. */
  const saved = { act: STATE.act, lens: STATE.lens };
  let rendered = 0;
  const errors = [], overflow = [];
  for (const [act, row] of Object.entries(MATRIX)) {
    for (const [lens, v] of Object.entries(row)) {
      if (v !== true) continue;
      STATE.act = act; STATE.lens = lens;
      try { render(); rendered++; } catch (e) { errors.push(`${act}/${lens}: ${e.message}`); continue; }
      const svg = document.querySelector('#lens-panel svg.diagram');
      if (!svg) continue;
      const vbW = svg.viewBox.baseVal.width;
      const spanOf = t => {
        const len = t.getComputedTextLength();
        const x = +t.getAttribute('x') || 0;
        const left = t.getAttribute('text-anchor') === 'middle' ? x - len / 2 : x;
        return [left, left + len];
      };
      svg.querySelectorAll('g.node').forEach(n => {
        const box = n.querySelector('rect.node-box');
        if (!box) return;
        const bx = +box.getAttribute('x'), bw = +box.getAttribute('width');
        n.querySelectorAll('text').forEach(t => {
          const [l, r] = spanOf(t);
          if (r > bx + bw - 2 || l < bx + 1) {
            overflow.push(`${act}/${lens} «${t.textContent.slice(0, 24)}» за рамкой узла`);
          }
        });
      });
      svg.querySelectorAll('text').forEach(t => {
        const [l, r] = spanOf(t);
        if (r > vbW + 1 || l < -1) {
          overflow.push(`${act}/${lens} «${t.textContent.slice(0, 24)}» за viewBox`);
        }
      });
    }
  }
  STATE.act = saved.act; STATE.lens = saved.lens; render();
  ok('все 13 живых комбинаций рендерятся без исключений',
    rendered === 13 && !errors.length, errors.length ? errors.join(' | ') : `${rendered} отрендерено`);
  ok('ни одна подпись не выходит за рамку узла или за viewBox',
    overflow.length === 0, overflow.length ? overflow.join(' | ') : 'проверено getComputedTextLength()');

  const failed = out.filter(l => l.startsWith('✗')).length;
  const box = $('selftest');
  box.style.display = 'block';
  box.className = failed ? 'fail' : 'pass';
  box.textContent = `SELFTEST: ${out.length - failed}/${out.length} passed`
    + (failed ? ` · ${failed} FAILED` : '') + '\n\n' + out.join('\n');
}

/* ---------------- boot ---------------- */

renderColorKey();
renderVersions();
render();
if (new URLSearchParams(location.search).get('selftest') === '1') selftest();
