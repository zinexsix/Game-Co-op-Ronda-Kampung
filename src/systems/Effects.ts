import {
  Color3,
  Color4,
  Matrix,
  Mesh,
  MeshBuilder,
  Quaternion,
  StandardMaterial,
  Vector3,
  type Scene,
} from "@babylonjs/core";

const MAX_PARTICLES = 160;
const PARTICLE_GRAVITY = 14;
const BLAST_DURATION = 0.45; // detik, cincin mengembang lalu memudar
const BLAST_POOL = 6;
const BLAST_DISC_ALPHA = 0.45;

interface Particle {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  /** Partikel "naik" (heal/buff) tidak jatuh oleh gravitasi. */
  float: boolean;
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
  duration: number;
}

/** Warna cincin efek siap pakai. */
export const RING_COLORS = {
  area: new Color3(1, 0.6, 0.25),
  heal: new Color3(0.3, 1, 0.45),
  buff: new Color3(0.3, 0.85, 1),
  lure: new Color3(1, 0.8, 0.2),
  trap: new Color3(1, 0.95, 0.3),
  build: new Color3(0.95, 0.7, 0.35),
} as const;

/**
 * Cincin datar di lantai berjari-jari 1 (skalakan sesuai kebutuhan): tabung tipis mengikuti lingkaran.
 * Jauh lebih hemat segitiga dibanding torus.
 */
export function createGroundRing(name: string, scene: Scene, thickness: number): Mesh {
  const segments = 40;
  const path: Vector3[] = [];
  for (let i = 0; i <= segments; i++) {
    const a = (i / segments) * Math.PI * 2;
    path.push(new Vector3(Math.cos(a), 0, Math.sin(a)));
  }
  return MeshBuilder.CreateTube(name, { path, radius: thickness, tessellation: 4, cap: Mesh.NO_CAP }, scene);
}

/**
 * Efek visual sederhana: percikan partikel (thin instances berwarna, 1 draw call)
 * dan cincin mengembang (serangan area, heal, buff, pancing). Semua dibuat di awal lalu dipakai ulang.
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
      active: false, x: 0, y: 0, z: 0, vx: 0, vy: 0, vz: 0, float: false, life: 0, maxLife: 1, size: 1, color: new Color4(1, 1, 1, 1),
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
      const ring = createGroundRing(`fxBlastRing${i}`, scene, 0.07);
      const ringMat = new StandardMaterial(`fxBlastRingMat${i}`, scene);
      ringMat.disableLighting = true;
      ring.material = ringMat;
      const disc = MeshBuilder.CreateDisc(`fxBlastDisc${i}`, { radius: 1, tessellation: 32 }, scene);
      disc.rotation.x = Math.PI / 2;
      const discMat = new StandardMaterial(`fxBlastDiscMat${i}`, scene);
      discMat.disableLighting = true;
      disc.material = discMat;
      for (const m of [ring, disc]) {
        m.isPickable = false;
        m.setEnabled(false);
      }
      this.blasts.push({ ring, disc, ringMat, discMat, t: 1, radius: 1, duration: BLAST_DURATION });
    }
  }

  get activeParticles(): number {
    return this.particleMesh.thinInstanceCount;
  }

  /** Semburan partikel ke segala arah dari satu titik. */
  burst(x: number, y: number, z: number, count: number, color: Color4, speed: number, life: number, size: number): void {
    this.spawnParticles(x, y, z, count, color, speed, life, size, false);
  }

  /** Partikel ringan yang naik perlahan (heal, buff, revive). */
  rise(x: number, y: number, z: number, count: number, color: Color4, spread: number, life: number, size: number): void {
    this.spawnParticles(x, y, z, count, color, spread, life, size, true);
  }

  /** Cincin + kilatan lantai yang mengembang sampai `radius`. */
  areaBlast(x: number, z: number, radius: number, color: Color3 = RING_COLORS.area, duration = BLAST_DURATION): void {
    const b = this.blasts.find((q) => q.t >= 1) ?? this.blasts[0];
    b.t = 0;
    b.radius = radius;
    b.duration = duration;
    b.ringMat.emissiveColor.copyFrom(color);
    b.discMat.emissiveColor.copyFrom(color).scaleInPlace(0.7);
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
      if (!p.float) p.vy -= PARTICLE_GRAVITY * dt;
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
      b.t = Math.min(1, b.t + dt / b.duration);
      // Mengembang cepat di awal (ease-out), lalu memudar.
      const grow = 1 - (1 - b.t) * (1 - b.t);
      const r = Math.max(0.05, b.radius * grow);
      b.ring.scaling.set(r, 1, r);
      b.disc.scaling.set(r, r, 1);
      b.ringMat.alpha = 1 - b.t;
      b.discMat.alpha = BLAST_DISC_ALPHA * (1 - b.t);
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

  private spawnParticles(
    x: number, y: number, z: number, count: number, color: Color4, speed: number, life: number, size: number, float: boolean,
  ): void {
    for (let n = 0; n < count; n++) {
      const p = this.particles.find((q) => !q.active);
      if (!p) return;
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.5 + Math.random() * 0.5);
      p.active = true;
      p.float = float;
      if (float) {
        // Tersebar di sekitar titik, naik pelan.
        p.x = x + Math.cos(a) * s;
        p.y = y + Math.random() * 0.5;
        p.z = z + Math.sin(a) * s;
        p.vx = 0;
        p.vz = 0;
        p.vy = 1 + Math.random();
      } else {
        p.x = x;
        p.y = y;
        p.z = z;
        p.vx = Math.cos(a) * s;
        p.vz = Math.sin(a) * s;
        p.vy = speed * (0.4 + Math.random() * 0.8);
      }
      p.life = p.maxLife = life * (0.7 + Math.random() * 0.3);
      p.size = size;
      p.color.copyFrom(color);
    }
  }
}
