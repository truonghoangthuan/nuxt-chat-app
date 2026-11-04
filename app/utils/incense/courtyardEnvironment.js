import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// Approved v2 courtyard: local PBR materials, instanced pavers/roof/leaves and sprite smoke.
export function createEnvironment(scene, assets) {
  let seed = 1873;
  const rand = () => (seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296,
    range = (a, b) => a + (b - a) * rand();
  scene.add(new THREE.HemisphereLight("#e5ecde", "#73614d", 2.6));
  const sun = new THREE.DirectionalLight("#ffe3b4", 2.6);
  sun.position.set(-4.5, 7, 4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, {
    left: -9,
    right: 9,
    top: 9,
    bottom: -9,
    near: 0.5,
    far: 25,
  });
  sun.shadow.normalBias = 0.018;
  sun.shadow.bias = -0.00015;
  scene.add(sun);
  const fill = new THREE.DirectionalLight("#d9e5f1", 0.65);
  fill.position.set(4, 4, -2);
  scene.add(fill);

  function pbr(id, repeat, color = "#ffffff") {
    const maps = {};
    for (const [key, suffix] of [
      ["map", "diff"],
      ["normalMap", "nor_gl"],
      ["roughnessMap", "rough"],
    ]) {
      const t = assets.texture(`${id}_${suffix}.jpg`);
      t.wrapS = t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(...repeat);
      t.anisotropy = 8;
      if (key === "map") t.colorSpace = THREE.SRGBColorSpace;
      maps[key] = t;
    }
    return new THREE.MeshStandardMaterial({
      ...maps,
      color,
      roughness: 1,
      normalScale: new THREE.Vector2(0.65, 0.65),
    });
  }
  const floor = pbr("red_brick_pavers", [6, 6], "#f0e3d5"),
    plaster = pbr("worn_plaster_wall", [3, 1], "#e7d7ae"),
    wood = pbr("wood_planks", [1, 2], "#9a8169"),
    roofMat = pbr("clay_roof_tiles", [0.35, 0.35], "#b4aaa0");
  const mat = (c, r = 0.9, m = 0) =>
    new THREE.MeshStandardMaterial({ color: c, roughness: r, metalness: m });
  const stone = mat("#aaa594"),
    stoneDark = mat("#777b6c"),
    earth = mat("#565747"),
    darkWood = mat("#3b2a20"),
    bronze = mat("#676c49", 0.44, 0.75),
    bronzeRim = mat("#93805a", 0.36, 0.82);
  function mesh(g, m, p = [0, 0, 0], parent = scene) {
    const o = new THREE.Mesh(g, m);
    o.position.set(...p);
    o.castShadow = o.receiveShadow = true;
    parent.add(o);
    return o;
  }
  const box = (w, h, d, m, p, parent) =>
    mesh(
      new RoundedBoxGeometry(w, h, d, 1, Math.min(w, h, d) * 0.07),
      m,
      p,
      parent,
    );
  const cyl = (a, b, h, m, p, parent, seg = 24) =>
    mesh(new THREE.CylinderGeometry(a, b, h, seg), m, p, parent);
  const dummy = new THREE.Object3D();
  function segment(a, b, r, m, parent = scene, r2 = r) {
    const A = new THREE.Vector3(...a),
      B = new THREE.Vector3(...b);
    const o = cyl(
      r,
      r2,
      A.distanceTo(B),
      m,
      A.clone().add(B).multiplyScalar(0.5).toArray(),
      parent,
      10,
    );
    o.quaternion.setFromUnitVectors(
      new THREE.Vector3(0, 1, 0),
      B.sub(A).normalize(),
    );
    return o;
  }
  box(18, 0.15, 18, earth, [0, -0.14, 0]);
  const ground = mesh(new THREE.PlaneGeometry(18, 18), floor, [0, -0.05, 0]);
  ground.rotation.x = -Math.PI / 2;
  // Separate worn pavers, millimetre joints, irregular tone and softened clay edges.
  const paverMat = floor.clone();
  for (const name of ["map", "normalMap", "roughnessMap"]) {
    paverMat[name] = floor[name].clone();
    paverMat[name].repeat.set(0.115, 0.115);
    paverMat[name].offset.set(0.06, 0.05);
  }
  paverMat.normalScale.set(0.9, 0.9);
  const pavers = new THREE.InstancedMesh(
    new RoundedBoxGeometry(0.426, 0.034, 0.215, 1, 0.005),
    paverMat,
    2200,
  );
  let pi = 0;
  for (let row = 0; row < 53; row++)
    for (let col = 0; col < 31; col++) {
      dummy.position.set(
        (col - 15) * 0.434 + (row % 2) * 0.217,
        -0.019 + range(-0.002, 0.002),
        -4.5 + row * 0.223,
      );
      dummy.rotation.set(0, range(-0.004, 0.004), 0);
      dummy.scale.set(1, 1, 1);
      dummy.updateMatrix();
      pavers.setMatrixAt(pi, dummy.matrix);
      pavers.setColorAt(
        pi++,
        new THREE.Color().setHSL(
          range(0.025, 0.045),
          range(0.06, 0.17),
          range(0.65, 0.9),
        ),
      );
    }
  pavers.count = pi;
  pavers.receiveShadow = true;
  scene.add(pavers);
  const stoneCanvas = document.createElement("canvas");
  stoneCanvas.width = stoneCanvas.height = 256;
  const sx = stoneCanvas.getContext("2d");
  sx.fillStyle = "#aaa89e";
  sx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 16000; i++) {
    const c = Math.floor(range(75, 190));
    sx.fillStyle = `rgba(${c},${c},${c - 5},${range(0.06, 0.3)})`;
    sx.fillRect(rand() * 256, rand() * 256, range(0.5, 3), range(0.5, 3));
  }
  const stoneTexture = new THREE.CanvasTexture(stoneCanvas);
  stoneTexture.colorSpace = THREE.SRGBColorSpace;
  stone.map = stoneTexture;
  stone.bumpMap = stoneTexture;
  stone.bumpScale = 0.018;
  stone.needsUpdate = true;
  // Stone drainage channels and raised wall footings ground the courtyard.
  for (const x of [-5.3, 5.3]) {
    box(0.22, 0.06, 13, stoneDark, [x, -0.01, 0]);
    for (let z = -6; z < 6; z += 0.45)
      box(0.24, 0.025, 0.022, earth, [x, 0.025, z]);
  }
  box(15, 3.25, 0.28, plaster, [0, 1.57, -4.25]);
  box(0.28, 3.15, 10, plaster, [-5.7, 1.5, -0.1]);
  box(0.28, 3.15, 10, plaster, [6.2, 1.5, -0.1]);
  for (const x of [-5.7, 6.2]) {
    box(0.46, 0.12, 10, stoneDark, [x, 3.1, -0.1]);
    box(0.34, 0.32, 10, stoneDark, [x, 0.1, -0.1]);
  }
  box(15, 0.32, 0.36, stoneDark, [0, 0.1, -4.25]);
  box(15, 0.1, 0.4, stoneDark, [0, 3.22, -4.25]);
  // Quiet timber hall: real layered rafters, shutters, threshold and curved tile courses.
  box(5.7, 0.14, 1.8, stoneDark, [0, 0.04, -3.5]);
  box(5.3, 0.1, 1.55, stone, [0, 0.15, -3.5]);
  for (const x of [-2.45, 2.45]) {
    cyl(0.15, 0.17, 2.65, wood, [x, 1.5, -2.85]);
    cyl(0.24, 0.28, 0.26, stone, [x, 0.26, -2.85]);
    box(0.37, 0.2, 0.4, darkWood, [x, 2.76, -2.85]);
  }
  for (const x of [-1.6, 0, 1.6]) {
    box(1.48, 2.17, 0.13, wood, [x, 1.37, -4.03]);
    for (let i = 0; i < 8; i++)
      box(0.036, 2.1, 0.025, darkWood, [x - 0.65 + i * 0.187, 1.37, -3.95]);
    box(1.5, 0.065, 0.05, darkWood, [x, 1.63, -3.92]);
    box(1.5, 0.065, 0.05, darkWood, [x, 0.67, -3.92]);
  }
  box(5.8, 0.25, 0.24, wood, [0, 2.68, -2.7]);
  box(5.8, 0.17, 0.22, wood, [0, 2.92, -3.65]);
  for (let x = -2.8; x <= 2.8; x += 0.32) {
    segment([x, 2.71, -2.15], [x, 3.51, -3.72], 0.048, darkWood);
    segment([x, 3.51, -3.72], [x, 2.71, -5.2], 0.048, darkWood);
  }
  const roofTiles = new THREE.InstancedMesh(
    new THREE.CylinderGeometry(
      0.1,
      0.105,
      0.36,
      10,
      1,
      true,
      -Math.PI / 2,
      Math.PI,
    ),
    roofMat,
    1500,
  );
  let ri = 0;
  for (const side of [-1, 1])
    for (let row = 0; row < 9; row++)
      for (let col = 0; col < 33; col++) {
        const z = -3.72 + side * (row * 0.19 + 0.04),
          y = 3.51 - row * 0.096;
        dummy.position.set((col - 16) * 0.183, y, z);
        dummy.rotation.set(-Math.PI / 2 + side * 0.47, 0, 0);
        dummy.scale.set(1, 1, 1);
        dummy.updateMatrix();
        roofTiles.setMatrixAt(ri, dummy.matrix);
        roofTiles.setColorAt(
          ri++,
          new THREE.Color().setHSL(
            range(0.035, 0.07),
            range(0.08, 0.18),
            range(0.56, 0.74),
          ),
        );
      }
  roofTiles.count = ri;
  roofTiles.castShadow = roofTiles.receiveShadow = true;
  scene.add(roofTiles);
  segment([-3.13, 3.57, -3.72], [3.13, 3.57, -3.72], 0.115, stoneDark);
  for (const x of [-3.1, 3.1])
    segment([x, 2.68, -2.03], [x, 2.87, -2.34], 0.07, stoneDark);
  // Slightly chipped, layered stone pedestal.
  const altarZ = -0.85;
  box(1.38, 0.12, 1.18, stoneDark, [0, 0.04, altarZ]);
  box(1.19, 0.1, 1.01, stone, [0, 0.15, altarZ]);
  box(0.88, 0.43, 0.74, stone, [0, 0.41, altarZ]);
  box(1.21, 0.12, 1.03, stoneDark, [0, 0.685, altarZ]);
  box(1.27, 0.065, 1.08, stone, [0, 0.777, altarZ]);
  for (const x of [-0.25, 0.25])
    for (const z of [-1.05, -0.65]) {
      const leg = cyl(0.04, 0.066, 0.17, bronze, [x, 0.88, z]);
      leg.rotation.z = x * 0.2;
    }
  const bowl = mesh(
    new THREE.LatheGeometry(
      [
        new THREE.Vector2(0.17, 0),
        new THREE.Vector2(0.23, 0.025),
        new THREE.Vector2(0.31, 0.09),
        new THREE.Vector2(0.35, 0.24),
        new THREE.Vector2(0.355, 0.29),
        new THREE.Vector2(0.32, 0.29),
        new THREE.Vector2(0.3, 0.1),
        new THREE.Vector2(0.16, 0.08),
      ],
      80,
    ),
    bronze,
    [0, 0.9, altarZ],
  );
  cyl(0.308, 0.308, 0.018, mat("#958a76"), [0, 1.09, altarZ]);
  for (const y of [0.985, 1.18]) {
    const r = mesh(
      new THREE.TorusGeometry(y > 1.1 ? 0.355 : 0.29, 0.012, 8, 80),
      bronzeRim,
      [0, y, altarZ],
    );
    r.rotation.x = Math.PI / 2;
  }
  for (const sign of [-1, 1]) {
    const h = mesh(
      new THREE.TorusGeometry(0.125, 0.023, 10, 40, Math.PI * 1.65),
      bronzeRim,
      [sign * 0.37, 1.08, altarZ],
    );
    h.rotation.y = Math.PI / 2;
  }
  // Cast bronze relief, quiet geometric ornament rather than a flat plastic vessel.
  for (let i = 0; i < 36; i++) {
    const a = (i / 36) * Math.PI * 2;
    const d = box(0.018, 0.065, 0.009, bronzeRim, [
      Math.cos(a) * 0.326,
      1.08,
      altarZ + Math.sin(a) * 0.326,
    ]);
    d.rotation.y = -a + Math.PI / 2;
  }
  // Original narrow leaf geometry, individually instanced, not spherical foliage masses.
  const leafShape = new THREE.Shape();
  leafShape.moveTo(0, 0);
  leafShape.bezierCurveTo(0.045, 0.055, 0.046, 0.13, 0, 0.22);
  leafShape.bezierCurveTo(-0.042, 0.13, -0.04, 0.055, 0, 0);
  const leafGeo = new THREE.ShapeGeometry(leafShape);
  leafGeo.translate(0, -0.1, 0);
  const leafMat = mat("#526044");
  leafMat.side = THREE.DoubleSide;
  const leaves = new THREE.InstancedMesh(leafGeo, leafMat, 11000);
  leaves.castShadow = leaves.receiveShadow = true;
  let li = 0;
  function leafAt(p, s = 1) {
    dummy.position.set(...p);
    dummy.rotation.set(range(-1.5, 1.5), range(0, 6.28), range(0, 6.28));
    dummy.scale.set(s * range(0.55, 0.95), s, s);
    dummy.updateMatrix();
    leaves.setMatrixAt(li, dummy.matrix);
    leaves.setColorAt(
      li++,
      new THREE.Color().setHSL(
        range(0.19, 0.29),
        range(0.18, 0.38),
        range(0.2, 0.43),
      ),
    );
  }
  const bark = mat("#615846");
  function tree(x, z) {
    segment([x, 0, z], [x + 0.12, 2.8, z + 0.1], 0.09, bark, scene, 0.2);
    for (let i = 0; i < 28; i++) {
      const a = i * 2.4,
        start = [x + 0.08, range(1.6, 2.7), z + 0.06],
        end = [
          x + Math.cos(a) * range(0.6, 1.7),
          range(2.8, 4.8),
          z + Math.sin(a) * range(0.7, 1.6),
        ];
      segment(start, end, 0.018, bark, scene, 0.06);
      for (let j = 0; j < 180; j++) {
        const r = Math.cbrt(rand()),
          az = rand() * 6.28,
          el = range(-1, 1);
        leafAt(
          [
            end[0] + Math.cos(az) * r * 0.62,
            end[1] + el * r * 0.4,
            end[2] + Math.sin(az) * r * 0.6,
          ],
          range(0.65, 1.05),
        );
      }
    }
  }
  tree(-3.65, -1.3);
  tree(4.7, -3.7);
  // Pots with gracefully radiating leaves along the edge of the courtyard.
  for (const [x, z] of [
    [3, -2.7],
    [-2.75, -2.2],
    [4.4, 0.2],
  ]) {
    mesh(
      new THREE.LatheGeometry(
        [
          new THREE.Vector2(0.21, 0),
          new THREE.Vector2(0.29, 0.06),
          new THREE.Vector2(0.34, 0.43),
          new THREE.Vector2(0.36, 0.49),
          new THREE.Vector2(0.31, 0.49),
        ],
        40,
      ),
      mat("#685d47"),
      [x, 0, z],
    );
    cyl(0.3, 0.3, 0.015, earth, [x, 0.47, z]);
    for (let i = 0; i < 18; i++) {
      const a = i * 2.4,
        end = [
          x + Math.cos(a) * range(0.25, 0.6),
          range(0.75, 1.4),
          z + Math.sin(a) * range(0.25, 0.6),
        ];
      segment([x, 0.47, z], end, 0.008, leafMat);
      for (let j = 0; j < 16; j++)
        leafAt(
          [
            end[0] + range(-0.13, 0.13),
            end[1] + range(-0.12, 0.1),
            end[2] + range(-0.13, 0.13),
          ],
          range(0.6, 0.95),
        );
    }
  }
  leaves.count = li;
  scene.add(leaves);
  for (let i = 0; i < 58; i++) {
    const o = mesh(leafGeo, mat(rand() > 0.5 ? "#91804b" : "#596044"), [
      range(-4, 4),
      -0.038,
      range(-2, 4),
    ]);
    o.rotation.set(-Math.PI / 2, 0, rand() * 6.28);
    o.scale.setScalar(range(0.45, 0.8));
  }
  const stickMat = mat("#775137"),
    tipMat = new THREE.MeshBasicMaterial({ color: "#dc6e32" });
  function incense(parent, height = 0.43) {
    const g = new THREE.Group();
    parent.add(g);
    cyl(0.0045, 0.0045, height, stickMat, [0, height / 2, 0], g, 8);
    cyl(0.006, 0.006, 0.014, tipMat, [0, height + 0.004, 0], g, 8);
    return g;
  }
  const held = incense(scene);
  held.visible = false;
  let placed = [],
    pending = null;
  function addStick() {
    const g = incense(scene, 0.43);
    g.position.set(range(-0.11, 0.11), 1.1, altarZ + range(-0.08, 0.08));
    placed.push(g);
    if (placed.length > 12) {
      const old = placed.shift();
      old.traverse((o) => o.geometry?.dispose());
      scene.remove(old);
    }
    return g;
  }
  // Wisps use a soft original radial texture with depth-tested world-space sprites.
  const smokeCanvas = document.createElement("canvas");
  smokeCanvas.width = smokeCanvas.height = 128;
  const ctx = smokeCanvas.getContext("2d"),
    grad = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, "rgba(231,232,218,.42)");
  grad.addColorStop(0.4, "rgba(231,232,218,.14)");
  grad.addColorStop(1, "rgba(231,232,218,0)");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, 128, 128);
  const smokeTex = new THREE.CanvasTexture(smokeCanvas);
  const smoke = Array.from({ length: 60 }, () => {
    const s = new THREE.Sprite(
      new THREE.SpriteMaterial({
        map: smokeTex,
        transparent: true,
        depthWrite: false,
        opacity: 0,
      }),
    );
    scene.add(s);
    return s;
  });
  function placePending() {
    if (!pending) pending = addStick();
  }
  function confirm() {
    placePending();
    pending = null;
  }
  function rollback() {
    if (pending) {
      scene.remove(pending);
      placed = placed.filter((item) => item !== pending);
      pending.traverse((o) => o.geometry?.dispose());
      pending = null;
    }
  }
  function updateSmoke(now, reduced) {
    let source = null;
    if (placed.length)
      source = placed
        .at(-1)
        .position.clone()
        .add(new THREE.Vector3(0, 0.435, 0));
    else if (held.visible)
      source = held.position.clone().add(new THREE.Vector3(0, 0.435, 0));
    smoke.forEach((s, i) => {
      if (!source) {
        s.material.opacity = 0;
        return;
      }
      const age = ((reduced ? 1000 : now) * 0.00013 + i / 60) % 1;
      s.position.set(
        source.x + age * 0.24 + Math.sin(age * 13 + i * 0.09) * 0.035,
        source.y + age * 1.45,
        source.z + Math.cos(age * 11 + i * 0.04) * 0.04,
      );
      s.scale.set(0.045 + age * 0.19, 0.1 + age * 0.25, 1);
      s.material.opacity = Math.sin(age * Math.PI) * 0.4;
    });
  }
  return { held, placePending, confirm, rollback, updateSmoke };
}
