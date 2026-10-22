import { Color4 } from "@babylonjs/core";
import type { RoleData } from "../data/types";
import type { Player } from "../entities/Player";
import { distanceToBox } from "../systems/Collision";
import { RING_COLORS } from "../systems/Effects";
import type { PlayerInputState, PlayerPresses } from "../systems/InputManager";
import { need, skillStatus, tickCooldowns, type CombatContext, type RoleAbility, type SkillStatus } from "./RoleAbility";

const FX_HEAL = new Color4(0.4, 1, 0.5, 1);
const FX_BUFF = new Color4(0.4, 0.9, 1, 1);
const HEAL_RING_RADIUS = 1.2;

/**
 * Penyembuh.
 * Skill 1 Heal: pulihkan HP teman atau pos ronda terdekat (yang terluka) dalam radius.
 * Skill 2 Buff: kecepatan seluruh tim naik sementara.
 */
export class PenyembuhAbility implements RoleAbility {
  readonly skills: [SkillStatus, SkillStatus];
  private readonly healRadius: number;
  private readonly healPlayer: number;
  private readonly healMarkas: number;
  private readonly healCooldown: number;
  private readonly buffBonus: number;
  private readonly buffDuration: number;
  private readonly buffCooldown: number;
  private buffLeft = 0;

  constructor(role: RoleData) {
    const [s1, s2] = role.skills;
    this.healRadius = need(s1.radius, "heal.radius");
    this.healPlayer = need(s1.healPlayer, "heal.healPlayer");
    this.healMarkas = need(s1.healMarkas, "heal.healMarkas");
    this.healCooldown = need(s1.cooldown, "heal.cooldown");
    this.buffBonus = need(s2.speedBonus, "buff.speedBonus");
    this.buffDuration = need(s2.duration, "buff.duration");
    this.buffCooldown = need(s2.cooldown, "buff.cooldown");
    this.skills = [skillStatus(s1), skillStatus(s2)];
  }

  update(dt: number, player: Player, _input: PlayerInputState, presses: PlayerPresses, ctx: CombatContext): void {
    const [heal, buff] = this.skills;
    tickCooldowns(this.skills, dt);
    this.buffLeft = Math.max(0, this.buffLeft - dt);
    buff.active = this.buffLeft > 0;
    if (player.downed) return;

    if (presses.skill1 && heal.cooldownLeft <= 0) {
      if (this.healNearest(player, ctx)) heal.cooldownLeft = this.healCooldown;
      else ctx.notify(player, "Tidak ada yang terluka di dekatmu");
    }

    if (presses.skill2 && buff.cooldownLeft <= 0) {
      buff.cooldownLeft = this.buffCooldown;
      this.buffLeft = this.buffDuration;
      for (const p of ctx.players) {
        if (p.downed) continue;
        p.applySpeedBuff(this.buffBonus, this.buffDuration);
        ctx.effects.areaBlast(p.position.x, p.position.z, HEAL_RING_RADIUS, RING_COLORS.buff);
        ctx.effects.rise(p.position.x, 0.3, p.position.z, 6, FX_BUFF, 0.6, 0.8, 0.12);
      }
    }
  }

  /** Pilih sasaran terluka terdekat (teman lain atau pos ronda) dalam radius. */
  private healNearest(self: Player, ctx: CombatContext): boolean {
    const { x, z } = self.position;
    let best: Player | "markas" | null = null;
    let bestDist = this.healRadius;
    for (const p of ctx.players) {
      if (p === self || p.downed || !p.injured) continue;
      const d = Math.hypot(p.position.x - x, p.position.z - z);
      if (d <= bestDist) {
        best = p;
        bestDist = d;
      }
    }
    const m = ctx.markas;
    if (m.hp < m.maxHp && !m.destroyed) {
      const d = distanceToBox(x, z, m.box);
      if (d <= bestDist) best = "markas";
    }
    if (!best) return false;

    if (best === "markas") {
      m.heal(this.healMarkas);
      const b = m.box;
      ctx.effects.areaBlast(b.cx, b.cz, b.halfX + HEAL_RING_RADIUS, RING_COLORS.heal);
      ctx.effects.rise(b.cx, 0.5, b.cz, 12, FX_HEAL, b.halfX, 1, 0.16);
    } else {
      best.heal(this.healPlayer);
      ctx.effects.areaBlast(best.position.x, best.position.z, HEAL_RING_RADIUS, RING_COLORS.heal);
      ctx.effects.rise(best.position.x, 0.3, best.position.z, 8, FX_HEAL, 0.5, 0.9, 0.14);
    }
    return true;
  }

  reset(): void {
    this.buffLeft = 0;
    for (const s of this.skills) {
      s.cooldownLeft = 0;
      s.active = false;
    }
  }

  clearCooldowns(): void {
    for (const s of this.skills) s.cooldownLeft = 0;
  }
}
