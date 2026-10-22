import { Color3, Matrix, MeshBuilder, Quaternion, StandardMaterial, Vector3, type Mesh, type Scene } from "@babylonjs/core";
import { ARENA } from "../config/arena";
import type { Enemy } from "../entities/Enemy";
import type { EnemyManager } from "./EnemyManager";

const PROJECTILE_HEIGHT = 0.55; // setinggi badan tikus
const PROJECTILE_THICKNESS = 0.12; // tambahan radius saat cek kena

interface Projectile {
  active: boolean;
  x: number;
  z: number;
  dirX: number;
  dirZ: number;
  speed: number;
  travelled: number;
  range: number;
  damage: number;
}

/** Pool proyektil lurus (thin instances, 1 draw call). Kena musuh pertama di jalurnya; melewati pos ronda (bangunan terbuka). */
export class ProjectileManager {
  private readonly pool: Projectile[];
  private readonly mesh: Mesh;
  private readonly matrixBuffer: Float32Array;
  private readonly tmpMatrix = new Matrix();
  private readonly tmpQuat = new Quaternion();
  private readonly tmpScale = new Vector3(1, 1, 1);
  private readonly tmpPos = new Vector3();

  constructor(
    scene: Scene,
    readonly capacity: number,
    private readonly onHit: (e: Enemy, x: number, z: number, killed: boolean) => void,
  ) {
    this.pool = Array.from({ length: capacity }, () => ({
      active: false, x: 0, z: 0, dirX: 0, dirZ: 1, speed: 0, travelled: 0, range: 0, damage: 0,
    }));
    // Batang cahaya memanjang searah gerak (12 segitiga).
    this.mesh = MeshBuilder.CreateBox("projectile", { width: 0.2, height: 0.2, depth: 0.9 }, scene);
    const mat = new StandardMaterial("projectileMat", scene);
    mat.disableLighting = true;
    mat.emissiveColor = new Color3(1, 0.9, 0.45);
    this.mesh.material = mat;
    this.mesh.isPickable = false;
    this.matrixBuffer = new Float32Array(capacity * 16);
    this.mesh.thinInstanceSetBuffer("matrix", this.matrixBuffer, 16, false);
    this.mesh.thinInstanceCount = 0;
    this.mesh.alwaysSelectAsActiveMesh = true;
  }

  get activeCount(): number {
    return this.mesh.thinInstanceCount;
  }

  fire(x: number, z: number, dirX: number, dirZ: number, speed: number, range: number, damage: number): void {
    const p = this.pool.find((q) => !q.active);
    if (!p) return;
    p.active = true;
    p.x = x;
    p.z = z;
    p.dirX = dirX;
    p.dirZ = dirZ;
    p.speed = speed;
    p.travelled = 0;
    p.range = range;
    p.damage = damage;
  }

  update(dt: number, enemies: EnemyManager): void {
    let n = 0;
    for (const p of this.pool) {
      if (!p.active) continue;
      const step = p.speed * dt;
      const nx = p.x + p.dirX * step;
      const nz = p.z + p.dirZ * step;
      // Sapu ruas gerak frame ini agar proyektil cepat tidak melompati musuh.
      const hit = enemies.sweepHit(p.x, p.z, nx, nz, PROJECTILE_THICKNESS);
      if (hit) {
        const hx = hit.position.x;
        const hz = hit.position.z;
        const killed = enemies.damage(hit, p.damage);
        this.onHit(hit, hx, hz, killed);
        p.active = false;
        continue;
      }
      p.x = nx;
      p.z = nz;
      p.travelled += step;
      const outside = Math.abs(p.x) > ARENA.halfWidth || Math.abs(p.z) > ARENA.halfDepth;
      if (p.travelled >= p.range || outside) {
        p.active = false;
        continue;
      }
      this.tmpPos.set(p.x, PROJECTILE_HEIGHT, p.z);
      Quaternion.RotationYawPitchRollToRef(Math.atan2(p.dirX, p.dirZ), 0, 0, this.tmpQuat);
      Matrix.ComposeToRef(this.tmpScale, this.tmpQuat, this.tmpPos, this.tmpMatrix);
      this.tmpMatrix.copyToArray(this.matrixBuffer, n * 16);
      n++;
    }
    this.mesh.thinInstanceCount = n;
    if (n > 0) this.mesh.thinInstanceBufferUpdated("matrix");
  }

  reset(): void {
    for (const p of this.pool) p.active = false;
    this.mesh.thinInstanceCount = 0;
  }
}
