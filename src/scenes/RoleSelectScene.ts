import { PLAYER_BINDINGS } from "../config/controls";
import { GAME_RULES, ROLES, type RoleId } from "../data/types";
import type { InputManager } from "../systems/InputManager";
import { SLOT_COLORS } from "../ui/slotColors";
import type { Assignment } from "./MatchScene";

type SlotState = "kosong" | "memilih" | "siap";

interface Slot {
  state: SlotState;
  /** Indeks peran yang sedang disorot (ROLES). */
  cursor: number;
  /** Status koneksi terakhir (render ulang saat gamepad tersambung/terputus). */
  connected: boolean;
}

/**
 * Layar pilih peran. Tiap pemain bergabung dengan tombol skill 1, memilih peran dengan
 * kiri/kanan, lalu menekan skill 1 lagi untuk siap. Satu peran hanya untuk satu pemain.
 * Permainan mulai (setelah hitung mundur singkat) jika semua yang bergabung siap, minimal 2.
 */
export class RoleSelectScene {
  private readonly el: HTMLDivElement;
  private readonly roleCards: HTMLDivElement[] = [];
  private readonly roleMarkers: HTMLDivElement[] = [];
  private readonly slotPanels: HTMLDivElement[] = [];
  private readonly footer: HTMLDivElement;
  private readonly slots: Slot[];
  private countdown: number = GAME_RULES.roleSelect.startCountdownSec;
  private visible = false;
  private dirty = true;

  constructor(
    parent: HTMLElement,
    private readonly input: InputManager,
    private readonly onStart: (assignments: Assignment[]) => void,
  ) {
    this.slots = PLAYER_BINDINGS.map(() => ({ state: "kosong", cursor: 0, connected: true }));

    this.el = document.createElement("div");
    this.el.className = "role-select";
    this.el.hidden = true;
    this.el.innerHTML = `
      <h1>RONDA BARENG</h1>
      <p class="subtitle">Jaga pos ronda bersama dari serbuan malam! Pilih peran kalian.</p>`;

    const cards = document.createElement("div");
    cards.className = "role-cards";
    for (const role of ROLES) {
      const card = document.createElement("div");
      card.className = "role-card";
      card.style.setProperty("--role", role.color);
      card.innerHTML = `
        <div class="role-icon">${role.icon}</div>
        <div class="role-name">${role.name}</div>
        <div class="role-desc">${role.description}</div>`;
      const markers = document.createElement("div");
      markers.className = "role-markers";
      card.appendChild(markers);
      cards.appendChild(card);
      this.roleCards.push(card);
      this.roleMarkers.push(markers);
    }
    this.el.appendChild(cards);

    const panels = document.createElement("div");
    panels.className = "slot-panels";
    PLAYER_BINDINGS.forEach((_b, i) => {
      const panel = document.createElement("div");
      panel.className = "slot-panel";
      panel.style.setProperty("--slot", SLOT_COLORS[i]);
      panels.appendChild(panel);
      this.slotPanels.push(panel);
    });
    this.el.appendChild(panels);

    this.footer = document.createElement("div");
    this.footer.className = "role-footer";
    this.el.appendChild(this.footer);
    parent.appendChild(this.el);
  }

  /** Tampilkan layar. `previous` = pembagian peran sebelumnya (pemain langsung tergabung). */
  show(previous: readonly Assignment[] = []): void {
    for (const s of this.slots) {
      s.state = "kosong";
      s.cursor = 0;
    }
    for (const a of previous) {
      this.slots[a.slot].state = "memilih";
      this.slots[a.slot].cursor = ROLES.findIndex((r) => r.id === a.roleId);
    }
    this.countdown = GAME_RULES.roleSelect.startCountdownSec;
    this.visible = true;
    this.el.hidden = false;
    this.dirty = true;
    this.render();
  }

  hide(): void {
    this.visible = false;
    this.el.hidden = true;
  }

  update(dt: number): void {
    if (!this.visible) return;
    this.slots.forEach((slot, i) => this.updateSlot(slot, i));

    const joined = this.slots.filter((s) => s.state !== "kosong");
    const canStart = joined.length >= GAME_RULES.roleSelect.minPlayers && joined.every((s) => s.state === "siap");
    if (canStart) {
      const before = Math.ceil(this.countdown);
      this.countdown -= dt;
      if (Math.ceil(this.countdown) !== before) this.dirty = true;
      if (this.countdown <= 0) {
        this.start();
        return;
      }
    } else if (this.countdown !== GAME_RULES.roleSelect.startCountdownSec) {
      this.countdown = GAME_RULES.roleSelect.startCountdownSec;
      this.dirty = true;
    }
    if (this.dirty) this.render();
  }

  private updateSlot(slot: Slot, i: number): void {
    const state = this.input.getState(i);
    const press = this.input.getPresses(i);
    if (state.connected !== slot.connected) {
      slot.connected = state.connected;
      this.dirty = true;
    }
    if (!state.connected) {
      if (slot.state !== "kosong") this.setState(slot, "kosong");
      return;
    }
    switch (slot.state) {
      case "kosong":
        if (press.skill1) {
          slot.cursor = this.nextFree(i, -1, 1);
          this.setState(slot, "memilih");
        }
        break;
      case "memilih":
        // Peran yang disorot baru saja dikunci pemain lain: geser ke peran bebas.
        if (this.takenBy(slot.cursor, i)) {
          slot.cursor = this.nextFree(i, slot.cursor, 1);
          this.dirty = true;
        }
        if (press.left || press.right) {
          slot.cursor = this.nextFree(i, slot.cursor, press.right ? 1 : -1);
          this.dirty = true;
        }
        if (press.skill1 && !this.takenBy(slot.cursor, i)) this.setState(slot, "siap");
        else if (press.skill2) this.setState(slot, "kosong");
        break;
      case "siap":
        if (press.skill2) this.setState(slot, "memilih");
        break;
    }
  }

  private setState(slot: Slot, state: SlotState): void {
    slot.state = state;
    this.dirty = true;
  }

  /** true jika peran `roleIndex` sudah dikunci (siap) oleh pemain selain `slotIndex`. */
  private takenBy(roleIndex: number, slotIndex: number): boolean {
    return this.slots.some((s, j) => j !== slotIndex && s.state === "siap" && s.cursor === roleIndex);
  }

  /** Peran bebas berikutnya dari `from` ke arah `dir` (berputar). */
  private nextFree(slotIndex: number, from: number, dir: 1 | -1): number {
    const n = ROLES.length;
    for (let step = 1; step <= n; step++) {
      const idx = (((from + dir * step) % n) + n) % n;
      if (!this.takenBy(idx, slotIndex)) return idx;
    }
    return Math.max(0, from);
  }

  private start(): void {
    const assignments: Assignment[] = [];
    this.slots.forEach((s, slot) => {
      if (s.state === "siap") assignments.push({ slot, roleId: ROLES[s.cursor].id as RoleId });
    });
    this.hide();
    this.onStart(assignments);
  }

  private render(): void {
    this.dirty = false;

    ROLES.forEach((_role, r) => {
      const owner = this.slots.findIndex((s) => s.state === "siap" && s.cursor === r);
      this.roleCards[r].classList.toggle("taken", owner >= 0);
      this.roleMarkers[r].innerHTML = this.slots
        .map((s, i) => {
          if (s.state === "kosong" || s.cursor !== r) return "";
          const cls = s.state === "siap" ? "marker ready" : "marker";
          return `<span class="${cls}" style="--slot:${SLOT_COLORS[i]}">P${i + 1}${s.state === "siap" ? " ✔" : ""}</span>`;
        })
        .join("");
      if (owner >= 0) this.roleCards[r].style.setProperty("--owner", SLOT_COLORS[owner]);
    });

    this.slots.forEach((s, i) => {
      const b = PLAYER_BINDINGS[i];
      const connected = this.input.getState(i).connected;
      let status: string;
      if (!connected) status = "Gamepad belum terhubung";
      else if (s.state === "kosong") status = `Tekan <kbd>${b.skill1Label}</kbd> untuk bergabung`;
      else if (s.state === "memilih")
        status = `<kbd>${b.leftRightLabel}</kbd> pilih · <kbd>${b.skill1Label}</kbd> siap · <kbd>${b.skill2Label}</kbd> keluar`;
      else status = `✔ Siap: <b>${ROLES[s.cursor].icon} ${ROLES[s.cursor].name}</b> · <kbd>${b.skill2Label}</kbd> batal`;
      const panel = this.slotPanels[i];
      panel.className = `slot-panel ${s.state}${connected ? "" : " offline"}`;
      panel.innerHTML = `<div class="slot-title">P${i + 1} <span>${b.label}</span></div><div class="slot-status">${status}</div>`;
    });

    const joined = this.slots.filter((s) => s.state !== "kosong").length;
    const ready = this.slots.filter((s) => s.state === "siap").length;
    const min = GAME_RULES.roleSelect.minPlayers;
    let text: string;
    if (joined < min) text = `Butuh minimal ${min} pemain · ${joined} bergabung`;
    else if (ready < joined) text = `Menunggu semua siap · ${ready}/${joined} siap`;
    else text = `Mulai dalam ${Math.max(1, Math.ceil(this.countdown))}…`;
    this.footer.textContent = text;
    this.footer.classList.toggle("go", joined >= min && ready === joined);
  }
}
