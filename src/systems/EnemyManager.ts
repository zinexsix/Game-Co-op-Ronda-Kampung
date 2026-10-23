import { Color3, Matrix, MeshBuilder, Quaternion, StandardMaterial, Vector3, type Mesh, type Scene } from "@babylonjs/core";
import { Enemy } from "../entities/Enemy";
import { buildEnemyModel, type EnemyModel } from "../entities/EnemyModels";
import type { Markas } from "../entities/Markas";
import type { DamageResult, Player } from "../entities/Player";
import { ENEMY_AI as AI, type EnemyData, type RoleId } from "../data/types";
import { ARENA } from "../config/arena";
import type { CoinManager } from "./CoinManager";
import { distanceToBox, nearestOnObb, pushOutOfBox, pushOutOfCircle, toObbLocal } from "./Collision";
import type { Barricade, StructureManager } from "./StructureManager";

const HIT_ANIM_SEC = 0.15;
const BITE_ANIM_SEC = 0.2;
/** Isi pool otomatis (benchmark): jeda antar munculnya musuh. */
const FILL_SPAWN_INTERVAL = 0.08;
const STARS_PER_ENEMY = 2;
const STAR_ORBIT_SPEED = 6;

export type AttackTarget = "pemain" | "markas" | "barikade";

export interface AttackInfo {
  amount: number;
  victim?: Player;
  result?: DamageResult;
}

export interface EnemyEvents {
  /** Musuh kalah (HP 0). `source` = peran yang memberi pukulan terakhir. */
  onKilled: (e: Enemy, source?: RoleId) => void;
  /** Damage yang benar-benar masuk ke musuh (untuk kontribusi). */
  onDamaged: (amount: number, source?: RoleId) => void;
  /** Musuh menyerang (untuk efek visual & kontribusi blokir). */
  onAttack: (x: number, z: number, target: AttackTarget, info: AttackInfo) => void;
  /** Pencuri mengambil koin. */
  onSteal: (x: number, z: number) => void;
  /** Pencuri lolos di tepi arena membawa koin. */
  onEscaped: (e: Enemy, coins: number) => void;
  /** Serangan mengenai boss yang sedang kebal (tidak terkena stun). */
  onImmune: (x: number, z: number) => void;
  /** Boss baru saja terkena stun jebakan. */
  onBossStunned: (e: Enemy) => void;
  /** Boss masuk fase baru (2 = memanggil tikus, 3 = mengamuk). */
  onBossPhase: (e: Enemy, phase: number) => void;
  /** Boss menghantam tanah (efek visual). */
  onSlam: (x: number, z: number, radius: number) => void;
}

interface RenderBucket {
  data: EnemyData;
  model: EnemyModel;
  buffer: Float32Array;
  count: number;
}

/**
 * Pool musuh berkapasitas tetap (batas musuh aktif bersama untuk semua jenis).
 * Tiap jenis digambar dengan thin instances (1 draw call per jenis).
 * Perilaku menurut `target` di enemies.json:
 * - markas (Tikus): ke pos ronda dan menggigitnya; barikade diputari (dekat ujung) atau digigit (dekat tengah).
 * - pemain (Hantu): mengejar pemain terdekat, menembus barikade.
 * - koin (Pencuri): mengincar koin di tanah, setelah membawa cukup koin kabur ke tepi arena.
 * Semua jenis: terhenti oleh jebakan (stun) dan bisa dipancing Penjaga.
 */
export class EnemyManager {
  readonly pool: Enemy[];
  private readonly buckets = new Map<string, RenderBucket>();
  private readonly starMesh: Mesh;
  private readonly starBuffer: Float32Array;
  private readonly tmpMatrix = new Matrix();
  private readonly tmpQuat = new Quaternion();
  private readonly tmpScale = new Vector3(1, 1, 1);
  private readonly tmpPos = new Vector3();
  private readonly unitScale = new Vector3(1, 1, 1);
  private readonly identityQuat = Quaternion.Identity();
  private time = 0;
  private spawnPoints: [number, number][] = [[0, ARENA.halfDepth]];
  /** Benchmark: jenis musuh yang dipakai mengisi pool. null = tidak mengisi otomatis. */
  private fillTypes: string[] | null = null;
  private fillTimer = 0;
  private _activeCount = 0;
  /** Pengali damage musuh untuk level aktif (levels.json enemyDamageMult; Level 1 lebih ringan). */
  private damageMult = 1;

  constructor(
    scene: Scene,
    readonly capacity: number,
    types: readonly EnemyData[],
    private readonly events: EnemyEvents,
  ) {
    this.pool = Array.from({ length: capacity }, () => new Enemy());

    for (const data of types) {
      const model = buildEnemyModel(scene, data);
      const buffer = new Float32Array(capacity * 16);
      model.mesh.thinInstanceSetBuffer("matrix", buffer, 16, false);
      model.mesh.thinInstanceCount = 0;
      // Posisi berubah tiap frame; lewati perhitungan bounding agar murah.
      model.mesh.alwaysSelectAsActiveMesh = true;
      this.buckets.set(data.id, { data, model, buffer, count: 0 });
    }

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

  /** Mesh semua jenis musuh (untuk bayangan). */
  get renderMeshes(): Mesh[] {
    return [...this.buckets.values()].map((b) => b.model.mesh);
  }

  get activeCount(): number {
    return this._activeCount;
  }

  /** Boss yang sedang aktif (paling banyak satu), atau null. */
  get boss(): Enemy | null {
    return this.pool.find((e) => e.active && e.data?.boss) ?? null;
  }

  /** Jumlah musuh aktif per jenis. */
  countOf(typeId: string): number {
    return this.buckets.get(typeId)?.count ?? 0;
  }

  /** Segitiga model per jenis (cek anggaran poligon). */
  get modelTriangles(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [id, b] of this.buckets) out[id] = b.model.mesh.getTotalIndices() / 3;
    return out;
  }

  setDamageMult(mult: number): void {
    this.damageMult = mult;
  }

  /** Titik muncul arena aktif (dipakai mode uji dan benchmark). */
  setSpawnPoints(points: [number, number][]): void {
    if (points.length > 0) this.spawnPoints = points;
  }

  /** Benchmark: jaga musuh aktif selalu penuh dengan jenis-jenis ini (null = mati). */
  setFill(types: string[] | null): void {
    this.fillTypes = types;
  }

  /** Munculkan musuh jenis `typeId` di (x, z); null jika batas musuh aktif tercapai. */
  spawnAt(typeId: string, x: number, z: number, hpMult = 1): Enemy | null {
    const bucket = this.buckets.get(typeId);
    if (!bucket) throw new Error(`Jenis musuh tidak punya model: ${typeId}`);
    const e = this.pool.find((p) => !p.active);
    if (!e) return null;
    e.spawn(bucket.data, x, z, hpMult);
    this._activeCount++;
    return e;
  }

  /** Munculkan sekelompok musuh di titik muncul acak (mode uji). */
  spawnGroup(typeId: string, count: number): number {
    const [x, z] = this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
    let n = 0;
    for (let i = 0; i < count; i++) {
      if (this.spawnAt(typeId, x + (Math.random() - 0.5) * AI.spawnJitter, z + (Math.random() - 0.5) * AI.spawnJitter)) n++;
    }
    return n;
  }

  /** Beri damage; mengembalikan true jika musuh kalah karenanya. `source` = peran penyerang. */
  damage(e: Enemy, amount: number, source?: RoleId): boolean {
    if (!e.active) return false;
    // Boss hanya bisa dilukai saat terkena stun jebakan: butuh kerja sama Pembangun + penyerang.
    if (e.data?.boss?.onlyDamageWhenStunned && !e.stunned) {
      this.events.onImmune(e.position.x, e.position.z);
      return false;
    }
    const dealt = Math.min(amount, e.hp);
    e.hp -= amount;
    e.hitTimer = HIT_ANIM_SEC;
    this.events.onDamaged(dealt, source);
    if (e.hp > 0) return false;
    this.remove(e);
    this.events.onKilled(e, source);
    return true;
  }

  /** Damage ke semua musuh dalam radius. Mengembalikan jumlah musuh yang terkena. */
  damageInRadius(x: number, z: number, radius: number, amount: number, source?: RoleId): number {
    let hit = 0;
    for (const e of this.pool) {
      if (!e.active || !this.within(e, x, z, radius)) continue;
      hit++;
      this.damage(e, amount, source);
    }
    return hit;
  }

  /** true jika ada musuh aktif dalam radius (opsional: hanya yang belum stun). */
  anyWithin(x: number, z: number, radius: number, onlyUnstunned: boolean): boolean {
    return this.pool.some((e) => e.active && !(onlyUnstunned && e.stunned) && this.within(e, x, z, radius));
  }

  /** Jumlah musuh aktif dalam radius. */
  countWithin(x: number, z: number, radius: number): number {
    let n = 0;
    for (const e of this.pool) if (e.active && this.within(e, x, z, radius)) n++;
    return n;
  }

  /** Stun semua musuh dalam radius. Mengembalikan jumlahnya. */
  stunWithin(x: number, z: number, radius: number, duration: number): number {
    let n = 0;
    for (const e of this.pool) {
      if (!e.active || e.stunImmuneTimer > 0 || !this.within(e, x, z, radius)) continue;
      if (e.data?.boss && !e.stunned) this.events.onBossStunned(e);
      e.stunTimer = Math.max(e.stunTimer, duration);
      e.trappedAge = 0;
      e.velocity.setAll(0);
      n++;
    }
    return n;
  }

  /** Pancing: musuh dalam radius mengejar `player` (Pencuri lebih lama, lihat lureMultiplier). */
  lureWithin(x: number, z: number, radius: number, player: Player, duration: number): number {
    let n = 0;
    for (const e of this.pool) {
      if (!e.active || !this.within(e, x, z, radius)) continue;
      e.lureTarget = player;
      e.lureTimer = duration * (e.data?.lureMultiplier ?? 1);
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
    for (const b of this.buckets.values()) {
      b.count = 0;
      b.model.mesh.thinInstanceCount = 0;
    }
    this.starMesh.thinInstanceCount = 0;
  }

  update(dt: number, markas: Markas, players: readonly Player[], structures: StructureManager, coins: CoinManager): void {
    this.time += dt;
    if (this.fillTypes) this.fill(dt, this.fillTypes);

    const box = markas.box;
    for (const e of this.pool) {
      if (!e.active || !e.data) continue;
      const d = e.data;
      e.attackTimer -= dt;
      e.hitTimer = Math.max(0, e.hitTimer - dt);
      e.biteTimer = Math.max(0, e.biteTimer - dt);
      e.lureTimer = Math.max(0, e.lureTimer - dt);
      e.trappedAge += dt;
      if (e.lureTimer <= 0 || !e.lureTarget?.active || e.lureTarget.downed) e.lureTarget = null;

      e.stunImmuneTimer = Math.max(0, e.stunImmuneTimer - dt);
      const boss = d.boss;
      if (boss) this.updateBossPhase(e, boss);

      // Stun: diam di tempat, tidak menyerang. Boss lalu kebal stun sebentar agar tidak terkunci terus.
      if (e.stunTimer > 0) {
        e.stunTimer = Math.max(0, e.stunTimer - dt);
        e.velocity.setAll(0);
        e.attackTimer = Math.max(e.attackTimer, 0);
        if (e.stunTimer <= 0 && boss) e.stunImmuneTimer = boss.stunCooldownSec;
        continue;
      }
      if (boss && e.phase === 2) this.summon(e, boss, dt);
      const enraged = boss !== undefined && e.phase === 3;

      // --- Tujuan gerak ---
      const lure = e.lureTarget;
      let chase: Player | null = lure;
      let tx = box.cx;
      let tz = box.cz;
      let speed = enraged ? d.speed * boss.enrageSpeedMult : d.speed;
      if (lure) {
        tx = lure.position.x;
        tz = lure.position.z;
      } else if (d.target === "pemain") {
        chase = nearestPlayer(e, players);
        if (chase) {
          tx = chase.position.x;
          tz = chase.position.z;
        }
      } else if (d.target === "koin") {
        const goal = this.thiefGoal(e, d, coins);
        if (!e.active) continue; // lolos di tepi arena
        tx = goal.x;
        tz = goal.z;
        if (e.fleeing) speed *= d.fleeSpeedMult ?? 1;
      }
      let dx = tx - e.position.x;
      let dz = tz - e.position.z;
      const dist = Math.hypot(dx, dz) || 1;
      dx /= dist;
      dz /= dist;

      // --- Sasaran serang. Prioritas: pemain di jangkauan (yang dikejar lebih dulu) > barikade > markas ---
      let victim: Player | null = null;
      if (d.playerDamage > 0) {
        for (const p of players) {
          if (!p.active || p.downed) continue;
          const gap = Math.hypot(p.position.x - e.position.x, p.position.z - e.position.z) - p.radius - e.radius;
          if (gap <= d.attackRange) {
            victim = p;
            if (p === chase) break;
          }
        }
      }
      let wall: Barricade | null = null;
      if (!victim && !d.passesBarricades) {
        const reaction = this.reactToBarricades(e, d, structures, dx, dz);
        if (reaction.wall) wall = reaction.wall;
        else if (reaction.steer) {
          dx = reaction.steer.x;
          dz = reaction.steer.z;
        }
      }
      const atMarkas =
        !chase && !victim && !wall && d.target === "markas" && d.baseDamage > 0 &&
        distanceToBox(e.position.x, e.position.z, box) - e.radius <= d.attackRange;
      const attacking = victim !== null || wall !== null || atMarkas;

      // --- Steering: seek (berhenti jika sedang menyerang) + separation antar musuh ---
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
        const minD = e.radius + o.radius + AI.separationPadding;
        if (d2 > 1e-6 && d2 < minD * minD) {
          const dd = Math.sqrt(d2);
          sx += (ox / dd) * (1 - dd / minD);
          sz += (oz / dd) * (1 - dd / minD);
        }
      }
      const desiredX = (dx + sx * AI.separationWeight) * speed;
      const desiredZ = (dz + sz * AI.separationWeight) * speed;
      const k = Math.min(1, AI.steerRate * dt);
      e.velocity.x += (desiredX - e.velocity.x) * k;
      e.velocity.z += (desiredZ - e.velocity.z) * k;
      e.position.x += e.velocity.x * dt;
      e.position.z += e.velocity.z * dt;

      // Tabrakan: pos ronda, barikade (kecuali hantu), tubuh pemain, batas arena.
      pushOutOfBox(e, box);
      if (!d.passesBarricades) structures.pushOut(e);
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
        e.attackTimer = enraged ? d.attackInterval * boss.enrageAttackMult : d.attackInterval;
        e.biteTimer = BITE_ANIM_SEC;
        const fx = e.position.x + Math.sin(e.yaw) * e.radius;
        const fz = e.position.z + Math.cos(e.yaw) * e.radius;
        if (boss) {
          this.slam(e, d, boss, markas, players, structures, wall);
        } else if (victim) {
          const result = victim.takeDamage(d.playerDamage * this.damageMult, e.position.x, e.position.z);
          if (result !== "diabaikan") this.events.onAttack(fx, fz, "pemain", { amount: d.playerDamage * this.damageMult, victim, result });
        } else if (wall) {
          structures.damageBarricade(wall, d.barricadeDamage);
          this.events.onAttack(fx, fz, "barikade", { amount: d.barricadeDamage });
        } else {
          markas.damage(d.baseDamage * this.damageMult);
          this.events.onAttack(fx, fz, "markas", { amount: d.baseDamage * this.damageMult });
        }
      }
    }

    this.writeInstances();
  }

  /** Fase boss menurut sisa HP; beri tahu saat berganti fase. */
  private updateBossPhase(e: Enemy, boss: NonNullable<EnemyData["boss"]>): void {
    const ratio = e.hp / e.maxHp;
    const phase = ratio > boss.phase2At ? 1 : ratio > boss.phase3At ? 2 : 3;
    if (phase !== e.phase) {
      e.phase = phase;
      e.summonTimer = 0; // fase 2 langsung memanggil anak buah pertama
      this.events.onBossPhase(e, phase);
    }
  }

  /** Fase 2: panggil beberapa Tikus Raksasa di sekitar boss secara berkala. */
  private summon(e: Enemy, boss: NonNullable<EnemyData["boss"]>, dt: number): void {
    e.summonTimer -= dt;
    if (e.summonTimer > 0) return;
    e.summonTimer = boss.summonIntervalSec;
    for (let i = 0; i < boss.summonCount; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = e.radius + 1;
      const x = Math.max(-ARENA.halfWidth, Math.min(ARENA.halfWidth, e.position.x + Math.cos(a) * r));
      const z = Math.max(-ARENA.halfDepth, Math.min(ARENA.halfDepth, e.position.z + Math.sin(a) * r));
      this.spawnAt(boss.summonEnemy, x, z);
    }
  }

  /** Hantaman boss: semua pemain dalam slamRadius terkena, juga markas / barikade yang sedang diserang. */
  private slam(
    e: Enemy, d: EnemyData, boss: NonNullable<EnemyData["boss"]>, markas: Markas,
    players: readonly Player[], structures: StructureManager, wall: Barricade | null,
  ): void {
    const { x, z } = e.position;
    this.events.onSlam(x, z, boss.slamRadius);
    for (const p of players) {
      if (!p.active || p.downed) continue;
      const gap = Math.hypot(p.position.x - x, p.position.z - z) - p.radius;
      if (gap > boss.slamRadius) continue;
      const result = p.takeDamage(d.playerDamage * this.damageMult, x, z);
      if (result !== "diabaikan") this.events.onAttack(p.position.x, p.position.z, "pemain", { amount: d.playerDamage * this.damageMult, victim: p, result });
    }
    if (wall) {
      structures.damageBarricade(wall, d.barricadeDamage);
      this.events.onAttack(x, z, "barikade", { amount: d.barricadeDamage });
    }
    if (distanceToBox(x, z, markas.box) <= boss.slamRadius) {
      markas.damage(d.baseDamage * this.damageMult);
      this.events.onAttack(x, z, "markas", { amount: d.baseDamage * this.damageMult });
    }
  }

  /**
   * Pencuri: incar koin terdekat dan ambil saat menyentuhnya; setelah membawa cukup koin
   * (atau koin habis padahal sudah membawa) kabur ke tepi terdekat. Lolos = koin hilang.
   */
  private thiefGoal(e: Enemy, d: EnemyData, coins: CoinManager): { x: number; z: number } {
    const carryMax = d.carryMax ?? 1;
    if (!e.fleeing) {
      const coin = coins.nearest(e.position.x, e.position.z);
      if (coin) {
        const reach = e.radius + coins.pickupRadius;
        if (Math.hypot(coin.x - e.position.x, coin.z - e.position.z) <= reach && coins.take(coin.index)) {
          e.carried++;
          this.events.onSteal(coin.x, coin.z);
          if (e.carried >= carryMax) e.fleeing = true;
        }
        if (!e.fleeing) return coin;
      } else if (e.carried > 0) {
        e.fleeing = true;
      } else {
        // Belum ada koin: berkeliaran di sekitar pos ronda menunggu koin jatuh.
        const a = Math.atan2(e.position.z, e.position.x) + AI.thiefLoiterStepRad;
        return { x: Math.cos(a) * AI.thiefLoiterRadius, z: Math.sin(a) * AI.thiefLoiterRadius };
      }
    }
    // Kabur ke tepi arena terdekat.
    const hw = ARENA.halfWidth;
    const hd = ARENA.halfDepth;
    const p = e.position;
    const toEdge = [hw - p.x, hw + p.x, hd - p.z, hd + p.z];
    const side = toEdge.indexOf(Math.min(...toEdge));
    if (toEdge[side] <= AI.escapeMargin) {
      const carried = e.carried;
      this.remove(e);
      this.events.onEscaped(e, carried);
      return { x: p.x, z: p.z };
    }
    if (side === 0) return { x: hw + 1, z: p.z };
    if (side === 1) return { x: -hw - 1, z: p.z };
    if (side === 2) return { x: p.x, z: hd + 1 };
    return { x: p.x, z: -hd - 1 };
  }

  /**
   * Barikade di depan musuh: jika musuh dekat ujung barikade ia memutar (arah menyusuri barikade),
   * jika dekat tengah ia menggigit barikade sampai hancur. Musuh tanpa damage barikade selalu memutar.
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
      if (gap > d.attackRange + AI.barricadeLookahead) continue;
      const len = Math.hypot(vx, vz) || 1;
      if ((vx * dirX + vz * dirZ) / len < AI.blockDot) continue; // barikade tidak di jalur
      const { u } = toObbLocal(e.position.x, e.position.z, b);
      const canBite = d.barricadeDamage > 0;
      if (!canBite || (d.barricadeBypass > 0 && Math.abs(u) >= b.halfX * d.barricadeBypass)) {
        // Memutar lewat ujung terdekat.
        const s = Math.sign(u) || 1;
        return { steer: { x: b.cos * s, z: b.sin * s } };
      }
      if (gap <= d.attackRange) return { wall: b };
    }
    return {};
  }

  private remove(e: Enemy): void {
    e.despawn();
    this._activeCount--;
  }

  private within(e: Enemy, x: number, z: number, radius: number): boolean {
    const r = radius + e.radius;
    const dx = e.position.x - x;
    const dz = e.position.z - z;
    return dx * dx + dz * dz <= r * r;
  }

  /** Benchmark: jaga jumlah musuh aktif tetap di batas maksimal (jenis bergiliran). */
  private fill(dt: number, types: string[]): void {
    this.fillTimer -= dt;
    while (this.fillTimer <= 0 && this._activeCount < this.capacity) {
      this.fillTimer += FILL_SPAWN_INTERVAL;
      const [x, z] = this.spawnPoints[Math.floor(Math.random() * this.spawnPoints.length)];
      const type = types[this._activeCount % types.length];
      this.spawnAt(type, x + (Math.random() - 0.5) * 2, z + (Math.random() - 0.5) * 2);
    }
    this.fillTimer = Math.max(this.fillTimer, 0);
  }

  /** Tulis matriks musuh aktif (per jenis) dan bintang stun secara rapat ke buffer thin instance. */
  private writeInstances(): void {
    for (const b of this.buckets.values()) b.count = 0;
    let stars = 0;
    for (const e of this.pool) {
      if (!e.active || !e.data) continue;
      const b = this.buckets.get(e.data.id);
      if (!b) continue;
      const m = b.model;
      const moving = Math.min(1, Math.hypot(e.velocity.x, e.velocity.z) / e.data.speed);
      const bob =
        m.bob === "melayang"
          ? Math.sin(this.time * 3 + e.bobPhase) * 0.12
          : Math.abs(Math.sin(this.time * 14 + e.bobPhase)) * 0.08 * moving;
      // Tersentak (melebar) saat terkena, maju sedikit saat menyerang, bergoyang pusing saat stun.
      const hit = e.hitTimer / HIT_ANIM_SEC;
      const lunge = Math.sin((e.biteTimer / BITE_ANIM_SEC) * Math.PI) * 0.25;
      const dizzy = e.stunned ? Math.sin(this.time * 10 + e.bobPhase) * 0.35 : 0;
      this.tmpScale.set(1 + hit * 0.35, (1 - hit * 0.25) * (e.stunned ? 0.85 : 1), 1 + hit * 0.1);
      this.tmpPos.set(e.position.x + Math.sin(e.yaw) * lunge, m.baseY + bob, e.position.z + Math.cos(e.yaw) * lunge);
      Quaternion.RotationYawPitchRollToRef(e.yaw + dizzy, 0, dizzy * 0.5, this.tmpQuat);
      Matrix.ComposeToRef(this.tmpScale, this.tmpQuat, this.tmpPos, this.tmpMatrix);
      this.tmpMatrix.copyToArray(b.buffer, b.count * 16);
      b.count++;

      if (e.stunned) {
        for (let s = 0; s < STARS_PER_ENEMY; s++) {
          const a = this.time * STAR_ORBIT_SPEED + e.bobPhase + (s * Math.PI * 2) / STARS_PER_ENEMY;
          this.tmpPos.set(e.position.x + Math.cos(a) * 0.35, m.headY + m.baseY, e.position.z + Math.sin(a) * 0.35);
          Matrix.ComposeToRef(this.unitScale, this.identityQuat, this.tmpPos, this.tmpMatrix);
          this.tmpMatrix.copyToArray(this.starBuffer, stars * 16);
          stars++;
        }
      }
    }
    for (const b of this.buckets.values()) {
      const mesh = b.model.mesh;
      mesh.thinInstanceCount = b.count;
      if (b.count > 0) mesh.thinInstanceBufferUpdated("matrix");
    }
    this.starMesh.thinInstanceCount = stars;
    if (stars > 0) this.starMesh.thinInstanceBufferUpdated("matrix");
  }
}

/** Pemain aktif (tidak jatuh) terdekat. */
function nearestPlayer(e: Enemy, players: readonly Player[]): Player | null {
  let best: Player | null = null;
  let bestD = Infinity;
  for (const p of players) {
    if (!p.active || p.downed) continue;
    const d = Math.hypot(p.position.x - e.position.x, p.position.z - e.position.z);
    if (d < bestD) {
      bestD = d;
      best = p;
    }
  }
  return best;
}
