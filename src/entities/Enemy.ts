import { Vector3 } from "@babylonjs/core";
import type { EnemyData } from "../data/types";
import type { Player } from "./Player";

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
  maxHp = 0;
  /** Pencuri: koin yang sedang dibawa. */
  carried = 0;
  /** Pencuri: sedang kabur ke tepi arena. */
  fleeing = false;
  /** Hitung mundur ke serangan berikutnya (detik). */
  attackTimer = 0;
  /** Sisa waktu animasi "tersentak" setelah terkena serangan. */
  hitTimer = 0;
  /** Sisa waktu animasi menggigit. */
  biteTimer = 0;
  /** Sisa waktu stun (jebakan): tidak bergerak & tidak menyerang. */
  stunTimer = 0;
  /** Pancing Penjaga: selama lureTimer > 0 musuh mengejar pemain ini, bukan markas. */
  lureTarget: Player | null = null;
  lureTimer = 0;
  /** Fase animasi goyang supaya kawanan tidak bergerak seragam. */
  bobPhase = 0;
  data: EnemyData | null = null;

  get radius(): number {
    return (this.data?.size ?? 0.6) * 0.6;
  }

  /** Aktifkan dari pool. `hpMult` = pengali kesulitan (jumlah pemain). */
  spawn(data: EnemyData, x: number, z: number, hpMult = 1): void {
    this.active = true;
    this.data = data;
    this.maxHp = Math.round(data.hp * hpMult);
    this.hp = this.maxHp;
    this.carried = 0;
    this.fleeing = false;
    this.position.set(x, 0, z);
    this.velocity.setAll(0);
    this.yaw = Math.atan2(-x, -z);
    this.attackTimer = data.attackInterval;
    this.hitTimer = 0;
    this.biteTimer = 0;
    this.stunTimer = 0;
    this.lureTarget = null;
    this.lureTimer = 0;
    this.bobPhase = Math.random() * Math.PI * 2;
  }

  get stunned(): boolean {
    return this.stunTimer > 0;
  }

  despawn(): void {
    this.active = false;
    this.lureTarget = null;
  }
}
