import { Color3, MeshBuilder, StandardMaterial, type Mesh, type Scene } from "@babylonjs/core";
import type { RoleData } from "../data/types";
import type { Player } from "../entities/Player";
import { RING_COLORS, createGroundRing } from "../systems/Effects";
import type { PlayerInputState, PlayerPresses } from "../systems/InputManager";
import { need, skillStatus, tickCooldowns, type CombatContext, type RoleAbility, type SkillStatus } from "./RoleAbility";

const SHIELD_PULSE_RATE = 8;
/** Perisai dimiringkan agar permukaannya terlihat jelas dari kamera atas. */
const SHIELD_TILT = 0.7;
const LURE_RING_PULSE_RATE = 5;

/**
 * Penjaga.
 * Skill 1 Perisai: blokir serangan dari arah hadap selama beberapa detik (perisai biru di depan).
 * Skill 2 Pancing: musuh dalam radius mengejar Penjaga (cincin kuning di tanah selama aktif).
 */
export class PenjagaAbility implements RoleAbility {
  readonly skills: [SkillStatus, SkillStatus];
  private readonly shieldDuration: number;
  private readonly shieldCooldown: number;
  private readonly shieldArc: number;
  private readonly lureRadius: number;
  private readonly lureDuration: number;
  private readonly lureCooldown: number;
  private readonly shieldMesh: Mesh;
  private readonly shieldMat: StandardMaterial;
  private readonly lureRing: Mesh;
  private readonly lureMat: StandardMaterial;
  private lureLeft = 0;
  private time = 0;

  constructor(role: RoleData, scene: Scene, player: Player) {
    const [s1, s2] = role.skills;
    this.shieldDuration = need(s1.duration, "perisai.duration");
    this.shieldCooldown = need(s1.cooldown, "perisai.cooldown");
    this.shieldArc = need(s1.arcDeg, "perisai.arcDeg");
    this.lureRadius = need(s2.radius, "pancing.radius");
    this.lureDuration = need(s2.duration, "pancing.duration");
    this.lureCooldown = need(s2.cooldown, "pancing.cooldown");
    this.skills = [skillStatus(s1), skillStatus(s2)];

    // Perisai energi lebar di depan tubuh (anak root pemain, ikut berputar).
    this.shieldMesh = MeshBuilder.CreateBox("penjagaShield", { width: 2.0, height: 1.5, depth: 0.08 }, scene);
    this.shieldMesh.position.set(0, 0.9, player.radius + 0.55);
    this.shieldMesh.rotation.x = SHIELD_TILT;
    this.shieldMesh.parent = player.root;
    this.shieldMat = new StandardMaterial("penjagaShieldMat", scene);
    this.shieldMat.disableLighting = true;
    this.shieldMat.emissiveColor = new Color3(0.45, 0.8, 1);
    this.shieldMesh.material = this.shieldMat;

    // Cincin radius Pancing di lantai, mengikuti Penjaga.
    this.lureRing = createGroundRing("penjagaLureRing", scene, 0.05);
    this.lureRing.scaling.set(this.lureRadius, 1, this.lureRadius);
    this.lureRing.position.y = 0.06;
    this.lureRing.parent = player.root;
    this.lureMat = new StandardMaterial("penjagaLureMat", scene);
    this.lureMat.disableLighting = true;
    this.lureMat.emissiveColor = RING_COLORS.lure.clone();
    this.lureRing.material = this.lureMat;

    for (const m of [this.shieldMesh, this.lureRing]) {
      m.isPickable = false;
      m.setEnabled(false);
    }
  }

  update(dt: number, player: Player, _input: PlayerInputState, presses: PlayerPresses, ctx: CombatContext): void {
    const [shield, lure] = this.skills;
    this.time += dt;
    tickCooldowns(this.skills, dt);
    this.lureLeft = Math.max(0, this.lureLeft - dt);

    if (!player.downed) {
      if (presses.skill1 && shield.cooldownLeft <= 0) {
        shield.cooldownLeft = this.shieldCooldown;
        player.raiseShield(this.shieldDuration, this.shieldArc);
      }
      if (presses.skill2 && lure.cooldownLeft <= 0) {
        lure.cooldownLeft = this.lureCooldown;
        this.lureLeft = this.lureDuration;
        const { x, z } = player.position;
        ctx.enemies.lureWithin(x, z, this.lureRadius, player, this.lureDuration);
        ctx.effects.areaBlast(x, z, this.lureRadius, RING_COLORS.lure);
      }
    } else {
      this.lureLeft = 0;
    }

    shield.active = player.shieldTimer > 0;
    lure.active = this.lureLeft > 0;
    this.shieldMesh.setEnabled(shield.active);
    if (shield.active) this.shieldMat.alpha = 0.7 + 0.15 * Math.sin(this.time * SHIELD_PULSE_RATE);
    this.lureRing.setEnabled(lure.active);
    if (lure.active) this.lureMat.alpha = 0.55 + 0.35 * Math.sin(this.time * LURE_RING_PULSE_RATE);
  }

  reset(): void {
    this.lureLeft = 0;
    for (const s of this.skills) {
      s.cooldownLeft = 0;
      s.active = false;
    }
    this.shieldMesh.setEnabled(false);
    this.lureRing.setEnabled(false);
  }

  clearCooldowns(): void {
    for (const s of this.skills) s.cooldownLeft = 0;
  }
}
