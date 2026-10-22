import { Color3, Color4, Matrix, Mesh, MeshBuilder, StandardMaterial, VertexBuffer, type Scene } from "@babylonjs/core";
import type { EnemyData } from "../data/types";

/** Model satu jenis musuh + cara menggambarnya. */
export interface EnemyModel {
  mesh: Mesh;
  /** Tinggi dasar di atas lantai (hantu melayang). */
  baseY: number;
  /** Tinggi bintang stun di atas kepala. */
  headY: number;
  /** Gaya goyang: "jalan" (melompat kecil saat bergerak) atau "melayang" (naik-turun pelan). */
  bob: "jalan" | "melayang";
}

type Part = [Mesh, Color4];

/** Buat model low-poly untuk musuh biasa (anggaran PRD: maks 500 segitiga; tikus maks 300). */
export function buildEnemyModel(scene: Scene, data: EnemyData): EnemyModel {
  switch (data.id) {
    case "tikus":
      return { mesh: buildRat(scene, data), baseY: 0, headY: data.size * 1.1, bob: "jalan" };
    case "hantu":
      return { mesh: buildGhost(scene, data), baseY: 0.35, headY: data.size * 2.3, bob: "melayang" };
    case "pencuri":
      return { mesh: buildThief(scene, data), baseY: 0, headY: data.size * 2.4, bob: "jalan" };
    default:
      throw new Error(`Model musuh belum dibuat: ${data.id}`);
  }
}

/** Gabungkan bagian berwarna per-vertex jadi satu mesh (1 material, 1 draw call), skalakan ke `size`. */
function merge(scene: Scene, data: EnemyData, parts: Part[], refSize: number, emissive: number): Mesh {
  for (const [m, c] of parts) {
    const count = m.getTotalVertices();
    const colors = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b, 1], i * 4);
    m.setVerticesData(VertexBuffer.ColorKind, colors);
  }
  const merged = Mesh.MergeMeshes(parts.map(([m]) => m), true, true);
  if (!merged) throw new Error(`Gagal membuat model ${data.id}`);
  merged.name = `enemy_${data.id}`;
  merged.hasVertexAlpha = false; // warna vertex opak; jangan masuk antrean transparan
  const k = data.size / refSize;
  merged.bakeTransformIntoVertices(Matrix.Scaling(k, k, k));
  const mat = new StandardMaterial(`enemyMat_${data.id}`, scene);
  mat.diffuseColor = Color3.White(); // warna dari vertex color
  mat.emissiveColor = new Color3(emissive, emissive, emissive); // tetap terbaca di malam hari
  mat.specularColor = Color3.Black();
  merged.material = mat;
  merged.isPickable = false;
  return merged;
}

function furColor(data: EnemyData): Color4 {
  return Color4.FromHexString(data.color + "ff");
}

/** Tikus Raksasa (~230 segitiga): badan, moncong, telinga, mata merah, ekor, 4 kaki. */
function buildRat(scene: Scene, data: EnemyData): Mesh {
  const fur = furColor(data);
  const dark = new Color4(fur.r * 0.6, fur.g * 0.6, fur.b * 0.6, 1);
  const pink = new Color4(0.9, 0.55, 0.6, 1);
  const eye = new Color4(1, 0.1, 0.05, 1);
  const parts: Part[] = [];

  const body = MeshBuilder.CreateIcoSphere("ratBody", { radiusX: 0.32, radiusY: 0.25, radiusZ: 0.46, subdivisions: 2, flat: true }, scene);
  body.position.set(0, 0.3, 0);
  parts.push([body, fur]);

  const snout = MeshBuilder.CreateCylinder("ratSnout", { diameterTop: 0, diameterBottom: 0.36, height: 0.42, tessellation: 6 }, scene);
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0.34, 0.56);
  parts.push([snout, fur]);

  const nose = MeshBuilder.CreateBox("ratNose", { size: 0.08 }, scene);
  nose.position.set(0, 0.34, 0.77);
  parts.push([nose, pink]);

  for (const side of [-1, 1]) {
    const ear = MeshBuilder.CreateBox("ratEar", { width: 0.18, height: 0.18, depth: 0.04 }, scene);
    ear.position.set(side * 0.14, 0.55, 0.36);
    ear.rotation.z = side * 0.3;
    parts.push([ear, pink]);
    const eyeMesh = MeshBuilder.CreateBox("ratEye", { size: 0.07 }, scene);
    eyeMesh.position.set(side * 0.1, 0.44, 0.6);
    parts.push([eyeMesh, eye]);
  }

  const tail = MeshBuilder.CreateCylinder("ratTail", { diameterTop: 0.02, diameterBottom: 0.07, height: 0.7, tessellation: 4 }, scene);
  tail.rotation.x = -Math.PI / 2 + 0.35;
  tail.position.set(0, 0.26, -0.75);
  parts.push([tail, pink]);

  for (const [x, z] of [[-0.17, 0.22], [0.17, 0.22], [-0.17, -0.22], [0.17, -0.22]]) {
    const leg = MeshBuilder.CreateBox("ratLeg", { width: 0.1, height: 0.18, depth: 0.12 }, scene);
    leg.position.set(x, 0.09, z);
    parts.push([leg, dark]);
  }
  return merge(scene, data, parts, 0.6, 0.3);
}

/** Hantu Iseng (~300 segitiga): kain melayang, kepala bulat, mata & mulut gelap, ujung kain berjumbai. */
function buildGhost(scene: Scene, data: EnemyData): Mesh {
  const cloth = furColor(data);
  const shade = new Color4(cloth.r * 0.75, cloth.g * 0.75, cloth.b * 0.85, 1);
  const hole = new Color4(0.08, 0.06, 0.15, 1);
  const parts: Part[] = [];

  const body = MeshBuilder.CreateCylinder("ghostBody", { diameterTop: 0.55, diameterBottom: 0.95, height: 0.9, tessellation: 10 }, scene);
  body.position.y = 0.55;
  parts.push([body, cloth]);

  const head = MeshBuilder.CreateIcoSphere("ghostHead", { radius: 0.34, subdivisions: 2 }, scene);
  head.position.y = 1.1;
  parts.push([head, cloth]);

  // Jumbai di bawah kain.
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const tassel = MeshBuilder.CreateCylinder("ghostTassel", { diameterTop: 0.26, diameterBottom: 0, height: 0.32, tessellation: 4 }, scene);
    tassel.position.set(Math.cos(a) * 0.36, 0.0, Math.sin(a) * 0.36);
    parts.push([tassel, shade]);
  }

  // Lengan melambai ke depan.
  for (const side of [-1, 1]) {
    const arm = MeshBuilder.CreateCylinder("ghostArm", { diameterTop: 0.08, diameterBottom: 0.2, height: 0.5, tessellation: 5 }, scene);
    arm.rotation.x = Math.PI / 2.4;
    arm.rotation.z = -side * 0.4;
    arm.position.set(side * 0.38, 0.75, 0.22);
    parts.push([arm, cloth]);
    const eye = MeshBuilder.CreateBox("ghostEye", { width: 0.1, height: 0.14, depth: 0.05 }, scene);
    eye.position.set(side * 0.12, 1.15, 0.31);
    parts.push([eye, hole]);
  }
  const mouth = MeshBuilder.CreateBox("ghostMouth", { width: 0.14, height: 0.08, depth: 0.05 }, scene);
  mouth.position.set(0, 0.98, 0.32);
  parts.push([mouth, hole]);

  // Hantu bercahaya pucat: emissive lebih tinggi dari musuh lain.
  return merge(scene, data, parts, 0.9, 0.55);
}

/** Pencuri (~260 segitiga): berbaju gelap, kepala bertopeng, karung di punggung. */
function buildThief(scene: Scene, data: EnemyData): Mesh {
  const shirt = furColor(data);
  const pants = new Color4(0.15, 0.17, 0.22, 1);
  const skin = new Color4(0.78, 0.58, 0.42, 1);
  const mask = new Color4(0.05, 0.05, 0.07, 1);
  const sack = new Color4(0.72, 0.62, 0.42, 1);
  const parts: Part[] = [];

  for (const side of [-1, 1]) {
    const leg = MeshBuilder.CreateBox("thiefLeg", { width: 0.18, height: 0.6, depth: 0.2 }, scene);
    leg.position.set(side * 0.12, 0.3, 0);
    parts.push([leg, pants]);
    const arm = MeshBuilder.CreateBox("thiefArm", { width: 0.13, height: 0.55, depth: 0.15 }, scene);
    arm.position.set(side * 0.33, 0.9, 0.05);
    arm.rotation.x = -0.4;
    parts.push([arm, shirt]);
  }

  const torso = MeshBuilder.CreateCylinder("thiefTorso", { diameterTop: 0.5, diameterBottom: 0.42, height: 0.65, tessellation: 8 }, scene);
  torso.position.y = 0.92;
  parts.push([torso, shirt]);

  const head = MeshBuilder.CreateIcoSphere("thiefHead", { radius: 0.22, subdivisions: 2 }, scene);
  head.position.y = 1.45;
  parts.push([head, skin]);

  // Topeng: pita hitam melingkar di mata.
  const band = MeshBuilder.CreateCylinder("thiefMask", { diameter: 0.47, height: 0.11, tessellation: 10 }, scene);
  band.position.y = 1.48;
  parts.push([band, mask]);

  // Peci gelap di atas kepala.
  const cap = MeshBuilder.CreateCylinder("thiefCap", { diameter: 0.36, height: 0.14, tessellation: 8 }, scene);
  cap.position.y = 1.64;
  parts.push([cap, mask]);

  // Karung di punggung.
  const bag = MeshBuilder.CreateIcoSphere("thiefSack", { radius: 0.3, subdivisions: 1, flat: true }, scene);
  bag.position.set(0, 1.0, -0.33);
  parts.push([bag, sack]);

  return merge(scene, data, parts, 0.8, 0.35);
}
