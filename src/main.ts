import { Engine, Matrix, SceneInstrumentation, Vector3 } from "@babylonjs/core";
import "./style.css";
import { SYSTEM_KEYS } from "./config/controls";
import { DEFAULT_QUALITY, QUALITY_PRESETS, type QualityLevel } from "./config/quality";
import { ROLES, type RoleId } from "./data/types";
import { createArenaScene } from "./scenes/ArenaScene";
import { MatchScene, type Assignment } from "./scenes/MatchScene";
import { RoleSelectScene } from "./scenes/RoleSelectScene";
import { Benchmark, type BenchResult } from "./systems/Benchmark";
import { InputManager } from "./systems/InputManager";
import { QualityManager } from "./systems/QualityManager";
import { DebugOverlay, countRenderedTriangles, readDrawCalls, renderSize } from "./ui/DebugOverlay";
import { Hud, type Projector } from "./ui/Hud";
import { LoseScreen } from "./ui/LoseScreen";
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

// --- Sistem permainan: semua aset dibuat di awal, lalu dipakai ulang ---
const input = new InputManager();
const match = new MatchScene(scene, arena, input);

// --- Kualitas & UI ---
const quality = new QualityManager(engine, arena.sun, arena.shadows, initialQuality);
quality.addDynamicCasters([
  ...match.players.flatMap((p) => p.meshes.slice(0, 3)),
  match.enemies.renderMesh,
  ...match.structures.shadowMeshes,
]);

const settings = new SettingsBar(uiRoot, (l) => quality.apply(l), toggleFullscreen);
settings.setActive(quality.level);
quality.onChange((l) => settings.setActive(l));

// Proyeksi titik dunia ke piksel layar (untuk bar revive di atas karakter).
const tmpWorld = new Vector3();
const project: Projector = (x, y, z) => {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  const out = Vector3.Project(
    tmpWorld.set(x, y, z),
    Matrix.IdentityReadOnly,
    scene.getTransformMatrix(),
    arena.camera.viewport.toGlobal(w, h),
  );
  return out.z < 0 || out.z > 1 ? null : { x: out.x, y: out.y };
};

const hud = new Hud(uiRoot);
const roleSelect = new RoleSelectScene(uiRoot, input, (assignments) => startMatch(assignments));
const lose = new LoseScreen(
  uiRoot,
  input,
  () => {
    match.restart();
    hud.show(match, project);
  },
  () => openRoleSelect(match.currentAssignments),
);

const debug = new DebugOverlay(uiRoot);
const status = document.createElement("div");
status.className = "status";
uiRoot.appendChild(status);

type AppState = "pilihPeran" | "pertandingan";
let appState: AppState = "pilihPeran";

function startMatch(assignments: Assignment[]): void {
  roleSelect.hide();
  lose.hide();
  match.start(assignments);
  hud.show(match, project);
  appState = "pertandingan";
}

function openRoleSelect(previous: readonly Assignment[] = []): void {
  const keep = [...previous];
  match.stop();
  hud.hide();
  lose.hide();
  roleSelect.show(keep);
  appState = "pilihPeran";
}

// --- Benchmark: 4 pemain + musuh penuh + skill aktif ---
const benchmark = new Benchmark(
  input,
  (l) => quality.apply(l),
  () => renderSize(engine),
  (text) => (status.textContent = text),
  (results) => {
    match.setBenchmarkMode(false);
    openRoleSelect();
    showBenchResults(results);
  },
);

function startBenchmark(order?: QualityLevel[]): void {
  if (benchmark.running) return;
  startMatch(ROLES.map((r, slot) => ({ slot, roleId: r.id })));
  match.setBenchmarkMode(true);
  benchmark.start(order);
}

input.onSystemKey(SYSTEM_KEYS.toggleDebug, () => debug.toggle());
input.onSystemKey(SYSTEM_KEYS.toggleQuality, () => quality.toggle());
input.onSystemKey(SYSTEM_KEYS.toggleFullscreen, toggleFullscreen);
input.onSystemKey(SYSTEM_KEYS.runBenchmark, () => startBenchmark());

// Mode uji skill: hanya saat pertandingan berjalan (bukan benchmark).
const inMatch = () => appState === "pertandingan" && !benchmark.running && match.state === "main";
input.onSystemKey(SYSTEM_KEYS.toggleTestMode, () => {
  if (inMatch()) match.setTestMode(!match.testMode);
});
input.onSystemKey(SYSTEM_KEYS.testSpawn, () => {
  if (inMatch() && match.testMode) match.testSpawnGroup();
});
input.onSystemKey(SYSTEM_KEYS.testCoins, () => {
  if (inMatch() && match.testMode) match.testAddCoins();
});
input.onSystemKey(SYSTEM_KEYS.testDown, () => {
  if (inMatch() && match.testMode) match.testDownNext();
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

  if (appState === "pilihPeran") {
    roleSelect.update(dt);
    return;
  }
  match.update(dt);
  hud.update(match, dt, project);
  if (match.state === "kalah" && !lose.shown) {
    lose.show(
      { waves: match.waves.wave, kills: match.kills, coins: match.coinCount, seconds: match.elapsed },
      match.activePlayers.map((p) => p.slot),
    );
  }
  lose.update(dt);
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
      activeEnemies: match.enemies.activeCount,
      enemyCapacity: match.enemies.capacity,
      quality: quality.level,
      renderWidth: size.w,
      renderHeight: size.h,
      gpu: gpuName,
      projectiles: match.projectiles.activeCount,
      coinsOnGround: match.coins.activeCount,
      particles: match.effects.activeParticles,
      enemyTriangles: match.enemies.modelTriangles,
    },
    match.activePlayers,
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

// Info anggaran segitiga ke konsol (batas: karakter 800, musuh 300 untuk Tikus Raksasa).
console.log(
  "Segitiga per karakter:",
  match.players.map((p) => `${p.role.name}=${p.triangleCount}`).join(", "),
  `· Tikus Raksasa=${match.enemies.modelTriangles}`,
);

// Akses dari konsol browser saat pengembangan (tidak ada di build pameran).
if (import.meta.env.DEV) {
  (window as unknown as Record<string, unknown>).__game = { match, input, engine, roleSelect, lose };
}

// Untuk tes: ?roles=penyerang,penjaga langsung main (slot P1, P2, ... sesuai urutan).
const quickRoles = (params.get("roles") ?? "")
  .split(",")
  .filter((id): id is RoleId => ROLES.some((r) => r.id === id));
if (quickRoles.length > 0) {
  startMatch(quickRoles.map((roleId, slot) => ({ slot, roleId })));
  if (params.has("uji")) match.setTestMode(true); // ?roles=...&uji langsung ke mode uji
} else openRoleSelect();

// ?bench atau ?bench=sedang,rendah (urutan kustom).
if (params.has("bench")) {
  const order = (params.get("bench") || "rendah,sedang")
    .split(",")
    .filter((l): l is QualityLevel => l === "rendah" || l === "sedang");
  startBenchmark(order.length ? order : undefined);
}
if (params.has("debug")) debug.toggle();
