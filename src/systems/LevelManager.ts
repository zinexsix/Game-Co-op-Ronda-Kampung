import type { LevelData, PlayerScaling } from "../data/types";
import type { EnemyManager } from "./EnemyManager";

const SPAWN_JITTER = 1.5;

/** Antrean satu kelompok musuh yang sedang dimunculkan. */
interface SpawnQueue {
  enemy: string;
  remaining: number;
  interval: number;
  timer: number;
  points: [number, number][];
  next: number;
}

/**
 * Menjalankan gelombang satu level dari levels.json: tiap gelombang mulai pada detik `at`,
 * kelompok musuhnya muncul satu per satu bergiliran dari titik spawn bernama.
 * Jumlah & HP musuh dikali pengali kesulitan (jumlah pemain manusia).
 * Jika arena kosong dan gelombang berikutnya masih lama, gelombang dimajukan.
 * Level selesai (menang) jika semua gelombang sudah muncul dan tidak ada musuh tersisa.
 */
export class LevelManager {
  level: LevelData | null = null;
  /** Detik sejak level mulai (bisa melompat maju saat gelombang dimajukan). */
  time = 0;
  /** Gelombang yang sudah dimulai. */
  wavesStarted = 0;
  paused = false;
  private queues: SpawnQueue[] = [];
  private scaling: PlayerScaling = { count: 1, hp: 1 };
  private idleTimer = 0;

  constructor(
    private readonly enemies: EnemyManager,
    private readonly earlyNextWaveSec: number,
    /** Dipanggil saat gelombang baru mulai (pemain jatuh kembali di sini). */
    private readonly onWaveStart: (wave: number) => void,
  ) {}

  get wavesTotal(): number {
    return this.level?.waves.length ?? 0;
  }

  /** Musuh gelombang berjalan yang belum muncul. */
  get remainingToSpawn(): number {
    return this.queues.reduce((n, q) => n + q.remaining, 0);
  }

  /** Detik sampai gelombang berikutnya (null jika tidak ada lagi). */
  get nextWaveIn(): number | null {
    const next = this.level?.waves[this.wavesStarted];
    return next ? Math.max(0, next.at - this.time) : null;
  }

  /** Semua gelombang sudah muncul dan arena bersih. */
  get complete(): boolean {
    return (
      this.level !== null &&
      this.wavesStarted >= this.wavesTotal &&
      this.remainingToSpawn === 0 &&
      this.enemies.activeCount === 0
    );
  }

  /** Muat level dengan pengali kesulitan untuk jumlah pemain ini. */
  load(level: LevelData, scaling: PlayerScaling): void {
    this.level = level;
    this.scaling = scaling;
    this.reset();
  }

  reset(): void {
    this.time = 0;
    this.wavesStarted = 0;
    this.queues = [];
    this.idleTimer = 0;
  }

  /** Daftar koordinat semua titik spawn level (mode uji/benchmark). */
  get spawnPoints(): [number, number][] {
    return Object.values(this.level?.spawnPoints ?? {});
  }

  /** Jenis musuh yang muncul di level ini. */
  get enemyTypes(): string[] {
    const ids = new Set<string>();
    for (const w of this.level?.waves ?? []) for (const g of w.groups) ids.add(g.enemy);
    return [...ids];
  }

  update(dt: number): void {
    const level = this.level;
    if (!level || this.paused) return;
    this.time += dt;

    // Arena kosong sebelum gelombang berikutnya: majukan setelah jeda singkat.
    const next = level.waves[this.wavesStarted];
    if (next && this.remainingToSpawn === 0 && this.enemies.activeCount === 0 && this.wavesStarted > 0) {
      this.idleTimer += dt;
      if (this.idleTimer >= this.earlyNextWaveSec) this.time = Math.max(this.time, next.at);
    } else {
      this.idleTimer = 0;
    }

    while (this.wavesStarted < level.waves.length && level.waves[this.wavesStarted].at <= this.time) {
      this.startWave(level, this.wavesStarted);
    }

    for (const q of this.queues) {
      q.timer -= dt;
      while (q.remaining > 0 && q.timer <= 0) {
        const [x, z] = q.points[q.next % q.points.length];
        const e = this.enemies.spawnAt(
          q.enemy,
          x + (Math.random() - 0.5) * SPAWN_JITTER,
          z + (Math.random() - 0.5) * SPAWN_JITTER,
          this.scaling.hp,
        );
        if (!e) {
          q.timer = 0; // batas musuh aktif tercapai: coba lagi frame berikutnya
          break;
        }
        q.next++;
        q.remaining--;
        q.timer += q.interval;
      }
    }
    this.queues = this.queues.filter((q) => q.remaining > 0);
  }

  private startWave(level: LevelData, index: number): void {
    const wave = level.waves[index];
    for (const g of wave.groups) {
      const points = g.points.map((name) => {
        const p = level.spawnPoints[name];
        if (!p) throw new Error(`levels.json: titik spawn "${name}" tidak ada di level ${level.id}`);
        return p;
      });
      this.queues.push({
        enemy: g.enemy,
        remaining: Math.max(1, Math.round(g.count * this.scaling.count)),
        interval: g.interval,
        timer: 0,
        points,
        next: Math.floor(Math.random() * points.length),
      });
    }
    this.wavesStarted++;
    this.idleTimer = 0;
    this.onWaveStart(this.wavesStarted);
  }
}
