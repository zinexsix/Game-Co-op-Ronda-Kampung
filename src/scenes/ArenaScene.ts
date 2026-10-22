import {
  ArcRotateCamera,
  Color3,
  Color4,
  DirectionalLight,
  HemisphericLight,
  Matrix,
  Mesh,
  MeshBuilder,
  Quaternion,
  Scene,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3,
  Viewport,
  type AbstractEngine,
  type AbstractMesh,
} from "@babylonjs/core";
import { ARENA, setArenaBounds } from "../config/arena";
import type { StaticBox } from "../systems/Collision";

/** Ukuran satu tata letak arena (dari levels.json). */
export interface ArenaLayoutSpec {
  id: string;
  halfWidth: number;
  halfDepth: number;
}

export interface Arena {
  scene: Scene;
  camera: ArcRotateCamera;
  sun: DirectionalLight;
  shadows: ShadowGenerator;
  /** Kotak tabrakan pos ronda. */
  postBox: StaticBox;
  postCenter: Vector3;
  /** Panggil saat ukuran jendela berubah agar seluruh arena tetap terlihat. */
  fitCamera: () => void;
  /** Tampilkan tata letak arena ini, ganti batas arena aktif, dan sesuaikan kamera. */
  setLayout: (id: string) => void;
  readonly layoutId: string;
}

type MatFn = (name: string, hex: string, emissive?: number) => StandardMaterial;

/** Bahan bersama untuk pembangun tata letak. */
interface BuildCtx {
  scene: Scene;
  mat: MatFn;
  root: TransformNode;
  hw: number;
  hd: number;
  /** Mesh statis (dibekukan, tidak bisa dipilih). */
  statics: AbstractMesh[];
  /** Mesh yang membuat bayangan. */
  casters: AbstractMesh[];
  /** Mesh yang menerima bayangan. */
  receivers: AbstractMesh[];
}

/**
 * Bangun adegan: malam kampung, pos ronda di tengah, kamera tetap, 2 cahaya.
 * Setiap tata letak arena (per level) dibangun sekali di awal di bawah TransformNode sendiri;
 * pindah level hanya mengaktifkan root yang sesuai (semua aset dimuat di awal).
 */
export function createArenaScene(engine: AbstractEngine, shadowMapSize: number, layouts: ArenaLayoutSpec[]): Arena {
  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.03, 0.04, 0.09, 1);
  scene.ambientColor = new Color3(0.15, 0.17, 0.25);
  // Hemat CPU: tidak ada picking pointer per frame.
  scene.skipPointerMovePicking = true;
  scene.skipPointerDownPicking = true;
  scene.skipPointerUpPicking = true;
  scene.autoClearDepthAndStencil = true;

  // --- Kamera tetap, miring ~55 derajat, menghadap +Z ---
  const pitch = (ARENA.cameraPitchDeg * Math.PI) / 180;
  const camera = new ArcRotateCamera("cam", -Math.PI / 2, Math.PI / 2 - pitch, 40, new Vector3(0, 0, -0.5), scene);
  camera.fov = (ARENA.cameraFovDeg * Math.PI) / 180;
  camera.minZ = 1;
  camera.maxZ = 200;
  // Tidak memanggil attachControl: kamera tidak bisa diputar pemain.

  const fitCamera = () => {
    // Adegan digambar di atas strip kartu pemain supaya seluruh arena tidak tertutup HUD.
    const h = engine.getRenderingCanvas()?.clientHeight || engine.getRenderHeight();
    const reserve = Math.min(0.3, ARENA.hudBottomPx / Math.max(1, h));
    camera.viewport = new Viewport(0, reserve, 1, 1 - reserve);
    const aspect = engine.getAspectRatio(camera);
    const vHalf = camera.fov / 2;
    const hHalf = Math.atan(Math.tan(vHalf) * aspect);
    // Lebar: area main + sedikit dekorasi. Kedalaman: proyeksi area ke bidang pandang.
    const halfW = ARENA.halfWidth + 2;
    const halfD = ARENA.halfDepth + 3.5; // + ruang untuk rumah di sisi atas
    const byWidth = halfW / Math.tan(hHalf) + halfD * Math.cos(pitch);
    const byDepth = (halfD * Math.sin(pitch) + 1.5) / Math.tan(vHalf) + halfD * Math.cos(pitch);
    camera.radius = Math.max(byWidth, byDepth);
  };

  // --- Cahaya: 2 sumber (ambient langit malam + cahaya bulan terarah lembut) ---
  const sky = new HemisphericLight("sky", new Vector3(0, 1, 0), scene);
  sky.intensity = 0.45;
  sky.diffuse = new Color3(0.55, 0.62, 0.9);
  sky.groundColor = new Color3(0.12, 0.1, 0.16);
  sky.specular = Color3.Black();

  const sun = new DirectionalLight("moon", new Vector3(-0.45, -1, 0.55).normalize(), scene);
  sun.position = new Vector3(20, 40, -25);
  sun.intensity = 0.75;
  sun.diffuse = new Color3(0.82, 0.86, 1.0);
  sun.specular = Color3.Black();

  const shadows = new ShadowGenerator(shadowMapSize, sun);
  shadows.usePercentageCloserFiltering = true;
  shadows.filteringQuality = ShadowGenerator.QUALITY_LOW;
  shadows.bias = 0.002;
  shadows.darkness = 0.35;

  // --- Material bersama (di-cache per nama agar tata letak bisa berbagi) ---
  const mats = new Map<string, StandardMaterial>();
  const mat: MatFn = (name, hex, emissive = 0) => {
    const cached = mats.get(name);
    if (cached) return cached;
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = Color3.Black();
    if (emissive > 0) m.emissiveColor = Color3.FromHexString(hex).scale(emissive);
    mats.set(name, m);
    return m;
  };

  // --- Pos ronda (sama di semua level): lantai panggung, 4 tiang, atap limas, lampu, kentongan ---
  const post: AbstractMesh[] = [];
  const s = ARENA.postHalfSize;
  const floor = MeshBuilder.CreateBox("postFloor", { width: s * 2, height: 0.5, depth: s * 2 }, scene);
  floor.position.y = 0.25;
  floor.material = mat("wood", "#7a5232");
  post.push(floor);

  const pillar = MeshBuilder.CreateBox("postPillar", { width: 0.25, height: 2.4, depth: 0.25 }, scene);
  pillar.material = mat("wood", "#7a5232");
  setThinInstances(
    pillar,
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => trs(x * (s - 0.2), 1.7, z * (s - 0.2))),
  );
  post.push(pillar);

  const roof = MeshBuilder.CreateCylinder("postRoof", { diameterTop: 0, diameterBottom: s * 3.4, height: 1.6, tessellation: 4 }, scene);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 3.7;
  roof.material = mat("roof", "#8c3b2a");
  post.push(roof);

  const lamp = MeshBuilder.CreateIcoSphere("postLamp", { radius: 0.25, subdivisions: 1 }, scene);
  lamp.position.set(0, 2.6, -s + 0.3);
  lamp.material = mat("lamp", "#ffd27a", 1.0);
  post.push(lamp);

  const kentongan = MeshBuilder.CreateCylinder("kentongan", { diameter: 0.35, height: 1.1, tessellation: 8 }, scene);
  kentongan.position.set(s - 0.3, 1.6, -s + 0.3);
  kentongan.material = mat("wood", "#7a5232");
  post.push(kentongan);

  for (const m of post) {
    m.isPickable = false;
    m.freezeWorldMatrix();
    shadows.addShadowCaster(m, false);
  }
  floor.receiveShadows = true;

  // --- Tata letak per level ---
  const roots = new Map<string, { root: TransformNode; spec: ArenaLayoutSpec }>();
  for (const spec of layouts) {
    const builder = LAYOUT_BUILDERS[spec.id];
    if (!builder) throw new Error(`Tata letak arena belum dibuat: ${spec.id}`);
    const root = new TransformNode(`arena_${spec.id}`, scene);
    const ctx: BuildCtx = { scene, mat, root, hw: spec.halfWidth, hd: spec.halfDepth, statics: [], casters: [], receivers: [] };
    builder(ctx);
    for (const m of ctx.statics) {
      m.parent = root;
      m.isPickable = false;
      m.freezeWorldMatrix();
    }
    for (const m of ctx.casters) shadows.addShadowCaster(m, false);
    for (const m of ctx.receivers) m.receiveShadows = true;
    root.setEnabled(false);
    roots.set(spec.id, { root, spec });
  }

  let layoutId = "";
  const arena: Arena = {
    scene,
    camera,
    sun,
    shadows,
    postBox: { cx: 0, cz: 0, halfX: s, halfZ: s },
    postCenter: Vector3.Zero(),
    fitCamera,
    setLayout: (id) => {
      const target = roots.get(id);
      if (!target) throw new Error(`Tata letak arena tidak ada: ${id}`);
      for (const { root } of roots.values()) root.setEnabled(root === target.root);
      setArenaBounds(target.spec.halfWidth, target.spec.halfDepth);
      layoutId = id;
      fitCamera();
    },
    get layoutId() {
      return layoutId;
    },
  };
  arena.setLayout(layouts[0].id);
  return arena;
}

// ---------------------------------------------------------------------------
// Tata letak arena
// ---------------------------------------------------------------------------

const LAYOUT_BUILDERS: Record<string, (c: BuildCtx) => void> = {
  halaman: buildHalaman,
  jalan: buildJalan,
};

/** Level 1: halaman pos ronda. Kecil dan terbuka: tanah lapang, pagar bambu keliling, semak, sumur. */
function buildHalaman(c: BuildCtx): void {
  const { scene, mat, hw, hd } = c;
  const grass = MeshBuilder.CreateGround("h_ground", { width: (hw + ARENA.groundMargin) * 2, height: (hd + ARENA.groundMargin) * 2 }, scene);
  grass.material = mat("grassLight", "#38552f");
  c.statics.push(grass);
  c.receivers.push(grass);

  // Halaman tanah lonjong di sekitar pos + jalan setapak ke tiap sisi (jalur datang tikus).
  const yard = MeshBuilder.CreateDisc("h_yard", { radius: 1, tessellation: 28 }, scene);
  yard.rotation.x = Math.PI / 2;
  yard.scaling.set(hw * 0.62, hd * 0.75, 1);
  yard.position.y = 0.01;
  yard.material = mat("dirt", "#6b5537");
  const pathX = MeshBuilder.CreateGround("h_pathX", { width: hw * 2, height: 1.8 }, scene);
  const pathZ = MeshBuilder.CreateGround("h_pathZ", { width: 1.8, height: hd * 2 }, scene);
  for (const m of [pathX, pathZ]) {
    m.position.y = 0.015;
    m.material = mat("dirt", "#6b5537");
  }
  c.statics.push(yard, pathX, pathZ);
  c.receivers.push(yard, pathX, pathZ);

  // Pagar bambu keliling (celah di jalan setapak). Sisi bawah (dekat kamera) dibuat rendah.
  const fenceSpots: Matrix[] = [];
  const railSpots: Matrix[] = [];
  const gap = 1.4;
  const fx = hw + 0.6;
  const fz = hd + 0.6;
  const addSide = (ax: number, az: number, bx: number, bz: number, height: number, gapAt: number) => {
    const len = Math.hypot(bx - ax, bz - az);
    const steps = Math.round(len / 0.9);
    const along = (t: number) => ({ x: ax + (bx - ax) * t, z: az + (bz - az) * t });
    for (let i = 0; i <= steps; i++) {
      const p = along(i / steps);
      const offset = Math.abs((i / steps) * len - len / 2 - gapAt);
      if (offset < gap) continue;
      fenceSpots.push(trsScaled(p.x, height / 2, p.z, 0.14, height, 0.14, 0));
    }
    // Dua palang memanjang di kiri & kanan celah.
    const yaw = Math.atan2(-(bz - az), bx - ax);
    for (const [t0, t1] of [[0, 0.5 - gap / len], [0.5 + gap / len, 1]]) {
      const a = along(t0);
      const b = along(t1);
      const segLen = Math.hypot(b.x - a.x, b.z - a.z);
      for (const y of [height * 0.35, height * 0.75]) {
        railSpots.push(trsScaled((a.x + b.x) / 2, y, (a.z + b.z) / 2, segLen, 0.07, 0.07, yaw));
      }
    }
  };
  addSide(-fx, fz, fx, fz, 1.1, 0); // atas
  addSide(-fx, -fz, fx, -fz, 0.6, 0); // bawah (rendah)
  addSide(-fx, -fz, -fx, fz, 1.1, 0); // kiri
  addSide(fx, -fz, fx, fz, 1.1, 0); // kanan
  const fencePost = MeshBuilder.CreateBox("h_fencePost", { size: 1 }, scene);
  fencePost.material = mat("bamboo", "#9a8a4a");
  setThinInstances(fencePost, fenceSpots);
  const rail = MeshBuilder.CreateBox("h_fenceRail", { size: 1 }, scene);
  rail.material = mat("bamboo", "#9a8a4a");
  setThinInstances(rail, railSpots);
  c.statics.push(fencePost, rail);
  c.casters.push(fencePost);

  // Pohon di luar pagar (sisi atas & samping), rumah warga di belakang.
  const rng = mulberry32(3);
  const trees: { x: number; z: number; s: number; r: number }[] = [];
  for (let i = 0; i < 14; i++) {
    const side = i % 3;
    const t = rng() * 2 - 1;
    let x = side === 0 ? t * (hw + 3) : (side === 1 ? -1 : 1) * (hw + 2.4 + rng());
    const z = side === 0 ? hd + 2.2 + rng() * 1.5 : t * hd;
    if (side === 0 && Math.abs(x) < 3.5) x += 5 * Math.sign(x || 1);
    if (side !== 0 && Math.abs(z) < 2) continue; // celah jalan setapak
    trees.push({ x, z, s: 0.8 + rng() * 0.5, r: rng() * Math.PI });
  }
  addTrees(c, "h", trees);
  addHouses(c, "h", [-7, 7], hd + 3.2);

  // Semak berbunga di dalam pagar (dekat tepi, jauh dari jalan setapak).
  const bush = MeshBuilder.CreateIcoSphere("h_bush", { radius: 0.5, subdivisions: 1, flat: true }, scene);
  bush.material = mat("bush", "#2f5e35");
  const bushes: Matrix[] = [];
  for (let i = 0; i < 18; i++) {
    const x = (rng() * 2 - 1) * (hw - 1);
    const z = (rng() > 0.5 ? 1 : -1) * (hd - 0.8 - rng() * 1.2);
    if (Math.abs(x) < 2.5) continue;
    bushes.push(trs(x, 0.25, z, 0.7 + rng() * 0.6, rng() * Math.PI));
  }
  setThinInstances(bush, bushes);
  c.statics.push(bush);

  // Sumur di pojok kiri atas dan jemuran di kanan atas (sekali pakai, bukan objek berulang).
  const well = MeshBuilder.CreateCylinder("h_well", { diameter: 1.4, height: 0.8, tessellation: 10 }, scene);
  well.position.set(-hw + 2.2, 0.4, hd - 2);
  well.material = mat("stone", "#7c7f86");
  const wellRoof = MeshBuilder.CreateCylinder("h_wellRoof", { diameterTop: 0, diameterBottom: 1.9, height: 0.7, tessellation: 4 }, scene);
  wellRoof.position.set(-hw + 2.2, 2.0, hd - 2);
  wellRoof.rotation.y = Math.PI / 4;
  wellRoof.material = mat("roof", "#8c3b2a");
  const wellPole = MeshBuilder.CreateBox("h_wellPole", { width: 0.1, height: 1.7, depth: 0.1 }, scene);
  wellPole.material = mat("wood", "#7a5232");
  setThinInstances(wellPole, [trs(-hw + 1.55, 0.85, hd - 2), trs(-hw + 2.85, 0.85, hd - 2)]);
  c.statics.push(well, wellRoof, wellPole);
  c.casters.push(well, wellRoof);

  addLamps(c, "h", [[-hw * 0.55, 3], [hw * 0.55, -3]]);
}

/** Level 2: jalan kampung bersilang dengan petak sawah di tiap sudut dan pagar di sepanjang jalan. */
function buildJalan(c: BuildCtx): void {
  const { scene, mat, hw, hd } = c;
  const ground = MeshBuilder.CreateGround("j_ground", { width: (hw + ARENA.groundMargin) * 2, height: (hd + ARENA.groundMargin) * 2 }, scene);
  ground.material = mat("grass", "#2f4a2c");
  c.statics.push(ground);
  c.receivers.push(ground);

  // Jalan tanah bersilang menuju pos ronda (jalur musuh).
  const roadX = MeshBuilder.CreateGround("j_roadX", { width: hw * 2, height: 3 }, scene);
  const roadZ = MeshBuilder.CreateGround("j_roadZ", { width: 3, height: hd * 2 }, scene);
  for (const r of [roadX, roadZ]) {
    r.position.y = 0.01;
    r.material = mat("dirt", "#6b5537");
  }
  c.statics.push(roadX, roadZ);
  c.receivers.push(roadX, roadZ);

  // Sawah: petak air kehijauan dengan pematang, rumpun padi di dalamnya (semua instanced).
  const paddy = MeshBuilder.CreateBox("j_paddy", { size: 1 }, scene);
  paddy.material = mat("paddyWater", "#2b4d4a");
  const dike = MeshBuilder.CreateBox("j_dike", { size: 1 }, scene);
  dike.material = mat("dike", "#5d6b35");
  const rice = MeshBuilder.CreateCylinder("j_rice", { diameterTop: 0, diameterBottom: 0.32, height: 0.55, tessellation: 4 }, scene);
  rice.material = mat("rice", "#7fa83a");
  const paddyMats: Matrix[] = [];
  const dikeMats: Matrix[] = [];
  const riceMats: Matrix[] = [];
  const rng = mulberry32(11);
  const x0 = 3.2;
  const z0 = 3.2;
  for (const sx of [-1, 1]) {
    for (const sz of [-1, 1]) {
      // Dua petak per kuadran, dipisah pematang.
      const xa = x0;
      const xb = hw - 0.8;
      const za = z0;
      const zb = hd - 0.8;
      const xm = (xa + xb) / 2;
      for (const [p0, p1] of [[xa, xm - 0.2], [xm + 0.2, xb]]) {
        const cx = sx * (p0 + p1) / 2;
        const cz = sz * (za + zb) / 2;
        const w = p1 - p0;
        const d = zb - za;
        paddyMats.push(trsScaled(cx, 0.02, cz, w, 0.04, d, 0));
        for (let x = p0 + 0.5; x < p1 - 0.3; x += 1.0) {
          for (let z = za + 0.5; z < zb - 0.3; z += 1.0) {
            riceMats.push(trs(sx * (x + (rng() - 0.5) * 0.2), 0.27, sz * (z + (rng() - 0.5) * 0.2), 0.8 + rng() * 0.4, rng() * Math.PI));
          }
        }
      }
      // Pematang keliling kuadran.
      const cx = sx * (xa + xb) / 2;
      const cz = sz * (za + zb) / 2;
      const w = xb - xa;
      const d = zb - za;
      dikeMats.push(trsScaled(cx, 0.06, sz * za, w + 0.3, 0.12, 0.3, 0));
      dikeMats.push(trsScaled(cx, 0.06, sz * zb, w + 0.3, 0.12, 0.3, 0));
      dikeMats.push(trsScaled(sx * xa, 0.06, cz, 0.3, 0.12, d, 0));
      dikeMats.push(trsScaled(sx * xb, 0.06, cz, 0.3, 0.12, d, 0));
      dikeMats.push(trsScaled(sx * xm, 0.06, cz, 0.3, 0.12, d, 0));
    }
  }
  setThinInstances(paddy, paddyMats);
  setThinInstances(dike, dikeMats);
  setThinInstances(rice, riceMats);
  c.statics.push(paddy, dike, rice);
  c.receivers.push(paddy);

  // Pagar kayu rendah di kedua sisi jalan (terputus di persimpangan dan di tepi arena).
  const postMats: Matrix[] = [];
  const railMats: Matrix[] = [];
  const edge = 2.0;
  const addFence = (alongX: boolean, offset: number, from: number, to: number) => {
    for (let t = from; t <= to + 1e-6; t += 1.2) {
      const x = alongX ? t : offset;
      const z = alongX ? offset : t;
      postMats.push(trsScaled(x, 0.35, z, 0.14, 0.7, 0.14, 0));
    }
    const mid = (from + to) / 2;
    const len = to - from;
    for (const y of [0.3, 0.55]) {
      railMats.push(alongX ? trsScaled(mid, y, offset, len, 0.06, 0.06, 0) : trsScaled(offset, y, mid, 0.06, 0.06, len, 0));
    }
  };
  for (const side of [-1, 1]) {
    for (const dir of [-1, 1]) {
      const [a, b] = dir < 0 ? [-hw + 1, -4.5] : [4.5, hw - 1];
      addFence(true, side * edge, a, b);
      const [c0, c1] = dir < 0 ? [-hd + 1, -4.5] : [4.5, hd - 1];
      addFence(false, side * edge, c0, c1);
    }
  }
  const fencePost = MeshBuilder.CreateBox("j_fencePost", { size: 1 }, scene);
  fencePost.material = mat("fence", "#5b4330");
  setThinInstances(fencePost, postMats);
  const fenceRail = MeshBuilder.CreateBox("j_fenceRail", { size: 1 }, scene);
  fenceRail.material = mat("fence", "#5b4330");
  setThinInstances(fenceRail, railMats);
  c.statics.push(fencePost, fenceRail);
  c.casters.push(fencePost);

  // Pohon di luar batas area main, rumah warga di sisi atas.
  addTrees(c, "j", ringPositions(26, hw + 2.2, hd + 2.2, 1, [-14, -8, 8, 14]));
  addHouses(c, "j", [-14, -8, 8, 14], hd + 2.8);

  // Pagar bambu di tepi bawah area (depan kamera).
  const bamboo = MeshBuilder.CreateBox("j_bamboo", { width: 0.18, height: 0.9, depth: 0.18 }, scene);
  bamboo.material = mat("fence", "#5b4330");
  const bambooMats: Matrix[] = [];
  for (let x = -hw; x <= hw; x += 1.2) {
    if (Math.abs(x) < 2) continue; // celah jalan
    bambooMats.push(trs(x, 0.45, -hd - 0.4));
  }
  setThinInstances(bamboo, bambooMats);
  c.statics.push(bamboo);

  addLamps(c, "j", [[-10, 3.5], [10, 3.5], [-10, -3.5], [10, -3.5]]);
}

// --- Potongan dekorasi bersama (masing-masing 1 draw call per jenis) ---

function addTrees(c: BuildCtx, prefix: string, spots: { x: number; z: number; s: number; r: number }[]): void {
  const trunk = MeshBuilder.CreateCylinder(`${prefix}_treeTrunk`, { diameter: 0.5, height: 1.6, tessellation: 6 }, c.scene);
  trunk.material = c.mat("wood", "#7a5232");
  const leaves = MeshBuilder.CreateCylinder(`${prefix}_treeLeaves`, { diameterTop: 0, diameterBottom: 2.6, height: 3.2, tessellation: 7 }, c.scene);
  leaves.material = c.mat("leaf", "#1f3d26");
  setThinInstances(trunk, spots.map((p) => trs(p.x, 0.8, p.z, p.s)));
  setThinInstances(leaves, spots.map((p) => trs(p.x, 0.8 + 2.6 * p.s, p.z, p.s, p.r)));
  c.statics.push(trunk, leaves);
  c.casters.push(trunk, leaves);
}

function addHouses(c: BuildCtx, prefix: string, xs: number[], z: number): void {
  const house = MeshBuilder.CreateBox(`${prefix}_house`, { width: 3.2, height: 2.2, depth: 2.6 }, c.scene);
  house.material = c.mat("wall", "#c9b48a");
  // Atap pelana: kotak diputar 45 derajat, setengah bawahnya tenggelam di dalam dinding.
  const roof = MeshBuilder.CreateBox(`${prefix}_houseRoof`, { width: 3.6, height: 2.1, depth: 2.1 }, c.scene);
  roof.material = c.mat("roof", "#8c3b2a");
  setThinInstances(house, xs.map((x) => trs(x, 1.1, z)));
  setThinInstances(roof, xs.map((x) => trs(x, 2.2, z, 1, 0, Math.PI / 4)));
  c.statics.push(house, roof);
  c.casters.push(house, roof);
}

/** Tiang lampu jalan (emisif saja, tanpa sumber cahaya tambahan). */
function addLamps(c: BuildCtx, prefix: string, spots: number[][]): void {
  const pole = MeshBuilder.CreateBox(`${prefix}_lampPole`, { width: 0.15, height: 3, depth: 0.15 }, c.scene);
  pole.material = c.mat("wood", "#7a5232");
  const bulb = MeshBuilder.CreateIcoSphere(`${prefix}_lampBulb`, { radius: 0.28, subdivisions: 1 }, c.scene);
  bulb.material = c.mat("lamp", "#ffd27a", 1.0);
  setThinInstances(pole, spots.map(([x, z]) => trs(x, 1.5, z)));
  setThinInstances(bulb, spots.map(([x, z]) => trs(x, 3.1, z)));
  c.statics.push(pole, bulb);
  c.casters.push(pole);
}

/** Matriks translasi + rotasi (yaw, lalu pitch/roll opsional) + skala seragam. */
function trs(x: number, y: number, z: number, scale = 1, yaw = 0, pitch = 0, roll = 0): Matrix {
  return Matrix.Compose(
    new Vector3(scale, scale, scale),
    Quaternion.RotationYawPitchRoll(yaw, pitch, roll),
    new Vector3(x, y, z),
  );
}

/** Matriks dengan skala per sumbu (untuk kotak satuan yang direntang: palang, petak sawah). */
function trsScaled(x: number, y: number, z: number, sx: number, sy: number, sz: number, yaw: number): Matrix {
  return Matrix.Compose(new Vector3(sx, sy, sz), Quaternion.RotationYawPitchRoll(yaw, 0, 0), new Vector3(x, y, z));
}

function setThinInstances(mesh: Mesh, matrices: Matrix[]): void {
  const buf = new Float32Array(matrices.length * 16);
  matrices.forEach((m, i) => m.copyToArray(buf, i * 16));
  mesh.thinInstanceSetBuffer("matrix", buf, 16, true);
  mesh.thinInstanceRefreshBoundingInfo(false);
}

/** Titik-titik melingkari persegi panjang (untuk pohon di tepi), dengan variasi acak tetap. */
function ringPositions(count: number, hw: number, hd: number, seed: number, houseXs: number[]) {
  const rng = mulberry32(seed);
  const perimeter = 4 * (hw + hd);
  const out: { x: number; z: number; s: number; r: number }[] = [];
  for (let i = 0; i < count; i++) {
    let t = ((i + rng() * 0.5) / count) * perimeter;
    let x: number;
    let z: number;
    if (t < 2 * hw) { x = -hw + t; z = hd; }
    else if ((t -= 2 * hw) < 2 * hd) { x = hw; z = hd - t; }
    else if ((t -= 2 * hd) < 2 * hw) { x = hw - t; z = -hd; }
    else { t -= 2 * hw; x = -hw; z = -hd + t; }
    // Lewati celah jalan dan area rumah di sisi atas.
    if (Math.abs(x) < 2.5 || Math.abs(z) < 2.5) continue;
    if (z > 0 && z >= hd - 0.1 && houseXs.some((hx) => Math.abs(hx - x) < 2.4)) continue;
    // Sisi bawah (dekat kamera) dibiarkan kosong agar pohon tidak menutupi area main.
    if (z <= -hd + 0.1) continue;
    out.push({ x, z, s: 0.8 + rng() * 0.5, r: rng() * Math.PI });
  }
  return out;
}

/** PRNG kecil berseed agar tata letak dekorasi sama setiap kali dimuat. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
