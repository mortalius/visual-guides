/* ============================================================
   Путь трейса - контент-модель (data only, no DOM/behavior)
   ------------------------------------------------------------
   Чистые данные. Потребляется app.js.

   ACTS      - верхний уровень навигации (карточки-табы). Оттенок акта
               задаётся в styles.css по [data-act], здесь только контент.
   LENSES    - второй уровень: пять переиспользуемых линз.
   MATRIX    - какие комбинации акт × линза живые:
               true  - линза работает;
               строка - ПРИЧИНА погашения, идёт в title/aria-description.
               Погашенная линза остаётся видимой: читатель узнаёт не только
               что смотреть, но и почему здесь нечего (DESIGN.md §3.13).
   COPY      - заголовок/лид/выводы каждой живой линзы.
   ROLES     - легенда «цвет → роль узла» (--na в styles.css).
   LOSS_POINTS - точки отброса: метрика, текст ошибки, параметр тюнинга,
               и что тюнинг ломает взамен. Источник для Атласа потерь.
   CONFIGS   - фрагменты конфигов для боковой панели (абстрактные значения).
   KNOBS     - описания ручек; key === ключ в STATE.params (app.js).

   Большинство правок текста - здесь, а не в app.js.
   ============================================================ */
"use strict";

const ACTS = [
  { id: 'birth',     idx: '01 / BIRTH',     title: 'Рождение',   sub: 'SDK, traceparent, head sampling' },
  { id: 'collector', idx: '02 / COLLECTOR', title: 'Коллектор',  sub: 'pipeline-граф и tail_sampling' },
  { id: 'tempo',     idx: '03 / TEMPO',     title: 'Приём',      sub: 'write path, лимиты, блоки' },
  { id: 'read',      idx: '04 / READ',      title: 'Чтение',     sub: 'запросы и производные данные' },
];

const LENSES = [
  { id: 'map',      title: 'Карта пути' },
  { id: 'funnel',   title: 'Воронка объёмов' },
  { id: 'timeline', title: 'Таймлайн' },
  { id: 'resolver', title: 'Резолвер политик' },
  { id: 'sharding', title: 'Шардирование' },
];

/** 13 живых комбинаций из 20. Строка = причина погашения. */
const MATRIX = {
  birth: {
    map: true, funnel: true,
    timeline: 'Решение head sampling принимается мгновенно при старте спана - оси времени нет',
    resolver: 'Политик на этом этапе ещё не существует: решает SDK, а не процессор',
    sharding: 'Всё происходит внутри одного процесса приложения - шардировать нечего',
  },
  collector: { map: true, funnel: true, timeline: true, resolver: true, sharding: true },
  tempo: {
    map: true, funnel: true, timeline: true,
    resolver: 'Tempo не голосует политиками, а применяет жёсткие лимиты - это Воронка, не Резолвер',
    sharding: true,
  },
  read: {
    map: true,
    funnel: 'На чтении объём не сужается: запрос не отбрасывает трейсы, а находит их',
    timeline: true,
    resolver: 'Политики семплинга к моменту чтения уже применены и в данных не участвуют',
    sharding: 'Шардирование на чтении - тема производительности запросов, вне охвата материала',
  },
};

/** Легенда «цвет → роль узла». Оттенки - в styles.css по [data-node]. */
const ROLES = [
  { cls: 'source',    hue: '--c-rose',    label: 'Источник', desc: 'приложение, SDK, клиент - где трейс рождается' },
  { cls: 'receive',   hue: '--c-cyan',    label: 'Приём',    desc: 'receiver, distributor - точка входа данных' },
  { cls: 'process',   hue: '--c-blue',    label: 'Обработка',desc: 'процессор, преобразование, батчинг' },
  { cls: 'policy',    hue: '--c-violet',  label: 'Решение',  desc: 'политика, control plane, выбор судьбы трейса' },
  { cls: 'transport', hue: '--c-teal',    label: 'Транспорт',desc: 'exporter, передача наружу' },
  { cls: 'store',     hue: '--c-emerald', label: 'Хранение', desc: 'WAL, блок, объектное хранилище' },
  { cls: 'derived',   hue: '--c-fuchsia', label: 'Производные', desc: 'metrics-generator: span-metrics, service-graphs' },
];

/**
 * Точки отброса на всём пути. Основа оверлея «Атлас потерь».
 * cost - что тюнинг ломает взамен: у каждого параметра есть цена,
 * и без неё совет «поднять лимит» безответственен.
 */
const LOSS_POINTS = [
  { act: 'birth', at: 'SDK', metric: '-', error: null,
    tune: 'sampler ratio (parentbased_traceidratio)',
    cost: 'меньше данных для любых последующих решений - обратно не восстановить' },
  { act: 'collector', at: 'tail_sampling', metric: 'sampling_trace_dropped_too_early',
    error: 'решение принято до прилёта всех спанов',
    tune: 'num_traces, decision_wait',
    cost: 'память коллектора ∝ num_traces; decision_wait ↑ задерживает экспорт' },
  { act: 'collector', at: 'tail_sampling', metric: 'count_traces_sampled{sampled="false"}',
    error: 'ни одна политика не проголосовала sample',
    tune: 'состав политик, проценты probabilistic',
    cost: 'объём на выходе растёт линейно - дальше упрётся в лимиты Tempo' },
  { act: 'tempo', at: 'distributor', metric: 'tempo_discarded_spans_total{reason="rate_limited"}',
    error: 'RATE_LIMITED', tune: 'rate_limit_bytes, burst_size_bytes',
    cost: 'снимает защиту ingester от всплесков - переносит риск на память' },
  { act: 'tempo', at: 'distributor', metric: 'tempo_discarded_spans_total{reason="trace_too_large"}',
    error: 'TRACE_TOO_LARGE', tune: 'max_bytes_per_trace, max_live_traces_bytes',
    cost: 'крупные трейсы доедут, но появится trace_too_large_to_compact на компакции' },
  { act: 'tempo', at: 'ingester', metric: 'tempo_discarded_spans_total{reason="live_traces_exceeded"}',
    error: 'LIVE_TRACES_EXCEEDED', tune: 'max_traces_per_user',
    cost: 'память ingester ∝ лимиту; править requests/limits и порог HPA, иначе OOM' },
  { act: 'tempo', at: 'ingester', metric: 'rootless_trace_flushed_to_wal / disconnected_trace_flushed_to_wal',
    error: 'трейс нарезан на несколько блоков', tune: 'trace_idle_period, trace_live_period, complete_block_timeout',
    cost: 'дольше держим трейс в памяти - снова память ingester' },
  { act: 'tempo', at: 'compactor', metric: 'tempo_compaction_errors_total',
    error: 'trace_too_large_to_compact', tune: 'max_bytes_per_trace',
    cost: 'блоки не сжимаются - растёт объём в S3 и время запросов' },
  { act: 'tempo', at: 'retention', metric: 'tempo_compaction_blocks_total{level="deleted"}',
    error: null, tune: 'block_retention',
    cost: 'дольше retention - линейно больше объём и стоимость хранения' },
];

/** Заголовки, лиды и выводы линз. Плейсхолдеры - для актов следующей волны. */
const COPY = {
  'birth/map': {
    title: 'Карта пути: рождение трейса и пропагация',
    hint: 'span context → traceparent → OTLP',
    lede: 'Трейс начинается в SDK: создаётся span context, решение о семплинге принимается сразу и ' +
      'уезжает вниз по цепочке вызовов в заголовке <code>traceparent</code>. Всё, что произойдёт дальше - ' +
      'в коллекторе и в Tempo - работает уже только с тем, что SDK решил пропустить.',
  },
  'birth/funnel': {
    title: 'Воронка объёмов: head sampling',
    hint: 'простое сужение 100% → X%',
    lede: 'На этом этапе воронка простая - одно решение, один процент, никаких политик. ' +
      'Важно другое: срез здесь <b>необратим и неизбирателен</b>. SDK ещё не знает, будет ли трейс ошибочным.',
  },
  'collector/map': {
    title: 'Карта пути: pipeline-граф коллектора',
    hint: 'receiver шарится, процессоры - нет',
    lede: 'Receiver один и тот же для всех трёх pipeline\'ов - он инстанцируется единожды и делает ' +
      'fan-out копий данных. Процессоры наоборот: свой инстанс со своим состоянием на каждый pipeline.',
  },
  'collector/funnel': {
    title: 'Воронка объёмов: от 100% до итога',
    hint: 'ширина - масштаб, подпись - точность',
    lede: 'Ширина потока передаёт масштаб, подпись - точное значение. Шкала нелинейная (γ=0.5): ' +
      'при линейной ширине поток в 2% выродился бы в невидимую нитку, поэтому сравнивать ширины ' +
      'на глаз нельзя - для этого у каждой ленты подписан её процент.',
  },
  'collector/timeline': {
    title: 'Таймлайн: <code>decision_wait</code> и late spans',
    hint: 'решение принимается однократно',
    lede: 'Спаны копятся в circular buffer размером <code>num_traces</code>. Тикает ' +
      '<code>decision_wait</code>, решение принимается однократно - а затем прилетают опоздавшие ' +
      'спаны, и у них три разных судьбы.',
  },
  'collector/resolver': {
    title: 'Резолвер политик: OR с вето, а не AND',
    hint: 'первое совпадение выигрывает',
    lede: 'Набор политик читается интуитивно как «все условия должны совпасть» - и это неверно. ' +
      'Любая политика, проголосовавшая sample, отправляет трейс дальше; <code>drop</code> перебивает всех.',
  },
  'collector/sharding': {
    title: 'Шардирование: требование локальности trace ID',
    hint: 'tail_sampling stateful',
    lede: 'Все спаны одного трейса обязаны попасть в один инстанс коллектора. ' +
      '<code>tail_sampling</code> stateful: инстанс решает по тому, что видит - а видит он свой фрагмент.',
  },
  'tempo/map': {
    title: 'Карта пути: write path Tempo',
    hint: 'от OTLP до объектного хранилища',
    lede: 'Путь от OTLP-запроса до объектного хранилища и дальше - через компакцию к retention. ' +
      'Красным помечены узлы, где трейсы теряются.',
  },
  'tempo/funnel': {
    title: 'Воронка объёмов: три лимита ingestion',
    hint: 'вход - итог акта 2',
    lede: 'Вход - то, что осталось после <code>tail_sampling</code> из акта 2. ' +
      'Дальше три независимых лимита, каждый со своей метрикой и своим параметром тюнинга.',
  },
  'tempo/timeline': {
    title: 'Таймлайн: границы блоков и фрагментация',
    hint: 'trace_idle_period / trace_live_period',
    lede: '<code>trace_idle_period</code> и <code>trace_live_period</code> определяют, ляжет трейс ' +
      'в один блок или в несколько. Отсюда рваные трейсы в UI и разница поведения TraceQL vs lookup по ID.',
  },
  'tempo/sharding': {
    title: 'Шардирование: consistent hash ring',
    hint: 'та же задача, решённая правильно',
    lede: 'Та же задача локальности trace ID, что в акте 2, но решённая на уровне системы: ' +
      'distributor кладёт спаны в ring по trace ID, реплики выбираются детерминированно.',
  },
  'read/map': {
    title: 'Карта пути: чтение и производные данные',
    hint: 'query-frontend → querier → блоки',
    lede: 'Запрос расходится по блокам через query-frontend и querier. Параллельно с записью работает ' +
      'metrics-generator: он строит производные метрики из тех же спанов, и его цена измеряется ' +
      'кардинальностью, а не объёмом.',
  },
  'read/timeline': {
    title: 'Таймлайн: чтение фрагментированного трейса',
    hint: 'lookup читает все блоки, TraceQL - подмножество',
    lede: 'Тот же трейс, что в акте 3, но со стороны читателя. Ключевая асимметрия: <b>lookup по trace ID ' +
      'читает все блоки</b> и собирает трейс целиком, <b>TraceQL-поиск читает подмножество</b> - и на ' +
      'фрагментированном трейсе может честно вернуть только его часть.',
  },
};

/** Ручки. key === ключ в STATE.params; hint - имя реального параметра. */
const KNOBS = {
  headRatio:        { label: 'head sampling в SDK', min: 1, max: 100, unit: '%',
                      hint: 'sampler ratio - сколько трейсов вообще стартует' },
  baseline:         { label: 'baseline', code: 'probabilistic', min: 0, max: 100, unit: '%',
                      hint: 'политика по умолчанию для всего остального' },
  pct250:           { label: '250-500 мс', code: 'and', min: 0, max: 100, unit: '%' },
  pct500:           { label: '500-750 мс', code: 'and', min: 0, max: 100, unit: '%' },
  decisionWaitS:    { label: 'ожидание', code: 'decision_wait', min: 2, max: 30, unit: 's' },
  spanArrivalS:     { label: 'разброс прилёта спанов', min: 1, max: 12, unit: 's' },
  lateSpanS:        { label: 'опоздавший спан на', min: 1, max: 28, unit: 's' },
  rateLimitPct:     { label: 'проходит rate limit', min: 50, max: 100, unit: '%',
                      hint: 'rate_limit_bytes / burst_size_bytes' },
  tooLargeShare:    { label: 'слишком крупных трейсов', min: 0, max: 20, step: 0.5, unit: '%',
                      hint: 'max_bytes_per_trace' },
  liveTracesPct:    { label: 'вмещается в live traces', min: 50, max: 100, unit: '%',
                      hint: 'max_traces_per_user' },
  traceDurationMin: { label: 'длительность трейса', min: 1, max: 15, unit: ' мин',
                      hint: 'cron/batch-задачи живут минутами' },
  idlePeriodS:      { label: 'простой', code: 'trace_idle_period', min: 5, max: 120, unit: 's' },
  livePeriodS:      { label: 'время жизни', code: 'trace_live_period', min: 30, max: 600, unit: 's' },
  gapS:             { label: 'пауза между спанами', min: 1, max: 90, unit: 's' },
  traceqlScanPct:   { label: 'блоков читает TraceQL', min: 10, max: 100, unit: '%',
                      hint: 'отсечение по времени и bloom-фильтрам' },
};

/** Фрагменты конфигов. Значения абстрактные и круглые - вендор-нейтральность. */
const CONFIGS = {
  sdk: `# SDK: решение принимается один раз, при старте трейса
OTEL_TRACES_SAMPLER: parentbased_traceidratio
OTEL_TRACES_SAMPLER_ARG: "0.1"     # 10% корневых трейсов

# в traceparent уезжает флаг решения:
#   00-<trace-id>-<span-id>-01   ← 01 = sampled`,

  pipeline: `service:
  pipelines:
    traces:
      receivers:  [otlp]              # шарится с logs/metrics
      processors: [memory_limiter, tail_sampling, batch]
      exporters:  [otlphttp/tempo]`,

  tail: `tail_sampling:
  decision_wait: {{decisionWaitS}}s
  num_traces: 1000000                 # размер circular buffer
  expected_new_traces_per_sec: 30000
  policies:
    - name: errors-policy
      type: status_code
      status_code: {status_codes: [ERROR]}
    - name: baseline
      type: probabilistic
      probabilistic: {sampling_percentage: {{baseline}}}`,

  lb: `exporters:
  loadbalancing:
    routing_key: traceID              # ключ маршрутизации
    protocol:
      otlp: {}
    resolver:
      k8s:
        service: otel-collector-headless`,

  limits: `overrides:
  defaults:
    global:
      max_bytes_per_trace: 30000000
    ingestion:
      rate_limit_bytes: 25000000
      burst_size_bytes: 40000000
      max_traces_per_user: 100000`,

  ingester: `ingester:
  trace_idle_period: {{idlePeriodS}}s
  trace_live_period: {{livePeriodS}}s
  complete_block_timeout: 30m
  max_block_duration: 30m`,

  metricsgen: `metrics_generator:
  processors: [service-graphs, span-metrics, local-blocks]
  # цена измеряется КАРДИНАЛЬНОСТЬЮ, а не объёмом спанов:
  #   span-metrics   → серия на каждую комбинацию dimensions
  #   service-graphs → серия на каждую пару сервисов
  registry:
    collection_interval: 15s`,
};

/** Версии, объявляемые в футере. Честная датировка - митигация устаревания. */
const VERSIONS = [
  { hue: '--c-teal',    label: 'Tempo <b>2.9.0</b>', note: 'чарт tempo-distributed 1.57.0 - версионная база' },
  { hue: '--c-amber',   label: 'Tempo <b>2.7.1</b>', note: 'чарт tempo 1.18.3 - монолитный вариант, преобладает в парке' },
  { hue: '--c-indigo',  label: '<b>opentelemetry-collector</b> 0.117.1', note: '' },
];
