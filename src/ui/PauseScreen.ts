/** Layar jeda di tengah layar (tab kehilangan fokus, gamepad dicabut, grafis terputus). */
export class PauseScreen {
  private readonly el: HTMLDivElement;
  private readonly title: HTMLDivElement;
  private readonly body: HTMLDivElement;
  private visible = false;

  constructor(parent: HTMLElement, onClick: () => void) {
    this.el = document.createElement("div");
    this.el.className = "pause-screen";
    this.el.hidden = true;
    this.el.innerHTML = `<div class="pause-box"><div class="pause-title"></div><div class="pause-body"></div></div>`;
    this.title = this.el.querySelector(".pause-title") as HTMLDivElement;
    this.body = this.el.querySelector(".pause-body") as HTMLDivElement;
    this.el.addEventListener("click", onClick);
    parent.appendChild(this.el);
  }

  get shown(): boolean {
    return this.visible;
  }

  show(title: string, bodyHtml: string): void {
    this.title.textContent = title;
    this.body.innerHTML = bodyHtml;
    this.visible = true;
    this.el.hidden = false;
  }

  hide(): void {
    this.visible = false;
    this.el.hidden = true;
  }
}
