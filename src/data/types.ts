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

export interface EnemyData {
  id: string;
  name: string;
  hp: number;
  speed: number;
  color: string;
  size: number;
  target: string;
  /** Damage ke markas per serangan. */
  baseDamage: number;
  /** Damage ke pemain per gigitan. */
  playerDamage: number;
  /** Jeda antar serangan (detik). */
  attackInterval: number;
  /** Jarak serang dari tepi tubuh ke sasaran. */
  attackRange: number;
  coinDrop: number;
  phases?: number;
}

export interface WaveData {
  enemyType: string;
  count: number;
  spawnInterval: number;
  breakSec: number;
  firstDelaySec: number;
  spawnJitter: number;
  spawnPoints: [number, number][];
}

export interface LevelData {
  id: number;
  name: string;
  area: string;
  durationSec: number;
  enemyTypes: string[];
  waves?: number;
  boss?: string;
  tutorial?: boolean;
}

export interface GameRules {
  markas: { hp: number };
  coins: { maxOnGround: number; pickupRadius: number; lifetimeSec: number; scatter: number };
  player: { hitInvulnSec: number };
  roleSelect: { minPlayers: number; startCountdownSec: number };
}

export const ROLES = rolesJson.roles as RoleData[];
export const SPEED_CLASSES = rolesJson.speedClasses as Record<SpeedClass, number>;
export const ENEMIES = enemiesJson.enemies as EnemyData[];
export const MAX_ACTIVE_ENEMIES: number = enemiesJson.maxActive;
export const LEVELS = levelsJson.levels as LevelData[];
export const TEST_WAVE = levelsJson.testWave as WaveData;
export const GAME_RULES = gameJson as GameRules;

export function getRole(id: RoleId): RoleData {
  const role = ROLES.find((r) => r.id === id);
  if (!role) throw new Error(`Peran tidak ditemukan: ${id}`);
  return role;
}

export function getEnemy(id: string): EnemyData {
  const enemy = ENEMIES.find((e) => e.id === id);
  if (!enemy) throw new Error(`Musuh tidak ditemukan: ${id}`);
  return enemy;
}
