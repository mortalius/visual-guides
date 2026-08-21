/* ============================================================
   RTLS - расчётное ядро (pure functions, no DOM)
   ------------------------------------------------------------
   Единственный источник цифр для калькулятора «цена точности»,
   подписей на слое «Технологии» и врезок с физикой. Если считать
   в каждом месте отдельно, цифры разойдутся - для материала, чей
   главный тезис «точность стоит денег», это смертельно.

   ДВА КЛАССА ЧИСЕЛ, и путать их нельзя:

   1. ФИЗИКА - выводится из константы и верна безусловно:
      скорость света, во что превращается наносекунда, сколько
      анкеров нужно геометрически. Это проверяется self-test'ом
      на равенство.
   2. ИНЖЕНЕРНЫЕ ПРИКИДКИ - шаг анкеров, токи потребления,
      относительные цены. Это порядок величины, а НЕ прогноз для
      объекта; профили собраны из типичных значений класса
      оборудования, а не из даташита конкретного вендора.
      Self-test проверяет им только монотонность и баланс.

   Дисклеймер про (2) обязан стоять рядом с ползунками в UI
   (локальный DESIGN.md §3.23), а не только здесь.

   Экспортирует глобали, потребляемые data.js и app.js:
     C, nsToMetres, metresToNs, timingBudget,
     RADIO, rssiToDistance, rssiBand, minAnchors,
     anchorPlan, batteryYears, twrCapacity, realisticAccuracy,
     recommend, costRatio, fmtLen, fmtYears, fmtNum, fmtHz
   ============================================================ */
"use strict";

/* ── 1. Физика ───────────────────────────────────────────────── */

/** Скорость света в вакууме, м/с. В воздухе отличается на ~0.03% - для геометрии
    внутри цеха это далеко за пределами точности любой системы. */
const C = 299792458;

/** Наносекунда полёта радиосигнала - это столько метров. ≈ 0.2998 м. */
const nsToMetres = ns => ns * C * 1e-9;

/** Обратное: сколько наносекунд «стоит» такая дистанция. */
const metresToNs = m => m / (C * 1e-9);

/**
 * Требование к таймингу для заявленной точности.
 * oneWay  - ToF/TDoA: ошибка часов сразу переезжает в ошибку дистанции 1:1.
 * twoWay  - TWR: измеряется круговое время, поэтому на дистанцию влияет
 *           половина ошибки - бюджет по времени вдвое мягче.
 * Ключевой факт для новичка: 10 см = треть наносекунды. Именно поэтому
 * «померить время» умеет UWB и не умеет BLE RSSI.
 */
function timingBudget(accuracyM) {
  const oneWay = metresToNs(accuracyM);
  return { accuracyM, oneWayNs: oneWay, twoWayNs: oneWay * 2 };
}

/* ── 2. Профили радио (инженерные прикидки, класс оборудования) ── */

/**
 * Один профиль = класс технологии, не модель устройства.
 *   accuracyM     типичная медианная точность в нормальных условиях (LOS)
 *   spacingM      шаг сетки анкеров, при котором эта точность достигается
 *   tagTxMs/Ma    длительность и ток одного обмена
 *   sleepUa       ток покоя
 *   batteryMah    типичная ёмкость метки этого класса
 *   anchorUnits   относительная цена одного анкера (BLE-шлюз = 1)
 *   installUnits  монтаж и кабель на один анкер - строка, которой нет в прайсе
 *   tagUnits      относительная цена одной метки (BLE-метка = 1)
 *   wired         нужен ли анкеру кабель (PoE / питание / синхронизация)
 *   method        идентификатор метода из METHODS (data.js) - контракт слоёв
 */
const RADIO = {
  'ble-rssi': {
    label: 'BLE (зона по RSSI)', accuracyM: 5, spacingM: 10,
    tagTxMs: 0.5, tagTxMa: 8, sleepUa: 4, batteryMah: 225,
    anchorUnits: 1, installUnits: 1, tagUnits: 1, wired: false, method: 'proximity',
  },
  'ble-aoa': {
    label: 'BLE AoA (Bluetooth 5.1+)', accuracyM: 1, spacingM: 18,
    tagTxMs: 0.7, tagTxMa: 9, sleepUa: 5, batteryMah: 225,
    anchorUnits: 6, installUnits: 8, tagUnits: 1.2, wired: true, method: 'aoa',
  },
  'uwb': {
    label: 'UWB (IEEE 802.15.4z)', accuracyM: 0.1, spacingM: 20,
    tagTxMs: 2, tagTxMa: 45, sleepUa: 15, batteryMah: 1000,
    anchorUnits: 10, installUnits: 15, tagUnits: 6, wired: true, method: 'twr',
  },
  'wifi': {
    label: 'Wi-Fi (RSSI / FTM)', accuracyM: 8, spacingM: 20,
    tagTxMs: 40, tagTxMa: 180, sleepUa: 100, batteryMah: 1000,
    anchorUnits: 0, installUnits: 0, tagUnits: 4, wired: true, method: 'fingerprint',
  },
  'ultrasound': {
    label: 'Ультразвук', accuracyM: 0.5, spacingM: 8,
    tagTxMs: 10, tagTxMa: 20, sleepUa: 10, batteryMah: 500,
    anchorUnits: 7, installUnits: 9, tagUnits: 5, wired: true, method: 'proximity',
  },
  'rfid': {
    label: 'RFID (пассивные метки)', accuracyM: 1.5, spacingM: 0,
    tagTxMs: 0, tagTxMa: 0, sleepUa: 0, batteryMah: 0,
    anchorUnits: 14, installUnits: 10, tagUnits: 0.05, wired: true, method: 'proximity',
  },
};

/* ── 3. RSSI: почему по уровню сигнала нельзя мерить метры ─────── */

/**
 * Логарифмическая модель затухания: d = 10^((TxPower - RSSI) / (10·n)).
 *   txPower - опорный уровень на 1 м (dBm, обычно -59…-65)
 *   n       - показатель среды: 2.0 свободное пространство, 2.7-4 внутри цеха
 */
const rssiToDistance = (rssi, txPower = -59, n = 2.5) =>
  Math.pow(10, (txPower - rssi) / (10 * n));

/**
 * Разброс дистанции при замирании сигнала на ±fadeDb.
 * Отсюда следует главный вывод слоя «Методы»: ±6 дБ - обычное дело в цеху
 * при отражениях от стеллажей, и это не «плюс-минус чуть-чуть», а
 * умножение дистанции на постоянный множитель.
 */
function rssiBand(rssi, txPower = -59, n = 2.5, fadeDb = 6) {
  const near = rssiToDistance(rssi + fadeDb, txPower, n);
  const far = rssiToDistance(rssi - fadeDb, txPower, n);
  return { mid: rssiToDistance(rssi, txPower, n), near, far, ratio: far / near };
}

/* ── 4. Геометрия: сколько анкеров обязательно ────────────────── */

/**
 * Минимум анкеров по методу и размерности - это геометрия, а не прайс-лист.
 *   range (TWR/ToF): 2D - 3 окружности, 3D - 4.
 *   tdoa:            столько же, но плюс общие часы: разности времён
 *                    снимают неизвестный сдвиг часов метки, не анкеров.
 *   aoa:             два угла с известных точек дают точку на плоскости -
 *                    отсюда вся экономика BLE AoA: анкеров нужно вдвое меньше.
 *   proximity:       один приёмник, ответ - «рядом с ним», а не координата.
 *   fingerprint:     три и более видимых передатчика - иначе набор уровней не
 *                    различает точки карты. Геометрия при этом не важна: важно
 *                    число одновременно слышимых, а не их взаимное расположение.
 */
function minAnchors(method, dims = 2) {
  switch (method) {
    case 'twr': case 'tof': case 'tdoa': return dims === 3 ? 4 : 3;
    case 'aoa': return 2;
    case 'proximity': return 1;
    case 'fingerprint': return 3;
    default: return 3;
  }
}

/**
 * План инфраструктуры под площадь.
 * Сетка со шагом spacingM плюс запас на края: анкер в углу «видит» четверть
 * круга, поэтому по периметру их всегда больше, чем даёт деление площади.
 * Wi-Fi считается отдельно: точки доступа на объекте уже стоят, новых анкеров
 * проект не добавляет - платят за метки и за софт.
 */
function anchorPlan(techId, areaM2) {
  const r = RADIO[techId];
  if (!r) return null;
  if (r.spacingM === 0) {           // RFID: не сетка, а воротА на проходах
    const gates = Math.max(2, Math.round(Math.sqrt(areaM2) / 40));
    return { anchors: gates, spacingM: 0, wired: r.wired, cableM: gates * 30,
             kind: 'gates', note: 'считаются проходы и воротА, а не сетка по площади' };
  }
  const side = Math.sqrt(areaM2);
  const perRow = Math.ceil(side / r.spacingM) + 1;   // +1 - край сетки
  const anchors = perRow * perRow;
  return {
    anchors, spacingM: r.spacingM, wired: r.wired,
    cableM: r.wired ? anchors * 30 : 0,
    kind: 'grid',
    note: `сетка ${perRow}×${perRow} с шагом ${r.spacingM} м`,
  };
}

/* ── 5. Батарея и ёмкость канала ──────────────────────────────── */

/**
 * Срок жизни метки при заданной частоте обновления.
 * I_avg = ток покоя + доля времени в эфире × ток передачи.
 * Пассивная RFID-метка возвращает null: у неё нет батареи вовсе, и это
 * ровно та причина, по которой её выбирают на одноразовую тару.
 */
function batteryYears(techId, updateHz) {
  const r = RADIO[techId];
  if (!r || r.batteryMah === 0) return null;
  const dutyMaAvg = (r.tagTxMs / 1000) * updateHz * r.tagTxMa;
  const avgMa = r.sleepUa / 1000 + dutyMaAvg;
  return r.batteryMah / avgMa / 8760;               // мА·ч / мА → часы → годы
}

/**
 * Сколько метки успевают опроситься при TWR: обмен занимает слот, слоты
 * делят одну секунду. Потолок ёмкости - это не «мало анкеров», а физика
 * очереди: 1000 мс / (слот × частота).
 */
function twrCapacity(updateHz, slotMs = 4) {
  return Math.floor(1000 / (slotMs * updateHz));
}

/* ── 6. Паспортная точность против цеховой ────────────────────── */

/**
 * Как читать «10 см» из даташита. Множители - инженерная прикидка,
 * иллюстрирующая механику, не измерение:
 *   p95    - хвост распределения, а не медиана;
 *   nlos   - прямой видимости нет: сигнал пришёл отражением;
 *   moving - объект движется, фильтр отстаёт.
 * Вывод, ради которого это здесь: спрашивать у поставщика надо не «какая
 * точность», а «какой процентиль, на каком объекте и в движении ли».
 */
function realisticAccuracy(medianM, { nlos = false, moving = false } = {}) {
  let v = medianM * 2.5;                            // медиана → p95
  if (nlos) v *= 3;
  if (moving) v *= 1.4;
  return { medianM, p95M: medianM * 2.5, worstM: v, nlos, moving };
}

/* ── 7. Подбор технологии от требования ──────────────────────── */

/**
 * Обратный ход гайда: сначала нужная точность, потом радио.
 * Возвращает подходящие профили от самого дешёвого к самому точному.
 * Порог зоны (>3 м) отделяет «ответ = место» от «ответ = координата»:
 * это и есть развилка, на которой экономится порядок бюджета.
 */
function recommend(accuracyM) {
  const fits = Object.entries(RADIO)
    .filter(([, r]) => r.accuracyM <= accuracyM)
    .sort((a, b) => a[1].anchorUnits - b[1].anchorUnits);
  return {
    zoneEnough: accuracyM > 3,
    fits: fits.map(([id]) => id),
    best: fits.length ? fits[0][0] : 'uwb',
    impossible: !fits.length,
  };
}

/**
 * Во что уходит бюджет - три статьи, а не две: железо анкеров, МОНТАЖ анкеров
 * и парк меток. Единицы относительные (BLE-шлюз = 1), поэтому осмысленна только
 * пропорция, её и показываем.
 *
 * Вывод здесь НЕ предзадан, и это главное: перевес зависит от площади и от
 * размера парка. Большая площадь при малом парке - платите за инфраструктуру;
 * десять тысяч меток на один пролёт - платите за метки. Поэтому «метки дешёвые,
 * значит проект дешёвый» - не ошибка, а незаданный вопрос: чего у вас много.
 * Монтаж выделен отдельно потому, что именно его не показывают в прайсе.
 */
function costRatio(techId, areaM2, tags) {
  const r = RADIO[techId], plan = anchorPlan(techId, areaM2);
  if (!r || !plan) return null;
  const hardware = plan.anchors * r.anchorUnits;
  const install = plan.anchors * (r.installUnits || 0);
  const fleet = tags * r.tagUnits;
  const infra = hardware + install;
  const total = infra + fleet;
  const parts = { hardware, install, fleet };
  const dominant = Object.keys(parts).reduce((a, b) => parts[a] >= parts[b] ? a : b);
  return {
    hardware, install, infra, fleet, total,
    infraShare: total ? infra / total : 0,
    dominant,
  };
}

/* ── 8. Форматирование (разрядность фиксируется здесь, не в CSS) ── */

/** 0.2 м → «20 см», 12 м → «12 м». Никогда «0.30000000000000004 м». */
const fmtLen = m => {
  if (m == null) return '-';
  if (m < 1) return `${Math.round(m * 100)} см`;
  if (m < 10) return `${Math.round(m * 10) / 10} м`;
  return `${Math.round(m)} м`;
};

/** 10 дней → «10 дн», 0.4 года → «5 мес», 6.2 → «6.2 года», null → «без батареи».
    Дни обязательны: Wi-Fi-метка при 1 Гц живёт трое суток, и «1 мес» было бы
    не округлением, а неправдой - именно на этом контрасте держится вывод слоя. */
const fmtYears = y => {
  if (y === null) return 'без батареи';
  const days = y * 365;
  if (days < 45) return `${Math.max(1, Math.round(days))} дн`;
  if (y < 1) return `${Math.round(y * 12)} мес`;
  return `${Math.round(y * 10) / 10} года`;
};

/** Целые с разделителем тысяч неразрывным пробелом: 10 000. */
const fmtNum = n => Math.round(n).toString().replace(/\B(?=(\d{3})+(?!\d))/g, ' ');

/** 0.2 Гц → «раз в 5 с», 1 Гц → «1 Гц», 10 → «10 Гц». */
const fmtHz = hz => hz < 1 ? `раз в ${Math.round(1 / hz)} с` : `${hz} Гц`;
