import {
  Color3,
  Matrix,
  MeshBuilder,
  Quaternion,
  StandardMaterial,
  Vector3,
  type Mesh,
  type Scene,
} from "@babylonjs/core";
import { Enemy } from "../entities/Enemy";
import type { EnemyData } from "../data/types";
import { ARENA } from "../config/arena";

const SEPARATION_WEIGHT = 1.4;
const STEER_RATE = 6; // seberapa cepat kecepatan menyesuaikan arah tujuan

/**
 * Pool musuh berkapasitas tetap + render via thin instances (1 draw call untuk semua musuh).
 * Tahap 1: musuh berjalan ke pos ronda; saat tiba langsung dikembalikan ke pool.
 */
export class EnemyManager {
  readonly pool: Enemy[];
  private readonly mesh: Mesh;
  private readonly matrixBuffer: Float32Array;
  private readonly tmpMatrix = new Matrix();
  private readonly tmpQuat = new Quaternion();
  private readonly tmpScale = new Vector3(1, 1, 1);
  private readonly tmpPos = new Vector3();
  private time = 0;
  /** Jika true, pool otomatis diisi ulang sampai penuh (prototipe performa). */
  autoSpawn = true;
  spawnInterval = 0.08;
  private spawnTimer = 0;

  constructor(
    scene: Scene,
    readonly capacity: number,
    private readonly data: EnemyData,
  ) {
    this.pool = Array.from({ length: capacity }, () => new Enemy());

    // Kubus kecil placeholder (12 segitiga). Semua musuh berbagi mesh dan material ini.
    this.mesh = MeshBuilder.CreateBox("enemyTikus", { size: data.size }, scene);
    const mat = new StandardMaterial("enemyMat", scene);
    mat.diffuseColor = Color3.FromHexString(data.color);
    mat.emissiveColor = new Color3(0.35, 0.08, 0.05); // mata merah menyala di kegelapan
    mat.specularColor = Color3.Black();
    this.mesh.material = mat;
    this.mesh.isPickable = false;

    this.matrixBuffer = new Float32Array(capacity * 16);
    this.mesh.thinInstanceSetBuffer("matrix", this.matrixBuffer, 16, false);
    this.mesh.thinInstanceCount = 0;
    // Posisi berubah tiap frame; lewati perhitungan bounding agar murah.
    this.mesh.alwaysSelectAsActiveMesh = true;
  }

  get renderMesh(): Mesh {
    return this.mesh;
  }

  get activeCount(): number {
    let n = 0;
    for (const e of this.pool) if (e.active) n++;
    return n;
  }

  /** Ambil musuh dari pool; null jika pool penuh. */
  spawnAtEdge(): Enemy | null {
    const e = this.pool.find((p) => !p.active);
    if (!e) return null;
    const { x, z } = randomEdgePoint();
    e.spawn(this.data, x, z);
    return e;
  }

  update(dt: number, target: Vector3): void {
    this.time += dt;

    if (this.autoSpawn) {
      this.spawnTimer -= dt;
      while (this.spawnTimer <= 0) {
        this.spawnTimer += this.spawnInterval;
        if (!this.spawnAtEdge()) {
          this.spawnTimer = Math.max(this.spawnTimer, 0);
          break;
        }
      }
    }

    const arriveDist = ARENA.postHalfSize + 0.8;
    for (const e of this.pool) {
      if (!e.active) continue;
      // Steering: seek ke pos ronda + separation antar musuh (n kecil, O(n^2) aman).
      let dx = target.x - e.position.x;
      let dz = target.z - e.position.z;
      const dist = Math.hypot(dx, dz);
      if (dist < arriveDist) {
        e.despawn(); // Tahap 1: "menyerang markas" = kembali ke pool
        continue;
      }
      dx /= dist;
      dz /= dist;
      let sx = 0;
      let sz = 0;
      for (const o of this.pool) {
        if (o === e || !o.active) continue;
        const ox = e.position.x - o.position.x;
        const oz = e.position.z - o.position.z;
        const d2 = ox * ox + oz * oz;
        const minD = e.radius + o.radius + 0.2;
        if (d2 > 1e-6 && d2 < minD * minD) {
          const d = Math.sqrt(d2);
          sx += (ox / d) * (1 - d / minD);
          sz += (oz / d) * (1 - d / minD);
        }
      }
      const speed = this.data.speed;
      const desiredX = (dx + sx * SEPARATION_WEIGHT) * speed;
      const desiredZ = (dz + sz * SEPARATION_WEIGHT) * speed;
      const k = Math.min(1, STEER_RATE * dt);
      e.velocity.x += (desiredX - e.velocity.x) * k;
      e.velocity.z += (desiredZ - e.velocity.z) * k;
      e.position.x += e.velocity.x * dt;
      e.position.z += e.velocity.z * dt;
      e.yaw = Math.atan2(e.velocity.x, e.velocity.z);
    }

    this.writeInstances();
  }

  /** Tulis matriks musuh aktif secara rapat ke buffer thin instance. */
  private writeInstances(): void {
    let n = 0;
    const half = this.data.size / 2;
    for (const e of this.pool) {
      if (!e.active) continue;
      const bob = Math.abs(Math.sin(this.time * 12 + e.bobPhase)) * 0.15;
      this.tmpPos.set(e.position.x, half + bob, e.position.z);
      Quaternion.RotationYawPitchRollToRef(e.yaw, 0, 0, this.tmpQuat);
      Matrix.ComposeToRef(this.tmpScale, this.tmpQuat, this.tmpPos, this.tmpMatrix);
      this.tmpMatrix.copyToArray(this.matrixBuffer, n * 16);
      n++;
    }
    this.mesh.thinInstanceCount = n;
    this.mesh.thinInstanceBufferUpdated("matrix");
  }
}

/** Titik acak di tepi area main. */
function randomEdgePoint(): { x: number; z: number } {
  const w = ARENA.halfWidth - 0.5;
  const d = ARENA.halfDepth - 0.5;
  const side = Math.floor(Math.random() * 4);
  const t = Math.random() * 2 - 1;
  switch (side) {
    case 0: return { x: t * w, z: d };
    case 1: return { x: t * w, z: -d };
    case 2: return { x: w, z: t * d };
    default: return { x: -w, z: t * d };
  }
}
