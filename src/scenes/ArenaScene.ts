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
  Vector3,
  type AbstractEngine,
  type AbstractMesh,
} from "@babylonjs/core";
import { ARENA } from "../config/arena";
import type { StaticBox } from "../systems/Collision";

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
}

/** Bangun adegan arena: malam kampung, pos ronda di tengah, dekorasi di tepi. */
export function createArenaScene(engine: AbstractEngine, shadowMapSize: number): Arena {
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
  fitCamera();

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

  // --- Material bersama ---
  const mat = (name: string, hex: string, emissive = 0): StandardMaterial => {
    const m = new StandardMaterial(name, scene);
    m.diffuseColor = Color3.FromHexString(hex);
    m.specularColor = Color3.Black();
    if (emissive > 0) m.emissiveColor = Color3.FromHexString(hex).scale(emissive);
    return m;
  };
  const grassMat = mat("grass", "#2f4a2c");
  const dirtMat = mat("dirt", "#6b5537");
  const woodMat = mat("wood", "#7a5232");
  const roofMat = mat("roof", "#8c3b2a");
  const wallMat = mat("wall", "#c9b48a");
  const leafMat = mat("leaf", "#1f3d26");
  const lampMat = mat("lamp", "#ffd27a", 1.0);
  const fenceMat = mat("fence", "#5b4330");

  // --- Lantai ---
  const gw = (ARENA.halfWidth + ARENA.groundMargin) * 2;
  const gd = (ARENA.halfDepth + ARENA.groundMargin) * 2;
  const ground = MeshBuilder.CreateGround("ground", { width: gw, height: gd }, scene);
  ground.material = grassMat;
  ground.receiveShadows = true;

  // Jalan tanah bersilang menuju pos ronda (jalur musuh).
  const roadX = MeshBuilder.CreateGround("roadX", { width: ARENA.halfWidth * 2, height: 3 }, scene);
  const roadZ = MeshBuilder.CreateGround("roadZ", { width: 3, height: ARENA.halfDepth * 2 }, scene);
  for (const r of [roadX, roadZ]) {
    r.position.y = 0.01;
    r.material = dirtMat;
    r.receiveShadows = true;
  }

  // --- Pos ronda (placeholder): lantai panggung, 4 tiang, atap limas, lampu, kentongan ---
  const post: AbstractMesh[] = [];
  const s = ARENA.postHalfSize;
  const floor = MeshBuilder.CreateBox("postFloor", { width: s * 2, height: 0.5, depth: s * 2 }, scene);
  floor.position.y = 0.25;
  floor.material = woodMat;
  post.push(floor);

  const pillar = MeshBuilder.CreateBox("postPillar", { width: 0.25, height: 2.4, depth: 0.25 }, scene);
  pillar.material = woodMat;
  setThinInstances(
    pillar,
    [[-1, -1], [1, -1], [-1, 1], [1, 1]].map(([x, z]) => trs(x * (s - 0.2), 1.7, z * (s - 0.2))),
  );
  post.push(pillar);

  const roof = MeshBuilder.CreateCylinder("postRoof", { diameterTop: 0, diameterBottom: s * 3.4, height: 1.6, tessellation: 4 }, scene);
  roof.rotation.y = Math.PI / 4;
  roof.position.y = 3.7;
  roof.material = roofMat;
  post.push(roof);

  const lamp = MeshBuilder.CreateIcoSphere("postLamp", { radius: 0.25, subdivisions: 1 }, scene);
  lamp.position.set(0, 2.6, -s + 0.3);
  lamp.material = lampMat;
  post.push(lamp);

  const kentongan = MeshBuilder.CreateCylinder("kentongan", { diameter: 0.35, height: 1.1, tessellation: 8 }, scene);
  kentongan.position.set(s - 0.3, 1.6, -s + 0.3);
  kentongan.material = woodMat;
  post.push(kentongan);

  // --- Dekorasi berulang: semuanya thin instances (1 draw call per jenis) ---
  const decor: AbstractMesh[] = [];

  // Pohon di luar batas area main.
  const trunk = MeshBuilder.CreateCylinder("treeTrunk", { diameter: 0.5, height: 1.6, tessellation: 6 }, scene);
  trunk.material = woodMat;
  const leaves = MeshBuilder.CreateCylinder("treeLeaves", { diameterTop: 0, diameterBottom: 2.6, height: 3.2, tessellation: 7 }, scene);
  leaves.material = leafMat;
  const treeSpots = ringPositions(26, ARENA.halfWidth + 2.2, ARENA.halfDepth + 2.2, 1);
  setThinInstances(trunk, treeSpots.map((p) => trs(p.x, 0.8, p.z, p.s)));
  setThinInstances(leaves, treeSpots.map((p) => trs(p.x, 0.8 + 2.6 * p.s, p.z, p.s, p.r)));
  decor.push(trunk, leaves);

  // Rumah warga di sisi atas (jauh dari kamera) sebagai latar.
  const house = MeshBuilder.CreateBox("house", { width: 3.2, height: 2.2, depth: 2.6 }, scene);
  house.material = wallMat;
  // Atap pelana: kotak diputar 45 derajat, setengah bawahnya tenggelam di dalam dinding.
  const houseRoof = MeshBuilder.CreateBox("houseRoof", { width: 3.6, height: 2.1, depth: 2.1 }, scene);
  houseRoof.material = roofMat;
  const houseXs = [-14, -8, 8, 14];
  const houseZ = ARENA.halfDepth + 2.8;
  setThinInstances(house, houseXs.map((x) => trs(x, 1.1, houseZ)));
  setThinInstances(houseRoof, houseXs.map((x) => trs(x, 2.2, houseZ, 1, 0, Math.PI / 4)));
  decor.push(house, houseRoof);

  // Pagar bambu di tepi bawah area (depan kamera).
  const fence = MeshBuilder.CreateBox("fencePost", { width: 0.18, height: 0.9, depth: 0.18 }, scene);
  fence.material = fenceMat;
  const fenceMats: Matrix[] = [];
  for (let x = -ARENA.halfWidth; x <= ARENA.halfWidth; x += 1.2) {
    if (Math.abs(x) < 2) continue; // celah jalan
    fenceMats.push(trs(x, 0.45, -ARENA.halfDepth - 0.4));
  }
  setThinInstances(fence, fenceMats);
  decor.push(fence);

  // Tiang lampu jalan (emisif saja, tanpa sumber cahaya tambahan).
  const lampPole = MeshBuilder.CreateBox("lampPole", { width: 0.15, height: 3, depth: 0.15 }, scene);
  lampPole.material = woodMat;
  const lampBulb = MeshBuilder.CreateIcoSphere("lampBulb", { radius: 0.28, subdivisions: 1 }, scene);
  lampBulb.material = lampMat;
  const poles = [[-10, 3.5], [10, 3.5], [-10, -3.5], [10, -3.5]];
  setThinInstances(lampPole, poles.map(([x, z]) => trs(x, 1.5, z)));
  setThinInstances(lampBulb, poles.map(([x, z]) => trs(x, 3.1, z)));
  decor.push(lampPole, lampBulb);

  // Batu-batu kecil tersebar di rumput.
  const rock = MeshBuilder.CreateIcoSphere("rock", { radius: 0.3, subdivisions: 1, flat: true }, scene);
  rock.material = mat("rockMat", "#5a5f66");
  const rocks: Matrix[] = [];
  const rng = mulberry32(7);
  for (let i = 0; i < 40; i++) {
    const x = (rng() * 2 - 1) * ARENA.halfWidth;
    const z = (rng() * 2 - 1) * ARENA.halfDepth;
    if (Math.abs(x) < 2.5 || Math.abs(z) < 2.5) continue; // jangan di jalan / pos
    rocks.push(trs(x, 0.05, z, 0.6 + rng() * 0.8, rng() * Math.PI));
  }
  setThinInstances(rock, rocks);
  decor.push(rock);

  // Objek statis: bekukan matriks dunia, tidak ikut dipilih/picking.
  for (const m of [ground, roadX, roadZ, ...post, ...decor]) {
    m.isPickable = false;
    m.freezeWorldMatrix();
  }
  // Pembuat bayangan: struktur tinggi saja (lantai & batu tidak perlu).
  for (const m of [...post, trunk, leaves, house, houseRoof, lampPole]) shadows.addShadowCaster(m, false);
  floor.receiveShadows = true;

  return {
    scene,
    camera,
    sun,
    shadows,
    postBox: { cx: 0, cz: 0, halfX: s, halfZ: s },
    postCenter: Vector3.Zero(),
    fitCamera,
  };
}

/** Matriks translasi + rotasi (yaw, lalu pitch/roll opsional) + skala seragam. */
function trs(x: number, y: number, z: number, scale = 1, yaw = 0, pitch = 0, roll = 0): Matrix {
  return Matrix.Compose(
    new Vector3(scale, scale, scale),
    Quaternion.RotationYawPitchRoll(yaw, pitch, roll),
    new Vector3(x, y, z),
  );
}

function setThinInstances(mesh: Mesh, matrices: Matrix[]): void {
  const buf = new Float32Array(matrices.length * 16);
  matrices.forEach((m, i) => m.copyToArray(buf, i * 16));
  mesh.thinInstanceSetBuffer("matrix", buf, 16, true);
  mesh.thinInstanceRefreshBoundingInfo(false);
}

/** Titik-titik melingkari persegi panjang (untuk pohon di tepi), dengan variasi acak tetap. */
function ringPositions(count: number, hw: number, hd: number, seed: number) {
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
    if (z > 0 && z >= hd - 0.1 && houseNear(x)) continue;
    // Sisi bawah (dekat kamera) dibiarkan kosong agar pohon tidak menutupi area main.
    if (z <= -hd + 0.1) continue;
    out.push({ x, z, s: 0.8 + rng() * 0.5, r: rng() * Math.PI });
  }
  return out;
}

function houseNear(x: number): boolean {
  return [-14, -8, 8, 14].some((hx) => Math.abs(hx - x) < 2.4);
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
