// Ukuran arena (unit = meter). Area main berada di bidang X-Z, pusat (0,0) = pos ronda.
export const ARENA = {
  /** Batas area main (setengah lebar X dan setengah kedalaman Z). */
  halfWidth: 18,
  halfDepth: 11,
  /** Lantai visual lebih lebar agar dekorasi di tepi tetap punya alas. */
  groundMargin: 5,
  /** Pos ronda: kotak tabrakan setengah-ukuran di pusat. */
  postHalfSize: 2,
  /** Kamera: sudut kemiringan dari bidang horizontal (derajat). */
  cameraPitchDeg: 55,
  cameraFovDeg: 40,
} as const;
