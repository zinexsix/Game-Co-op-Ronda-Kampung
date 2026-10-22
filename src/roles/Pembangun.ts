import { Color4 } from "@babylonjs/core";
import type { RoleData } from "../data/types";
import type { Player } from "../entities/Player";
import type { PlayerInputState, PlayerPresses } from "../systems/InputManager";
import type { PlaceResult } from "../systems/StructureManager";
import { need, skillStatus, type CombatContext, type RoleAbility, type SkillStatus } from "./RoleAbility";

const FX_BUILD = new Color4(0.95, 0.75, 0.4, 1);

/**
 * Pembangun.
 * Skill 1 Barikade: penghalang ber-HP di depan karakter (bayar koin bersama).
 * Skill 2 Jebakan: dipasang di tanah, musuh yang menginjak terkena stun (bayar koin bersama).
 * Tanpa cooldown; dibatasi koin. Jika koin kurang, aksi ditolak dan HUD memberi tahu.
 */
export class PembangunAbility implements RoleAbility {
  readonly skills: [SkillStatus, SkillStatus];
  private readonly barricadeCost: number;
  private readonly barricadeDistance: number;
  private readonly trapCost: number;
  private readonly trapDistance: number;

  constructor(role: RoleData) {
    const [s1, s2] = role.skills;
    this.barricadeCost = need(s1.coinCost, "barikade.coinCost");
    this.barricadeDistance = need(s1.placeDistance, "barikade.placeDistance");
    this.trapCost = need(s2.coinCost, "jebakan.coinCost");
    this.trapDistance = need(s2.placeDistance, "jebakan.placeDistance");
    this.skills = [skillStatus(s1), skillStatus(s2)];
  }

  update(_dt: number, player: Player, _input: PlayerInputState, presses: PlayerPresses, ctx: CombatContext): void {
    if (player.downed) return;
    const fx = player.facingX;
    const fz = player.facingZ;
    const { x, z } = player.position;
    if (presses.skill1) {
      const d = this.barricadeDistance;
      const px = x + fx * d;
      const pz = z + fz * d;
      this.build(player, ctx, this.barricadeCost, px, pz, () => ctx.structures.placeBarricade(px, pz, fx, fz));
    }
    if (presses.skill2) {
      const d = this.trapDistance;
      const px = x + fx * d;
      const pz = z + fz * d;
      this.build(player, ctx, this.trapCost, px, pz, () => ctx.structures.placeTrap(px, pz));
    }
  }

  /** Cek koin -> pasang -> potong koin. Koin hanya dipotong jika pemasangan berhasil. */
  private build(player: Player, ctx: CombatContext, cost: number, px: number, pz: number, place: () => PlaceResult): void {
    if (ctx.coins < cost) {
      ctx.notify(player, `Koin kurang! Butuh ${cost} 🪙`, "koin");
      return;
    }
    if (place() !== "ok") {
      ctx.notify(player, "Tidak bisa dipasang di sini");
      return;
    }
    ctx.spendCoins(cost);
    ctx.effects.burst(px, 0.4, pz, 8, FX_BUILD, 3, 0.4, 0.12);
  }

  reset(): void {
    for (const s of this.skills) s.active = false;
  }

  clearCooldowns(): void {}
}
