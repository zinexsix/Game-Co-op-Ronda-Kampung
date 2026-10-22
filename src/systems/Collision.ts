import type { Vector3 } from "@babylonjs/core";

/** Lingkaran tabrakan di bidang X-Z (kapsul dilihat dari atas). */
export interface CircleBody {
  readonly position: Vector3;
  readonly radius: number;
}

/** Kotak statis sejajar sumbu di bidang X-Z. */
export interface StaticBox {
  cx: number;
  cz: number;
  halfX: number;
  halfZ: number;
}

/** Jaga lingkaran tetap di dalam batas arena. */
export function clampToArena(b: CircleBody, halfWidth: number, halfDepth: number): void {
  const p = b.position;
  p.x = Math.max(-halfWidth + b.radius, Math.min(halfWidth - b.radius, p.x));
  p.z = Math.max(-halfDepth + b.radius, Math.min(halfDepth - b.radius, p.z));
}

/** Jarak titik ke tepi kotak (0 jika di dalam kotak). */
export function distanceToBox(x: number, z: number, box: StaticBox): number {
  const dx = Math.max(Math.abs(x - box.cx) - box.halfX, 0);
  const dz = Math.max(Math.abs(z - box.cz) - box.halfZ, 0);
  return Math.hypot(dx, dz);
}

/** Dorong lingkaran keluar dari kotak statis (mis. pos ronda). */
export function pushOutOfBox(b: CircleBody, box: StaticBox): void {
  const p = b.position;
  const nearestX = Math.max(box.cx - box.halfX, Math.min(box.cx + box.halfX, p.x));
  const nearestZ = Math.max(box.cz - box.halfZ, Math.min(box.cz + box.halfZ, p.z));
  let dx = p.x - nearestX;
  let dz = p.z - nearestZ;
  const d2 = dx * dx + dz * dz;
  if (d2 >= b.radius * b.radius) return;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    p.x += (dx / d) * (b.radius - d);
    p.z += (dz / d) * (b.radius - d);
    return;
  }
  // Pusat lingkaran di dalam kotak: keluarkan lewat sisi terdekat.
  dx = p.x - box.cx;
  dz = p.z - box.cz;
  const penX = box.halfX - Math.abs(dx) + b.radius;
  const penZ = box.halfZ - Math.abs(dz) + b.radius;
  if (penX < penZ) p.x += Math.sign(dx || 1) * penX;
  else p.z += Math.sign(dz || 1) * penZ;
}

/** Dorong lingkaran `b` keluar dari lingkaran `fixed` (yang tidak ikut bergeser). */
export function pushOutOfCircle(b: CircleBody, fixed: CircleBody): void {
  const dx = b.position.x - fixed.position.x;
  const dz = b.position.z - fixed.position.z;
  const minD = b.radius + fixed.radius;
  const d2 = dx * dx + dz * dz;
  if (d2 >= minD * minD || d2 < 1e-8) return;
  const d = Math.sqrt(d2);
  b.position.x += (dx / d) * (minD - d);
  b.position.z += (dz / d) * (minD - d);
}

/** Pisahkan lingkaran yang saling tumpuk (dorong setengah-setengah). O(n^2), cukup untuk 4 pemain. */
export function separateCircles(bodies: readonly CircleBody[]): void {
  for (let i = 0; i < bodies.length; i++) {
    for (let j = i + 1; j < bodies.length; j++) {
      const a = bodies[i].position;
      const b = bodies[j].position;
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const minD = bodies[i].radius + bodies[j].radius;
      const d2 = dx * dx + dz * dz;
      if (d2 >= minD * minD || d2 < 1e-8) continue;
      const d = Math.sqrt(d2);
      const push = (minD - d) / 2;
      a.x -= (dx / d) * push;
      a.z -= (dz / d) * push;
      b.x += (dx / d) * push;
      b.z += (dz / d) * push;
    }
  }
}
