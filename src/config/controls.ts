// Pemetaan kontrol per pemain. Sumber utama: public/config/controls.json (di build: dist/config/controls.json),
// yang dimuat saat game mulai sehingga bisa diubah tanpa build ulang. Nilai di file ini hanya cadangan
// jika file JSON tidak ada atau rusak. Kode tombol memakai KeyboardEvent.code (posisi fisik).

/** Label tombol untuk petunjuk di layar (pilih peran, HUD). */
export interface BindingLabels {
  label: string;
  skill1Label: string;
  skill2Label: string;
  leftRightLabel: string;
}

export interface KeyboardBinding extends BindingLabels {
  kind: "keyboard";
  up: string[];
  down: string[];
  left: string[];
  right: string[];
  skill1: string[];
  skill2: string[];
}

export interface GamepadBinding extends BindingLabels {
  kind: "gamepad";
  /** Urutan gamepad yang terhubung (0 = gamepad pertama yang terdeteksi). */
  padOrder: number;
  axisX: number;
  axisY: number;
  /** Indeks tombol standar: 0 = A, 1 = B. */
  skill1Button: number;
  skill2Button: number;
  deadZone: number;
  /** D-pad sebagai cadangan stik (tombol standar 12-15). */
  useDpad: boolean;
}

export type PlayerBinding = KeyboardBinding | GamepadBinding;

/** Kontrol cadangan (sama dengan profil "standar" di controls.json). */
const DEFAULT_BINDINGS: PlayerBinding[] = [
  {
    kind: "keyboard",
    label: "WASD + Q/E",
    skill1Label: "Q", skill2Label: "E", leftRightLabel: "A / D",
    up: ["KeyW"], down: ["KeyS"], left: ["KeyA"], right: ["KeyD"],
    skill1: ["KeyQ"], skill2: ["KeyE"],
  },
  {
    kind: "keyboard",
    label: "Panah + , / .",
    skill1Label: ",", skill2Label: ".", leftRightLabel: "← / →",
    up: ["ArrowUp"], down: ["ArrowDown"], left: ["ArrowLeft"], right: ["ArrowRight"],
    skill1: ["Comma"], skill2: ["Period"],
  },
  {
    kind: "keyboard",
    label: "IJKL + U/O",
    skill1Label: "U", skill2Label: "O", leftRightLabel: "J / L",
    up: ["KeyI"], down: ["KeyK"], left: ["KeyJ"], right: ["KeyL"],
    skill1: ["KeyU"], skill2: ["KeyO"],
  },
  {
    kind: "gamepad",
    label: "Gamepad (stik kiri + A/B)",
    skill1Label: "A", skill2Label: "B", leftRightLabel: "stik ← / →",
    padOrder: 0,
    axisX: 0, axisY: 1,
    skill1Button: 0, skill2Button: 1,
    deadZone: 0.2,
    useDpad: true,
  },
];

/**
 * Kontrol yang dipakai game. Diisi ulang oleh loadControls() SEBELUM sistem lain dibuat,
 * jadi semua modul yang membaca array ini setelahnya mendapat versi dari file JSON.
 */
export const PLAYER_BINDINGS: PlayerBinding[] = DEFAULT_BINDINGS.map((b) => ({ ...b }));

/** Tombol sistem (bukan milik pemain). */
export const SYSTEM_KEYS = {
  toggleDebug: "F1",
  toggleQuality: "F2",
  runBenchmark: "F3",
  toggleFullscreen: "F4",
  /** Mode uji skill (gelombang berhenti + koin). F7-F9 hanya aktif di mode ini. */
  toggleTestMode: "F6",
  testSpawn: "F7",
  testCoins: "F8",
  testDown: "F9",
  /** Layar uji tombol (cek tombol bentrok / keyboard tidak membaca banyak tombol sekaligus). */
  keyTest: "F10",
} as const;

/** Tombol yang sebaiknya tidak dipakai pemain (perilaku Windows/browser). */
const RISKY_KEYS: Record<string, string> = {
  ShiftLeft: "Shift ditekan 5x memicu Sticky Keys Windows",
  ShiftRight: "Shift ditekan 5x memicu Sticky Keys Windows",
  ControlLeft: "Ctrl + tombol lain bisa menjalankan pintasan browser (Ctrl+W menutup tab)",
  ControlRight: "Ctrl + tombol lain bisa menjalankan pintasan browser (Ctrl+W menutup tab)",
  AltLeft: "Alt membuka menu browser / Alt+F4 menutup jendela",
  AltRight: "Alt membuka menu browser",
  MetaLeft: "Tombol Windows membuka menu Start",
  MetaRight: "Tombol Windows membuka menu Start",
  Tab: "Tab memindahkan fokus keluar dari game",
  Escape: "Esc keluar dari layar penuh",
  F5: "F5 memuat ulang halaman",
  F11: "F11 mengubah layar penuh",
  F12: "F12 membuka alat pengembang",
};

/** Hasil memuat kontrol (untuk layar uji tombol dan laporan). */
export interface ControlsInfo {
  source: "file" | "cadangan";
  profile: string;
  /** Peringatan: tombol dipakai dua kali, tombol berisiko, atau isi file tidak valid. */
  warnings: string[];
}

export let CONTROLS_INFO: ControlsInfo = { source: "cadangan", profile: "standar", warnings: [] };

/** Muat controls.json (lokal, offline). Jika gagal, kontrol cadangan dipakai. */
export async function loadControls(url = "./config/controls.json"): Promise<ControlsInfo> {
  const warnings: string[] = [];
  let source: ControlsInfo["source"] = "cadangan";
  let profile = "standar";
  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const json = (await res.json()) as { activeProfile?: string; profiles?: Record<string, unknown> };
    profile = json.activeProfile ?? "standar";
    const list = json.profiles?.[profile];
    if (!Array.isArray(list) || list.length !== DEFAULT_BINDINGS.length) {
      throw new Error(`profil "${profile}" harus berisi ${DEFAULT_BINDINGS.length} pemain`);
    }
    const parsed = list.map((b, i) => validateBinding(b, i));
    PLAYER_BINDINGS.splice(0, PLAYER_BINDINGS.length, ...parsed);
    source = "file";
  } catch (err) {
    warnings.push(`controls.json tidak terbaca (${(err as Error).message}); memakai kontrol bawaan.`);
    PLAYER_BINDINGS.splice(0, PLAYER_BINDINGS.length, ...DEFAULT_BINDINGS.map((b) => ({ ...b })));
  }
  warnings.push(...findConflicts(PLAYER_BINDINGS));
  CONTROLS_INFO = { source, profile, warnings };
  for (const w of warnings) console.warn("Kontrol:", w);
  return CONTROLS_INFO;
}

const KEY_FIELDS = ["up", "down", "left", "right", "skill1", "skill2"] as const;

function validateBinding(raw: unknown, index: number): PlayerBinding {
  const b = raw as Record<string, unknown>;
  const where = `pemain P${index + 1}`;
  for (const f of ["label", "skill1Label", "skill2Label", "leftRightLabel"]) {
    if (typeof b[f] !== "string") throw new Error(`${where}: "${f}" harus teks`);
  }
  if (b.kind === "keyboard") {
    for (const f of KEY_FIELDS) {
      const v = b[f];
      if (!Array.isArray(v) || v.length === 0 || v.some((c) => typeof c !== "string")) {
        throw new Error(`${where}: "${f}" harus daftar kode tombol, mis. ["KeyW"]`);
      }
    }
    return b as unknown as KeyboardBinding;
  }
  if (b.kind === "gamepad") {
    for (const f of ["padOrder", "axisX", "axisY", "skill1Button", "skill2Button", "deadZone"]) {
      if (typeof b[f] !== "number") throw new Error(`${where}: "${f}" harus angka`);
    }
    return { ...(b as unknown as GamepadBinding), useDpad: b.useDpad !== false };
  }
  throw new Error(`${where}: "kind" harus "keyboard" atau "gamepad"`);
}

/** Tombol yang dipakai lebih dari satu pemain / bentrok dengan tombol sistem / berisiko. */
export function findConflicts(bindings: readonly PlayerBinding[]): string[] {
  const out: string[] = [];
  const owners = new Map<string, string[]>();
  const systemKeys = new Set<string>(Object.values(SYSTEM_KEYS));
  bindings.forEach((b, i) => {
    if (b.kind !== "keyboard") return;
    for (const f of KEY_FIELDS) {
      for (const code of b[f]) {
        const who = `P${i + 1} ${f}`;
        owners.set(code, [...(owners.get(code) ?? []), who]);
        if (systemKeys.has(code)) out.push(`${code} dipakai ${who} sekaligus tombol sistem`);
        if (RISKY_KEYS[code]) out.push(`${code} (${who}): ${RISKY_KEYS[code]}`);
      }
    }
  });
  for (const [code, who] of owners) if (who.length > 1) out.push(`${code} dipakai lebih dari sekali: ${who.join(", ")}`);
  return out;
}
