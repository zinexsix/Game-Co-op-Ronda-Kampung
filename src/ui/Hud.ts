import { PLAYER_BINDINGS } from "../config/controls";
import type { Player } from "../entities/Player";
import type { SkillStatus } from "../roles/RoleAbility";
import type { MatchScene } from "../scenes/MatchScene";
import { SLOT_COLORS } from "./slotColors";

const LOW_HP_RATIO = 0.3;

interface SkillView {
  root: HTMLDivElement;
  fill: HTMLDivElement;
  time: HTMLSpanElement;
  last: string;
}

interface PlayerCard {
  player: Player;
  root: HTMLDivElement;
  hpFill: HTMLDivElement;
  hpText: HTMLSpanElement;
  skills: SkillView[];
  lastHp: number;
  lastDowned: boolean;
}

/**
 * HUD 2D: bar nyawa pos ronda (besar, atas tengah), koin bersama, info gelombang,
 * dan kartu tiap pemain di bawah (ikon peran, HP, cooldown skill).
 * DOM dibuat sekali per pertandingan; tiap frame hanya nilai yang berubah yang ditulis.
 */
export class Hud {
  private readonly el: HTMLDivElement;
  private readonly baseFill: HTMLDivElement;
  private readonly baseText: HTMLSpanElement;
  private readonly basePanel: HTMLDivElement;
  private readonly coinText: HTMLSpanElement;
  private readonly waveText: HTMLSpanElement;
  private readonly cardRow: HTMLDivElement;
  private cards: PlayerCard[] = [];
  private lastBaseHp = -1;
  private lastBaseHits = 0;
  private lastCoins = -1;
  private lastWave = "";

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "hud";
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="hud-top">
        <div class="base-panel">
          <div class="base-label">🏠 POS RONDA</div>
          <div class="base-bar"><div class="base-fill"></div><span class="base-text"></span></div>
        </div>
        <div class="hud-info">
          <span class="coin-count"></span>
          <span class="wave-info"></span>
        </div>
      </div>
      <div class="player-cards"></div>`;
    parent.appendChild(this.el);
    this.basePanel = this.el.querySelector(".base-panel") as HTMLDivElement;
    this.baseFill = this.el.querySelector(".base-fill") as HTMLDivElement;
    this.baseText = this.el.querySelector(".base-text") as HTMLSpanElement;
    this.coinText = this.el.querySelector(".coin-count") as HTMLSpanElement;
    this.waveText = this.el.querySelector(".wave-info") as HTMLSpanElement;
    this.cardRow = this.el.querySelector(".player-cards") as HTMLDivElement;
  }

  /** Bangun kartu pemain untuk pertandingan ini lalu tampilkan HUD. */
  show(match: MatchScene): void {
    this.cardRow.innerHTML = "";
    this.cards = match.activePlayers.map((p) => this.buildCard(p, match.abilityOf(p).skills));
    this.lastBaseHp = -1;
    this.lastBaseHits = match.markas.hitCount;
    this.lastCoins = -1;
    this.lastWave = "";
    this.el.hidden = false;
    this.update(match);
  }

  hide(): void {
    this.el.hidden = true;
  }

  update(match: MatchScene): void {
    const m = match.markas;
    if (m.hp !== this.lastBaseHp) {
      this.lastBaseHp = m.hp;
      const ratio = m.hp / m.maxHp;
      this.baseFill.style.width = `${ratio * 100}%`;
      this.baseFill.classList.toggle("low", ratio <= LOW_HP_RATIO);
      this.baseText.textContent = `${Math.ceil(m.hp)} / ${m.maxHp}`;
    }
    if (m.hitCount !== this.lastBaseHits) {
      this.lastBaseHits = m.hitCount;
      // Getar singkat tiap kali pos ronda diserang.
      this.basePanel.animate(
        [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }],
        { duration: 160 },
      );
    }
    if (match.coinCount !== this.lastCoins) {
      this.lastCoins = match.coinCount;
      this.coinText.textContent = `🪙 ${match.coinCount}`;
    }

    const w = match.waves;
    const waveText =
      w.wave === 0
        ? `Bersiap… ${Math.ceil(w.timer)}`
        : w.phase === "jeda"
          ? `Gelombang ${w.wave} selesai! Berikutnya ${Math.ceil(w.timer)} dtk`
          : `Gelombang ${w.wave} · 🐀 ${match.enemies.activeCount + w.remainingToSpawn} tersisa`;
    if (waveText !== this.lastWave) {
      this.lastWave = waveText;
      this.waveText.textContent = waveText;
    }

    for (const c of this.cards) this.updateCard(c, match);
  }

  private buildCard(player: Player, skills: readonly SkillStatus[]): PlayerCard {
    const b = PLAYER_BINDINGS[player.slot];
    const root = document.createElement("div");
    root.className = "player-card";
    root.style.setProperty("--role", player.role.color);
    root.style.setProperty("--slot", SLOT_COLORS[player.slot]);
    root.innerHTML = `
      <div class="card-head">
        <span class="slot-badge">P${player.slot + 1}</span>
        <span class="card-icon">${player.role.icon}</span>
        <span class="card-name">${player.role.name}</span>
        <span class="downed-badge">JATUH</span>
      </div>
      <div class="hp-bar"><div class="hp-fill"></div><span class="hp-text"></span></div>
      <div class="skills"></div>`;
    const skillRow = root.querySelector(".skills") as HTMLDivElement;
    const keys = [b.skill1Label, b.skill2Label];
    const views = skills.map((s, i) => {
      const el = document.createElement("div");
      el.className = `skill${s.implemented ? "" : " pending"}`;
      if (!s.implemented) el.title = "Menyusul di Tahap 3";
      el.innerHTML = `
        <div class="skill-fill"></div>
        <kbd>${keys[i]}</kbd>
        <span class="skill-name">${s.data.name}</span>
        <span class="skill-time">${s.implemented ? "" : "🔒"}</span>`;
      skillRow.appendChild(el);
      return {
        root: el,
        fill: el.querySelector(".skill-fill") as HTMLDivElement,
        time: el.querySelector(".skill-time") as HTMLSpanElement,
        last: "",
      };
    });
    this.cardRow.appendChild(root);
    return {
      player,
      root,
      hpFill: root.querySelector(".hp-fill") as HTMLDivElement,
      hpText: root.querySelector(".hp-text") as HTMLSpanElement,
      skills: views,
      lastHp: -1,
      lastDowned: false,
    };
  }

  private updateCard(c: PlayerCard, match: MatchScene): void {
    const p = c.player;
    if (p.hp !== c.lastHp) {
      c.lastHp = p.hp;
      const ratio = p.hp / p.maxHp;
      c.hpFill.style.width = `${ratio * 100}%`;
      c.hpFill.classList.toggle("low", ratio <= LOW_HP_RATIO);
      c.hpText.textContent = `${Math.ceil(p.hp)} / ${p.maxHp}`;
    }
    if (p.downed !== c.lastDowned) {
      c.lastDowned = p.downed;
      c.root.classList.toggle("downed", p.downed);
    }
    const skills = match.abilityOf(p).skills;
    c.skills.forEach((v, i) => {
      const s = skills[i];
      if (!s.implemented) return;
      const cd = s.data.cooldown ?? 0;
      const ratio = cd > 0 ? s.cooldownLeft / cd : 0;
      // Kunci status supaya DOM hanya disentuh saat tampilan berubah (sisa detik dibulatkan).
      const key = `${s.active ? 1 : 0}|${Math.ceil(s.cooldownLeft)}|${Math.round(ratio * 50)}`;
      if (key === v.last) return;
      v.last = key;
      v.fill.style.height = `${ratio * 100}%`;
      v.time.textContent = s.cooldownLeft > 0 ? `${Math.ceil(s.cooldownLeft)}` : "";
      v.root.classList.toggle("cooling", s.cooldownLeft > 0);
      v.root.classList.toggle("using", s.active);
    });
  }
}
