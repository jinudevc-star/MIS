/*
 * 3D campus backdrop for the MIS dashboard (three.js r149, global THREE).
 *
 * Each school / facility is a building whose height follows the focused metric.
 * The effect layer follows the metric's subject:
 *   energy → current pulses on overhead lines from a substation
 *   water  → rippling reservoir surface and flow through ground pipes
 *   solar  → a sun with light streaming onto the roofs
 *   hvac   → cool air rising and swirling above the roofs
 *   other  → slow orbiting data motes
 * Selection changes ease the camera, heights and colours instead of jumping.
 */
(function (root) {
  'use strict';
  var THREE = root.THREE;

  var S = null; // scene state

  function lerp(a, b, t) { return a + (b - a) * t; }
  function damp(a, b, k, dt) { return lerp(a, b, 1 - Math.exp(-k * dt)); }

  function modeFor(group, key) {
    var g = (group || '').toLowerCase(), k = (key || '').toLowerCase();
    if (/solar/.test(g) || /solar|sol/.test(k)) return 'solar';
    if (/hvac/.test(g) || /hvac/.test(k)) return 'hvac';
    if (/water/.test(g) || /water|lpcd|lppd|bore|stp|wtp|drip/.test(k)) return 'water';
    if (/energy|generator|dg/.test(g) || /grid|ht|kwh|power|bill|rate|pf|epi|diesel|gen/.test(k)) return 'energy';
    return 'other';
  }

  var MODE_COLORS = {
    energy: { flow: 0xffb020, glow: 0xff8a00 },
    water: { flow: 0x38bdf8, glow: 0x0ea5e9 },
    solar: { flow: 0xffe066, glow: 0xffc300 },
    hvac: { flow: 0x7dd3fc, glow: 0xa5f3fc },
    other: { flow: 0x5eead4, glow: 0x2dd4bf }
  };

  // ---------- particle flow along curves ----------
  function makeFlow(count) {
    var geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(count * 3), 3));
    geo.setAttribute('alpha', new THREE.BufferAttribute(new Float32Array(count), 1));
    var mat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: new THREE.Color(0xffb020) }, uSize: { value: 22 }, uOpacity: { value: 1 } },
      vertexShader: 'attribute float alpha; varying float vA; uniform float uSize;' +
        'void main(){ vA = alpha; vec4 mv = modelViewMatrix * vec4(position,1.0); gl_PointSize = uSize * (10.0 / -mv.z); gl_Position = projectionMatrix * mv; }',
      fragmentShader: 'uniform vec3 uColor; uniform float uOpacity; varying float vA;' +
        'void main(){ float d = length(gl_PointCoord - 0.5); float a = smoothstep(0.5, 0.0, d); gl_FragColor = vec4(uColor, a * vA * uOpacity); }',
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending
    });
    var pts = new THREE.Points(geo, mat);
    pts.frustumCulled = false;
    return { points: pts, count: count, curves: [], seeds: new Float32Array(count).map(function () { return Math.random(); }), speed: 0.25 };
  }

  function buildCurves(mode, buildings) {
    var curves = [];
    var hub = new THREE.Vector3(0, 0, S.layout.depth / 2 + 7);
    buildings.forEach(function (b) {
      var top = new THREE.Vector3(b.x, b.h + 0.2, b.z);
      var base = new THREE.Vector3(b.x, 0.15, b.z);
      if (mode === 'energy') {
        var mid = hub.clone().lerp(top, 0.5); mid.y = Math.max(top.y, 4) + 5;
        curves.push(new THREE.QuadraticBezierCurve3(new THREE.Vector3(hub.x, 3.2, hub.z), mid, top));
      } else if (mode === 'water') {
        var res = new THREE.Vector3(0, 0.15, -S.layout.depth / 2 - 8);
        curves.push(new THREE.CubicBezierCurve3(res, new THREE.Vector3(res.x, 0.15, b.z), new THREE.Vector3(b.x, 0.15, res.z * 0.2 + b.z * 0.8), base));
      } else if (mode === 'solar') {
        curves.push(new THREE.LineCurve3(S.sunPos.clone(), top));
      } else if (mode === 'hvac') {
        var c1 = top.clone().add(new THREE.Vector3(1.5, 3, 0)), c2 = top.clone().add(new THREE.Vector3(-1.5, 6, 1.5));
        curves.push(new THREE.CubicBezierCurve3(top, c1, c2, top.clone().add(new THREE.Vector3(0, 9, 0))));
      } else {
        var r = 3 + Math.random() * 2, a0 = Math.random() * Math.PI * 2;
        var pts = [];
        for (var i = 0; i <= 8; i++) { var a = a0 + i / 8 * Math.PI * 2; pts.push(new THREE.Vector3(b.x + Math.cos(a) * r * 0.6, b.h * 0.5 + 1 + Math.sin(a * 2) * 0.6, b.z + Math.sin(a) * r * 0.6)); }
        curves.push(new THREE.CatmullRomCurve3(pts, true));
      }
    });
    return curves;
  }

  // Static line geometry that visualises the routes (power lines, pipes).
  function rebuildRoutes(mode, curves) {
    if (S.routes) { S.scene.remove(S.routes); S.routes.geometry.dispose(); }
    var pos = [];
    if (mode === 'energy' || mode === 'water') {
      curves.forEach(function (c) {
        var p = c.getPoints(24);
        for (var i = 0; i < p.length - 1; i++) pos.push(p[i].x, p[i].y, p[i].z, p[i + 1].x, p[i + 1].y, p[i + 1].z);
      });
    }
    var g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    S.routes = new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color: MODE_COLORS[mode].flow, transparent: true, opacity: 0, depthWrite: false }));
    S.scene.add(S.routes);
  }

  // ---------- init ----------
  function init(canvas) {
    if (!THREE || S) return !!S;
    try {
      var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: false, powerPreference: 'low-power' });
      renderer.setPixelRatio(Math.min(root.devicePixelRatio || 1, 1.75));
      renderer.outputEncoding = THREE.sRGBEncoding;
      var scene = new THREE.Scene();
      var camera = new THREE.PerspectiveCamera(42, 1, 0.5, 400);
      S = {
        renderer: renderer, scene: scene, camera: camera, canvas: canvas, buildings: [], byName: {}, mode: 'other',
        target: new THREE.Vector3(), targetGoal: new THREE.Vector3(), orbit: 0.6, radius: 46, radiusGoal: 46, mouse: { x: 0, y: 0, sx: 0, sy: 0 },
        bg: new THREE.Color(0x0f1615), fogColor: new THREE.Color(0x0f1615), edge: new THREE.Color(0x4fc1b1), body: new THREE.Color(0x1f2c2a), accent: new THREE.Color(0x4fc1b1),
        layout: { width: 20, depth: 20 }, t: 0, last: performance.now(), visible: true,
        reduced: root.matchMedia && root.matchMedia('(prefers-reduced-motion: reduce)').matches,
        sunPos: new THREE.Vector3(-26, 34, -30), modeMix: { water: 0, solar: 0 }
      };
      scene.fog = new THREE.FogExp2(S.fogColor, 0.012);
      scene.add(new THREE.HemisphereLight(0xdff7f2, 0x0b1211, 0.75));
      var dir = new THREE.DirectionalLight(0xffffff, 0.85); dir.position.set(-20, 40, 15); scene.add(dir);
      S.dir = dir;

      // Ground: fine grid plus a soft accent disc under the campus.
      var grid = new THREE.GridHelper(220, 110, 0x2c3b38, 0x2c3b38);
      grid.material.transparent = true; grid.material.opacity = 0.35; grid.material.depthWrite = false;
      scene.add(grid); S.grid = grid;
      var disc = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshBasicMaterial({ color: 0x4fc1b1, transparent: true, opacity: 0.06, depthWrite: false }));
      disc.rotation.x = -Math.PI / 2; disc.position.y = 0.01; scene.add(disc); S.disc = disc;

      // Water surface (reservoir) — animated wireframe plane.
      var wgeo = new THREE.PlaneGeometry(120, 120, 70, 70);
      wgeo.rotateX(-Math.PI / 2);
      S.waterBase = Float32Array.from(wgeo.attributes.position.array);
      S.water = new THREE.Mesh(wgeo, new THREE.MeshBasicMaterial({ color: 0x38bdf8, wireframe: true, transparent: true, opacity: 0, depthWrite: false }));
      S.water.position.y = -0.6; scene.add(S.water);

      // Sun: core + additive halo sprite.
      var halo = document.createElement('canvas'); halo.width = halo.height = 128;
      var hc = halo.getContext('2d'), gr = hc.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,240,180,1)'); gr.addColorStop(0.25, 'rgba(255,200,60,.55)'); gr.addColorStop(1, 'rgba(255,160,0,0)');
      hc.fillStyle = gr; hc.fillRect(0, 0, 128, 128);
      S.sun = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(halo), transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending }));
      S.sun.scale.set(26, 26, 1); S.sun.position.copy(S.sunPos); scene.add(S.sun);

      // Substation (energy hub).
      var hub = new THREE.Group();
      var hubMat = new THREE.MeshStandardMaterial({ color: 0x1f2c2a, emissive: 0xff8a00, emissiveIntensity: 0, metalness: 0.4, roughness: 0.5 });
      for (var i = 0; i < 3; i++) { var tower = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.3, 3.2, 6), hubMat); tower.position.set((i - 1) * 1.4, 1.6, 0); hub.add(tower); }
      var bar = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.15, 0.15), hubMat); bar.position.y = 3.2; hub.add(bar);
      scene.add(hub); S.hub = hub; S.hubMat = hubMat;

      // Selection beacon: light beam and pulsing ring.
      S.beam = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 1.4, 60, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0x4fc1b1, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
      S.beam.position.y = 30; scene.add(S.beam);
      S.ring = new THREE.Mesh(new THREE.RingGeometry(1, 1.25, 48), new THREE.MeshBasicMaterial({ color: 0x4fc1b1, transparent: true, opacity: 0, side: THREE.DoubleSide, depthWrite: false }));
      S.ring.rotation.x = -Math.PI / 2; S.ring.position.y = 0.05; scene.add(S.ring);

      // Ambient motes drifting through the whole scene.
      var n = 420, dp = new Float32Array(n * 3);
      for (i = 0; i < n; i++) { dp[i * 3] = (Math.random() - 0.5) * 140; dp[i * 3 + 1] = Math.random() * 40; dp[i * 3 + 2] = (Math.random() - 0.5) * 140; }
      var dg = new THREE.BufferGeometry(); dg.setAttribute('position', new THREE.BufferAttribute(dp, 3));
      S.dust = new THREE.Points(dg, new THREE.PointsMaterial({ color: 0x9fb0ac, size: 0.18, transparent: true, opacity: 0.45, depthWrite: false }));
      scene.add(S.dust);

      S.flow = makeFlow(900);
      scene.add(S.flow.points);

      root.addEventListener('resize', resize);
      root.addEventListener('pointermove', function (e) { S.mouse.x = e.clientX / root.innerWidth - 0.5; S.mouse.y = e.clientY / root.innerHeight - 0.5; }, { passive: true });
      root.addEventListener('scroll', function () { S.scrollY = root.scrollY || 0; }, { passive: true });
      document.addEventListener('visibilitychange', function () { S.visible = !document.hidden; if (S.visible) { S.last = performance.now(); loop(); } });
      resize();
      loop();
      return true;
    } catch (e) {
      if (root.console) console.warn('3D backdrop unavailable', e);
      S = null;
      return false;
    }
  }

  function resize() {
    var w = root.innerWidth, h = root.innerHeight;
    S.renderer.setSize(w, h, false);
    S.camera.aspect = w / h;
    S.camera.fov = w < 700 ? 55 : 42;
    S.camera.updateProjectionMatrix();
    S.dirty = true;
  }

  // ---------- data → scene ----------
  // opts: { key, buildings: [{name, value, group}], selected, palette: {bg, edge, body, accent}, group, metricKey }
  function update(opts) {
    if (!S) return;
    var pal = opts.palette || {};
    if (pal.bg) { S.bg.set(pal.bg); S.fogColor.set(pal.bg); }
    if (pal.edge) S.edge.set(pal.edge);
    if (pal.body) S.body.set(pal.body);
    if (pal.accent) S.accent.set(pal.accent);
    if (S.light !== !!pal.light) {
      // Additive glow vanishes on a light ground; use normal blending there.
      var bl = pal.light ? THREE.NormalBlending : THREE.AdditiveBlending;
      [S.flow.points.material, S.sun.material, S.beam.material].forEach(function (mm) { mm.blending = bl; mm.needsUpdate = true; });
    }
    S.light = !!pal.light;
    S.scene.fog.density = S.light ? 0.009 : 0.012;
    S.grid.material.color.set(pal.line || 0x2c3b38);
    S.dust.material.color.set(pal.ink2 || 0x9fb0ac);

    var list = opts.buildings || [];
    var sig = opts.key + '|' + list.map(function (b) { return b.name; }).join(',');
    if (sig !== S.sig) { rebuildBuildings(list); S.sig = sig; }

    var max = 0;
    list.forEach(function (b) { if (b.value > max) max = b.value; });
    list.forEach(function (b) {
      var o = S.byName[b.name];
      if (!o) return;
      o.goal = b.value === null || !max ? 0.8 : 1.2 + 13 * Math.sqrt(Math.max(b.value, 0) / max);
      o.has = b.value !== null && b.value > 0;
    });
    S.buildings.forEach(function (o) {
      o.selected = o.name === opts.selected;
      o.mat.color.copy(S.body);
      o.edgeMat.color.copy(o.selected ? S.accent : S.edge);
    });

    var mode = modeFor(opts.group, opts.metricKey);
    var sel = S.byName[opts.selected];
    S.targetGoal.set(sel ? sel.x : 0, sel ? 2 : 1, sel ? sel.z : 0);
    S.radiusGoal = sel ? 38 : Math.max(38, S.layout.width * 1.25 + 18);
    if (mode !== S.mode || sig !== S.flowSig || S.heightSig !== heightSig()) S.pendingFlow = mode;
    S.mode = mode;
    S.dirty = true;
  }

  function heightSig() { return S.buildings.map(function (o) { return o.goal.toFixed(1); }).join(','); }

  function rebuildBuildings(list) {
    S.buildings.forEach(function (o) { S.scene.remove(o.group); o.mat.dispose(); o.edgeMat.dispose(); });
    S.buildings = []; S.byName = {};
    var n = list.length || 1;
    var cols = Math.ceil(Math.sqrt(n * 1.6));
    var rows = Math.ceil(n / cols);
    var gap = 6.2;
    S.layout = { width: (cols - 1) * gap, depth: (rows - 1) * gap };
    var box = new THREE.BoxGeometry(1, 1, 1); box.translate(0, 0.5, 0);
    var edges = new THREE.EdgesGeometry(box);
    // Group facilities so residences, academics, amenities sit together.
    var sorted = list.slice().sort(function (a, b) { return (a.group || '').localeCompare(b.group || ''); });
    sorted.forEach(function (b, i) {
      var c = i % cols, r = Math.floor(i / cols);
      var x = (c - (cols - 1) / 2) * gap + (r % 2 ? 0.9 : 0), z = (r - (rows - 1) / 2) * gap;
      var g = new THREE.Group();
      var mat = new THREE.MeshStandardMaterial({ color: S.body, metalness: 0.25, roughness: 0.55, transparent: true, opacity: 0.92 });
      var mesh = new THREE.Mesh(box, mat);
      var footprint = 2.6 + ((b.name.length * 7) % 5) * 0.25;
      mesh.scale.set(footprint, 0.01, footprint * 0.8);
      var edgeMat = new THREE.LineBasicMaterial({ color: S.edge, transparent: true, opacity: 0.9 });
      var line = new THREE.LineSegments(edges, edgeMat);
      line.scale.copy(mesh.scale);
      g.add(mesh); g.add(line);
      g.position.set(x, 0, z);
      S.scene.add(g);
      var o = { name: b.name, group: g, mesh: mesh, line: line, mat: mat, edgeMat: edgeMat, x: x, z: z, h: 0.01, goal: 1, fp: footprint, delay: i * 0.06 };
      S.buildings.push(o); S.byName[b.name] = o;
    });
    S.hub.position.set(0, 0, S.layout.depth / 2 + 7);
    S.flowSig = null;
  }

  function applyFlow(mode) {
    var f = S.flow;
    var bs = S.buildings.map(function (o) { return { x: o.x, z: o.z, h: o.goal }; });
    f.curves = bs.length ? buildCurves(mode, bs) : [];
    f.speed = { energy: 0.45, water: 0.22, solar: 0.6, hvac: 0.18, other: 0.08 }[mode];
    f.points.material.uniforms.uColor.value.set(S.light ? MODE_COLORS[mode].glow : MODE_COLORS[mode].flow);
    f.points.material.uniforms.uSize.value = mode === 'solar' ? 30 : mode === 'other' ? 14 : 22;
    rebuildRoutes(mode, f.curves);
    S.flowSig = S.sig; S.heightSig = heightSig();
    S.flowFade = 0;
  }

  // ---------- animation ----------
  var tmp = new THREE.Vector3();
  function step(dt) {
    var t = (S.t += dt);
    S.renderer.setClearColor(S.bg, 1);
    S.scene.fog.color.copy(S.fogColor);

    // Swap the particle routes while they are faded out.
    if (S.pendingFlow) {
      S.flowFade = damp(S.flowFade === undefined ? 1 : S.flowFade, 0, 10, dt);
      if (S.flowFade < 0.04 || S.reduced) { applyFlow(S.pendingFlow); S.pendingFlow = null; }
    } else S.flowFade = damp(S.flowFade || 0, 1, 2.5, dt);

    // Buildings rise with a stagger on first appearance, then ease to their new heights.
    S.buildings.forEach(function (o) {
      if (o.delay > 0) { o.delay -= dt; return; }
      o.h = S.reduced ? o.goal : damp(o.h, o.goal, 4, dt);
      o.mesh.scale.y = o.line.scale.y = Math.max(o.h, 0.01);
      var pulse = o.selected ? 0.55 + 0.35 * Math.sin(t * 3) : 0;
      o.mat.emissive.copy(S.accent).multiplyScalar(o.selected ? 0.35 + pulse * 0.25 : 0);
      o.mat.opacity = o.has === false ? 0.35 : 0.92;
      o.edgeMat.opacity = o.has === false ? 0.3 : (o.selected ? 1 : 0.75);
    });

    // Beacon on the selected building.
    var sel = S.buildings.find(function (o) { return o.selected; });
    S.beam.material.color.copy(S.accent); S.ring.material.color.copy(S.accent);
    S.beam.material.opacity = damp(S.beam.material.opacity, sel ? 0.12 : 0, 4, dt);
    var rp = (t * 0.7) % 1;
    S.ring.material.opacity = sel ? (1 - rp) * 0.8 : damp(S.ring.material.opacity, 0, 4, dt);
    if (sel) { S.beam.position.x = S.ring.position.x = sel.x; S.beam.position.z = S.ring.position.z = sel.z; S.ring.scale.setScalar(1.5 + rp * 4); }
    S.disc.material.color.copy(S.accent);

    // Mode layers.
    var m = S.mode;
    S.water.material.opacity = damp(S.water.material.opacity, m === 'water' ? (S.light ? 0.3 : 0.22) : 0, 2.5, dt);
    if (S.water.material.opacity > 0.005) {
      var p = S.water.geometry.attributes.position, b = S.waterBase;
      for (var i = 0; i < p.count; i++) {
        var x = b[i * 3], z = b[i * 3 + 2];
        p.array[i * 3 + 1] = Math.sin(x * 0.18 + t * 1.3) * 0.35 + Math.cos(z * 0.22 + t * 0.9) * 0.3;
      }
      p.needsUpdate = true;
    }
    S.sun.material.opacity = damp(S.sun.material.opacity, m === 'solar' ? 0.95 : 0, 2.5, dt);
    S.sun.scale.setScalar(24 + Math.sin(t * 1.5) * 1.5);
    S.hubMat.emissiveIntensity = damp(S.hubMat.emissiveIntensity, m === 'energy' ? 0.9 + Math.sin(t * 6) * 0.3 : 0, 4, dt);
    S.dir.color.setHex(m === 'solar' ? 0xfff1c4 : 0xffffff);
    if (S.routes) S.routes.material.opacity = damp(S.routes.material.opacity, (m === 'energy' || m === 'water') ? 0.28 * (S.flowFade || 0) : 0, 3, dt);

    // Particles travelling along the routes.
    var f = S.flow, pos = f.points.geometry.attributes.position, al = f.points.geometry.attributes.alpha;
    var nc = f.curves.length;
    f.points.material.uniforms.uOpacity.value = (S.flowFade || 0) * (S.light ? 0.95 : 1);
    for (i = 0; i < f.count; i++) {
      if (!nc) { al.array[i] = 0; continue; }
      var c = f.curves[i % nc];
      var u = (f.seeds[i] + t * f.speed * (0.6 + f.seeds[i] * 0.8)) % 1;
      c.getPoint(u, tmp);
      if (m === 'hvac') { tmp.x += Math.sin(u * 9 + i) * 0.6 * u; tmp.z += Math.cos(u * 9 + i) * 0.6 * u; }
      pos.array[i * 3] = tmp.x; pos.array[i * 3 + 1] = tmp.y; pos.array[i * 3 + 2] = tmp.z;
      al.array[i] = Math.sin(u * Math.PI) * (0.5 + f.seeds[i] * 0.5);
    }
    pos.needsUpdate = true; al.needsUpdate = true;

    // Dust drifts upward slowly.
    var d = S.dust.geometry.attributes.position;
    for (i = 0; i < d.count; i++) { d.array[i * 3 + 1] += dt * (0.3 + (i % 7) * 0.05); if (d.array[i * 3 + 1] > 40) d.array[i * 3 + 1] = 0; }
    d.needsUpdate = true;

    // Camera: slow orbit, eased target, pointer parallax, gentle dip as the page scrolls.
    if (!S.reduced) S.orbit += dt * 0.035;
    S.mouse.sx = damp(S.mouse.sx, S.mouse.x, 3, dt); S.mouse.sy = damp(S.mouse.sy, S.mouse.y, 3, dt);
    S.target.x = damp(S.target.x, S.targetGoal.x, 2.2, dt); S.target.y = damp(S.target.y, S.targetGoal.y, 2.2, dt); S.target.z = damp(S.target.z, S.targetGoal.z, 2.2, dt);
    S.radius = damp(S.radius, S.radiusGoal, 2, dt);
    var scrollTilt = Math.min((S.scrollY || 0) / 2000, 1);
    var ang = S.orbit + S.mouse.sx * 0.5;
    var elev = 0.52 - S.mouse.sy * 0.18 - scrollTilt * 0.22;
    S.camera.position.set(S.target.x + Math.sin(ang) * S.radius * Math.cos(elev), S.target.y + Math.sin(elev) * S.radius, S.target.z + Math.cos(ang) * S.radius * Math.cos(elev));
    S.camera.lookAt(S.target);
  }

  function loop() {
    if (!S || !S.visible) return;
    var now = performance.now();
    var dt = Math.min((now - S.last) / 1000, 0.05);
    S.last = now;
    if (S.reduced) {
      // Still frame: settle once per change, no continuous motion.
      if (S.dirty) { for (var k = 0; k < 60; k++) step(1 / 30); S.renderer.render(S.scene, S.camera); S.dirty = false; }
      setTimeout(function () { requestAnimationFrame(loop); }, 250);
      return;
    }
    step(dt);
    S.renderer.render(S.scene, S.camera);
    requestAnimationFrame(loop);
  }

  root.MISScene = { init: init, update: update, modeFor: modeFor };
})(typeof window !== 'undefined' ? window : this);
