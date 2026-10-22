import { PLAYER_BINDINGS } from "../config/controls";
import { ROLES } from "../data/types";
import type { InputManager } from "../systems/InputManager";

/**
 * Menu utama (layar judul): pemain mana pun menekan tombol skill 1 untuk mulai.
 * Slot yang menekan langsung ikut bergabung di layar pilih peran.
 */
export class MenuScene {
  private readonly el: HTMLDivElement;
  private visible = false;

  constructor(
    parent: HTMLElement,
    private readonly input: InputManager,
    private readonly onStart: (slot: number) => void,
  ) {
    const keys = PLAYER_BINDINGS.map((b) => `<kbd>${b.skill1Label}</kbd>`).join(" ");
    const controls = PLAYER_BINDINGS.map((b, i) => `<li><b>P${i + 1}</b> ${b.label}</li>`).join("");
    const roles = ROLES.map((r) => `<span style="color:${r.color}">${r.icon} ${r.name}</span>`).join(" · ");
    this.el = document.createElement("div");
    this.el.className = "menu-screen";
    this.el.hidden = true;
    this.el.innerHTML = `
      <h1>RONDA BARENG</h1>
      <p class="menu-tagline">Jaga pos ronda kampung dari serbuan malam, bareng-bareng! · <i>Play Your Way</i></p>
      <p class="menu-roles">${roles}</p>
      <div class="menu-start">Tekan ${keys} untuk mulai</div>
      <p class="menu-note">1-4 pemain di satu layar · peran yang kosong dimainkan bot</p>
      <ul class="menu-controls">${controls}</ul>`;
    parent.appendChild(this.el);
  }

  get shown(): boolean {
    return this.visible;
  }

  show(): void {
    this.visible = true;
    this.el.hidden = false;
  }

  hide(): void {
    this.visible = false;
    this.el.hidden = true;
  }

  update(): void {
    if (!this.visible) return;
    for (let i = 0; i < this.input.playerCount; i++) {
      if (this.input.getPresses(i).skill1) {
        this.hide();
        this.onStart(i);
        return;
      }
    }
  }
}
