import { PLAYER_BINDINGS } from "../config/controls";
import type { InputManager } from "../systems/InputManager";

/** Jeda sebelum tombol diterima, supaya tombol yang sedang ditahan tidak langsung memilih. */
const INPUT_DELAY_SEC = 0.8;

export interface LoseStats {
  waves: number;
  kills: number;
  coins: number;
  seconds: number;
}

/** Layar Kalah: ringkasan + tombol Coba Lagi (skill 1) dan Ganti Peran (skill 2). */
export class LoseScreen {
  private readonly el: HTMLDivElement;
  private readonly stats: HTMLDivElement;
  private visible = false;
  private delay = 0;
  private slots: number[] = [];

  constructor(
    parent: HTMLElement,
    private readonly input: InputManager,
    private readonly onRetry: () => void,
    private readonly onChangeRoles: () => void,
  ) {
    const s1 = PLAYER_BINDINGS.map((b) => b.skill1Label).join(" / ");
    const s2 = PLAYER_BINDINGS.map((b) => b.skill2Label).join(" / ");
    this.el = document.createElement("div");
    this.el.className = "lose-screen";
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="lose-box">
        <div class="lose-title">KALAH</div>
        <div class="lose-sub">Pos ronda jebol diserbu tikus!</div>
        <div class="lose-stats"></div>
        <div class="lose-buttons">
          <button class="retry">🔁 Coba Lagi <small>${s1}</small></button>
          <button class="change">Ganti Peran <small>${s2}</small></button>
        </div>
      </div>`;
    this.stats = this.el.querySelector(".lose-stats") as HTMLDivElement;
    (this.el.querySelector(".retry") as HTMLButtonElement).addEventListener("click", () => this.choose(onRetry));
    (this.el.querySelector(".change") as HTMLButtonElement).addEventListener("click", () => this.choose(onChangeRoles));
    parent.appendChild(this.el);
  }

  get shown(): boolean {
    return this.visible;
  }

  /** `slots` = slot pemain yang ikut bermain (hanya mereka yang bisa memilih). */
  show(stats: LoseStats, slots: number[]): void {
    this.slots = slots;
    this.stats.innerHTML = `Bertahan sampai gelombang <b>${stats.waves}</b> · <b>${stats.kills}</b> tikus dikalahkan · 🪙 <b>${stats.coins}</b> · ${Math.floor(stats.seconds)} dtk`;
    this.delay = INPUT_DELAY_SEC;
    this.visible = true;
    this.el.hidden = false;
  }

  hide(): void {
    this.visible = false;
    this.el.hidden = true;
  }

  update(dt: number): void {
    if (!this.visible) return;
    this.delay -= dt;
    if (this.delay > 0) return;
    for (const slot of this.slots) {
      const press = this.input.getPresses(slot);
      if (press.skill1) return this.choose(this.onRetry);
      if (press.skill2) return this.choose(this.onChangeRoles);
    }
  }

  private choose(action: () => void): void {
    (document.activeElement as HTMLElement | null)?.blur(); // jangan menahan fokus keyboard dari game
    this.hide();
    action();
  }
}
