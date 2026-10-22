// Ukuran arena (unit = meter). Area main berada di bidang X-Z, pusat (0,0) = pos ronda.
// halfWidth/halfDepth adalah batas arena AKTIF: diganti saat level berganti (lihat setArenaBounds).
export const ARENA = {
  /** Batas area main (setengah lebar X dan setengah kedalaman Z) untuk arena yang sedang dipakai. */
  halfWidth: 18,
  halfDepth: 11,
  /** Lantai visual lebih lebar agar dekorasi di tepi tetap punya alas. */
  groundMargin: 5,
  /** Pos ronda: kotak tabrakan setengah-ukuran di pusat. */
  postHalfSize: 2,
  /** Kamera: sudut kemiringan dari bidang horizontal (derajat). */
  cameraPitchDeg: 55,
  cameraFovDeg: 40,
  /** Tinggi strip bawah layar (piksel CSS) untuk kartu pemain HUD; adegan 3D digambar di atasnya. */
  hudBottomPx: 150,
};

/** Ganti batas arena aktif (dipanggil saat level dimuat). */
export function setArenaBounds(halfWidth: number, halfDepth: number): void {
  ARENA.halfWidth = halfWidth;
  ARENA.halfDepth = halfDepth;
}
