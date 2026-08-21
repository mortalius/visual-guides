/* ============================================================
   RTLS visualization - behavior (no content here)
   ------------------------------------------------------------
   Depends on globals from model.js (arithmetic) and data.js
   (content). Wires up:
     - layer tabs (Что это / Методы / Технологии / Кейсы / Пилот)
     - ONE side panel for SIX sources of content (see SOURCES)
     - term chips: any [data-term] anywhere opens the glossary
     - [data-calc] placeholders filled from model.js
     - the technology matrix rows (rendered from RADIO)
     - the «цена точности» calculator (knobs → model.js → output)
     - deep links  #<layer>/<kind>:<id>
     - ?selftest=1

   DOM contract (ids/classes) is defined in index.html and in
   layers/*.html. Numbers must never be typed into markup - if a
   figure is visible on the page, it came from model.js through
   [data-calc] or through a renderer below.
   ============================================================ */

/* ---------------- sources: one panel shape, six maps ---------------- */
/* Adding a source = one line here + a delegated click below. The kind
   string also appears in the URL hash, so keep it short and stable. */
const SOURCES = {
  node:    { map: PANELS,   label: 'Элемент схемы' },
  method:  { map: METHODS,  label: 'Метод измерения' },
  tech:    { map: TECH,     label: 'Технология' },
  case:    { map: CASES,    label: 'Кейс' },
  pitfall: { map: PITFALLS, label: 'Подвох на пилоте' },
  term:    { map: GLOSSARY, label: 'Словарь' },
};
/* Owner hues exist only for these values (styles.css [data-owner]) - the
   self-test checks that no entry invents a fourth role. */
const OWNER_ROLES = ['ИТ', 'эксплуатация', 'охрана труда', 'вендор'];

/* ---------------- side panel ---------------- */
const side = {
  empty: document.getElementById('side-empty'),
  content: document.getElementById('side-content'),
  kindText: document.getElementById('s-kind-text'),
  badge: document.getElementById('s-badge'),
  title: document.getElementById('s-title'),
  scope: document.getElementById('s-scope'),
  owner: document.getElementById('s-owner'),
  overview: document.getElementById('pane-overview'),
  dataPane: document.getElementById('pane-data'),
  tabs: document.querySelectorAll('.panel-tab'),
};
let current = null;                       // {kind, id, d}

function renderOverview(d) {
  let html = `<p class="side-lead">${d.lead}</p>`;
  /* «Цепочка решения» first on a case: it IS the point of that layer, and it must
     be visible before any prose the reader might skip. */
  if (d.chain && d.chain.length) {
    html += `<div class="sect"><p class="sect-h">Цепочка решения · читается сверху вниз</p><ul class="chainlist">`;
    d.chain.forEach(([k, v]) => {
      html += `<li><span class="cl-k">${k}</span><span class="cl-v">${v}</span></li>`;
    });
    html += `</ul></div>`;
  }
  if (d.fields && d.fields.length) {
    html += `<div class="sect"><p class="sect-h">Характеристики</p>`;
    d.fields.forEach(([f, desc]) => {
      html += `<div class="field-row"><code>${f}</code><span class="fd">${desc}</span></div>`;
    });
    html += `</div>`;
  }
  if (d.refs && d.refs.length) {
    /* Each ref renders as an explicit directed edge SOURCE → TARGET so the arrow is
       never ambiguous: this element is highlighted (.me) and placed as source when
       dir==='out', as target when dir==='in'. */
    html += `<div class="sect"><p class="sect-h">Связи</p><ul class="ref-list">`;
    d.refs.forEach(([dir, verb, target, via]) => {
      const me = `<span class="rn me">${d.kind}</span>`;
      const other = `<span class="rn">${target}</span>`;
      const [src, dst] = dir === 'out' ? [me, other] : [other, me];
      html += `<li class="ref-item"><div class="ref-edge">${src}<span class="ra">→</span>${dst}</div>`
            + `<div class="ref-meta">${verb}${via ? ` · <code>${via}</code>` : ''}</div></li>`;
    });
    html += `</ul></div>`;
  }
  /* «Что спросить у поставщика» - the guide's take-away artifact. Kept as a list of
     literal questions, not topics: a topic does not survive a meeting. */
  if (d.ask && d.ask.length) {
    html += `<div class="sect"><p class="sect-h">Что спросить у поставщика</p><ul class="asklist">`;
    d.ask.forEach(q => { html += `<li>${q}</li>`; });
    html += `</ul></div>`;
  }
  /* Mirror image of the donor guide's «как проверить в кластере»: what to do ON SITE,
     what a healthy answer looks like (ok) and how failure reads (bad). */
  if (d.verify && d.verify.length) {
    html += `<div class="sect"><p class="sect-h">Как проверить на объекте</p><div class="verify">`;
    d.verify.forEach(v => {
      html += `<div class="vf"><p class="vf-cmd">${v.cmd}</p>`
            + (v.ok ? `<p class="vf-ok">${v.ok}</p>` : '')
            + (v.bad ? `<p class="vf-bad">${v.bad}</p>` : '')
            + `</div>`;
    });
    html += `</div></div>`;
  }
  if (d.note) html += `<div class="callout"><b>Заметка.</b> ${d.note}</div>`;
  side.overview.innerHTML = html;
}

function renderData(d) {
  if (!d.data) {
    side.dataPane.innerHTML = `<div class="field-detail empty"><div class="fd-empty">`
      + `Для этой записи нет фрагмента данных - это понятие или метод, а не сообщение системы.</div></div>`;
    return;
  }
  side.dataPane.innerHTML =
    `<p class="manifest-hint">
       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
       ${d.data.lang}. Кликните <b style="color:var(--primary)">подчёркнутое поле</b> - пояснение появится ниже.
     </p>
     <pre class="manifest-pre">${d.data.code}</pre>
     <div class="field-detail empty" id="field-detail"><div class="fd-empty">Поле не выбрано</div></div>`;
}

function openPanel(kind, id) {
  const src = SOURCES[kind];
  const d = src && src.map[id];
  if (!d) return false;
  current = { kind, id, d };
  side.kindText.textContent = src.label;
  side.badge.textContent = d.badge || '';
  side.title.textContent = d.kind;
  side.scope.textContent = d.scope || '';
  if (side.owner) {
    const o = d.owner;
    side.owner.classList.toggle('shown', !!o);
    side.owner.dataset.owner = o ? o.who : '';
    side.owner.innerHTML = o
      ? `<span class="ow-who">${o.label || o.who}</span>` + (o.freq ? `<span class="ow-freq">${o.freq}</span>` : '')
      : '';
  }
  renderOverview(d);
  renderData(d);
  setPane('overview', d);
  side.empty.style.display = 'none';
  side.content.classList.add('active');
  return true;
}

function closePanel() {
  side.content.classList.remove('active');
  side.empty.style.display = 'flex';
  document.querySelectorAll('.selected').forEach(n => n.classList.remove('selected'));
  current = null;
}

function setPane(name, d) {
  d = d || (current && current.d);
  const hasData = !!(d && d.data);
  side.tabs.forEach(t => {
    const active = t.dataset.pane === name;
    t.setAttribute('aria-selected', String(active));
    if (t.dataset.pane === 'data') t.disabled = !hasData;
  });
  side.overview.classList.toggle('active', name === 'overview');
  side.dataPane.classList.toggle('active', name === 'data');
}

side.tabs.forEach(t => t.addEventListener('click', () => { if (!t.disabled) setPane(t.dataset.pane); }));
document.getElementById('side-close').addEventListener('click', closePanel);
document.addEventListener('keydown', e => { if (e.key === 'Escape') closePanel(); });

/* field-detail: delegated click on interactive payload keys (.yk) */
side.dataPane.addEventListener('click', e => {
  const yk = e.target.closest('.yk');
  const detail = document.getElementById('field-detail');
  if (!yk || !detail || !current || !current.d.data) return;
  const key = yk.dataset.f;
  const info = current.d.data.fields[key];
  if (yk.classList.contains('active')) {          // toggle off on second click
    yk.classList.remove('active');
    detail.className = 'field-detail empty';
    detail.innerHTML = `<div class="fd-empty">Поле не выбрано</div>`;
    return;
  }
  side.dataPane.querySelectorAll('.yk.active').forEach(x => x.classList.remove('active'));
  yk.classList.add('active');
  if (!info) {
    detail.className = 'field-detail';
    detail.innerHTML = `<div class="fd-inner"><p class="fd-field">${key}</p><div class="fd-block"><p>Нет описания.</p></div></div>`;
    return;
  }
  let html = `<div class="fd-inner"><p class="fd-field">${key}<span class="fd-tag">поле</span></p>`;
  html += `<div class="fd-block"><h4>Назначение</h4><p>${info.purpose}</p></div>`;
  if (info.links && info.links.length) {
    html += `<div class="fd-block"><h4>Связи</h4><ul>`;
    info.links.forEach(l => { html += `<li><span class="a">·</span><span>${l}</span></li>`; });
    html += `</ul></div>`;
  }
  html += `<div class="fd-block"><h4>Влияние</h4><p>${info.impact}</p></div>`;
  if (info.failure) html += `<div class="fd-block fd-fail"><h4>Если сломать</h4><p>${info.failure}</p></div>`;
  html += `</div>`;
  detail.className = 'field-detail';
  detail.innerHTML = html;
});

/* ---------------- selection ---------------- */
const layerPanels = {
  intro: document.getElementById('panel-intro'),
  methods: document.getElementById('panel-methods'),
  tech: document.getElementById('panel-tech'),
  cases: document.getElementById('panel-cases'),
  pilot: document.getElementById('panel-pilot'),
};
let currentLayer = 'intro';               // landing layer, matches .active in layers/intro.html

/** Which layer holds the element carrying this kind/id, if any. */
function layerOf(kind, id) {
  const sel = `[data-${kind}="${id}"]`;
  for (const [layer, el] of Object.entries(layerPanels)) {
    if (el && el.querySelector(sel)) return layer;
  }
  return null;
}

/**
 * Open an entity in the panel.
 * stay:true - never switch layers. Always true for glossary terms: a term chip is
 * a dictionary lookup, and yanking the reader to another cross-section mid-sentence
 * is exactly the behaviour that makes a glossary annoying.
 */
function select(kind, id, { push = true, stay = false } = {}) {
  const layer = stay ? null : layerOf(kind, id);
  if (layer && currentLayer !== layer) switchLayer(layer, { push: false });
  document.querySelectorAll('.selected').forEach(n => n.classList.remove('selected'));
  const host = layerPanels[currentLayer] || document;
  const el = host.querySelector(`[data-${kind}="${id}"]`);
  if (el) el.classList.add('selected');
  if (!openPanel(kind, id)) return;
  if (push) writeHash(currentLayer, kind, id);
}

/* Delegated click for every source. Terms are checked FIRST and stop propagation:
   a term chip lives INSIDE a method/case card, and without this the card would open
   on top of the glossary entry the reader asked for. */
document.addEventListener('click', e => {
  const term = e.target.closest('[data-term]');
  if (term) { e.stopPropagation(); e.preventDefault(); select('term', term.dataset.term, { stay: true }); return; }
  for (const kind of ['node', 'method', 'tech', 'case', 'pitfall']) {
    const el = e.target.closest(`[data-${kind}]`);
    if (el) { select(kind, el.dataset[kind]); return; }
  }
});
/* Keyboard equivalent for SVG groups and chips (real <button> cards fire click natively). */
document.addEventListener('keydown', e => {
  if (e.key !== 'Enter' && e.key !== ' ') return;
  const t = e.target;
  if (!t || !t.closest) return;
  const term = t.closest('[data-term]');
  if (term) { e.preventDefault(); select('term', term.dataset.term, { stay: true }); return; }
  const node = t.closest('[data-node]');
  if (node) { e.preventDefault(); select('node', node.dataset.node); return; }
  const goto = t.closest('[data-goto]');
  if (goto) { e.preventDefault(); switchLayer(goto.dataset.goto); }
});

/* Term chips are spans: give them the semantics of a button. */
document.querySelectorAll('[data-term]').forEach(el => {
  el.setAttribute('role', 'button');
  el.setAttribute('tabindex', '0');
  el.setAttribute('title', 'Открыть статью словаря');
});
document.querySelectorAll('[data-goto]').forEach(el => {
  if (!el.hasAttribute('tabindex')) { el.setAttribute('role', 'button'); el.setAttribute('tabindex', '0'); }
});

/* ---------------- layer tabs ---------------- */
const tabs = document.querySelectorAll('.tab');
const wrapEl = document.querySelector('.wrap');
if (wrapEl) wrapEl.dataset.layer = currentLayer;   // lets CSS react per-layer (hides .color-key)

function switchLayer(layer, { push = true } = {}) {
  if (!layerPanels[layer]) return;
  currentLayer = layer;
  if (wrapEl) wrapEl.dataset.layer = layer;
  tabs.forEach(t => t.setAttribute('aria-selected', String(t.dataset.layer === layer)));
  Object.entries(layerPanels).forEach(([k, el]) => el && el.classList.toggle('active', k === layer));
  closePanel();
  if (push) writeHash(layer, null, null);
}
tabs.forEach(tab => tab.addEventListener('click', () => switchLayer(tab.dataset.layer)));
document.addEventListener('click', e => {
  const chip = e.target.closest('[data-goto]');
  if (!chip) return;
  e.stopPropagation();
  switchLayer(chip.dataset.goto);
});

/* ---------------- deep links: #<layer>/<kind>:<id> ---------------- */
let applyingHash = false;
function writeHash(layer, kind, id) {
  if (applyingHash) return;
  const h = '#' + layer + (kind && id ? `/${kind}:${id}` : '');
  if (location.hash !== h) history.replaceState(null, '', h);
}
function applyHash() {
  const m = /^#([a-z]+)(?:\/([a-z]+):([\w-]+))?$/.exec(location.hash || '');
  if (!m) return;
  applyingHash = true;
  const [, layer, kind, id] = m;
  if (layerPanels[layer]) switchLayer(layer, { push: false });
  if (kind && id && SOURCES[kind] && SOURCES[kind].map[id]) {
    select(kind, id, { push: false, stay: kind === 'term' });
  }
  applyingHash = false;
}
window.addEventListener('hashchange', applyHash);

/* ---------------- [data-calc]: every number on the page comes from model.js ----------------
   The rule this enforces: markup carries no figures. If a value is visible, it is
   computed here, so the guide cannot contradict its own calculator. */
function calcValues() {
  const v = {};

  /* method cards: accuracy from METHODS[*].spec, anchors from geometry, sync from method */
  Object.entries(METHODS).forEach(([id, m]) => {
    v[`acc-${id}`] = m.spec.acc;
    const n = minAnchors(id);
    v[`anch-${id}`] = n === 1 ? '1 анкер' : `${n} анкера`;
    v[`sync-${id}`] = m.spec.sync ? 'общие часы нужны' : 'без общих часов';
  });

  /* physics box */
  v['ns-metres'] = fmtLen(nsToMetres(1));
  v['budget-3m'] = `${Math.round(timingBudget(3).oneWayNs * 10) / 10} нс`;
  v['budget-10cm'] = `${Math.round(timingBudget(0.1).oneWayNs * 100) / 100} нс`;
  v['budget-10cm-twr'] = `${Math.round(timingBudget(0.1).twoWayNs * 100) / 100} нс`;

  /* RSSI box: the ±6 dB band around -75 dBm */
  const band = rssiBand(-75);
  v['rssi-mid'] = fmtLen(band.mid);
  v['rssi-near'] = fmtLen(band.near);
  v['rssi-far'] = fmtLen(band.far);
  v['rssi-ratio'] = String(Math.round(band.ratio * 10) / 10);

  /* capacity box */
  v['cap-1hz'] = fmtNum(twrCapacity(1));
  v['cap-10hz'] = fmtNum(twrCapacity(10));

  /* accuracy ladder on the cases layer: counted from CASES[*].step, never typed */
  const total = Object.keys(CASES).length;
  const byStep = s => Object.values(CASES).filter(c => c.step === s).length;
  const word = n => n === 1 ? 'кейс' : (n < 5 ? 'кейса' : 'кейсов');
  ['zone', 'metres', 'cm'].forEach(s => {
    const n = byStep(s);
    v[`ladder-${s}`] = `${n} ${word(n)} из ${total}`;
  });

  /* case chips: the requirement and the radio that serves it */
  Object.entries(CASES).forEach(([id, c]) => {
    v[`need-${id}`] = c.need;
    v[`tech-${id}`] = RADIO[c.tech].label;
  });

  return v;
}

function fillCalc() {
  const v = calcValues();
  document.querySelectorAll('[data-calc]').forEach(el => {
    const key = el.dataset.calc;
    if (v[key] !== undefined) el.textContent = v[key];
  });
  return v;
}

/* ---------------- technology matrix (rendered from RADIO) ---------------- */
function renderMatrix() {
  document.querySelectorAll('.mx-row').forEach(row => {
    const id = row.dataset.tech, r = RADIO[id], t = TECH[id];
    if (!r || !t) return;
    const cells = [
      `<span class="mx-c mx-name">${r.label}</span>`,
      `<span class="mx-c num">${fmtLen(r.accuracyM)}</span>`,
      `<span class="mx-c num">${r.spacingM ? fmtLen(r.spacingM) : 'воротА'}</span>`,
      `<span class="mx-c num">${minAnchors(r.method)}</span>`,
      `<span class="mx-c num">${fmtYears(batteryYears(id, 1))}</span>`,
      `<span class="mx-c">${r.wired ? 'нужен' : 'не нужен'}</span>`,
    ];
    row.innerHTML = cells.join('');
  });
}

/* ---------------- calculator ----------------
   STATE.params holds one value per KNOBS key; nothing else is state. */
const STATE = { params: { areaM2: 10000, accuracyM: 1, updateHz: 1, tags: 1000 } };

function knob(parent, key) {
  const c = KNOBS[key], val = STATE.params[key];
  const wrap = document.createElement('div');
  wrap.className = 'knob';
  wrap.innerHTML =
    `<div class="knob-label"><span class="kn">${c.label}</span>` +
    `<span class="val" data-val="${key}">${val}${c.unit || ''}</span></div>` +
    `<input type="range" min="${c.min}" max="${c.max}" step="${c.step || 1}" value="${val}" aria-label="${c.label}">` +
    (c.hint ? `<div class="hint">${c.hint}</div>` : '');
  wrap.querySelector('input').addEventListener('input', e => {
    STATE.params[key] = Number(e.target.value);
    renderCalc();
  });
  parent.appendChild(wrap);
}

function renderKnobs() {
  const box = document.getElementById('knobs');
  if (!box) return;
  box.innerHTML = '';
  Object.keys(KNOBS).forEach(k => knob(box, k));
}

function renderCalc() {
  const out = document.getElementById('calc-out');
  if (!out) return;
  const p = STATE.params;
  /* keep the knob read-outs in sync (they are re-rendered, not re-created) */
  Object.keys(KNOBS).forEach(k => {
    const el = document.querySelector(`[data-val="${k}"]`);
    if (el) el.textContent = `${p[k]}${KNOBS[k].unit || ''}`;
  });

  const rec = recommend(p.accuracyM);
  if (rec.impossible) {
    out.innerHTML = `<div class="callout warn"><b>Такой точности нет ни у одного класса в таблице.</b>
      Требование ${fmtLen(p.accuracyM)} лежит за границей применимости массовых RTLS: здесь
      начинаются оптические и механические средства, а не радио. Проверьте, действительно ли
      процесс требует этой цифры - см. подвох «Как читать точность» на слое «Пилот».</div>`;
    return;
  }
  const id = rec.best, r = RADIO[id];
  const plan = anchorPlan(id, p.areaM2);
  const years = batteryYears(id, p.updateHz);
  const cap = twrCapacity(p.updateHz);
  const cost = costRatio(id, p.areaM2, p.tags);
  const real = realisticAccuracy(r.accuracyM, { nlos: true, moving: true });
  const capTight = r.method === 'twr' && p.tags > cap;
  const pct = x => Math.round(x / cost.total * 100);
  const DOM = { hardware: 'железо анкеров', install: 'монтаж и кабель', fleet: 'парк меток' };

  out.innerHTML = `
    <div class="co-head">
      <span class="co-h">Самое дешёвое, что закрывает требование</span>
      <span class="co-tech">${r.label}</span>
      <span class="co-sub">${rec.zoneEnough
        ? 'требование выше 3 м - задача решается зонами, и это самый дешёвый ответ'
        : 'требование в метрах и точнее - зонами не закрывается'}</span>
    </div>
    <ul class="co-rows">
      <li><span class="co-k">Анкеров на ${fmtNum(p.areaM2)} м²</span><span class="co-v">${fmtNum(plan.anchors)}</span><span class="co-n">${plan.note}</span></li>
      <li><span class="co-k">Кабель к анкерам</span><span class="co-v">${plan.cableM ? `≈ ${fmtNum(plan.cableM)} м` : 'не нужен'}</span><span class="co-n">${r.wired ? 'плюс работы на высоте и обследование' : 'шлюзы можно ставить автономно'}</span></li>
      <li><span class="co-k">Батарея метки при ${fmtHz(p.updateHz)}</span><span class="co-v">${fmtYears(years)}</span><span class="co-n">${years === null ? 'пассивная метка живёт неограниченно' : 'дальше - обслуживание парка'}</span></li>
      <li><span class="co-k">Меток в одном эфире</span><span class="co-v">${r.method === 'twr' ? fmtNum(cap) : 'не ограничено обменом'}</span><span class="co-n">${r.method === 'twr' ? 'обмен занимает слот; зоны делятся на независимые эфиры' : 'метка только вещает, слоты не занимаются'}</span></li>
      <li><span class="co-k">Худший случай: p95 + NLOS + в движении</span><span class="co-v">${fmtLen(real.worstM)}</span><span class="co-n">паспортная медиана ${fmtLen(real.medianM)} - см. «Как читать точность»</span></li>
    </ul>
    <div class="co-bars" aria-label="Пропорция бюджета">
      <span class="co-h">Куда уходит бюджет · перевес: ${DOM[cost.dominant]}</span>
      <div class="bar">
        <span class="seg hw" style="width:${pct(cost.hardware)}%" title="железо анкеров"></span>
        <span class="seg inst" style="width:${pct(cost.install)}%" title="монтаж и кабель"></span>
        <span class="seg fleet" style="width:${pct(cost.fleet)}%" title="парк меток"></span>
      </div>
      <div class="bar-key">
        <span class="bk hw">железо анкеров · ${pct(cost.hardware)}%</span>
        <span class="bk inst">монтаж и кабель · ${pct(cost.install)}%</span>
        <span class="bk fleet">парк меток · ${pct(cost.fleet)}%</span>
      </div>
    </div>
    ${capTight ? `<div class="callout warn"><b>Парк не влезает в эфир.</b> При ${fmtHz(p.updateHz)}
      обмен успевает обслужить ${fmtNum(cap)} меток, а в системе их ${fmtNum(p.tags)}. Это решается
      не сервером: либо частота ниже, либо объект делится на зоны с независимым эфиром, либо
      метки молчат, пока не двигаются.</div>` : ''}
    <p class="co-foot">Подходят также: ${rec.fits.filter(f => f !== id).map(f => RADIO[f].label).join(' · ') || 'ничего дешевле нет'}.
      Клик по строке таблицы выше - разбор технологии и вопросы поставщику.</p>`;
}

/* ═══════════════════════════════════════════════════════════════
   SELFTEST - ?selftest=1
   The donor guide shipped without one and its ID contracts are
   still checked by hand. Here the contracts from data.js are
   machine-checked, plus SVG label overflow and prose clipping -
   the three traps that break silently in this series.
   ═══════════════════════════════════════════════════════════════ */
function selftest() {
  const out = [];
  const near = (a, b, e = 1e-9) => Math.abs(a - b) < e;
  const ok = (name, cond, detail = '') =>
    out.push(`${cond ? '✓' : '✗ FAIL'}  ${name}${detail ? ` - ${detail}` : ''}`);
  const keysIn = attr => [...document.querySelectorAll(`[data-${attr}]`)].map(el => el.dataset[attr]);
  /* Terms live in TWO places: chips in the layer markup and chips inside the panel prose
     in data.js. Panel prose reaches the DOM only while that panel is open, so counting
     only the DOM would report most of the glossary as dead content. */
  const termsInModel = () => {
    const found = new Set();
    const re = /data-term=\\?"([\w-]+)/g;      // stringify escapes the quotes
    for (const { map } of Object.values(SOURCES)) {
      let m; const blob = JSON.stringify(map);
      while ((m = re.exec(blob))) found.add(m[1]);
    }
    return found;
  };

  /* ---- 1. ID contracts: markup ↔ content model, both directions ---- */
  for (const [kind, { map }] of Object.entries(SOURCES)) {
    if (kind === 'node') continue;                       // nodes checked separately below
    const used = new Set(keysIn(kind));
    if (kind === 'term') termsInModel().forEach(t => used.add(t));
    const dead = [...used].filter(id => !map[id]);
    ok(`[data-${kind}] резолвится в модели`, dead.length === 0, dead.join(', ') || `${used.size} шт`);
    const unused = Object.keys(map).filter(id => !used.has(id));
    ok(`каждая запись ${kind} используется в разметке или в прозе панели`, unused.length === 0,
      unused.join(', ') || `${Object.keys(map).length} шт`);
  }
  const nodeIds = new Set([...document.querySelectorAll('.node[data-node]')].map(n => n.dataset.node));
  ok('каждый узел схемы описан в PANELS', [...nodeIds].every(id => PANELS[id]),
    [...nodeIds].filter(id => !PANELS[id]).join(', ') || `${nodeIds.size} узлов`);
  ok('каждая запись PANELS есть на схеме', Object.keys(PANELS).every(id => nodeIds.has(id)),
    Object.keys(PANELS).filter(id => !nodeIds.has(id)).join(', ') || 'все');

  /* ---- 2. cross-model contracts (the thesis of the cases layer) ---- */
  const badMethod = Object.entries(CASES).filter(([, c]) => !METHODS[c.method]).map(([k]) => k);
  ok('CASES[*].method указывает на существующий метод', badMethod.length === 0, badMethod.join(', ') || 'все 6');
  const badTech = Object.entries(CASES).filter(([, c]) => !TECH[c.tech] || !RADIO[c.tech]).map(([k]) => k);
  ok('CASES[*].tech есть и в TECH, и в RADIO', badTech.length === 0, badTech.join(', ') || 'все 6');
  ok('ключи TECH и RADIO совпадают в обе стороны',
    Object.keys(TECH).length === Object.keys(RADIO).length && Object.keys(TECH).every(k => RADIO[k]),
    `${Object.keys(TECH).length} / ${Object.keys(RADIO).length}`);
  ok('RADIO[*].method указывает на существующий метод',
    Object.values(RADIO).every(r => METHODS[r.method]),
    Object.entries(RADIO).filter(([, r]) => !METHODS[r.method]).map(([k]) => k).join(', ') || 'все');
  ok('CASES[*].step - одна из трёх ступеней',
    Object.values(CASES).every(c => ['zone', 'metres', 'cm'].includes(c.step)));
  ok('у каждого метода есть spec (точность + синхронизация)',
    Object.values(METHODS).every(m => m.spec && m.spec.acc && typeof m.spec.sync === 'boolean'));
  const badOwner = Object.entries(SOURCES).flatMap(([, { map }]) =>
    Object.entries(map).filter(([, d]) => d.owner && !OWNER_ROLES.includes(d.owner.who)).map(([k]) => k));
  ok('owner.who - только роль с заданным цветом', badOwner.length === 0, badOwner.join(', ') || 'ок');
  ok('все ручки описаны в KNOBS и наоборот',
    Object.keys(STATE.params).every(k => KNOBS[k]) && Object.keys(KNOBS).every(k => k in STATE.params),
    Object.keys(KNOBS).join(', '));

  /* ---- 3. physics: exact, not illustrative ---- */
  ok('1 нс полёта = 0.2998 м', near(nsToMetres(1), 0.299792458), nsToMetres(1).toFixed(6));
  ok('перевод метров в нс обратим', near(metresToNs(nsToMetres(7)), 7, 1e-9));
  ok('бюджет TWR вдвое мягче односторонего',
    near(timingBudget(0.1).twoWayNs, timingBudget(0.1).oneWayNs * 2));
  ok('10 см требуют различать треть наносекунды',
    timingBudget(0.1).oneWayNs > 0.3 && timingBudget(0.1).oneWayNs < 0.34,
    `${timingBudget(0.1).oneWayNs.toFixed(3)} нс`);
  ok('AoA нужно меньше анкеров, чем TWR', minAnchors('aoa') < minAnchors('twr'),
    `${minAnchors('aoa')} < ${minAnchors('twr')}`);
  ok('для 3D нужен четвёртый анкер', minAnchors('twr', 3) === 4);
  ok('RSSI: ±6 дБ дают неопределённость в разы, а не в проценты',
    rssiBand(-75).ratio > 2, `×${rssiBand(-75).ratio.toFixed(2)}`);
  ok('RSSI: дальше = слабее сигнал', rssiToDistance(-85) > rssiToDistance(-70));

  /* ---- 4. engineering estimates: monotonicity and balance only ---- */
  ok('анкеров тем больше, чем больше площадь',
    anchorPlan('uwb', 20000).anchors > anchorPlan('uwb', 5000).anchors);
  ok('шаг сетки больше ⇒ анкеров меньше',
    anchorPlan('uwb', 10000).anchors < anchorPlan('ble-rssi', 10000).anchors,
    `${anchorPlan('uwb', 10000).anchors} < ${anchorPlan('ble-rssi', 10000).anchors}`);
  ok('минимум анкеров по геометрии не превышает план сетки',
    Object.keys(RADIO).every(id => anchorPlan(id, 10000).anchors >= minAnchors(RADIO[id].method)));
  ok('батарея садится быстрее при большей частоте',
    batteryYears('ble-rssi', 10) < batteryYears('ble-rssi', 1));
  ok('BLE при 1 Гц живёт годами, UWB при 10 Гц - месяцы',
    batteryYears('ble-rssi', 1) > 2 && batteryYears('uwb', 10) < 0.5,
    `${fmtYears(batteryYears('ble-rssi', 1))} / ${fmtYears(batteryYears('uwb', 10))}`);
  ok('у пассивной метки батареи нет', batteryYears('rfid', 1) === null);
  ok('ёмкость обмена обратно пропорциональна частоте',
    near(twrCapacity(1) / 10, twrCapacity(10), 1), `${twrCapacity(1)} → ${twrCapacity(10)}`);
  const cr = costRatio('uwb', 10000, 1000);
  ok('три статьи бюджета дают в сумме итог', near(cr.hardware + cr.install + cr.fleet, cr.total));
  ok('доля инфраструктуры в пределах 0-1', cr.infraShare >= 0 && cr.infraShare <= 1);
  ok('перевес бюджета зависит от парка, а не задан заранее',
    costRatio('uwb', 20000, 50).dominant !== costRatio('uwb', 2000, 10000).dominant,
    `${costRatio('uwb', 20000, 50).dominant} vs ${costRatio('uwb', 2000, 10000).dominant}`);
  ok('подбор: требование мягче 3 м считается зоной', recommend(5).zoneEnough === true);
  ok('подбор: недостижимая точность помечается', recommend(0.01).impossible === true);
  ok('подбор: самое дешёвое из подходящих - действительно подходит',
    RADIO[recommend(1).best].accuracyM <= 1, RADIO[recommend(1).best].label);
  const ra = realisticAccuracy(0.1, { nlos: true, moving: true });
  ok('хвост не лучше p95, p95 не лучше медианы',
    ra.worstM >= ra.p95M && ra.p95M >= ra.medianM,
    `${fmtLen(ra.medianM)} → ${fmtLen(ra.p95M)} → ${fmtLen(ra.worstM)}`);

  /* ---- 5. formatting: no 0.30000000000000004 anywhere ---- */
  ok('fmtLen фиксирует разрядность', fmtLen(0.2) === '20 см' && fmtLen(12.34) === '12 м',
    `${fmtLen(0.2)} / ${fmtLen(12.34)}`);
  ok('formatted numbers не содержат длинных хвостов',
    ![fmtLen(realisticAccuracy(0.1, { nlos: true, moving: true }).worstM), fmtYears(batteryYears('uwb', 3)),
      fmtNum(twrCapacity(0.4))].some(s => /\d{5,}|\.\d{3,}/.test(s)));
  ok('fmtYears различает месяцы, годы и отсутствие батареи',
    fmtYears(0.3).includes('мес') && fmtYears(3.2).includes('года') && fmtYears(null) === 'без батареи');

  /* ---- 6. rendering: every layer, every panel, no exceptions ---- */
  const saved = { layer: currentLayer, hash: location.hash };
  const errors = [];
  let panels = 0;
  for (const [kind, { map }] of Object.entries(SOURCES)) {
    for (const id of Object.keys(map)) {
      try { if (openPanel(kind, id)) panels++; else errors.push(`${kind}:${id} не открылась`); }
      catch (e) { errors.push(`${kind}:${id} ${e.message}`); }
    }
  }
  ok('все панели открываются без исключений', errors.length === 0,
    errors.join(' | ') || `${panels} панелей`);

  /* [data-calc] must all be resolved: an empty span reads as a typo, not as a bug */
  const values = fillCalc();
  const empty = [...document.querySelectorAll('[data-calc]')]
    .filter(el => !el.textContent.trim()).map(el => el.dataset.calc);
  ok('каждый [data-calc] заполнен из model.js', empty.length === 0,
    empty.join(', ') || `${document.querySelectorAll('[data-calc]').length} значений`);
  const unusedCalc = Object.keys(values).filter(k => !document.querySelector(`[data-calc="${k}"]`));
  ok('нет посчитанных значений, которые никуда не выводятся', unusedCalc.length === 0,
    unusedCalc.join(', ') || 'все выведены');

  const rows = [...document.querySelectorAll('.mx-row')];
  ok('строки таблицы технологий отрендерены полностью',
    rows.length > 0 && rows.every(r => r.querySelectorAll('.mx-c').length === 6),
    `${rows.length} строк`);
  ok('калькулятор отрендерил результат',
    !!document.querySelector('#calc-out .co-rows') || !!document.querySelector('#calc-out .callout'));

  /* SVG does not wrap text: a long label silently leaves its box or the viewBox.
     Layers must be made visible one by one - getComputedTextLength() on a
     display:none subtree returns 0 and would pass every check. */
  const overflow = [], clipped = [];
  for (const [layer, panel] of Object.entries(layerPanels)) {
    switchLayer(layer, { push: false });
    panel.querySelectorAll('svg.diagram').forEach(svg => {
      const vbW = svg.viewBox.baseVal.width;
      const spanOf = t => {
        const len = t.getComputedTextLength();
        const x = +t.getAttribute('x') || 0;
        const a = t.getAttribute('text-anchor');
        const left = a === 'middle' ? x - len / 2 : (a === 'end' ? x - len : x);
        return [left, left + len];
      };
      svg.querySelectorAll('g.node').forEach(n => {
        const box = n.querySelector('rect.node-box');
        if (!box) return;
        const bx = +box.getAttribute('x'), bw = +box.getAttribute('width');
        n.querySelectorAll('text').forEach(t => {
          const [l, r] = spanOf(t);
          if (r > bx + bw - 2 || l < bx + 1) overflow.push(`${layer} «${t.textContent.slice(0, 22)}» за рамкой узла`);
        });
      });
      svg.querySelectorAll('text').forEach(t => {
        const [l, r] = spanOf(t);
        if (r > vbW + 1 || l < -1) overflow.push(`${layer} «${t.textContent.slice(0, 22)}» за viewBox`);
      });
    });
    /* HTML text does not overflow visibly either - .board is overflow:hidden, so a long
       unbreakable chip is cut mid-word with no scrollbar. docScrollX === 0 does NOT
       catch it; only comparing scrollWidth with clientWidth does. */
    panel.querySelectorAll('.board-lede, .callout, .chain-note, .hs-note, .deep-body, .co-rows li, .field-row, .mx-row')
      .forEach(el => {
        if (el.closest('.diagram-scroll')) return;         // that one scrolls on purpose
        if (el.scrollWidth > el.clientWidth + 1) clipped.push(`${layer} .${el.className.split(' ')[0]}`);
      });
  }
  ok('ни одна подпись не выходит за рамку узла или за viewBox',
    overflow.length === 0, overflow.join(' | ') || 'проверено getComputedTextLength()');
  ok('ни один прозаический блок не обрезан по ширине',
    clipped.length === 0, [...new Set(clipped)].join(' | ') || 'проверено scrollWidth');

  /* deep links: one sample per source kind must survive a round trip */
  const samples = Object.entries(SOURCES).map(([kind, { map }]) => [kind, Object.keys(map)[0]]);
  const badLinks = [];
  samples.forEach(([kind, id]) => {
    const layer = layerOf(kind, id) || 'intro';
    location.hash = `#${layer}/${kind}:${id}`;
    applyHash();
    if (!current || current.kind !== kind || current.id !== id) badLinks.push(`${kind}:${id}`);
  });
  ok('диплинк на каждый вид записи резолвится', badLinks.length === 0,
    badLinks.join(', ') || samples.map(([k]) => k).join(', '));

  /* restore */
  closePanel();
  switchLayer(saved.layer, { push: false });
  history.replaceState(null, '', saved.hash || location.pathname);

  const failed = out.filter(l => l.startsWith('✗')).length;
  const box = document.getElementById('selftest');
  box.style.display = 'block';
  box.className = failed ? 'fail' : 'pass';
  box.textContent = `SELFTEST: ${out.length - failed}/${out.length} passed`
    + (failed ? ` · ${failed} FAILED` : '') + '\n\n' + out.join('\n');
}

/* ---------------- boot ---------------- */
fillCalc();
renderMatrix();
renderKnobs();
renderCalc();
applyHash();
if (new URLSearchParams(location.search).get('selftest') === '1') selftest();
