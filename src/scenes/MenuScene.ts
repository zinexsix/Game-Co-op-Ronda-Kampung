import { PLAYER_BINDINGS } from "../config/controls";
import { ROLES } from "../data/types";
import type { AudioSystem, VolumeKind } from "../systems/AudioSystem";
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
    audio: AudioSystem,
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
      <ul class="menu-controls">${controls}</ul>
      <div class="menu-volume"></div>`;
    // Pengaturan volume (mouse operator stan); nilai awal dari game.json.
    const vol = this.el.querySelector(".menu-volume") as HTMLDivElement;
    for (const [kind, label] of [["music", "🎵 Musik"], ["sfx", "🔔 Efek suara"]] as [VolumeKind, string][]) {
      const row = document.createElement("label");
      row.innerHTML = `<span>${label}</span><input type="range" min="0" max="100" step="5"><b></b>`;
      const range = row.querySelector("input") as HTMLInputElement;
      const value = row.querySelector("b") as HTMLElement;
      range.value = String(Math.round(audio.getVolume(kind) * 100));
      value.textContent = `${range.value}%`;
      range.addEventListener("input", () => {
        audio.unlock();
        audio.setVolume(kind, Number(range.value) / 100);
        value.textContent = `${range.value}%`;
        if (kind === "sfx") audio.play("koin");
      });
      // Lepas fokus agar tombol panah tidak menggeser slider saat bermain.
      range.addEventListener("change", () => range.blur());
      vol.appendChild(row);
    }
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
