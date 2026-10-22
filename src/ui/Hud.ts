import { PLAYER_BINDINGS, SYSTEM_KEYS } from "../config/controls";
import type { Player } from "../entities/Player";
import type { SkillStatus } from "../roles/RoleAbility";
import type { MatchScene } from "../scenes/MatchScene";
import { SLOT_COLORS } from "./slotColors";

const LOW_HP_RATIO = 0.3;
const NOTICE_SEC = 1.8;
/** Tinggi bar revive di atas karakter (meter). */
const REVIVE_BAR_HEIGHT = 2.4;

/** Proyeksi titik dunia ke piksel layar (CSS); null jika di luar layar. */
export type Projector = (x: number, y: number, z: number) => { x: number; y: number } | null;

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
  notice: HTMLDivElement;
  noticeTimer: number;
  skills: SkillView[];
  revive: HTMLDivElement;
  reviveFill: HTMLDivElement;
  reviveText: HTMLSpanElement;
  lastHp: number;
  lastDowned: boolean;
  lastRevive: number;
}

/**
 * HUD 2D: bar nyawa pos ronda (besar, atas tengah), koin bersama, info gelombang,
 * kartu tiap pemain di bawah (ikon peran, HP, cooldown/biaya skill, pesan singkat),
 * dan bar revive yang melayang di atas pemain yang jatuh.
 * DOM dibuat sekali per pertandingan; tiap frame hanya nilai yang berubah yang ditulis.
 */
export class Hud {
  private readonly el: HTMLDivElement;
  private readonly baseFill: HTMLDivElement;
  private readonly baseText: HTMLSpanElement;
  private readonly basePanel: HTMLDivElement;
  private readonly coinText: HTMLSpanElement;
  private readonly waveText: HTMLSpanElement;
  private readonly testBadge: HTMLDivElement;
  private readonly cardRow: HTMLDivElement;
  private readonly floatLayer: HTMLDivElement;
  private cards: PlayerCard[] = [];
  private lastBaseHp = -1;
  private lastBaseHits = 0;
  private lastCoins = -1;
  private lastWave = "";
  private lastTestMode = false;

  constructor(parent: HTMLElement) {
    this.el = document.createElement("div");
    this.el.className = "hud";
    this.el.hidden = true;
    this.el.innerHTML = `
      <div class="float-layer"></div>
      <div class="hud-top">
        <div class="base-panel">
          <div class="base-label">🏠 POS RONDA</div>
          <div class="base-bar"><div class="base-fill"></div><span class="base-text"></span></div>
        </div>
        <div class="hud-info">
          <span class="coin-count"></span>
          <span class="wave-info"></span>
        </div>
        <div class="test-badge" hidden>MODE UJI · ${SYSTEM_KEYS.testSpawn} munculkan tikus · ${SYSTEM_KEYS.testCoins} +koin & reset cooldown · ${SYSTEM_KEYS.testDown} jatuhkan pemain · ${SYSTEM_KEYS.toggleTestMode} keluar</div>
      </div>
      <div class="player-cards"></div>`;
    parent.appendChild(this.el);
    this.basePanel = this.el.querySelector(".base-panel") as HTMLDivElement;
    this.baseFill = this.el.querySelector(".base-fill") as HTMLDivElement;
    this.baseText = this.el.querySelector(".base-text") as HTMLSpanElement;
    this.coinText = this.el.querySelector(".coin-count") as HTMLSpanElement;
    this.waveText = this.el.querySelector(".wave-info") as HTMLSpanElement;
    this.testBadge = this.el.querySelector(".test-badge") as HTMLDivElement;
    this.cardRow = this.el.querySelector(".player-cards") as HTMLDivElement;
    this.floatLayer = this.el.querySelector(".float-layer") as HTMLDivElement;
  }

  /** Bangun kartu pemain untuk pertandingan ini lalu tampilkan HUD. */
  show(match: MatchScene, project: Projector): void {
    this.cardRow.innerHTML = "";
    this.floatLayer.innerHTML = "";
    this.cards = match.activePlayers.map((p) => this.buildCard(p, match.abilityOf(p).skills));
    this.lastBaseHp = -1;
    this.lastBaseHits = match.markas.hitCount;
    this.lastCoins = -1;
    this.lastWave = "";
    this.el.hidden = false;
    this.update(match, 0, project);
  }

  hide(): void {
    this.el.hidden = true;
  }

  update(match: MatchScene, dt: number, project: Projector): void {
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
      shake(this.basePanel);
    }
    if (match.coinCount !== this.lastCoins) {
      this.lastCoins = match.coinCount;
      this.coinText.textContent = `🪙 ${match.coinCount}`;
    }
    if (match.testMode !== this.lastTestMode) {
      this.lastTestMode = match.testMode;
      this.testBadge.hidden = !match.testMode;
    }

    const w = match.waves;
    const waveText = w.paused
      ? match.testMode
        ? `Gelombang berhenti · 🐀 ${match.enemies.activeCount}`
        : `🐀 ${match.enemies.activeCount}`
      : w.wave === 0
        ? `Bersiap… ${Math.ceil(w.timer)}`
        : w.phase === "jeda"
          ? `Gelombang ${w.wave} selesai! Berikutnya ${Math.ceil(w.timer)} dtk`
          : `Gelombang ${w.wave} · 🐀 ${match.enemies.activeCount + w.remainingToSpawn} tersisa`;
    if (waveText !== this.lastWave) {
      this.lastWave = waveText;
      this.waveText.textContent = waveText;
    }

    for (const n of match.takeNotices()) {
      const c = this.cards.find((q) => q.player.slot === n.slot);
      if (!c) continue;
      c.notice.textContent = n.text;
      c.notice.hidden = false;
      c.noticeTimer = NOTICE_SEC;
      shake(c.notice);
      if (n.kind === "koin") {
        shake(this.coinText);
        this.coinText.animate([{ color: "#f87171" }, { color: "#f87171" }, { color: "#fde047" }], { duration: 700 });
      }
    }

    for (const c of this.cards) this.updateCard(c, match, dt, project);
  }

  private buildCard(player: Player, skills: readonly SkillStatus[]): PlayerCard {
    const b = PLAYER_BINDINGS[player.slot];
    const root = document.createElement("div");
    root.className = "player-card";
    root.style.setProperty("--role", player.role.color);
    root.style.setProperty("--slot", SLOT_COLORS[player.slot]);
    root.innerHTML = `
      <div class="card-notice" hidden></div>
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
      el.className = "skill";
      el.innerHTML = `
        <div class="skill-fill"></div>
        <kbd>${keys[i]}</kbd>
        <span class="skill-name">${s.data.name}</span>
        <span class="skill-time"></span>`;
      skillRow.appendChild(el);
      return {
        root: el,
        fill: el.querySelector(".skill-fill") as HTMLDivElement,
        time: el.querySelector(".skill-time") as HTMLSpanElement,
        last: "",
      };
    });
    this.cardRow.appendChild(root);

    // Bar revive melayang di atas karakter (hanya tampil saat jatuh).
    const revive = document.createElement("div");
    revive.className = "revive-float";
    revive.style.setProperty("--slot", SLOT_COLORS[player.slot]);
    revive.hidden = true;
    revive.innerHTML = `<span class="revive-text"></span><div class="revive-bar"><div class="revive-fill"></div></div>`;
    this.floatLayer.appendChild(revive);

    return {
      player,
      root,
      hpFill: root.querySelector(".hp-fill") as HTMLDivElement,
      hpText: root.querySelector(".hp-text") as HTMLSpanElement,
      notice: root.querySelector(".card-notice") as HTMLDivElement,
      noticeTimer: 0,
      skills: views,
      revive,
      reviveFill: revive.querySelector(".revive-fill") as HTMLDivElement,
      reviveText: revive.querySelector(".revive-text") as HTMLSpanElement,
      lastHp: -1,
      lastDowned: false,
      lastRevive: -1,
    };
  }

  private updateCard(c: PlayerCard, match: MatchScene, dt: number, project: Projector): void {
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
      c.revive.hidden = !p.downed;
      c.lastRevive = -1;
    }
    if (c.noticeTimer > 0) {
      c.noticeTimer -= dt;
      if (c.noticeTimer <= 0) c.notice.hidden = true;
    }

    // Bar revive mengikuti posisi karakter di layar.
    if (p.downed) {
      const s = project(p.position.x, REVIVE_BAR_HEIGHT, p.position.z);
      if (s) c.revive.style.transform = `translate(${s.x}px, ${s.y}px) translate(-50%, -100%)`;
      const pct = Math.floor(p.reviveProgress * 100);
      if (pct !== c.lastRevive) {
        c.lastRevive = pct;
        c.reviveFill.style.width = `${pct}%`;
        c.reviveText.textContent = pct > 0 ? `Bangkit ${pct}%` : `P${p.slot + 1} butuh bantuan!`;
      }
    }

    const skills = match.abilityOf(p).skills;
    c.skills.forEach((v, i) => {
      const s = skills[i];
      const cd = s.data.cooldown ?? 0;
      const cost = s.data.coinCost ?? 0;
      const ratio = cd > 0 ? s.cooldownLeft / cd : 0;
      const poor = cost > 0 && match.coinCount < cost;
      // Kunci status supaya DOM hanya disentuh saat tampilan berubah (sisa detik dibulatkan).
      const key = `${s.active ? 1 : 0}|${Math.ceil(s.cooldownLeft)}|${Math.round(ratio * 50)}|${poor ? 1 : 0}|${p.downed ? 1 : 0}`;
      if (key === v.last) return;
      v.last = key;
      v.fill.style.height = `${ratio * 100}%`;
      v.time.textContent = s.cooldownLeft > 0 ? `${Math.ceil(s.cooldownLeft)}` : cost > 0 ? `${cost}🪙` : "";
      v.root.classList.toggle("cooling", s.cooldownLeft > 0 || p.downed);
      v.root.classList.toggle("using", s.active);
      v.root.classList.toggle("poor", poor);
    });
  }
}

/** Getar singkat (umpan balik). */
function shake(el: HTMLElement): void {
  el.animate(
    [{ transform: "translateX(0)" }, { transform: "translateX(-6px)" }, { transform: "translateX(6px)" }, { transform: "translateX(0)" }],
    { duration: 160 },
  );
}
