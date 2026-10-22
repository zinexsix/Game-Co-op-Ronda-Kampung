import {
  Color3,
  MeshBuilder,
  Scalar,
  StandardMaterial,
  TransformNode,
  Vector3,
  type AbstractMesh,
  type Scene,
} from "@babylonjs/core";
import { GAME_RULES, SPEED_CLASSES, type RoleData } from "../data/types";
import type { PlayerInputState } from "../systems/InputManager";

const TURN_SPEED = 14; // rad/detik, kecepatan berputar menghadap arah gerak
const HIT_FLASH_SEC = 0.18; // lama kilatan merah saat terkena serangan
const HIT_FLASH_COLOR = new Color3(1, 0.25, 0.2);
const DOWNED_RING_COLOR = new Color3(0.25, 0.25, 0.28);
const BUFF_RING_COLOR = new Color3(0.3, 0.85, 1);
const BUFF_PULSE_RATE = 10;

/** Hasil serangan ke pemain. */
export type DamageResult = "kena" | "diblokir" | "diabaikan";

/**
 * Karakter pemain placeholder: kapsul berwarna + penanda hadap + aksesori siluet per peran.
 * Satu objek per peran dibuat sekali di awal; pertandingan hanya mengaktifkan yang dipilih.
 */
export class Player {
  readonly root: TransformNode;
  /** Bagian tubuh (tanpa alas lingkaran) supaya bisa direbahkan saat jatuh. */
  private readonly body: TransformNode;
  readonly meshes: AbstractMesh[] = [];
  readonly radius: number;
  readonly speed: number;
  readonly maxHp: number;
  /** Slot input (0-3 = P1-P4). -1 jika peran ini tidak dipakai. */
  slot = -1;
  hp: number;
  /** HP 0: tidak bisa bergerak/menyerang, diabaikan musuh (revive di Tahap 3). */
  downed = false;
  /** Untuk benchmark: tidak bisa terluka. */
  invulnerable = false;
  /** Arah hadap (radian, 0 = +Z). */
  yaw = 0;
  /** Progres revive 0-1 saat jatuh (teman berdiri di dekat). */
  reviveProgress = 0;
  /** Sisa waktu perisai aktif (detik); blokir serangan dari depan. */
  shieldTimer = 0;
  /** cos(setengah sudut perisai): serangan dengan arah di dalam sudut ini diblokir. */
  private shieldCos = 1;
  /** Buff kecepatan dari Penyembuh. */
  buffTimer = 0;
  private buffBonus = 0;
  private time = 0;
  /** Input terakhir yang diterima (dipakai layar debug). */
  lastInput: PlayerInputState = { moveX: 0, moveZ: 0, skill1: false, skill2: false, connected: true };
  private invulnTimer = 0;
  private flashTimer = 0;
  private readonly bodyMat: StandardMaterial;
  private readonly ringMat: StandardMaterial;
  private readonly baseEmissive: Color3;
  private readonly ringColor: Color3;
  private readonly bodyLift: number;

  constructor(
    scene: Scene,
    readonly role: RoleData,
  ) {
    const id = role.id;
    this.root = new TransformNode(`player_${id}`, scene);
    this.body = new TransformNode(`playerBodyNode_${id}`, scene);
    this.body.parent = this.root;
    this.speed = SPEED_CLASSES[role.speedClass];
    this.maxHp = role.hp;
    this.hp = role.hp;

    const color = Color3.FromHexString(role.color);
    const bodyMat = new StandardMaterial(`playerMat_${id}`, scene);
    bodyMat.diffuseColor = color;
    bodyMat.emissiveColor = color.scale(0.25); // tetap terbaca di suasana malam
    bodyMat.specularColor = Color3.Black();
    this.bodyMat = bodyMat;
    this.baseEmissive = bodyMat.emissiveColor.clone();

    const accentMat = new StandardMaterial(`playerAccent_${id}`, scene);
    accentMat.diffuseColor = new Color3(0.95, 0.95, 0.9);
    accentMat.emissiveColor = new Color3(0.4, 0.4, 0.35);
    accentMat.specularColor = Color3.Black();

    // Siluet berbeda per peran (dimensi kapsul + aksesori).
    const shape = SILHOUETTES[role.id];
    this.radius = shape.radius;
    this.bodyLift = shape.radius;

    const body = MeshBuilder.CreateCapsule(
      `playerBody_${id}`,
      { radius: shape.radius, height: shape.height, tessellation: 12, subdivisions: 1, capSubdivisions: 4 },
      scene,
    );
    body.position.y = shape.height / 2;
    body.material = bodyMat;
    body.parent = this.body;
    this.meshes.push(body);

    // Penanda hadap: "hidung" kotak di depan setinggi dada.
    const nose = MeshBuilder.CreateBox(`playerNose_${id}`, { width: 0.22, height: 0.22, depth: 0.45 }, scene);
    nose.position.set(0, shape.height * 0.62, shape.radius + 0.12);
    nose.material = accentMat;
    nose.parent = this.body;
    this.meshes.push(nose);

    const accessory = shape.accessory(scene, id, shape);
    accessory.material = bodyMat;
    accessory.parent = this.body;
    this.meshes.push(accessory);

    // Alas lingkaran di lantai: penanda pemain yang jelas dari kamera atas (20 segitiga).
    const ring = MeshBuilder.CreateDisc(`playerRing_${id}`, { radius: shape.radius + 0.3, tessellation: 20 }, scene);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.03;
    const ringMat = new StandardMaterial(`playerRingMat_${id}`, scene);
    this.ringColor = color.scale(0.55);
    ringMat.emissiveColor = this.ringColor.clone();
    ringMat.disableLighting = true;
    ring.material = ringMat;
    ring.parent = this.root;
    this.ringMat = ringMat;
    this.meshes.push(ring);

    for (const m of this.meshes) m.isPickable = false;
    this.root.setEnabled(false);
  }

  get position(): Vector3 {
    return this.root.position;
  }

  get injured(): boolean {
    return this.hp < this.maxHp;
  }

  /** Kecepatan gerak saat ini (termasuk buff). */
  get currentSpeed(): number {
    return this.speed * (1 + (this.buffTimer > 0 ? this.buffBonus : 0));
  }

  get active(): boolean {
    return this.slot >= 0;
  }

  /** Arah hadap sebagai vektor satuan di bidang X-Z. */
  get facingX(): number {
    return Math.sin(this.yaw);
  }

  get facingZ(): number {
    return Math.cos(this.yaw);
  }

  /** Pakai peran ini untuk slot input tertentu dan taruh di titik awal. */
  activate(slot: number, spawn: Vector3): void {
    this.slot = slot;
    this.root.setEnabled(true);
    this.reset(spawn);
  }

  deactivate(): void {
    this.slot = -1;
    this.root.setEnabled(false);
  }

  /** Kembalikan ke kondisi awal pertandingan. */
  reset(spawn: Vector3): void {
    this.root.position.copyFrom(spawn);
    this.hp = this.maxHp;
    this.invulnTimer = 0;
    this.flashTimer = 0;
    this.shieldTimer = 0;
    this.buffTimer = 0;
    this.reviveProgress = 0;
    // Hadap ke pos ronda di tengah arena.
    this.yaw = Math.atan2(-spawn.x, -spawn.z);
    this.root.rotation.y = this.yaw;
    this.setDowned(false);
  }

  /**
   * Terima damage dari penyerang di (fromX, fromZ). Perisai aktif memblokir serangan
   * yang datang dari arah hadap (di dalam sudut perisai).
   */
  takeDamage(amount: number, fromX: number, fromZ: number): DamageResult {
    if (this.downed || this.invulnTimer > 0) return "diabaikan";
    if (this.shieldTimer > 0) {
      const dx = fromX - this.position.x;
      const dz = fromZ - this.position.z;
      const len = Math.hypot(dx, dz) || 1;
      if ((dx * this.facingX + dz * this.facingZ) / len >= this.shieldCos) return "diblokir";
    }
    this.invulnTimer = GAME_RULES.player.hitInvulnSec;
    this.flashTimer = HIT_FLASH_SEC;
    if (this.invulnerable) return "kena";
    this.hp = Math.max(0, this.hp - amount);
    if (this.hp <= 0) this.setDowned(true);
    return "kena";
  }

  /** Pasang perisai selama `duration` detik dengan lebar sudut `arcDeg`. */
  raiseShield(duration: number, arcDeg: number): void {
    this.shieldTimer = duration;
    this.shieldCos = Math.cos(((arcDeg / 2) * Math.PI) / 180);
  }

  /** Pulihkan HP; mengembalikan jumlah yang benar-benar dipulihkan. */
  heal(amount: number): number {
    if (this.downed) return 0;
    const before = this.hp;
    this.hp = Math.min(this.maxHp, this.hp + amount);
    return this.hp - before;
  }

  applySpeedBuff(bonus: number, duration: number): void {
    this.buffBonus = bonus;
    this.buffTimer = duration;
  }

  /** Langsung jatuh (mode uji revive). */
  knockDown(): void {
    if (this.downed) return;
    this.hp = 0;
    this.setDowned(true);
  }

  /** Bangkit dari status jatuh dengan sebagian HP. */
  revive(hpFraction: number): void {
    this.hp = Math.max(1, Math.round(this.maxHp * hpFraction));
    this.reviveProgress = 0;
    this.invulnTimer = GAME_RULES.player.hitInvulnSec;
    this.setDowned(false);
  }

  /** Gerak di bidang X-Z berdasarkan input. Tabrakan diselesaikan terpisah oleh Collision. */
  update(dt: number, input: PlayerInputState): void {
    this.lastInput = input;
    this.time += dt;
    this.invulnTimer = Math.max(0, this.invulnTimer - dt);
    this.shieldTimer = Math.max(0, this.shieldTimer - dt);
    this.buffTimer = Math.max(0, this.buffTimer - dt);
    this.updateFlash(dt);
    this.updateRing();
    if (this.downed) return;

    const len = Math.hypot(input.moveX, input.moveZ);
    if (len > 0.01) {
      const k = Math.min(1, len); // input analog: gerak pelan jika stik sedikit
      const nx = input.moveX / len;
      const nz = input.moveZ / len;
      const speed = this.currentSpeed;
      this.root.position.x += nx * speed * k * dt;
      this.root.position.z += nz * speed * k * dt;
      const targetYaw = Math.atan2(nx, nz);
      const diff = Scalar.NormalizeRadians(targetYaw - this.yaw);
      this.yaw += Math.sign(diff) * Math.min(Math.abs(diff), TURN_SPEED * dt);
      this.root.rotation.y = this.yaw;
    }
  }

  /** Total segitiga karakter (untuk cek anggaran 800). */
  get triangleCount(): number {
    return this.meshes.reduce((n, m) => n + m.getTotalIndices() / 3, 0);
  }

  private setDowned(downed: boolean): void {
    this.downed = downed;
    if (downed) {
      this.shieldTimer = 0;
      this.buffTimer = 0;
    }
    // Rebah ke depan; diangkat setinggi jari-jari supaya tidak tenggelam ke lantai.
    this.body.rotation.x = downed ? Math.PI / 2 : 0;
    this.body.position.y = downed ? this.bodyLift : 0;
    this.updateRing();
  }

  /** Warna alas: abu-abu saat jatuh, berdenyut biru muda saat kena buff. */
  private updateRing(): void {
    const c = this.ringMat.emissiveColor;
    if (this.downed) c.copyFrom(DOWNED_RING_COLOR);
    else if (this.buffTimer > 0) {
      const t = 0.5 + 0.5 * Math.sin(this.time * BUFF_PULSE_RATE);
      Color3.LerpToRef(this.ringColor, BUFF_RING_COLOR, 0.5 + 0.5 * t, c);
    } else c.copyFrom(this.ringColor);
  }

  private updateFlash(dt: number): void {
    if (this.flashTimer <= 0) return;
    this.flashTimer = Math.max(0, this.flashTimer - dt);
    const t = this.flashTimer / HIT_FLASH_SEC;
    Color3.LerpToRef(this.baseEmissive, HIT_FLASH_COLOR, t, this.bodyMat.emissiveColor);
  }
}

interface Silhouette {
  radius: number;
  height: number;
  accessory: (scene: Scene, id: string, s: Silhouette) => AbstractMesh;
}

const SILHOUETTES: Record<RoleData["id"], Silhouette> = {
  // Penjaga: gemuk & pendek, perisai kotak di depan.
  penjaga: {
    radius: 0.62,
    height: 1.7,
    accessory: (scene, id, s) => {
      const m = MeshBuilder.CreateBox(`acc_${id}`, { width: 1.0, height: 0.9, depth: 0.14 }, scene);
      m.position.set(0, s.height * 0.45, s.radius + 0.1);
      return m;
    },
  },
  // Pembangun: topi proyek pipih di atas kepala.
  pembangun: {
    radius: 0.5,
    height: 1.7,
    accessory: (scene, id, s) => {
      const m = MeshBuilder.CreateCylinder(`acc_${id}`, { diameter: 1.2, height: 0.14, tessellation: 10 }, scene);
      m.position.y = s.height + 0.05;
      return m;
    },
  },
  // Penyerang: ramping & tinggi, "senapan" panjang di samping kanan.
  penyerang: {
    radius: 0.42,
    height: 2.0,
    accessory: (scene, id, s) => {
      const m = MeshBuilder.CreateBox(`acc_${id}`, { width: 0.16, height: 0.16, depth: 1.1 }, scene);
      m.position.set(s.radius + 0.12, s.height * 0.5, 0.35);
      return m;
    },
  },
  // Penyembuh: bola cahaya di atas kepala.
  penyembuh: {
    radius: 0.48,
    height: 1.6,
    accessory: (scene, id, s) => {
      const m = MeshBuilder.CreateIcoSphere(`acc_${id}`, { radius: 0.3, subdivisions: 1 }, scene);
      m.position.y = s.height + 0.45;
      return m;
    },
  },
};

/** Titik awal per slot pemain (P1-P4). */
export const PLAYER_SPAWNS: Vector3[] = [
  new Vector3(-6, 0, 4),
  new Vector3(6, 0, 4),
  new Vector3(-6, 0, -4),
  new Vector3(6, 0, -4),
];
