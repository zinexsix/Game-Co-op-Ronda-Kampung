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

/** Kotak miring di bidang X-Z (mis. barikade). cos/sin = rotasi sumbu lebar (halfX) dari sumbu X. */
export interface OrientedBox {
  cx: number;
  cz: number;
  halfX: number;
  halfZ: number;
  cos: number;
  sin: number;
}

/** Koordinat lokal titik terhadap kotak miring (u = sepanjang lebar, v = sepanjang tebal). */
export function toObbLocal(x: number, z: number, box: OrientedBox): { u: number; v: number } {
  const dx = x - box.cx;
  const dz = z - box.cz;
  return { u: dx * box.cos + dz * box.sin, v: -dx * box.sin + dz * box.cos };
}

/** Titik terdekat pada kotak miring dari (x, z), dalam koordinat dunia. */
export function nearestOnObb(x: number, z: number, box: OrientedBox): { x: number; z: number } {
  const { u, v } = toObbLocal(x, z, box);
  const cu = Math.max(-box.halfX, Math.min(box.halfX, u));
  const cv = Math.max(-box.halfZ, Math.min(box.halfZ, v));
  return { x: box.cx + cu * box.cos - cv * box.sin, z: box.cz + cu * box.sin + cv * box.cos };
}

/** Jarak titik ke tepi kotak miring (0 jika di dalam). */
export function distanceToObb(x: number, z: number, box: OrientedBox): number {
  const n = nearestOnObb(x, z, box);
  return Math.hypot(x - n.x, z - n.z);
}

/** Dorong lingkaran keluar dari kotak miring. */
export function pushOutOfObb(b: CircleBody, box: OrientedBox): void {
  const p = b.position;
  const { u, v } = toObbLocal(p.x, p.z, box);
  const cu = Math.max(-box.halfX, Math.min(box.halfX, u));
  const cv = Math.max(-box.halfZ, Math.min(box.halfZ, v));
  const du = u - cu;
  const dv = v - cv;
  const d2 = du * du + dv * dv;
  if (d2 >= b.radius * b.radius) return;
  let nu: number;
  let nv: number;
  if (d2 > 1e-8) {
    const d = Math.sqrt(d2);
    nu = cu + (du / d) * b.radius;
    nv = cv + (dv / d) * b.radius;
  } else {
    // Pusat di dalam kotak: keluarkan lewat sisi terdekat.
    const penU = box.halfX - Math.abs(u) + b.radius;
    const penV = box.halfZ - Math.abs(v) + b.radius;
    if (penU < penV) {
      nu = u + Math.sign(u || 1) * penU;
      nv = v;
    } else {
      nu = u;
      nv = v + Math.sign(v || 1) * penV;
    }
  }
  p.x = box.cx + nu * box.cos - nv * box.sin;
  p.z = box.cz + nu * box.sin + nv * box.cos;
}
