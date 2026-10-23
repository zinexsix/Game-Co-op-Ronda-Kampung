# Laporan Uji Tahap 7 — Ronda Bareng

Tanggal uji: 22–23 Oktober 2026 · Build: `npm run build`, dijalankan lewat `scripts/serve-dist.mjs`.

## Perangkat uji (laptop target)

| | |
|---|---|
| Laptop | ADVAN model 1405 (TBook), BIOS DNN21S V1.54 |
| CPU / GPU | Intel N100 (4 core) / Intel UHD Graphics (0x46D1), driver 31.0.101.3677 |
| RAM | 16 GB (1 keping, 3200 MT/s) |
| OS / browser | Windows 11 Pro 64-bit (build 26200) / Microsoft Edge 155 |
| Layar bawaan | 1366×768 @ 59 Hz |

**Cara uji.** Semua uji otomatis berjalan di Edge pada laptop ini, memakai GPU asli (ANGLE → Direct3D 11), lewat Chrome DevTools Protocol:
- Tombol keyboard dikirim sebagai kejadian keyboard sungguhan.
- Gamepad P4 disimulasikan lewat pengganti input, karena tidak ada gamepad fisik saat uji.
- Uji berjalan di jendela tanpa tampilan (*headless*), dengan resolusi diemulasikan persis.

Batasannya dijelaskan di bagian [Masalah yang tersisa](#masalah-yang-tersisa).

---

## 1. Build offline

| Uji | Hasil |
|---|---|
| Permintaan jaringan selama 1 sesi penuh (Level 3 + boss) | **176 permintaan, semuanya ke `localhost`.** 0 ke internet, 0 gagal |
| Semua nama domain selain localhost diblokir (`--host-resolver-rules`), lalu main menu → Level 1 → 2 → 3 → hasil | ✅ Selesai, 0 error di konsol |
| Font / CDN / gambar dari luar | Tidak ada. Font sistem, ikon emoji Windows, suara disintesis |
| `dist/config/controls.json` ikut ke build dan bisa disunting | ✅ |
| Server `serve-dist.mjs`: path di luar `dist/` (`/../package.json`) | Ditolak (404) |

Teks URL di dalam `dist/assets/*.js` (misalnya `cdn.babylonjs.com`) adalah bagian bawaan Babylon.js untuk fitur yang tidak dipakai, seperti VR, KTX, dan editor. Uji jaringan di atas membuktikan semuanya tidak pernah dipanggil.

## 2. Audit performa

Beban: 4 pemain (semua skill dipakai bergantian oleh autopilot), 30/30 musuh aktif terus-menerus, barikade dan jebakan aktif. Di Level 3, Boss Genderuwo selalu ada.
Durasi: 3 detik pemanasan + 15 detik pengukuran per mode.

| Resolusi layar | Level | Mode | FPS rata-rata | FPS terendah (1 dtk) | 1% low | Render | Draw call* | Segitiga* |
|---|---|---|---|---|---|---|---|---|
| 1366×768 | 1 | Rendah | 59,7 | 58,0 | 50,8 | 1024×576 | 44 | 13.670 |
| 1366×768 | 1 | Sedang | 60,0 | 59,9 | 53,2 | 1366×768 | — | — |
| 1366×768 | 2 | Rendah | 59,9 | 59,0 | 53,5 | 1024×576 | 46 | 19.586 |
| 1366×768 | 2 | Sedang | 60,0 | 60,0 | 53,5 | 1366×768 | — | — |
| 1366×768 | 3 (boss) | Rendah | 59,9 | 59,0 | 53,2 | 1024×576 | 42 | 13.920 |
| 1366×768 | 3 (boss) | Sedang | 60,0 | 59,8 | 50,3 | 1366×768 | — | — |
| 1920×1080 | 1 | Rendah | 59,9 | 59,0 | 50,5 | 1440×810 | 44 | 13.770 |
| 1920×1080 | 1 | Sedang | 60,0 | 59,8 | 52,6 | 1920×1080 | — | — |
| 1920×1080 | 2 | Rendah | 59,9 | 58,9 | 51,0 | 1440×810 | 46 | 19.950 |
| 1920×1080 | 2 | Sedang | 59,9 | 59,0 | 50,0 | 1920×1080 | — | — |
| 1920×1080 | 3 (boss) | Rendah | 59,8 | 58,1 | 50,3 | 1440×810 | 42 | 14.288 |
| 1920×1080 | 3 (boss) | Sedang | 59,9 | 59,0 | 42,0 | 1920×1080 | — | — |

\* Dibaca di tengah pengukuran mode Rendah (tanpa pass bayangan). Di mode Sedang, draw call sekitar 68–72 karena bayangan.

**Kesimpulan:** target PRD (≥ 30 FPS) terpenuhi dengan cadangan lebar di semua level, mode, dan resolusi. Angka 60 adalah batas refresh layar. Karena itu, kemampuan sebenarnya tidak terukur, tapi pasti di atas 60 dalam kondisi uji ini.

### Patahan sesaat (*stutter*)

Pemantau durasi frame memperlihatkan **tidak ada frame di atas 50 ms selama bermain** (sekitar 3.900 frame per level). Yang tercatat:
- 1 kali sekitar 270 ms saat game **dimuat**. Ini pemanasan shader yang disengaja dan terjadi sebelum menu tampil.
- 50–100 ms tepat saat level dimulai dan saat layar "Level Selesai" muncul, ketika tidak ada aksi.

Di awal uji, FPS terendah tercatat sekitar 20 saat Level 2/3 pertama kali tampil. Penyebabnya shader yang baru dikompilasi saat arena itu pertama kali digambar. **Diperbaiki:** semua arena dan objek dinamis kini digambar sekali saat game dimuat (`MatchScene.warmUp`). Setelah perbaikan, satu pengukuran ronde masih sempat menunjukkan angka terendah sekitar 20 di Level 2, tapi tidak terulang di pengukuran frame yang lebih teliti. Kemungkinan itu patahan perpindahan level yang terbaca penghitung FPS rata-rata.

### Memori (kebocoran antar level dan antar ronde)

Diukur di akhir setiap level, setelah *garbage collection* paksa:

| Ukuran | Nilai di semua level & ronde |
|---|---|
| Heap JS terpakai | 20–25 MB, tidak bertambah dari ronde ke ronde |
| Mesh di scene | 80 (tetap) |
| Material | 58 (tetap) |
| Tekstur | 1 (tetap, tekstur bayangan) |
| Efek shader | Naik sekali ke 23–26 lalu tetap (varian kabut Level 3 dikompilasi sekali) |
| Node DOM | 467 (Level 1–2) / 474 (Level 3, ada bar boss); kembali sama di ronde berikutnya |

**Tidak ditemukan kebocoran memori.** Semua objek (musuh, proyektil, koin, partikel, barikade, jebakan, efek) memakai pool tetap. Pindah level hanya mengganti arena aktif dan me-reset pool; tidak ada objek atau tekstur baru yang dibuat. Teks COMBO dihapus dari DOM setelah animasinya selesai.

## 3. Uji stabilitas

| Uji | Hasil |
|---|---|
| Ronde berturut-turut dalam satu sesi tanpa memuat ulang (menu → pilih peran 4 pemain → Level 1 → 2 → 3 → hasil → "Main Lagi" / "Menu" bergantian) | **2 ronde penuh + Level 1 ronde ke-3, tanpa crash dan tanpa melambat.** Sekitar 170 detik per ronde. Uji dihentikan atas permintaan operator, jadi **target 10 ronde belum dicapai** |
| Ronde penuh lain di build produksi (sesi terpisah) | 6 ronde lain menu → hasil: uji coba, alur offline, 2× tata letak, 2× setelah perbaikan shader. Semua selesai, 0 error |

Di uji stabilitas, musuh dibersihkan oleh skrip supaya satu ronde cepat selesai. Gelombang, transisi, layar, dan memori tetap berjalan seperti permainan sungguhan. Permainan penuh tanpa bantuan skrip juga diuji di Tahap 5 (pemain + 3 bot) dan di skenario pengunjung di bawah.

## 4. Uji input

| Uji | Hasil |
|---|---|
| Tombol yang sama dipakai dua pemain / bentrok dengan tombol sistem (F1–F10) | **Tidak ada** di profil `standar` maupun `alternatif` (pemeriksaan otomatis saat dimuat) |
| Tombol berisiko (Shift → Sticky Keys, Ctrl+W, Alt, Tab, F5, F11, F12) | Tidak dipakai |
| 12 tombol pemain ditekan bersamaan (3 pemain × gerak 2 arah + 2 skill) | Ke-12 tombol terbaca oleh game dan menyala di layar uji tombol (F10) |
| Tombol tidak menggerakkan menu saat layar uji terbuka | ✅ |
| Kontrol diubah tanpa build ulang | ✅ `dist/config/controls.json`, profil dipilih lewat `activeProfile`. Jika file rusak, game memakai kontrol bawaan disertai peringatan |

**Catatan penting:** uji di atas mengirim tombol secara digital, sehingga tidak bisa mendeteksi *ghosting* keyboard fisik, yaitu kombinasi tombol yang tidak terbaca oleh keyboard laptop.
- **Harus diuji manual** dengan 3 orang di keyboard TBook memakai layar F10.
- Masalah ergonomis yang terlihat: di profil standar, skill P2 (`,` `.`) berada tepat di bawah tombol gerak P3 (`J K L`), sehingga tangan bisa bertabrakan.
- **Usulan:** profil `alternatif` sudah disiapkan:

| Pemain | Profil alternatif |
|---|---|
| P1 | WASD + Q/E |
| P2 | Panah + Enter/' |
| P3 | TFGH + R/Y |
| P4 | Gamepad |

## 5. Skenario pengunjung

| Skenario | Hasil |
|---|---|
| Pemain baru tanpa penjelasan (hanya menekan Q dua kali di menu, lalu bergerak acak) | Langsung bermain sebagai Penjaga + 3 bot. Petunjuk muncul sesuai konteks dan menyebut tombolnya ("Cari tanda P1-P4…", "Sentuh koin…", "P1 Penjaga: tekan E untuk memancing…"). **Level 1 menang**, pos ronda 100 |
| Pemain sendirian dengan bot | Menang Level 1 untuk keempat pilihan peran (Tahap 5). Level 2 menang di 2/2 uji. Level 3 masih sulit (lihat masalah tersisa) |
| 4 pemain bersamaan | Pilih peran 4 orang → Level 1–3 → hasil. Kesulitan dihitung untuk 4 manusia, tanpa bot |
| Tanpa gamepad | Panel P4 menampilkan "Gamepad belum terhubung". 3 pemain keyboard bermain, P4 otomatis bot, tanpa jeda yang salah |
| 3 pemain yang hampir diam | Kalah di Level 1 dalam 33 detik, terlalu cepat untuk level latihan. **Diperbaiki:** `enemyDamageMult` 0,5 untuk Level 1 di `levels.json`; tim pasif kini bertahan 47 detik |
| Resolusi 1366×768 & 1920×1080 | Menu, pilih peran, pertandingan terpadat (boss + 13 musuh + 4 pemain), dan layar hasil: **tidak ada elemen UI yang keluar layar**. Semua teks terbaca, dan penanda P1–P4 tepat di atas kepala |

## 6. Kasus error

| Kasus | Hasil |
|---|---|
| Tab / jendela kehilangan fokus | Game **dijeda**: waktu berhenti, suara dihentikan, layar JEDA muncul, kursor tampil lagi. Lanjut dengan klik atau tombol skill ✅ |
| Gamepad dicabut saat bermain | Game dijeda dengan pesan "Gamepad P4 terputus". Sambung lagi → lanjut otomatis ✅. Atau pemain keyboard menekan Skill 1 → P4 dilanjutkan bot dan kartunya bertanda BOT ✅ (gamepad disimulasikan) |
| WebGL tidak tersedia (Edge dengan `--disable-webgl --disable-3d-apis`) | Layar pesan jelas: "Grafis 3D (WebGL) tidak tersedia" + cara menyalakan akselerasi grafis ✅ |
| Grafis terputus (*context lost*) | Pemberitahuan + pemulihan otomatis Babylon; jika tidak pulih dalam 5 detik, halaman dimuat ulang. **Belum diuji langsung** (sulit dipicu dengan sengaja) |
| `controls.json` hilang / rusak | Kontrol bawaan dipakai + peringatan di konsol dan di layar F10 |
| Tidak ada input selama 30 detik | Kembali ke menu, dengan peringatan 10 detik sebelumnya (Tahap 6) ✅ |

## 7. Layar penuh & kursor

- Tombol **🖥️ Layar penuh (F4)** yang besar ada di menu, plus tombol kecil di kanan atas.
- `Jalankan-Pameran.bat` membuka Edge langsung dalam mode kiosk layar penuh.
- Kursor mouse disembunyikan saat bermain setelah 2 detik diam, dan muncul lagi saat mouse digerakkan atau saat jeda ✅.

---

## Masalah yang tersisa

1. **Uji 10 ronde berturut-turut belum selesai.** Baru 2 ronde + Level 1 ronde 3, dihentikan atas permintaan. Hasil sejauh itu stabil, tapi uji 10 ronde (sekitar 30 menit) tetap disarankan sekali sebelum pameran, termasuk untuk melihat efek panas N100.
2. **Ghosting keyboard dan gamepad fisik belum diuji dengan perangkat asli.** Lakukan dengan layar F10 dan gamepad sungguhan, termasuk mencabutnya saat bermain.
3. **Pengukuran berjalan di Edge tanpa tampilan.** Perlu satu kali main sungguhan di layar penuh (kiosk) dengan charger tersambung dan mode daya **Best performance**.
4. **Patahan 50–100 ms saat perpindahan level** masih ada. Tidak terasa saat bermain karena terjadi di layar transisi.
5. **Level 3 untuk 1 pemain + 3 bot cukup sulit.** Pemain skrip yang naif menang 1 dari 3 kali (Tahap 5). Jika terlalu sulit di stan, setel `genderuwo.hp`, `coinsOnStun`, atau `playerScaling."1"` (lihat `docs/BALANCE.md`).
6. **Suara baru terdengar setelah tombol atau klik pertama.** Ini aturan browser; kiosk dari `.bat` sudah memakai `--autoplay-policy=no-user-gesture-required`.
7. **Prasyarat yang harus dipenuhi:**
   - Node.js harus terpasang, dan `npm install` + `npm run build` dijalankan sekali saat masih ada internet.
   - Kiosk Edge ditutup dengan **Alt+F4**.
8. **Driver grafis Intel versi lama (2022).** Berjalan stabil; sebaiknya tidak diperbarui menjelang pameran.
