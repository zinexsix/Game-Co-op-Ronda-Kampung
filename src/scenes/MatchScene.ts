import { Color4, type Scene } from "@babylonjs/core";
import { ARENA } from "../config/arena";
import { GAME_RULES, MAX_ACTIVE_ENEMIES, ROLES, TEST_WAVE, getEnemy, getRole, type RoleId } from "../data/types";
import { Markas } from "../entities/Markas";
import { PLAYER_SPAWNS, Player } from "../entities/Player";
import { createAbility } from "../roles";
import { PenyerangAbility } from "../roles/Penyerang";
import type { CombatContext, NoticeKind, RoleAbility } from "../roles/RoleAbility";
import { CoinManager } from "../systems/CoinManager";
import { clampToArena, pushOutOfBox, separateCircles } from "../systems/Collision";
import { Effects, RING_COLORS } from "../systems/Effects";
import { EnemyManager } from "../systems/EnemyManager";
import type { InputManager } from "../systems/InputManager";
import { ProjectileManager } from "../systems/ProjectileManager";
import { StructureManager } from "../systems/StructureManager";
import { WaveDirector } from "../systems/WaveDirector";
import type { Arena } from "./ArenaScene";

/** Pemain di slot input tertentu memakai peran tertentu. */
export interface Assignment {
  slot: number;
  roleId: RoleId;
}

export type MatchState = "main" | "kalah";

/** Pesan singkat untuk kartu HUD pemain. */
export interface Notice {
  slot: number;
  text: string;
  kind: NoticeKind;
}

const FX_DEATH = new Color4(0.75, 0.65, 0.55, 1);
const FX_HIT = new Color4(1, 0.95, 0.6, 1);
const FX_BITE_PLAYER = new Color4(1, 0.2, 0.15, 1);
const FX_BITE_MARKAS = new Color4(1, 0.55, 0.2, 1);
const FX_BLOCKED = new Color4(0.4, 0.75, 1, 1);
const FX_WOOD = new Color4(0.65, 0.45, 0.25, 1);
const FX_COIN = new Color4(1, 0.85, 0.2, 1);
const FX_REVIVE = new Color4(0.6, 1, 0.7, 1);
/** Benchmark: koin selalu cukup agar barikade/jebakan ikut teruji. */
const BENCHMARK_COINS = 999;

/**
 * Satu pertandingan: pemain terpilih, markas, musuh, koin, struktur, dan gelombang percobaan.
 * Semua objek dibuat sekali; mulai ulang hanya me-reset status (tanpa memuat ulang aset).
 */
export class MatchScene {
  /** Satu Player per peran (urutan sama dengan roles.json). */
  readonly players: Player[];
  readonly markas: Markas;
  readonly enemies: EnemyManager;
  readonly projectiles: ProjectileManager;
  readonly coins: CoinManager;
  readonly effects: Effects;
  readonly structures: StructureManager;
  readonly waves: WaveDirector;
  state: MatchState = "main";
  coinCount = 0;
  kills = 0;
  elapsed = 0;
  /** Mode uji skill: gelombang berhenti, musuh/koin dimunculkan manual (F6-F9). */
  testMode = false;
  private benchmark = false;
  private assignments: Assignment[] = [];
  private readonly abilities = new Map<RoleId, RoleAbility>();
  private readonly ctx: CombatContext;
  private _activePlayers: Player[] = [];
  private notices: Notice[] = [];
  private downCursor = 0;

  constructor(
    scene: Scene,
    private readonly arena: Arena,
    private readonly input: InputManager,
  ) {
    this.players = ROLES.map((role) => new Player(scene, role));
    for (const p of this.players) this.abilities.set(p.role.id, createAbility(p, scene));

    this.markas = new Markas(GAME_RULES.markas.hp, arena.postBox);
    this.effects = new Effects(scene);

    this.enemies = new EnemyManager(scene, MAX_ACTIVE_ENEMIES, getEnemy(TEST_WAVE.enemyType), TEST_WAVE.spawnPoints, {
      onKilled: (e) => {
        this.kills++;
        const d = e.data;
        this.effects.burst(e.position.x, 0.4, e.position.z, 8, FX_DEATH, 4, 0.5, 0.16);
        if (d) this.coins.drop(e.position.x, e.position.z, d.coinDrop);
      },
      onAttack: (x, z, target, result) => {
        const color =
          target === "markas" ? FX_BITE_MARKAS : target === "barikade" ? FX_WOOD : result === "diblokir" ? FX_BLOCKED : FX_BITE_PLAYER;
        this.effects.burst(x, 0.5, z, 4, color, 3, 0.3, 0.12);
      },
    });

    // Ukuran pool proyektil dari data Penyerang (jumlah maksimal yang bisa melayang bersamaan).
    const shooters = [...this.abilities.values()].filter((a): a is PenyerangAbility => a instanceof PenyerangAbility);
    const projectileCap = shooters.reduce((n, a) => n + a.maxProjectilesInFlight, 0);
    this.projectiles = new ProjectileManager(scene, Math.max(1, projectileCap), (_e, x, z, killed) => {
      if (!killed) this.effects.burst(x, 0.5, z, 3, FX_HIT, 3, 0.2, 0.1);
    });

    this.coins = new CoinManager(scene, GAME_RULES.coins, (x, z) => {
      this.coinCount++;
      this.effects.burst(x, 0.5, z, 5, FX_COIN, 3, 0.35, 0.1);
    });

    const [barricade, trap] = getRole("pembangun").skills;
    this.structures = new StructureManager(scene, barricade, trap, arena.postBox, {
      onBarricadeBroken: (x, z) => this.effects.burst(x, 0.5, z, 14, FX_WOOD, 4, 0.6, 0.18),
      onTrapTriggered: (x, z) => this.effects.areaBlast(x, z, trap.radius ?? 1, RING_COLORS.trap),
    });

    this.waves = new WaveDirector(TEST_WAVE, this.enemies, () => this.respawnDowned());

    const match = this;
    this.ctx = {
      enemies: this.enemies,
      projectiles: this.projectiles,
      effects: this.effects,
      structures: this.structures,
      markas: this.markas,
      get players() {
        return match._activePlayers;
      },
      get coins() {
        return match.coinCount;
      },
      spendCoins: (amount) => {
        if (this.coinCount < amount) return false;
        this.coinCount -= amount;
        return true;
      },
      notify: (player, text, kind = "info") => this.notices.push({ slot: player.slot, text, kind }),
    };
  }

  /** Pemain yang ikut bermain, urut slot. */
  get activePlayers(): readonly Player[] {
    return this._activePlayers;
  }

  get currentAssignments(): readonly Assignment[] {
    return this.assignments;
  }

  abilityOf(p: Player): RoleAbility {
    const a = this.abilities.get(p.role.id);
    if (!a) throw new Error(`Skill peran tidak ada: ${p.role.id}`);
    return a;
  }

  /** Ambil (dan kosongkan) pesan untuk HUD. */
  takeNotices(): Notice[] {
    const out = this.notices;
    this.notices = [];
    return out;
  }

  /** Mulai pertandingan baru dengan pembagian peran ini. */
  start(assignments: Assignment[]): void {
    this.assignments = [...assignments].sort((a, b) => a.slot - b.slot);
    for (const p of this.players) p.deactivate();
    this._activePlayers = this.assignments.map(({ slot, roleId }) => {
      const p = this.playerOf(roleId);
      p.activate(slot, PLAYER_SPAWNS[slot]);
      return p;
    });
    this.restart();
  }

  /** Ulangi pertandingan dengan peran yang sama ("Coba Lagi"). */
  restart(): void {
    this.state = "main";
    this.coinCount = this.testMode ? GAME_RULES.testMode.startCoins : 0;
    this.kills = 0;
    this.elapsed = 0;
    this.notices = [];
    this.markas.reset();
    this.enemies.reset();
    this.projectiles.reset();
    this.coins.reset();
    this.effects.reset();
    this.structures.reset();
    this.waves.reset();
    this.waves.paused = this.testMode || this.benchmark;
    for (const p of this._activePlayers) {
      p.reset(PLAYER_SPAWNS[p.slot]);
      this.abilityOf(p).reset();
    }
  }

  /** Keluar dari pertandingan (kembali ke pilih peran). */
  stop(): void {
    this.setTestMode(false);
    this.restart();
    for (const p of this.players) p.deactivate();
    this._activePlayers = [];
    this.assignments = [];
  }

  /** Benchmark: musuh selalu penuh, markas & pemain kebal, gelombang berhenti, koin tak terbatas. */
  setBenchmarkMode(on: boolean): void {
    this.benchmark = on;
    this.enemies.fillToCapacity = on;
    this.waves.paused = on || this.testMode;
    this.markas.invulnerable = on;
    for (const p of this.players) p.invulnerable = on;
  }

  // --- Mode uji skill (tanpa menunggu gelombang) ---

  setTestMode(on: boolean): void {
    if (on === this.testMode) return;
    this.testMode = on;
    this.waves.paused = on || this.benchmark;
    if (on) this.coinCount += GAME_RULES.testMode.startCoins;
  }

  testSpawnGroup(): void {
    this.enemies.spawnGroup(GAME_RULES.testMode.spawnGroup);
  }

  /** Tambah koin dan habiskan semua cooldown. */
  testAddCoins(): void {
    this.coinCount += GAME_RULES.testMode.addCoins;
    for (const p of this._activePlayers) this.abilityOf(p).clearCooldowns();
  }

  /** Jatuhkan pemain bergiliran (uji revive). */
  testDownNext(): void {
    const alive = this._activePlayers.filter((p) => !p.downed);
    if (alive.length === 0) return;
    alive[this.downCursor++ % alive.length].knockDown();
  }

  update(dt: number): void {
    // Saat kalah dunia membeku; hanya efek yang menyelesaikan animasinya.
    if (this.state === "kalah") {
      this.effects.update(dt);
      return;
    }
    if (this.benchmark) this.coinCount = BENCHMARK_COINS;
    this.elapsed += dt;
    this.waves.update(dt);

    for (const p of this._activePlayers) {
      const input = this.input.getState(p.slot);
      p.update(dt, input);
      this.abilityOf(p).update(dt, p, input, this.input.getPresses(p.slot), this.ctx);
    }
    separateCircles(this._activePlayers);
    for (const p of this._activePlayers) {
      this.structures.pushOut(p);
      pushOutOfBox(p, this.arena.postBox);
      clampToArena(p, ARENA.halfWidth, ARENA.halfDepth);
    }
    this.updateRevive(dt);

    this.projectiles.update(dt, this.enemies);
    this.structures.update(dt, this.enemies);
    this.enemies.update(dt, this.markas, this._activePlayers, this.structures);
    this.coins.update(dt, this._activePlayers);
    this.effects.update(dt);

    if (this.markas.destroyed) this.state = "kalah";
  }

  /** Teman yang berdiri di dekat pemain jatuh mengisi bar revive; jika ditinggal, bar turun perlahan. */
  private updateRevive(dt: number): void {
    const r = GAME_RULES.revive;
    for (const p of this._activePlayers) {
      if (!p.downed) continue;
      const helped = this._activePlayers.some(
        (q) => q !== p && !q.downed && Math.hypot(q.position.x - p.position.x, q.position.z - p.position.z) <= r.radius,
      );
      const rate = (helped ? 1 : -r.decayPerSec) / r.durationSec;
      p.reviveProgress = Math.max(0, Math.min(1, p.reviveProgress + rate * dt));
      if (p.reviveProgress >= 1) {
        p.revive(r.hpFraction);
        this.effects.areaBlast(p.position.x, p.position.z, r.radius, RING_COLORS.heal);
        this.effects.rise(p.position.x, 0.3, p.position.z, 10, FX_REVIVE, 0.6, 1, 0.14);
        this.notices.push({ slot: p.slot, text: "Bangkit lagi!", kind: "info" });
      }
    }
  }

  /** Awal gelombang: pemain yang masih jatuh kembali ke titik awal dengan HP penuh. */
  private respawnDowned(): void {
    for (const p of this._activePlayers) {
      if (!p.downed) continue;
      p.reset(PLAYER_SPAWNS[p.slot]);
      this.effects.rise(p.position.x, 0.3, p.position.z, 10, FX_REVIVE, 0.6, 1, 0.14);
      this.notices.push({ slot: p.slot, text: "Kembali di gelombang baru!", kind: "info" });
    }
  }

  private playerOf(roleId: RoleId): Player {
    const p = this.players.find((q) => q.role.id === roleId);
    if (!p) throw new Error(`Peran tidak ditemukan: ${roleId}`);
    return p;
  }
}
