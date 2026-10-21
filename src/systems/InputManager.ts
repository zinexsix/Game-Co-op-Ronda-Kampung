import { PLAYER_BINDINGS, type GamepadBinding, type KeyboardBinding, type PlayerBinding } from "../config/controls";

/** Status input satu pemain pada frame ini. Gerak dalam -1..1 (X = kanan, Z = ke atas layar). */
export interface PlayerInputState {
  moveX: number;
  moveZ: number;
  skill1: boolean;
  skill2: boolean;
  /** false jika perangkat pemain (gamepad) belum terhubung. */
  connected: boolean;
}

/**
 * Membaca keyboard + gamepad dan memetakannya ke status per pemain sesuai config/controls.ts.
 * Keyboard dilacak per KeyboardEvent.code sehingga beberapa pemain di satu keyboard tidak saling menimpa.
 */
export class InputManager {
  private readonly pressed = new Set<string>();
  private readonly states: PlayerInputState[];
  /** Override input (dipakai benchmark / bot nanti). null = pakai perangkat asli. */
  private readonly overrides: (PlayerInputState | null)[];
  private readonly systemHandlers = new Map<string, () => void>();
  private readonly playerKeys: Set<string>;

  constructor(private readonly bindings: PlayerBinding[] = PLAYER_BINDINGS) {
    this.states = bindings.map(() => emptyState());
    this.overrides = bindings.map(() => null);
    this.playerKeys = new Set(
      bindings.flatMap((b) =>
        b.kind === "keyboard" ? [...b.up, ...b.down, ...b.left, ...b.right, ...b.skill1, ...b.skill2] : [],
      ),
    );
    window.addEventListener("keydown", this.onKeyDown);
    window.addEventListener("keyup", this.onKeyUp);
    // Lepas semua tombol saat jendela kehilangan fokus agar karakter tidak "jalan sendiri".
    window.addEventListener("blur", () => this.pressed.clear());
  }

  get playerCount(): number {
    return this.bindings.length;
  }

  /** Daftarkan aksi untuk tombol sistem (F1, F2, ...). */
  onSystemKey(code: string, handler: () => void): void {
    this.systemHandlers.set(code, handler);
  }

  setOverride(player: number, state: PlayerInputState | null): void {
    this.overrides[player] = state;
  }

  /** Panggil sekali per frame sebelum update entitas. */
  update(): void {
    const pads = connectedGamepads();
    this.bindings.forEach((binding, i) => {
      const s = this.states[i];
      if (binding.kind === "keyboard") this.readKeyboard(binding, s);
      else this.readGamepad(binding, pads[binding.padOrder] ?? null, s);
      const o = this.overrides[i];
      if (o) Object.assign(s, o);
    });
  }

  getState(player: number): Readonly<PlayerInputState> {
    return this.states[player];
  }

  /** Semua kode tombol keyboard yang sedang ditekan (untuk layar debug). */
  get pressedKeys(): string[] {
    return [...this.pressed];
  }

  /** Nama gamepad terhubung (untuk layar debug). */
  get gamepadNames(): string[] {
    return connectedGamepads().map((p) => p.id);
  }

  private readKeyboard(b: KeyboardBinding, s: PlayerInputState): void {
    const any = (codes: string[]) => codes.some((c) => this.pressed.has(c));
    let x = (any(b.right) ? 1 : 0) - (any(b.left) ? 1 : 0);
    let z = (any(b.up) ? 1 : 0) - (any(b.down) ? 1 : 0);
    // Diagonal tidak boleh lebih cepat dari lurus.
    if (x !== 0 && z !== 0) {
      x *= Math.SQRT1_2;
      z *= Math.SQRT1_2;
    }
    s.moveX = x;
    s.moveZ = z;
    s.skill1 = any(b.skill1);
    s.skill2 = any(b.skill2);
    s.connected = true;
  }

  private readGamepad(b: GamepadBinding, pad: Gamepad | null, s: PlayerInputState): void {
    if (!pad) {
      Object.assign(s, emptyState(), { connected: false });
      return;
    }
    let x = pad.axes[b.axisX] ?? 0;
    // Sumbu Y gamepad: atas = negatif, sedangkan Z+ = atas layar.
    let z = -(pad.axes[b.axisY] ?? 0);
    const btn = (i: number) => pad.buttons[i]?.pressed ?? false;
    if (b.useDpad) {
      if (btn(15)) x = 1;
      if (btn(14)) x = -1;
      if (btn(12)) z = 1;
      if (btn(13)) z = -1;
    }
    // Dead zone radial, lalu skala ulang agar gerak halus dari tepi dead zone.
    const len = Math.hypot(x, z);
    if (len < b.deadZone) {
      x = 0;
      z = 0;
    } else {
      const scaled = Math.min(1, (len - b.deadZone) / (1 - b.deadZone));
      x = (x / len) * scaled;
      z = (z / len) * scaled;
    }
    s.moveX = x;
    s.moveZ = z;
    s.skill1 = btn(b.skill1Button);
    s.skill2 = btn(b.skill2Button);
    s.connected = true;
  }

  private readonly onKeyDown = (e: KeyboardEvent): void => {
    const handler = this.systemHandlers.get(e.code);
    if (handler) {
      e.preventDefault();
      if (!e.repeat) handler();
      return;
    }
    // Cegah scroll halaman oleh tombol panah, dsb.
    if (this.playerKeys.has(e.code)) e.preventDefault();
    this.pressed.add(e.code);
  };

  private readonly onKeyUp = (e: KeyboardEvent): void => {
    this.pressed.delete(e.code);
  };
}

function emptyState(): PlayerInputState {
  return { moveX: 0, moveZ: 0, skill1: false, skill2: false, connected: true };
}

function connectedGamepads(): Gamepad[] {
  if (!navigator.getGamepads) return [];
  return navigator.getGamepads().filter((p): p is Gamepad => p !== null && p.connected);
}
