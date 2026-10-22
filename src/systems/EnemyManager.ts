import {
  Color4,
  Matrix,
  Mesh,
  MeshBuilder,
  Quaternion,
  StandardMaterial,
  Color3,
  VertexBuffer,
  Vector3,
  type Scene,
} from "@babylonjs/core";
import { Enemy } from "../entities/Enemy";
import type { Markas } from "../entities/Markas";
import type { DamageResult, Player } from "../entities/Player";
import type { EnemyData } from "../data/types";
import { ARENA } from "../config/arena";
import { distanceToBox, nearestOnObb, pushOutOfBox, pushOutOfCircle, toObbLocal } from "./Collision";
import type { Barricade, StructureManager } from "./StructureManager";

const SEPARATION_WEIGHT = 1.4;
const STEER_RATE = 6; // seberapa cepat kecepatan menyesuaikan arah tujuan
const HIT_ANIM_SEC = 0.15;
const BITE_ANIM_SEC = 0.2;
/** Barikade dianggap menghalangi jika arah ke barikade searah tujuan (cos sudut). */
const BLOCK_DOT = 0.5;
/** Jarak tambahan untuk mulai "melihat" barikade di depan. */
const BARRICADE_LOOKAHEAD = 0.3;
/** Ukuran acuan model tikus; model diskalakan ke `size` dari JSON. */
const MODEL_REF_SIZE = 0.6;
/** Isi pool otomatis (benchmark): jeda antar munculnya musuh. */
const FILL_SPAWN_INTERVAL = 0.08;
const STARS_PER_ENEMY = 2;
const STAR_ORBIT_SPEED = 6;

export type AttackTarget = "pemain" | "markas" | "barikade";

export interface EnemyEvents {
  /** Musuh kalah (HP 0). */
  onKilled: (e: Enemy) => void;
  /** Musuh menyerang (untuk efek visual). `result` hanya untuk serangan ke pemain. */
  onAttack: (x: number, z: number, target: AttackTarget, result?: DamageResult) => void;
}

/**
 * Pool musuh berkapasitas tetap + render via thin instances (1 draw call untuk semua musuh).
 * Musuh berjalan ke pos ronda dengan steering (seek + separation) lalu menyerangnya.
 * Reaksi: pemain yang menghalangi digigit; barikade diputari (dekat ujung) atau digigit (dekat tengah);
 * jebakan membuat stun; Pancing Penjaga mengganti sasaran ke Penjaga.
 */
export class EnemyManager {
  readonly pool: Enemy[];
  private readonly mesh: Mesh;
  private readonly starMesh: Mesh;
  private readonly matrixBuffer: Float32Array;
  private readonly starBuffer: Float32Array;
  private readonly tmpMatrix = new Matrix();
  private readonly tmpQuat = new Quaternion();
  private readonly tmpScale = new Vector3(1, 1, 1);
  private readonly tmpPos = new Vector3();
  private readonly unitScale = new Vector3(1, 1, 1);
  private readonly identityQuat = Quaternion.Identity();
  private time = 0;
  /** Jika true, pool otomatis diisi sampai penuh (benchmark beban maksimal). */
  fillToCapacity = false;
  private fillTimer = 0;
  private _activeCount = 0;

  constructor(
    scene: Scene,
    readonly capacity: number,
    private readonly data: EnemyData,
    private readonly spawnPoints: readonly [number, number][],
    private readonly events: EnemyEvents,
  ) {
    this.pool = Array.from({ length: capacity }, () => new Enemy());

    this.mesh = buildRatMesh(scene, data);
    this.mesh.isPickable = false;
    this.matrixBuffer = new Float32Array(capacity * 16);
    this.mesh.thinInstanceSetBuffer("matrix", this.matrixBuffer, 16, false);
    this.mesh.thinInstanceCount = 0;
    // Posisi berubah tiap frame; lewati perhitungan bounding agar murah.
    this.mesh.alwaysSelectAsActiveMesh = true;

    // Bintang kecil berputar di atas kepala musuh yang terkena stun (20 segitiga per bintang).
    this.starMesh = MeshBuilder.CreateIcoSphere("stunStar", { radius: 0.12, subdivisions: 1, flat: true }, scene);
    const starMat = new StandardMaterial("stunStarMat", scene);
    starMat.disableLighting = true;
    starMat.emissiveColor = new Color3(1, 0.95, 0.35);
    this.starMesh.material = starMat;
    this.starMesh.isPickable = false;
    this.starBuffer = new Float32Array(capacity * STARS_PER_ENEMY * 16);
    this.starMesh.thinInstanceSetBuffer("matrix", this.starBuffer, 16, false);
    this.starMesh.thinInstanceCount = 0;
    this.starMesh.alwaysSelectAsActiveMesh = true;
  }

  get renderMesh(): Mesh {
    return this.mesh;
  }

  get activeCount(): number {
    return this._activeCount;
  }

  get modelTriangles(): number {
    return this.mesh.getTotalIndices() / 3;
  }

  /** Munculkan musuh di titik (x, z); null jika batas musuh aktif tercapai. */
  spawnAt(x: number, z: number): Enemy | null {
    const e = this.pool.find((p) => !p.active);
    if (!e) return null;
    e.spawn(this.data, x, z);
    this._activeCount++;
    return e;
  }

  /** Munculkan sekelompok musuh di titik muncul acak (mode uji). */
  spawnGroup(count: number): number {
    const [x, z] = this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
    let n = 0;
    for (let i = 0; i < count; i++) if (this.spawnAt(x + (Math.random() - 0.5) * 2, z + (Math.random() - 0.5) * 2)) n++;
    return n;
  }

  /** Beri damage; mengembalikan true jika musuh kalah karenanya. */
  damage(e: Enemy, amount: number): boolean {
    if (!e.active) return false;
    e.hp -= amount;
    e.hitTimer = HIT_ANIM_SEC;
    if (e.hp > 0) return false;
    e.despawn();
    this._activeCount--;
    this.events.onKilled(e);
    return true;
  }

  /** Damage ke semua musuh dalam radius. Mengembalikan jumlah musuh yang terkena. */
  damageInRadius(x: number, z: number, radius: number, amount: number): number {
    let hit = 0;
    for (const e of this.pool) {
      if (!e.active || !this.within(e, x, z, radius)) continue;
      hit++;
      this.damage(e, amount);
    }
    return hit;
  }

  /** true jika ada musuh aktif dalam radius (opsional: hanya yang belum stun). */
  anyWithin(x: number, z: number, radius: number, onlyUnstunned: boolean): boolean {
    return this.pool.some((e) => e.active && !(onlyUnstunned && e.stunned) && this.within(e, x, z, radius));
  }

  /** Stun semua musuh dalam radius. Mengembalikan jumlahnya. */
  stunWithin(x: number, z: number, radius: number, duration: number): number {
    let n = 0;
    for (const e of this.pool) {
      if (!e.active || !this.within(e, x, z, radius)) continue;
      e.stunTimer = Math.max(e.stunTimer, duration);
      e.velocity.setAll(0);
      n++;
    }
    return n;
  }

  /** Pancing: musuh dalam radius mengejar `player` selama `duration` detik. */
  lureWithin(x: number, z: number, radius: number, player: Player, duration: number): number {
    let n = 0;
    for (const e of this.pool) {
      if (!e.active || !this.within(e, x, z, radius)) continue;
      e.lureTarget = player;
      e.lureTimer = duration;
      n++;
    }
    return n;
  }

  /**
   * Musuh pertama yang dilewati ruas (x0,z0)-(x1,z1) dengan ketebalan `thickness`.
   * Dipakai proyektil supaya tidak "menembus" musuh saat bergerak cepat.
   */
  sweepHit(x0: number, z0: number, x1: number, z1: number, thickness: number): Enemy | null {
    const sx = x1 - x0;
    const sz = z1 - z0;
    const len2 = sx * sx + sz * sz;
    let best: Enemy | null = null;
    let bestT = Infinity;
    for (const e of this.pool) {
      if (!e.active) continue;
      // Titik terdekat pada ruas ke pusat musuh.
      let t = len2 > 0 ? ((e.position.x - x0) * sx + (e.position.z - z0) * sz) / len2 : 0;
      t = Math.max(0, Math.min(1, t));
      const dx = x0 + sx * t - e.position.x;
      const dz = z0 + sz * t - e.position.z;
      const r = e.radius + thickness;
      if (dx * dx + dz * dz <= r * r && t < bestT) {
        bestT = t;
        best = e;
      }
    }
    return best;
  }

  reset(): void {
    for (const e of this.pool) e.despawn();
    this._activeCount = 0;
    this.mesh.thinInstanceCount = 0;
    this.starMesh.thinInstanceCount = 0;
  }

  update(dt: number, markas: Markas, players: readonly Player[], structures: StructureManager): void {
    this.time += dt;
    if (this.fillToCapacity) this.fill(dt);

    const box = markas.box;
    for (const e of this.pool) {
      if (!e.active) continue;
      const d = e.data ?? this.data;
      e.attackTimer -= dt;
      e.hitTimer = Math.max(0, e.hitTimer - dt);
      e.biteTimer = Math.max(0, e.biteTimer - dt);
      e.lureTimer = Math.max(0, e.lureTimer - dt);
      if (e.lureTimer <= 0 || !e.lureTarget?.active || e.lureTarget.downed) e.lureTarget = null;

      // Stun: diam di tempat, tidak menyerang.
      if (e.stunTimer > 0) {
        e.stunTimer = Math.max(0, e.stunTimer - dt);
        e.velocity.setAll(0);
        e.attackTimer = Math.max(e.attackTimer, 0);
        continue;
      }

      // Tujuan: Penjaga yang memancing, atau pos ronda.
      const lure = e.lureTarget;
      const tx = lure ? lure.position.x : box.cx;
      const tz = lure ? lure.position.z : box.cz;
      let dx = tx - e.position.x;
      let dz = tz - e.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      dx /= dist;
      dz /= dist;

      // Sasaran serang. Prioritas: pemain yang menghalangi / pemancing > barikade > markas.
      let victim: Player | null = null;
      for (const p of players) {
        if (!p.active || p.downed) continue;
        const gap = Math.hypot(p.position.x - e.position.x, p.position.z - e.position.z) - p.radius - e.radius;
        if (gap <= d.attackRange) {
          victim = p;
          if (p === lure) break;
        }
      }
      let wall: Barricade | null = null;
      if (!victim) {
        const reaction = this.reactToBarricades(e, d, structures, dx, dz);
        if (reaction.wall) wall = reaction.wall;
        else if (reaction.steer) {
          dx = reaction.steer.x;
          dz = reaction.steer.z;
        }
      }
      const atMarkas = !lure && !victim && !wall && distanceToBox(e.position.x, e.position.z, box) - e.radius <= d.attackRange;
      const attacking = victim !== null || wall !== null || atMarkas;

      // Steering: seek (berhenti jika sedang menyerang) + separation antar musuh.
      if (attacking) {
        dx = 0;
        dz = 0;
      }
      let sx = 0;
      let sz = 0;
      for (const o of this.pool) {
        if (o === e || !o.active) continue;
        const ox = e.position.x - o.position.x;
        const oz = e.position.z - o.position.z;
        const d2 = ox * ox + oz * oz;
        const minD = e.radius + o.radius + 0.2;
        if (d2 > 1e-6 && d2 < minD * minD) {
          const dd = Math.sqrt(d2);
          sx += (ox / dd) * (1 - dd / minD);
          sz += (oz / dd) * (1 - dd / minD);
        }
      }
      const desiredX = (dx + sx * SEPARATION_WEIGHT) * d.speed;
      const desiredZ = (dz + sz * SEPARATION_WEIGHT) * d.speed;
      const k = Math.min(1, STEER_RATE * dt);
      e.velocity.x += (desiredX - e.velocity.x) * k;
      e.velocity.z += (desiredZ - e.velocity.z) * k;
      e.position.x += e.velocity.x * dt;
      e.position.z += e.velocity.z * dt;

      // Tabrakan: musuh tidak masuk ke pos ronda / barikade / tubuh pemain / keluar arena.
      pushOutOfBox(e, box);
      structures.pushOut(e);
      for (const p of players) if (p.active) pushOutOfCircle(e, p);
      e.position.x = Math.max(-ARENA.halfWidth, Math.min(ARENA.halfWidth, e.position.x));
      e.position.z = Math.max(-ARENA.halfDepth, Math.min(ARENA.halfDepth, e.position.z));

      // Hadap: ke sasaran saat menyerang, selain itu searah gerak.
      if (victim) e.yaw = Math.atan2(victim.position.x - e.position.x, victim.position.z - e.position.z);
      else if (wall) {
        const n = nearestOnObb(e.position.x, e.position.z, wall);
        e.yaw = Math.atan2(n.x - e.position.x, n.z - e.position.z);
      } else if (atMarkas) e.yaw = Math.atan2(box.cx - e.position.x, box.cz - e.position.z);
      else if (Math.abs(e.velocity.x) + Math.abs(e.velocity.z) > 0.1) e.yaw = Math.atan2(e.velocity.x, e.velocity.z);

      if (attacking && e.attackTimer <= 0) {
        e.attackTimer = d.attackInterval;
        e.biteTimer = BITE_ANIM_SEC;
        const fx = e.position.x + Math.sin(e.yaw) * e.radius;
        const fz = e.position.z + Math.cos(e.yaw) * e.radius;
        if (victim) {
          const result = victim.takeDamage(d.playerDamage, e.position.x, e.position.z);
          if (result !== "diabaikan") this.events.onAttack(fx, fz, "pemain", result);
        } else if (wall) {
          structures.damageBarricade(wall, d.barricadeDamage);
          this.events.onAttack(fx, fz, "barikade");
        } else {
          markas.damage(d.baseDamage);
          this.events.onAttack(fx, fz, "markas");
        }
      }
    }

    this.writeInstances();
  }

  /**
   * Barikade di depan musuh: jika musuh dekat ujung barikade ia memutar (arah menyusuri barikade),
   * jika dekat tengah ia menggigit barikade sampai hancur.
   */
  private reactToBarricades(
    e: Enemy, d: EnemyData, structures: StructureManager, dirX: number, dirZ: number,
  ): { wall?: Barricade; steer?: { x: number; z: number } } {
    for (const b of structures.barricades) {
      if (!b.active) continue;
      const n = nearestOnObb(e.position.x, e.position.z, b);
      const vx = n.x - e.position.x;
      const vz = n.z - e.position.z;
      const gap = Math.hypot(vx, vz) - e.radius;
      if (gap > d.attackRange + BARRICADE_LOOKAHEAD) continue;
      const len = Math.hypot(vx, vz) || 1;
      if ((vx * dirX + vz * dirZ) / len < BLOCK_DOT) continue; // barikade tidak di jalur
      const { u } = toObbLocal(e.position.x, e.position.z, b);
      if (d.barricadeBypass > 0 && Math.abs(u) >= b.halfX * d.barricadeBypass) {
        // Memutar lewat ujung terdekat.
        const s = Math.sign(u) || 1;
        return { steer: { x: b.cos * s, z: b.sin * s } };
      }
      if (gap <= d.attackRange) return { wall: b };
    }
    return {};
  }

  private within(e: Enemy, x: number, z: number, radius: number): boolean {
    const r = radius + e.radius;
    const dx = e.position.x - x;
    const dz = e.position.z - z;
    return dx * dx + dz * dz <= r * r;
  }

  /** Benchmark: jaga jumlah musuh aktif tetap di batas maksimal. */
  private fill(dt: number): void {
    this.fillTimer -= dt;
    while (this.fillTimer <= 0 && this._activeCount < this.capacity) {
      this.fillTimer += FILL_SPAWN_INTERVAL;
      const [x, z] = this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
      this.spawnAt(x + (Math.random() - 0.5) * 2, z + (Math.random() - 0.5) * 2);
    }
    this.fillTimer = Math.max(this.fillTimer, 0);
  }

  /** Tulis matriks musuh aktif (dan bintang stun) secara rapat ke buffer thin instance. */
  private writeInstances(): void {
    let n = 0;
    let stars = 0;
    const headY = this.data.size * 1.1;
    for (const e of this.pool) {
      if (!e.active) continue;
      const moving = Math.min(1, Math.hypot(e.velocity.x, e.velocity.z) / this.data.speed);
      const bob = Math.abs(Math.sin(this.time * 14 + e.bobPhase)) * 0.08 * moving;
      // Tersentak (melebar) saat terkena, maju sedikit saat menggigit, bergoyang pusing saat stun.
      const hit = e.hitTimer / HIT_ANIM_SEC;
      const lunge = Math.sin((e.biteTimer / BITE_ANIM_SEC) * Math.PI) * 0.25;
      const dizzy = e.stunned ? Math.sin(this.time * 10 + e.bobPhase) * 0.35 : 0;
      this.tmpScale.set(1 + hit * 0.35, (1 - hit * 0.25) * (e.stunned ? 0.85 : 1), 1 + hit * 0.1);
      this.tmpPos.set(e.position.x + Math.sin(e.yaw) * lunge, bob, e.position.z + Math.cos(e.yaw) * lunge);
      Quaternion.RotationYawPitchRollToRef(e.yaw + dizzy, 0, dizzy * 0.5, this.tmpQuat);
      Matrix.ComposeToRef(this.tmpScale, this.tmpQuat, this.tmpPos, this.tmpMatrix);
      this.tmpMatrix.copyToArray(this.matrixBuffer, n * 16);
      n++;

      if (e.stunned) {
        for (let s = 0; s < STARS_PER_ENEMY; s++) {
          const a = this.time * STAR_ORBIT_SPEED + e.bobPhase + (s * Math.PI * 2) / STARS_PER_ENEMY;
          this.tmpPos.set(e.position.x + Math.cos(a) * 0.35, headY, e.position.z + Math.sin(a) * 0.35);
          Matrix.ComposeToRef(this.unitScale, this.identityQuat, this.tmpPos, this.tmpMatrix);
          this.tmpMatrix.copyToArray(this.starBuffer, stars * 16);
          stars++;
        }
      }
    }
    this.mesh.thinInstanceCount = n;
    this.mesh.thinInstanceBufferUpdated("matrix");
    this.starMesh.thinInstanceCount = stars;
    if (stars > 0) this.starMesh.thinInstanceBufferUpdated("matrix");
  }
}

/**
 * Model Tikus Raksasa low-poly (< 300 segitiga): badan, moncong, telinga, mata merah,
 * ekor, dan 4 kaki. Digabung jadi satu mesh berwarna per-vertex (1 material, 1 draw call).
 */
function buildRatMesh(scene: Scene, data: EnemyData): Mesh {
  const fur = Color4.FromHexString(data.color + "ff");
  const dark = new Color4(fur.r * 0.6, fur.g * 0.6, fur.b * 0.6, 1);
  const pink = new Color4(0.9, 0.55, 0.6, 1);
  const eye = new Color4(1, 0.1, 0.05, 1);
  const parts: Mesh[] = [];
  const part = (m: Mesh, color: Color4) => {
    const count = m.getTotalVertices();
    const colors = new Float32Array(count * 4);
    for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b, color.a], i * 4);
    m.setVerticesData(VertexBuffer.ColorKind, colors);
    parts.push(m);
    return m;
  };

  const body = part(
    MeshBuilder.CreateIcoSphere("ratBody", { radiusX: 0.32, radiusY: 0.25, radiusZ: 0.46, subdivisions: 2, flat: true }, scene),
    fur,
  );
  body.position.set(0, 0.3, 0);

  const snout = part(
    MeshBuilder.CreateCylinder("ratSnout", { diameterTop: 0, diameterBottom: 0.36, height: 0.42, tessellation: 6 }, scene),
    fur,
  );
  snout.rotation.x = Math.PI / 2;
  snout.position.set(0, 0.34, 0.56);

  const nose = part(MeshBuilder.CreateBox("ratNose", { size: 0.08 }, scene), pink);
  nose.position.set(0, 0.34, 0.77);

  for (const side of [-1, 1]) {
    const ear = part(MeshBuilder.CreateBox("ratEar", { width: 0.18, height: 0.18, depth: 0.04 }, scene), pink);
    ear.position.set(side * 0.14, 0.55, 0.36);
    ear.rotation.z = side * 0.3;
    const eyeMesh = part(MeshBuilder.CreateBox("ratEye", { size: 0.07 }, scene), eye);
    eyeMesh.position.set(side * 0.1, 0.44, 0.6);
  }

  const tail = part(
    MeshBuilder.CreateCylinder("ratTail", { diameterTop: 0.02, diameterBottom: 0.07, height: 0.7, tessellation: 4 }, scene),
    pink,
  );
  tail.rotation.x = -Math.PI / 2 + 0.35;
  tail.position.set(0, 0.26, -0.75);

  for (const [x, z] of [[-0.17, 0.22], [0.17, 0.22], [-0.17, -0.22], [0.17, -0.22]]) {
    const leg = part(MeshBuilder.CreateBox("ratLeg", { width: 0.1, height: 0.18, depth: 0.12 }, scene), dark);
    leg.position.set(x, 0.09, z);
  }

  const merged = Mesh.MergeMeshes(parts, true, true);
  if (!merged) throw new Error("Gagal membuat model tikus");
  merged.name = `enemy_${data.id}`;
  merged.hasVertexAlpha = false; // warna vertex opak; jangan masuk antrean transparan
  const k = data.size / MODEL_REF_SIZE;
  merged.bakeTransformIntoVertices(Matrix.Scaling(k, k, k));

  const mat = new StandardMaterial(`enemyMat_${data.id}`, scene);
  mat.diffuseColor = Color3.White(); // warna dari vertex color
  mat.emissiveColor = new Color3(0.3, 0.3, 0.3); // tetap terbaca di malam hari
  mat.specularColor = Color3.Black();
  merged.material = mat;
  return merged;
}
