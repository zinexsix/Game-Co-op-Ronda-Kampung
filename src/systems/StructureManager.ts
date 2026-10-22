import {
  Color3,
  Color4,
  Matrix,
  Mesh,
  MeshBuilder,
  Quaternion,
  StandardMaterial,
  Vector3,
  VertexBuffer,
  type Scene,
} from "@babylonjs/core";
import { ARENA } from "../config/arena";
import type { SkillData } from "../data/types";
import { distanceToBox, pushOutOfObb, type CircleBody, type OrientedBox, type StaticBox } from "./Collision";
import type { EnemyManager } from "./EnemyManager";

const BARRICADE_HEIGHT = 1.0;
const BARRICADE_HIT_SEC = 0.15;
/** Warna barikade saat HP hampir habis (dikalikan ke warna kayu). */
const BARRICADE_DAMAGED_TINT = 0.45;
/** Jarak bebas minimal dari pos ronda saat memasang. */
const PLACE_CLEARANCE = 0.3;

export interface Barricade extends OrientedBox {
  active: boolean;
  yaw: number;
  hp: number;
  maxHp: number;
  hitTimer: number;
  /** Urutan pemasangan (untuk mengganti yang tertua jika penuh). */
  order: number;
}

interface Trap {
  active: boolean;
  x: number;
  z: number;
  charges: number;
  /** Sisa waktu sampai jebakan siap lagi setelah terpicu. */
  rearm: number;
  order: number;
}

export type PlaceResult = "ok" | "terhalang";

export interface StructureEvents {
  onBarricadeBroken: (x: number, z: number) => void;
  onTrapTriggered: (x: number, z: number, stunned: number) => void;
}

/** Ukuran dan aturan barikade & jebakan dari roles.json (Pembangun). */
interface StructureRules {
  barricadeHp: number;
  barricadeWidth: number;
  barricadeDepth: number;
  barricadeMax: number;
  trapTriggerRadius: number;
  trapStunRadius: number;
  trapStunSec: number;
  trapCharges: number;
  trapRearmSec: number;
  trapMax: number;
}

/**
 * Barikade (penghalang ber-HP) dan jebakan (stun) milik Pembangun.
 * Masing-masing berupa pool tetap yang digambar dengan thin instances (1 draw call per jenis).
 * Jika batas tercapai, yang tertua diganti.
 */
export class StructureManager {
  readonly barricades: Barricade[];
  private readonly traps: Trap[];
  private readonly rules: StructureRules;
  private readonly barricadeMesh: Mesh;
  private readonly trapMesh: Mesh;
  private readonly barricadeMatrices: Float32Array;
  private readonly barricadeColors: Float32Array;
  private readonly trapMatrices: Float32Array;
  private readonly trapColors: Float32Array;
  private readonly tmpMatrix = new Matrix();
  private readonly tmpQuat = new Quaternion();
  private readonly tmpScale = new Vector3(1, 1, 1);
  private readonly tmpPos = new Vector3();
  private order = 0;
  private time = 0;

  constructor(
    scene: Scene,
    barricade: SkillData,
    trap: SkillData,
    private readonly markasBox: StaticBox,
    private readonly events: StructureEvents,
  ) {
    this.rules = {
      barricadeHp: need(barricade.hp, "barikade.hp"),
      barricadeWidth: need(barricade.width, "barikade.width"),
      barricadeDepth: need(barricade.depth, "barikade.depth"),
      barricadeMax: need(barricade.maxActive, "barikade.maxActive"),
      trapTriggerRadius: need(trap.triggerRadius, "jebakan.triggerRadius"),
      trapStunRadius: need(trap.radius, "jebakan.radius"),
      trapStunSec: need(trap.duration, "jebakan.duration"),
      trapCharges: need(trap.charges, "jebakan.charges"),
      trapRearmSec: need(trap.rearmSec, "jebakan.rearmSec"),
      trapMax: need(trap.maxActive, "jebakan.maxActive"),
    };
    const r = this.rules;
    this.barricades = Array.from({ length: r.barricadeMax }, () => ({
      active: false, cx: 0, cz: 0, halfX: r.barricadeWidth / 2, halfZ: r.barricadeDepth / 2, cos: 1, sin: 0,
      yaw: 0, hp: 0, maxHp: r.barricadeHp, hitTimer: 0, order: 0,
    }));
    this.traps = Array.from({ length: r.trapMax }, () => ({ active: false, x: 0, z: 0, charges: 0, rearm: 0, order: 0 }));

    this.barricadeMesh = buildBarricadeMesh(scene, r.barricadeWidth, r.barricadeDepth);
    this.trapMesh = buildTrapMesh(scene, r.trapTriggerRadius);
    this.barricadeMatrices = new Float32Array(r.barricadeMax * 16);
    this.barricadeColors = new Float32Array(r.barricadeMax * 4);
    this.trapMatrices = new Float32Array(r.trapMax * 16);
    this.trapColors = new Float32Array(r.trapMax * 4);
    for (const [mesh, m, c] of [
      [this.barricadeMesh, this.barricadeMatrices, this.barricadeColors],
      [this.trapMesh, this.trapMatrices, this.trapColors],
    ] as const) {
      mesh.thinInstanceSetBuffer("matrix", m, 16, false);
      mesh.thinInstanceSetBuffer("color", c, 4, false);
      mesh.thinInstanceCount = 0;
      mesh.alwaysSelectAsActiveMesh = true;
      mesh.isPickable = false;
    }
  }

  /** Mesh yang ikut membuat bayangan. */
  get shadowMeshes(): Mesh[] {
    return [this.barricadeMesh];
  }

  get activeBarricades(): number {
    return this.barricadeMesh.thinInstanceCount;
  }

  get activeTraps(): number {
    return this.trapMesh.thinInstanceCount;
  }

  /** Pasang barikade melintang di (x, z), tegak lurus arah hadap (fx, fz). */
  placeBarricade(x: number, z: number, fx: number, fz: number): PlaceResult {
    const r = this.rules;
    const halfW = r.barricadeWidth / 2;
    // Sumbu lebar = tegak lurus arah hadap.
    const cos = fz;
    const sin = -fx;
    const cx = clamp(x, ARENA.halfWidth - r.barricadeDepth);
    const cz = clamp(z, ARENA.halfDepth - r.barricadeDepth);
    // Tolak jika menutupi pos ronda (cek tengah dan kedua ujung).
    const clear = r.barricadeDepth / 2 + PLACE_CLEARANCE;
    for (const t of [-1, 0, 1]) {
      if (distanceToBox(cx + cos * halfW * t, cz + sin * halfW * t, this.markasBox) < clear) return "terhalang";
    }
    const b = this.barricades.find((q) => !q.active) ?? oldest(this.barricades);
    b.active = true;
    b.cx = cx;
    b.cz = cz;
    b.cos = cos;
    b.sin = sin;
    b.yaw = Math.atan2(-sin, cos);
    b.hp = b.maxHp;
    b.hitTimer = 0;
    b.order = ++this.order;
    return "ok";
  }

  /** Pasang jebakan di tanah pada (x, z). */
  placeTrap(x: number, z: number): PlaceResult {
    const r = this.rules;
    const cx = clamp(x, ARENA.halfWidth - r.trapTriggerRadius);
    const cz = clamp(z, ARENA.halfDepth - r.trapTriggerRadius);
    if (distanceToBox(cx, cz, this.markasBox) < r.trapTriggerRadius) return "terhalang";
    const t = this.traps.find((q) => !q.active) ?? oldest(this.traps);
    t.active = true;
    t.x = cx;
    t.z = cz;
    t.charges = r.trapCharges;
    t.rearm = 0;
    t.order = ++this.order;
    return "ok";
  }

  damageBarricade(b: Barricade, amount: number): void {
    if (!b.active) return;
    b.hp -= amount;
    b.hitTimer = BARRICADE_HIT_SEC;
    if (b.hp <= 0) {
      b.active = false;
      this.events.onBarricadeBroken(b.cx, b.cz);
    }
  }

  /** Dorong lingkaran (pemain/musuh) keluar dari semua barikade. */
  pushOut(body: CircleBody): void {
    for (const b of this.barricades) if (b.active) pushOutOfObb(body, b);
  }

  update(dt: number, enemies: EnemyManager): void {
    this.time += dt;
    const r = this.rules;

    // Jebakan: terpicu jika ada musuh menginjak; semua musuh di radius stun ikut terkena.
    for (const t of this.traps) {
      if (!t.active) continue;
      t.rearm = Math.max(0, t.rearm - dt);
      if (t.rearm > 0) continue;
      if (!enemies.anyWithin(t.x, t.z, r.trapTriggerRadius, true)) continue;
      const stunned = enemies.stunWithin(t.x, t.z, r.trapStunRadius, r.trapStunSec);
      t.charges--;
      t.rearm = r.trapRearmSec;
      if (t.charges <= 0) t.active = false;
      this.events.onTrapTriggered(t.x, t.z, stunned);
    }

    let n = 0;
    for (const b of this.barricades) {
      if (!b.active) continue;
      b.hitTimer = Math.max(0, b.hitTimer - dt);
      const shake = (b.hitTimer / BARRICADE_HIT_SEC) * 0.08;
      this.tmpPos.set(b.cx + (Math.random() - 0.5) * shake, 0, b.cz + (Math.random() - 0.5) * shake);
      Quaternion.RotationYawPitchRollToRef(b.yaw, 0, 0, this.tmpQuat);
      Matrix.ComposeToRef(this.tmpScale, this.tmpQuat, this.tmpPos, this.tmpMatrix);
      this.tmpMatrix.copyToArray(this.barricadeMatrices, n * 16);
      // Makin rusak makin gelap kemerahan.
      const health = b.hp / b.maxHp;
      const k = BARRICADE_DAMAGED_TINT + (1 - BARRICADE_DAMAGED_TINT) * health;
      this.barricadeColors.set([1, k, k, 1], n * 4);
      n++;
    }
    this.barricadeMesh.thinInstanceCount = n;
    if (n > 0) {
      this.barricadeMesh.thinInstanceBufferUpdated("matrix");
      this.barricadeMesh.thinInstanceBufferUpdated("color");
    }

    n = 0;
    for (const t of this.traps) {
      if (!t.active) continue;
      this.tmpPos.set(t.x, 0, t.z);
      Quaternion.RotationYawPitchRollToRef(this.time * 0.5, 0, 0, this.tmpQuat);
      Matrix.ComposeToRef(this.tmpScale, this.tmpQuat, this.tmpPos, this.tmpMatrix);
      this.tmpMatrix.copyToArray(this.trapMatrices, n * 16);
      // Siap: berkedip terang. Sedang mengisi ulang: redup.
      const k = t.rearm > 0 ? 0.35 : 0.75 + 0.25 * Math.sin(this.time * 6);
      this.trapColors.set([k, k, k, 1], n * 4);
      n++;
    }
    this.trapMesh.thinInstanceCount = n;
    if (n > 0) {
      this.trapMesh.thinInstanceBufferUpdated("matrix");
      this.trapMesh.thinInstanceBufferUpdated("color");
    }
  }

  reset(): void {
    for (const b of this.barricades) b.active = false;
    for (const t of this.traps) t.active = false;
    this.barricadeMesh.thinInstanceCount = 0;
    this.trapMesh.thinInstanceCount = 0;
  }
}

function need(value: number | undefined, field: string): number {
  if (value === undefined) throw new Error(`roles.json: pembangun butuh nilai "${field}"`);
  return value;
}

function clamp(v: number, limit: number): number {
  return Math.max(-limit, Math.min(limit, v));
}

function oldest<T extends { order: number }>(items: T[]): T {
  return items.reduce((a, b) => (b.order < a.order ? b : a));
}

/** Gabungkan bagian berwarna per-vertex menjadi satu mesh (1 material). */
function mergeColored(scene: Scene, name: string, parts: [Mesh, Color4][]): Mesh {
  for (const [m, c] of parts) {
    const count = m.getTotalVertices();
    const colors = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) colors.set([c.r, c.g, c.b, 1], i * 4);
    m.setVerticesData(VertexBuffer.ColorKind, colors);
  }
  const merged = Mesh.MergeMeshes(parts.map(([m]) => m), true, true);
  if (!merged) throw new Error(`Gagal membuat mesh ${name}`);
  merged.name = name;
  merged.hasVertexAlpha = false;
  const mat = new StandardMaterial(`${name}Mat`, scene);
  mat.diffuseColor = Color3.White();
  mat.emissiveColor = new Color3(0.3, 0.3, 0.3); // tetap terbaca di malam hari
  mat.specularColor = Color3.Black();
  merged.material = mat;
  return merged;
}

/** Barikade kayu: 2 tiang + 3 papan melintang (sumbu lebar = X lokal). */
function buildBarricadeMesh(scene: Scene, width: number, depth: number): Mesh {
  const wood = new Color4(0.62, 0.42, 0.24, 1);
  const dark = new Color4(0.42, 0.28, 0.16, 1);
  const parts: [Mesh, Color4][] = [];
  for (const side of [-1, 1]) {
    const post = MeshBuilder.CreateBox("bPost", { width: 0.22, height: BARRICADE_HEIGHT + 0.15, depth: depth }, scene);
    post.position.set(side * (width / 2 - 0.11), (BARRICADE_HEIGHT + 0.15) / 2, 0);
    parts.push([post, dark]);
  }
  for (let i = 0; i < 3; i++) {
    const plank = MeshBuilder.CreateBox("bPlank", { width: width, height: 0.22, depth: depth * 0.6 }, scene);
    plank.position.set(0, 0.2 + i * 0.32, 0);
    plank.rotation.z = (i - 1) * 0.04; // sedikit miring agar terlihat buatan tangan
    parts.push([plank, wood]);
  }
  return mergeColored(scene, "barricade", parts);
}

/** Jebakan: piringan logam + 6 paku kecil. */
function buildTrapMesh(scene: Scene, radius: number): Mesh {
  const metal = new Color4(0.55, 0.58, 0.62, 1);
  const spike = new Color4(0.95, 0.85, 0.3, 1);
  const parts: [Mesh, Color4][] = [];
  const plate = MeshBuilder.CreateCylinder("tPlate", { diameter: radius * 2, height: 0.08, tessellation: 12 }, scene);
  plate.position.y = 0.04;
  parts.push([plate, metal]);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    const s = MeshBuilder.CreateCylinder("tSpike", { diameterTop: 0, diameterBottom: 0.16, height: 0.3, tessellation: 4 }, scene);
    s.position.set(Math.cos(a) * radius * 0.6, 0.22, Math.sin(a) * radius * 0.6);
    parts.push([s, spike]);
  }
  return mergeColored(scene, "trap", parts);
}
