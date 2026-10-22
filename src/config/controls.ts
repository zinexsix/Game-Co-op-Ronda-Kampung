// Pemetaan kontrol per pemain. Ubah di sini saja; InputManager membaca konfigurasi ini.
// Kode tombol memakai KeyboardEvent.code (posisi fisik, tidak tergantung layout keyboard).

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

export const PLAYER_BINDINGS: PlayerBinding[] = [
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

/** Tombol sistem (bukan milik pemain). */
export const SYSTEM_KEYS = {
  toggleDebug: "F1",
  toggleQuality: "F2",
  runBenchmark: "F3",
  toggleFullscreen: "F4",
} as const;
