import { Color4, type Scene } from "@babylonjs/core";
import { ARENA } from "../config/arena";
import { GAME_RULES, MAX_ACTIVE_ENEMIES, ROLES, TEST_WAVE, getEnemy, type RoleId } from "../data/types";
import { Markas } from "../entities/Markas";
import { PLAYER_SPAWNS, Player } from "../entities/Player";
import { createAbility } from "../roles";
import { PenyerangAbility } from "../roles/Penyerang";
import type { CombatContext, RoleAbility } from "../roles/RoleAbility";
import { CoinManager } from "../systems/CoinManager";
import { clampToArena, pushOutOfBox, separateCircles } from "../systems/Collision";
import { Effects } from "../systems/Effects";
import { EnemyManager } from "../systems/EnemyManager";
import type { InputManager } from "../systems/InputManager";
import { ProjectileManager } from "../systems/ProjectileManager";
import { WaveDirector } from "../systems/WaveDirector";
import type { Arena } from "./ArenaScene";

/** Pemain di slot input tertentu memakai peran tertentu. */
export interface Assignment {
  slot: number;
  roleId: RoleId;
}

export type MatchState = "main" | "kalah";

const FX_DEATH = new Color4(0.75, 0.65, 0.55, 1);
const FX_HIT = new Color4(1, 0.95, 0.6, 1);
const FX_BITE_PLAYER = new Color4(1, 0.2, 0.15, 1);
const FX_BITE_MARKAS = new Color4(1, 0.55, 0.2, 1);
const FX_COIN = new Color4(1, 0.85, 0.2, 1);

/**
 * Satu pertandingan: pemain terpilih, markas, musuh, koin, dan gelombang percobaan.
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
  readonly waves: WaveDirector;
  state: MatchState = "main";
  coinCount = 0;
  kills = 0;
  elapsed = 0;
  private assignments: Assignment[] = [];
  private readonly abilities = new Map<RoleId, RoleAbility>();
  private readonly ctx: CombatContext;
  private _activePlayers: Player[] = [];

  constructor(
    scene: Scene,
    private readonly arena: Arena,
    private readonly input: InputManager,
  ) {
    this.players = ROLES.map((role) => new Player(scene, role));
    for (const role of ROLES) this.abilities.set(role.id, createAbility(role));

    this.markas = new Markas(GAME_RULES.markas.hp, arena.postBox);
    this.effects = new Effects(scene);

    this.enemies = new EnemyManager(scene, MAX_ACTIVE_ENEMIES, getEnemy(TEST_WAVE.enemyType), TEST_WAVE.spawnPoints, {
      onKilled: (e) => {
        this.kills++;
        const d = e.data;
        this.effects.burst(e.position.x, 0.4, e.position.z, 8, FX_DEATH, 4, 0.5, 0.16);
        if (d) this.coins.drop(e.position.x, e.position.z, d.coinDrop);
      },
      onAttack: (x, z, target) =>
        this.effects.burst(x, 0.5, z, 4, target === "pemain" ? FX_BITE_PLAYER : FX_BITE_MARKAS, 3, 0.3, 0.12),
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

    this.waves = new WaveDirector(TEST_WAVE, this.enemies);
    this.ctx = { enemies: this.enemies, projectiles: this.projectiles, effects: this.effects };
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
    this.coinCount = 0;
    this.kills = 0;
    this.elapsed = 0;
    this.markas.reset();
    this.enemies.reset();
    this.projectiles.reset();
    this.coins.reset();
    this.effects.reset();
    this.waves.reset();
    for (const p of this._activePlayers) {
      p.reset(PLAYER_SPAWNS[p.slot]);
      this.abilityOf(p).reset();
    }
  }

  /** Keluar dari pertandingan (kembali ke pilih peran). */
  stop(): void {
    this.restart();
    for (const p of this.players) p.deactivate();
    this._activePlayers = [];
    this.assignments = [];
  }

  /** Benchmark: musuh selalu penuh, markas & pemain kebal, gelombang berhenti. */
  setBenchmarkMode(on: boolean): void {
    this.enemies.fillToCapacity = on;
    this.waves.paused = on;
    this.markas.invulnerable = on;
    for (const p of this.players) p.invulnerable = on;
  }

  update(dt: number): void {
    // Saat kalah dunia membeku; hanya efek yang menyelesaikan animasinya.
    if (this.state === "kalah") {
      this.effects.update(dt);
      return;
    }
    this.elapsed += dt;
    this.waves.update(dt);

    for (const p of this._activePlayers) {
      const input = this.input.getState(p.slot);
      p.update(dt, input);
      this.abilityOf(p).update(dt, p, input, this.ctx);
    }
    separateCircles(this._activePlayers);
    for (const p of this._activePlayers) {
      pushOutOfBox(p, this.arena.postBox);
      clampToArena(p, ARENA.halfWidth, ARENA.halfDepth);
    }

    this.projectiles.update(dt, this.enemies);
    this.enemies.update(dt, this.markas, this._activePlayers);
    this.coins.update(dt, this._activePlayers);
    this.effects.update(dt);

    if (this.markas.destroyed) this.state = "kalah";
  }

  private playerOf(roleId: RoleId): Player {
    const p = this.players.find((q) => q.role.id === roleId);
    if (!p) throw new Error(`Peran tidak ditemukan: ${roleId}`);
    return p;
  }
}
