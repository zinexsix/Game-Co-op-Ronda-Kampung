import type { AbstractEngine, Scene, SceneInstrumentation } from "@babylonjs/core";
import type { Player } from "../entities/Player";
import type { InputManager } from "../systems/InputManager";
import { PLAYER_BINDINGS } from "../config/controls";
import { QUALITY_PRESETS, type QualityLevel } from "../config/quality";

export interface DebugStats {
  fps: number;
  drawCalls: number;
  triangles: number;
  activeEnemies: number;
  enemyCapacity: number;
  quality: QualityLevel;
  renderWidth: number;
  renderHeight: number;
  gpu: string;
  projectiles: number;
  coinsOnGround: number;
  particles: number;
  enemyTriangles: number;
}

const REFRESH_SEC = 0.25;

/** Layar debug (toggle F1): FPS, draw call, segitiga, musuh aktif, input per pemain. */
export class DebugOverlay {
  private readonly el: HTMLDivElement;
  private visible = false;
  private timer = 0;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "debug-overlay";
    this.el.hidden = true;
    parent.appendChild(this.el);
  }

  toggle(): void {
    this.visible = !this.visible;
    this.el.hidden = !this.visible;
    this.timer = 0;
  }

  update(dt: number, stats: DebugStats, players: readonly Player[], input: InputManager): void {
    if (!this.visible) return;
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = REFRESH_SEC;

    const rows = players
      .map((p) => {
        const i = p.slot;
        const s = input.getState(i);
        const b = PLAYER_BINDINGS[i];
        const dir = s.connected ? arrow(s.moveX, s.moveZ) : "—";
        const move = s.connected ? `${s.moveX.toFixed(2)}, ${s.moveZ.toFixed(2)}` : "tidak terhubung";
        return `<tr style="color:${p.role.color}">
          <td>P${i + 1}</td><td>${p.role.name}</td><td>HP ${Math.ceil(p.hp)}${p.downed ? " (jatuh)" : ""}</td><td>${b.label}</td>
          <td class="dir">${dir}</td><td>${move}</td>
          <td class="${s.skill1 ? "on" : ""}">S1</td><td class="${s.skill2 ? "on" : ""}">S2</td></tr>`;
      })
      .join("");

    const fpsClass = stats.fps >= 30 ? "good" : "bad";
    const pads = input.gamepadNames;
    this.el.innerHTML = `
      <div class="big ${fpsClass}">${stats.fps.toFixed(0)} FPS</div>
      <div>Draw call: <b>${stats.drawCalls}</b> · Segitiga: <b>${stats.triangles.toLocaleString("id-ID")}</b></div>
      <div>Musuh aktif: <b>${stats.activeEnemies}/${stats.enemyCapacity}</b> · Model tikus ${stats.enemyTriangles} segitiga</div>
      <div>Proyektil ${stats.projectiles} · Koin di tanah ${stats.coinsOnGround} · Partikel ${stats.particles}</div>
      <div>Kualitas: <b>${QUALITY_PRESETS[stats.quality].label}</b> · Render ${stats.renderWidth}×${stats.renderHeight}</div>
      <div class="keys">GPU: ${stats.gpu}</div>
      <table>${rows}</table>
      <div class="keys">Tombol ditekan: ${input.pressedKeys.join(" ") || "-"}</div>
      <div class="keys">Gamepad: ${pads.length ? pads.join(" | ") : "belum terdeteksi (tekan tombol apa saja di gamepad)"}</div>
      <div class="hint">F1 debug · F2 kualitas · F3 benchmark · F4 layar penuh · F6 mode uji skill (F7 tikus · F8 koin · F9 jatuhkan)</div>`;
  }
}

function arrow(x: number, z: number): string {
  if (Math.hypot(x, z) < 0.1) return "·";
  const arrows = ["→", "↗", "↑", "↖", "←", "↙", "↓", "↘"];
  const a = Math.atan2(z, x);
  return arrows[(Math.round(a / (Math.PI / 4)) + 8) % 8];
}

/** Hitung segitiga yang benar-benar digambar (termasuk thin instances), tanpa pass bayangan. */
export function countRenderedTriangles(scene: Scene): number {
  let total = 0;
  const active = scene.getActiveMeshes();
  for (let i = 0; i < active.length; i++) {
    const m = active.data[i];
    const tris = m.getTotalIndices() / 3;
    const copies = m.hasThinInstances ? (m as unknown as { thinInstanceCount: number }).thinInstanceCount : 1;
    total += tris * copies;
  }
  return total;
}

/** Draw call frame terakhir (termasuk pass bayangan). Baca setelah render. */
export function readDrawCalls(instr: SceneInstrumentation): number {
  return instr.drawCallsCounter.current;
}

export function renderSize(engine: AbstractEngine): { w: number; h: number } {
  return { w: engine.getRenderWidth(), h: engine.getRenderHeight() };
}
