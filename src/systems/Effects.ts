import {
  Color3,
  Color4,
  Matrix,
  MeshBuilder,
  Quaternion,
  StandardMaterial,
  Vector3,
  type Mesh,
  type Scene,
} from "@babylonjs/core";

const MAX_PARTICLES = 120;
const PARTICLE_GRAVITY = 14;
const BLAST_DURATION = 0.45; // detik, cincin serangan area mengembang lalu memudar
const BLAST_POOL = 2;

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: Color4;
}

interface Blast {
  ring: Mesh;
  disc: Mesh;
  ringMat: StandardMaterial;
  discMat: StandardMaterial;
  t: number;
  radius: number;
}

/**
 * Efek visual sederhana: percikan partikel (thin instances berwarna, 1 draw call)
 * dan cincin serangan area. Semua dibuat di awal lalu dipakai ulang.
 */
export class Effects {
  private readonly particles: Particle[];
  private readonly particleMesh: Mesh;
  private readonly matrixBuffer: Float32Array;
  private readonly colorBuffer: Float32Array;
  private readonly blasts: Blast[] = [];
  private readonly tmpMatrix = new Matrix();
  private readonly tmpScale = new Vector3();
  private readonly tmpPos = new Vector3();
  private readonly identityQuat = Quaternion.Identity();

  constructor(scene: Scene) {
    this.particles = Array.from({ length: MAX_PARTICLES }, () => ({
      active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, life: 0, maxLife: 1, size: 1, color: new Color4(1, 1, 1, 1),
    }));

    // Kubus kecil 12 segitiga; warna per partikel lewat buffer "color" thin instance.
    this.particleMesh = MeshBuilder.CreateBox("fxParticle", { size: 1 }, scene);
    const pMat = new StandardMaterial("fxParticleMat", scene);
    pMat.disableLighting = true;
    pMat.emissiveColor = Color3.White();
    this.particleMesh.material = pMat;
    this.particleMesh.isPickable = false;
    this.matrixBuffer = new Float32Array(MAX_PARTICLES * 16);
    this.colorBuffer = new Float32Array(MAX_PARTICLES * 4);
    this.particleMesh.thinInstanceSetBuffer("matrix", this.matrixBuffer, 16, false);
    this.particleMesh.thinInstanceSetBuffer("color", this.colorBuffer, 4, false);
    this.particleMesh.thinInstanceCount = 0;
    this.particleMesh.alwaysSelectAsActiveMesh = true;

    for (let i = 0; i < BLAST_POOL; i++) {
      const ring = MeshBuilder.CreateTorus(`fxBlastRing${i}`, { diameter: 2, thickness: 0.12, tessellation: 20 }, scene);
      const ringMat = new StandardMaterial(`fxBlastRingMat${i}`, scene);
      ringMat.disableLighting = true;
      ringMat.emissiveColor = new Color3(1, 0.75, 0.3);
      ring.material = ringMat;
      const disc = MeshBuilder.CreateDisc(`fxBlastDisc${i}`, { radius: 1, tessellation: 32 }, scene);
      disc.rotation.x = Math.PI / 2;
      const discMat = new StandardMaterial(`fxBlastDiscMat${i}`, scene);
      discMat.disableLighting = true;
      discMat.emissiveColor = new Color3(1, 0.45, 0.2);
      disc.material = discMat;
      for (const m of [ring, disc]) {
        m.isPickable = false;
        m.setEnabled(false);
      }
      this.blasts.push({ ring, disc, ringMat, discMat, t: 1, radius: 1 });
    }
  }

  get activeParticles(): number {
    return this.particleMesh.thinInstanceCount;
  }

  /** Semburan partikel ke segala arah dari satu titik. */
  burst(x: number, y: number, z: number, count: number, color: Color4, speed: number, life: number, size: number): void {
    for (let n = 0; n < count; n++) {
      const p = this.particles.find((q) => !q.active);
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.5 + Math.random() * 0.5);
      p.active = true;
      p.x = x;
      p.y = y;
      p.z = z;
      p.vx = Math.cos(a) * s;
      p.vz = Math.sin(a) * s;
      p.vy = speed * (0.4 + Math.random() * 0.8);
      p.life = p.maxLife = life * (0.7 + Math.random() * 0.3);
      p.size = size;
      p.color.copyFrom(color);
    }
  }

  /** Cincin + kilatan lantai yang mengembang sampai `radius` (serangan area). */
  areaBlast(x: number, z: number, radius: number): void {
    const b = this.blasts.find((q) => q.t >= 1) ?? this.blasts[0];
    b.t = 0;
    b.radius = radius;
    b.ring.position.set(x, 0.15, z);
    b.disc.position.set(x, 0.05, z);
    b.ring.setEnabled(true);
    b.disc.setEnabled(true);
  }

  update(dt: number): void {
    let n = 0;
    for (const p of this.particles) {
      if (!p.active) continue;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        continue;
      }
      p.vy -= PARTICLE_GRAVITY * dt;
      p.x += p.vx * dt;
      p.y = Math.max(0.05, p.y + p.vy * dt);
      p.z += p.vz * dt;
      const s = p.size * (p.life / p.maxLife);
      this.tmpScale.set(s, s, s);
      this.tmpPos.set(p.x, p.y, p.z);
      Matrix.ComposeToRef(this.tmpScale, this.identityQuat, this.tmpPos, this.tmpMatrix);
      this.tmpMatrix.copyToArray(this.matrixBuffer, n * 16);
      this.colorBuffer[n * 4] = p.color.r;
      this.colorBuffer[n * 4 + 1] = p.color.g;
      this.colorBuffer[n * 4 + 2] = p.color.b;
      this.colorBuffer[n * 4 + 3] = 1;
      n++;
    }
    this.particleMesh.thinInstanceCount = n;
    if (n > 0) {
      this.particleMesh.thinInstanceBufferUpdated("matrix");
      this.particleMesh.thinInstanceBufferUpdated("color");
    }

    for (const b of this.blasts) {
      if (b.t >= 1) continue;
      b.t = Math.min(1, b.t + dt / BLAST_DURATION);
      // Mengembang cepat di awal (ease-out), lalu memudar.
      const grow = 1 - (1 - b.t) * (1 - b.t);
      const r = Math.max(0.05, b.radius * grow);
      b.ring.scaling.set(r, 1, r);
      b.disc.scaling.set(r, r, 1);
      b.ringMat.alpha = 1 - b.t;
      b.discMat.alpha = 0.45 * (1 - b.t);
      if (b.t >= 1) {
        b.ring.setEnabled(false);
        b.disc.setEnabled(false);
      }
    }
  }

  reset(): void {
    for (const p of this.particles) p.active = false;
    this.particleMesh.thinInstanceCount = 0;
    for (const b of this.blasts) {
      b.t = 1;
      b.ring.setEnabled(false);
      b.disc.setEnabled(false);
    }
  }
}
