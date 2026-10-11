/*
 * MIS engine — turns an FM MIS workbook (parsed by SheetJS) into a model the
 * dashboard can filter by month and by school / facility.
 *
 * Two workbook layouts are recognised from their MIS_Calc sheet:
 *   - "schools": AKESI layout. Lettered blocks (A1., A2., …) with one row per
 *     school, Jan–Dec columns, "2026 YTD" and an "All Schools" total row.
 *   - "campus":  Aga Khan Academy layout. A monthly fact table (one row per
 *     month, one column per KPI) with Avg 2023/2024/2025 baselines, a KPI
 *     table that gives each KPI's aggregation, and per-building blocks.
 * Any other workbook still loads; it just gets the sheet viewer only.
 */
(function (root) {
  'use strict';

  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var MONTH_RE = /^(?:(.*?)\s+)?(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)-(\d{2})$/;
  var BLOCK_RE = /^([A-Z]\d*)\.\s+(.*)$/;

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    var s = String(v).replace(/[,₹\s]/g, '');
    if (s === '' || s === '–' || s === '-') return null;
    var n = Number(s);
    return isFinite(n) ? n : null;
  }
  function txt(v) { return v === null || v === undefined ? '' : String(v).trim(); }
  function norm(s) { return txt(s).toLowerCase().replace(/[^a-z0-9]+/g, ''); }

  // Header text for a cell: formatted text if SheetJS has it (dates → "Jan-26").
  function sheetGrids(XLSX, ws) {
    var raw = XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null, blankrows: true });
    var fmt = XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: '', blankrows: true });
    return { raw: raw, fmt: fmt };
  }

  function monthIndexOf(label) {
    var m = MONTH_RE.exec(txt(label));
    return m ? MONTHS.indexOf(m[2]) : -1;
  }

  // ---------- generic lettered-block parser ----------
  function parseBlocks(g) {
    var blocks = [];
    for (var r = 0; r < g.fmt.length; r++) {
      var a = txt(g.fmt[r] && g.fmt[r][0]);
      var m = BLOCK_RE.exec(a);
      if (!m) continue;
      var head = g.fmt[r + 1] || [];
      var groups = {}; // prefix -> [12 column indexes]
      var extra = {};  // header label -> column index
      for (var c = 1; c < head.length; c++) {
        var h = txt(head[c]);
        if (!h) continue;
        var mm = MONTH_RE.exec(h);
        if (mm) {
          var p = (mm[1] || '').trim();
          (groups[p] = groups[p] || new Array(12).fill(-1))[MONTHS.indexOf(mm[2])] = c;
        } else if (!(h in extra)) extra[h] = c;
      }
      if (!Object.keys(groups).length) { blocks.push({ code: m[1], title: m[2], row: r, rows: [], groups: {}, extra: extra }); continue; }
      var rows = [];
      for (var rr = r + 2; rr < g.fmt.length; rr++) {
        var name = txt(g.fmt[rr] && g.fmt[rr][0]);
        if (!name || BLOCK_RE.test(name)) break;
        var rowRaw = g.raw[rr] || [];
        var series = {};
        Object.keys(groups).forEach(function (p) {
          series[p] = groups[p].map(function (ci) { return ci < 0 ? null : num(rowRaw[ci]); });
        });
        var ex = {};
        Object.keys(extra).forEach(function (k) { ex[k] = rowRaw[extra[k]]; });
        rows.push({ name: name, series: series, extra: ex });
      }
      blocks.push({ code: m[1], title: m[2], row: r, rows: rows, groups: groups, extra: extra, head0: txt(head[0]) });
    }
    return blocks;
  }

  // Parameter rows at the top of MIS_Calc: label in A, value in B.
  function parseParams(g, upto) {
    var out = {};
    for (var r = 1; r < Math.min(upto, g.raw.length); r++) {
      var k = txt(g.fmt[r] && g.fmt[r][0]);
      if (k && g.raw[r] && g.raw[r][1] !== null && g.raw[r][1] !== undefined) out[k] = g.raw[r][1];
    }
    return out;
  }

  // ---------- FM_Dashboard text (titles, findings, sources) ----------
  function parseDashboardText(g) {
    var out = { org: '', title: '', subtitle: '', findings: [], sources: '' };
    if (!g) return out;
    out.org = txt(g.fmt[0] && g.fmt[0][0]);
    out.title = txt(g.fmt[0] && g.fmt[0][1]);
    out.subtitle = txt(g.fmt[1] && g.fmt[1][1]);
    g.fmt.forEach(function (row) {
      (row || []).forEach(function (cell) {
        var s = txt(cell);
        if (/^\d{1,2}\.\s+\S/.test(s) && s.length > 40) out.findings.push(s.replace(/^\d{1,2}\.\s+/, ''));
        else if (/^Sources:/.test(s)) out.sources = s;
      });
    });
    return out;
  }

  // ---------- helpers for metric objects ----------
  function lastIndexWithData(arr) {
    for (var i = arr.length - 1; i >= 0; i--) if (arr[i] !== null && arr[i] !== 0) return i;
    return -1;
  }
  function aggregate(arr, agg) {
    var vals = arr.filter(function (v) { return v !== null; });
    if (!vals.length) return null;
    if (agg === 'sum') return vals.reduce(function (a, b) { return a + b; }, 0);
    if (agg === 'last') return vals[vals.length - 1];
    return vals.reduce(function (a, b) { return a + b; }, 0) / vals.length; // avg / ratio fallback
  }

  // =====================================================================
  // Layout 1: schools (AKESI)
  // =====================================================================
  var SCHOOL_METRICS = {
    A1: { key: 'grid', label: 'Grid energy', unit: 'kWh', agg: 'sum', good: 'down', group: 'Energy', icon: '⚡' },
    A2: { key: 'bill', label: 'Energy bill', unit: '₹ Lakh', scale: 1e-5, agg: 'sum', good: 'down', group: 'Energy', icon: '₹' },
    A3: { key: 'solar', label: 'Solar generation', unit: 'kWh', agg: 'sum', good: 'up', group: 'Energy', icon: '☀' },
    A4: { key: 'water', label: 'Water consumed', unit: 'kL', scale: 1e-3, agg: 'sum', good: 'down', group: 'Water', icon: '💧' },
    A5: { key: 'pupils', label: 'Pupils', unit: 'pupils', agg: 'avg', group: 'People', icon: '🎓' },
    A8: { key: 'tickets', label: 'Repair tickets', unit: 'tickets', agg: 'sum', good: 'down', group: 'Repairs', icon: '🔧' },
    A9: { key: 'repair', label: 'Repair spend', unit: "₹ '000", scale: 1e-3, agg: 'sum', good: 'down', group: 'Repairs', icon: '₹' },
    A10: { key: 'genkwh', label: 'Generator units', unit: 'kWh', agg: 'sum', group: 'Generators', icon: '⛽' },
    A11: { key: 'diesel', label: 'Generator diesel', unit: 'L', agg: 'sum', good: 'down', group: 'Generators', icon: '⛽' },
    A12: { key: 'runhrs', label: 'Generator run hours', unit: 'h', agg: 'sum', group: 'Generators', icon: '⏱' },
    A15: { key: 'lppd', label: 'Water per pupil', unit: 'L / pupil / day', agg: 'ratio', good: 'down', group: 'Water', icon: '🚰' },
    A16: { key: 'rate', label: 'Energy unit cost', unit: '₹ / kWh', agg: 'ratio', good: 'down', group: 'Energy', icon: '₹' },
    A17: { key: 'kwhpp', label: 'Energy per pupil', unit: 'kWh / pupil / month', agg: 'ratio', good: 'down', group: 'Energy', icon: '🎓' }
  };

  function buildSchools(calc, dash) {
    var blocks = parseBlocks(calc);
    var params = parseParams(calc, 16);
    var entities = [];
    var metrics = {};
    var coverage = {};
    var totalName = 'All Schools';

    blocks.forEach(function (b) {
      var def = SCHOOL_METRICS[b.code];
      if (!def || !b.groups['']) return;
      var scale = def.scale || 1;
      var m = Object.assign({ monthly: {}, ytd: {}, perMonth: {}, entitySet: 'main', source: b.title }, def);
      b.rows.forEach(function (row) {
        var arr = row.series[''].map(function (v) { return v === null ? null : v * scale; });
        if (/reporting/i.test(row.name)) { coverage[def.key] = row.series['']; return; }
        var key = row.name === totalName ? '__total' : row.name;
        if (key !== '__total' && entities.indexOf(row.name) < 0) entities.push(row.name);
        m.monthly[key] = arr;
        var y = num(row.extra['2026 YTD']);
        m.ytd[key] = y === null ? null : y * scale;
        var pm = num(row.extra['Avg per logged month']);
        m.perMonth[key] = pm === null ? null : pm * scale;
      });
      metrics[def.key] = m;
    });

    // AMC status and water-test matrices (sections F and G) — not month-filtered.
    var statusTables = [];
    blocks.forEach(function (b) {
      if (b.code !== 'F' && b.code !== 'G') return;
      var head = calc.fmt[b.row + 1] || [];
      var cols = {};
      for (var c = 1; c < head.length; c++) if (txt(head[c])) cols[txt(head[c])] = c;
      var rows = [];
      for (var r = b.row + 2; r < calc.fmt.length; r++) {
        var lab = txt(calc.fmt[r][0]);
        if (!lab) break;
        var vals = {};
        Object.keys(cols).forEach(function (h) { vals[h === totalName ? '__total' : h] = num(calc.raw[r][cols[h]]); });
        rows.push({ label: lab, values: vals });
      }
      statusTables.push({ code: b.code, title: b.title.replace(/\s*\(.*$/, ''), note: (/\((.*)\)/.exec(b.title) || [])[1] || '', rows: rows });
    });

    var latest = metrics.grid ? lastIndexWithData(metrics.grid.monthly.__total) : -1;
    if (metrics.water) latest = Math.max(latest, lastIndexWithData(metrics.water.monthly.__total));

    return {
      layout: 'schools',
      entityLabel: 'School',
      allLabel: 'All Schools',
      entities: entities,
      metrics: metrics,
      coverage: coverage,
      statusTables: statusTables,
      latestIdx: latest,
      watchThreshold: num(params['Watch threshold: selection vs YTD monthly average (editable)']) || 0.15,
      cards: ['grid', 'bill', 'solar', 'water', 'lppd', 'kwhpp', 'tickets', 'repair', 'diesel', 'rate'],
      scorecard: ['grid', 'bill', 'rate', 'kwhpp', 'water', 'lppd', 'pupils', 'tickets', 'repair'],
      defaultFocus: 'grid'
    };
  }

  // =====================================================================
  // Layout 2: campus (Aga Khan Academy Hyderabad)
  // =====================================================================
  var CAMPUS_STYLE = {
    water: { good: 'down', icon: '💧', group: 'Water' }, lpcd: { good: 'down', icon: '🚰', group: 'Water', target: 'LPCD benchmark' },
    bore: { good: 'down', icon: '⛲', group: 'Water' }, stp: { good: 'up', icon: '♻', group: 'Water' }, wtp: { icon: '🚿', group: 'Water' },
    drip: { icon: '🌱', group: 'Water' }, ht: { good: 'down', icon: '⚡', group: 'Energy' }, kvah: { good: 'down', group: 'Energy' },
    pf: { good: 'up', icon: '🔌', group: 'Energy', target: 'PF target' },
    bill: { good: 'down', icon: '₹', group: 'Energy', scale: 1e-5, unit: '₹ Lakh' }, rate: { good: 'down', group: 'Energy' },
    md: { group: 'Energy' }, smd: { group: 'Energy' }, epi: { good: 'down', icon: '🏢', group: 'Energy', target: 'EPI benchmark (kWh/m²/month)' },
    solar: { good: 'up', icon: '☀', group: 'Solar' }, solexp: { group: 'Solar' }, solsav: { good: 'up', group: 'Solar', scale: 1e-5, unit: '₹ Lakh' },
    dg: { group: 'DG & outages' }, dgfail: { good: 'down', group: 'DG & outages' }, dghrs: { good: 'down', group: 'DG & outages' },
    hvac: { good: 'down', icon: '❄', group: 'HVAC' },
    comp: { good: 'down', icon: '🎫', group: 'Service desk' }, closed: { group: 'Service desk' }, pend: { good: 'down', group: 'Service desk' },
    emerg: { good: 'down', group: 'Service desk' }, closure: { good: 'up', group: 'Service desk', target: 'Closure target' },
    tech: { good: 'down', group: 'Manpower', scale: 1e-5, unit: '₹ Lakh' }, techb: { group: 'Manpower', scale: 1e-5, unit: '₹ Lakh' },
    present: { group: 'Manpower' }, deployed: { group: 'Manpower' }, deploy: { good: 'up', icon: '👷', group: 'Manpower', target: 'Deployment target' },
    ot: { good: 'down', group: 'Manpower' }, head: { group: 'Manpower' }
  };
  // Ratios recomputed from their parts when the selection spans several months.
  var CAMPUS_RATIOS = {
    pf: ['ht', 'kvah'], rate: ['bill', 'kvah'], deploy: ['present', 'deployed'], closure: ['closed', 'comp'],
    emerg_sh: ['emerg', 'comp'], sol_off: ['solar', 'ht']
  };

  function buildCampus(calc, dash) {
    var params = parseParams(calc, 16);
    // Fact table: header row whose A cell is "Month".
    var hr = -1;
    for (var r = 0; r < Math.min(60, calc.fmt.length); r++) if (txt(calc.fmt[r][0]) === 'Month') { hr = r; break; }
    var head = calc.fmt[hr];
    var monthRows = new Array(12).fill(-1), baseRows = {};
    for (r = hr + 1; r < hr + 20 && r < calc.fmt.length; r++) {
      var lab = txt(calc.fmt[r][0]);
      var mi = monthIndexOf(lab);
      if (mi >= 0) monthRows[mi] = r;
      else if (/^Avg \d{4}$/.test(lab)) baseRows[lab] = r;
    }
    var colByHeader = {};
    head.forEach(function (h, c) { if (c > 0 && txt(h)) colByHeader[norm(h)] = c; });

    // KPI table: rows of key | label | unit | agg after the "Key" header.
    var kr = -1;
    for (r = hr; r < calc.fmt.length; r++) if (txt(calc.fmt[r][0]) === 'Key') { kr = r; break; }
    var metrics = {};
    var order = [];
    for (r = kr + 1; kr >= 0 && r < calc.fmt.length; r++) {
      var key = txt(calc.fmt[r][0]);
      if (BLOCK_RE.test(key)) break;
      if (!key || !txt(calc.fmt[r][3])) continue;
      var label = txt(calc.fmt[r][1]), unit = txt(calc.fmt[r][2]), agg = txt(calc.fmt[r][3]) || 'avg';
      var col = colByHeader[norm(label + ' (' + unit + ')')];
      if (col === undefined) {
        // Fallback: header starts with the label's words.
        var nl = norm(label.replace(/\(.*\)/, ''));
        Object.keys(colByHeader).some(function (h) { if (h.indexOf(nl) === 0) { col = colByHeader[h]; return true; } return false; });
      }
      if (col === undefined) continue;
      var st = CAMPUS_STYLE[key] || {};
      var scale = st.scale || 1;
      var arr = monthRows.map(function (mr) { var v = mr < 0 ? null : num(calc.raw[mr][col]); return v === null ? null : v * scale; });
      var baselines = {};
      Object.keys(baseRows).forEach(function (b) { var v = num(calc.raw[baseRows[b]][col]); if (v !== null) baselines[b] = v * scale; });
      var target = null;
      if (st.target && num(params[st.target]) !== null) target = { value: num(params[st.target]) * scale, label: st.target.replace(/\s*\(.*$/, '') };
      var u = st.unit || unit;
      if (u === '%') u = '%';
      metrics[key] = {
        key: key, label: label.replace(/\s*\(.*$/, ''), unit: u, agg: agg, good: st.good || null, icon: st.icon || '', group: st.group || 'Per-capita & ratios',
        monthly: { __total: arr }, ytd: {}, perMonth: {}, baselines: baselines, target: target, entitySet: null, source: 'MIS_Calc fact table'
      };
      order.push(key);
    }

    // Per-building blocks.
    var blocks = parseBlocks(calc);
    var breakdowns = {};
    var entities = [], groups = {};
    blocks.forEach(function (b) {
      if (b.code === 'D' && b.groups.Water && b.groups.Power) {
        var fw = { key: 'fac_water', label: 'Metered water (building meters)', unit: 'kL', agg: 'sum', good: 'down', icon: '💧', group: 'Facilities',
          monthly: { __total: new Array(12).fill(null) }, ytd: {}, perMonth: {}, baselines: {}, entitySet: 'main', source: b.title };
        var fp = { key: 'fac_power', label: 'Metered power (building meters)', unit: 'kWh', agg: 'sum', good: 'down', icon: '⚡', group: 'Facilities',
          monthly: { __total: new Array(12).fill(null) }, ytd: {}, perMonth: {}, baselines: {}, entitySet: 'main', source: b.title };
        b.rows.forEach(function (row) {
          entities.push(row.name);
          groups[row.name] = txt(row.extra.Group);
          fw.monthly[row.name] = row.series.Water;
          fp.monthly[row.name] = row.series.Power;
          [fw, fp].forEach(function (m) {
            m.monthly[row.name].forEach(function (v, i) { if (v !== null) m.monthly.__total[i] = (m.monthly.__total[i] || 0) + v; });
          });
        });
        metrics.fac_water = fw; metrics.fac_power = fp;
      } else if ((b.code === 'C3' || b.code === 'C4' || b.code === 'C1' || b.code === 'C2') && b.groups['']) {
        var target = { C1: 'water', C2: 'ht', C3: 'hvac', C4: 'solar' }[b.code];
        var bd = { title: b.title.replace(/\s*—.*$/, ''), entities: [], monthly: {}, baseline: {} };
        b.rows.forEach(function (row) {
          bd.entities.push(row.name);
          bd.monthly[row.name] = row.series[''];
          var av = num(row.extra['Avg 2025']);
          if (av !== null) bd.baseline[row.name] = av;
        });
        if (bd.entities.length) breakdowns[target] = bd;
      }
    });
    // Water/power meter blocks duplicate the facility view; keep HVAC and solar ones.
    delete breakdowns.water; delete breakdowns.ht;
    Object.keys(breakdowns).forEach(function (k) { if (metrics[k]) metrics[k].breakdown = breakdowns[k]; });

    var latest = Math.max(
      metrics.ht ? lastIndexWithData(metrics.ht.monthly.__total) : -1,
      metrics.water ? lastIndexWithData(metrics.water.monthly.__total) : -1);

    // Every KPI except the fact-table chart helpers.
    var allKeys = ['fac_water', 'fac_power'].filter(function (k) { return metrics[k]; }).concat(order);
    return {
      layout: 'campus',
      entityLabel: 'Facility',
      allLabel: 'All Facilities',
      entities: entities,
      entityGroups: groups,
      metrics: metrics,
      metricOrder: allKeys,
      ratios: CAMPUS_RATIOS,
      coverage: {},
      statusTables: [],
      latestIdx: latest,
      params: params,
      cards: ['water', 'lpcd', 'bore', 'ht', 'bill', 'epi', 'pf', 'solar', 'hvac', 'comp', 'deploy', 'wtp'].filter(function (k) { return metrics[k]; }),
      facilityCards: ['fac_water', 'fac_power'],
      scorecard: ['fac_water', 'fac_power'],
      defaultFocus: 'water'
    };
  }

  // =====================================================================
  // Public API
  // =====================================================================
  function parseWorkbook(XLSX, wb, fileName) {
    var sheets = wb.SheetNames.map(function (n) {
      var g = sheetGrids(XLSX, wb.Sheets[n]);
      return { name: n, grid: g };
    });
    function find(name) { for (var i = 0; i < sheets.length; i++) if (sheets[i].name === name) return sheets[i].grid; return null; }
    var calc = find('MIS_Calc');
    var dash = find('FM_Dashboard');
    var text = parseDashboardText(dash);
    var model = null;
    if (calc) {
      var hasMonthTable = calc.fmt.slice(0, 60).some(function (row) { return txt(row[0]) === 'Month'; });
      var hasSchoolBlocks = calc.fmt.some(function (row) { return /^A1\.\s/.test(txt(row[0])); });
      try {
        if (hasSchoolBlocks) model = buildSchools(calc, dash);
        else if (hasMonthTable) model = buildCampus(calc, dash);
      } catch (e) { model = null; if (root.console) console.warn('MIS engine: could not read MIS_Calc', e); }
    }
    model = model || { layout: 'sheets', entities: [], metrics: {}, cards: [], scorecard: [], latestIdx: -1, coverage: {}, statusTables: [] };
    if (!model.metricOrder) model.metricOrder = Object.keys(model.metrics);
    model.fileName = fileName;
    model.org = text.org;
    model.title = text.title || fileName;
    model.subtitle = text.subtitle;
    model.findings = text.findings;
    model.sources = text.sources;
    model.months = MONTHS.map(function (m) { return m + '-26'; });
    model.sheets = sheets.map(function (s) { return { name: s.name, rows: s.grid.fmt }; });
    return model;
  }

  // Value of a metric for month index (0–11) or 'ytd', for an entity or the total.
  function valueOf(model, m, sel, entity) {
    var key = entity && m.entitySet === 'main' && m.monthly[entity] ? entity : '__total';
    var arr = m.monthly[key] || [];
    if (sel !== 'ytd') return arr[sel] === undefined ? null : arr[sel];
    var upto = model.latestIdx;
    if (m.ytd && m.ytd[key] !== undefined && m.ytd[key] !== null) return m.ytd[key];
    var r = model.ratios && model.ratios[m.key];
    if (r && model.metrics[r[0]] && model.metrics[r[1]]) {
      var a = valueOf(model, model.metrics[r[0]], 'ytd', entity), b = valueOf(model, model.metrics[r[1]], 'ytd', entity);
      if (a !== null && b) {
        // Undo display scale of the parts (bill is in ₹ Lakh) before dividing.
        var sa = (CAMPUS_STYLE[r[0]] || {}).scale || 1, sb = (CAMPUS_STYLE[r[1]] || {}).scale || 1;
        return (a / sa) / (b / sb) * ((CAMPUS_STYLE[m.key] || {}).scale || 1);
      }
    }
    return aggregate(arr.slice(0, upto + 1), m.agg === 'sum' ? 'sum' : m.agg);
  }

  // Average per logged month (used as the reference for YTD and for the watchlist).
  function monthlyAverage(model, m, entity) {
    var key = entity && m.entitySet === 'main' && m.monthly[entity] ? entity : '__total';
    if (m.perMonth && m.perMonth[key] !== undefined && m.perMonth[key] !== null) return m.perMonth[key];
    return aggregate((m.monthly[key] || []).slice(0, model.latestIdx + 1), m.agg === 'sum' ? 'avg' : m.agg);
  }

  function seriesOf(model, m, entity) {
    var key = entity && m.entitySet === 'main' && m.monthly[entity] ? entity : '__total';
    return (m.monthly[key] || new Array(12).fill(null)).slice();
  }

  var api = { parseWorkbook: parseWorkbook, valueOf: valueOf, monthlyAverage: monthlyAverage, seriesOf: seriesOf, MONTHS: MONTHS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.MISEngine = api;
})(typeof window !== 'undefined' ? window : this);
