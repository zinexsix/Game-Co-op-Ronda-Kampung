import { PLAYER_BINDINGS } from "../config/controls";
import { getRole, type FlowRules, type HintData } from "../data/types";
import type { Markas } from "../entities/Markas";
import type { Player } from "../entities/Player";
import type { CoinManager } from "./CoinManager";
import type { EnemyManager } from "./EnemyManager";
import type { InputManager } from "./InputManager";

/** Keadaan permainan yang dibaca untuk memutuskan kapan petunjuk relevan. */
export interface HintContext {
  time: number;
  wavesStarted: number;
  coinCount: number;
  players: readonly Player[];
  enemies: EnemyManager;
  coins: CoinManager;
  markas: Markas;
  input: InputManager;
}

interface PendingHint {
  data: HintData;
  /** Pemain pemilik peran (untuk petunjuk skill). */
  player: Player | null;
  done: boolean;
}

const AREA_CROWD = 3;
const LURE_CROWD = 2;
const SHIELD_DANGER_RADIUS = 3;

/**
 * Petunjuk singkat Level 1 (maks satu kalimat per skill), muncul sekali saat konteksnya tepat.
 * Petunjuk skill dilewati jika pemain sudah memakai skill itu, dan hilang begitu skill dipakai.
 */
export class TutorialHints {
  private hints: PendingHint[] = [];
  private current: PendingHint | null = null;
  private showTimer = 0;
  private gapTimer = 0;
  private readonly conditions: Record<string, (c: HintContext, p: Player | null) => boolean>;

  constructor(private readonly flow: FlowRules) {
    const areaRadius = getRole("penyerang").skills[1].radius ?? 0;
    const lureRadius = getRole("penjaga").skills[1].radius ?? 0;
    const barricadeCost = getRole("pembangun").skills[0].coinCost ?? 0;
    const trapCost = getRole("pembangun").skills[1].coinCost ?? 0;
    const healRadius = getRole("penyembuh").skills[0].radius ?? 0;
    this.conditions = {
      mulai: (c) => c.time > 0.5,
      koin: (c) => c.coins.activeCount > 0,
      tembak: (c) => c.enemies.activeCount > 0,
      area: (c, p) => !!p && c.enemies.countWithin(p.position.x, p.position.z, areaRadius) >= AREA_CROWD,
      perisai: (c, p) => !!p && c.enemies.countWithin(p.position.x, p.position.z, SHIELD_DANGER_RADIUS) >= 1,
      pancing: (c, p) => !!p && c.enemies.countWithin(p.position.x, p.position.z, lureRadius) >= LURE_CROWD,
      barikade: (c) => c.coinCount >= barricadeCost,
      jebakan: (c) => c.coinCount >= trapCost,
      heal: (c, p) =>
        !!p &&
        (c.markas.hp < c.markas.maxHp ||
          c.players.some((q) => q !== p && q.injured && !q.downed && dist(p, q) <= healRadius)),
      buff: (c) => c.wavesStarted >= 2,
      revive: (c) => c.players.some((q) => q.downed),
    };
  }

  /** Mulai petunjuk untuk level ini (kosong jika level tidak punya tutorial). */
  start(hints: readonly HintData[] | undefined, players: readonly Player[]): void {
    this.current = null;
    this.showTimer = 0;
    this.gapTimer = 0;
    this.hints = (hints ?? [])
      .map((data) => ({ data, player: data.role ? (players.find((p) => p.role.id === data.role) ?? null) : null, done: false }))
      // Petunjuk skill hanya jika peran itu dimainkan.
      .filter((h) => !h.data.role || h.player !== null);
  }

  stop(): void {
    this.hints = [];
    this.current = null;
  }

  /** Teks petunjuk yang sedang tampil (null jika tidak ada). */
  get text(): string | null {
    return this.current ? format(this.current) : null;
  }

  update(dt: number, c: HintContext): void {
    // Skill yang sudah dipakai tidak perlu diajarkan; petunjuk yang sedang tampil langsung hilang.
    for (const h of this.hints) {
      if (h.done || !h.player || !h.data.skill) continue;
      const press = c.input.getPresses(h.player.slot);
      if ((h.data.skill === 1 && press.skill1) || (h.data.skill === 2 && press.skill2)) {
        h.done = true;
        if (this.current === h) this.hide();
      }
    }

    if (this.current) {
      this.showTimer -= dt;
      if (this.showTimer <= 0) this.hide();
      return;
    }
    if (this.gapTimer > 0) {
      this.gapTimer -= dt;
      return;
    }
    const next = this.hints.find((h) => !h.done && (this.conditions[h.data.id]?.(c, h.player) ?? false));
    if (next) {
      next.done = true;
      this.current = next;
      this.showTimer = this.flow.hintSec;
    }
  }

  private hide(): void {
    this.current = null;
    this.gapTimer = this.flow.hintGapSec;
  }
}

/** Ganti {P} dengan "P1".."P4" dan {K} dengan label tombol skill pemain itu. */
function format(h: PendingHint): string {
  const p = h.player;
  if (!p) return h.data.text;
  const b = PLAYER_BINDINGS[p.slot];
  const key = h.data.skill === 2 ? b.skill2Label : b.skill1Label;
  return h.data.text.replace("{P}", `P${p.slot + 1}`).replace("{K}", key);
}

function dist(a: Player, b: Player): number {
  return Math.hypot(a.position.x - b.position.x, a.position.z - b.position.z);
}

