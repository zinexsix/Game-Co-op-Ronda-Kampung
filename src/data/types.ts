// Tipe data untuk file JSON di folder ini, plus akses bertipe.
import rolesJson from "./roles.json";
import enemiesJson from "./enemies.json";
import levelsJson from "./levels.json";

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
  note?: string;
}

export interface RoleData {
  id: RoleId;
  name: string;
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
  damage: number;
  color: string;
  size: number;
  target: string;
  phases?: number;
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

export const ROLES = rolesJson.roles as RoleData[];
export const SPEED_CLASSES = rolesJson.speedClasses as Record<SpeedClass, number>;
export const ENEMIES = enemiesJson.enemies as EnemyData[];
export const MAX_ACTIVE_ENEMIES: number = enemiesJson.maxActive;
export const LEVELS = levelsJson.levels as LevelData[];

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
