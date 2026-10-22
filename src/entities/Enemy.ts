import { Vector3 } from "@babylonjs/core";
import type { EnemyData } from "../data/types";

/**
 * Data satu musuh. Tidak punya mesh sendiri: semua musuh sejenis digambar
 * sekaligus lewat thin instances di EnemyManager, dan objek ini dipakai ulang (pooling).
 */
export class Enemy {
  active = false;
  readonly position = new Vector3();
  readonly velocity = new Vector3();
  yaw = 0;
  hp = 0;
  /** Hitung mundur ke serangan berikutnya (detik). */
  attackTimer = 0;
  /** Sisa waktu animasi "tersentak" setelah terkena serangan. */
  hitTimer = 0;
  /** Sisa waktu animasi menggigit. */
  biteTimer = 0;
  /** Fase animasi goyang supaya kawanan tidak bergerak seragam. */
  bobPhase = 0;
  data: EnemyData | null = null;

  get radius(): number {
    return (this.data?.size ?? 0.6) * 0.6;
  }

  spawn(data: EnemyData, x: number, z: number): void {
    this.active = true;
    this.data = data;
    this.hp = data.hp;
    this.position.set(x, 0, z);
    this.velocity.setAll(0);
    this.yaw = Math.atan2(-x, -z);
    this.attackTimer = data.attackInterval;
    this.hitTimer = 0;
    this.biteTimer = 0;
    this.bobPhase = Math.random() * Math.PI * 2;
  }

  despawn(): void {
    this.active = false;
  }
}
