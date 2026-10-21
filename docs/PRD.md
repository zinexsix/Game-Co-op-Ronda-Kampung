# PRD — Ronda Bareng (Ronda Kampung)

Acuan untuk semua tahap pengembangan. Spesifikasi di bawah disalin apa adanya.

=== SPESIFIKASI ===
Konsep: game co-op 2-4 pemain di satu layar, grafis 3D low-poly, kamera top-down miring (sekitar 55 derajat) tetap yang menampilkan seluruh arena. Tim menjaga pos ronda (markas) dari gelombang musuh malam hari, 2-3 menit per level. Tiap pemain memilih satu dari 4 peran; tim hanya menang jika peran saling melengkapi. Untuk stan pameran: dipahami dalam 30 detik, stabil, jalan offline. Tema acara: Play Your Way.

Perangkat target: laptop Advan TBook (Intel N100, grafis Intel UHD tanpa GPU terpisah, RAM 16GB). Target FPS minimal 30 stabil.

Peran (nilai awal, simpan di JSON):
- Penjaga: HP 150, lambat. Skill 1 Perisai (blokir serangan satu arah 3 dtk, cooldown 8 dtk). Skill 2 Pancing (musuh dalam radius 6 fokus ke Penjaga 4 dtk, cooldown 12 dtk). Damage rendah.
- Pembangun: HP 80, sedang. Skill 1 Barikade (blokir jalur, 10 koin). Skill 2 Jebakan (musuh stun 3 dtk, 15 koin).
- Penyerang: HP 80, cepat. Skill 1 Serangan cepat (tembakan beruntun searah hadap). Skill 2 Serangan area (radius 4, cooldown 15 dtk).
- Penyembuh: HP 70, sedang. Skill 1 Heal (pulihkan HP markas atau teman radius 5). Skill 2 Buff (kecepatan tim +30% selama 5 dtk). Damage sangat rendah.

Mekanik:
- Shared health: satu bar nyawa markas (awal 100); kalah jika 0.
- Koin bersama dijatuhkan musuh; dipakai untuk barikade dan jebakan.
- Revive: pemain jatuh dihidupkan teman dalam 5 dtk jika berdiri di dekatnya.
- Skor tim: (sisa HP markas x 10) + (jumlah combo x 50) + bonus waktu. Tidak ada skor individu.
- Combo: (1) Jebak dan habisi, (2) Tahan dan pulihkan, (3) Serangan area saat 3 musuh atau lebih menumpuk di barikade.
- Mode solo: peran yang tidak dipilih dimainkan bot sederhana.
- Jumlah dan kekuatan musuh menyesuaikan jumlah pemain manusia (2, 3, atau 4).
- Gerak pada bidang datar (sumbu X dan Z), tanpa lompat. Tabrakan sederhana (kapsul atau kotak).
- Musuh bernavigasi dengan steering atau grid path sederhana, bukan navmesh penuh kecuali perlu.
- Musuh aktif dibatasi (awal 30) dengan object pooling.

Musuh dan level:
- Tikus Raksasa: cepat, berombongan, menyerang markas; rentan serangan area.
- Hantu Iseng: menembus barikade, menyerang pemain; terhenti oleh jebakan.
- Pencuri: mengincar koin yang jatuh lalu kabur; mudah dipancing Penjaga.
- Boss Genderuwo: HP besar, 3 fase, hanya bisa diserang saat terkena stun jebakan.
- Level 1 Latihan (±1 menit, halaman pos ronda): Tikus Raksasa saja, tutorial singkat. Level 2 Ronda Biasa (±2 menit, jalan kampung): Tikus Raksasa + Hantu Iseng, 4 gelombang. Level 3 Malam Jumat (±2 menit, lapangan dengan pohon besar): semua musuh + boss.
- Layar hasil: skor tim, peran MVP, jumlah combo, tombol Main Lagi, kembali otomatis ke menu setelah 30 dtk tanpa input.

Kontrol: P1 WASD + Q/E. P2 panah + koma/titik. P3 IJKL + U/O. P4 gamepad stik kiri + A/B.

Visual dan performa:
- Low-poly sederhana, suasana malam kampung. Gunakan placeholder (kapsul dan kotak berwarna, siluet berbeda per peran) dulu.
- Anggaran: karakter pemain maks 800 segitiga, musuh biasa maks 500, boss maks 3.000, total adegan maks 100.000 segitiga. Maks 2 sumber cahaya; bayangan hanya di mode kualitas Sedang; tanpa post-processing berat; wajib instancing untuk objek berulang; semua aset dimuat di awal; skala resolusi render bisa diturunkan.
- Pengaturan kualitas grafis Rendah/Sedang.
- HUD berupa lapisan 2D: ikon peran, bar HP, cooldown, bar nyawa markas, koin; teks besar dan kontras tinggi.

Aturan teknis:
- Data peran, musuh, dan level di file JSON terpisah dari logika game.
- Kode TypeScript bersih, bertipe jelas, komentar singkat di bagian penting.
- Jangan menambah peran kelima, fitur online, akun, atau penyimpanan progres.
- Jika keputusan tidak jelas, pilih opsi paling sederhana dan sebutkan di akhir tahap.

Tahapan: 1 Fondasi dan prototipe performa, 2 Satu peran + musuh + markas, 3 Peran lain + revive, 4 Level 1-2 + skor, 5 Boss + Level 3 + hasil + bot solo, 6 Poles (combo, suara, optimasi), 7 Persiapan pameran.
=== AKHIR SPESIFIKASI ===
