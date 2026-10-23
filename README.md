# Ronda Bareng

Game co-op 2–4 pemain di satu layar (bisa juga sendirian bersama bot). Grafis 3D low-poly dengan kamera tetap.
Tim menjaga pos ronda kampung dari serbuan malam di 3 level. Level terakhir menghadirkan Boss Genderuwo,
yang hanya bisa dikalahkan dengan kerja sama.
Dibuat untuk stan pameran: berjalan **sepenuhnya offline** di laptop Advan TBook (Intel N100, 16 GB RAM).

## Cepat: menjalankan untuk pameran

1. Sekali saja, **saat masih ada internet**: pasang [Node.js](https://nodejs.org) 20+ lalu jalankan `npm install` di folder ini.
2. Buat build produksi: `npm run build` (menghasilkan folder `dist/`).
3. Klik ganda **`Jalankan-Pameran.bat`**.
   - Server lokal menyala di `http://localhost:4173`.
   - Microsoft Edge terbuka dalam mode layar penuh (kiosk).
   - Keluar dari kiosk: **Alt+F4**. Hentikan server: tutup jendela hitam (konsol).

Setelah langkah 1–2, internet tidak dibutuhkan sama sekali. Game tidak memuat CDN, font, atau aset dari luar.

Cara lain menjalankan build:

| Perintah | Kegunaan |
|---|---|
| `npm run serve` | Server statis tanpa dependensi (`scripts/serve-dist.mjs`) di `http://localhost:4173` |
| `npm run pameran` | Build ulang lalu buka Edge layar penuh |
| `npm run preview` | Server bawaan Vite (butuh `node_modules`) |
| `node scripts/serve-dist.mjs --port 8080` | Jika port 4173 sedang dipakai |

> Membuka `dist/index.html` langsung dengan klik ganda (`file://`) **tidak** bisa, karena browser
> memblokir modul JavaScript dari file lokal. Selalu pakai salah satu server di atas.

## Pengembangan

```bash
npm install        # sekali
npm run dev        # server pengembangan + muat ulang otomatis (http://localhost:5173)
npm run typecheck  # cek tipe TypeScript
npm run build      # build produksi ke dist/
```

Struktur singkat:

| Folder | Isi |
|---|---|
| `src/data/*.json` | Semua angka gameplay (peran, musuh, level, aturan) |
| `src/scenes/` | Menu, pilih peran, pertandingan, arena 3D |
| `src/systems/` | Musuh, level, skor, combo, bot, audio, input, kualitas |
| `src/roles/` | Skill tiap peran |
| `src/ui/` | HUD dan layar-layar 2D |
| `public/config/controls.json` | Pemetaan tombol, ikut tersalin ke `dist/config/` |
| `docs/` | PRD, panduan keseimbangan, laporan uji |

## Kontrol

| Pemain | Gerak | Skill 1 | Skill 2 |
|---|---|---|---|
| P1 | W A S D | Q | E |
| P2 | Panah | , (koma) | . (titik) |
| P3 | I J K L | U | O |
| P4 | Stik kiri gamepad (atau D-pad) | A | B |

- **Menu:** pemain mana pun menekan Skill 1 untuk mulai.
- **Pilih peran:** Skill 1 untuk bergabung/siap, kiri/kanan untuk memilih, Skill 2 untuk batal/keluar.
- Peran yang tidak dipilih dimainkan **bot**, jadi satu orang pun bisa bermain.

Tombol sistem:

| Tombol | Fungsi |
|---|---|
| F1 | Layar debug (FPS, draw call, kontribusi per peran) |
| F2 | Ganti kualitas grafis Rendah / Sedang |
| F3 | Benchmark otomatis (sekitar 36 detik) |
| F4 | Layar penuh (juga ada tombolnya di menu dan di kanan atas) |
| F6 | Mode uji skill saat bermain. F7 memunculkan musuh, F8 menambah koin dan mengosongkan cooldown, F9 menjatuhkan pemain |
| F10 | Layar **uji tombol** (dari menu / pilih peran) |

### Mengubah tombol tanpa build ulang

Sunting `dist/config/controls.json` (atau `public/config/controls.json` sebelum build), simpan, lalu muat ulang halaman (F5).

- Ada dua profil: `"standar"` dan `"alternatif"`. Pindah profil cukup dengan mengganti `"activeProfile"`.
- Profil `"alternatif"` memisahkan tangan tiap pemain lebih jauh:
  - P1: WASD + Q/E
  - P2: Panah + Enter/'
  - P3: TFGH + R/Y
- Kode tombol memakai nama posisi fisik: `KeyA`, `ArrowUp`, `Comma`, `Enter`, dan seterusnya. Daftar lengkapnya ada di catatan dalam file.
- Saat dimuat, game memeriksa tombol yang dipakai dua kali dan tombol berisiko (Shift, Ctrl, Alt, Tab, F5, dan sebagainya). Peringatannya tampil di layar uji tombol (F10).
- Jika file rusak, game memakai kontrol bawaan dan menulis peringatannya.

Sebelum pameran, buka **F10**, lalu minta 3 orang menekan tombol bersamaan. Tombol yang ditekan tapi tidak menyala berarti keyboard
laptop tidak bisa membaca kombinasi itu (*ghosting*). Atasi dengan profil `"alternatif"` atau gamepad.

## Pengaturan grafis

- **Sedang:** bayangan aktif, resolusi penuh. Ini bawaan.
- **Rendah:** tanpa bayangan, resolusi render 75%.
- Ganti lewat tombol di kanan atas, F2, atau `?q=rendah` di alamat.
- **Turun otomatis:** jika FPS rata-rata di bawah 30 selama 3 detik, skala resolusi diturunkan bertahap (85% → 70% → 60%). Aturannya ada di `src/data/game.json` → `autoQuality`.
- Kabut tipis hanya muncul di Level 3. Tidak ada post-processing.

Untuk stan:
- Sambungkan charger dan pilih Windows **Settings → Power → Best performance**. N100 melambat saat memakai baterai.
- Tutup aplikasi lain (VS Code, browser lain).
- Jangan memperbarui driver grafis menjelang pameran kecuali ada masalah.

## Perilaku otomatis untuk stan

- **30 detik tanpa input** → kembali ke menu. Peringatan muncul 10 detik sebelumnya, dan layar hasil punya hitung mundurnya sendiri.
- **Jendela/tab kehilangan fokus** → game dijeda. Klik layar atau tekan tombol skill untuk lanjut.
- **Gamepad dicabut saat bermain** → game dijeda. Sambungkan kembali untuk lanjut otomatis, atau tekan Skill 1 pemain keyboard untuk lanjut dengan P4 dimainkan bot.
- **WebGL tidak tersedia** → muncul pesan jelas cara menyalakan akselerasi grafis di browser.
- **Grafis terputus** (reset driver) → tampil pemberitahuan dan dicoba pulih. Jika tidak pulih dalam 5 detik, halaman dimuat ulang.
- **Kursor mouse** disembunyikan saat bermain, dan muncul lagi jika mouse digerakkan.

## Mengubah angka keseimbangan

Semua angka ada di `src/data/` (`roles.json`, `enemies.json`, `levels.json`, `game.json`).
Panduan angka yang paling sering disetel, beserta efeknya, ada di **[docs/BALANCE.md](docs/BALANCE.md)**.
Setelah mengubah, jalankan `npm run build` lagi untuk versi pameran.
Pengecualiannya `controls.json`, yang bisa diubah langsung di `dist/config/`.

Parameter alamat untuk menguji:

| Parameter | Fungsi |
|---|---|
| `?roles=penyerang,penjaga` | Langsung bermain dengan peran ini; sisanya bot |
| `&level=2` | Mulai dari level tertentu |
| `&uji` | Mode uji skill |
| `&bot=0` | Tanpa bot |
| `&idle=0` | Tanpa reset ke menu |
| `?bench&level=3` | Benchmark arena boss |

## Laporan uji

Hasil audit performa, memori, stabilitas, input, skenario pengunjung, dan penanganan error ada di
**[docs/TEST_REPORT.md](docs/TEST_REPORT.md)**, termasuk masalah yang masih tersisa.

## Kredit aset

Game ini **tidak memakai file aset dari luar**:

| Bagian | Sumber |
|---|---|
| Model 3D (karakter, musuh, boss, arena) | Dibuat lewat kode dari bentuk dasar Babylon.js (`src/entities/EnemyModels.ts`, `src/scenes/ArenaScene.ts`, `src/entities/Player.ts`) |
| Efek suara & musik | Disintesis langsung dengan Web Audio API (`src/systems/AudioSystem.ts`); tidak ada file audio |
| Huruf | Font sistem (Segoe UI) |
| Ikon | Emoji bawaan Windows (Segoe UI Emoji); tidak ada file gambar |

Pustaka sumber terbuka:

| Pustaka | Lisensi |
|---|---|
| [Babylon.js](https://www.babylonjs.com) (`@babylonjs/core`) | Apache-2.0 |
| [Vite](https://vite.dev) (alat build, tidak ikut ke `dist/`) | MIT |
| [TypeScript](https://www.typescriptlang.org) (alat build, tidak ikut ke `dist/`) | Apache-2.0 |

Konsep dan desain: tim Ronda Bareng. Tema acara: *Play Your Way*.
