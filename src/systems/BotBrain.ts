import { Scalar } from "@babylonjs/core";
import { getRole, type BotRules, type RoleId } from "../data/types";
import type { Enemy } from "../entities/Enemy";
import type { Markas } from "../entities/Markas";
import type { Player } from "../entities/Player";
import type { RoleAbility } from "../roles/RoleAbility";
import type { CoinManager } from "./CoinManager";
import { distanceToBox } from "./Collision";
import type { EnemyManager } from "./EnemyManager";
import type { PlayerInputState, PlayerPresses } from "./InputManager";
import type { StructureManager } from "./StructureManager";

/** Keadaan permainan yang dibaca bot. */
export interface BotWorld {
  players: readonly Player[];
  enemies: EnemyManager;
  coins: CoinManager;
  markas: Markas;
  structures: StructureManager;
  coinCount: number;
  /** Level ini punya boss yang belum dikalahkan (bot Pembangun menyimpan koin untuk jebakan boss). */
  bossPending: boolean;
  abilityOf(p: Player): RoleAbility;
}

/** Posisi jaga tiap peran di sekitar pos ronda (sudut, radian): di pojok, tidak menutup jalan. */
const HOME_ANGLE: Record<RoleId, number> = {
  penjaga: Math.PI * 0.25,
  pembangun: Math.PI * 0.75,
  penyerang: Math.PI * 1.25,
  penyembuh: Math.PI * 1.75,
};
const ARRIVE_DIST = 0.4;
/** Jebakan untuk boss dipasang sejauh ini di depan boss (di jalurnya menuju pos ronda). */
const BOSS_TRAP_LEAD = 3;
/** Kelonggaran agar jebakan yang dipasang di depan boss pasti mengenainya. */
const BOSS_REACH_SLACK = 0.4;
const REVIVE_STAND_DIST = 1.0;
const SAFE_TO_REVIVE_RADIUS = 4;

/**
 * Bot sederhana untuk peran yang tidak dipilih manusia. Menghasilkan input seperti pemain
 * (gerak + tombol skill), sehingga semua aturan skill, cooldown, dan koin tetap sama.
 * Bot berjaga di sekitar pos ronda dan memakai skill saat pemicunya terpenuhi:
 * - Penjaga: Pancing saat musuh dekat pos, Perisai saat musuh menempel.
 * - Pembangun: Jebakan di jalur musuh jika koin cukup; memungut koin saat senggang.
 * - Penyerang: menembak musuh terdekat; Serangan Area saat musuh berkerumun.
 * - Penyembuh: Heal saat HP pos ronda di bawah ambang (atau teman kritis); Buff saat musuh banyak.
 * Semua bot menghidupkan teman yang jatuh jika aman, menjauh dari hantaman boss yang tidak terjebak,
 * dan (kecuali Penjaga) memungut koin di sekitar pos saat senggang.
 */
export class BotBrain {
  readonly input: PlayerInputState = { moveX: 0, moveZ: 0, skill1: false, skill2: false, connected: true };
  readonly presses: PlayerPresses = { skill1: false, skill2: false, left: false, right: false };
  private readonly homeX: number;
  private readonly homeZ: number;
  private readonly areaRadius = getRole("penyerang").skills[1].radius ?? 0;
  private readonly lureRadius = getRole("penjaga").skills[1].radius ?? 0;
  private readonly trapCost = getRole("pembangun").skills[1].coinCost ?? 0;
  private readonly trapPlaceDist = getRole("pembangun").skills[1].placeDistance ?? 0;
  private readonly trapTrigger = getRole("pembangun").skills[1].triggerRadius ?? 0;
  private readonly healRadius = getRole("penyembuh").skills[0].radius ?? 0;
  private readonly shotRange = getRole("penyerang").skills[0].range ?? 0;

  constructor(
    private readonly player: Player,
    private readonly rules: BotRules,
  ) {
    const a = HOME_ANGLE[player.role.id];
    this.homeX = Math.cos(a) * rules.homeRadius;
    this.homeZ = Math.sin(a) * rules.homeRadius;
  }

  /** Tentukan input bot untuk frame ini. */
  think(w: BotWorld): void {
    const prev1 = this.input.skill1;
    const prev2 = this.input.skill2;
    this.input.moveX = 0;
    this.input.moveZ = 0;
    this.input.skill1 = false;
    this.input.skill2 = false;

    const p = this.player;
    if (!p.downed && !this.avoidBoss(w) && !this.tryRevive(w)) {
      switch (p.role.id) {
        case "penjaga":
          this.thinkPenjaga(w);
          break;
        case "pembangun":
          this.thinkPembangun(w);
          break;
        case "penyerang":
          this.thinkPenyerang(w);
          break;
        case "penyembuh":
          this.thinkPenyembuh(w);
          break;
      }
    }
    this.presses.skill1 = this.input.skill1 && !prev1;
    this.presses.skill2 = this.input.skill2 && !prev2;
  }

  // --- Per peran ---

  private thinkPenjaga(w: BotWorld): void {
    const p = this.player;
    const [shield, lure] = w.abilityOf(p).skills;
    const r = this.rules;
    // Perisai: musuh menempel -> hadapkan dan angkat perisai.
    const close = nearestEnemy(w.enemies, p.position.x, p.position.z, r.shieldTriggerRadius);
    if (close && shield.cooldownLeft <= 0 && this.aimAt(close.position.x, close.position.z)) this.input.skill1 = true;
    // Pancing: musuh berkumpul dekat pos ronda (atau boss mendekat) -> dekati kerumunan lalu pancing.
    const near = w.enemies.pool.filter(
      (e) => e.active && !e.stunned && distanceToBox(e.position.x, e.position.z, w.markas.box) <= r.lureTriggerRadius,
    );
    // Boss hanya dipancing jika ada jebakan untuk menjebaknya; tanpa itu boss cuma dibawa berputar-putar.
    const bossNear = near.some((e) => e.data?.boss) && w.structures.activeTraps > 0;
    const crowd = near.filter((e) => !e.data?.boss).length;
    if (lure.cooldownLeft <= 0 && (crowd >= r.lureMinEnemies || bossNear)) {
      const cx = near.reduce((n, e) => n + e.position.x, 0) / near.length;
      const cz = near.reduce((n, e) => n + e.position.z, 0) / near.length;
      if (Math.hypot(cx - p.position.x, cz - p.position.z) <= this.lureRadius * 0.8) this.input.skill2 = true;
      else this.moveTo(cx, cz);
      return;
    }
    if (!close) this.moveTo(this.homeX, this.homeZ);
  }

  private thinkPembangun(w: BotWorld): void {
    const r = this.rules;
    // Jebakan di jalur musuh paling berbahaya (boss lebih dulu) jika koin cukup.
    // Selama boss belum kalah, jebakan untuk musuh biasa hanya jika koin cukup untuk dua jebakan
    // (boss hanya bisa dilukai saat terjebak, jadi koin jebakannya harus selalu tersedia).
    const boss = w.enemies.boss;
    const budget = boss ? this.trapCost : w.bossPending ? this.trapCost * 2 : this.trapCost;
    if (w.coinCount >= budget) {
      const threat = boss ?? nearestToMarkas(w.enemies, w.markas, r.trapMinDistance);
      // Boss sudah dekat pos ronda: dekati boss lalu pasang jebakan tepat di depannya.
      if (boss && Math.hypot(boss.position.x, boss.position.z) < r.trapPathDistance + BOSS_TRAP_LEAD) {
        if (!w.structures.trapNear(boss.position.x, boss.position.z, boss.radius + this.trapTrigger)) {
          const reach = this.trapPlaceDist + this.trapTrigger + boss.radius - BOSS_REACH_SLACK;
          if (this.moveTo(boss.position.x, boss.position.z, reach) && this.aimAt(boss.position.x, boss.position.z)) {
            this.input.skill2 = true;
          }
          return;
        }
      } else if (threat) {
        const dx = threat.position.x - w.markas.box.cx;
        const dz = threat.position.z - w.markas.box.cz;
        const len = Math.hypot(dx, dz) || 1;
        const ux = dx / len;
        const uz = dz / len;
        // Boss yang masih jauh dijebak lebih awal di jalurnya (bot sempat menjauh dari hantamannya).
        const along = boss ? Math.max(r.trapPathDistance, len - BOSS_TRAP_LEAD) : r.trapPathDistance;
        const tx = w.markas.box.cx + ux * along;
        const tz = w.markas.box.cz + uz * along;
        if (!w.structures.trapNear(tx, tz, r.trapMinDistance)) {
          // Berdiri sedikit di depan titik jebakan (sisi pos), menghadap ke arah musuh.
          const sx = tx - ux * this.trapPlaceDist;
          const sz = tz - uz * this.trapPlaceDist;
          if (this.moveTo(sx, sz) && this.aimAt(threat.position.x, threat.position.z)) this.input.skill2 = true;
          return;
        }
      }
    }
    this.idle(w);
  }

  private thinkPenyerang(w: BotWorld): void {
    const p = this.player;
    const r = this.rules;
    const [, area] = w.abilityOf(p).skills;
    // Serangan Area saat musuh berkerumun (termasuk boss yang sedang terjebak).
    if (area.cooldownLeft <= 0 && w.enemies.countWithin(p.position.x, p.position.z, this.areaRadius) >= r.areaMinEnemies) {
      this.input.skill2 = true;
    }
    const target = this.shootTarget(w);
    if (!target) {
      this.idle(w);
      return;
    }
    const tx = target.position.x;
    const tz = target.position.z;
    const dist = Math.hypot(tx - p.position.x, tz - p.position.z);
    if (dist > r.preferredShootDistance && this.withinLeash(tx, tz)) {
      this.moveTo(tx, tz); // mendekat sambil menghadap sasaran
      if (dist <= this.shotRange && this.facingError(tx, tz) < r.aimToleranceRad) this.input.skill1 = true;
      return;
    }
    if (this.aimAt(tx, tz) && dist <= this.shotRange) this.input.skill1 = true;
  }

  private thinkPenyembuh(w: BotWorld): void {
    const p = this.player;
    const r = this.rules;
    const [heal, buff] = w.abilityOf(p).skills;
    if (buff.cooldownLeft <= 0 && w.enemies.activeCount >= r.buffMinEnemies) this.input.skill2 = true;
    if (heal.cooldownLeft <= 0) {
      // Teman kritis lebih dulu, lalu pos ronda di bawah ambang.
      const ally = w.players.find((q) => q !== p && !q.downed && q.hp / q.maxHp < r.healTeammateBelow);
      if (ally) {
        if (this.moveTo(ally.position.x, ally.position.z, this.healRadius * 0.6)) this.input.skill1 = true;
        return;
      }
      const m = w.markas;
      if (m.hp / m.maxHp < r.healMarkasBelow) {
        if (distanceToBox(p.position.x, p.position.z, m.box) <= this.healRadius * 0.8) this.input.skill1 = true;
        else this.moveTo(m.box.cx, m.box.cz);
        return;
      }
    }
    this.idle(w);
  }

  // --- Bersama ---

  /** Senggang: pungut koin di sekitar pos ronda (koin cepat hilang), selain itu kembali berjaga. */
  private idle(w: BotWorld): void {
    const p = this.player;
    const coin = w.coins.nearest(p.position.x, p.position.z);
    if (coin && Math.hypot(coin.x, coin.z) <= this.rules.coinCollectRadius) this.moveTo(coin.x, coin.z);
    else this.moveTo(this.homeX, this.homeZ);
  }

  /** Menjauh dari boss yang tidak terjebak jika terlalu dekat dengan jangkauan hantamannya. */
  private avoidBoss(w: BotWorld): boolean {
    const boss = w.enemies.boss;
    const slam = boss?.data?.boss?.slamRadius;
    if (!boss || slam === undefined || boss.stunned) return false;
    const p = this.player;
    // Pembangun yang punya koin jebakan tetap mendekat: tanpa jebakan boss tidak bisa dilukai.
    if (p.role.id === "pembangun" && w.coinCount >= this.trapCost && !w.structures.trapNear(boss.position.x, boss.position.z, slam)) {
      return false;
    }
    const dx = p.position.x - boss.position.x;
    const dz = p.position.z - boss.position.z;
    const d = Math.hypot(dx, dz) || 1;
    if (d - p.radius > slam + this.rules.bossAvoidMargin) return false;
    // Tetap angkat perisai jika Penjaga (hantaman dari depan tertahan).
    if (p.role.id === "penjaga" && w.abilityOf(p).skills[0].cooldownLeft <= 0) {
      if (this.aimAt(boss.position.x, boss.position.z)) this.input.skill1 = true;
    }
    this.input.moveX = dx / d;
    this.input.moveZ = dz / d;
    return true;
  }

  /** Hidupkan teman yang jatuh jika dekat dan tidak ada musuh mengancam. */
  private tryRevive(w: BotWorld): boolean {
    const p = this.player;
    const r = this.rules;
    const downed = w.players.find(
      (q) => q !== p && q.downed && Math.hypot(q.position.x - p.position.x, q.position.z - p.position.z) <= r.reviveSearchRadius,
    );
    if (!downed) return false;
    const supportRole = p.role.id === "penyembuh" || p.role.id === "pembangun";
    if (!supportRole && w.enemies.countWithin(p.position.x, p.position.z, SAFE_TO_REVIVE_RADIUS) > 0) return false;
    this.moveTo(downed.position.x, downed.position.z, REVIVE_STAND_DIST);
    return true;
  }

  /** Sasaran tembak: boss yang sedang terjebak lebih dulu, lalu musuh terdekat yang bisa dilukai. */
  private shootTarget(w: BotWorld): Enemy | null {
    const p = this.player;
    const boss = w.enemies.boss;
    if (boss?.stunned) return boss;
    let best: Enemy | null = null;
    let bestD = Infinity;
    for (const e of w.enemies.pool) {
      if (!e.active) continue;
      if (e.data?.boss?.onlyDamageWhenStunned && !e.stunned) continue;
      const d = Math.hypot(e.position.x - p.position.x, e.position.z - p.position.z);
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** Gerak ke titik (dibatasi radius jaga dari pos ronda). true jika sudah sampai. */
  private moveTo(x: number, z: number, arrive = ARRIVE_DIST): boolean {
    const leash = this.rules.leashRadius;
    const d0 = Math.hypot(x, z);
    if (d0 > leash) {
      x = (x / d0) * leash;
      z = (z / d0) * leash;
    }
    const dx = x - this.player.position.x;
    const dz = z - this.player.position.z;
    const d = Math.hypot(dx, dz);
    if (d <= arrive) return true;
    this.input.moveX = dx / d;
    this.input.moveZ = dz / d;
    return false;
  }

  /** Putar badan ke titik dengan input sangat kecil (hampir tidak berpindah). true jika sudah menghadap. */
  private aimAt(x: number, z: number): boolean {
    if (this.facingError(x, z) < this.rules.aimToleranceRad) return true;
    const dx = x - this.player.position.x;
    const dz = z - this.player.position.z;
    const d = Math.hypot(dx, dz) || 1;
    this.input.moveX = (dx / d) * this.rules.aimInput;
    this.input.moveZ = (dz / d) * this.rules.aimInput;
    return false;
  }

  private facingError(x: number, z: number): number {
    const p = this.player;
    const want = Math.atan2(x - p.position.x, z - p.position.z);
    return Math.abs(Scalar.NormalizeRadians(want - p.yaw));
  }

  private withinLeash(x: number, z: number): boolean {
    return Math.hypot(x, z) <= this.rules.leashRadius + this.rules.preferredShootDistance;
  }
}

function nearestEnemy(enemies: EnemyManager, x: number, z: number, radius: number): Enemy | null {
  let best: Enemy | null = null;
  let bestD = radius;
  for (const e of enemies.pool) {
    if (!e.active) continue;
    const d = Math.hypot(e.position.x - x, e.position.z - z) - e.radius;
    if (d <= bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}

/** Musuh (belum terjebak) yang paling dekat ke pos ronda, tapi masih lebih jauh dari `minDist`. */
function nearestToMarkas(enemies: EnemyManager, markas: Markas, minDist: number): Enemy | null {
  let best: Enemy | null = null;
  let bestD = Infinity;
  for (const e of enemies.pool) {
    if (!e.active || e.stunned) continue;
    const d = distanceToBox(e.position.x, e.position.z, markas.box);
    if (d > minDist && d < bestD) {
      bestD = d;
      best = e;
    }
  }
  return best;
}
