import { QUALITY_PRESETS, type QualityLevel } from "../config/quality";

/** Bar kecil di pojok kanan atas: pilihan kualitas Rendah/Sedang + tombol layar penuh. */
export class SettingsBar {
  private readonly buttons = new Map<QualityLevel, HTMLButtonElement>();

  constructor(parent: HTMLElement, onQuality: (level: QualityLevel) => void, onFullscreen: () => void) {
    const bar = document.createElement("div");
    bar.className = "settings-bar";
    const label = document.createElement("span");
    label.textContent = "Grafis:";
    bar.appendChild(label);

    for (const level of Object.keys(QUALITY_PRESETS) as QualityLevel[]) {
      const btn = makeButton(QUALITY_PRESETS[level].label, () => onQuality(level));
      this.buttons.set(level, btn);
      bar.appendChild(btn);
    }
    bar.appendChild(makeButton("Layar penuh", onFullscreen));
    parent.appendChild(bar);
  }

  setActive(level: QualityLevel): void {
    for (const [l, btn] of this.buttons) btn.classList.toggle("active", l === level);
  }
}

function makeButton(text: string, onClick: () => void): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.textContent = text;
  btn.addEventListener("click", () => {
    onClick();
    btn.blur(); // jangan menahan fokus keyboard dari game
  });
  return btn;
}

export function toggleFullscreen(): void {
  if (document.fullscreenElement) void document.exitFullscreen();
  else void document.documentElement.requestFullscreen().catch(() => undefined);
}
