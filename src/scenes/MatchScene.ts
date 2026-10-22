import { Color4, type Scene } from "@babylonjs/core";
import { ARENA } from "../config/arena";
import {
  FLOW_RULES,
  GAME_RULES,
  LEVELS,
  MAX_ACTIVE_ENEMIES,
  ENEMIES,
  REGULAR_ENEMIES,
  ROLES,
  SCORE_RULES,
  getRole,
  scalingFor,
  type LevelData,
  type RoleId,
} from "../data/types";
import { Markas } from "../entities/Markas";
import { PLAYER_SPAWNS, Player } from "../entities/Player";
import { createAbility } from "../roles";
import { PenyerangAbility } from "../roles/Penyerang";
import type { CombatContext, NoticeKind, RoleAbility } from "../roles/RoleAbility";
import { CoinManager } from "../systems/CoinManager";
import { clampToArena, pushOutOfBox, separateCircles } from "../systems/Collision";
import { ContributionTracker } from "../systems/ContributionTracker";
import { Effects, RING_COLORS } from "../systems/Effects";
import { EnemyManager } from "../systems/EnemyManager";
import type { InputManager } from "../systems/InputManager";
import { LevelManager } from "../systems/LevelManager";
import type { AudioSystem } from "../systems/AudioSystem";
import { BotBrain, type BotWorld } from "../systems/BotBrain";
import { ComboSystem, type ComboEvent } from "../systems/ComboSystem";
import { distanceToObb } from "../systems/Collision";
import { ProjectileManager } from "../systems/ProjectileManager";
import { ScoreSystem, type LevelScore } from "../systems/ScoreSystem";
import { StructureManager } from "../systems/StructureManager";
import { TutorialHints } from "../systems/TutorialHints";
import type { Arena } from "./ArenaScene";

/** Pemain di slot input tertentu memakai peran tertentu. */
export interface Assignment {
  slot: number;
  roleId: RoleId;
  /** Dimainkan bot (peran yang tidak dipilih manusia). */
  bot?: boolean;
}

export type MatchState = "main" | "kalah" | "menang";

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
const FX_IMMUNE = new Color4(0.55, 0.6, 0.7, 1);
const FX_SLAM = RING_COLORS.area;
/** Benchmark: koin selalu cukup agar barikade/jebakan ikut teruji. */
const BENCHMARK_COINS = 999;
/** Lama pengumuman umum (mis. "Pencuri kabur!") tampil di HUD. */
const ANNOUNCE_SEC = 2.5;
const IMMUNE_FLASH_SEC = 0.6;
const REGULAR_IDS = new Set(REGULAR_ENEMIES.map((e) => e.id));
const FX_COMBO = new Color4(1, 0.9, 0.3, 1);
/** Guncangan kamera (kekuatan m, lama dtk): pos ronda digigit, hantaman boss, combo. */
const SHAKE_MARKAS: [number, number] = [0.12, 0.15];
const SHAKE_SLAM: [number, number] = [0.35, 0.3];
const SHAKE_COMBO: [number, number] = [0.15, 0.2];
/** Partikel saat musuh kalah (dibatasi; pool partikel juga punya batas total). */
const DEATH_PARTICLES = 6;

/**
 * Satu permainan: urutan level (Level 1, Level 2, ...), pemain terpilih, markas, musuh, koin,
 * struktur, skor tim, dan kontribusi per peran. Semua objek dibuat sekali; mulai ulang atau
 * pindah level hanya me-reset status dan mengganti tata letak arena (tanpa memuat ulang aset).
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
  readonly levels: LevelManager;
  readonly score = new ScoreSystem(SCORE_RULES);
  readonly contributions = new ContributionTracker();
  readonly hints = new TutorialHints(FLOW_RULES);
  readonly combos = new ComboSystem(GAME_RULES.combos);
  /** Combo baru untuk HUD (teks COMBO). */
  private comboPopups: ComboEvent[] = [];
  state: MatchState = "main";
  coinCount = 0;
  kills = 0;
  elapsed = 0;
  levelIndex = 0;
  /** Skor level terakhir yang dimenangkan. */
  lastLevelScore: LevelScore | null = null;
  /** Mode uji skill: gelombang berhenti, musuh/koin dimunculkan manual (F6-F9). */
  testMode = false;
  private benchmark = false;
  private assignments: Assignment[] = [];
  private readonly abilities = new Map<RoleId, RoleAbility>();
  private readonly ctx: CombatContext;
  private _activePlayers: Player[] = [];
  private notices: Notice[] = [];
  private announcement: string | null = null;
  private announceTimer = 0;
  private downCursor = 0;
  private testTypeCursor = 0;
  private readonly bots = new Map<RoleId, BotBrain>();
  private readonly botWorld: BotWorld;
  private bossAnnounced = false;
  /** Sisa waktu tanda "KEBAL" di bar boss (serangan mengenai boss yang tidak terjebak). */
  bossImmuneFlash = 0;

  constructor(
    scene: Scene,
    private readonly arena: Arena,
    private readonly input: InputManager,
    private readonly audio: AudioSystem,
  ) {
    this.players = ROLES.map((role) => new Player(scene, role));
    for (const p of this.players) this.abilities.set(p.role.id, createAbility(p, scene));

    this.markas = new Markas(GAME_RULES.markas.hp, arena.postBox);
    this.effects = new Effects(scene);
    const track = this.contributions;

    this.enemies = new EnemyManager(scene, MAX_ACTIVE_ENEMIES, ENEMIES, {
      onKilled: (e, source) => {
        this.kills++;
        track.add(source, "kills");
        this.audio.play("musuhKalah");
        this.combos.enemyKilled(this.elapsed, source, e.trappedAge, e.position.x, e.position.z);
        this.effects.burst(e.position.x, 0.4, e.position.z, DEATH_PARTICLES, FX_DEATH, 4, 0.5, 0.16);
        // Pencuri yang kalah menjatuhkan koin curiannya juga.
        if (e.data) this.coins.drop(e.position.x, e.position.z, e.data.coinDrop + e.carried);
      },
      onDamaged: (amount, source) => track.add(source, "damage", amount),
      onAttack: (x, z, target, info) => {
        if (info.result === "diblokir") {
          track.add(info.victim?.role.id, "blocked", info.amount);
          if (info.victim?.role.id === "penjaga") this.combos.blocked(this.elapsed, x, z);
          this.audio.play("kebal");
        } else if (target === "pemain") {
          this.audio.play("kena");
        }
        if (target === "barikade") track.add("pembangun", "barricadeAbsorbed", info.amount);
        if (target === "markas") {
          this.audio.play("markas");
          this.arena.shake(...SHAKE_MARKAS);
        }
        const color =
          target === "markas" ? FX_BITE_MARKAS : target === "barikade" ? FX_WOOD : info.result === "diblokir" ? FX_BLOCKED : FX_BITE_PLAYER;
        this.effects.burst(x, 0.5, z, 4, color, 3, 0.3, 0.12);
      },
      onSteal: (x, z) => this.effects.burst(x, 0.5, z, 5, FX_COIN, 3, 0.35, 0.1),
      onEscaped: (_e, coins) => this.announce(`Pencuri kabur membawa ${coins} koin!`),
      onImmune: (x, z) => {
        this.bossImmuneFlash = IMMUNE_FLASH_SEC;
        this.audio.play("kebal");
        this.effects.burst(x, 1.5, z, 2, FX_IMMUNE, 3, 0.25, 0.12);
      },
      onBossStunned: (e) => {
        // Koin langsung masuk ke kas tim (koin di bawah kaki boss terlalu berbahaya untuk dipungut).
        const coins = e.data?.boss?.coinsOnStun ?? 0;
        this.coinCount += coins;
        this.audio.play("bossStun");
        this.effects.rise(e.position.x, 1, e.position.z, 8, FX_COIN, 1, 0.8, 0.14);
        this.announce(`${e.data?.name ?? "Boss"} terjebak! Serang sekarang! +${coins} koin`);
      },
      onBossPhase: (e, phase) => {
        const name = e.data?.name ?? "Boss";
        this.audio.play("boss");
        if (phase === 2) this.announce(`${name} memanggil Tikus Raksasa!`);
        if (phase === 3) this.announce(`${name} mengamuk! Jebak lagi!`);
      },
      onSlam: (x, z, radius) => {
        this.effects.areaBlast(x, z, radius, FX_SLAM);
        this.audio.play("area");
        this.arena.shake(...SHAKE_SLAM);
      },
    });

    // Ukuran pool proyektil dari data Penyerang (jumlah maksimal yang bisa melayang bersamaan).
    const shooters = [...this.abilities.values()].filter((a): a is PenyerangAbility => a instanceof PenyerangAbility);
    const projectileCap = shooters.reduce((n, a) => n + a.maxProjectilesInFlight, 0);
    this.projectiles = new ProjectileManager(scene, Math.max(1, projectileCap), (_e, x, z, killed) => {
      if (!killed) this.effects.burst(x, 0.5, z, 3, FX_HIT, 3, 0.2, 0.1);
    });

    this.coins = new CoinManager(scene, GAME_RULES.coins, (x, z, player) => {
      this.coinCount++;
      track.add(player.role.id, "coins");
      this.audio.play("koin");
      this.effects.burst(x, 0.5, z, 5, FX_COIN, 3, 0.35, 0.1);
    });

    const [barricade, trap] = getRole("pembangun").skills;
    this.structures = new StructureManager(scene, barricade, trap, arena.postBox, {
      onBarricadeBroken: (x, z) => {
        this.effects.burst(x, 0.5, z, 10, FX_WOOD, 4, 0.6, 0.18);
        this.audio.play("bangun");
      },
      onTrapTriggered: (x, z, stunned) => {
        this.audio.play("jebakan");
        track.add("pembangun", "trapsTriggered");
        track.add("pembangun", "trapStuns", stunned);
        this.effects.areaBlast(x, z, trap.radius ?? 1, RING_COLORS.trap);
      },
    });

    const bossTypes = new Set(ENEMIES.filter((e) => e.boss).map((e) => e.id));
    this.levels = new LevelManager(this.enemies, bossTypes, FLOW_RULES.earlyNextWaveSec, () => this.respawnDowned());

    const match = this;
    this.botWorld = {
      get players() {
        return match._activePlayers;
      },
      enemies: this.enemies,
      coins: this.coins,
      markas: this.markas,
      structures: this.structures,
      get coinCount() {
        return match.coinCount;
      },
      get bossPending() {
        return match.levels.hasBossPending;
      },
      abilityOf: (p) => this.abilityOf(p),
    };
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
      track: (role, stat, amount) => track.add(role, stat, amount),
      sound: (id) => this.audio.play(id),
      areaAttack: (x, z, radius) => this.combos.areaAttack(this.elapsed, this.stackedAtBarricades(x, z, radius), x, z),
      markasHealed: () => this.combos.markasHealed(this.elapsed, this.markas.box.cx, this.markas.box.cz),
    };
  }

  /** Jumlah pemain manusia (bukan bot). */
  get humanCount(): number {
    return this._activePlayers.filter((p) => !p.isBot).length;
  }

  /** MVP permainan: peran dengan kontribusi berbobot terbesar. */
  get mvp(): { role: RoleId; points: number } | null {
    return this.contributions.mvp(
      this._activePlayers.map((p) => p.role.id),
      GAME_RULES.mvp,
    );
  }

  /** Pemain yang ikut bermain, urut slot. */
  get activePlayers(): readonly Player[] {
    return this._activePlayers;
  }

  get currentAssignments(): readonly Assignment[] {
    return this.assignments;
  }

  get level(): LevelData {
    return LEVELS[this.levelIndex];
  }

  /** Indeks level berikutnya yang bisa dimainkan, atau null jika ini level terakhir. */
  get nextLevelIndex(): number | null {
    for (let i = this.levelIndex + 1; i < LEVELS.length; i++) if (LEVELS[i].playable !== false) return i;
    return null;
  }

  /** Teks banner HUD: pengumuman (prioritas) atau petunjuk tutorial. */
  get bannerText(): string | null {
    return this.announcement ?? this.hints.text;
  }

  abilityOf(p: Player): RoleAbility {
    const a = this.abilities.get(p.role.id);
    if (!a) throw new Error(`Skill peran tidak ada: ${p.role.id}`);
    return a;
  }

  /** Ambil (dan kosongkan) combo baru untuk teks COMBO di HUD. */
  takeComboPopups(): ComboEvent[] {
    const out = this.comboPopups;
    this.comboPopups = [];
    return out;
  }

  /** Ambil (dan kosongkan) pesan untuk HUD. */
  takeNotices(): Notice[] {
    const out = this.notices;
    this.notices = [];
    return out;
  }

  /** Permainan baru dengan pembagian peran ini, mulai dari level `levelIndex` (default Level 1). */
  startRun(assignments: Assignment[], levelIndex = 0): void {
    this.assignments = [...assignments].sort((a, b) => a.slot - b.slot);
    for (const p of this.players) p.deactivate();
    this.bots.clear();
    this._activePlayers = this.assignments.map(({ slot, roleId, bot }) => {
      const p = this.playerOf(roleId);
      p.activate(slot, PLAYER_SPAWNS[slot], bot === true);
      if (bot) this.bots.set(roleId, new BotBrain(p, GAME_RULES.bots));
      return p;
    });
    this.score.reset();
    this.contributions.reset();
    this.startLevel(levelIndex);
  }

  /** Muat level: tata letak arena, titik spawn, gelombang (dengan pengali jumlah pemain), lalu mulai. */
  startLevel(index: number): void {
    this.levelIndex = index;
    const level = this.level;
    this.arena.setLayout(level.arena.id);
    this.enemies.setSpawnPoints(Object.values(level.spawnPoints));
    // Kesulitan mengikuti jumlah pemain MANUSIA (bot tidak dihitung).
    this.levels.load(level, scalingFor(this.humanCount));
    this.contributions.saveCheckpoint();
    this.resetLevelState();
  }

  /** Coba Lagi: ulangi level yang sama (kontribusi kembali ke awal level, skor level sebelumnya tetap). */
  retryLevel(): void {
    this.contributions.restoreCheckpoint();
    this.startLevel(this.levelIndex);
  }

  /** Keluar dari permainan (kembali ke pilih peran). */
  stop(): void {
    this.setTestMode(false);
    this.resetLevelState();
    this.hints.stop();
    for (const p of this.players) p.deactivate();
    this._activePlayers = [];
    this.assignments = [];
  }

  /** Benchmark: musuh selalu penuh, markas & pemain kebal, gelombang berhenti, koin tak terbatas. */
  setBenchmarkMode(on: boolean): void {
    this.benchmark = on;
    this.enemies.setFill(on ? this.fillTypes : null);
    this.levels.paused = on || this.testMode;
    this.markas.invulnerable = on;
    for (const p of this.players) p.invulnerable = on;
    if (on) this.hints.stop();
  }

  // --- Mode uji skill (tanpa menunggu gelombang) ---

  setTestMode(on: boolean): void {
    if (on === this.testMode) return;
    this.testMode = on;
    this.levels.paused = on || this.benchmark;
    if (on) this.coinCount += GAME_RULES.testMode.startCoins;
  }

  /** Munculkan sekelompok musuh; jenisnya bergiliran (Tikus, Hantu, Pencuri). */
  testSpawnGroup(): void {
    const type = REGULAR_ENEMIES[this.testTypeCursor++ % REGULAR_ENEMIES.length];
    this.enemies.spawnGroup(type.id, GAME_RULES.testMode.spawnGroup);
    this.announce(`Mode uji: ${type.name} muncul`);
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
    this.announceTimer = Math.max(0, this.announceTimer - dt);
    if (this.announceTimer <= 0) this.announcement = null;
    // Saat kalah/menang dunia membeku; hanya efek yang menyelesaikan animasinya.
    if (this.state !== "main") {
      this.effects.update(dt);
      return;
    }
    this.bossImmuneFlash = Math.max(0, this.bossImmuneFlash - dt);
    if (this.benchmark) {
      this.coinCount = BENCHMARK_COINS;
      this.keepBenchmarkBoss();
    }
    this.elapsed += dt;
    this.levels.update(dt);

    for (const p of this._activePlayers) {
      // Bot menghasilkan input sendiri; manusia dari keyboard/gamepad slotnya.
      const brain = p.isBot ? this.bots.get(p.role.id) : undefined;
      brain?.think(this.botWorld);
      const input = brain ? brain.input : this.input.getState(p.slot);
      const presses = brain ? brain.presses : this.input.getPresses(p.slot);
      p.update(dt, input);
      this.abilityOf(p).update(dt, p, input, presses, this.ctx);
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
    this.enemies.update(dt, this.markas, this._activePlayers, this.structures, this.coins);
    this.coins.update(dt, this._activePlayers);
    this.effects.update(dt);
    this.handleCombos();
    const boss = this.enemies.boss;
    if (boss && !this.bossAnnounced && !this.benchmark) {
      this.bossAnnounced = true;
      this.audio.play("boss");
      this.audio.setMood("boss");
      this.announce(`${boss.data?.name ?? "Boss"} datang! Jebak dulu, baru serang!`);
    }
    this.hints.update(dt, {
      time: this.elapsed,
      wavesStarted: this.levels.wavesStarted,
      coinCount: this.coinCount,
      players: this._activePlayers,
      enemies: this.enemies,
      coins: this.coins,
      markas: this.markas,
      input: this.input,
    });

    if (this.markas.destroyed) {
      this.state = "kalah";
      this.hints.stop();
      this.audio.play("kalah");
      this.audio.setMood("menu");
    } else if (this.levels.complete && !this.testMode && !this.benchmark) {
      this.lastLevelScore = this.score.compute(this.level.name, this.markas.hp, this.combos.count, this.elapsed, this.level.parTimeSec);
      this.score.commit(this.lastLevelScore);
      this.state = "menang";
      this.hints.stop();
      this.audio.play("menang");
      this.audio.setMood("menu");
    }
  }

  /** Combo baru: efek visual singkat, suara, guncangan kecil, lalu antre untuk teks COMBO di HUD. */
  private handleCombos(): void {
    for (const c of this.combos.take()) {
      this.effects.areaBlast(c.x, c.z, 2.5, RING_COLORS.trap);
      this.effects.rise(c.x, 0.5, c.z, 10, FX_COMBO, 1.2, 0.9, 0.16);
      this.audio.play("combo");
      this.arena.shake(...SHAKE_COMBO);
      this.comboPopups.push(c);
    }
  }

  /** Jumlah musuh dalam radius serangan yang sedang menumpuk di barikade. */
  private stackedAtBarricades(x: number, z: number, radius: number): number {
    const near = GAME_RULES.combos.barricadeStackRadius;
    let n = 0;
    for (const e of this.enemies.pool) {
      if (!e.active || Math.hypot(e.position.x - x, e.position.z - z) > radius + e.radius) continue;
      if (this.structures.barricades.some((b) => b.active && distanceToObb(e.position.x, e.position.z, b) <= near + e.radius)) n++;
    }
    return n;
  }

  private resetLevelState(): void {
    this.state = "main";
    this.combos.reset();
    this.comboPopups = [];
    this.audio.setMood(this.benchmark ? "diam" : "main");
    this.coinCount = this.testMode ? GAME_RULES.testMode.startCoins : 0;
    this.kills = 0;
    this.elapsed = 0;
    this.notices = [];
    this.announcement = null;
    this.lastLevelScore = null;
    this.bossAnnounced = false;
    this.bossImmuneFlash = 0;
    this.markas.reset();
    this.enemies.reset();
    this.projectiles.reset();
    this.coins.reset();
    this.effects.reset();
    this.structures.reset();
    this.levels.reset();
    this.levels.paused = this.testMode || this.benchmark;
    this.enemies.setFill(this.benchmark ? this.fillTypes : null);
    for (const p of this._activePlayers) {
      p.reset(PLAYER_SPAWNS[p.slot]);
      this.abilityOf(p).reset();
    }
    if (this.level.tutorial && !this.benchmark) {
      this.hints.start(this.level.hints, this._activePlayers.filter((p) => !p.isBot)); // petunjuk hanya untuk manusia
    }
    else this.hints.stop();
  }

  /** Benchmark: musuh biasa level ini untuk mengisi pool (boss dimunculkan sendiri, satu saja). */
  private get fillTypes(): string[] {
    return this.levels.enemyTypes.filter((id) => REGULAR_IDS.has(id));
  }

  /** Benchmark di level ber-boss: pastikan satu boss selalu aktif. */
  private keepBenchmarkBoss(): void {
    const bossType = this.levels.enemyTypes.find((id) => !REGULAR_IDS.has(id));
    if (!bossType || this.enemies.boss) return;
    const [x, z] = this.levels.spawnPoints[0] ?? [0, ARENA.halfDepth];
    this.enemies.spawnAt(bossType, x, z);
  }

  private announce(text: string): void {
    this.announcement = text;
    this.announceTimer = ANNOUNCE_SEC;
  }

  /** Teman yang berdiri di dekat pemain jatuh mengisi bar revive; jika ditinggal, bar turun perlahan. */
  private updateRevive(dt: number): void {
    const r = GAME_RULES.revive;
    for (const p of this._activePlayers) {
      if (!p.downed) continue;
      const helpers = this._activePlayers.filter(
        (q) => q !== p && !q.downed && Math.hypot(q.position.x - p.position.x, q.position.z - p.position.z) <= r.radius,
      );
      const rate = (helpers.length > 0 ? 1 : -r.decayPerSec) / r.durationSec;
      p.reviveProgress = Math.max(0, Math.min(1, p.reviveProgress + rate * dt));
      if (p.reviveProgress >= 1) {
        p.revive(r.hpFraction);
        this.audio.play("revive");
        for (const h of helpers) this.contributions.add(h.role.id, "revives");
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
