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
import { SPEED_CLASSES, type RoleData } from "../data/types";
import type { PlayerInputState } from "../systems/InputManager";

const TURN_SPEED = 14; // rad/detik, kecepatan berputar menghadap arah gerak

/** Karakter pemain placeholder: kapsul berwarna + penanda hadap + aksesori siluet per peran. */
export class Player {
  readonly root: TransformNode;
  readonly meshes: AbstractMesh[] = [];
  readonly radius: number;
  readonly speed: number;
  /** Arah hadap (radian, 0 = +Z). */
  yaw = 0;
  /** Input terakhir yang diterima (dipakai layar debug). */
  lastInput: PlayerInputState = { moveX: 0, moveZ: 0, skill1: false, skill2: false, connected: true };

  constructor(
    scene: Scene,
    readonly index: number,
    readonly role: RoleData,
    spawn: Vector3,
  ) {
    this.root = new TransformNode(`player${index}`, scene);
    this.root.position.copyFrom(spawn);
    this.speed = SPEED_CLASSES[role.speedClass];

    const color = Color3.FromHexString(role.color);
    const bodyMat = new StandardMaterial(`playerMat${index}`, scene);
    bodyMat.diffuseColor = color;
    bodyMat.emissiveColor = color.scale(0.25); // tetap terbaca di suasana malam
    bodyMat.specularColor = Color3.Black();

    const accentMat = new StandardMaterial(`playerAccent${index}`, scene);
    accentMat.diffuseColor = new Color3(0.95, 0.95, 0.9);
    accentMat.emissiveColor = new Color3(0.4, 0.4, 0.35);
    accentMat.specularColor = Color3.Black();

    // Siluet berbeda per peran (dimensi kapsul + aksesori).
    const shape = SILHOUETTES[role.id];
    this.radius = shape.radius;

    const body = MeshBuilder.CreateCapsule(
      `playerBody${index}`,
      { radius: shape.radius, height: shape.height, tessellation: 12, subdivisions: 1, capSubdivisions: 4 },
      scene,
    );
    body.position.y = shape.height / 2;
    body.material = bodyMat;
    body.parent = this.root;
    this.meshes.push(body);

    // Penanda hadap: "hidung" kotak di depan setinggi dada.
    const nose = MeshBuilder.CreateBox(`playerNose${index}`, { width: 0.22, height: 0.22, depth: 0.45 }, scene);
    nose.position.set(0, shape.height * 0.62, shape.radius + 0.12);
    nose.material = accentMat;
    nose.parent = this.root;
    this.meshes.push(nose);

    const accessory = shape.accessory(scene, index, shape);
    accessory.material = bodyMat;
    accessory.parent = this.root;
    this.meshes.push(accessory);

    // Alas lingkaran di lantai: penanda pemain yang jelas dari kamera atas (20 segitiga).
    const ring = MeshBuilder.CreateDisc(`playerRing${index}`, { radius: shape.radius + 0.3, tessellation: 20 }, scene);
    ring.rotation.x = Math.PI / 2;
    ring.position.y = 0.03;
    const ringMat = new StandardMaterial(`playerRingMat${index}`, scene);
    ringMat.emissiveColor = color.scale(0.55);
    ringMat.disableLighting = true;
    ring.material = ringMat;
    ring.parent = this.root;
    this.meshes.push(ring);

    for (const m of this.meshes) m.isPickable = false;
  }

  get position(): Vector3 {
    return this.root.position;
  }

  /** Gerak di bidang X-Z berdasarkan input. Tabrakan diselesaikan terpisah oleh Collision. */
  update(dt: number, input: PlayerInputState): void {
    this.lastInput = input;
    const len = Math.hypot(input.moveX, input.moveZ);
    if (len > 0.01) {
      const k = Math.min(1, len); // input analog: gerak pelan jika stik sedikit
      const nx = input.moveX / len;
      const nz = input.moveZ / len;
      this.root.position.x += nx * this.speed * k * dt;
      this.root.position.z += nz * this.speed * k * dt;
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
}

interface Silhouette {
  radius: number;
  height: number;
  accessory: (scene: Scene, index: number, s: Silhouette) => AbstractMesh;
}

const SILHOUETTES: Record<RoleData["id"], Silhouette> = {
  // Penjaga: gemuk & pendek, perisai kotak di depan.
  penjaga: {
    radius: 0.62,
    height: 1.7,
    accessory: (scene, i, s) => {
      const m = MeshBuilder.CreateBox(`acc${i}`, { width: 1.0, height: 0.9, depth: 0.14 }, scene);
      m.position.set(0, s.height * 0.45, s.radius + 0.1);
      return m;
    },
  },
  // Pembangun: topi proyek pipih di atas kepala.
  pembangun: {
    radius: 0.5,
    height: 1.7,
    accessory: (scene, i, s) => {
      const m = MeshBuilder.CreateCylinder(`acc${i}`, { diameter: 1.2, height: 0.14, tessellation: 10 }, scene);
      m.position.y = s.height + 0.05;
      return m;
    },
  },
  // Penyerang: ramping & tinggi, "senapan" panjang di samping kanan.
  penyerang: {
    radius: 0.42,
    height: 2.0,
    accessory: (scene, i, s) => {
      const m = MeshBuilder.CreateBox(`acc${i}`, { width: 0.16, height: 0.16, depth: 1.1 }, scene);
      m.position.set(s.radius + 0.12, s.height * 0.5, 0.35);
      return m;
    },
  },
  // Penyembuh: bola cahaya di atas kepala.
  penyembuh: {
    radius: 0.48,
    height: 1.6,
    accessory: (scene, i, s) => {
      const m = MeshBuilder.CreateIcoSphere(`acc${i}`, { radius: 0.3, subdivisions: 1 }, scene);
      m.position.y = s.height + 0.45;
      return m;
    },
  },
};

export const PLAYER_SPAWNS: Vector3[] = [
  new Vector3(-6, 0, 4),
  new Vector3(6, 0, 4),
  new Vector3(-6, 0, -4),
  new Vector3(6, 0, -4),
];
