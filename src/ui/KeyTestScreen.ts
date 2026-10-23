import { CONTROLS_INFO, PLAYER_BINDINGS, type KeyboardBinding } from "../config/controls";
import type { InputManager } from "../systems/InputManager";
import { SLOT_COLORS } from "./slotColors";

const FIELDS: [keyof Pick<KeyboardBinding, "up" | "down" | "left" | "right" | "skill1" | "skill2">, string][] = [
  ["up", "↑"],
  ["left", "←"],
  ["down", "↓"],
  ["right", "→"],
  ["skill1", "Skill 1"],
  ["skill2", "Skill 2"],
];

/**
 * Layar uji tombol: tiap tombol pemain menyala saat ditekan, plus rekor jumlah tombol
 * yang terbaca bersamaan. Dipakai untuk mengecek "ghosting" keyboard laptop
 * (beberapa kombinasi tombol tidak terbaca saat ditekan bersamaan).
 */
export class KeyTestScreen {
  private readonly el: HTMLDivElement;
  private readonly caps = new Map<string, HTMLElement[]>();
  private readonly maxText: HTMLSpanElement;
  private readonly nowText: HTMLSpanElement;
  private readonly padText: HTMLDivElement;
  private visible = false;
  private maxSeen = 0;

  constructor(
    parent: HTMLElement,
    private readonly input: InputManager,
  ) {
    this.el = document.createElement("div");
    this.el.className = "keytest-screen";
    this.el.hidden = true;
    parent.appendChild(this.el);
    this.maxText = document.createElement("span");
    this.nowText = document.createElement("span");
    this.padText = document.createElement("div");
  }

  get shown(): boolean {
    return this.visible;
  }

  toggle(): void {
    if (this.visible) this.hide();
    else this.show();
  }

  show(): void {
    this.build();
    this.maxSeen = 0;
    this.visible = true;
    this.el.hidden = false;
  }

  hide(): void {
    this.visible = false;
    this.el.hidden = true;
  }

  update(): void {
    if (!this.visible) return;
    const pressed = new Set(this.input.pressedKeys);
    for (const [code, els] of this.caps) for (const el of els) el.classList.toggle("on", pressed.has(code));
    const playerKeys = [...pressed].filter((c) => this.caps.has(c)).length;
    this.maxSeen = Math.max(this.maxSeen, playerKeys);
    this.nowText.textContent = String(playerKeys);
    this.maxText.textContent = String(this.maxSeen);
    const pads = this.input.gamepadNames;
    this.padText.textContent = pads.length ? `Gamepad terdeteksi: ${pads.join(" | ")}` : "Gamepad belum terdeteksi (tekan tombol apa saja di gamepad)";
  }

  /** Bangun ulang dari PLAYER_BINDINGS (bisa berubah jika controls.json diubah lalu dimuat ulang). */
  private build(): void {
    this.caps.clear();
    this.el.innerHTML = "";
    const box = document.createElement("div");
    box.className = "keytest-box";
    box.innerHTML = `
      <h2>Uji Tombol</h2>
      <p>Minta 3 pemain menekan tombol gerak + skill <b>bersamaan</b>. Tombol yang ditekan tapi tidak menyala
      berarti keyboard tidak bisa membaca kombinasi itu: pakai profil <b>"alternatif"</b> di
      <code>dist/config/controls.json</code> atau tambahkan gamepad.</p>
      <p class="keytest-profile">Profil: <b>${CONTROLS_INFO.profile}</b> (${CONTROLS_INFO.source === "file" ? "dari controls.json" : "bawaan"})</p>`;
    const stats = document.createElement("div");
    stats.className = "keytest-stats";
    stats.append("Tombol pemain ditekan: ", this.nowText, " · Rekor bersamaan: ", this.maxText);
    box.appendChild(stats);

    const grid = document.createElement("div");
    grid.className = "keytest-grid";
    PLAYER_BINDINGS.forEach((b, i) => {
      const col = document.createElement("div");
      col.className = "keytest-player";
      col.style.setProperty("--slot", SLOT_COLORS[i]);
      col.innerHTML = `<div class="keytest-title">P${i + 1} <small>${b.label}</small></div>`;
      if (b.kind === "keyboard") {
        for (const [field, label] of FIELDS) {
          const row = document.createElement("div");
          row.className = "keytest-row";
          row.innerHTML = `<span>${label}</span>`;
          for (const code of b[field]) {
            const cap = document.createElement("kbd");
            cap.textContent = prettyCode(code);
            row.appendChild(cap);
            this.caps.set(code, [...(this.caps.get(code) ?? []), cap]);
          }
          col.appendChild(row);
        }
      } else {
        col.appendChild(this.padText);
      }
      grid.appendChild(col);
    });
    box.appendChild(grid);

    if (CONTROLS_INFO.warnings.length > 0) {
      const warn = document.createElement("ul");
      warn.className = "keytest-warn";
      warn.innerHTML = CONTROLS_INFO.warnings.map((w) => `<li>⚠ ${w}</li>`).join("");
      box.appendChild(warn);
    } else {
      const ok = document.createElement("p");
      ok.className = "keytest-ok";
      ok.textContent = "✔ Tidak ada tombol yang dipakai dua kali atau tombol berisiko.";
      box.appendChild(ok);
    }
    const foot = document.createElement("p");
    foot.className = "keytest-foot";
    foot.textContent = "Tekan F10 untuk menutup.";
    box.appendChild(foot);
    this.el.appendChild(box);
  }
}

function prettyCode(code: string): string {
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  const map: Record<string, string> = {
    ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
    Comma: ",", Period: ".", Slash: "/", Semicolon: ";", Quote: "'", Enter: "Enter", Space: "Spasi",
  };
  return map[code] ?? code;
}
