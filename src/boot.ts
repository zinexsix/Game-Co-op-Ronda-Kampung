// Titik masuk: cek WebGL -> muat kontrol (config/controls.json) -> baru muat game.
// Jika WebGL tidak tersedia atau game gagal dimulai, tampilkan pesan yang jelas, bukan layar hitam.
import "./style.css";
import { loadControls } from "./config/controls";
import { showFatal } from "./ui/fatal";

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl2") ?? canvas.getContext("webgl"));
  } catch {
    return false;
  }
}

async function boot(): Promise<void> {
  if (!webglAvailable()) {
    showFatal("Grafis 3D (WebGL) tidak tersedia", [
      "Ronda Bareng membutuhkan WebGL untuk menggambar dunia 3D.",
      "Cara memperbaiki di Microsoft Edge / Chrome: buka <b>Pengaturan → Sistem</b>, nyalakan <b>“Gunakan akselerasi grafis jika tersedia”</b>, lalu mulai ulang browser.",
      "Pastikan juga driver grafis Intel sudah terpasang, lalu muat ulang halaman ini (F5).",
    ]);
    return;
  }
  await loadControls();
  try {
    await import("./main");
  } catch (err) {
    console.error(err);
    showFatal("Game gagal dimulai", [
      "Terjadi kesalahan saat memuat game. Coba muat ulang halaman (F5).",
      `Detail: ${(err as Error).message ?? String(err)}`,
    ]);
  }
}

void boot();
