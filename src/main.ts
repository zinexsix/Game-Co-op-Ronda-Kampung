import { Engine, SceneInstrumentation } from "@babylonjs/core";
import "./style.css";
import { ARENA } from "./config/arena";
import { SYSTEM_KEYS } from "./config/controls";
import { DEFAULT_QUALITY, QUALITY_PRESETS, type QualityLevel } from "./config/quality";
import { MAX_ACTIVE_ENEMIES, ROLES, getEnemy } from "./data/types";
import { PLAYER_SPAWNS, Player } from "./entities/Player";
import { createArenaScene } from "./scenes/ArenaScene";
import { Benchmark, type BenchResult } from "./systems/Benchmark";
import { clampToArena, pushOutOfBox, separateCircles } from "./systems/Collision";
import { EnemyManager } from "./systems/EnemyManager";
import { InputManager } from "./systems/InputManager";
import { QualityManager } from "./systems/QualityManager";
import { DebugOverlay, countRenderedTriangles, readDrawCalls, renderSize } from "./ui/DebugOverlay";
import { SettingsBar, toggleFullscreen } from "./ui/SettingsBar";

const params = new URLSearchParams(location.search);
const initialQuality: QualityLevel = params.get("q") === "rendah" ? "rendah" : DEFAULT_QUALITY;

const canvas = document.getElementById("game") as HTMLCanvasElement;
const uiRoot = document.getElementById("ui") as HTMLDivElement;

// Tanpa MSAA & tanpa adaptasi devicePixelRatio: hemat fill-rate di GPU terintegrasi.
const engine = new Engine(canvas, false, {
  preserveDrawingBuffer: false,
  stencil: false,
  powerPreference: "high-performance",
  adaptToDeviceRatio: false,
});

const gpuName = engine.getGlInfo().renderer;

const arena = createArenaScene(engine, QUALITY_PRESETS.sedang.shadowMapSize);
const { scene } = arena;

// --- Pemain: 4 peran tetap untuk Tahap 1 (pemilihan peran menyusul) ---
const input = new InputManager();
const players = ROLES.map((role, i) => new Player(scene, i, role, PLAYER_SPAWNS[i]));

// --- Musuh: pool 30, satu draw call via thin instances ---
const enemies = new EnemyManager(scene, MAX_ACTIVE_ENEMIES, getEnemy("tikus"));

// --- Kualitas & UI ---
const quality = new QualityManager(engine, arena.sun, arena.shadows, initialQuality);
quality.addDynamicCasters([...players.flatMap((p) => p.meshes.slice(0, 3)), enemies.renderMesh]);

const settings = new SettingsBar(uiRoot, (l) => quality.apply(l), toggleFullscreen);
settings.setActive(quality.level);
quality.onChange((l) => settings.setActive(l));

const debug = new DebugOverlay(uiRoot);
const status = document.createElement("div");
status.className = "status";
uiRoot.appendChild(status);

const benchmark = new Benchmark(
  input,
  (l) => quality.apply(l),
  () => renderSize(engine),
  (text) => (status.textContent = text),
  (results) => showBenchResults(results),
);

input.onSystemKey(SYSTEM_KEYS.toggleDebug, () => debug.toggle());
input.onSystemKey(SYSTEM_KEYS.toggleQuality, () => quality.toggle());
input.onSystemKey(SYSTEM_KEYS.toggleFullscreen, toggleFullscreen);
input.onSystemKey(SYSTEM_KEYS.runBenchmark, () => {
  if (!benchmark.running) benchmark.start();
});

const instr = new SceneInstrumentation(scene);
instr.captureFrameTime = false;

// --- Loop utama ---
let totalTime = 0;
scene.onBeforeRenderObservable.add(() => {
  // Batasi dt agar tab yang sempat tertunda tidak membuat lompatan besar.
  const rawDt = engine.getDeltaTime() / 1000;
  const dt = Math.min(rawDt, 0.1);
  totalTime += dt;

  benchmark.tick(rawDt, totalTime); // benchmark mengukur frame time asli
  input.update();

  players.forEach((p, i) => p.update(dt, input.getState(i)));
  separateCircles(players);
  for (const p of players) {
    pushOutOfBox(p, arena.postBox);
    clampToArena(p, ARENA.halfWidth, ARENA.halfDepth);
  }

  enemies.update(dt, arena.postCenter);
});

scene.onAfterRenderObservable.add(() => {
  const dt = engine.getDeltaTime() / 1000;
  const size = renderSize(engine);
  debug.update(
    dt,
    {
      fps: engine.getFps(),
      drawCalls: readDrawCalls(instr),
      triangles: countRenderedTriangles(scene),
      activeEnemies: enemies.activeCount,
      enemyCapacity: enemies.capacity,
      quality: quality.level,
      renderWidth: size.w,
      renderHeight: size.h,
      gpu: gpuName,
    },
    players,
    input,
  );
});

engine.runRenderLoop(() => scene.render());
window.addEventListener("resize", () => {
  engine.resize();
  arena.fitCamera();
});

function showBenchResults(results: BenchResult[]): void {
  const lines = results.map(
    (r) =>
      `${QUALITY_PRESETS[r.quality].label}: rata-rata ${r.avgFps.toFixed(1)} FPS · terendah (1 dtk) ${r.minFps1s.toFixed(1)} · 1% low ${r.low1pct.toFixed(1)} · ${r.renderWidth}×${r.renderHeight}` +
      (r.disturbed ? " · ⚠ jendela sempat tersembunyi, ulangi" : ""),
  );
  status.innerHTML = `<b>Hasil benchmark</b> (${gpuName})<br>${lines.join("<br>")}`;
  console.log("BENCH_RESULT " + JSON.stringify({ gpu: gpuName, results }));
  (window as unknown as { __benchResult: BenchResult[] }).__benchResult = results;
}

// Info anggaran segitiga karakter ke konsol (cek batas 800/karakter).
console.log(
  "Segitiga per karakter:",
  players.map((p) => `${p.role.name}=${p.triangleCount}`).join(", "),
);

// ?bench atau ?bench=sedang,rendah (urutan kustom).
if (params.has("bench")) {
  const order = (params.get("bench") || "rendah,sedang")
    .split(",")
    .filter((l): l is QualityLevel => l === "rendah" || l === "sedang");
  benchmark.start(order.length ? order : undefined);
}
if (params.has("debug")) debug.toggle();
