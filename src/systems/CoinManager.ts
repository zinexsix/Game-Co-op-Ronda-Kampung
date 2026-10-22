import { Color3, Matrix, MeshBuilder, Quaternion, StandardMaterial, Vector3, type Mesh, type Scene } from "@babylonjs/core";
import { ARENA } from "../config/arena";
import type { Player } from "../entities/Player";

const SPIN_SPEED = 3; // rad/detik
const HOP_HEIGHT = 0.8;
const FLOAT_HEIGHT = 0.35;
const BLINK_LAST_SEC = 3; // berkedip sebelum hilang
const BLINK_RATE = 8;

interface Coin {
  active: boolean;
  x: number;
  z: number;
  age: number;
  phase: number;
}

export interface CoinRules {
  maxOnGround: number;
  pickupRadius: number;
  lifetimeSec: number;
  scatter: number;
  /** Koin bisa dipungut setelah lompatan jatuhnya selesai (detik). */
  pickupDelaySec: number;
}

/** Koin 3D kecil yang dijatuhkan musuh; diambil pemain dengan menyentuh. Pool + thin instances. */
export class CoinManager {
  private readonly pool: Coin[];
  private readonly mesh: Mesh;
  private readonly matrixBuffer: Float32Array;
  private readonly tmpMatrix = new Matrix();
  private readonly tmpQuat = new Quaternion();
  private readonly tmpScale = new Vector3(1, 1, 1);
  private readonly tmpPos = new Vector3();
  private time = 0;

  constructor(
    scene: Scene,
    private readonly rules: CoinRules,
    private readonly onPickup: (x: number, z: number, player: Player) => void,
  ) {
    this.pool = Array.from({ length: rules.maxOnGround }, () => ({ active: false, x: 0, z: 0, age: 0, phase: 0 }));
    // Koin tegak: silinder pipih 10 sisi (40 segitiga).
    this.mesh = MeshBuilder.CreateCylinder("coin", { diameter: 0.6, height: 0.1, tessellation: 10 }, scene);
    this.mesh.bakeTransformIntoVertices(Matrix.RotationX(Math.PI / 2));
    const mat = new StandardMaterial("coinMat", scene);
    mat.diffuseColor = new Color3(1, 0.8, 0.2);
    mat.emissiveColor = new Color3(0.7, 0.5, 0.05);
    mat.specularColor = Color3.Black();
    this.mesh.material = mat;
    this.mesh.isPickable = false;
    this.matrixBuffer = new Float32Array(rules.maxOnGround * 16);
    this.mesh.thinInstanceSetBuffer("matrix", this.matrixBuffer, 16, false);
    this.mesh.thinInstanceCount = 0;
    this.mesh.alwaysSelectAsActiveMesh = true;
  }

  get activeCount(): number {
    return this.mesh.thinInstanceCount;
  }

  /** Jatuhkan `count` koin di sekitar (x, z). Jika pool penuh, koin tertua dipakai ulang. */
  drop(x: number, z: number, count: number): void {
    for (let i = 0; i < count; i++) {
      let c = this.pool.find((q) => !q.active);
      if (!c) c = this.pool.reduce((a, b) => (b.age > a.age ? b : a));
      const a = Math.random() * Math.PI * 2;
      const r = Math.random() * this.rules.scatter;
      c.active = true;
      c.x = Math.max(-ARENA.halfWidth + 0.5, Math.min(ARENA.halfWidth - 0.5, x + Math.cos(a) * r));
      c.z = Math.max(-ARENA.halfDepth + 0.5, Math.min(ARENA.halfDepth - 0.5, z + Math.sin(a) * r));
      c.age = 0;
      c.phase = Math.random() * Math.PI * 2;
    }
  }

  /** Koin di tanah (sudah mendarat) terdekat dari (x, z), atau null. Dipakai Pencuri. */
  nearest(x: number, z: number): { x: number; z: number; index: number } | null {
    let best = -1;
    let bestD2 = Infinity;
    this.pool.forEach((c, i) => {
      if (!c.active || c.age < this.rules.pickupDelaySec) return;
      const d2 = (c.x - x) ** 2 + (c.z - z) ** 2;
      if (d2 < bestD2) {
        bestD2 = d2;
        best = i;
      }
    });
    if (best < 0) return null;
    return { x: this.pool[best].x, z: this.pool[best].z, index: best };
  }

  /** Ambil koin tanpa menambah koin tim (dicuri). */
  take(index: number): boolean {
    const c = this.pool[index];
    if (!c?.active) return false;
    c.active = false;
    return true;
  }

  get pickupRadius(): number {
    return this.rules.pickupRadius;
  }

  update(dt: number, players: readonly Player[]): void {
    this.time += dt;
    let n = 0;
    for (const c of this.pool) {
      if (!c.active) continue;
      c.age += dt;
      if (c.age >= this.rules.lifetimeSec) {
        c.active = false;
        continue;
      }
      // Ambil dengan menyentuh (setelah lompatan jatuh selesai). Pemain jatuh tidak bisa mengambil.
      if (c.age >= this.rules.pickupDelaySec) {
        const picker = players.find((p) => {
          if (!p.active || p.downed) return false;
          const r = p.radius + this.rules.pickupRadius;
          const dx = p.position.x - c.x;
          const dz = p.position.z - c.z;
          return dx * dx + dz * dz <= r * r;
        });
        if (picker) {
          c.active = false;
          this.onPickup(c.x, c.z, picker);
          continue;
        }
      }
      const left = this.rules.lifetimeSec - c.age;
      if (left < BLINK_LAST_SEC && Math.sin(this.time * BLINK_RATE * Math.PI) < 0) continue; // fase "mati" kedipan
      const hopT = Math.min(1, c.age / this.rules.pickupDelaySec);
      const y = FLOAT_HEIGHT + Math.sin(hopT * Math.PI) * HOP_HEIGHT + Math.sin(this.time * 3 + c.phase) * 0.06;
      this.tmpPos.set(c.x, y, c.z);
      Quaternion.RotationYawPitchRollToRef(this.time * SPIN_SPEED + c.phase, 0, 0, this.tmpQuat);
      Matrix.ComposeToRef(this.tmpScale, this.tmpQuat, this.tmpPos, this.tmpMatrix);
      this.tmpMatrix.copyToArray(this.matrixBuffer, n * 16);
      n++;
    }
    this.mesh.thinInstanceCount = n;
    if (n > 0) this.mesh.thinInstanceBufferUpdated("matrix");
  }

  reset(): void {
    for (const c of this.pool) c.active = false;
    this.mesh.thinInstanceCount = 0;
  }
}
