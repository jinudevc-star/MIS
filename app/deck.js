/* ============================================================================
   FACILITIES MIS — COMMAND DECK
   Two workbooks (AKESI Schools, Aga Khan Academy Hyderabad) in one deck.
   Every figure comes from the selected workbook's MIS_Calc sheet, read in the
   browser by mis-engine.js. Where a month was never logged the deck says so.
   ============================================================================ */
(function () {
'use strict';

const E = window.MISEngine;
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MON3 = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

const $ = (s, r) => (r || document).querySelector(s);
const $$ = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));

/* ---------------------------------------------------------------- numbers */
const isNum = v => typeof v === 'number' && isFinite(v);
function fmt(v, dp) {
  if (!isNum(v)) return '—';
  const d = dp == null ? (Math.abs(v) >= 100 || Number.isInteger(v) ? 0 : Math.abs(v) >= 10 ? 1 : 2) : dp;
  return v.toLocaleString('en-IN', { minimumFractionDigits: d, maximumFractionDigits: d });
}
function compact(v) {
  if (!isNum(v)) return '—';
  if (v === 0) return '0';
  const a = Math.abs(v);
  if (a >= 1e6) return (v / 1e6).toFixed(a >= 1e7 ? 1 : 2) + 'M';
  if (a >= 1e3) return (v / 1e3).toFixed(a >= 1e4 ? 0 : 1) + 'k';
  return fmt(v);
}
const pct = v => isNum(v) ? (v * 100).toFixed(Math.abs(v * 100) >= 10 ? 0 : 1) + '%' : '—';
const sum = a => { const f = a.filter(isNum); return f.length ? f.reduce((x, y) => x + y, 0) : null; };
const mean = a => { const f = a.filter(isNum); return f.length ? f.reduce((x, y) => x + y, 0) / f.length : null; };
const logged = a => a.filter(isNum).length;
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/* ------------------------------------------------------------------ state */
const books = [];
const state = { book: 0, month: 0, entity: '', module: 'overview', auto: false };
const model = () => books[state.book].model;
const mt = k => model().metrics[k] || null;
const monthIdx = () => (state.month === 'ytd' ? null : state.month);
function periodLabel() { return state.month === 'ytd' ? '2026 year to date' : MONTHS[state.month] + ' 2026'; }
function periodShort() { return state.month === 'ytd' ? '2026 YTD' : MON3[state.month] + ' 2026'; }
function periodHours() {
  const m = model();
  if (state.month === 'ytd') return sum(DAYS.slice(0, m.latestIdx + 1)) * 24;
  return DAYS[state.month] * 24;
}
const entFor = (k, ent) => { const x = mt(k); const e = ent === undefined ? state.entity : ent; return x && e && x.entitySet === 'main' && x.monthly[e] ? e : null; };
/** Value of a metric for the period (and the selected school / facility when it is split). */
function V(k, ent) { const x = mt(k); return x ? E.valueOf(model(), x, state.month, entFor(k, ent)) : null; }
/** 12-slot monthly series. */
function S(k, ent) { const x = mt(k); return x ? E.seriesOf(model(), x, entFor(k, ent)) : new Array(12).fill(null); }
/** Previous comparable period: the prior logged month, or Avg-2025 scaled to the months logged. */
function P(k, ent) {
  const x = mt(k);
  if (!x) return null;
  const e = entFor(k, ent);
  if (state.month !== 'ytd') {
    const s = S(k, ent);
    for (let i = state.month - 1; i >= 0; i--) if (isNum(s[i])) return s[i];
    return null;
  }
  const b = !e && x.baselines ? x.baselines['Avg 2025'] : null;
  if (!isNum(b)) return null;
  return x.agg === 'sum' ? b * (model().latestIdx + 1) : b;
}
const lower = k => (mt(k) || {}).good === 'down';
const unitOf = k => { const x = mt(k); if (!x) return ''; return /^%/.test(x.unit) ? '' : (x.unit === 'ratio' ? '' : x.unit); };
function fmtK(k, v) {
  const x = mt(k);
  if (!x) return '—';
  if (/^%/.test(x.unit)) return pct(v);
  if (x.unit === 'ratio') return isNum(v) ? v.toFixed(3) : '—';
  return fmt(v);
}
const has = k => !!mt(k);
/** Scope note: a campus-wide figure while a facility is selected. */
function scopeOf(k) {
  const x = mt(k);
  if (!state.entity || !x) return '';
  return entFor(k) ? state.entity : (model().layout === 'campus' ? 'campus-wide' : 'all schools');
}

/* ------------------------------------------------------------------ SVG */
const NS = 'http://www.w3.org/2000/svg';
function el(tag, attrs, kids) {
  const n = document.createElementNS(NS, tag);
  for (const k in attrs) if (attrs[k] != null) n.setAttribute(k, attrs[k]);
  (kids || []).forEach(c => n.appendChild(c));
  return n;
}
function txt(x, y, s, cls, anchor) {
  const t = el('text', { x: x, y: y, class: cls || null, 'text-anchor': anchor || 'start' });
  t.textContent = s;
  return t;
}
function niceMax(v) {
  if (!isNum(v) || v <= 0) return 1;
  const p = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10) * p;
}

/* ------------------------------------------------------------- tooltip */
const tipEl = $('#tip');
function showTip(x, y, h) {
  tipEl.innerHTML = h;
  tipEl.style.opacity = '1';
  const r = tipEl.getBoundingClientRect();
  let left = x + 14, top = y - r.height - 12;
  if (left + r.width > innerWidth - 8) left = x - r.width - 14;
  if (top < 8) top = y + 18;
  tipEl.style.left = left + 'px';
  tipEl.style.top = top + 'px';
}
const hideTip = () => { tipEl.style.opacity = '0'; };

/* ============================================================================
   CHARTS — hand-built SVG, one scale, hover layer on every plotted form.
   ============================================================================ */
function nodata(msg) { const d = document.createElement('div'); d.className = 'nodata'; d.textContent = msg; return d; }

/** Multi-series monthly line/area chart with crosshair + tooltip (max 3 series). */
function lineChart(series, opts) {
  opts = opts || {};
  const W = 340, H = opts.height || 150, L = 38, R = 10, T = 12, B = 22;
  const iw = W - L - R, ih = H - T - B;
  const all = series.reduce((a, s) => a.concat(s.v.filter(isNum)), []);
  if (!all.length) return nodata(opts.empty || 'No months logged for this measure yet');
  const svg = el('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': opts.label || 'Monthly trend' });
  const maxV = niceMax(Math.max.apply(null, all.concat(isNum(opts.benchmark) ? [opts.benchmark] : [])));
  const minV = 0;
  const X = i => L + (iw * i) / 11;
  const Y = v => T + ih - ((v - minV) / (maxV - minV)) * ih;
  for (let g = 0; g <= 4; g++) {
    const y = T + (ih * g) / 4;
    svg.appendChild(el('line', { class: 'grid', x1: L, x2: L + iw, y1: y, y2: y }));
    svg.appendChild(txt(L - 6, y + 3, compact(maxV - ((maxV - minV) * g) / 4), null, 'end'));
  }
  svg.appendChild(el('line', { class: 'axis-line', x1: L, x2: L + iw, y1: T + ih, y2: T + ih }));
  for (let i = 0; i < 12; i++) if (i % 2 === 0 || iw > 300) svg.appendChild(txt(X(i), H - 6, MON3[i], null, 'middle'));
  if (isNum(opts.benchmark) && opts.benchmark <= maxV) {
    svg.appendChild(el('line', { class: 'bench', x1: L, x2: L + iw, y1: Y(opts.benchmark), y2: Y(opts.benchmark) }));
    svg.appendChild(txt(L + iw, Y(opts.benchmark) - 4, opts.benchmarkLabel || 'benchmark', 'lbl-val', 'end'));
  }
  const placed = [];
  series.forEach(s => {
    const pts = [];
    s.v.forEach((v, i) => { if (isNum(v)) pts.push([X(i), Y(v), i, v]); });
    if (!pts.length) return;
    if (s.area && pts.length > 1) {
      const id = 'ag' + Math.random().toString(36).slice(2, 8);
      const defs = el('defs');
      const lg = el('linearGradient', { id: id, x1: 0, y1: 0, x2: 0, y2: 1 });
      lg.appendChild(el('stop', { offset: '0%', 'stop-color': s.color, 'stop-opacity': '.34' }));
      lg.appendChild(el('stop', { offset: '100%', 'stop-color': s.color, 'stop-opacity': '0' }));
      defs.appendChild(lg); svg.appendChild(defs);
      svg.appendChild(el('path', { d: 'M' + pts.map(p => p[0] + ',' + p[1]).join('L') + 'L' + pts[pts.length - 1][0] + ',' + (T + ih) + 'L' + pts[0][0] + ',' + (T + ih) + 'Z', fill: 'url(#' + id + ')', stroke: 'none' }));
    }
    svg.appendChild(el('path', { d: 'M' + pts.map(p => p[0] + ',' + p[1]).join('L'), fill: 'none', stroke: s.color, 'stroke-width': 2, 'stroke-linecap': 'round', 'stroke-linejoin': 'round' }));
    const cur = monthIdx();
    pts.forEach((p, k) => {
      const big = k === pts.length - 1 || p[2] === cur;
      svg.appendChild(el('circle', { cx: p[0], cy: p[1], r: big ? 4 : 2.6, fill: s.color, stroke: 'var(--deck)', 'stroke-width': 2 }));
    });
    const e = pts[pts.length - 1];
    let ly = e[1] - 7;
    while (placed.some(p => Math.abs(p - ly) < 11)) ly += 12;
    ly = Math.max(T + 8, Math.min(T + ih - 2, ly));
    placed.push(ly);
    svg.appendChild(txt(Math.min(e[0] + 6, W - 2), ly, compact(e[3]), 'lbl-val', e[0] > W - 44 ? 'end' : 'start'));
  });
  const cross = el('line', { class: 'crosshair', y1: T, y2: T + ih, x1: -99, x2: -99 });
  svg.appendChild(cross);
  const hit = el('rect', { class: 'hit', x: L, y: T, width: iw, height: ih });
  svg.appendChild(hit);
  hit.addEventListener('pointermove', ev => {
    const bb = svg.getBoundingClientRect();
    let i = Math.round(((((ev.clientX - bb.left) / bb.width) * W) - L) / iw * 11);
    i = Math.max(0, Math.min(11, i));
    cross.setAttribute('x1', X(i)); cross.setAttribute('x2', X(i));
    let h = '<b>' + MON3[i] + ' 2026</b>';
    series.forEach(s => {
      h += '<div class="tr"><span><i style="background:' + s.color + '"></i>' + s.name + '</span><span>' +
        (isNum(s.v[i]) ? fmt(s.v[i]) + (opts.unit ? ' ' + opts.unit : '') : 'not logged') + '</span></div>';
    });
    showTip(ev.clientX, ev.clientY, h);
  });
  hit.addEventListener('pointerleave', () => { cross.setAttribute('x1', -99); cross.setAttribute('x2', -99); hideTip(); });
  hit.addEventListener('click', ev => {
    const bb = svg.getBoundingClientRect();
    const i = Math.max(0, Math.min(11, Math.round(((((ev.clientX - bb.left) / bb.width) * W) - L) / iw * 11)));
    if (i <= model().latestIdx) setMonth(i);
  });
  return svg;
}

/** Monthly column chart with a highlighted current month. Click a column to select that month. */
function barChart(v, color, opts) {
  opts = opts || {};
  const W = 340, H = opts.height || 132, L = 36, R = 8, T = 12, B = 22;
  const iw = W - L - R, ih = H - T - B;
  const f = v.filter(isNum);
  if (!f.length) return nodata(opts.empty || 'Not logged yet');
  const maxV = niceMax(Math.max.apply(null, f.concat(isNum(opts.benchmark) ? [opts.benchmark] : [])));
  const svg = el('svg', { class: 'chart', viewBox: '0 0 ' + W + ' ' + H, role: 'img', 'aria-label': opts.label || 'Monthly values' });
  for (let g = 0; g <= 3; g++) {
    const y = T + (ih * g) / 3;
    svg.appendChild(el('line', { class: 'grid', x1: L, x2: L + iw, y1: y, y2: y }));
    svg.appendChild(txt(L - 6, y + 3, compact(maxV - (maxV * g) / 3), null, 'end'));
  }
  const bw = (iw / 12) * 0.56, gap = iw / 12;
  const cur = monthIdx();
  v.forEach((x, i) => {
    const cx = L + gap * i + gap / 2;
    if (!isNum(x)) {
      svg.appendChild(el('line', { x1: cx - bw / 2, x2: cx + bw / 2, y1: T + ih - 1, y2: T + ih - 1, stroke: 'var(--edge-2)', 'stroke-width': 2, 'stroke-dasharray': '2 2' }));
      return;
    }
    const h = Math.max(2.5, (Math.max(0, x) / maxV) * ih);
    const on = cur === i;
    svg.appendChild(el('rect', { x: cx - bw / 2, y: T + ih - h, width: bw, height: h, rx: 2.5, fill: color, opacity: cur == null ? 1 : (on ? 1 : 0.4), stroke: on ? 'var(--ink)' : 'none', 'stroke-width': on ? 1 : 0 }));
    if (on) svg.appendChild(txt(cx, T + ih - h - 5, compact(x), 'lbl-val', 'middle'));
  });
  if (isNum(opts.benchmark)) {
    const y = T + ih - (opts.benchmark / maxV) * ih;
    svg.appendChild(el('line', { class: 'bench', x1: L, x2: L + iw, y1: y, y2: y }));
    svg.appendChild(txt(L + iw, y - 4, opts.benchmarkLabel || 'benchmark', 'lbl-val', 'end'));
  }
  svg.appendChild(el('line', { class: 'axis-line', x1: L, x2: L + iw, y1: T + ih, y2: T + ih }));
  for (let i = 0; i < 12; i++) svg.appendChild(txt(L + gap * i + gap / 2, H - 6, MON3[i][0], null, 'middle'));
  const hit = el('rect', { class: 'hit', x: L, y: T, width: iw, height: ih });
  svg.appendChild(hit);
  const idxAt = ev => { const bb = svg.getBoundingClientRect(); return Math.max(0, Math.min(11, Math.floor(((((ev.clientX - bb.left) / bb.width) * W) - L) / gap))); };
  hit.addEventListener('pointermove', ev => {
    const i = idxAt(ev);
    showTip(ev.clientX, ev.clientY, '<b>' + MON3[i] + ' 2026</b><div class="tr"><span><i style="background:' + color + '"></i>' +
      (opts.name || 'Value') + '</span><span>' + (isNum(v[i]) ? fmt(v[i]) + (opts.unit ? ' ' + opts.unit : '') : 'not logged') + '</span></div>');
  });
  hit.addEventListener('pointerleave', hideTip);
  hit.addEventListener('click', ev => { const i = idxAt(ev); if (i <= model().latestIdx) setMonth(i); });
  return svg;
}

/** Radial gauge: value against a limit, with a machined bezel. */
function gauge(value, maxV, opts) {
  opts = opts || {};
  const S0 = 120, cx = 60, cy = 62, r = 42;
  const svg = el('svg', { class: 'chart', viewBox: '0 0 ' + S0 + ' ' + (S0 * 0.82), role: 'img', 'aria-label': (opts.caption || '') + ' ' + fmt(value) });
  const a0 = Math.PI * 0.82, a1 = Math.PI * 2.18;
  const Pt = a => [cx + r * Math.cos(a), cy + r * Math.sin(a)];
  const arc = (from, to, stroke, w) => {
    const p0 = Pt(from), p1 = Pt(to);
    return el('path', { d: 'M' + p0[0] + ',' + p0[1] + 'A' + r + ',' + r + ' 0 ' + (to - from > Math.PI ? 1 : 0) + ' 1 ' + p1[0] + ',' + p1[1], fill: 'none', stroke: stroke, 'stroke-width': w, 'stroke-linecap': 'round' });
  };
  svg.appendChild(arc(a0, a1, 'var(--deck-3)', 7));
  if (isNum(value) && isNum(maxV) && maxV > 0) {
    const f = Math.max(0, Math.min(1, value / maxV));
    if (f > 0.004) svg.appendChild(arc(a0, a0 + (a1 - a0) * f, opts.color || 'var(--accent)', 7));
    const nd = Pt(a0 + (a1 - a0) * f);
    svg.appendChild(el('circle', { cx: nd[0], cy: nd[1], r: 4, fill: opts.color || 'var(--accent)', stroke: 'var(--deck)', 'stroke-width': 2 }));
  }
  if (isNum(opts.threshold) && isNum(maxV) && maxV > 0) {
    const t = a0 + (a1 - a0) * Math.max(0, Math.min(1, opts.threshold / maxV));
    svg.appendChild(el('line', { x1: cx + (r - 9) * Math.cos(t), y1: cy + (r - 9) * Math.sin(t), x2: cx + (r + 9) * Math.cos(t), y2: cy + (r + 9) * Math.sin(t), stroke: 'var(--warn)', 'stroke-width': 1.5 }));
  }
  const big = txt(cx, cy + 4, opts.display != null ? opts.display : compact(value), null, 'middle');
  big.setAttribute('style', 'font-family:Archivo,sans-serif;font-weight:700;font-size:19px;fill:var(--ink)');
  svg.appendChild(big);
  if (opts.sub) {
    const s = txt(cx, cy + 19.5, opts.sub, null, 'middle');
    s.setAttribute('style', 'font-size:8px;fill:var(--ink-3);letter-spacing:.08em');
    svg.appendChild(s);
  }
  const wrap = document.createElement('div');
  wrap.className = 'gauge';
  wrap.appendChild(svg);
  if (opts.caption) { const c = document.createElement('div'); c.className = 'g-cap'; c.textContent = opts.caption; wrap.appendChild(c); }
  return wrap;
}
function gauges(list) {
  const w = document.createElement('div');
  w.className = 'gauges';
  list.filter(Boolean).forEach(g => w.appendChild(g));
  return w;
}

/** Ranked horizontal bars. Rows of the main entity set are clickable to drill in. */
function rankList(items, color, unit, limit, clickable) {
  const wrap = document.createElement('div');
  wrap.className = 'rank';
  const rowsIn = items.filter(i => isNum(i.value) && i.value > 0).sort((a, b) => b.value - a.value).slice(0, limit || 10);
  if (!rowsIn.length) { wrap.appendChild(nodata('No metered values for this period')); return wrap; }
  const maxV = rowsIn[0].value;
  rowsIn.forEach(r => {
    const d = document.createElement('div');
    d.className = 'item' + (r.name === state.entity ? ' sel' : '');
    if (clickable) { d.dataset.ent = r.name; d.title = 'Drill into ' + r.name; }
    d.innerHTML = '<div class="top"><span class="nm">' + esc(r.name) + '</span><span class="vv">' + fmt(r.value) +
      (unit ? ' <span style="color:var(--ink-3);font-size:10px">' + esc(unit) + '</span>' : '') + '</span></div>' +
      '<div class="track"><div class="fill" style="width:' + ((r.value / maxV) * 100).toFixed(1) + '%;background:' + color + '"></div></div>';
    wrap.appendChild(d);
  });
  return wrap;
}

/* ---------------------------------------------------------- DOM builders */
function html(s) { const d = document.createElement('div'); d.innerHTML = s; return d.children.length === 1 ? d.firstElementChild : d; }
function panel(title, hint, bodyNodes, tableSpec) {
  const p = document.createElement('section');
  p.className = 'panel';
  p.innerHTML = '<header><h2>' + esc(title) + '</h2>' + (hint ? '<span class="hint">' + esc(hint) + '</span>' : '') + '</header>';
  const b = document.createElement('div');
  b.className = 'body';
  (Array.isArray(bodyNodes) ? bodyNodes : [bodyNodes]).forEach(n => { if (n) b.appendChild(typeof n === 'string' ? html(n) : n); });
  if (tableSpec) b.appendChild(dataTable(tableSpec));
  p.appendChild(b);
  return p;
}
function rows(list) {
  const w = document.createElement('div');
  w.className = 'rows';
  list.forEach(r => {
    if (!r) return;
    const d = document.createElement('div');
    d.className = 'row' + (r.sev ? ' sev sev-' + r.sev : '');
    d.innerHTML = '<span class="k">' + r.k + '</span><span class="v">' + r.v + (r.u ? '<em>' + esc(r.u) + '</em>' : '') + '</span>';
    w.appendChild(d);
  });
  return w;
}
function dataTable(spec) {
  const d = document.createElement('details');
  d.className = 'tbl';
  const rowsHtml = spec.rows.map(r => '<tr><td>' + r[0] + '</td>' + r.slice(1).map(c => '<td>' + c + '</td>').join('') + '</tr>').join('');
  d.innerHTML = '<summary>' + (spec.title || 'Table view') + '</summary><div class="scrollx"><table class="data"><thead><tr>' +
    spec.head.map(h => '<th>' + h + '</th>').join('') + '</tr></thead><tbody>' + rowsHtml + '</tbody></table></div>';
  return d;
}
function legend(items) {
  const w = document.createElement('div');
  w.className = 'legend';
  items.forEach(i => w.appendChild(html('<span><i style="background:' + i.color + '"></i>' + esc(i.name) + '</span>')));
  return w;
}
function monthTable(k, label) {
  const s = S(k), u = unitOf(k);
  return { title: 'Table view — ' + label, head: ['Month', label + (u ? ' (' + u + ')' : '')], rows: MON3.map((m, i) => [m, isNum(s[i]) ? fmtK(k, s[i]) : 'not logged']) };
}
function deltaHtml(cur, prev, lowerIsBetter) {
  if (!isNum(cur) || !isNum(prev) || prev === 0) return '<span class="flat">no comparable period</span>';
  const d = (cur - prev) / Math.abs(prev);
  const up = d > 0.005, down = d < -0.005;
  const cls = !up && !down ? 'flat' : (lowerIsBetter ? (up ? 'up' : 'down') : (up ? 'down' : 'up'));
  return '<span class="' + cls + '">' + (up ? '▲' : down ? '▼' : '■') + ' ' + Math.abs(d * 100).toFixed(1) + '% vs ' + (state.month === 'ytd' ? 'Avg-2025' : 'prior') + '</span>';
}
/** o = {cap, raw, display, unit, prev, lowerIsBetter, color, note} */
function heroItem(o) {
  const body = o.display != null ? o.display : compact(o.raw);
  const foot = o.note != null ? '<span class="flat">' + esc(o.note) + '</span>' : (o.prev !== undefined ? deltaHtml(o.raw, o.prev, o.lowerIsBetter) : '');
  return '<div class="unit-group"><div class="cap">' + esc(o.cap) + '</div><div class="val' + (o.name ? ' is-name' : '') + '" style="color:' +
    (o.color || 'var(--ink)') + '">' + body + (o.unit ? '<small>' + esc(o.unit) + '</small>' : '') + '</div><div class="delta">' + foot + '</div></div>';
}
/** Hero readout for a metric key. */
function heroK(k, cap, extra) {
  const x = mt(k);
  if (!x) return '';
  const v = V(k);
  const sc = scopeOf(k);
  return heroItem(Object.assign({
    cap: cap || x.label, raw: v, display: /^%/.test(x.unit) || x.unit === 'ratio' ? fmtK(k, v) : compact(v), unit: unitOf(k),
    prev: P(k), lowerIsBetter: lower(k), note: sc === 'campus-wide' || sc === 'all schools' ? sc : undefined
  }, extra || {}));
}
/** Ledger row for a metric key: severity from its target, if it has one. */
function rowK(k, label, opts) {
  const x = mt(k);
  if (!x) return null;
  const v = V(k);
  let sev = null;
  if (x.target && isNum(v)) sev = (x.good === 'up' ? v >= x.target.value : v <= x.target.value) ? 'good' : 'crit';
  return Object.assign({ k: esc(label || x.label), v: fmtK(k, v), u: /^%/.test(x.unit) ? '' : unitOf(k), sev: sev }, opts || {});
}
/** Rank items for a metric: per school / facility, or the metric's own breakdown (plants, HVAC buildings). */
function rankItems(k) {
  const m = model(), x = mt(k);
  if (!x) return { items: [], clickable: false };
  if (x.entitySet === 'main') return { items: m.entities.map(e => ({ name: e, value: V(k, e) })), clickable: true };
  if (x.breakdown) {
    const mi = monthIdx();
    return { items: x.breakdown.entities.map(e => { const a = x.breakdown.monthly[e]; return { name: e, value: mi == null ? sum(a.slice(0, m.latestIdx + 1)) : a[mi] }; }), clickable: false, by: x.breakdown.title.replace(/^.*?\bby\b\s*/i, '').replace(/\s*\(.*?\)/g, '') };
  }
  return { items: [], clickable: false };
}
function rankPanel(k, title, color, limit) {
  const r = rankItems(k);
  if (!r.items.length) return null;
  const by = r.by || (model().entityLabel || '').toLowerCase();
  return panel(title || (mt(k).label + ' by ' + by), periodShort() + (unitOf(k) ? ' · ' + unitOf(k) : ''),
    [rankList(r.items, color, unitOf(k), limit || 10, r.clickable)]);
}
function trendPanel(k, title, color, opts) {
  opts = opts || {};
  const x = mt(k);
  if (!x) return null;
  const s = S(k);
  const chart = opts.line
    ? lineChart([{ name: x.label, v: s, color: color, area: true }], { unit: unitOf(k), height: 130, benchmark: x.target ? x.target.value : undefined, benchmarkLabel: x.target ? x.target.label : undefined })
    : barChart(/^%/.test(x.unit) ? s.map(v => isNum(v) ? v * 100 : v) : s, color, { name: x.label, unit: /^%/.test(x.unit) ? '%' : unitOf(k), benchmark: x.target ? (/^%/.test(x.unit) ? x.target.value * 100 : x.target.value) : undefined, benchmarkLabel: x.target ? x.target.label : undefined });
  const ent = entFor(k);
  return panel(title || (x.label + ' through 2026'), (ent ? ent + ' · ' : '') + (unitOf(k) || x.unit) + ' per month', [chart], monthTable(k, x.label));
}
function telemetryPanel() { return panel('Live telemetry', 'modelled from metered totals', [html('<div class="telem" id="telem-host"></div>')]); }
function tele(name, k, unit, color, perHour) {
  const v = V(k);
  return { name: name, base: isNum(v) ? (perHour ? v / periodHours() : v) : null, unit: unit, scale: 1, color: color };
}
function findingsPanel() {
  const f = model().findings || [];
  if (!f.length) return null;
  const first = f.slice(0, 3), more = f.slice(3);
  const list = html('<ol class="findings">' + first.map(x => '<li>' + esc(x) + '</li>').join('') + '</ol>');
  const nodes = [list];
  if (more.length) {
    const d = document.createElement('details');
    d.className = 'tbl';
    d.innerHTML = '<summary>' + more.length + ' more findings</summary><ol class="findings" start="4" style="margin-top:8px">' + more.map(x => '<li>' + esc(x) + '</li>').join('') + '</ol>';
    nodes.push(d);
  }
  return panel('Data-quality findings', 'as written in the workbook', nodes);
}
/** Blocks for the 3D scenes: one per school / facility, height = metric for the period. */
function blocksFor(k) {
  const m = model();
  const r = rankItems(k);
  return r.items.map(it => ({ name: it.name, v: isNum(it.value) ? Math.round(it.value * 100) / 100 : 0, sel: it.name === state.entity }));
}
function scorecard(cols) {
  const m = model();
  const keys = cols.filter(c => has(c.k));
  const head = '<thead><tr><th>' + esc(m.entityLabel) + '</th>' + keys.map(c => '<th>' + esc(c.label) + '</th>').join('') + '</tr></thead>';
  const body = m.entities.map(e => '<tr data-ent="' + esc(e) + '"' + (e === state.entity ? ' class="sel"' : '') + '><td>' + esc(e) + '</td>' +
    keys.map(c => '<td>' + fmtK(c.k, V(c.k, e)) + '</td>').join('') + '</tr>').join('');
  const tot = '<tr class="tot" data-ent=""><td>' + esc(m.layout === 'campus' ? 'Metered facilities' : m.allLabel) + '</td>' +
    keys.map(c => '<td>' + fmtK(c.k, V(c.k, '')) + '</td>').join('') + '</tr>';
  const wrap = html('<div class="scrollx"><table class="data score">' + head + '<tbody>' + body + tot + '</tbody></table></div>');
  return wrap;
}

/* ============================================================================
   MODULES — one per stream, built for the workbook's layout.
   ============================================================================ */
const C = { water: 'var(--water)', power: 'var(--power)', solar: 'var(--solar)', dg: 'var(--dg)', chem: 'var(--chem)', team: 'var(--team)', bldg: 'var(--good)', overview: 'var(--overview)', hvac: 'var(--hvac)', service: 'var(--service)' };
const S1 = '#3987e5', S2 = '#d95926', S3 = '#199e70';

/* ------------------------------ AKESI SCHOOLS ------------------------------ */
function schoolsOverview() {
  const m = model();
  const cov = k => (m.coverage[k] && state.month !== 'ytd') ? (m.coverage[k][state.month] || 0) + ' / ' + m.entities.length : (m.coverage[k] ? m.coverage[k].filter(v => v > 0).length + ' months' : '—');
  return {
    title: state.entity || 'All Schools',
    eyebrow: 'Overview · ' + m.entities.length + ' schools · ' + periodLabel(),
    lede: m.subtitle,
    accent: C.overview,
    hero: heroK('grid', 'Grid electricity') + heroK('bill', 'Energy bill') + heroK('water', 'Water consumed') + heroK('tickets', 'Repair tickets'),
    telemetry: [tele('Grid', 'grid', 'kW', C.power, true), tele('Water', 'water', 'kL/h', C.water, true), tele('Solar', 'solar', 'kW', C.solar, true)],
    left: [
      panel('Utility streams', periodShort(), [rows([
        rowK('grid', 'Grid electricity'), rowK('solar', 'Solar generation'), rowK('water', 'Water consumed'),
        rowK('repair', 'Repair spend'), rowK('diesel', 'Generator diesel'), rowK('pupils', 'Pupils on roll')
      ].map((r, i) => r && Object.assign(r, { k: '<span style="display:inline-flex;align-items:center;gap:7px"><i style="width:7px;height:7px;border-radius:99px;background:' + [C.power, C.solar, C.water, C.service, C.dg, C.team][i] + ';display:inline-block"></i>' + r.k + '</span>' })))]),
      panel('Reporting coverage', state.month === 'ytd' ? 'months logged' : 'schools reporting', [rows([
        { k: 'Electricity', v: cov('grid'), sev: state.month !== 'ytd' && m.coverage.grid && m.coverage.grid[state.month] < m.entities.length ? 'warn' : 'good' },
        { k: 'Water', v: cov('water'), sev: state.month !== 'ytd' && m.coverage.water && m.coverage.water[state.month] < m.entities.length ? 'warn' : 'good' },
        { k: 'Repairs', v: cov('tickets') },
        { k: 'Latest month', v: MON3[m.latestIdx] + ' 2026' }
      ])]),
      telemetryPanel()
    ],
    right: [
      rankPanel('grid', 'Grid electricity by school', C.power),
      panel('Electricity and water through 2026', state.entity || 'all schools', [
        lineChart([{ name: 'Grid kWh', v: S('grid'), color: S2, area: true }, { name: 'Water kL', v: S('water'), color: S1 }], { height: 140 }),
        legend([{ name: 'Grid electricity (kWh)', color: S2 }, { name: 'Water (kL)', color: S1 }])
      ]),
      findingsPanel()
    ],
    scene: 'overview', sceneData: { blocks: blocksFor('grid') }
  };
}
function schoolsPower() {
  return {
    title: 'Electricity', eyebrow: 'Grid supply · ' + (state.entity || 'All Schools') + ' · ' + periodLabel(),
    lede: 'Grid units and the energy bill as logged on Electrical Consmp., with the unit rate and use per pupil worked out from them.',
    accent: C.power,
    hero: heroK('grid', 'Grid electricity', { color: 'var(--power)' }) + heroK('bill', 'Energy bill') + heroK('rate', 'Unit cost') + heroK('kwhpp', 'Per pupil / month'),
    telemetry: [tele('Load', 'grid', 'kW', C.power, true), tele('Solar', 'solar', 'kW', C.solar, true)],
    left: [
      panel('Energy ledger', periodShort(), [rows([rowK('grid'), rowK('bill'), rowK('rate'), rowK('kwhpp'), rowK('pupils')])]),
      panel('Rate and intensity', 'vs 2026 average', [gauges([
        gauge(V('rate'), Math.max(20, (V('rate') || 0) * 1.4), { caption: 'Unit cost ₹/kWh', display: fmt(V('rate'), 2), threshold: E.monthlyAverage(model(), mt('rate'), entFor('rate')), color: 'var(--power)' }),
        gauge(V('kwhpp'), Math.max(10, (V('kwhpp') || 0) * 1.4), { caption: 'kWh / pupil / month', display: fmt(V('kwhpp'), 1), threshold: E.monthlyAverage(model(), mt('kwhpp'), entFor('kwhpp')), color: S2 })
      ])]),
      telemetryPanel()
    ],
    right: [trendPanel('grid', null, C.power), rankPanel('grid', null, C.power), trendPanel('bill', 'Energy bill through 2026', S2, { line: true })],
    scene: 'power', sceneData: { blocks: blocksFor('grid') }
  };
}
function schoolsSolar() {
  const sol = V('solar'), grid = V('grid');
  return {
    title: 'Solar Generation', eyebrow: 'Rooftop arrays · ' + (state.entity || 'All Schools') + ' · ' + periodLabel(),
    lede: 'Solar generation logged on Electrical Consmp. Only some schools have arrays; the rest read zero.',
    accent: C.solar,
    hero: heroK('solar', 'Generated', { color: 'var(--solar)' }) + heroItem({ cap: 'Share of supply', display: isNum(sol) && isNum(grid) && sol + grid > 0 ? pct(sol / (sol + grid)) : '—', note: 'solar ÷ (solar + grid)', color: 'var(--good)' }) +
      heroItem({ cap: 'Schools generating', display: String(model().entities.filter(e => (V('solar', e) || 0) > 0).length), note: 'of ' + model().entities.length }),
    telemetry: [tele('Array', 'solar', 'kW', C.solar, true), tele('Grid', 'grid', 'kW', C.power, true)],
    left: [panel('Generation ledger', periodShort(), [rows([rowK('solar'), rowK('grid', 'Grid electricity'), { k: 'Solar share of supply', v: isNum(sol) && isNum(grid) && sol + grid > 0 ? pct(sol / (sol + grid)) : '—' }])]), telemetryPanel()],
    right: [trendPanel('solar', null, C.solar), rankPanel('solar', null, C.solar)],
    scene: 'solar', sceneData: {}
  };
}
function schoolsWater() {
  return {
    title: 'Water', eyebrow: 'Consumption · ' + (state.entity || 'All Schools') + ' · ' + periodLabel(),
    lede: 'Water logged on Water Consmp. Litres per pupil per day uses pupil-days, so vacation months with a small headcount read high.',
    accent: C.water,
    hero: heroK('water', 'Water consumed', { color: 'var(--water)' }) + heroK('lppd', 'Per pupil per day') + heroK('pupils', 'Pupils'),
    telemetry: [tele('Draw', 'water', 'kL/h', C.water, true)],
    left: [panel('Water ledger', periodShort(), [rows([rowK('water'), rowK('lppd'), rowK('pupils')])]),
      panel('Intensity', 'L / pupil / day', [gauges([gauge(V('lppd'), Math.max(30, (V('lppd') || 0) * 1.4), { caption: 'vs 2026 average', display: fmt(V('lppd'), 1), threshold: E.monthlyAverage(model(), mt('lppd'), entFor('lppd')), color: 'var(--water)' })])]),
      telemetryPanel()],
    right: [trendPanel('water', null, C.water), rankPanel('water', null, C.water), trendPanel('lppd', 'Litres per pupil per day', S1, { line: true })],
    scene: 'water', sceneData: { blocks: blocksFor('water'), label: 'SUPPLY' }
  };
}
function schoolsRepairs() {
  const t = V('tickets'), s = V('repair');
  return {
    title: 'Repairs', eyebrow: 'Maintenance · ' + (state.entity || 'All Schools') + ' · ' + periodLabel(),
    lede: 'Repair tickets and spend from the REPAIRS sheet. DJHSH primary and high school are logged together and shown on DJHSH (PRI).',
    accent: C.service,
    hero: heroK('tickets', 'Tickets', { color: 'var(--service)' }) + heroK('repair', 'Spend') + heroItem({ cap: 'Spend per ticket', display: isNum(t) && t > 0 && isNum(s) ? '₹' + fmt(s * 1000 / t, 0) : '—', note: 'spend ÷ tickets' }),
    telemetry: [tele('Tickets', 'tickets', '/day', C.service, false)].map(d => Object.assign(d, { base: isNum(d.base) ? d.base / (periodHours() / 24) : null })),
    left: [panel('Repair ledger', periodShort(), [rows([rowK('tickets'), rowK('repair')])]), telemetryPanel()],
    right: [trendPanel('tickets', null, C.service), rankPanel('repair', 'Repair spend by school', C.service), rankPanel('tickets', 'Tickets by school', S2)],
    scene: 'service', sceneData: { count: t, closed: 1, fill: Math.min(1, (s || 0) / Math.max(1, (E.monthlyAverage(model(), mt('repair'), entFor('repair')) || 1) * 1.5)), label: 'REPAIRS' }
  };
}
function schoolsDG() {
  const d = V('diesel'), h = V('runhrs');
  return {
    title: 'Generators', eyebrow: 'Standby power · ' + (state.entity || 'All Schools') + ' · ' + periodLabel(),
    lede: 'Diesel, units and run hours from GENERATOR CONSMP. Only schools with a generator log appear.',
    accent: C.dg,
    hero: heroK('diesel', 'Diesel', { color: 'var(--dg)' }) + heroK('genkwh', 'Units generated') + heroK('runhrs', 'Run hours') + heroItem({ cap: 'Litres per hour', display: isNum(d) && isNum(h) && h > 0 ? fmt(d / h, 1) : '—', note: 'diesel ÷ run hours' }),
    telemetry: [tele('Units', 'genkwh', 'kW', C.dg, true)],
    left: [panel('Generator ledger', periodShort(), [rows([rowK('diesel'), rowK('genkwh'), rowK('runhrs')])]), telemetryPanel()],
    right: [trendPanel('diesel', null, C.dg), rankPanel('diesel', null, C.dg), trendPanel('runhrs', 'Run hours through 2026', S1, { line: true })],
    scene: 'dg', sceneData: { marks: Math.round(h || 0) }
  };
}
function schoolsBuildings() {
  return {
    title: 'School Scorecard', eyebrow: 'All schools · ' + periodLabel(),
    lede: 'Every school side by side for the period. Select a row, or a bar in any ranking, to drill into that school across the deck.',
    accent: C.bldg,
    hero: heroK('grid', 'Grid electricity') + heroK('water', 'Water') + heroK('kwhpp', 'kWh / pupil') + heroK('lppd', 'L / pupil / day'),
    telemetry: null,
    left: [rankPanel('kwhpp', 'Energy per pupil', C.power), rankPanel('lppd', 'Water per pupil per day', C.water)],
    right: [panel('Scorecard', periodShort(), [scorecard([
      { k: 'grid', label: 'Grid kWh' }, { k: 'bill', label: 'Bill ₹L' }, { k: 'rate', label: '₹/kWh' }, { k: 'kwhpp', label: 'kWh/pupil' },
      { k: 'water', label: 'Water kL' }, { k: 'lppd', label: 'L/pupil/day' }, { k: 'pupils', label: 'Pupils' }, { k: 'tickets', label: 'Tickets' }, { k: 'repair', label: "Spend ₹'000" }
    ])])],
    scene: 'buildings', sceneData: { pairs: model().entities.map(e => ({ name: e, a: V('water', e), b: V('grid', e), sel: e === state.entity })) }
  };
}
function schoolsCompliance() {
  const m = model();
  const tbl = code => m.statusTables.find(t => t.code === code);
  const val = (t, lab) => { const r = t && t.rows.find(x => x.label.indexOf(lab) === 0); return r ? (state.entity ? r.values[state.entity] : r.values.__total) : null; };
  const amc = tbl('F'), wt = tbl('G');
  const tot = val(amc, 'TOTAL'), act = val(amc, 'ACTIVE'), exp = val(amc, 'EXPIRED'), inc = val(amc, 'INCOMPLETE');
  const over = val(wt, 'Results above limit — all'), ro = val(wt, 'Results above limit — drinking'), n = val(wt, 'Numeric');
  return {
    title: 'AMC & Water Tests', eyebrow: 'Compliance · ' + (state.entity || 'All Schools') + ' · as of the audit date',
    lede: 'Contract status from AMC-LOG and lab results from WATER TESTS. These are not month-filtered; they follow the school selection.',
    accent: C.chem,
    hero: heroItem({ cap: 'AMC active', display: fmt(act, 0), note: 'of ' + fmt(tot, 0) + ' records', color: 'var(--good)' }) +
      heroItem({ cap: 'AMC expired', display: fmt(exp, 0), note: 'needs renewal', color: exp ? 'var(--crit)' : 'var(--ink)' }) +
      heroItem({ cap: 'Tests above limit', display: fmt(over, 0), note: 'of ' + fmt(n, 0) + ' results' }) +
      heroItem({ cap: 'Drinking / RO over', display: fmt(ro, 0), note: 'drinking-water points', color: ro ? 'var(--crit)' : 'var(--good)' }),
    telemetry: null,
    left: amc ? [panel('AMC contracts', 'AMC-LOG status', [rows(amc.rows.map(r => {
      const v = state.entity ? r.values[state.entity] : r.values.__total;
      return { k: esc(r.label.charAt(0) + r.label.slice(1).toLowerCase()), v: fmt(v, 0), sev: /EXPIRED|DATE ERROR/.test(r.label) && v ? 'crit' : /EXPIRING|INCOMPLETE/.test(r.label) && v ? 'warn' : /ACTIVE/.test(r.label) ? 'good' : null };
    }))]), panel('Contract health', 'share of records', [gauges([
      gauge(isNum(act) && tot ? act / tot : null, 1, { caption: 'Active', display: isNum(act) && tot ? pct(act / tot) : '—', color: 'var(--good)' }),
      gauge(isNum(inc) && tot ? inc / tot : null, 1, { caption: 'Incomplete', display: isNum(inc) && tot ? pct(inc / tot) : '—', color: 'var(--warn)' })
    ])])] : [],
    right: wt ? [panel('Water-test results', 'WATER TESTS', [rows(wt.rows.map(r => { const v = state.entity ? r.values[state.entity] : r.values.__total; return { k: esc(r.label), v: fmt(v, 0), sev: /above/.test(r.label) && v ? (/drinking/.test(r.label) ? 'crit' : 'warn') : null }; }))]),
      panel('Expired contracts by school', 'AMC-LOG', [rankList(m.entities.map(e => ({ name: e, value: (amc.rows.find(r => r.label === 'EXPIRED') || { values: {} }).values[e] })), 'var(--crit)', '', 10, true)]),
      findingsPanel()] : [],
    scene: 'chem', sceneData: { vessels: [
      { label: 'ACTIVE', hex: 0x2fbf71, f: isNum(act) && tot ? act / tot : 0.1 },
      { label: 'EXPIRED', hex: 0xe05252, f: isNum(exp) && tot ? exp / tot : 0.1 },
      { label: 'TESTS OVER', hex: 0x3987e5, f: isNum(over) && n ? over / n : 0.1 }
    ] }
  };
}

/* ------------------------------ AGA KHAN ACADEMY ------------------------------ */
function campusOverview() {
  const m = model();
  const comp = V('complete');
  return {
    title: state.entity || 'Campus Overview',
    eyebrow: 'Overview · ' + m.entities.length + ' metered facilities · ' + periodLabel(),
    lede: m.subtitle,
    accent: C.overview,
    hero: heroK('water', 'Water consumed') + heroK('ht', 'HT electricity') + heroK('bill', 'Energy bill') + heroK('solar', 'Solar generation'),
    telemetry: [tele('HT load', 'ht', 'kW', C.power, true), tele('Water', 'water', 'kL/h', C.water, true), tele('Solar', 'solar', 'kW', C.solar, true)],
    left: [
      panel('Utility streams', periodShort(), [rows([rowK('water', 'Water consumed'), rowK('ht', 'HT electricity'), rowK('solar', 'Solar generation'), rowK('hvac', 'HVAC energy'), rowK('dg', 'DG units'), rowK('comp', 'Complaints')]
        .map((r, i) => r && Object.assign(r, { k: '<span style="display:inline-flex;align-items:center;gap:7px"><i style="width:7px;height:7px;border-radius:99px;background:' + [C.water, C.power, C.solar, C.hvac, C.dg, C.service][i] + ';display:inline-block"></i>' + r.k + '</span>' })))]),
      panel('Benchmarks', 'from MIS_Calc', [gauges([
        has('lpcd') && gauge(V('lpcd'), Math.max((V('lpcd') || 0) * 1.2, 200), { caption: 'LPCD vs 135', display: fmt(V('lpcd'), 0), threshold: mt('lpcd').target && mt('lpcd').target.value, color: (V('lpcd') || 0) > 135 ? 'var(--crit)' : 'var(--good)' }),
        has('complete') && gauge(comp, 1, { caption: 'Data completeness', display: pct(comp), threshold: 0.8, color: 'var(--accent)' })
      ])]),
      telemetryPanel()
    ],
    right: [
      rankPanel('fac_power', 'Metered power by facility', C.power),
      panel('Water and power through 2026', 'campus', [
        lineChart([{ name: 'Water kL', v: S('water'), color: S1, area: true }, { name: 'HT kWh ÷ 10', v: S('ht').map(v => isNum(v) ? v / 10 : v), color: S2 }], { height: 140 }),
        legend([{ name: 'Water (kL)', color: S1 }, { name: 'HT electricity (kWh ÷ 10)', color: S2 }])
      ]),
      findingsPanel()
    ],
    scene: 'overview', sceneData: { blocks: blocksFor('fac_power') }
  };
}
function campusWater() {
  return {
    title: 'Water', eyebrow: 'Sources, treatment, use · ' + periodLabel(),
    lede: 'Borewell draw and STP recycling feed the WTP; LPCD is compared with the 135 L/person/day benchmark. Facility meters show where it goes.',
    accent: C.water,
    hero: heroK('water', 'Water consumed', { color: 'var(--water)' }) + heroK('lpcd', 'LPCD') + heroK('bore', 'Borewell draw') + heroK('stp', 'STP recycled'),
    telemetry: [tele('Inlet', 'bore', 'kL/h', C.water, true), tele('WTP', 'wtp', 'kL/h', S1, true), tele('STP', 'stp', 'kL/h', S3, true)],
    left: [
      panel('Water ledger', periodShort(), [rows([rowK('bore'), rowK('stp'), rowK('wtp'), rowK('drip'), rowK('stp_share', 'STP share of inlet'), rowK('lpcd'), state.entity ? rowK('fac_water', state.entity + ' meter') : rowK('fac_water', 'Facility meters total')])]),
      panel('Benchmark', 'LPCD', [gauges([gauge(V('lpcd'), Math.max((V('lpcd') || 0) * 1.2, 200), { caption: 'L / person / day', display: fmt(V('lpcd'), 0), threshold: mt('lpcd') && mt('lpcd').target && mt('lpcd').target.value, color: (V('lpcd') || 0) > 135 ? 'var(--crit)' : 'var(--good)' }),
        has('pc_bore') && gauge(V('pc_bore'), Math.max((V('pc_bore') || 0) * 1.3, 100), { caption: 'Borewell L/person/day', display: fmt(V('pc_bore'), 0), color: 'var(--water)' })])]),
      telemetryPanel()
    ],
    right: [
      panel('Sources and treatment', 'kL per month', [lineChart([{ name: 'Borewell', v: S('bore'), color: S1, area: true }, { name: 'WTP output', v: S('wtp'), color: S2 }, { name: 'STP recycled', v: S('stp'), color: S3 }], { unit: 'kL', height: 140 }),
        legend([{ name: 'Borewell', color: S1 }, { name: 'WTP output', color: S2 }, { name: 'STP recycled', color: S3 }])]),
      rankPanel('fac_water', 'Metered water by facility', C.water),
      trendPanel('lpcd', 'LPCD against the 135 benchmark', S1, { line: true })
    ],
    scene: 'water', sceneData: { blocks: blocksFor('fac_water'), label: 'WTP' }
  };
}
function campusPower() {
  return {
    title: 'Electricity', eyebrow: 'HT supply · ' + periodLabel(),
    lede: 'HT grid energy, power factor and maximum demand from Power data, the energy performance index against 8 kWh/m², and facility meters below.',
    accent: C.power,
    hero: heroK('ht', 'HT electricity', { color: 'var(--power)' }) + heroK('bill', 'Energy bill') + heroK('pf', 'Power factor') + heroK('epi', 'EPI'),
    telemetry: [tele('HT load', 'ht', 'kW', C.power, true), tele('kVA', 'kvah', 'kVA', S2, true)],
    left: [
      panel('Energy ledger', periodShort(), [rows([rowK('ht'), rowK('kvah'), rowK('pf'), rowK('bill'), rowK('rate'), rowK('md'), rowK('smd'), rowK('epi'), state.entity ? rowK('fac_power', state.entity + ' meter') : rowK('fac_power', 'Facility meters total')])]),
      panel('Quality of supply', 'targets from MIS_Calc', [gauges([
        gauge(V('pf'), 1, { caption: 'Power factor', display: fmtK('pf', V('pf')), threshold: mt('pf') && mt('pf').target && mt('pf').target.value, color: (V('pf') || 0) >= 0.95 ? 'var(--good)' : 'var(--crit)' }),
        has('md_util') && gauge(V('md_util'), 1, { caption: 'MD vs sanctioned', display: pct(V('md_util')), color: 'var(--power)' })
      ])]),
      telemetryPanel()
    ],
    right: [trendPanel('ht', 'HT electricity through 2026', C.power), rankPanel('fac_power', 'Metered power by facility', C.power), trendPanel('epi', 'EPI against the 8 kWh/m² benchmark', S2, { line: true })],
    scene: 'power', sceneData: { blocks: blocksFor('fac_power') }
  };
}
function campusSolar() {
  return {
    title: 'Solar Generation', eyebrow: 'Rooftop and ground-mount arrays · ' + periodLabel(),
    lede: 'Generation, export to TSSPDCL and the savings booked against it, with the output of each plant.',
    accent: C.solar,
    hero: heroK('solar', 'Generated', { color: 'var(--solar)' }) + heroK('solexp', 'Exported') + heroK('solsav', 'Savings') + heroK('sol_off', 'Offsets HT draw'),
    telemetry: [tele('Array', 'solar', 'kW', C.solar, true), tele('Export', 'solexp', 'kW', S2, true)],
    left: [panel('Generation ledger', periodShort(), [rows([rowK('solar'), rowK('solexp'), rowK('solsav'), rowK('sol_off'), rowK('pc_solar')])]), telemetryPanel()],
    right: [trendPanel('solar', null, C.solar), rankPanel('solar', 'Output by plant', C.solar), trendPanel('solsav', 'Savings banked', S2, { line: true })],
    scene: 'solar', sceneData: {}
  };
}
function campusHVAC() {
  return {
    title: 'HVAC', eyebrow: 'Cooling energy · ' + periodLabel(),
    lede: 'HVAC energy from the HVAC consumption sheet, per person and by building, compared with the Avg-2025 baseline.',
    accent: C.hvac,
    hero: heroK('hvac', 'HVAC energy', { color: 'var(--hvac)' }) + heroK('pc_hvac', 'Per person') + heroItem({ cap: 'Share of HT', display: isNum(V('hvac')) && V('ht') ? pct(V('hvac') / V('ht')) : '—', note: 'HVAC ÷ HT units' }),
    telemetry: [tele('Chillers', 'hvac', 'kW', C.hvac, true)],
    left: [panel('HVAC ledger', periodShort(), [rows([rowK('hvac'), rowK('pc_hvac'), rowK('ht', 'HT electricity')])]), telemetryPanel()],
    right: [trendPanel('hvac', null, C.hvac), rankPanel('hvac', 'HVAC energy by building', C.hvac)],
    scene: 'hvac', sceneData: { blocks: blocksFor('hvac') }
  };
}
function campusDG() {
  return {
    title: 'Diesel Sets', eyebrow: 'Standby power and outages · ' + periodLabel(),
    lede: 'DG units, grid failures and outage time from DG Units Generated. One marker on the ring per logged failure.',
    accent: C.dg,
    hero: heroK('dg', 'DG units', { color: 'var(--dg)' }) + heroK('dgfail', 'Power failures') + heroK('dghrs', 'Outage time'),
    telemetry: [tele('DG', 'dg', 'kW', C.dg, true)],
    left: [panel('Standby ledger', periodShort(), [rows([rowK('dg'), rowK('dgfail'), rowK('dghrs'), rowK('pc_dg')])]), telemetryPanel()],
    right: [trendPanel('dgfail', 'Power failures through 2026', C.dg), trendPanel('dg', 'DG units through 2026', S1, { line: true })],
    scene: 'dg', sceneData: { marks: V('dgfail') }
  };
}
function campusService() {
  const cl = V('closure');
  return {
    title: 'Service Desk', eyebrow: 'Complaints · ' + periodLabel(),
    lede: 'Complaints received and closed from the Complaints summary, with the closure rate against its 95% target. Green tags are closed, amber are open.',
    accent: C.service,
    hero: heroK('comp', 'Received', { color: 'var(--service)' }) + heroK('closed', 'Closed') + heroK('closure', 'Closure rate') + heroK('emerg', 'Emergencies'),
    telemetry: null,
    left: [panel('Desk ledger', periodShort(), [rows([rowK('comp'), rowK('closed'), rowK('closure'), rowK('pend'), rowK('emerg'), rowK('pc_comp')])]),
      panel('Closure', 'target 95%', [gauges([gauge(cl, 1, { caption: 'Closure rate', display: pct(cl), threshold: mt('closure') && mt('closure').target && mt('closure').target.value, color: (cl || 0) >= 0.95 ? 'var(--good)' : 'var(--warn)' })])])],
    right: [trendPanel('comp', 'Complaints through 2026', C.service), trendPanel('closure', 'Closure rate', S3, { line: true }), findingsPanel()],
    scene: 'service', sceneData: { count: V('comp'), closed: cl, fill: cl, label: 'SERVICE DESK' }
  };
}
function campusTeam() {
  const dp = V('deploy');
  return {
    title: 'Technical Team', eyebrow: 'Manpower · ' + periodLabel(),
    lede: 'Technical man-days present against deployed, headcount and contract cost from Attendance and Technical manpower cost.',
    accent: C.team,
    hero: heroK('deploy', 'Deployment', { color: 'var(--team)' }) + heroK('present', 'Man-days present') + heroK('head', 'Headcount') + heroK('tech', 'Contract cost'),
    telemetry: null,
    left: [panel('Team ledger', periodShort(), [rows([rowK('present'), rowK('deployed'), rowK('deploy'), rowK('head'), rowK('ot'), rowK('tech'), rowK('techb'), rowK('pp_tech')])]),
      panel('Deployment', 'target 90%', [gauges([gauge(dp, 1, { caption: 'Present ÷ deployed', display: pct(dp), threshold: mt('deploy') && mt('deploy').target && mt('deploy').target.value, color: (dp || 0) >= 0.9 ? 'var(--good)' : 'var(--warn)' })])])],
    right: [trendPanel('deploy', 'Deployment through 2026', C.team, { line: true }), trendPanel('present', 'Man-days present', S1)],
    scene: 'manpower', sceneData: { head: V('head'), deploy: dp, label: 'DEPLOYMENT' }
  };
}
function campusBuildings() {
  return {
    title: 'Facility Scorecard', eyebrow: 'Water and power meters · ' + periodLabel(),
    lede: 'Each facility’s metered water (blue) and power (amber) for the period. Select a row, or a bar in any ranking, to drill in across the deck.',
    accent: C.bldg,
    hero: heroK('fac_water', 'Metered water') + heroK('fac_power', 'Metered power') + heroItem({ cap: 'Facilities', display: String(model().entities.length), note: 'on Building_Master' }),
    telemetry: null,
    left: [rankPanel('fac_water', 'Water by facility', C.water), rankPanel('fac_power', 'Power by facility', C.power)],
    right: [panel('Scorecard', periodShort(), [scorecard([{ k: 'fac_water', label: 'Water kL' }, { k: 'fac_power', label: 'Power kWh' }])])],
    scene: 'buildings', sceneData: { pairs: model().entities.map(e => ({ name: e, a: V('fac_water', e), b: V('fac_power', e), sel: e === state.entity })) }
  };
}
function sheetsOnly() {
  return {
    title: model().title, eyebrow: 'Workbook without an MIS_Calc sheet', lede: 'This workbook has no MIS_Calc sheet in either recognised layout, so only the sheet viewer is available. Open Sheets in the top bar.',
    accent: C.overview, hero: '', telemetry: null, left: [], right: [], scene: 'overview', sceneData: {}
  };
}

const ICON = {
  overview: 'M3 12h4l3-8 4 16 3-8h4', water: 'M12 3s6 7 6 11a6 6 0 0 1-12 0c0-4 6-11 6-11z',
  power: 'M13 2 4 14h7l-1 8 9-12h-7z', solar: 'M12 5a4 4 0 1 0 0 8 4 4 0 0 0 0-8M12 1v2M12 19v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  dg: 'M4 8h13a3 3 0 0 1 3 3v5H4zM7 16v3M17 16v3M7 8V5h6v3', team: 'M16 20v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2M9.5 6.5a3 3 0 1 1-6 0 3 3 0 0 1 6 0M21 20v-2a4 4 0 0 0-3-3.9M16.5 3.6a3 3 0 0 1 0 5.8',
  bldg: 'M3 21h18M5 21V7l5-4v18M14 21V11l5-3v13M8 10h.01M8 14h.01M17 13h.01M17 17h.01', chem: 'M9 3v6l-5 9a2 2 0 0 0 2 3h12a2 2 0 0 0 2-3l-5-9V3M9 3h6M7 15h10',
  service: 'M14.7 6.3a4 4 0 0 0-5.4 5.4L3 18l3 3 6.3-6.3a4 4 0 0 0 5.4-5.4l-2.6 2.6-2.4-.6-.6-2.4z', hvac: 'M12 2v20M3 7l18 10M21 7 3 17'
};
const HEXMAP = { overview: 0x7d94a6, water: 0x3987e5, power: 0xc98500, solar: 0xd95926, dg: 0x9085e9, team: 0xe66767, bldg: 0x2fbf71, chem: 0x199e70, service: 0xd55181, hvac: 0x35b8c9 };
function modulesFor(m) {
  if (m.layout === 'schools') return [
    { id: 'overview', label: 'Overview', c: 'overview', build: schoolsOverview },
    { id: 'power', label: 'Electricity', c: 'power', build: schoolsPower },
    { id: 'solar', label: 'Solar', c: 'solar', build: schoolsSolar },
    { id: 'water', label: 'Water', c: 'water', build: schoolsWater },
    { id: 'repairs', label: 'Repairs', c: 'service', build: schoolsRepairs },
    { id: 'dg', label: 'Generators', c: 'dg', build: schoolsDG },
    { id: 'buildings', label: 'Schools', c: 'bldg', build: schoolsBuildings },
    { id: 'compliance', label: 'AMC & Tests', c: 'chem', build: schoolsCompliance }
  ];
  if (m.layout === 'campus') return [
    { id: 'overview', label: 'Overview', c: 'overview', build: campusOverview },
    { id: 'water', label: 'Water', c: 'water', build: campusWater },
    { id: 'power', label: 'Electricity', c: 'power', build: campusPower },
    { id: 'solar', label: 'Solar', c: 'solar', build: campusSolar },
    { id: 'hvac', label: 'HVAC', c: 'hvac', build: campusHVAC },
    { id: 'dg', label: 'Diesel sets', c: 'dg', build: campusDG },
    { id: 'service', label: 'Service desk', c: 'service', build: campusService },
    { id: 'team', label: 'Team', c: 'team', build: campusTeam },
    { id: 'buildings', label: 'Facilities', c: 'bldg', build: campusBuildings }
  ];
  return [{ id: 'overview', label: 'Sheets', c: 'overview', build: sheetsOnly }];
}
let MODULES = [];

/* ============================================================================
   CONTROLLER — workbook, period and school / facility selection, routing,
   presentation mode, telemetry, sheet viewer.
   ============================================================================ */
const elBook = $('#sel-book'), elMonth = $('#sel-month'), elEnt = $('#sel-ent');
const colL = $('#col-left'), colR = $('#col-right'), hud = $('#hud');
const tabsHost = $('#tabs');

function load(k) { try { return JSON.parse(localStorage.getItem('fm-deck:' + k)); } catch (e) { return null; } }
function save(k, v) { try { localStorage.setItem('fm-deck:' + k, JSON.stringify(v)); } catch (e) { /* storage blocked */ } }
function persist() { save('state', { book: books[state.book] && books[state.book].id, month: state.month, entity: state.entity, module: state.module }); }
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toast.t); toast.t = setTimeout(() => { t.hidden = true; }, 3600);
}

function b64ToBytes(b64) { const bin = atob(b64), out = new Uint8Array(bin.length); for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i); return out; }
function addBook(bytes, fileName) {
  const wb = XLSX.read(bytes, { type: 'array' });
  const m = E.parseWorkbook(XLSX, wb, fileName);
  const name = (m.title.split('|')[0] || fileName).trim().replace(/\s+/g, ' ');
  const org = (m.org || '').toUpperCase();
  let label = name.split(' ').map(w => (w === org || w.length <= 3 && /^[A-Z]+$/.test(w) && w !== 'AGA') ? w : w.charAt(0) + w.slice(1).toLowerCase()).join(' ');
  if (books.some(b => b.label === label)) label += ' (' + fileName + ')';
  books.push({ id: fileName, label: label, model: m });
  return books.length - 1;
}

function fillBooks() {
  elBook.innerHTML = books.map((b, i) => '<option value="' + i + '">' + esc(b.label) + '</option>').join('');
  elBook.value = String(state.book);
}
function fillMonths() {
  const m = model();
  let o = '<option value="ytd">Full year to date</option>';
  MONTHS.forEach((mn, i) => { if (i <= m.latestIdx) o += '<option value="' + i + '">' + mn + ' 2026</option>'; });
  elMonth.innerHTML = o;
  elMonth.disabled = m.latestIdx < 0;
  elMonth.value = String(state.month);
}
function fillEntities() {
  const m = model();
  $('#lbl-ent').textContent = m.entityLabel || 'Scope';
  let o = '<option value="">' + esc(m.allLabel || 'All') + '</option>';
  if (m.entityGroups) {
    const g = {};
    m.entities.forEach(e => { const k = m.entityGroups[e] || 'Other'; (g[k] = g[k] || []).push(e); });
    Object.keys(g).forEach(k => { o += '<optgroup label="' + esc(k) + '">' + g[k].map(e => '<option>' + esc(e) + '</option>').join('') + '</optgroup>'; });
  } else o += m.entities.map(e => '<option>' + esc(e) + '</option>').join('');
  elEnt.innerHTML = o;
  elEnt.value = state.entity;
  elEnt.disabled = !m.entities.length;
}
function buildTabs() {
  tabsHost.innerHTML = '';
  MODULES.forEach(md => {
    const b = document.createElement('button');
    b.className = 'tab'; b.type = 'button'; b.setAttribute('role', 'tab');
    b.dataset.id = md.id;
    b.innerHTML = '<span class="dotc" style="background:' + C[md.c] + '"></span>' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="' + ICON[md.c] + '"/></svg>' +
      '<span>' + esc(md.label) + '</span>';
    b.addEventListener('click', () => go(md.id));
    tabsHost.appendChild(b);
  });
  markTabs();
}
function markTabs() {
  $$('#tabs .tab').forEach(t => {
    const on = t.dataset.id === state.module;
    t.setAttribute('aria-selected', String(on));
    const md = MODULES.find(x => x.id === t.dataset.id);
    t.style.color = on ? C[md.c] : '';
  });
}

function selectBook(i, restore) {
  state.book = i;
  const m = model();
  MODULES = modulesFor(m);
  restore = restore && restore.book === books[i].id ? restore : {};
  state.month = restore.month === 'ytd' || (isNum(restore.month) && restore.month <= m.latestIdx) ? restore.month : Math.max(0, m.latestIdx);
  state.entity = restore.entity && m.entities.indexOf(restore.entity) >= 0 ? restore.entity : '';
  state.module = MODULES.some(x => x.id === restore.module) ? restore.module : (MODULES.some(x => x.id === state.module) ? state.module : 'overview');
  const sub = m.layout === 'campus' ? 'Aga Khan Academy · Hyderabad' : m.layout === 'schools' ? 'AKESI Schools · ' + m.entities.length + ' schools' : m.fileName;
  $('#mark-sub').textContent = sub;
  fillBooks(); fillMonths(); fillEntities(); buildTabs();
  fillSheets();
  if (m.layout === 'sheets') openSheets();
}

function swap(fn) {
  const sw = $('#sweep');
  sw.classList.remove('go'); void sw.offsetWidth; sw.classList.add('go');
  hud.classList.add('swapping');
  setTimeout(() => { fn(); render(); hud.classList.remove('swapping'); }, 200);
}
function go(id) {
  if (id === state.module) return;
  swap(() => { state.module = id; markTabs(); });
}
function setMonth(i) { state.month = i; elMonth.value = String(i); render(); }
function setEntity(e) { state.entity = e; elEnt.value = e; render(); }

/* ------------------------------------------------------------- telemetry */
let telemStreams = [];
function mountTelemetry(defs) {
  const host = $('#telem-host');
  telemStreams = [];
  if (!host) return;
  host.innerHTML = '';
  defs.forEach(d => {
    const row = document.createElement('div');
    row.className = 't-row';
    row.innerHTML = '<span class="t-nm">' + esc(d.name) + '</span><canvas></canvas><span class="t-v">—</span>';
    host.appendChild(row);
    telemStreams.push({ def: d, canvas: row.querySelector('canvas'), readout: row.querySelector('.t-v'), hist: [] });
  });
  const note = document.createElement('div');
  note.style.cssText = 'font-size:10.5px;color:var(--ink-4);line-height:1.5;margin-top:2px';
  note.textContent = 'Sub-minute shape is modelled from the period’s metered totals. The workbook has no live meter feed.';
  host.appendChild(note);
}
function tickTelemetry() {
  const now = Date.now() / 1000;
  let loadNorm = 0.5;
  telemStreams.forEach((s, si) => {
    const base = isNum(s.def.base) ? s.def.base * s.def.scale : null;
    let v = null;
    if (isNum(base)) {
      const hour = new Date().getHours() + new Date().getMinutes() / 60;
      const diurnal = 0.62 + 0.38 * Math.sin(((hour - 5) / 24) * Math.PI * 2);
      const drift = 1 + 0.09 * Math.sin(now / 37 + si * 2.1);
      const noise = 1 + (Math.sin(now * 3.1 + si * 7.3) * 0.5 + Math.sin(now * 8.7 + si * 2.9) * 0.3) * 0.055;
      v = base * diurnal * drift * noise;
    }
    s.hist.push(v);
    if (s.hist.length > 90) s.hist.shift();
    s.readout.textContent = isNum(v) ? compact(v) + ' ' + s.def.unit : '— ' + s.def.unit;
    if (si === 0 && isNum(v) && isNum(base) && base > 0) loadNorm = Math.max(0.15, Math.min(1.5, v / base));
    drawSpark(s);
  });
  if (Stage.ok) Stage.setRate(loadNorm);
}
function drawSpark(s) {
  const cv = s.canvas;
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = cv.clientWidth || 140, h = 26;
  if (cv.width !== w * dpr) { cv.width = w * dpr; cv.height = h * dpr; }
  const g = cv.getContext('2d');
  g.setTransform(dpr, 0, 0, dpr, 0, 0);
  g.clearRect(0, 0, w, h);
  const vals = s.hist.filter(isNum);
  if (!vals.length) { g.strokeStyle = 'rgba(97,118,138,.5)'; g.setLineDash([3, 3]); g.beginPath(); g.moveTo(0, h / 2); g.lineTo(w, h / 2); g.stroke(); g.setLineDash([]); return; }
  const mn = Math.min.apply(null, vals) * 0.96, mx = Math.max.apply(null, vals) * 1.04 || 1;
  const col = s.def.color.indexOf('var(') === 0 ? getComputedStyle(document.documentElement).getPropertyValue(s.def.color.slice(4, -1)).trim() : s.def.color;
  const X = i => (i / Math.max(1, s.hist.length - 1)) * w;
  const Y = v => h - 2 - ((v - mn) / Math.max(1e-6, mx - mn)) * (h - 5);
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, col + '55'); grad.addColorStop(1, col + '00');
  g.beginPath();
  let started = false, lastX = 0, lastV = null;
  s.hist.forEach((v, i) => { if (isNum(v)) { const x = X(i), y = Y(v); if (!started) { g.moveTo(x, y); started = true; } else g.lineTo(x, y); lastX = x; lastV = v; } });
  g.strokeStyle = col; g.lineWidth = 1.5; g.stroke();
  g.lineTo(lastX, h); g.lineTo(0, h); g.closePath(); g.fillStyle = grad; g.fill();
  if (isNum(lastV)) { g.beginPath(); g.arc(lastX, Y(lastV), 2.2, 0, Math.PI * 2); g.fillStyle = col; g.fill(); }
}

/* ---------------------------------------------------------------- render */
function render() {
  if (!books.length) return;
  persist();
  const md = MODULES.find(x => x.id === state.module) || MODULES[0];
  const view = md.build();
  document.documentElement.style.setProperty('--accent', view.accent);
  $('#mod-eyebrow').textContent = view.eyebrow;
  $('#mod-title').textContent = view.title;
  $('#mod-lede').textContent = view.lede || '';
  $('#hero').innerHTML = view.hero;
  $('#hero').hidden = !view.hero;
  colL.innerHTML = ''; colR.innerHTML = '';
  view.left.filter(Boolean).forEach(p => colL.appendChild(p));
  view.right.filter(Boolean).forEach(p => colR.appendChild(p));
  telemStreams = [];
  if (view.telemetry) { mountTelemetry(view.telemetry.filter(Boolean)); tickTelemetry(); }
  if (Stage.ok) Stage.show(view.scene, HEXMAP[md.c], view.sceneData);
  document.title = view.title + ' · Facilities MIS';
}

/* --------------------------------------------------------- sheet viewer */
let sheetIdx = 0;
function fillSheets() {
  const m = model();
  $('#sel-sheet').innerHTML = m.sheets.map((s, i) => '<option value="' + i + '">' + esc(s.name) + '</option>').join('');
  sheetIdx = 0; $('#sel-sheet').value = '0'; $('#sheet-filter').value = '';
  if (!$('#sheets').hidden) renderSheet();
}
function colName(i) { let s = ''; i++; while (i > 0) { const r = (i - 1) % 26; s = String.fromCharCode(65 + r) + s; i = Math.floor((i - 1) / 26); } return s; }
function renderSheet() {
  const sh = model().sheets[sheetIdx];
  if (!sh) { $('#sheet').innerHTML = ''; return; }
  const q = $('#sheet-filter').value.trim().toLowerCase();
  let width = 0;
  sh.rows.forEach(r => { for (let c = r.length - 1; c >= 0; c--) if (r[c] !== '' && r[c] != null) { width = Math.max(width, c + 1); break; } });
  const nonEmpty = [], shown = [];
  sh.rows.forEach((r, i) => {
    if (!r.some(v => v !== '' && v != null)) return;
    nonEmpty.push(i);
    if (!q || r.some(v => String(v).toLowerCase().indexOf(q) >= 0)) shown.push(i);
  });
  const limit = 1500;
  const qe = esc(q);
  const hl = s => { const e = esc(s); if (!q) return e; const i = e.toLowerCase().indexOf(qe); return i < 0 ? e : e.slice(0, i) + '<mark>' + e.slice(i, i + qe.length) + '</mark>' + e.slice(i + qe.length); };
  let h = '<thead><tr><th class="rn">#</th>';
  for (let c = 0; c < width; c++) h += '<th>' + colName(c) + '</th>';
  h += '</tr></thead><tbody>';
  shown.slice(0, limit).forEach(i => {
    const r = sh.rows[i];
    h += '<tr><td class="rn">' + (i + 1) + '</td>';
    for (let c = 0; c < width; c++) { const v = r[c] == null ? '' : String(r[c]); h += '<td' + (/^[-₹]?[\d,.]+%?$/.test(v) ? ' class="n"' : '') + ' title="' + esc(v) + '">' + hl(v) + '</td>'; }
    h += '</tr>';
  });
  $('#sheet').innerHTML = h + '</tbody>';
  $('#sheet-info').textContent = shown.length + ' of ' + nonEmpty.length + ' rows · ' + width + ' columns' + (shown.length > limit ? ' · first ' + limit + ' shown' : '');
}
function openSheets() { $('#sheets').hidden = false; renderSheet(); }
function closeSheets() { $('#sheets').hidden = true; }

/* ------------------------------------------------------- presentation mode */
let autoTimer = null, autoStart = 0;
const DWELL = 15000;
function setAuto(on) {
  state.auto = on;
  $('#btn-auto').setAttribute('aria-pressed', String(on));
  $('#auto-label').textContent = on ? 'Presenting' : 'Present';
  clearInterval(autoTimer);
  if (!on) { $('#progress').style.width = '0%'; return; }
  autoStart = Date.now();
  autoTimer = setInterval(() => {
    const p = (Date.now() - autoStart) / DWELL;
    $('#progress').style.width = Math.min(100, p * 100) + '%';
    if (p >= 1) {
      autoStart = Date.now();
      const i = MODULES.findIndex(x => x.id === state.module);
      go(MODULES[(i + 1) % MODULES.length].id);
    }
  }, 180);
}

/* ---------------------------------------------------------------- events */
elBook.addEventListener('change', () => { const i = +elBook.value; swap(() => selectBook(i, null)); });
elMonth.addEventListener('change', () => { state.month = elMonth.value === 'ytd' ? 'ytd' : +elMonth.value; render(); });
elEnt.addEventListener('change', () => { state.entity = elEnt.value; render(); });
colL.addEventListener('click', drill);
colR.addEventListener('click', drill);
function drill(e) {
  const it = e.target.closest('[data-ent]');
  if (!it || e.target.closest('summary')) return;
  const name = it.dataset.ent;
  setEntity(name === state.entity ? '' : name);
}
$('#btn-auto').addEventListener('click', () => setAuto(!state.auto));
$('#btn-full').addEventListener('click', () => {
  const r = document.documentElement;
  try {
    if (!document.fullscreenElement) { const p = (r.requestFullscreen || r.webkitRequestFullscreen || function () {}).call(r); if (p && p.catch) p.catch(() => toast('Full screen is not available in this view.')); }
    else document.exitFullscreen();
  } catch (err) { toast('Full screen is not available in this view.'); }
});
$('#btn-sheets').addEventListener('click', openSheets);
$('#btn-close-sheets').addEventListener('click', closeSheets);
$('#sel-sheet').addEventListener('change', e => { sheetIdx = +e.target.value; renderSheet(); });
let ft;
$('#sheet-filter').addEventListener('input', () => { clearTimeout(ft); ft = setTimeout(renderSheet, 150); });
$('#upload').addEventListener('change', e => {
  const files = Array.prototype.slice.call(e.target.files || []);
  let pending = files.length, lastIdx = null;
  files.forEach(f => {
    const r = new FileReader();
    r.onload = () => {
      try {
        lastIdx = addBook(new Uint8Array(r.result), f.name);
        toast('Added ' + f.name + (books[lastIdx].model.layout === 'sheets' ? '. No MIS_Calc sheet found, so only Sheets is available.' : ''));
      } catch (err) { console.error(err); toast('Could not read ' + f.name + '. Save it as .xlsx and try again.'); }
      if (--pending === 0 && lastIdx !== null) { const i = lastIdx; swap(() => selectBook(i, null)); }
    };
    r.readAsArrayBuffer(f);
  });
  e.target.value = '';
});
addEventListener('keydown', e => {
  if (/^(INPUT|SELECT|TEXTAREA)$/.test(e.target.tagName || '')) return;
  if (e.key === 'Escape' && !$('#sheets').hidden) { closeSheets(); return; }
  if (!$('#sheets').hidden) return;
  const i = MODULES.findIndex(x => x.id === state.module);
  const last = model().latestIdx;
  if (e.key === 'ArrowRight' || e.key === 'PageDown') { go(MODULES[(i + 1) % MODULES.length].id); e.preventDefault(); }
  else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { go(MODULES[(i - 1 + MODULES.length) % MODULES.length].id); e.preventDefault(); }
  else if (e.key === 'ArrowDown') { const cur = state.month === 'ytd' ? -1 : state.month; state.month = cur >= last ? 'ytd' : cur + 1; elMonth.value = String(state.month); render(); e.preventDefault(); }
  else if (e.key === 'ArrowUp') { const cur = state.month === 'ytd' ? last + 1 : state.month; state.month = cur <= 0 ? 'ytd' : cur - 1; elMonth.value = String(state.month); render(); e.preventDefault(); }
  else if (e.key === 'a' || e.key === 'A') setAuto(!state.auto);
  else if (e.key === 'f' || e.key === 'F') $('#btn-full').click();
  else if (e.key === 's' || e.key === 'S') openSheets();
});

/* ------------------------------------------------------------------ clock */
function tickClock() {
  const now = new Date();
  $('#clock-time').textContent = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(now);
  $('#clock-date').textContent = new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Kolkata', weekday: 'short', day: 'numeric', month: 'short' }).format(now) + ' · IST';
}

/* -------------------------------------------------------------- lifecycle */
function boot() {
  if (!window.XLSX || !E) { $('#mod-title').textContent = 'The spreadsheet reader could not load'; $('#mod-lede').textContent = 'Check the internet connection and reload the page.'; return; }
  (window.MIS_WORKBOOKS || []).forEach(w => { try { addBook(b64ToBytes(w.data), w.file); } catch (err) { console.error(err); } });
  if (!books.length) { $('#mod-eyebrow').textContent = 'No workbook'; $('#mod-title').textContent = 'Add an MIS workbook'; $('#mod-lede').textContent = 'Use the Workbook button in the top bar to open an .xlsx file.'; return; }
  const saved = load('state') || {};
  const idx = books.findIndex(b => b.id === saved.book);
  selectBook(idx >= 0 ? idx : 0, saved);
  render();
}
if (!Stage.ok) { $('#gl').hidden = true; $('#glfallback').hidden = false; }
boot();
setInterval(tickTelemetry, 900);
tickClock(); setInterval(tickClock, 1000);
function sizeStage() { if (Stage.ok) Stage.resize(); telemStreams.forEach(drawSpark); }
addEventListener('resize', sizeStage);
sizeStage();
setTimeout(sizeStage, 120);
})();
