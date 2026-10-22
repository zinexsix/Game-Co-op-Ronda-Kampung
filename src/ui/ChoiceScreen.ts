import { PLAYER_BINDINGS } from "../config/controls";
import type { InputManager } from "../systems/InputManager";

export interface ChoiceContent {
  /** "kalah" = bingkai merah, "menang" = bingkai hijau. */
  variant: "kalah" | "menang";
  title: string;
  subtitle: string;
  /** Isi tambahan (HTML tepercaya buatan game: rincian skor, statistik). */
  bodyHtml: string;
  primaryLabel: string;
  secondaryLabel: string;
}

/**
 * Layar pilihan di tengah layar (Kalah, transisi antar level, selesai).
 * Tombol utama = skill 1 pemain mana saja, tombol kedua = skill 2 (atau klik).
 */
export class ChoiceScreen {
  private readonly el: HTMLDivElement;
  private readonly box: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly subtitle: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private readonly primary: HTMLButtonElement;
  private readonly secondary: HTMLButtonElement;
  private visible = false;
  private delay = 0;
  private slots: number[] = [];
  private onPrimary: () => void = () => {};
  private onSecondary: () => void = () => {};

  constructor(
    parent: HTMLElement,
    private readonly input: InputManager,
    /** Jeda sebelum tombol diterima, supaya tombol yang sedang ditahan tidak langsung memilih. */
    private readonly inputDelaySec: number,
  ) {
    const s1 = PLAYER_BINDINGS.map((b) => b.skill1Label).join(" / ");
    const s2 = PLAYER_BINDINGS.map((b) => b.skill2Label).join(" / ");
    this.el = document.createElement("div");
    this.el.className = "choice-screen";
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="choice-box">
        <div class="choice-title"></div>
        <div class="choice-sub"></div>
        <div class="choice-body"></div>
        <div class="choice-buttons">
          <button class="primary"><span></span><small>${s1}</small></button>
          <button class="secondary"><span></span><small>${s2}</small></button>
        </div>
      </div>`;
    this.box = this.el.querySelector(".choice-box") as HTMLDivElement;
    this.title = this.el.querySelector(".choice-title") as HTMLDivElement;
    this.subtitle = this.el.querySelector(".choice-sub") as HTMLDivElement;
    this.body = this.el.querySelector(".choice-body") as HTMLDivElement;
    this.primary = this.el.querySelector(".primary") as HTMLButtonElement;
    this.secondary = this.el.querySelector(".secondary") as HTMLButtonElement;
    this.primary.addEventListener("click", () => this.choose(this.onPrimary));
    this.secondary.addEventListener("click", () => this.choose(this.onSecondary));
    parent.appendChild(this.el);
  }

  get shown(): boolean {
    return this.visible;
  }

  /** `slots` = slot pemain yang ikut bermain (hanya mereka yang bisa memilih). */
  show(content: ChoiceContent, slots: number[], onPrimary: () => void, onSecondary: () => void): void {
    this.box.className = `choice-box ${content.variant}`;
    this.title.textContent = content.title;
    this.subtitle.textContent = content.subtitle;
    this.body.innerHTML = content.bodyHtml;
    (this.primary.firstElementChild as HTMLSpanElement).textContent = content.primaryLabel;
    (this.secondary.firstElementChild as HTMLSpanElement).textContent = content.secondaryLabel;
    this.onPrimary = onPrimary;
    this.onSecondary = onSecondary;
    this.slots = slots;
    this.delay = this.inputDelaySec;
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
      if (press.skill1) return this.choose(this.onPrimary);
      if (press.skill2) return this.choose(this.onSecondary);
    }
  }

  private choose(action: () => void): void {
    (document.activeElement as HTMLElement | null)?.blur(); // jangan menahan fokus keyboard dari game
    this.hide();
    action();
  }
}
