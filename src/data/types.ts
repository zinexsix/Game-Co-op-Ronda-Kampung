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
  arena: { id: string; halfWidth: number; halfDepth: number };
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
}

export interface GameRules {
  markas: { hp: number };
  coins: { maxOnGround: number; pickupRadius: number; lifetimeSec: number; scatter: number };
  player: { hitInvulnSec: number };
  revive: { radius: number; durationSec: number; hpFraction: number; decayPerSec: number };
  testMode: { startCoins: number; addCoins: number; spawnGroup: number };
  roleSelect: { minPlayers: number; startCountdownSec: number };
}

export const ROLES = rolesJson.roles as RoleData[];
export const SPEED_CLASSES = rolesJson.speedClasses as Record<SpeedClass, number>;
export const ENEMIES = enemiesJson.enemies as EnemyData[];
export const MAX_ACTIVE_ENEMIES: number = enemiesJson.maxActive;
export const LEVELS = levelsJson.levels as unknown as LevelData[];
export const PLAYER_SCALING = levelsJson.playerScaling as unknown as Record<string, PlayerScaling>;
export const SCORE_RULES = levelsJson.score as ScoreRules;
export const FLOW_RULES = levelsJson.flow as FlowRules;
/** Musuh biasa yang punya model di Tahap 4 (boss menyusul di Tahap 5). */
export const REGULAR_ENEMIES = ENEMIES.filter((e) => e.phases === undefined);
export const GAME_RULES = gameJson as GameRules;

export function getRole(id: RoleId): RoleData {
  const role = ROLES.find((r) => r.id === id);
  if (!role) throw new Error(`Peran tidak ditemukan: ${id}`);
  return role;
}

/** Pengali kesulitan untuk jumlah pemain manusia (dibatasi ke 2-4). */
export function scalingFor(humans: number): PlayerScaling {
  const n = Math.max(2, Math.min(4, humans));
  return PLAYER_SCALING[String(n)];
}

export function getEnemy(id: string): EnemyData {
  const enemy = ENEMIES.find((e) => e.id === id);
  if (!enemy) throw new Error(`Musuh tidak ditemukan: ${id}`);
  return enemy;
}
