/* ============================================================
   Envoy Gateway visualization - behavior (no content here)
   ------------------------------------------------------------
   Depends on globals from data.js: PANELS, STEPS, TRAFFIC_EDGES.
   Wires up:
     - layer tabs (Resources / Traffic / Policies)
     - node selection → right-side panel (Overview / Manifest)
     - interactive YAML fields → field-detail block
     - Traffic layer stepper + progress bar
   DOM contract (ids/classes) is defined in index.html.
   ============================================================ */

/* ---------------- Side panel ---------------- */
const side = {
  empty:document.getElementById('side-empty'),
  content:document.getElementById('side-content'),
  kindText:document.getElementById('s-kind-text'),
  badge:document.getElementById('s-badge'),
  title:document.getElementById('s-title'),
  scope:document.getElementById('s-scope'),
  overview:document.getElementById('pane-overview'),
  manifest:document.getElementById('pane-manifest'),
  tabs:document.querySelectorAll('.panel-tab'),
};
let currentPanel = null;

function renderOverview(d){
  let html = `<p class="side-lead">${d.lead}</p>`;
  // Fields section is shown ONLY for physical path nodes (no manifest) as
  // "Характеристики". For CRDs the Manifest tab already lists the spec fields,
  // so repeating them here would just duplicate that tab.
  if(!d.manifest && d.fields && d.fields.length){
    html += `<div class="sect"><p class="sect-h">Характеристики</p>`;
    d.fields.forEach(([f,desc])=>{ html += `<div class="field-row"><code>${f}</code><span class="fd">${desc}</span></div>`; });
    html += `</div>`;
  }
  if(d.refs && d.refs.length){
    // Each ref renders as an explicit directed edge SOURCE → TARGET so the
    // arrow is never ambiguous: this node (d.kind) is highlighted (.me) and
    // placed as source when dir==='out', as target when dir==='in'.
    html += `<div class="sect"><p class="sect-h">Связи</p><ul class="ref-list">`;
    d.refs.forEach(([dir,verb,target,via])=>{
      const me = `<span class="rn me">${d.kind}</span>`;
      const other = `<span class="rn">${target}</span>`;
      const [src,dst] = dir==='out' ? [me,other] : [other,me];
      html += `<li class="ref-item"><div class="ref-edge">${src}<span class="ra">→</span>${dst}</div>`
            + `<div class="ref-meta">${verb}${via?` · <code>${via}</code>`:''}</div></li>`;
    });
    html += `</ul></div>`;
  }
  if(d.note){ html += `<div class="callout"><b>Заметка.</b> ${d.note}</div>`; }
  side.overview.innerHTML = html;
}

function renderManifest(d){
  if(!d.manifest){
    side.manifest.innerHTML = `<div class="field-detail empty"><div class="fd-empty">Для этого компонента нет манифеста - это физический элемент пути, а не CRD.</div></div>`;
    return;
  }
  side.manifest.innerHTML =
    `<p class="manifest-hint">
       <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>
       Кликните <b style="color:var(--primary)">подчёркнутое поле</b> - пояснение появится ниже.
     </p>
     <pre class="manifest-pre">${d.manifest.yaml}</pre>
     <div class="field-detail empty" id="field-detail"><div class="fd-empty">Поле не выбрано</div></div>`;
}

function openPanel(id){
  const d = PANELS[id];
  if(!d) return;
  currentPanel = d;
  side.kindText.textContent = d.kind;
  side.badge.textContent = d.badge || '';
  side.badge.className = 'side-badge' + ((d.badge||'').includes('Envoy Gateway') ? ' eg' : '');
  side.title.textContent = d.kind;
  side.scope.textContent = d.scope || '';
  renderOverview(d);
  renderManifest(d);
  setPane('overview', d);
  side.empty.style.display = 'none';
  side.content.classList.add('active');
}

function closePanel(){
  side.content.classList.remove('active');
  side.empty.style.display = 'flex';
  document.querySelectorAll('.node.selected').forEach(n=>n.classList.remove('selected'));
  currentPanel = null;
}

function setPane(name, d){
  d = d || currentPanel;
  const hasManifest = d && !!d.manifest;
  side.tabs.forEach(t=>{
    const active = t.dataset.pane===name;
    t.setAttribute('aria-selected', String(active));
    if(t.dataset.pane==='manifest') t.disabled = !hasManifest;
  });
  document.getElementById('pane-overview').classList.toggle('active', name==='overview');
  document.getElementById('pane-manifest').classList.toggle('active', name==='manifest');
}

side.tabs.forEach(t=> t.addEventListener('click', ()=>{ if(!t.disabled) setPane(t.dataset.pane); }));
document.getElementById('side-close').addEventListener('click', closePanel);

/* field-detail: delegated click on interactive YAML keys (.yk) */
side.manifest.addEventListener('click', e=>{
  const yk = e.target.closest('.yk');
  const detail = document.getElementById('field-detail');
  if(!yk || !detail || !currentPanel || !currentPanel.manifest) return;
  const key = yk.dataset.f;
  const info = currentPanel.manifest.fields[key];
  // toggle off if same field clicked again
  if(yk.classList.contains('active')){
    yk.classList.remove('active');
    detail.className = 'field-detail empty';
    detail.innerHTML = `<div class="fd-empty">Поле не выбрано</div>`;
    return;
  }
  side.manifest.querySelectorAll('.yk.active').forEach(x=>x.classList.remove('active'));
  yk.classList.add('active');
  if(!info){
    detail.className = 'field-detail';
    detail.innerHTML = `<div class="fd-inner"><p class="fd-field">${key}</p><div class="fd-block"><p>Нет описания.</p></div></div>`;
    return;
  }
  let html = `<div class="fd-inner"><p class="fd-field">${key}<span class="fd-tag">поле</span></p>`;
  html += `<div class="fd-block"><h4>Назначение</h4><p>${info.purpose}</p></div>`;
  if(info.links && info.links.length){
    html += `<div class="fd-block"><h4>Связи</h4><ul>`;
    info.links.forEach(l=>{ html += `<li><span class="a">·</span><span>${l}</span></li>`; });
    html += `</ul></div>`;
  }
  html += `<div class="fd-block"><h4>Влияние</h4><p>${info.impact}</p></div>`;
  if(info.failure){ html += `<div class="fd-block fd-fail"><h4>Если сломать</h4><p>${info.failure}</p></div>`; }
  html += `</div>`;
  detail.className = 'field-detail';
  detail.innerHTML = html;
});

/* which layer a given node id lives in - for deep-link + chain jumps */
function layerOfNode(id){
  for(const [layer,el] of Object.entries(layerPanels)){
    if(el.querySelector('.node[data-node="'+id+'"]')) return layer;
  }
  return null;
}

/* select a node, updating hash.
   stay:true - do NOT switch layers; open the panel in place (used by the
   filter-chain cards, whose owning node may live in another layer). */
function selectNode(id, {push=true, stay=false}={}){
  const layer = layerOfNode(id);
  if(!stay && layer && currentLayer!==layer) switchLayer(layer, {push:false});
  document.querySelectorAll('.node.selected').forEach(n=>n.classList.remove('selected'));
  // highlight the SVG node only if it's visible in the current layer
  const node = (layerPanels[currentLayer]||document).querySelector('.node[data-node="'+id+'"]');
  if(node) node.classList.add('selected');
  if(!PANELS[id]) return;
  openPanel(id);
  if(push) writeHash(stay ? currentLayer : layer, id);
}

/* ---------------- Node wiring ---------------- */
document.querySelectorAll('.node').forEach(node=>{
  const activate = ()=> selectNode(node.dataset.node);
  node.addEventListener('click', activate);
  node.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); activate(); } });
});
document.addEventListener('keydown', e=>{ if(e.key==='Escape') closePanel(); });

/* ---------------- "Jump to layer" chips (e.g. HTTPRoute policy hint) ---------------- */
/* An element with data-goto="<layer>" switches to that layer on click.
   Delegated so it works for chips injected inside any fetched layer. */
document.addEventListener('click', e=>{
  const chip = e.target.closest('[data-goto]');
  if(!chip) return;
  e.stopPropagation();                 // don't also trigger an enclosing .node
  switchLayer(chip.dataset.goto);
});

/* ---------------- Layer tabs ---------------- */
const tabs = document.querySelectorAll('.tab');
const layerPanels = {
  crd:document.getElementById('panel-crd'),
  traffic:document.getElementById('panel-traffic'),
  policies:document.getElementById('panel-policies'),
  deploy:document.getElementById('panel-deploy'),
};
let currentLayer = 'crd';

const wrapEl = document.querySelector('.wrap');
function switchLayer(layer, {push=true}={}){
  if(!layerPanels[layer]) return;
  currentLayer = layer;
  if(wrapEl) wrapEl.dataset.layer = layer;   // lets CSS react per-layer (e.g. hide color-key on deploy)
  tabs.forEach(t=>t.setAttribute('aria-selected', String(t.dataset.layer===layer)));
  Object.entries(layerPanels).forEach(([k,el])=>el.classList.toggle('active', k===layer));
  closePanel();
  if(layer==='traffic') setStep(currentStep);
  if(push) writeHash(layer, null);
}
tabs.forEach(tab=> tab.addEventListener('click', ()=> switchLayer(tab.dataset.layer)));

/* ---------------- Control-plane band toggle (policies layer) ---------------- */
const cpToggle = document.getElementById('cp-toggle');
const policiesSvg = document.querySelector('#panel-policies svg.diagram');
if(cpToggle && policiesSvg){
  const CP_VIEWBOX = {on:'0 0 1040 600', off:'0 130 1040 470'};
  cpToggle.addEventListener('click', ()=>{
    const on = cpToggle.getAttribute('aria-pressed')!=='true';
    cpToggle.setAttribute('aria-pressed', String(on));
    cpToggle.setAttribute('aria-label', on ? 'Скрыть control plane' : 'Показать control plane');
    cpToggle.querySelector('.cp-toggle-icon').textContent = on ? '-' : '+';
    policiesSvg.classList.toggle('cp-shown', on);
    policiesSvg.setAttribute('viewBox', on ? CP_VIEWBOX.on : CP_VIEWBOX.off);
  });
  // start expanded: control plane band visible (viewBox + cp-shown set in HTML)
  policiesSvg.setAttribute('viewBox', CP_VIEWBOX.on);
}

/* ---------------- Deployment layer: mode toggle ---------------- */
/* One switch drives two blocks: the topology diagram above it (#dp-topo) and the
   mode description card below it (#dp-compare shows only the matching .dp-card). */
const dpTopo = document.getElementById('dp-topo');
const dpCompare = document.getElementById('dp-compare');
const dpModes = document.querySelectorAll('.dp-mode');
if(dpTopo && dpModes.length){
  const COUNTS = { dedicated:{envoy:3,lb:3,ip:3}, merged:{envoy:1,lb:1,ip:1}, listenerset:{envoy:1,lb:1,ip:1} };
  // Top-row source objects differ per mode: dedicated/merged reconcile 3 Gateways;
  // listenerset splits ONE Gateway's listeners across ListenerSets owned by teams.
  const TOP = {
    dedicated:  [['hero-gw',':443'],['api-gw',':443'],['admin-gw',':8443']],
    merged:     [['hero-gw',':443'],['api-gw',':443'],['admin-gw',':8443']],
    listenerset:[['hero-gw','Gateway'],['team-a','ListenerSet'],['team-b','ListenerSet']],
  };
  const dpTop = dpTopo.querySelector('.dp-gws');
  const setMode = (mode)=>{
    dpTopo.dataset.mode = mode;
    if(dpCompare) dpCompare.dataset.mode = mode;
    dpModes.forEach(b=>{
      const on = b.dataset.mode===mode;
      b.classList.toggle('active', on);
      b.setAttribute('aria-selected', String(on));
    });
    const c = COUNTS[mode];
    const set = (sel,v)=>{ const el=dpTopo.querySelector(sel); if(el) el.textContent=v; };
    set('.dp-n-envoy', c.envoy); set('.dp-n-lb', c.lb); set('.dp-n-ip', c.ip);
    if(dpTop){
      const hues = ['var(--c-indigo)','var(--c-teal)','var(--c-violet)'];
      dpTop.querySelectorAll('.dp-gw').forEach((el,i)=>{
        const [name,sub] = TOP[mode][i];
        el.style.setProperty('--g', hues[i]);
        el.innerHTML = `${name}<small>${sub}</small>`;
      });
    }
  };
  dpModes.forEach(b=> b.addEventListener('click', ()=> setMode(b.dataset.mode)));
}

/* ---------------- Filter-chain steps → jump to owning policy ---------------- */
document.querySelectorAll('.chain-step[data-owner]').forEach(step=>{
  step.setAttribute('role','button');
  step.setAttribute('tabindex','0');
  const go = ()=> selectNode(step.dataset.owner, {stay:true});
  step.addEventListener('click', go);
  step.addEventListener('keydown', e=>{ if(e.key==='Enter'||e.key===' '){ e.preventDefault(); go(); } });
});

/* ---------------- Deep-linking via URL hash (#layer/node) ---------------- */
let applyingHash = false;
function writeHash(layer, node){
  if(applyingHash) return;
  const h = '#' + layer + (node ? '/'+node : '');
  if(location.hash !== h) history.replaceState(null, '', h);
}
function applyHash(){
  const m = /^#([a-z]+)(?:\/([\w-]+))?$/.exec(location.hash||'');
  if(!m) return;
  applyingHash = true;
  const [,layer,node] = m;
  if(layerPanels[layer]) switchLayer(layer, {push:false});
  if(node && PANELS[node]) selectNode(node, {push:false});
  applyingHash = false;
}
window.addEventListener('hashchange', applyHash);

/* ---------------- Traffic stepper ---------------- */
/* Forward path length = steps whose dir is 'fwd' (excludes overview + response). */
const FWD_TOTAL = STEPS.filter((s,i)=> i>0 && s.dir!=='rev').length;   // = 4
let currentStep = 0;
const stepDots = document.querySelectorAll('.step-dot[data-step]');
const stepCaption = document.getElementById('step-caption');
const pFill = document.getElementById('p-fill');
const pCount = document.getElementById('p-count');
const trafficSvg = document.querySelector('#panel-traffic svg');
const tlsMarker = document.getElementById('tls-marker');

function setStep(n){
  currentStep = n;
  const s = STEPS[n];
  const rev = s.dir==='rev';
  stepDots.forEach(b=>{
    const bn = Number(b.dataset.step);
    b.setAttribute('aria-pressed', String(bn===n));
    b.classList.toggle('done', bn>0 && bn<n && STEPS[bn] && STEPS[bn].dir!=='rev');
  });
  trafficSvg.querySelectorAll('.node.dp,.edge.data').forEach(el=>el.classList.remove('done','current','reverse'));
  // completed nodes (green)
  s.done.forEach(id=> trafficSvg.querySelectorAll('.node.dp[data-node="'+id+'"]').forEach(nd=>nd.classList.add('done')));
  if(rev){
    // response leg: all forward edges lit amber, backward
    TRAFFIC_EDGES.forEach(id=>{ const e=trafficSvg.querySelector('#'+id); if(e){ e.classList.add('done','reverse'); } });
  } else {
    // completed edges: all edges before the current one
    for(let i=0;i<n-1;i++){ const e=trafficSvg.querySelector('#'+TRAFFIC_EDGES[i]); if(e) e.classList.add('done'); }
    // current edge + node (blue)
    if(s.current){
      const e=trafficSvg.querySelector('#'+s.current.edge); if(e) e.classList.add('current');
      const nd=trafficSvg.querySelector('.node.dp[data-node="'+s.current.node+'"]'); if(nd) nd.classList.add('current');
    }
  }
  // TLS termination marker: visible from step 2 onward, pulse on its own step
  if(tlsMarker){
    tlsMarker.classList.toggle('shown', n>=2);
    tlsMarker.classList.toggle('pulse', !!s.tls);
  }
  const fwdN = Math.min(n, FWD_TOTAL);
  pFill.style.width = (rev ? 100 : (n/FWD_TOTAL*100))+'%';
  pFill.classList.toggle('reverse', rev);
  pCount.textContent = rev ? 'Ответ ↩' : `Шаг ${n} / ${FWD_TOTAL}`;
  stepCaption.innerHTML = s.caption;
}
stepDots.forEach(b=> b.addEventListener('click', ()=> setStep(Number(b.dataset.step))));
document.querySelector('[data-nav="prev"]').addEventListener('click', ()=> setStep((currentStep+STEPS.length-1)%STEPS.length));
document.querySelector('[data-nav="next"]').addEventListener('click', ()=> setStep((currentStep+1)%STEPS.length));

setStep(0);

/* restore layer + node from URL hash on load (e.g. #policies/securitypolicy) */
applyHash();
