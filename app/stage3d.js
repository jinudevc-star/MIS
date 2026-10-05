/* ============================================================================
   THE STAGE — a single WebGL deck that swaps one machined scene for the next.
   Materials are physically-based metal lit by a procedurally generated studio
   environment, so the sheen moves as the camera moves. Each scene takes a small
   data object (heights, counts, labels) so the 3D reflects the selected
   workbook, period and school / facility.
   ============================================================================ */
window.Stage = (function () {
  'use strict';
  const api = { ok: false, show: function () {}, setRate: function () {}, resize: function () {} };
  if (typeof THREE === 'undefined') return api;

  const canvas = document.getElementById('gl');
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true, powerPreference: 'high-performance' });
  } catch (e) { return api; }
  if (!renderer || !renderer.getContext()) return api;

  renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 1.75));
  renderer.outputEncoding = THREE.sRGBEncoding;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.02;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x060a0e, 0.017);
  const camera = new THREE.PerspectiveCamera(38, 1, 0.5, 400);
  const isNum = v => typeof v === 'number' && isFinite(v);

  /* ---------------- procedural studio environment (metal needs reflections) */
  function buildEnv() {
    const c = document.createElement('canvas');
    c.width = 1024; c.height = 512;
    const g = c.getContext('2d');
    const sky = g.createLinearGradient(0, 0, 0, 512);
    sky.addColorStop(0, '#26384a'); sky.addColorStop(0.42, '#101a24');
    sky.addColorStop(0.55, '#070c11'); sky.addColorStop(1, '#02050a');
    g.fillStyle = sky; g.fillRect(0, 0, 1024, 512);
    [[200, 120, 210, 90, 'rgba(226,240,255,.95)'], [640, 90, 150, 70, 'rgba(255,224,178,.7)'],
     [880, 170, 120, 130, 'rgba(120,180,255,.6)'], [420, 330, 340, 60, 'rgba(255,255,255,.14)']].forEach(b => {
      const rg = g.createRadialGradient(b[0], b[1], 0, b[0], b[1], Math.max(b[2], b[3]));
      rg.addColorStop(0, b[4]); rg.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = rg; g.fillRect(b[0] - b[2], b[1] - b[3], b[2] * 2, b[3] * 2);
    });
    const t = new THREE.CanvasTexture(c);
    t.mapping = THREE.EquirectangularReflectionMapping;
    t.encoding = THREE.sRGBEncoding;
    try {
      const p = new THREE.PMREMGenerator(renderer);
      p.compileEquirectangularShader();
      const rt = p.fromEquirectangular(t);
      t.dispose(); p.dispose();
      return rt.texture;
    } catch (e) { return t; }
  }
  const ENV = buildEnv();
  scene.environment = ENV;

  /* --------------------------------------------------------- lighting rig */
  scene.add(new THREE.AmbientLight(0x35506b, 0.55));
  const key = new THREE.DirectionalLight(0xdfeaf5, 1.5); key.position.set(9, 16, 8); scene.add(key);
  const fill = new THREE.DirectionalLight(0x3a6ea8, 0.7); fill.position.set(-11, 6, -7); scene.add(fill);
  const accentLight = new THREE.PointLight(0x3987e5, 2.2, 70, 2); accentLight.position.set(0, 6, 6); scene.add(accentLight);

  /* ------------------------------------------------------------ materials */
  const MAT = {};
  function metal(hex, rough, metalness) {
    const k = 'm' + hex + rough + (metalness || 0);
    if (!MAT[k]) MAT[k] = new THREE.MeshStandardMaterial({ color: hex, metalness: metalness == null ? 0.96 : metalness, roughness: rough, envMap: ENV, envMapIntensity: 1.25 });
    return MAT[k];
  }
  function glowMat(hex, op) {
    return new THREE.MeshBasicMaterial({ color: hex, transparent: true, opacity: op == null ? 0.8 : op, blending: THREE.AdditiveBlending, depthWrite: false });
  }
  function glassMat(hex, op) {
    return new THREE.MeshStandardMaterial({ color: hex, metalness: 0.1, roughness: 0.08, transparent: true, opacity: op == null ? 0.22 : op, envMap: ENV, envMapIntensity: 1.6, side: THREE.DoubleSide, depthWrite: false });
  }
  const HEX = { water: 0x3987e5, power: 0xc98500, chem: 0x199e70, solar: 0xd95926, dg: 0x9085e9, service: 0xd55181, overview: 0x7d94a6, manpower: 0xe66767, buildings: 0x2fbf71, hvac: 0x35b8c9, select: 0xf0f5f9 };

  /* ------------------------------------------- the campus plate (shared) */
  function plateTexture() {
    const c = document.createElement('canvas'); c.width = c.height = 512;
    const g = c.getContext('2d');
    g.fillStyle = '#0d141b'; g.fillRect(0, 0, 512, 512);
    g.strokeStyle = 'rgba(160,190,215,.16)'; g.lineWidth = 1;
    for (let i = 0; i <= 512; i += 32) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i, 512); g.moveTo(0, i); g.lineTo(512, i); g.stroke(); }
    // khatim inlay at the centre, etched into the deck
    g.save(); g.translate(256, 256); g.strokeStyle = 'rgba(180,210,235,.4)'; g.lineWidth = 2.5;
    for (let r = 0; r < 2; r++) { g.save(); g.rotate((Math.PI / 4) * r); g.strokeRect(-110, -110, 220, 220); g.restore(); }
    g.beginPath(); g.arc(0, 0, 26, 0, Math.PI * 2); g.stroke();
    g.restore();
    const t = new THREE.CanvasTexture(c);
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    return t;
  }
  const PLATE_TEX = plateTexture();
  function makePlate(size, hex) {
    const grp = new THREE.Group();
    const tex = PLATE_TEX.clone(); tex.needsUpdate = true; tex.repeat.set(2, 2);
    const top = new THREE.Mesh(new THREE.BoxGeometry(size, 0.5, size),
      new THREE.MeshStandardMaterial({ color: 0x131c25, metalness: 0.75, roughness: 0.45, envMap: ENV, map: tex }));
    top.position.y = -0.25; grp.add(top);
    const rim = new THREE.Mesh(new THREE.BoxGeometry(size + 0.5, 0.14, size + 0.5), metal(0x8ea3b4, 0.22));
    rim.position.y = -0.52; grp.add(rim);
    const halo = new THREE.Mesh(new THREE.RingGeometry(size * 0.52, size * 0.72, 64), glowMat(hex, 0.07));
    halo.rotation.x = -Math.PI / 2; halo.position.y = -0.48; grp.add(halo);
    return grp;
  }

  /* ------------------------------------------------------ flow particles */
  function flow(curve, count, hex, size, speed) {
    const pos = new Float32Array(count * 3);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color: hex, size: size || 0.16, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false, sizeAttenuation: true }));
    const off = new Float32Array(count);
    for (let i = 0; i < count; i++) off[i] = i / count;
    pts.userData.update = function (t, rate) {
      const a = geo.attributes.position;
      for (let i = 0; i < count; i++) {
        const u = (off[i] + t * (speed || 0.09) * (rate == null ? 1 : rate)) % 1;
        const p = curve.getPointAt(u < 0 ? u + 1 : u);
        a.array[i * 3] = p.x; a.array[i * 3 + 1] = p.y; a.array[i * 3 + 2] = p.z;
      }
      a.needsUpdate = true;
    };
    return pts;
  }
  function pipe(points, radius, hex) {
    const curve = new THREE.CatmullRomCurve3(points.map(p => new THREE.Vector3(p[0], p[1], p[2])));
    const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve, 72, radius, 10, false), metal(hex || 0x7e93a5, 0.28));
    return { mesh: mesh, curve: curve };
  }
  function label3(text, hex, size) {
    const px = 30, pad = 18;
    const probe = document.createElement('canvas').getContext('2d');
    probe.font = '600 ' + px + 'px "IBM Plex Mono", monospace';
    const w = Math.ceil(probe.measureText(text).width) + pad * 2;
    const c = document.createElement('canvas'); c.width = w; c.height = 72;
    const g = c.getContext('2d');
    g.font = '600 ' + px + 'px "IBM Plex Mono", monospace';
    g.fillStyle = '#e6eef5'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(text, w / 2, 38);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, opacity: 0.85, depthWrite: false }));
    const h = size || 0.9;
    sp.scale.set(h * (w / 72), h, 1);
    return sp;
  }
  // Grid layout for n blocks on a plate of the given spread.
  function gridSpots(n, spread) {
    const cols = Math.max(2, Math.ceil(Math.sqrt(n * 1.25)));
    const rows = Math.ceil(n / cols);
    const out = [];
    for (let i = 0; i < n; i++) {
      const c = i % cols, r = Math.floor(i / cols);
      out.push([(c - (cols - 1) / 2) * spread + (r % 2 ? spread * 0.18 : 0), (r - (rows - 1) / 2) * spread]);
    }
    return out;
  }

  /* ========================================================= SCENE BUILDERS */
  const BUILD = {};

  /* --- OVERVIEW: one block per school / facility, height = its figure ---- */
  BUILD.overview = function (d) {
    const g = new THREE.Group();
    const blocksIn = (d && d.blocks && d.blocks.length) ? d.blocks : Array.from({ length: 12 }, (_, i) => ({ name: '', v: 1 + (i % 5) }));
    const size = blocksIn.length > 12 ? 28 : 24;
    g.add(makePlate(size, HEX.overview));
    const maxV = Math.max.apply(null, blocksIn.map(b => isNum(b.v) ? b.v : 0).concat([1e-9]));
    const spots = gridSpots(blocksIn.length, blocksIn.length > 12 ? 4.4 : 4.8);
    const blocks = [];
    blocksIn.forEach((b, i) => {
      const [cx, cz] = spots[i];
      const h = 0.4 + (isNum(b.v) && b.v > 0 ? b.v / maxV : 0) * 6.2;
      const w = 1.5 + (i % 4) * 0.2;
      const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, w * 0.86), metal(b.sel ? 0x8ea8bb : 0x5a6f80, 0.34));
      m.position.set(cx, h / 2, cz); g.add(m);
      const hue = b.sel ? HEX.select : (d && d.hex) || HEX.overview;
      const cap = new THREE.Mesh(new THREE.BoxGeometry(w * 1.02, 0.09, w * 0.88), glowMat(hue, 0.28));
      cap.position.set(cx, h + 0.05, cz); g.add(cap);
      const beam = new THREE.Mesh(new THREE.CylinderGeometry(b.sel ? 0.09 : 0.035, b.sel ? 0.09 : 0.035, 8, 6), glowMat(hue, 0.16));
      beam.position.set(cx, h + 4, cz); g.add(beam);
      if (b.sel) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(w * 0.95, 0.05, 8, 40), glowMat(HEX.select, 0.8));
        ring.rotation.x = -Math.PI / 2; ring.position.set(cx, 0.08, cz); g.add(ring);
        const lab = label3(b.name, HEX.select, 0.8); lab.position.set(cx, h + 1.2, cz); g.add(lab);
        blocks.push({ cap: cap, beam: beam, phase: i * 0.7, sel: true, ring: ring });
      } else blocks.push({ cap: cap, beam: beam, phase: i * 0.7 });
    });
    g.userData.update = function (t) {
      blocks.forEach(b => {
        const p = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.1 + b.phase));
        b.cap.material.opacity = b.sel ? 0.55 + p * 0.4 : 0.12 + p * 0.3;
        b.beam.material.opacity = b.sel ? 0.18 + p * 0.2 : 0.03 + p * 0.08;
        if (b.ring) { const s = 1 + ((t * 0.6) % 1) * 0.8; b.ring.scale.set(s, s, s); b.ring.material.opacity = 0.9 * (1 - (t * 0.6) % 1); }
      });
      g.rotation.y = t * 0.055;
    };
    return { group: g, cam: [0, 15.5, 25], look: [0, 2.2, 0] };
  };

  /* --- WATER: wells, treatment vessels, distribution ring ----------------- */
  BUILD.water = function (d) {
    const g = new THREE.Group();
    g.add(makePlate(24, HEX.water));
    const flows = [];
    [[-8.5, -5], [-9.6, -1], [-8.2, 3.2], [-6.4, 6.4]].forEach((w, i) => {
      const cas = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.42, 1.5, 18), metal(0x92a6b6, 0.3));
      cas.position.set(w[0], 0.75, w[1]); g.add(cas);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.5, 0.18, 18), metal(0xc6d4de, 0.16));
      cap.position.set(w[0], 1.58, w[1]); g.add(cap);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.62, 0.035, 8, 26), glowMat(HEX.water, 0.55));
      ring.rotation.x = -Math.PI / 2; ring.position.set(w[0], 0.1, w[1]); g.add(ring);
      const p = pipe([[w[0], 0.9, w[1]], [w[0] + 2, 0.7, w[1] * 0.6], [-3.4, 1.1, 0]], 0.1);
      g.add(p.mesh);
      const f = flow(p.curve, 26, HEX.water, 0.15, 0.12 + i * 0.012); g.add(f); flows.push(f);
    });
    const vessels = [];
    [[-1.2, -2.2], [-1.2, 2.2], [1.6, 0]].forEach((v, i) => {
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.05, 1.05, 4.2, 30, 1, true), metal(0x9fb3c2, 0.22));
      shell.position.set(v[0], 2.1, v[1]); g.add(shell);
      const glassShell = new THREE.Mesh(new THREE.CylinderGeometry(1.12, 1.12, 4.3, 30, 1, true), glassMat(0x8fc4ff, 0.14));
      glassShell.position.copy(shell.position); g.add(glassShell);
      const domeT = new THREE.Mesh(new THREE.SphereGeometry(1.05, 24, 12, 0, Math.PI * 2, 0, Math.PI / 2), metal(0xc6d4de, 0.14));
      domeT.position.set(v[0], 4.2, v[1]); g.add(domeT);
      const domeB = new THREE.Mesh(new THREE.SphereGeometry(1.05, 24, 12, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2), metal(0x7e93a5, 0.3));
      domeB.position.set(v[0], 0, v[1]); g.add(domeB);
      const liquid = new THREE.Mesh(new THREE.CylinderGeometry(0.98, 0.98, 1, 26), glowMat(HEX.water, 0.34));
      liquid.position.set(v[0], 1, v[1]); g.add(liquid);
      vessels.push({ liquid: liquid, phase: i * 1.3 });
    });
    g.add(label3((d && d.label) || 'WTP', HEX.water).translateY(5.6));
    const ringPts = [];
    for (let a = 0; a <= 64; a++) { const th = (a / 64) * Math.PI * 2; ringPts.push([Math.cos(th) * 7.6, 0.45, Math.sin(th) * 7.6]); }
    g.add(pipe(ringPts, 0.11, 0x8ea3b4).mesh);
    const rf = flow(new THREE.CatmullRomCurve3(ringPts.map(p => new THREE.Vector3(p[0], p[1], p[2])), true), 70, HEX.water, 0.13, 0.05);
    g.add(rf); flows.push(rf);
    const feed = pipe([[2.6, 1.6, 0], [4.6, 1.1, 1.2], [6.4, 0.5, 2.6], [7.6, 0.45, 0]], 0.12, 0x8ea3b4);
    g.add(feed.mesh);
    const ff = flow(feed.curve, 20, HEX.water, 0.15, 0.13); g.add(ff); flows.push(ff);
    // one consumer block per school / facility on the ring, height = its water
    const users = (d && d.blocks && d.blocks.length) ? d.blocks.slice(0, 18) : Array.from({ length: 9 }, (_, i) => ({ v: 1 + (i % 4) }));
    const maxV = Math.max.apply(null, users.map(b => isNum(b.v) ? b.v : 0).concat([1e-9]));
    const drops = [];
    users.forEach((b, i) => {
      const th = (i / users.length) * Math.PI * 2 + 0.3;
      const x = Math.cos(th) * 9.6, z = Math.sin(th) * 9.6;
      const h = 0.5 + (isNum(b.v) && b.v > 0 ? b.v / maxV : 0) * 3.4;
      const blk = new THREE.Mesh(new THREE.BoxGeometry(1.3, h, 1.15), metal(b.sel ? 0x8ea8bb : 0x4e6272, 0.4));
      blk.position.set(x, h / 2, z); g.add(blk);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(1.32, 0.07, 1.17), glowMat(b.sel ? HEX.select : HEX.water, b.sel ? 0.8 : 0.3));
      lamp.position.set(x, h + 0.04, z); g.add(lamp);
      const sp = pipe([[Math.cos(th) * 7.6, 0.45, Math.sin(th) * 7.6], [x, 0.45, z], [x, Math.max(0.3, h * 0.6), z]], 0.06, 0x6c8294);
      g.add(sp.mesh);
      const f2 = flow(sp.curve, 9, HEX.water, 0.1, 0.22); g.add(f2); flows.push(f2);
      drops.push({ lamp: lamp, sel: b.sel });
    });
    const stp = pipe([[6.8, 0.3, -6.2], [2, 0.3, -7.6], [-3, 0.5, -5.4], [-1.2, 0.5, -2.8]], 0.09, 0x5b7a6d);
    g.add(stp.mesh);
    const sf = flow(stp.curve, 20, HEX.chem, 0.13, 0.1); g.add(sf); flows.push(sf);
    const stpTank = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 0.9, 1.1, 24), metal(0x7b8f80, 0.32));
    stpTank.position.set(7.4, 0.55, -6.4); g.add(stpTank);
    const stpGlow = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.04, 8, 28), glowMat(HEX.chem, 0.6));
    stpGlow.rotation.x = -Math.PI / 2; stpGlow.position.set(7.4, 1.14, -6.4); g.add(stpGlow);
    g.userData.update = function (t, rate) {
      flows.forEach(f => f.userData.update(t, rate));
      vessels.forEach(v => {
        const lv = Math.max(0.4, 1.6 + Math.sin(t * 0.7 + v.phase) * 0.45 + (rate || 1) * 0.8);
        v.liquid.scale.y = lv; v.liquid.position.y = lv / 2 + 0.05;
        v.liquid.material.opacity = 0.26 + 0.14 * Math.sin(t * 1.5 + v.phase);
      });
      drops.forEach((dd, i) => { dd.lamp.material.opacity = dd.sel ? 0.6 + 0.35 * Math.sin(t * 3) : 0.16 + 0.22 * (0.5 + 0.5 * Math.sin(t * 1.6 + i)); });
      g.rotation.y = -0.35 + Math.sin(t * 0.06) * 0.22;
    };
    return { group: g, cam: [0.5, 11, 20], look: [0, 2, 0] };
  };

  /* --- ELECTRICITY: transformer, bus bars, arcs to the loads -------------- */
  BUILD.power = function (d) {
    const g = new THREE.Group();
    g.add(makePlate(24, HEX.power));
    const tank = new THREE.Mesh(new THREE.BoxGeometry(4.4, 3.2, 2.8), metal(0x6c8192, 0.34));
    tank.position.y = 1.6; g.add(tank);
    for (let i = 0; i < 14; i++) {
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.6, 0.72), metal(0x8fa4b4, 0.26));
      fin.position.set(-2.2 + (i / 13) * 4.4, 1.6, 1.72); g.add(fin);
      const fin2 = fin.clone(); fin2.position.z = -1.72; g.add(fin2);
    }
    const bushings = [];
    [-1.3, 0, 1.3].forEach(x => {
      for (let k = 0; k < 4; k++) {
        const dsk = new THREE.Mesh(new THREE.CylinderGeometry(0.34 - k * 0.04, 0.38 - k * 0.04, 0.2, 18), metal(0xd8e2ea, 0.2, 0.3));
        dsk.position.set(x, 3.4 + k * 0.26, 0); g.add(dsk);
      }
      const term = new THREE.Mesh(new THREE.SphereGeometry(0.17, 16, 12), glowMat(HEX.power, 0.9));
      term.position.set(x, 4.5, 0); g.add(term); bushings.push(term);
    });
    const bus = new THREE.Mesh(new THREE.BoxGeometry(17, 0.16, 0.34), metal(0xcdb27a, 0.24));
    bus.position.set(0, 5.4, 0); g.add(bus);
    [-0.5, 0.5].forEach(o => { const b2 = bus.clone(); b2.position.z = o * 1.1; g.add(b2); });
    const users = (d && d.blocks && d.blocks.length) ? d.blocks.slice(0, 12) : Array.from({ length: 8 }, (_, i) => ({ v: 1 + (i % 4) }));
    const maxV = Math.max.apply(null, users.map(b => isNum(b.v) ? b.v : 0).concat([1e-9]));
    const arcs = [], loads = [];
    users.forEach((b, i) => {
      const n = users.length;
      const x = -9.5 + (i / Math.max(1, n - 1)) * 19;
      const z = (i % 2 === 0 ? 1 : -1) * (5.5 + (i % 3) * 1.6);
      const h = 0.6 + (isNum(b.v) && b.v > 0 ? b.v / maxV : 0) * 3.4;
      const blk = new THREE.Mesh(new THREE.BoxGeometry(1.7, h, 1.5), metal(b.sel ? 0x8ea8bb : 0x4e6272, 0.42));
      blk.position.set(x, h / 2, z); g.add(blk);
      const roof = new THREE.Mesh(new THREE.BoxGeometry(1.74, 0.07, 1.54), glowMat(b.sel ? HEX.select : HEX.power, 0.55));
      roof.position.set(x, h + 0.04, z); g.add(roof); loads.push(roof);
      const seg = 20;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(seg * 2 * 3), 3));
      const line = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: b.sel ? HEX.select : HEX.power, transparent: true, opacity: 0.6, blending: THREE.AdditiveBlending, depthWrite: false }));
      g.add(line);
      arcs.push({ line: line, geo: geo, seg: seg, from: new THREE.Vector3(x > 0 ? 6 : -6, 5.4, 0), to: new THREE.Vector3(x, h + 0.2, z), phase: i * 1.1, w: isNum(b.v) && b.v > 0 ? 0.4 + 0.6 * b.v / maxV : 0.15 });
    });
    const dial = new THREE.Mesh(new THREE.TorusGeometry(6.6, 0.05, 8, 96), glowMat(HEX.power, 0.3));
    dial.rotation.x = -Math.PI / 2; dial.position.y = 0.1; g.add(dial);
    const sweep = new THREE.Mesh(new THREE.RingGeometry(6.3, 6.9, 48, 1, 0, 0.9), glowMat(HEX.power, 0.42));
    sweep.rotation.x = -Math.PI / 2; sweep.position.y = 0.12; g.add(sweep);
    g.userData.update = function (t, rate) {
      const load = 0.55 + (rate == null ? 0.5 : rate) * 0.55;
      arcs.forEach(a => {
        const arr = a.geo.attributes.position.array;
        const live = Math.sin(t * 2.2 + a.phase) > -0.35;
        for (let s = 0; s < a.seg; s++) {
          for (let e = 0; e < 2; e++) {
            const u = (s + e) / a.seg;
            const j = (1 - Math.abs(u - 0.5) * 2) * 0.55 * load * a.w;
            const idx = (s * 2 + e) * 3;
            arr[idx] = a.from.x + (a.to.x - a.from.x) * u + Math.sin(t * 17 + u * 24 + a.phase) * j;
            arr[idx + 1] = a.from.y + (a.to.y - a.from.y) * u + Math.sin(u * Math.PI) * 1.4 + Math.cos(t * 21 + u * 19) * j * 0.5;
            arr[idx + 2] = a.from.z + (a.to.z - a.from.z) * u + Math.cos(t * 15 + u * 21 + a.phase) * j;
          }
        }
        a.geo.attributes.position.needsUpdate = true;
        a.line.material.opacity = live ? (0.35 + 0.45 * load) * a.w : 0.06;
      });
      bushings.forEach((b, i) => { b.material.opacity = 0.5 + 0.5 * Math.abs(Math.sin(t * 3 + i * 2.1)); });
      loads.forEach((l, i) => { l.material.opacity = 0.25 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.3 + i)); });
      sweep.rotation.z = -t * 0.9;
      g.rotation.y = Math.sin(t * 0.055) * 0.24;
    };
    return { group: g, cam: [0, 9.5, 21], look: [0, 3, 0] };
  };

  /* --- VESSELS: three dosing / test vessels, fill = share ----------------- */
  BUILD.chem = function (d) {
    const g = new THREE.Group();
    g.add(makePlate(20, HEX.chem));
    const spec = (d && d.vessels) || [{ label: 'A', hex: HEX.chem, f: 0.5 }, { label: 'B', hex: HEX.water, f: 0.5 }, { label: 'C', hex: HEX.solar, f: 0.5 }];
    const units = [];
    spec.forEach((s, i) => {
      const x = (i - (spec.length - 1) / 2) * 5.2;
      const base = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.8, 0.4, 28), metal(0x788d9e, 0.3));
      base.position.set(x, 0.2, 0); g.add(base);
      const shell = new THREE.Mesh(new THREE.CylinderGeometry(1.35, 1.35, 4.4, 32, 1, true), glassMat(0xa9cbe8, 0.16));
      shell.position.set(x, 2.6, 0); g.add(shell);
      for (let k = 0; k < 4; k++) {
        const hp = new THREE.Mesh(new THREE.TorusGeometry(1.37, 0.045, 8, 32), metal(0xc2d0da, 0.18));
        hp.rotation.x = Math.PI / 2; hp.position.set(x, 0.7 + k * 1.25, 0); g.add(hp);
      }
      const lid = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.22, 32), metal(0xcbd8e1, 0.16));
      lid.position.set(x, 4.9, 0); g.add(lid);
      const fluid = new THREE.Mesh(new THREE.CylinderGeometry(1.26, 1.26, 1, 30), glowMat(s.hex, 0.3));
      fluid.position.set(x, 1.4, 0); g.add(fluid);
      const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 4.4, 10), metal(0xd6e1e9, 0.14));
      shaft.position.set(x, 2.7, 0); g.add(shaft);
      const blades = new THREE.Group();
      for (let b = 0; b < 3; b++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.06, 0.3), metal(0xb9c8d3, 0.2)); bl.rotation.y = (b / 3) * Math.PI * 2; blades.add(bl); }
      blades.position.set(x, 1.1, 0); g.add(blades);
      const hop = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.22, 1.1, 20), metal(0x8ea3b4, 0.26));
      hop.position.set(x, 6.1, 0); g.add(hop);
      const n = 40;
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: s.hex, size: 0.13, transparent: true, opacity: 0.95, blending: THREE.AdditiveBlending, depthWrite: false })));
      g.add(label3(s.label, s.hex).translateX(x).translateY(7.2));
      units.push({ fluid: fluid, blades: blades, geo: geo, n: n, x: x, phase: i * 1.7, f: Math.max(0.08, Math.min(1, isNum(s.f) ? s.f : 0.5)) });
    });
    g.userData.update = function (t) {
      units.forEach((u, i) => {
        const lv = Math.max(0.3, u.f * 4.2 + Math.sin(t * 0.55 + u.phase) * 0.18);
        u.fluid.scale.y = lv; u.fluid.position.y = 0.45 + lv / 2;
        u.blades.rotation.y = t * (2.2 + i * 0.4);
        u.blades.position.y = 0.6 + lv * 0.4;
        const a = u.geo.attributes.position.array;
        for (let k = 0; k < u.n; k++) {
          const p = ((k / u.n) + t * 0.42) % 1;
          a[k * 3] = u.x + Math.sin(k * 12.9898 + p * 3) * 0.12;
          a[k * 3 + 1] = 5.6 - p * (5.6 - (0.45 + lv));
          a[k * 3 + 2] = Math.cos(k * 78.233 + p * 3) * 0.12;
        }
        u.geo.attributes.position.needsUpdate = true;
      });
      g.rotation.y = Math.sin(t * 0.07) * 0.3;
    };
    return { group: g, cam: [0, 7.5, 19], look: [0, 3.2, 0] };
  };

  /* --- SOLAR: tilted array, sun arc, export beams ------------------------- */
  BUILD.solar = function (d) {
    const g = new THREE.Group();
    g.add(makePlate(26, HEX.solar));
    const panels = [];
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 6; c++) {
        const x = (c - 2.5) * 3.1, z = (r - 1.5) * 3.4;
        const frame = new THREE.Group();
        const pane = new THREE.Mesh(new THREE.BoxGeometry(2.6, 0.08, 1.7), new THREE.MeshStandardMaterial({ color: 0x0f2438, metalness: 0.62, roughness: 0.16, envMap: ENV, envMapIntensity: 2.1 }));
        frame.add(pane);
        const edge = new THREE.Mesh(new THREE.BoxGeometry(2.68, 0.05, 1.78), metal(0xb9c8d3, 0.2));
        edge.position.y = -0.05; frame.add(edge);
        for (let k = 1; k < 4; k++) { const cell = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.09, 1.72), metal(0x6d8496, 0.3)); cell.position.x = -1.3 + (k / 4) * 2.6; frame.add(cell); }
        frame.rotation.x = -0.42; frame.position.set(x, 1.15, z); g.add(frame);
        const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 1.2, 8), metal(0x8ea3b4, 0.26));
        leg.position.set(x, 0.6, z + 0.5); g.add(leg);
        const leg2 = leg.clone(); leg2.position.z = z - 0.5; leg2.scale.y = 0.62; g.add(leg2);
        panels.push({ pane: pane, frame: frame, phase: (r * 6 + c) * 0.4 });
      }
    }
    const sun = new THREE.Mesh(new THREE.SphereGeometry(1.1, 24, 18), glowMat(0xffd9a0, 0.95)); g.add(sun);
    const corona = new THREE.Mesh(new THREE.SphereGeometry(2.4, 20, 14), glowMat(0xffb066, 0.12)); g.add(corona);
    const node = new THREE.Mesh(new THREE.CylinderGeometry(0.9, 1.15, 2.6, 6), metal(0x7d92a3, 0.3));
    node.position.set(0, 1.3, 9.5); g.add(node);
    const nodeGlow = new THREE.Mesh(new THREE.TorusGeometry(1.3, 0.05, 8, 30), glowMat(HEX.solar, 0.7));
    nodeGlow.rotation.x = -Math.PI / 2; nodeGlow.position.set(0, 2.7, 9.5); g.add(nodeGlow);
    const beams = [];
    for (let i = 0; i < 6; i++) {
      const p = pipe([[(i - 2.5) * 3.1, 1.3, -5.2], [(i - 2.5) * 1.6, 1.0, 2], [0, 1.4, 9.2]], 0.045, 0x7d92a3);
      g.add(p.mesh);
      const f = flow(p.curve, 16, HEX.solar, 0.13, 0.16 + i * 0.01); g.add(f); beams.push(f);
    }
    g.userData.update = function (t, rate) {
      const day = (Math.sin(t * 0.22) + 1) / 2;
      const ang = Math.PI * (1 - day);
      sun.position.set(Math.cos(ang) * 17, 2 + Math.sin(Math.PI * day) * 13, -9);
      corona.position.copy(sun.position);
      sun.material.opacity = 0.35 + day * 0.65;
      corona.material.opacity = 0.04 + day * 0.14;
      accentLight.position.copy(sun.position);
      panels.forEach(p => {
        p.frame.rotation.x = -0.42 - (day - 0.5) * 0.3;
        p.frame.rotation.z = Math.cos(ang) * 0.14;
        p.pane.material.emissive.setHex(0x1b3d5c);
        p.pane.material.emissiveIntensity = day * (0.35 + 0.3 * Math.sin(t * 2 + p.phase));
      });
      beams.forEach(b => b.userData.update(t, 0.4 + day * (rate == null ? 1 : rate)));
      nodeGlow.material.opacity = 0.25 + day * 0.6;
      g.rotation.y = Math.sin(t * 0.05) * 0.18;
    };
    return { group: g, cam: [0, 10.5, 22], look: [0, 1.6, 0] };
  };

  /* --- DG: genset, radiator fan, exhaust, one marker per event ------------ */
  BUILD.dg = function (d) {
    const g = new THREE.Group();
    g.add(makePlate(20, HEX.dg));
    const skid = new THREE.Mesh(new THREE.BoxGeometry(9, 0.45, 4), metal(0x5f7383, 0.4)); skid.position.y = 0.22; g.add(skid);
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(8.2, 3.1, 3.4), metal(0x74899a, 0.32)); canopy.position.y = 2.0; g.add(canopy);
    for (let i = 0; i < 18; i++) {
      const louvre = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 3.44), metal(0xaebecb, 0.22));
      louvre.position.set(-3.9 + i * 0.44, 1.2 + (i % 2) * 0.05, 1.72); louvre.rotation.z = 0.28; g.add(louvre);
    }
    const rad = new THREE.Mesh(new THREE.BoxGeometry(0.22, 2.4, 3), metal(0xc0cfd9, 0.2)); rad.position.set(-4.2, 2, 0); g.add(rad);
    const fan = new THREE.Group();
    for (let b = 0; b < 6; b++) {
      const bl = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.36), metal(0xd4dfe7, 0.16));
      bl.position.y = 0.5; bl.rotation.x = 0.5;
      const holder = new THREE.Group(); holder.rotation.z = (b / 6) * Math.PI * 2; holder.add(bl); fan.add(holder);
    }
    fan.position.set(-4.45, 2, 0); fan.rotation.y = Math.PI / 2; g.add(fan);
    const stack = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.34, 4.2, 20), metal(0x8ea3b4, 0.36)); stack.position.set(3.4, 4.2, -1.1); g.add(stack);
    const puffN = 60;
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(puffN * 3), 3));
    const puffs = new THREE.Points(geo, new THREE.PointsMaterial({ color: 0x9aa7b4, size: 0.34, transparent: true, opacity: 0.2, depthWrite: false }));
    g.add(puffs);
    const ring = new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.05, 8, 96), glowMat(HEX.dg, 0.35));
    ring.rotation.x = -Math.PI / 2; ring.position.y = 0.1; g.add(ring);
    const marks = [];
    const n = Math.max(0, Math.min(24, Math.round((d && d.marks) || 0)));
    for (let i = 0; i < n; i++) {
      const th = (i / n) * Math.PI * 2;
      const m = new THREE.Mesh(new THREE.SphereGeometry(0.14, 12, 10), glowMat(0xe0a63a, 0.8));
      m.position.set(Math.cos(th) * 7.2, 0.18, Math.sin(th) * 7.2); g.add(m); marks.push(m);
    }
    const flywheel = new THREE.Mesh(new THREE.TorusGeometry(0.95, 0.22, 12, 32), metal(0xa8b8c4, 0.24));
    flywheel.position.set(4.3, 2, 0); flywheel.rotation.y = Math.PI / 2; g.add(flywheel);
    g.userData.update = function (t, rate) {
      const rpm = 8 + (rate == null ? 1 : rate) * 12;
      fan.rotation.x = t * rpm; flywheel.rotation.x = t * rpm * 0.8;
      const a = geo.attributes.position.array;
      for (let i = 0; i < puffN; i++) {
        const p = ((i / puffN) + t * 0.13) % 1;
        a[i * 3] = 3.4 + Math.sin(i * 3.3 + t) * p * 1.6;
        a[i * 3 + 1] = 6.3 + p * 7;
        a[i * 3 + 2] = -1.1 + Math.cos(i * 5.1 + t) * p * 1.6;
      }
      geo.attributes.position.needsUpdate = true;
      puffs.material.opacity = 0.05 + 0.16 * (rate == null ? 1 : rate);
      marks.forEach((m, i) => { m.material.opacity = 0.25 + 0.7 * Math.max(0, Math.sin(t * 1.6 - i * 0.5)); });
      g.rotation.y = -0.4 + Math.sin(t * 0.06) * 0.25;
    };
    return { group: g, cam: [1, 7.5, 18], look: [0, 2.4, 0] };
  };

  /* --- HVAC: cooling towers, chilled-water loop, rising air --------------- */
  BUILD.hvac = function (d) {
    const g = new THREE.Group();
    g.add(makePlate(22, HEX.hvac));
    const towers = [], flows = [];
    const units = (d && d.blocks && d.blocks.length) ? d.blocks.slice(0, 12) : Array.from({ length: 6 }, (_, i) => ({ v: 1 + (i % 3) }));
    const maxV = Math.max.apply(null, units.map(b => isNum(b.v) ? b.v : 0).concat([1e-9]));
    const spots = gridSpots(units.length, 4.2);
    units.forEach((b, i) => {
      const [x, z] = spots[i];
      const f = isNum(b.v) && b.v > 0 ? b.v / maxV : 0.05;
      const h = 1.2 + f * 3.2;
      const body = new THREE.Mesh(new THREE.CylinderGeometry(1.0, 1.25, h, 24, 1, true), metal(b.sel ? 0x9fb8ca : 0x7f94a5, 0.3));
      body.position.set(x, h / 2, z); g.add(body);
      const top = new THREE.Mesh(new THREE.TorusGeometry(1.0, 0.07, 8, 28), metal(0xcbd8e1, 0.16));
      top.rotation.x = Math.PI / 2; top.position.set(x, h, z); g.add(top);
      const fan = new THREE.Group();
      for (let k = 0; k < 4; k++) { const bl = new THREE.Mesh(new THREE.BoxGeometry(1.7, 0.05, 0.26), metal(0xd4dfe7, 0.16)); bl.rotation.y = (k / 4) * Math.PI; fan.add(bl); }
      fan.position.set(x, h - 0.12, z); g.add(fan);
      const glow = new THREE.Mesh(new THREE.CircleGeometry(0.95, 24), glowMat(b.sel ? HEX.select : HEX.hvac, 0.35));
      glow.rotation.x = -Math.PI / 2; glow.position.set(x, h - 0.2, z); g.add(glow);
      const n = 26, geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(n * 3), 3));
      g.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xbfeaf2, size: 0.2, transparent: true, opacity: 0.35, blending: THREE.AdditiveBlending, depthWrite: false })));
      towers.push({ fan: fan, glow: glow, geo: geo, n: n, x: x, z: z, h: h, f: f, phase: i * 0.9, sel: b.sel });
    });
    const loop = [];
    for (let a = 0; a <= 48; a++) { const th = (a / 48) * Math.PI * 2; loop.push([Math.cos(th) * 9.4, 0.35, Math.sin(th) * 9.4]); }
    g.add(pipe(loop, 0.1, 0x8ea3b4).mesh);
    const lf = flow(new THREE.CatmullRomCurve3(loop.map(p => new THREE.Vector3(p[0], p[1], p[2])), true), 64, HEX.hvac, 0.14, 0.05);
    g.add(lf); flows.push(lf);
    g.userData.update = function (t, rate) {
      flows.forEach(f => f.userData.update(t, rate));
      towers.forEach(tw => {
        tw.fan.rotation.y = t * (3 + tw.f * 9);
        tw.glow.material.opacity = tw.sel ? 0.6 + 0.3 * Math.sin(t * 3) : 0.2 + 0.2 * Math.sin(t * 1.4 + tw.phase);
        const a = tw.geo.attributes.position.array;
        for (let k = 0; k < tw.n; k++) {
          const p = ((k / tw.n) + t * (0.18 + tw.f * 0.25)) % 1;
          a[k * 3] = tw.x + Math.sin(k * 7.1 + t) * p * 0.9;
          a[k * 3 + 1] = tw.h + p * (2 + tw.f * 4);
          a[k * 3 + 2] = tw.z + Math.cos(k * 3.7 + t) * p * 0.9;
        }
        tw.geo.attributes.position.needsUpdate = true;
      });
      g.rotation.y = Math.sin(t * 0.05) * 0.3;
    };
    return { group: g, cam: [0, 11, 21], look: [0, 2.2, 0] };
  };

  /* --- SERVICE: the ticket ring, closed in green, open in amber ----------- */
  BUILD.service = function (d) {
    const g = new THREE.Group();
    g.add(makePlate(20, HEX.service));
    const count = Math.max(4, Math.min(60, Math.round((d && d.count) || 24)));
    const closedN = Math.round(count * Math.max(0, Math.min(1, isNum(d && d.closed) ? d.closed : 1)));
    const tickets = [];
    for (let i = 0; i < count; i++) {
      const th = (i / count) * Math.PI * 2;
      const r = 6.6 + (i % 2) * 0.7;
      const done = i < closedN;
      const m = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.62, 0.06), metal(0xc6d4de, 0.2));
      m.position.set(Math.cos(th) * r, 0.8, Math.sin(th) * r); m.lookAt(0, 0.8, 0); g.add(m);
      const tag = new THREE.Mesh(new THREE.BoxGeometry(0.44, 0.1, 0.08), glowMat(done ? 0x2fbf71 : 0xe0a63a, 0.85));
      tag.position.set(Math.cos(th) * r, 1.17, Math.sin(th) * r); tag.lookAt(0, 1.17, 0); g.add(tag);
      tickets.push({ m: m, tag: tag, th: th, r: r, phase: i * 0.37, done: done });
    }
    const desk = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 2.1, 1.2, 8), metal(0x6d8090, 0.34)); desk.position.y = 0.6; g.add(desk);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 4.4, 32, 1, true), glassMat(0xbcd4e6, 0.14)); col.position.y = 3.4; g.add(col);
    const fillC = new THREE.Mesh(new THREE.CylinderGeometry(1.1, 1.1, 1, 28), glowMat(HEX.service, 0.32)); g.add(fillC);
    const capT = new THREE.Mesh(new THREE.CylinderGeometry(1.3, 1.3, 0.18, 32), metal(0xcbd8e1, 0.16)); capT.position.y = 5.65; g.add(capT);
    g.add(label3((d && d.label) || 'SERVICE DESK', HEX.service, 0.8).translateY(6.6));
    const frac = isNum(d && d.fill) ? Math.max(0.05, Math.min(1, d.fill)) : 0.6;
    g.userData.update = function (t) {
      tickets.forEach(k => {
        const bob = Math.sin(t * 1.3 + k.phase) * 0.08;
        k.m.position.y = 0.8 + bob; k.tag.position.y = 1.17 + bob;
        k.tag.material.opacity = k.done ? 0.45 + 0.35 * Math.sin(t * 1.1 + k.phase) : 0.6 + 0.4 * Math.abs(Math.sin(t * 3 + k.phase));
      });
      const h = frac * 4.2;
      fillC.scale.y = Math.max(0.05, h); fillC.position.y = 1.2 + h / 2;
      fillC.material.opacity = 0.24 + 0.1 * Math.sin(t * 1.3);
      g.rotation.y = t * 0.07;
    };
    return { group: g, cam: [0, 9.5, 19], look: [0, 2.4, 0] };
  };

  /* --- TEAM: the muster ring --------------------------------------------- */
  BUILD.manpower = function (d) {
    const g = new THREE.Group();
    g.add(makePlate(20, HEX.manpower));
    const head = Math.max(6, Math.min(40, Math.round((d && d.head) || 20)));
    const posts = [];
    for (let i = 0; i < head; i++) {
      const th = (i / head) * Math.PI * 2, r = 7.4;
      const x = Math.cos(th) * r, z = Math.sin(th) * r;
      const body = new THREE.Mesh(THREE.CapsuleGeometry ? new THREE.CapsuleGeometry(0.22, 1.1, 6, 12) : new THREE.CylinderGeometry(0.22, 0.26, 1.5, 12), metal(0x8698a8, 0.34));
      body.position.set(x, 1.1, z); g.add(body);
      const helm = new THREE.Mesh(new THREE.SphereGeometry(0.28, 16, 12), metal(0xc8d6e0, 0.2)); helm.position.set(x, 2.1, z); g.add(helm);
      const base = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.46, 0.12, 16), metal(0x5d7080, 0.4)); base.position.set(x, 0.06, z); g.add(base);
      const halo = new THREE.Mesh(new THREE.TorusGeometry(0.5, 0.03, 6, 22), glowMat(HEX.manpower, 0.7));
      halo.rotation.x = -Math.PI / 2; halo.position.set(x, 0.16, z); g.add(halo);
      posts.push({ halo: halo, helm: helm, phase: i * 0.42, idx: i });
    }
    const stand = new THREE.Mesh(new THREE.CylinderGeometry(2.1, 2.4, 0.4, 32), metal(0x6d8090, 0.34)); stand.position.y = 0.2; g.add(stand);
    const glassCol = new THREE.Mesh(new THREE.CylinderGeometry(1.7, 1.7, 5.4, 36, 1, true), glassMat(0xbcd4e6, 0.14)); glassCol.position.y = 3.1; g.add(glassCol);
    const capTop = new THREE.Mesh(new THREE.CylinderGeometry(1.82, 1.82, 0.2, 36), metal(0xcbd8e1, 0.16)); capTop.position.y = 5.9; g.add(capTop);
    const fillCol = new THREE.Mesh(new THREE.CylinderGeometry(1.6, 1.6, 1, 32), glowMat(HEX.manpower, 0.3)); g.add(fillCol);
    for (let k = 0; k < 5; k++) { const tick = new THREE.Mesh(new THREE.TorusGeometry(1.74, 0.025, 6, 36), metal(0xa6b7c4, 0.24)); tick.rotation.x = Math.PI / 2; tick.position.y = 0.6 + k * 1.1; g.add(tick); }
    g.add(label3((d && d.label) || 'DEPLOYMENT', HEX.manpower).translateY(6.8));
    const deployFrac = isNum(d && d.deploy) ? Math.max(0.1, Math.min(1, d.deploy)) : 0.85;
    const utilFrac = isNum(d && d.fill) ? Math.max(0.1, Math.min(1.1, d.fill)) : deployFrac;
    g.userData.update = function (t) {
      const onCount = Math.round(head * deployFrac);
      posts.forEach(p => {
        const on = p.idx < onCount;
        p.halo.material.opacity = on ? 0.35 + 0.45 * (0.5 + 0.5 * Math.sin(t * 1.4 + p.phase)) : 0.07;
        p.helm.position.y = 2.1 + (on ? Math.sin(t * 1.1 + p.phase) * 0.035 : 0);
      });
      const h = Math.max(0.3, utilFrac * 5.2);
      fillCol.scale.y = h; fillCol.position.y = 0.4 + h / 2;
      fillCol.material.opacity = 0.22 + 0.12 * Math.sin(t * 1.3);
      g.rotation.y = t * 0.075;
    };
    return { group: g, cam: [0, 9.5, 19], look: [0, 2.6, 0] };
  };

  /* --- BUILDINGS: paired meter stacks per school / facility --------------- */
  BUILD.buildings = function (d) {
    const g = new THREE.Group();
    const pairsIn = (d && d.pairs && d.pairs.length) ? d.pairs.slice(0, 20) : [];
    g.add(makePlate(pairsIn.length > 12 ? 28 : 24, HEX.buildings));
    const aMax = Math.max.apply(null, pairsIn.map(p => isNum(p.a) ? p.a : 0).concat([1e-9]));
    const bMax = Math.max.apply(null, pairsIn.map(p => isNum(p.b) ? p.b : 0).concat([1e-9]));
    const spots = gridSpots(pairsIn.length, 5.0);
    const pairs = [];
    pairsIn.forEach((p, i) => {
      const [cx, cz] = spots[i];
      const pad = new THREE.Mesh(new THREE.BoxGeometry(3.4, 0.14, 3.2), metal(p.sel ? 0x6d879b : 0x3f5261, 0.5));
      pad.position.set(cx, 0.07, cz); g.add(pad);
      const mk = (val, mx, hex, dx) => {
        const h = 0.35 + (isNum(val) && val > 0 ? val / mx : 0) * 5.4;
        const col = new THREE.Mesh(new THREE.BoxGeometry(1.06, h, 1.06), metal(0x63788a, 0.3)); col.position.set(cx + dx, h / 2 + 0.14, cz); g.add(col);
        const glow = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.08, 1.1), glowMat(hex, 0.6)); glow.position.set(cx + dx, h + 0.19, cz); g.add(glow);
        const shaft = new THREE.Mesh(new THREE.BoxGeometry(0.16, h * 0.9, 0.16), glowMat(hex, 0.25)); shaft.position.set(cx + dx, h / 2 + 0.14, cz + 0.56); g.add(shaft);
        return { glow: glow, shaft: shaft };
      };
      if (p.sel) {
        const ring = new THREE.Mesh(new THREE.TorusGeometry(2.3, 0.05, 8, 40), glowMat(HEX.select, 0.85));
        ring.rotation.x = -Math.PI / 2; ring.position.set(cx, 0.18, cz); g.add(ring);
        const lab = label3(p.name, HEX.select, 0.75); lab.position.set(cx, 7, cz); g.add(lab);
      }
      pairs.push({ w: mk(p.a, aMax, HEX.water, -0.8), p: mk(p.b, bMax, HEX.power, 0.8), phase: i * 0.55, sel: p.sel });
    });
    g.userData.update = function (t) {
      pairs.forEach(p => {
        const a = 0.5 + 0.5 * Math.sin(t * 1.15 + p.phase), b = 0.5 + 0.5 * Math.sin(t * 1.15 + p.phase + 1.6);
        const boost = p.sel ? 0.3 : 0;
        p.w.glow.material.opacity = 0.25 + a * 0.5 + boost; p.w.shaft.material.opacity = 0.1 + a * 0.22 + boost;
        p.p.glow.material.opacity = 0.25 + b * 0.5 + boost; p.p.shaft.material.opacity = 0.1 + b * 0.22 + boost;
      });
      g.rotation.y = -0.5 + Math.sin(t * 0.05) * 0.3;
    };
    return { group: g, cam: [0, 14, 23], look: [0, 1.8, 0] };
  };

  /* ====================================================== stage controller */
  let current = null, currentKey = null;
  const camPos = new THREE.Vector3(0, 14, 26), camLook = new THREE.Vector3(0, 2, 0);
  const tgtPos = camPos.clone(), tgtLook = camLook.clone();
  let dolly = 0, telemRate = 0.5, clock = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;

  function disposeGroup(grp) {
    grp.traverse(o => {
      if (o.geometry) o.geometry.dispose();
      if (o.material) {
        (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => {
          if (!m) return;
          if (m.map && m.map.dispose && m.map !== PLATE_TEX) m.map.dispose();
          if (!Object.values(MAT).includes(m)) m.dispose();
        });
      }
    });
  }

  api.ok = true;
  // key = scene name; data = scene data; sig changes rebuild the scene in place.
  api.show = function (key, hex, data) {
    const sig = key + '|' + JSON.stringify(data || {});
    if (sig === currentKey) return;
    const sameScene = currentKey && currentKey.split('|')[0] === key;
    if (current) { scene.remove(current.group); disposeGroup(current.group); }
    current = (BUILD[key] || BUILD.overview)(data || {});
    currentKey = sig;
    scene.add(current.group);
    tgtPos.set(current.cam[0], current.cam[1], current.cam[2]);
    tgtLook.set(current.look[0], current.look[1], current.look[2]);
    dolly = reduced ? 0 : (sameScene ? 0.35 : 1);       // eased push-in on every change
    if (hex != null) accentLight.color.setHex(hex);
  };
  api.setRate = function (r) { telemRate = Math.max(0, Math.min(1.6, r)); };
  api.resize = function () {
    const r = canvas.getBoundingClientRect();
    const w = Math.round(r.width), h = Math.round(r.height);
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.fov = w < 760 ? 48 : 38;
    camera.updateProjectionMatrix();
  };

  let lastT = performance.now();
  const tmp = new THREE.Vector3();
  function frame(now) {
    const dt = Math.min(0.05, (now - lastT) / 1000); lastT = now;
    clock += dt;
    dolly *= Math.pow(0.0025, dt);
    const push = 1 + dolly * 0.55;
    camPos.lerp(tmp.set(tgtPos.x * push, tgtPos.y * push, tgtPos.z * push), 1 - Math.pow(0.004, dt));
    camLook.lerp(tgtLook, 1 - Math.pow(0.004, dt));
    camera.position.copy(camPos);
    camera.lookAt(camLook);
    if (current && current.group.userData.update) current.group.userData.update(reduced ? 2 : clock, telemRate);
    renderer.render(scene, camera);
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  return api;
})();
