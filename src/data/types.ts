// Tipe data untuk file JSON di folder ini, plus akses bertipe.
import rolesJson from "./roles.json";
import enemiesJson from "./enemies.json";
import levelsJson from "./levels.json";
import gameJson from "./game.json";

export type RoleId = "penjaga" | "pembangun" | "penyerang" | "penyembuh";
export type SpeedClass = "lambat" | "sedang" | "cepat";

export interface SkillData {
  id: string;
  name: string;
  cooldown?: number;
  duration?: number;
  radius?: number;
  coinCost?: number;
  speedBonus?: number;
  damage?: number;
  /** Serangan beruntun: jeda antar tembakan (detik). */
  fireInterval?: number;
  projectileSpeed?: number;
  range?: number;
  /** Perisai: lebar sudut blokir di depan (derajat). */
  arcDeg?: number;
  /** Barikade / jebakan. */
  hp?: number;
  width?: number;
  depth?: number;
  placeDistance?: number;
  maxActive?: number;
  triggerRadius?: number;
  charges?: number;
  rearmSec?: number;
  /** Heal. */
  healPlayer?: number;
  healMarkas?: number;
  /** Ikon skill di HUD. */
  icon?: string;
  /** Serangan Cepat: jarak keluarnya proyektil di depan tubuh & tambahan radius kena. */
  muzzleOffset?: number;
  hitThickness?: number;
  /** Barikade: jarak bebas minimal dari pos ronda saat memasang. */
  placeClearance?: number;
  note?: string;
}

export interface RoleData {
  id: RoleId;
  name: string;
  icon: string;
  description: string;
  hp: number;
  speedClass: SpeedClass;
  damage: string;
  color: string;
  skills: [SkillData, SkillData];
}

/** Sasaran utama musuh: pos ronda, pemain terdekat, atau koin di tanah. */
export type EnemyTarget = "markas" | "pemain" | "koin";

export interface EnemyData {
  id: string;
  name: string;
  hp: number;
  speed: number;
  color: string;
  size: number;
  target: EnemyTarget;
  /** Damage ke markas per serangan. */
  baseDamage: number;
  /** Damage ke pemain per gigitan. */
  playerDamage: number;
  /** Jeda antar serangan (detik). */
  attackInterval: number;
  /** Jarak serang dari tepi tubuh ke sasaran. */
  attackRange: number;
  coinDrop: number;
  /** Damage ke barikade per gigitan. */
  barricadeDamage: number;
  /** 0-1: jika posisi musuh sejauh ini dari tengah barikade (relatif setengah lebar), ia memutar; selain itu menggigit. */
  barricadeBypass: number;
  /** Menembus barikade (Hantu Iseng). */
  passesBarricades?: boolean;
  /** Pencuri: jumlah koin yang dicuri sebelum kabur. */
  carryMax?: number;
  /** Pencuri: pengali kecepatan saat kabur. */
  fleeSpeedMult?: number;
  /** Pengali lama efek Pancing (Pencuri mudah dipancing). */
  lureMultiplier?: number;
  phases?: number;
  /** Hanya untuk boss. */
  boss?: BossData;
}

export interface BossData {
  /** Hanya menerima damage saat terkena stun jebakan. */
  onlyDamageWhenStunned: boolean;
  /** Setelah stun selesai, kebal stun selama ini (detik). */
  stunCooldownSec: number;
  /** Koin yang masuk ke kas tim setiap kali boss terjebak (agar tim bisa membeli jebakan berikutnya). */
  coinsOnStun: number;
  /** Serangan menghantam semua pemain dalam radius ini. */
  slamRadius: number;
  /** Rasio HP batas fase 2 dan fase 3. */
  phase2At: number;
  phase3At: number;
  summonEnemy: string;
  summonCount: number;
  summonIntervalSec: number;
  enrageSpeedMult: number;
  enrageAttackMult: number;
}

/** Satu kelompok musuh dalam gelombang: muncul satu per satu dari titik bernama (bergiliran). */
export interface SpawnGroupData {
  enemy: string;
  count: number;
  interval: number;
  points: string[];
}

export interface WaveData {
  /** Detik sejak level mulai. */
  at: number;
  groups: SpawnGroupData[];
}

export interface HintData {
  id: string;
  text: string;
  role?: RoleId;
  skill?: 1 | 2;
}

export interface LevelData {
  id: number;
  name: string;
  area: string;
  /** false = belum bisa dimainkan (menyusul). */
  playable?: boolean;
  arena: { id: string; halfWidth: number; halfDepth: number; fogDensity?: number; fogColor?: string };
  /** Batas waktu untuk bonus waktu skor. */
  parTimeSec: number;
  tutorial?: boolean;
  spawnPoints: Record<string, [number, number]>;
  waves: WaveData[];
  hints?: HintData[];
}

export interface PlayerScaling {
  count: number;
  hp: number;
}

export interface ScoreRules {
  markasHpPoints: number;
  comboPoints: number;
  timeBonusPerSec: number;
}

export interface FlowRules {
  earlyNextWaveSec: number;
  screenInputDelaySec: number;
  hintSec: number;
  hintGapSec: number;
  /** Layar hasil kembali ke menu setelah sekian detik tanpa input. */
  resultIdleSec: number;
  /** Ambang pemicu petunjuk tutorial. */
  hintTriggers: { areaCrowd: number; lureCrowd: number; shieldDangerRadius: number };
}

/** Steering musuh bersama (enemies.json "ai"). */
export interface EnemyAiRules {
  separationWeight: number;
  /** Jarak tambahan antar musuh sebelum saling mendorong (m). */
  separationPadding: number;
  /** Pencuri tanpa koin berkeliaran mengitari pos: langkah sudut per keputusan (radian). */
  thiefLoiterStepRad: number;
  steerRate: number;
  blockDot: number;
  barricadeLookahead: number;
  thiefLoiterRadius: number;
  escapeMargin: number;
  spawnJitter: number;
}

export interface ComboRules {
  trapKillWindowSec: number;
  holdHealWindowSec: number;
  barricadeStackMin: number;
  barricadeStackRadius: number;
  cooldownSec: number;
}

export interface BotRules {
  homeRadius: number;
  leashRadius: number;
  lureTriggerRadius: number;
  lureMinEnemies: number;
  shieldTriggerRadius: number;
  trapMinDistance: number;
  trapPathDistance: number;
  coinCollectRadius: number;
  areaMinEnemies: number;
  healMarkasBelow: number;
  healTeammateBelow: number;
  buffMinEnemies: number;
  reviveSearchRadius: number;
  aimToleranceRad: number;
  aimInput: number;
  preferredShootDistance: number;
  /** Jarak tambahan di luar radius hantaman boss yang dijaga bot. */
  bossAvoidMargin: number;
  arriveDist: number;
  bossTrapLead: number;
  bossReachSlack: number;
  reviveStandDist: number;
  safeToReviveRadius: number;
  /** Pancing dipakai jika kerumunan dalam fraksi ini dari radius Pancing. */
  lureRangeFrac: number;
  /** Penyembuh mendekati teman kritis sampai fraksi ini dari radius Heal. */
  healApproachFrac: number;
  /** Heal pos ronda jika jarak ke pos dalam fraksi ini dari radius Heal. */
  healMarkasRangeFrac: number;
  /** Selama boss belum kalah, jebakan untuk musuh biasa hanya jika koin cukup untuk sekian jebakan. */
  bossTrapReserve: number;
  /** Posisi jaga tiap peran di sekitar pos ronda (sudut, derajat). */
  homeAnglesDeg: Record<RoleId, number>;
}

export interface GameRules {
  markas: { hp: number };
  coins: { maxOnGround: number; pickupRadius: number; lifetimeSec: number; scatter: number; pickupDelaySec: number };
  player: { hitInvulnSec: number; turnSpeed: number; spawns: [number, number][] };
  revive: { radius: number; durationSec: number; hpFraction: number; decayPerSec: number };
  testMode: { startCoins: number; addCoins: number; spawnGroup: number };
  bots: BotRules;
  /** Bobot poin per jenis kontribusi (MVP). */
  mvp: Record<string, number>;
  combos: ComboRules;
  audio: { master: number; music: number; sfx: number };
  idle: { resetToMenuSec: number; warnSec: number };
  autoQuality: { minFps: number; sampleSec: number; renderScaleSteps: number[] };
  roleSelect: { minPlayers: number; startCountdownSec: number };
}

export const ROLES = rolesJson.roles as RoleData[];
export const SPEED_CLASSES = rolesJson.speedClasses as Record<SpeedClass, number>;
export const ENEMIES = enemiesJson.enemies as EnemyData[];
export const MAX_ACTIVE_ENEMIES: number = enemiesJson.maxActive;
export const ENEMY_AI = enemiesJson.ai as EnemyAiRules;
export const LEVELS = levelsJson.levels as unknown as LevelData[];
export const PLAYER_SCALING = levelsJson.playerScaling as unknown as Record<string, PlayerScaling>;
export const SCORE_RULES = levelsJson.score as ScoreRules;
export const FLOW_RULES = levelsJson.flow as FlowRules;
/** Musuh biasa (bukan boss): dipakai mode uji & isi benchmark. */
export const REGULAR_ENEMIES = ENEMIES.filter((e) => !e.boss);
export const GAME_RULES = gameJson as unknown as GameRules;

export function getRole(id: RoleId): RoleData {
  const role = ROLES.find((r) => r.id === id);
  if (!role) throw new Error(`Peran tidak ditemukan: ${id}`);
  return role;
}

/** Pengali kesulitan untuk jumlah pemain manusia (1 = solo bersama bot, dibatasi ke 1-4). */
export function scalingFor(humans: number): PlayerScaling {
  const n = Math.max(1, Math.min(4, humans));
  return PLAYER_SCALING[String(n)];
}

export function getEnemy(id: string): EnemyData {
  const enemy = ENEMIES.find((e) => e.id === id);
  if (!enemy) throw new Error(`Musuh tidak ditemukan: ${id}`);
  return enemy;
}
