/** Pesan kesalahan layar penuh (tanpa aset dari luar), mis. WebGL tidak tersedia. */
export function showFatal(title: string, lines: string[]): HTMLDivElement {
  const el = document.createElement("div");
  el.className = "fatal-screen";
  el.innerHTML = `<div class="fatal-box"><h1>${title}</h1>${lines.map((l) => `<p>${l}</p>`).join("")}</div>`;
  document.body.appendChild(el);
  return el;
}
