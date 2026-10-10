/* ============================================================================
   AGA KHAN ACADEMY · SOP MAINTENANCE APP (offline)
   Screens follow "SOP & Maintenance App Wireframes": PM Overview, Asset Cards,
   Asset Detail and the mobile Record Check form, plus Check Records.
   The live asset register sits in a Power BI dataset that is not part of the
   wireframe file, so the app opens on illustrative demo data (clearly
   labelled) and can import the real register from Excel / CSV.
   Check results, notes and photos are saved on this device and export to Excel.
   ============================================================================ */
(function () {
'use strict';

const $ = s => document.querySelector(s);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const DAY = 86400000;
const DUE_SOON_DAYS = 14;
const PAGE = 10;
const KEY = 'aka-sop-app:v1';

/* ---------------------------------------------------------------- storage */
const mem = {};
function readStore() {
  try { const s = localStorage.getItem(KEY); return s ? JSON.parse(s) : {}; } catch (e) { return mem.store || {}; }
}
function writeStore(obj) {
  // Throws on quota so the caller can keep the form and report a failed save.
  mem.store = obj;
  localStorage.setItem(KEY, JSON.stringify(obj));
}
let store = readStore();
store.records = store.records || [];
store.user = store.user || 'Technician';

/* ---------------------------------------------------------------- dates */
const today0 = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime(); };
const fmtDate = t => t == null ? '—' : new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
const fmtShort = t => t == null ? '—' : new Date(t).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' });
const fmtDT = t => new Date(t).toLocaleString('en-GB', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
function parseDate(v) {
  if (v == null || v === '') return null;
  if (typeof v === 'number') return Math.round((v - 25569) * DAY);          // Excel serial
  if (v instanceof Date) return v.getTime();
  const m = /^(\d{1,2})[\/.-](\d{1,2})[\/.-](\d{2,4})$/.exec(String(v).trim());  // dd/mm/yyyy
  if (m) { const y = +m[3] < 100 ? 2000 + +m[3] : +m[3]; return new Date(y, +m[2] - 1, +m[1]).getTime(); }
  const t = Date.parse(v);
  return isNaN(t) ? null : t;
}

/* ============================================================================
   SOP TEMPLATES — what each system's operator checks, PPM tasks, limits and
   standards look like. Used for demo assets and for imported assets that do
   not list their own.
   ============================================================================ */
const SYSTEMS = {
  'HVAC': {
    role: 'HVAC technician', freq: 30, crit: ['High', 'Medium'],
    names: ['Air handling unit', 'Chiller', 'Cooling tower', 'Fan coil unit', 'VRF outdoor unit', 'Exhaust fan', 'Split AC unit', 'Fresh air unit'],
    checks: ['Unit running without abnormal noise or vibration', 'Filter differential pressure within the marked band', 'Drain pan clear and condensate draining', 'Supply air temperature displayed within set range'],
    tasks: [['Clean or replace air filters', 30], ['Check belt tension and alignment', 90], ['Clean coils and drain pan', 90], ['Inspect electrical connections and motor current', 180]],
    limits: [['Supply air temperature', 12, 16, '°C'], ['Filter differential pressure', 50, 250, 'Pa'], ['Motor current (vs nameplate)', null, 100, '%']],
    standards: ['ASHRAE 180: inspection and maintenance of HVAC systems', 'ASHRAE 62.1: ventilation for acceptable indoor air quality', 'OEM operation and maintenance manual']
  },
  'Fire safety': {
    role: 'Fire & safety officer', freq: 30, crit: ['High'],
    names: ['Fire pump', 'Jockey pump', 'Fire alarm panel', 'Sprinkler control valve set', 'Fire extinguisher set', 'Hydrant system', 'Smoke detector loop'],
    checks: ['Panel shows normal; no fault or isolation indicated', 'Pressure gauge reading within the marked range', 'Valves in their correct open / locked position', 'Access clear and signage in place'],
    tasks: [['Weekly churn test (fire pump)', 7], ['Inspect and tag extinguishers', 30], ['Test alarm devices by zone', 90], ['Annual flow test', 365]],
    limits: [['System pressure', 7, 10, 'bar'], ['Jockey pump cut-in pressure', 6.5, 8, 'bar']],
    standards: ['NFPA 25: inspection, testing and maintenance of water-based fire protection', 'IS 2190: selection, installation and maintenance of portable extinguishers', 'National Building Code of India, Part 4: fire and life safety']
  },
  'Electrical': {
    role: 'Electrical supervisor', freq: 30, crit: ['High', 'Medium'],
    names: ['Main generator', 'HT transformer', 'Main LT panel', 'UPS system', 'Capacitor bank', 'Distribution board', 'Street light feeder'],
    checks: ['No alarms on the controller or protection relays', 'Indicating meters read normal voltage and load', 'No overheating, burning smell or discoloration', 'Earthing connections intact and labelled'],
    tasks: [['Run generator on load', 7], ['Thermal scan of panels', 180], ['Tighten terminations and clean busbars', 180], ['Insulation resistance test', 365]],
    limits: [['Output voltage (L-L)', 400, 440, 'V'], ['Power factor', 0.95, 1, ''], ['Transformer oil temperature', null, 85, '°C']],
    standards: ['CEA (Measures relating to Safety and Electric Supply) Regulations, 2023', 'IS 732: code of practice for electrical wiring installations', 'OEM operation and maintenance manual']
  },
  'Plumbing': {
    role: 'Plumber', freq: 30, crit: ['Medium', 'Low'],
    names: ['Water booster pump', 'Hydro-pneumatic system', 'Overhead tank', 'Hot water geyser bank', 'Sump transfer pump'],
    checks: ['Pump running smoothly; no leaks at seals', 'Delivery pressure within the marked range', 'Tank level and float control working', 'No leaks or damp at visible joints'],
    tasks: [['Inspect pump seals and bearings', 30], ['Clean strainers', 90], ['Clean and disinfect tanks', 180]],
    limits: [['Delivery pressure', 2.5, 4.5, 'bar'], ['Motor current (vs nameplate)', null, 100, '%']],
    standards: ['National Building Code of India, Part 9: plumbing services', 'OEM operation and maintenance manual']
  },
  'Water treatment': {
    role: 'WTP / STP operator', freq: 30, crit: ['High', 'Medium'],
    names: ['WTP softener', 'RO plant', 'STP blower', 'STP clarifier', 'Borewell pump', 'Chlorine dosing unit'],
    checks: ['Plant running in auto with no alarms', 'Treated water clear; no odour', 'Chemical / salt stock above minimum level', 'Flow meter reading logged'],
    tasks: [['Regenerate softener and check hardness', 7], ['Backwash filters', 7], ['Lab test of treated water', 30], ['Service blowers and diffusers', 180]],
    limits: [['Treated water pH', 6.5, 8.5, ''], ['Total dissolved solids', null, 500, 'mg/L'], ['Treated water hardness', null, 200, 'mg/L']],
    standards: ['IS 10500: drinking water specification', 'CPCB discharge standards for sewage treatment plants', 'OEM operation and maintenance manual']
  },
  'Lifts': {
    role: 'Lift AMC vendor', freq: 30, crit: ['High'],
    names: ['Passenger lift', 'Service lift'],
    checks: ['Car levels correctly at each floor', 'Doors open and close smoothly; safety edge works', 'Alarm bell and intercom working', 'Car light and fan working'],
    tasks: [['Monthly preventive service', 30], ['Rope and brake inspection', 180], ['Annual safety inspection', 365]],
    limits: [['Levelling accuracy', null, 10, 'mm']],
    standards: ['IS 14665: electric traction lifts', 'State lift rules and annual inspection licence']
  },
  'Kitchen': {
    role: 'Kitchen supervisor', freq: 30, crit: ['Medium', 'Low'],
    names: ['Kitchen exhaust hood', 'Cold room', 'Dishwasher', 'LPG manifold'],
    checks: ['Equipment clean and operating normally', 'Temperature display within range', 'No gas smell; valves closed after use'],
    tasks: [['Degrease exhaust hood and filters', 30], ['Service refrigeration unit', 90], ['LPG line leak test', 90]],
    limits: [['Cold room temperature', 0, 5, '°C']],
    standards: ['FSSAI Schedule 4: food hygiene and sanitation', 'OEM operation and maintenance manual']
  },
  'Solar': {
    role: 'Solar technician', freq: 30, crit: ['Medium'],
    names: ['Solar inverter', 'Solar array string box'],
    checks: ['Inverter shows no fault codes', 'Generation logged for the day', 'Panels free of heavy dust or shading'],
    tasks: [['Clean panels', 15], ['Check string voltages and fuses', 90], ['Thermal scan of connections', 180]],
    limits: [['Inverter efficiency', 95, null, '%']],
    standards: ['IEC 62446-1: PV system testing and documentation', 'OEM operation and maintenance manual']
  },
  'Pool': {
    role: 'Pool operator', freq: 30, crit: ['Medium'],
    names: ['Pool filtration pump', 'Pool dosing unit'],
    checks: ['Pump and filter running; pressure normal', 'Water clear; free chlorine tested', 'Dosing tank above minimum level'],
    tasks: [['Backwash filter', 7], ['Calibrate dosing probes', 30], ['Service pump and seals', 180]],
    limits: [['Free chlorine', 1, 3, 'mg/L'], ['pH', 7.2, 7.8, '']],
    standards: ['FINA / World Aquatics facilities rules (water quality)', 'OEM operation and maintenance manual']
  }
};
const SYS_LOC = {
  'HVAC': ['Academy Building', 'Commons', 'Junior School', 'Senior School 1 & 3', 'Senior School 2', 'Athletic Centre', 'Nursery', 'SR-9/10', 'SR-11/12'],
  'Fire safety': ['Pump House', 'Academy Building', 'Commons', 'Junior School', 'Senior School 2', 'SR-1', 'SR-3'],
  'Electrical': ['Substation', 'Academy Building', 'Commons', 'Pump House', 'Athletic Centre', 'SR-9/10'],
  'Plumbing': ['Pump House', 'SR-1', 'SR-2', 'SR-3', 'SR-4', 'Laundry', 'Commons'],
  'Water treatment': ['WTP / STP', 'Pump House'],
  'Lifts': ['Academy Building', 'Commons', 'Senior School 2', 'SR-9/10'],
  'Kitchen': ['Commons'],
  'Solar': ['Academy Building', 'Commons', 'Athletic Centre', 'Substation'],
  'Pool': ['Swimming Pool']
};
const LOCATIONS = ['Academy Building', 'Commons', 'Junior School', 'Senior School 1 & 3', 'Senior School 2', 'Athletic Centre', 'Swimming Pool', 'SR-1', 'SR-2', 'SR-3', 'SR-4', 'SR-9/10', 'SR-11/12', 'PCM', 'Nursery', 'Laundry', 'Substation', 'Pump House', 'WTP / STP'];

/* ----------------------------------------------------- demo asset register */
function rng(seed) { return function () { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; }; }
function demoAssets() {
  const r = rng(20261010);
  const pick = a => a[Math.floor(r() * a.length)];
  const T = today0();
  // Counts match the wireframe: 120 assets, 12 overdue, 8 due soon, 92 PM OK, 8 not checked.
  const pool = [].concat(Array(11).fill('overdue'), Array(7).fill('due'), Array(91).fill('ok'), Array(7).fill('nc'));
  for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; }
  const fixed = [
    ['Air handling unit', 'HVAC', 'overdue', -3], ['Fire pump', 'Fire safety', 'due', 3],
    ['Main generator', 'Electrical', 'ok', 18], ['Water booster pump', 'Plumbing', 'nc', null]
  ];
  const sysNames = Object.keys(SYSTEMS);
  const weights = { 'HVAC': 30, 'Fire safety': 20, 'Electrical': 20, 'Plumbing': 12, 'Water treatment': 14, 'Lifts': 6, 'Kitchen': 6, 'Solar': 6, 'Pool': 4 };
  const bag = []; sysNames.forEach(s => { for (let i = 0; i < weights[s]; i++) bag.push(s); });
  const counter = {};
  const out = [];
  for (let i = 0; i < 120; i++) {
    let name, sys, status, off;
    if (i < 4) [name, sys, status, off] = fixed[i];
    else { sys = pick(bag); name = pick(SYSTEMS[sys].names); status = pool[i - 4]; }
    const S0 = SYSTEMS[sys];
    counter[name] = (counter[name] || 0) + 1;
    const freq = S0.freq;
    if (off == null && status !== 'nc') off = status === 'overdue' ? -(1 + Math.floor(r() * 25)) : status === 'due' ? Math.floor(r() * (DUE_SOON_DAYS + 1)) : DUE_SOON_DAYS + 1 + Math.floor(r() * (freq - DUE_SOON_DAYS));
    const next = status === 'nc' ? null : T + off * DAY;
    out.push({
      id: 'AST-' + String(i + 1).padStart(3, '0'),
      name: i < 4 ? name : name + (counter[name] > 1 ? ' ' + counter[name] : ''),
      system: sys, location: i < 4 ? ['Academy Building', 'Pump House', 'Substation', 'Pump House'][i] : pick(SYS_LOC[sys] || LOCATIONS), criticality: pick(S0.crit), responsible: S0.role, freq: freq,
      lastCheck: next == null ? null : next - freq * DAY, lastType: next == null ? null : 'Operator check',
      nextDue: next
    });
  }
  return out;
}

/* ------------------------------------------------- asset list (demo or import) */
let assets = [];
let source = { kind: 'demo', label: 'Demo data' };
function loadAssets() {
  if (store.imported && Array.isArray(store.imported.assets) && store.imported.assets.length) {
    assets = store.imported.assets;
    source = { kind: 'import', label: 'Imported · ' + store.imported.fileName };
  } else {
    assets = demoAssets();
    source = { kind: 'demo', label: 'Demo data' };
  }
  applyRecords();
  $('#dataLabel').textContent = source.label;
  $('#dataPill').classList.toggle('live', source.kind === 'import');
  $('#dataPill').title = source.kind === 'demo' ? 'Illustrative assets for trying the app. Import your asset register under Data.' : 'Assets imported from ' + store.imported.fileName;
}
const sop = a => {
  const t = SYSTEMS[a.system] || SYSTEMS['Plumbing'];
  return {
    checks: a.checks && a.checks.length ? a.checks : t.checks,
    tasks: a.tasks && a.tasks.length ? a.tasks : t.tasks,
    limits: a.limits && a.limits.length ? a.limits : t.limits,
    standards: a.standards && a.standards.length ? a.standards : t.standards
  };
};
/** Saved checks move an asset's last check and, if nothing failed, its next PM date. */
function applyRecords() {
  const byId = {};
  assets.forEach(a => { a._last = a.lastCheck; a._lastType = a.lastType; a._next = a.nextDue; a._lastResult = null; byId[a.id] = a; });
  store.records.slice().sort((x, y) => x.at - y.at).forEach(rec => {
    const a = byId[rec.assetId];
    if (!a) return;
    const failed = rec.results.some(x => x.result === 'Fail');
    const d = new Date(rec.at); d.setHours(0, 0, 0, 0);
    a._last = rec.at; a._lastType = 'Operator check' + (failed ? ' · failed' : '');
    a._lastResult = failed ? 'fail' : 'pass';
    if (!failed) a._next = d.getTime() + (a.freq || 30) * DAY;
  });
}
function status(a) {
  if (a._last == null && a._next == null) return 'nc';
  if (a._next == null) return 'ok';
  const days = Math.round((a._next - today0()) / DAY);
  if (days < 0) return 'overdue';
  if (days <= DUE_SOON_DAYS) return 'due';
  return 'ok';
}
const STATUS = { overdue: ['Overdue', 's-overdue'], due: ['Due soon', 's-due'], ok: ['PM OK', 's-ok'], nc: ['Not checked', 's-nc'] };
const chip = s => '<span class="chip ' + STATUS[s][1] + '">' + STATUS[s][0] + '</span>';
const daysTo = a => a._next == null ? null : Math.round((a._next - today0()) / DAY);

/* ---------------------------------------------------------------- UI state */
const ui = { system: '', crit: '', q: '', status: '', page: 0, sort: 'next', dir: 1, tab: 'checks', current: null };
function filtered(ignoreStatus) {
  const q = ui.q.trim().toLowerCase();
  return assets.filter(a =>
    (!ui.system || a.system === ui.system) &&
    (!ui.crit || a.criticality === ui.crit) &&
    (!q || (a.id + ' ' + a.name + ' ' + a.location + ' ' + a.system).toLowerCase().indexOf(q) >= 0) &&
    (ignoreStatus || !ui.status || status(a) === ui.status));
}
function sorted(list) {
  const k = ui.sort, d = ui.dir;
  const val = a => k === 'next' ? (a._next == null ? Infinity : a._next) : k === 'status' ? ['overdue', 'due', 'nc', 'ok'].indexOf(status(a)) : String(a[k] || '').toLowerCase();
  return list.slice().sort((x, y) => { const a = val(x), b = val(y); return (a < b ? -1 : a > b ? 1 : 0) * d; });
}

/* ---------------------------------------------------------------- shared bits */
const ICON = {
  warn: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 3 22 20H2z"/><path d="M12 10v4M12 17h.01"/></svg>',
  ok: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  back: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2"><path d="M15 6l-6 6 6 6"/></svg>',
  cam: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/></svg>',
  dl: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 4v11M7 10l5 5 5-5M5 20h14"/></svg>',
  up: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20V9M7 14l5-5 5 5M5 4h14"/></svg>'
};
function filtersHtml() {
  const sys = Array.from(new Set(assets.map(a => a.system))).sort();
  const crit = Array.from(new Set(assets.map(a => a.criticality).filter(Boolean)));
  const order = ['High', 'Medium', 'Low']; crit.sort((a, b) => order.indexOf(a) - order.indexOf(b));
  return '<div class="filters">' +
    '<div class="field"><label for="fSys">System</label><select id="fSys"><option value="">All</option>' + sys.map(s => '<option' + (s === ui.system ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label for="fCrit">Criticality</label><select id="fCrit"><option value="">All</option>' + crit.map(s => '<option' + (s === ui.crit ? ' selected' : '') + '>' + esc(s) + '</option>').join('') + '</select></div>' +
    '<div class="field"><label for="fQ">Search asset</label><input id="fQ" type="search" placeholder="ID, name or location" value="' + esc(ui.q) + '"></div></div>';
}
function bindFilters(rerender) {
  $('#fSys').addEventListener('change', e => { ui.system = e.target.value; ui.page = 0; rerender(); });
  $('#fCrit').addEventListener('change', e => { ui.crit = e.target.value; ui.page = 0; rerender(); });
  let t;
  $('#fQ').addEventListener('input', e => { clearTimeout(t); t = setTimeout(() => { ui.q = e.target.value; ui.page = 0; rerender(true); }, 160); });
}
function toast(msg) { const t = $('#toast'); t.textContent = msg; t.hidden = false; clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3200); }
function setNav(id) { document.querySelectorAll('.rail a').forEach(a => a.setAttribute('aria-current', a.dataset.nav === id ? 'page' : 'false')); }
const main = $('#main');

/* ============================================================================
   01 · PM OVERVIEW
   ============================================================================ */
function viewOverview(keepFocus) {
  setNav('overview');
  const base = filtered(true);
  const c = { overdue: 0, due: 0, ok: 0, nc: 0 };
  base.forEach(a => { c[status(a)]++; });
  const total = base.length;
  const comp = total ? c.ok / total : 0;
  const list = sorted(filtered(false));
  const pages = Math.max(1, Math.ceil(list.length / PAGE));
  ui.page = Math.min(ui.page, pages - 1);
  const rows = list.slice(ui.page * PAGE, ui.page * PAGE + PAGE);
  const attention = c.overdue + c.due;
  const stat = (key, cls, v, k, filt) => '<button class="stat ' + cls + '" data-status="' + filt + '" aria-pressed="' + (ui.status === filt && filt !== '') + '"><span class="v">' + v + '</span><span class="k">' + k + '</span></button>';
  const th = (k, label) => '<th><button data-sort="' + k + '">' + label + (ui.sort === k ? (ui.dir > 0 ? ' ▲' : ' ▼') : '') + '</button></th>';
  const focusId = keepFocus && document.activeElement && document.activeElement.id;
  main.innerHTML = '<section class="view">' +
    '<div class="view-head"><div><div class="eyebrow">PM Overview</div><h1>Preventive maintenance</h1><p class="sub">Status of every asset against its PM schedule. ' + (source.kind === 'demo' ? 'Showing illustrative demo assets.' : '') + '</p></div></div>' +
    filtersHtml() +
    '<div class="stats">' +
      stat('total', 'c-total', total, 'Total assets', '') +
      stat('overdue', 'c-overdue', c.overdue, 'Overdue', 'overdue') +
      stat('due', 'c-due', c.due, 'Due soon', 'due') +
      stat('ok', 'c-ok', c.ok, 'PM OK', 'ok') +
      stat('nc', 'c-nc', c.nc, 'Not checked', 'nc') +
      '<div class="stat c-comp"><span class="v">' + (comp * 100).toFixed(1) + '%</span><span class="k">Compliance</span></div>' +
    '</div>' +
    (attention ? '<div class="banner">' + ICON.warn + '<span><b>' + attention + ' asset' + (attention === 1 ? ' needs' : 's need') + ' attention.</b> Select a status card to filter.</span></div>'
      : '<div class="banner ok">' + ICON.ok + '<span><b>No assets overdue or due soon</b> for this selection.</span></div>') +
    '<div class="card"><header><h2>PM status by asset' + (ui.status ? ' · ' + STATUS[ui.status][0] : '') + '</h2>' + (ui.status ? '<button class="btn" id="clearStatus">Show all statuses</button>' : '') + '</header>' +
    (rows.length ? '<div class="tw"><table><thead><tr>' + th('id', 'Asset ID') + th('name', 'Asset name') + th('system', 'System') + th('status', 'PM status') + th('next', 'Next due') + '<th class="go">Open</th></tr></thead><tbody>' +
      rows.map(a => '<tr data-id="' + esc(a.id) + '" tabindex="0"><td class="id">' + esc(a.id) + '</td><td>' + esc(a.name) + '</td><td>' + esc(a.system) + '</td><td>' + chip(status(a)) + '</td><td class="num">' + (a._next == null ? 'Check required' : fmtShort(a._next)) + '</td><td class="go">→</td></tr>').join('') +
      '</tbody></table></div>' +
      '<div class="pager"><span>' + (ui.page * PAGE + 1) + '–' + (ui.page * PAGE + rows.length) + ' of ' + list.length + ' · Sort by ' + ({ next: 'next due', id: 'asset ID', name: 'asset name', system: 'system', status: 'PM status' })[ui.sort] + '</span>' +
      '<span class="btns"><button class="btn" id="prev"' + (ui.page === 0 ? ' disabled' : '') + '>‹ Previous</button><button class="btn" id="next"' + (ui.page >= pages - 1 ? ' disabled' : '') + '>Next ›</button></span></div>'
      : '<div class="empty"><b>No matching assets</b><span>Change the system, criticality or search, or clear the status filter.</span><button class="btn" id="resetF">Clear filters</button></div>') +
    '</div></section>';
  bindFilters(viewOverview);
  if (focusId && $('#' + focusId)) { const el = $('#' + focusId); el.focus(); if (el.setSelectionRange) el.setSelectionRange(el.value.length, el.value.length); }
  main.querySelectorAll('button.stat').forEach(b => b.addEventListener('click', () => { const s = b.dataset.status; ui.status = ui.status === s ? '' : s; ui.page = 0; viewOverview(); }));
  main.querySelectorAll('[data-sort]').forEach(b => b.addEventListener('click', () => { const k = b.dataset.sort; if (ui.sort === k) ui.dir = -ui.dir; else { ui.sort = k; ui.dir = 1; } viewOverview(); }));
  main.querySelectorAll('tbody tr').forEach(tr => {
    tr.addEventListener('click', () => { location.hash = 'asset/' + tr.dataset.id; });
    tr.addEventListener('keydown', e => { if (e.key === 'Enter') location.hash = 'asset/' + tr.dataset.id; });
  });
  const on = (id, fn) => { const el = $('#' + id); if (el) el.addEventListener('click', fn); };
  on('prev', () => { ui.page--; viewOverview(); });
  on('next', () => { ui.page++; viewOverview(); });
  on('clearStatus', () => { ui.status = ''; viewOverview(); });
  on('resetF', () => { Object.assign(ui, { system: '', crit: '', q: '', status: '', page: 0 }); viewOverview(); });
}

/* ============================================================================
   02 · ASSET CARDS
   ============================================================================ */
function viewCards(keepFocus) {
  setNav('cards');
  const list = sorted(filtered(false));
  const focusId = keepFocus && document.activeElement && document.activeElement.id;
  const shown = list.slice(0, 60 + ui.page * 60);
  main.innerHTML = '<section class="view">' +
    '<div class="view-head"><div><div class="eyebrow">Asset Cards</div><h1>Asset directory</h1><p class="sub">' + list.length + ' asset' + (list.length === 1 ? '' : 's') + (ui.status ? ' · ' + STATUS[ui.status][0] : '') + ' · grid view</p></div>' + (ui.status ? '<button class="btn" id="clearStatus">Show all statuses</button>' : '') + '</div>' +
    filtersHtml() +
    (list.length ? '<div class="grid">' + shown.map(a => '<article class="acard"><div class="sys">' + esc(a.system) + ' · ' + esc(a.id) + '</div><h3>' + esc(a.name) + '</h3>' +
      '<div class="meta">Location: ' + esc(a.location || '—') + '<br>Criticality: ' + esc(a.criticality || '—') + '<br>Next PM: ' + (a._next == null ? 'check required' : fmtDate(a._next)) + '</div>' +
      '<div class="row">' + chip(status(a)) + '<a class="btn" href="#asset/' + encodeURIComponent(a.id) + '">View asset →</a></div></article>').join('') + '</div>' +
      (shown.length < list.length ? '<div style="text-align:center"><button class="btn" id="more">Show more (' + (list.length - shown.length) + ' left)</button></div>' : '')
      : '<div class="card"><div class="empty"><b>No matching assets</b><span>Change the filters or search.</span><button class="btn" id="resetF">Clear filters</button></div></div>') +
    '</section>';
  bindFilters(viewCards);
  if (focusId && $('#' + focusId)) { const el = $('#' + focusId); el.focus(); if (el.setSelectionRange) el.setSelectionRange(el.value.length, el.value.length); }
  const on = (id, fn) => { const el = $('#' + id); if (el) el.addEventListener('click', fn); };
  on('more', () => { ui.page++; viewCards(); });
  on('clearStatus', () => { ui.status = ''; viewCards(); });
  on('resetF', () => { Object.assign(ui, { system: '', crit: '', q: '', status: '', page: 0 }); viewCards(); });
}

/* ============================================================================
   03 · ASSET DETAIL
   ============================================================================ */
function viewAsset(id) {
  setNav('asset');
  const a = assets.find(x => x.id === id) || assets.find(x => x.id === ui.current) || assets[0];
  if (!a) { main.innerHTML = '<section class="view"><div class="card"><div class="empty"><b>No assets loaded</b><span>Import an asset register under Data.</span></div></div></section>'; return; }
  ui.current = a.id;
  const s = status(a), S0 = sop(a), dt = daysTo(a);
  const recs = store.records.filter(r => r.assetId === a.id).sort((x, y) => y.at - x.at);
  const last = recs[0];
  const tabs = [['checks', 'Operator Checks'], ['tasks', 'PPM Tasks'], ['limits', 'Limits'], ['standards', 'Standards']];
  let body = '';
  if (ui.tab === 'checks') {
    body = '<header><h2>Operator checks</h2><span class="note">Read the asset SOP before starting</span></header><ul class="checklist">' +
      S0.checks.map(c => { const res = last && (last.results.find(r => r.check === c) || {}).result; const cls = res === 'Pass' ? 'pass' : res === 'Fail' ? 'fail' : ''; return '<li><span class="box ' + cls + '" aria-hidden="true">' + (res === 'Pass' ? '✓' : res === 'Fail' ? '✕' : res === 'N/A' ? '–' : '') + '</span><span>' + esc(c) + (res ? '<br><span class="note">Last result: ' + esc(res) + ' · ' + fmtDate(last.at) + '</span>' : '') + '</span></li>'; }).join('') +
      '</ul><div class="actions"><a class="btn primary" href="#check/' + encodeURIComponent(a.id) + '">Record check →</a><span class="note">Opens the check form. Results are saved on this device.</span></div>';
  } else if (ui.tab === 'tasks') {
    body = '<header><h2>PPM tasks</h2><span class="note">Planned preventive maintenance</span></header><div class="tw"><table><thead><tr><th>Task</th><th>Frequency</th></tr></thead><tbody>' +
      S0.tasks.map(t => '<tr style="cursor:default"><td>' + esc(t[0]) + '</td><td class="num">' + freqLabel(t[1]) + '</td></tr>').join('') + '</tbody></table></div>';
  } else if (ui.tab === 'limits') {
    body = '<header><h2>Operating limits</h2><span class="note">Readings outside these need action</span></header><div class="tw"><table><thead><tr><th>Parameter</th><th>Min</th><th>Max</th><th>Unit</th></tr></thead><tbody>' +
      S0.limits.map(l => '<tr style="cursor:default"><td>' + esc(l[0]) + '</td><td class="num">' + (l[1] == null || l[1] === '' ? '—' : esc(l[1])) + '</td><td class="num">' + (l[2] == null || l[2] === '' ? '—' : esc(l[2])) + '</td><td>' + esc(l[3] || '') + '</td></tr>').join('') + '</tbody></table></div>';
  } else {
    body = '<header><h2>Standards and references</h2></header><ul class="checklist">' + S0.standards.map(x => '<li><span class="box" aria-hidden="true">§</span><span>' + esc(x) + '</span></li>').join('') + '</ul>';
  }
  main.innerHTML = '<section class="view">' +
    '<a class="back" href="#cards">' + ICON.back + 'Back to directory</a>' +
    '<div class="view-head"><div><div class="eyebrow">Asset Detail</div><h1>' + esc(a.id) + ' · ' + esc(a.name) + '</h1></div>' +
      '<div class="field" style="min-width:200px"><label for="pick">Asset ID</label><select id="pick">' + assets.map(x => '<option value="' + esc(x.id) + '"' + (x.id === a.id ? ' selected' : '') + '>' + esc(x.id) + ' · ' + esc(x.name) + '</option>').join('') + '</select></div></div>' +
    '<div class="card summary"><div style="display:flex;flex-wrap:wrap;gap:8px 16px;align-items:center"><b>' + esc(a.system) + '</b><span>Criticality: <b>' + esc(a.criticality || '—') + '</b></span><span>PM status: ' + chip(s) + '</span>' + (a._lastResult === 'fail' ? '<span class="chip s-overdue">Last check failed</span>' : '') + '</div>' +
      '<dl class="kv"><div><dt>Location</dt><dd>' + esc(a.location || '—') + '</dd></div><div><dt>Responsible</dt><dd>' + esc(a.responsible || '—') + '</dd></div>' +
      '<div><dt>Last check</dt><dd>' + (a._last == null ? 'None recorded' : fmtDate(a._last) + '<br><span class="note">' + esc(a._lastType || '') + '</span>') + '</dd></div>' +
      '<div><dt>Next PM</dt><dd>' + (a._next == null ? 'Check required' : fmtDate(a._next)) + '</dd></div>' +
      '<div><dt>Days to PM</dt><dd class="num" style="color:' + (dt == null ? 'var(--ink-2)' : dt < 0 ? 'var(--red)' : dt <= DUE_SOON_DAYS ? 'var(--orange)' : 'var(--green)') + '">' + (dt == null ? '—' : dt < 0 ? Math.abs(dt) + ' overdue' : dt) + '</dd></div>' +
      '<div><dt>PM frequency</dt><dd>' + freqLabel(a.freq || 30) + '</dd></div></dl></div>' +
    '<div class="tabs" role="tablist">' + tabs.map(t => '<button role="tab" data-tab="' + t[0] + '" aria-selected="' + (ui.tab === t[0]) + '">' + t[1] + '</button>').join('') + '</div>' +
    '<div class="card">' + body + '</div>' +
    '<div class="card"><header><h2>Check history</h2><span class="note">' + recs.length + ' on this device</span></header>' +
      (recs.length ? '<div class="hist">' + recs.slice(0, 10).map(histRow).join('') + '</div>' : '<div class="empty"><span>No checks recorded on this device yet.</span></div>') + '</div>' +
    '</section>';
  $('#pick').addEventListener('change', e => { location.hash = 'asset/' + e.target.value; });
  main.querySelectorAll('[data-tab]').forEach(b => b.addEventListener('click', () => { ui.tab = b.dataset.tab; viewAsset(a.id); }));
}
function freqLabel(d) { d = +d; return d === 7 ? 'Weekly' : d === 15 ? 'Fortnightly' : d === 30 ? 'Monthly' : d === 90 ? 'Quarterly' : d === 180 ? 'Half-yearly' : d === 365 ? 'Yearly' : 'Every ' + d + ' days'; }
function histRow(r) {
  const fails = r.results.filter(x => x.result === 'Fail').length;
  return '<div class="h">' + (r.photo ? '<img src="' + r.photo + '" alt="Check photo">' : '<span></span>') +
    '<span><b>' + fmtDT(r.at) + '</b> · ' + esc(r.user) + '<br><span class="note">' + r.results.length + ' checks · ' + (fails ? fails + ' failed' : 'all passed or N/A') + (r.notes ? ' · ' + esc(r.notes) : '') + '</span></span>' +
    '<span class="chip ' + (fails ? 's-overdue' : 's-ok') + '">' + (fails ? 'Fail' : 'Pass') + '</span></div>';
}

/* ============================================================================
   04 · RECORD OPERATOR CHECK (mobile form)
   ============================================================================ */
const draft = {};   // kept across failed saves and navigation
function viewCheck(id) {
  setNav('asset');
  const a = assets.find(x => x.id === id);
  if (!a) { location.hash = 'cards'; return; }
  const S0 = sop(a);
  const d = draft[a.id] = draft[a.id] || { results: {}, notes: '', photo: null };
  main.innerHTML = '<section class="view"><div class="checkform">' +
    '<a class="back" href="#asset/' + encodeURIComponent(a.id) + '">' + ICON.back + 'Asset detail</a>' +
    '<div><div class="eyebrow">Field maintenance</div><h1 style="font-size:26px">Record operator check</h1><p class="sub">' + esc(a.id) + ' · ' + esc(a.name) + ' · ' + esc(a.location || '') + '</p></div>' +
    '<form id="cf" novalidate>' +
    S0.checks.map((c, i) => '<fieldset class="q" id="q' + i + '" style="margin:0 0 12px"><legend style="padding:0"><h3>Check ' + (i + 1) + ': ' + esc(c) + '</h3></legend><div class="seg">' +
      ['Pass', 'Fail', 'N/A'].map(v => { const iid = 'c' + i + '-' + v.replace('/', ''); return '<input type="radio" name="c' + i + '" id="' + iid + '" value="' + v + '"' + (d.results[i] === v ? ' checked' : '') + '><label for="' + iid + '">' + v + '</label>'; }).join('') +
      '</div></fieldset>').join('') +
    '<div class="field" style="margin-bottom:12px"><label for="notes">Notes / observations <span id="noteReq" class="err-msg" hidden>(required when a check fails)</span></label><textarea id="notes" placeholder="What you saw, readings taken, follow-up needed">' + esc(d.notes) + '</textarea></div>' +
    '<div class="photo" style="margin-bottom:14px"><label class="btn file-btn">' + ICON.cam + '<span>' + (d.photo ? 'Replace photo' : 'Attach photo') + '</span><input type="file" id="photo" accept="image/*" capture="environment"></label>' + (d.photo ? '<img src="' + d.photo + '" alt="Attached photo"><button type="button" class="btn" id="rmPhoto">Remove</button>' : '<span class="note">Optional</span>') + '</div>' +
    '<div id="formErr" class="err-msg" role="alert" style="margin-bottom:10px" hidden></div>' +
    '<button class="btn primary" type="submit" style="width:100%;min-height:52px;font-size:16px">Submit check →</button>' +
    '<p class="note" style="text-align:center;margin-top:10px">Saved by ' + esc(store.user) + ' on this device. Export records under Data.</p>' +
    '</form></div></section>';
  const form = $('#cf');
  form.addEventListener('change', e => {
    const m = /^c(\d+)$/.exec(e.target.name || '');
    if (m) { d.results[+m[1]] = e.target.value; $('#q' + m[1]).classList.remove('err'); updateNoteReq(); }
  });
  $('#notes').addEventListener('input', e => { d.notes = e.target.value; });
  function updateNoteReq() { $('#noteReq').hidden = !Object.values(d.results).includes('Fail'); }
  updateNoteReq();
  $('#photo').addEventListener('change', e => {
    const f = e.target.files && e.target.files[0];
    if (!f) return;
    shrinkImage(f, 960).then(url => { d.photo = url; viewCheck(a.id); }).catch(() => toast('That photo could not be read. Try another image.'));
  });
  const rm = $('#rmPhoto'); if (rm) rm.addEventListener('click', () => { d.photo = null; viewCheck(a.id); });
  form.addEventListener('submit', e => {
    e.preventDefault();
    const missing = S0.checks.map((_, i) => i).filter(i => !d.results[i]);
    missing.forEach(i => $('#q' + i).classList.add('err'));
    const failed = Object.values(d.results).includes('Fail');
    const err = $('#formErr');
    if (missing.length) { err.textContent = 'Answer every check before submitting (' + missing.length + ' left).'; err.hidden = false; $('#q' + missing[0]).scrollIntoView({ behavior: 'smooth', block: 'center' }); return; }
    if (failed && !d.notes.trim()) { err.textContent = 'Add a note describing the failed check.'; err.hidden = false; $('#notes').focus(); return; }
    const rec = { id: 'R' + Date.now().toString(36), assetId: a.id, assetName: a.name, system: a.system, at: Date.now(), user: store.user,
      results: S0.checks.map((c, i) => ({ check: c, result: d.results[i] })), notes: d.notes.trim(), photo: d.photo };
    store.records.push(rec);
    try { writeStore(store); }
    catch (ex) {
      store.records.pop();
      // Retry without the photo before giving up; the form keeps everything either way.
      if (rec.photo) {
        const lite = Object.assign({}, rec, { photo: null });
        store.records.push(lite);
        try { writeStore(store); finishSave(a, lite, true); return; } catch (ex2) { store.records.pop(); }
      }
      err.textContent = 'Could not save on this device (storage is full or blocked). Your answers are kept. Export and clear old records under Data, then submit again.';
      err.hidden = false;
      return;
    }
    finishSave(a, rec, false);
  });
}
function finishSave(a, rec, droppedPhoto) {
  delete draft[a.id];
  applyRecords();
  const failed = rec.results.some(x => x.result === 'Fail');
  main.innerHTML = '<section class="view"><div class="checkform"><div class="card done">' +
    '<span class="tick">' + ICON.ok + '</span><h2>Check saved</h2>' +
    '<p class="sub">' + esc(a.id) + ' · ' + esc(a.name) + ' · ' + fmtDT(rec.at) + '</p>' +
    '<p>' + (failed ? '<span class="chip s-overdue">Failed items recorded</span><br><span class="note">The PM date stays as it was until a check passes.</span>' : 'Next PM is now <b>' + fmtDate(a._next) + '</b>.') + '</p>' +
    (droppedPhoto ? '<p class="err-msg">Storage was nearly full, so the photo was not kept.</p>' : '') +
    '<div style="display:flex;gap:10px;flex-wrap:wrap;justify-content:center"><a class="btn primary" href="#asset/' + encodeURIComponent(a.id) + '">Return to asset</a><a class="btn" href="#overview">PM Overview</a></div>' +
    '</div></div></section>';
  window.scrollTo(0, 0);
}
function shrinkImage(file, max) {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = reject;
    fr.onload = () => {
      const img = new Image();
      img.onerror = reject;
      img.onload = () => {
        const k = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.72));
      };
      img.src = fr.result;
    };
    fr.readAsDataURL(file);
  });
}

/* ============================================================================
   CHECK RECORDS
   ============================================================================ */
function viewRecords() {
  setNav('records');
  const recs = store.records.slice().sort((x, y) => y.at - x.at);
  const fails = recs.filter(r => r.results.some(x => x.result === 'Fail')).length;
  main.innerHTML = '<section class="view">' +
    '<div class="view-head"><div><div class="eyebrow">Check Records</div><h1>Saved checks</h1><p class="sub">' + recs.length + ' check' + (recs.length === 1 ? '' : 's') + ' saved on this device · ' + fails + ' with failed items</p></div>' +
      '<button class="btn primary" id="exp"' + (recs.length ? '' : ' disabled') + '>' + ICON.dl + 'Export to Excel</button></div>' +
    '<div class="card">' + (recs.length ? '<div class="tw"><table><thead><tr><th>Date</th><th>Asset</th><th>System</th><th>By</th><th>Result</th><th class="hide-sm">Notes</th></tr></thead><tbody>' +
      recs.map(r => { const f = r.results.filter(x => x.result === 'Fail').length; return '<tr data-id="' + esc(r.assetId) + '"><td class="num">' + fmtDT(r.at) + '</td><td><b>' + esc(r.assetId) + '</b> · ' + esc(r.assetName) + '</td><td>' + esc(r.system) + '</td><td>' + esc(r.user) + '</td><td><span class="chip ' + (f ? 's-overdue' : 's-ok') + '">' + (f ? f + ' failed' : 'Pass') + '</span></td><td class="hide-sm">' + esc(r.notes || '') + '</td></tr>'; }).join('') +
      '</tbody></table></div>' : '<div class="empty"><b>No checks recorded yet</b><span>Open an asset and choose Record check. Saved checks appear here and can be exported to Excel.</span><a class="btn primary" href="#overview">Go to PM Overview</a></div>') + '</div></section>';
  main.querySelectorAll('tbody tr').forEach(tr => tr.addEventListener('click', () => { location.hash = 'asset/' + tr.dataset.id; }));
  const ex = $('#exp'); if (ex) ex.addEventListener('click', exportRecords);
}

/* ============================================================================
   DATA — import register, export records, template, reset
   ============================================================================ */
function hasXLSX() { if (window.XLSX) return true; toast('The spreadsheet reader is not available in this copy of the app.'); return false; }
function exportRecords() {
  if (!hasXLSX() || !store.records.length) return;
  const rows = [];
  store.records.slice().sort((x, y) => x.at - y.at).forEach(r => r.results.forEach(x => rows.push({
    'Date': fmtDT(r.at), 'Asset ID': r.assetId, 'Asset name': r.assetName, 'System': r.system, 'Checked by': r.user,
    'Check': x.check, 'Result': x.result, 'Notes': r.notes || '', 'Photo attached': r.photo ? 'Yes' : 'No', 'Record ID': r.id
  })));
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(rows), 'Check records');
  XLSX.writeFile(wb, 'AKA_SOP_check_records_' + new Date().toISOString().slice(0, 10) + '.xlsx');
  toast('Exported ' + store.records.length + ' checks to Excel.');
}
const TEMPLATE_HEAD = ['Asset ID', 'Asset name', 'System', 'Location', 'Criticality', 'Responsible', 'PM frequency (days)', 'Last check', 'Next PM', 'Operator checks', 'PPM tasks', 'Limits', 'Standards'];
function downloadTemplate() {
  if (!hasXLSX()) return;
  const ex = assets.slice(0, 4).map(a => { const s = sop(a); return {
    'Asset ID': a.id, 'Asset name': a.name, 'System': a.system, 'Location': a.location, 'Criticality': a.criticality, 'Responsible': a.responsible,
    'PM frequency (days)': a.freq, 'Last check': a._last ? new Date(a._last).toLocaleDateString('en-GB') : '', 'Next PM': a._next ? new Date(a._next).toLocaleDateString('en-GB') : '',
    'Operator checks': s.checks.join('; '), 'PPM tasks': s.tasks.map(t => t[0] + ' | ' + t[1]).join('; '),
    'Limits': s.limits.map(l => [l[0], l[1] == null ? '' : l[1], l[2] == null ? '' : l[2], l[3] || ''].join(' | ')).join('; '), 'Standards': s.standards.join('; ') }; });
  const ws = XLSX.utils.json_to_sheet(ex, { header: TEMPLATE_HEAD });
  ws['!cols'] = TEMPLATE_HEAD.map(h => ({ wch: /checks|tasks|Limits|Standards/.test(h) ? 50 : 18 }));
  const help = XLSX.utils.aoa_to_sheet([
    ['How to fill the asset register'],
    ['One row per asset. Asset ID and Asset name are required; everything else is optional.'],
    ['System: HVAC, Fire safety, Electrical, Plumbing, Water treatment, Lifts, Kitchen, Solar or Pool give a ready SOP template; any other name works too.'],
    ['Dates: dd/mm/yyyy or a real Excel date.'],
    ['Operator checks and Standards: separate items with a semicolon (;).'],
    ['PPM tasks: Task | frequency in days; separate tasks with a semicolon.'],
    ['Limits: Parameter | min | max | unit; leave min or max empty if there is none.'],
    ['Columns left empty fall back to the SOP template for the asset’s system.']
  ]);
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Assets');
  XLSX.utils.book_append_sheet(wb, help, 'How to fill');
  XLSX.writeFile(wb, 'AKA_SOP_asset_register_template.xlsx');
}
function importFile(file) {
  if (!hasXLSX()) return;
  const fr = new FileReader();
  fr.onload = () => {
    try {
      const wb = XLSX.read(new Uint8Array(fr.result), { type: 'array', cellDates: true });
      const ws = wb.Sheets[wb.SheetNames.find(n => /asset/i.test(n)) || wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: '' });
      const norm = s => String(s).toLowerCase().replace(/[^a-z]/g, '');
      const col = (row, ...names) => { for (const k in row) { const n = norm(k); if (names.some(x => n === x || n.indexOf(x) === 0)) return row[k]; } return ''; };
      const list = v => String(v || '').split(/;|\n/).map(s => s.trim()).filter(Boolean);
      const out = [];
      rows.forEach(r => {
        const id = String(col(r, 'assetid', 'id', 'assetcode', 'tag')).trim();
        const name = String(col(r, 'assetname', 'name', 'description', 'equipment')).trim();
        if (!id || !name) return;
        const sys = String(col(r, 'system', 'category', 'service', 'trade')).trim() || 'General';
        const freq = parseInt(col(r, 'pmfrequency', 'frequency', 'freq'), 10) || (SYSTEMS[sys] || {}).freq || 30;
        const last = parseDate(col(r, 'lastcheck', 'lastpm', 'lastdone', 'lastservice'));
        let next = parseDate(col(r, 'nextpm', 'nextdue', 'duedate', 'next'));
        if (next == null && last != null) next = last + freq * DAY;
        out.push({
          id: id, name: name, system: sys, location: String(col(r, 'location', 'building', 'area')).trim(),
          criticality: String(col(r, 'criticality', 'priority')).trim(), responsible: String(col(r, 'responsible', 'owner', 'technician')).trim() || (SYSTEMS[sys] || {}).role || '',
          freq: freq, lastCheck: last, lastType: last ? 'Imported' : null, nextDue: next,
          checks: list(col(r, 'operatorchecks', 'checks', 'checklist')),
          tasks: list(col(r, 'ppmtasks', 'tasks')).map(t => { const p = t.split('|').map(s => s.trim()); return [p[0], parseInt(p[1], 10) || freq]; }),
          limits: list(col(r, 'limits')).map(t => { const p = t.split('|').map(s => s.trim()); return [p[0], p[1] === '' || p[1] == null ? null : (isNaN(+p[1]) ? p[1] : +p[1]), p[2] === '' || p[2] == null ? null : (isNaN(+p[2]) ? p[2] : +p[2]), p[3] || '']; }),
          standards: list(col(r, 'standards', 'references', 'sop'))
        });
      });
      if (!out.length) { toast('No assets found. The first sheet needs "Asset ID" and "Asset name" columns.'); return; }
      store.imported = { fileName: file.name, at: Date.now(), assets: out };
      try { writeStore(store); } catch (e) { delete store.imported; toast('The register is too large to keep on this device.'); return; }
      Object.assign(ui, { system: '', crit: '', q: '', status: '', page: 0, current: null });
      loadAssets(); closeDlg(); location.hash = 'overview'; route();
      toast('Imported ' + out.length + ' assets from ' + file.name + '.');
    } catch (e) { console.error(e); toast('Could not read that file. Save it as .xlsx or .csv and try again.'); }
  };
  fr.readAsArrayBuffer(file);
}
function openData() {
  const dlg = $('#dlg');
  dlg.innerHTML = '<div class="card" role="dialog" aria-modal="true" aria-labelledby="dlgT"><header><h2 id="dlgT">Data</h2><button class="btn icon" id="dlgX" aria-label="Close">✕</button></header><div class="body">' +
    '<div><b>Asset list</b><p>' + (source.kind === 'demo' ? 'The app is showing <b>illustrative demo assets</b>. The live register sits in the Power BI dataset behind SOP (1).pbix, which is not part of this app. Import an export of it, or fill the template.' : 'Using <b>' + assets.length + ' assets</b> imported from ' + esc(store.imported.fileName) + ' on ' + fmtDate(store.imported.at) + '.') + '</p></div>' +
    '<div class="row"><label class="btn primary file-btn">' + ICON.up + '<span>Import assets (.xlsx / .csv)</span><input type="file" id="imp" accept=".xlsx,.xls,.csv"></label><button class="btn" id="tpl">' + ICON.dl + 'Download template</button>' + (source.kind === 'import' ? '<button class="btn" id="useDemo">Use demo data</button>' : '') + '</div>' +
    '<div><b>Check records</b><p>' + store.records.length + ' saved on this device. They stay in this browser until you clear them; export them to share or keep.</p></div>' +
    '<div class="row"><button class="btn" id="exp2"' + (store.records.length ? '' : ' disabled') + '>' + ICON.dl + 'Export records to Excel</button><button class="btn danger" id="clr"' + (store.records.length ? '' : ' disabled') + '>Clear records</button></div>' +
    '<div id="confirmClr" hidden class="banner"><span>Delete all ' + store.records.length + ' saved checks from this device? Export first if you need them.</span><button class="btn danger" id="clrYes">Delete</button><button class="btn" id="clrNo">Keep</button></div>' +
    '<div><b>Appearance</b><div class="row" style="margin-top:6px"><button class="btn" data-theme-set="">Follow device</button><button class="btn" data-theme-set="light">Light</button><button class="btn" data-theme-set="dark">Dark</button></div></div>' +
    '</div></div>';
  dlg.hidden = false;
  const on = (id, fn) => { const el = $('#' + id); if (el) el.addEventListener('click', fn); };
  on('dlgX', closeDlg);
  dlg.onclick = e => { if (e.target === dlg) closeDlg(); };
  $('#imp').addEventListener('change', e => { const f = e.target.files[0]; if (f) importFile(f); e.target.value = ''; });
  on('tpl', downloadTemplate);
  on('exp2', exportRecords);
  on('useDemo', () => { delete store.imported; try { writeStore(store); } catch (e) { /* keep in memory */ } Object.assign(ui, { system: '', crit: '', q: '', status: '', page: 0, current: null }); loadAssets(); closeDlg(); route(); toast('Showing demo data.'); });
  on('clr', () => { $('#confirmClr').hidden = false; });
  on('clrNo', () => { $('#confirmClr').hidden = true; });
  on('clrYes', () => { store.records = []; try { writeStore(store); } catch (e) { /* memory only */ } applyRecords(); closeDlg(); route(); toast('Records cleared.'); });
  dlg.querySelectorAll('[data-theme-set]').forEach(b => b.addEventListener('click', () => {
    const v = b.dataset.themeSet;
    if (v) document.documentElement.setAttribute('data-theme', v); else document.documentElement.removeAttribute('data-theme');
    store.theme = v; try { writeStore(store); } catch (e) { /* ignore */ }
  }));
  $('#dlgX').focus();
}
function closeDlg() { $('#dlg').hidden = true; $('#dlg').innerHTML = ''; }

function openUser() {
  const dlg = $('#dlg');
  dlg.innerHTML = '<div class="card" role="dialog" aria-modal="true" aria-labelledby="uT"><header><h2 id="uT">Your name</h2><button class="btn icon" id="dlgX" aria-label="Close">✕</button></header>' +
    '<form class="body" id="uf"><p>Saved with every check you record on this device.</p><div class="field"><label for="un">Name or role</label><input id="un" maxlength="60" value="' + esc(store.user) + '"></div><div class="row"><button class="btn primary" type="submit">Save</button></div></form></div>';
  dlg.hidden = false;
  $('#dlgX').addEventListener('click', closeDlg);
  dlg.onclick = e => { if (e.target === dlg) closeDlg(); };
  $('#uf').addEventListener('submit', e => {
    e.preventDefault();
    store.user = $('#un').value.trim() || 'Technician';
    try { writeStore(store); } catch (err) { /* memory only */ }
    $('#userName').textContent = store.user; closeDlg(); toast('Checks will be saved as ' + store.user + '.');
  });
  $('#un').focus(); $('#un').select();
}

/* ---------------------------------------------------------------- routing */
function route() {
  const h = decodeURIComponent(location.hash.replace(/^#/, ''));
  const [view, id] = [h.split('/')[0], h.split('/').slice(1).join('/')];
  if (view === 'cards') { ui.page = 0; viewCards(); }
  else if (view === 'asset') viewAsset(id || ui.current);
  else if (view === 'check') viewCheck(id);
  else if (view === 'records') viewRecords();
  else { ui.page = 0; viewOverview(); }
  if (view !== 'check') window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#dlg').hidden) closeDlg(); });
$('#dataBtn').addEventListener('click', openData);
$('#userBtn').addEventListener('click', openUser);

if (store.theme) document.documentElement.setAttribute('data-theme', store.theme);
$('#userName').textContent = store.user;
loadAssets();
route();
})();
