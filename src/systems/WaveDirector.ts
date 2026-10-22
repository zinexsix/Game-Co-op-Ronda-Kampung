import type { WaveData } from "../data/types";
import type { EnemyManager } from "./EnemyManager";

export type WavePhase = "jeda" | "muncul" | "bersihkan";

/**
 * Gelombang percobaan yang berulang (Tahap 2): jeda -> musuh muncul satu per satu dari
 * titik-titik di tepi arena -> tunggu sampai semua kalah -> jeda -> gelombang berikutnya.
 */
export class WaveDirector {
  wave = 0;
  phase: WavePhase = "jeda";
  /** Sisa detik jeda (fase "jeda"). */
  timer = 0;
  private spawned = 0;
  private spawnTimer = 0;
  private nextPoint = 0;
  paused = false;

  constructor(
    private readonly data: WaveData,
    private readonly enemies: EnemyManager,
  ) {
    this.reset();
  }

  /** Musuh gelombang ini yang belum muncul. */
  get remainingToSpawn(): number {
    return this.phase === "muncul" ? this.data.count - this.spawned : 0;
  }

  reset(): void {
    this.wave = 0;
    this.phase = "jeda";
    this.timer = this.data.firstDelaySec;
    this.spawned = 0;
    this.nextPoint = 0;
  }

  update(dt: number): void {
    if (this.paused) return;
    switch (this.phase) {
      case "jeda":
        this.timer -= dt;
        if (this.timer <= 0) {
          this.wave++;
          this.phase = "muncul";
          this.spawned = 0;
          this.spawnTimer = 0;
        }
        break;
      case "muncul":
        this.spawnTimer -= dt;
        while (this.spawnTimer <= 0 && this.spawned < this.data.count) {
          if (!this.spawnOne()) {
            this.spawnTimer = 0; // batas musuh aktif tercapai: coba lagi frame berikutnya
            break;
          }
          this.spawned++;
          this.spawnTimer += this.data.spawnInterval;
        }
        if (this.spawned >= this.data.count) this.phase = "bersihkan";
        break;
      case "bersihkan":
        if (this.enemies.activeCount === 0) {
          this.phase = "jeda";
          this.timer = this.data.breakSec;
        }
        break;
    }
  }

  /** Munculkan satu musuh; titik muncul bergiliran agar datang dari banyak arah. */
  private spawnOne(): boolean {
    const points = this.data.spawnPoints;
    const [x, z] = points[this.nextPoint % points.length];
    const j = this.data.spawnJitter;
    const e = this.enemies.spawnAt(x + (Math.random() - 0.5) * j, z + (Math.random() - 0.5) * j);
    if (e) this.nextPoint++;
    return e !== null;
  }
}
