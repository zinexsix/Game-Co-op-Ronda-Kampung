# PRD: Ronda Bareng 3D (Game Co-op Ronda Kampung)

Oct 21, 2026 · @Someone

## 1. Ringkasan Produk

Ronda Bareng 3D adalah game co-op 2–4 pemain di satu layar dengan grafis 3D low-poly dan kamera dari atas (top-down miring). Tim menjaga pos ronda kampung dari gelombang musuh malam hari; setiap pemain memilih satu dari empat peran, dan tim hanya menang jika peran-peran itu saling melengkapi. Gameplay sama dengan versi 2D; yang berubah adalah tampilan, kamera, dan sistem gerak di ruang 3D.

| Item | Keterangan |
| --- | --- |
| Judul kerja | Ronda Bareng (tagline: Satu pos, empat peran, mainkan caramu) |
| Genre | Co-op action defense, 3D low-poly, kamera top-down miring |
| Pemain | 2–4 pemain, satu layar; mode solo dengan bot |
| Durasi sesi | 3 level, ±5–6 menit sekali main |
| Platform | Web (browser), dijalankan juga secara offline di laptop pameran |
| Acara | Pameran GameTech Festival, tema "Play Your Way" |
| Engine | Babylon.js + TypeScript + Vite |
| Perangkat target | Advan TBook (Intel N100, grafis Intel UHD, RAM 16GB, SSD tambahan) |

## 2. Tujuan, Metrik, dan Perbedaan dengan Versi 2D

Tema acara "Bikin gamemu, mainkan caramu" dijawab lewat peran asimetris. Versi 3D menambah daya tarik visual di stan pameran, selama tetap berjalan lancar di laptop target.

**Tujuan**

- Game bisa dipahami pengunjung dalam 30 detik dan seru ditonton orang lain.
- Tampilan 3D low-poly yang konsisten dan ringan, bukan realistis.
- Versi stabil dan lengkap di atas semua fitur tambahan.

**Metrik keberhasilan (target awal)**

| Metrik | Target |
| --- | --- |
| Frame rate di laptop target (4 pemain, boss aktif) | ≥ 30 FPS stabil; 60 FPS bila memungkinkan |
| Waktu pemain baru memahami cara main | ≤ 30 detik tanpa penjelasan lisan |
| Durasi satu sesi demo penuh | ≤ 6 menit |
| Waktu muat awal | ≤ 15 detik |
| Crash selama sesi 1 jam di stan | 0 |

**Perbedaan utama dari versi 2D**

| Aspek | 2D (Phaser) | 3D (Babylon.js) |
| --- | --- | --- |
| Tampilan | Sprite | Model low-poly, pencahayaan sederhana |
| Kamera | Tetap dari atas | Top-down miring (sekitar 55°), tetap, satu layar |
| Gerak | Bidang datar | Bidang datar di arena 3D (tanpa lompat) |
| Biaya aset | Rendah | Tinggi: model, animasi, tekstur |
| Risiko performa | Rendah | Sedang; perlu uji sejak awal |

**Bukan tujuan (non-goals)**

- Multiplayer online, akun, atau penyimpanan progres.
- Lompat, ketinggian, atau kamera yang bisa diputar pemain.
- Grafis realistis, bayangan real-time berkualitas tinggi, atau efek pasca-proses berat.
- Peran kelima atau lebih dari tiga level.

## 3. Target Pengguna dan Skenario

| Pengguna | Kebutuhan | Implikasi desain |
| --- | --- | --- |
| Pengunjung pameran (berkelompok) | Langsung bisa main, tanpa tutorial panjang | Level 1 sebagai tutorial interaktif, ikon skill jelas, teks singkat |
| Pengunjung sendirian | Tetap bisa mencoba | Mode solo dengan bot mengisi peran sisanya |
| Juri | Melihat tema, inovasi, dan kualitas teknis dalam waktu singkat | Sesi ≤ 6 menit, visual 3D konsisten, layar hasil menonjolkan kerja sama |
| Tim pengembang | Scope realistis di perangkat terbatas | Prioritas P0/P1/P2, anggaran performa, prototipe go/no-go |

**Skenario di stan pameran**

1. Pengunjung datang berdua sampai berempat, lalu menekan tombol apa saja untuk memulai.
2. Tiap pemain memilih peran; Level 1 mengajarkan skill dasar sambil bermain.
3. Tim bermain sampai Level 3 (boss), lalu layar hasil menampilkan peran MVP dan jumlah combo.
4. Layar kembali otomatis ke menu setelah 30 detik tanpa input, siap untuk kelompok berikutnya.

## 4. Konsep Inti, Game Loop, dan Kamera

Tim mempertahankan pos ronda (markas) selama 2–3 menit per level. Musuh datang dalam gelombang dari beberapa arah, dan kemenangan datang dari pembagian tugas, bukan dari satu pemain yang kuat.

**Game loop satu level**

1. Pemain memilih peran di layar pemilihan (satu peran hanya untuk satu pemain).
2. Gelombang musuh muncul dari pintu masuk di tepi arena dan bergerak menuju markas.
3. Tim menahan, menjebak, menyerang, dan menyembuhkan sambil mengumpulkan koin dari musuh yang kalah.
4. Koin dipakai untuk barikade, jebakan, dan skill tertentu.
5. Level selesai jika semua gelombang habis dan markas masih bertahan; kalah jika nyawa markas habis.
6. Layar hasil menampilkan skor tim, peran MVP, dan jumlah combo.

**Kamera**

- Satu kamera tetap, top-down miring (sekitar 55°), menampilkan seluruh arena sehingga semua pemain selalu terlihat.
- Tanpa putar kamera atau zoom oleh pemain; ukuran arena dirancang agar muat di satu layar.
- Karakter, musuh, dan efek skill harus tetap terbaca dari sudut ini (siluet jelas, warna kontras).

## 5. Peran Pemain

Empat peran tetap, masing-masing dengan dua skill. Angka adalah nilai awal untuk disetel saat playtest; jarak dalam satuan unit dunia 3D (1 unit ≈ 1 meter).

| Peran | Fungsi | HP | Kecepatan | Skill 1 | Skill 2 | Kelemahan |
| --- | --- | --- | --- | --- | --- | --- |
| Penjaga | Tank, menahan musuh | 150 | Lambat | Perisai: blokir serangan dari satu arah (3 dtk, cooldown 8 dtk) | Pancing: musuh dalam radius 6 fokus ke Penjaga (4 dtk, cooldown 12 dtk) | Damage rendah |
| Pembangun | Mengatur area | 80 | Sedang | Barikade: blok penghalang jalur (10 koin) | Jebakan: musuh stun 3 dtk (15 koin) | Bergantung pada koin |
| Penyerang | Damage tinggi | 80 | Cepat | Serangan cepat: tembakan beruntun searah hadap | Serangan area: ledakan radius 4 (cooldown 15 dtk) | Rapuh |
| Penyembuh | Support | 70 | Sedang | Heal: pulihkan HP markas atau teman dalam radius 5 | Buff: kecepatan tim +30% selama 5 dtk | Damage sangat rendah |

**Combo kerja sama (dihitung untuk skor)**

- **Jebak dan habisi:** Penjaga memancing, Pembangun memasang jebakan, Penyerang menyerang musuh yang terjebak.
- **Tahan dan pulihkan:** Penjaga memblokir, Penyembuh memulihkan markas saat gelombang besar.
- **Serangan terkoordinasi:** Penyerang memakai serangan area saat 3 musuh atau lebih menumpuk di barikade.

**Tampilan peran di 3D:** tiap peran punya siluet dan warna berbeda (misalnya Penjaga bertubuh besar dengan tameng, Penyembuh membawa lentera) agar mudah dibedakan dari kamera atas.

## 6. Mekanik Inti

| Mekanik | Aturan |
| --- | --- |
| Shared health | Satu bar nyawa markas (awal 100) untuk seluruh tim; menang dan kalah bersama |
| Koin bersama | Musuh yang kalah menjatuhkan koin; siapa pun bisa mengambil, tetapi Pembangun memakainya untuk barikade dan jebakan |
| Revive | Pemain yang jatuh bisa dihidupkan teman dalam 5 detik berdiri di dekatnya; tanpa revive, pemain kembali di awal gelombang berikutnya |
| Skor tim | (sisa HP markas × 10) + (jumlah combo × 50) + bonus waktu; tidak ada skor individu |
| Peran MVP | Peran dengan kontribusi terbesar (damage, blokir, heal, jebakan terpakai), hanya sebagai hiburan di layar hasil |
| Bot solo | Peran yang tidak dipilih dimainkan bot sederhana (ikut markas, pakai skill sesuai pemicu) |
| Kesulitan adaptif | Jumlah dan kekuatan musuh menyesuaikan jumlah pemain manusia (2, 3, atau 4) |
| Gerak di 3D | Gerak pada bidang datar (sumbu X dan Z) dengan tabrakan sederhana (kapsul atau kotak); tidak ada lompat |
| Navigasi musuh | Musuh berjalan lurus ke markas dan menghindari penghalang dengan aturan sederhana (steering atau grid path); navmesh penuh hanya jika diperlukan |
| Batas objek aktif | Jumlah musuh aktif di layar dibatasi (usulan awal 30) dan memakai object pooling agar FPS stabil |

## 7. Musuh, Boss, dan Arena Level

**Jenis musuh** (nama dan perilaku dapat diubah)

| Musuh | Perilaku | Kelemahan | Anggaran poligon |
| --- | --- | --- | --- |
| Tikus Raksasa | Cepat, berombongan, menyerang markas langsung | Rentan serangan area | ≤ 300 |
| Hantu Iseng | Menembus barikade, menyerang pemain | Terhenti oleh jebakan | ≤ 400 |
| Pencuri | Mengincar koin yang jatuh dan kabur | Mudah dipancing Penjaga | ≤ 500 |
| Boss: Genderuwo | HP besar, tiga fase; hanya bisa diserang saat terkena stun jebakan | Perlu semua peran | ≤ 3.000 |

**Arena dan level**

| Level | Arena | Durasi | Musuh | Syarat menang |
| --- | --- | --- | --- | --- |
| 1. Latihan | Halaman pos ronda, kecil dan terbuka | ±1 menit | Tikus Raksasa | Semua gelombang habis |
| 2. Ronda Biasa | Jalan kampung dengan sawah dan pagar | ±2 menit | Tikus Raksasa, Hantu Iseng | Markas bertahan dari 4 gelombang |
| 3. Malam Jumat | Lapangan dengan pohon besar dan kabut tipis | ±2 menit | Semua jenis + boss | Boss kalah sebelum markas hancur |

**Layar hasil:** skor tim, peran MVP, jumlah combo, tombol Main Lagi, dan kembali otomatis ke menu setelah 30 detik tanpa input.

Semua arena dirancang agar seluruhnya terlihat oleh satu kamera tetap, dengan objek dekorasi dibuat dari model berulang (instancing) untuk menghemat performa.

## 8. Kebutuhan Fungsional

P0 wajib ada di demo, P1 dikerjakan jika P0 stabil, P2 hanya jika waktu cukup.

| ID | Kebutuhan | Prioritas | Kriteria penerimaan |
| --- | --- | --- | --- |
| F1 | Prototipe performa 3D (arena, 4 pemain, 30 musuh sederhana) | P0 | ≥ 30 FPS di laptop target; jika gagal, kembali ke versi 2D |
| F2 | Menu utama dan pemilihan peran 2–4 pemain | P0 | Tiap pemain mengunci satu peran unik; permainan mulai setelah semua siap |
| F3 | Gerak 3D pada bidang datar dan kamera top-down tetap | P0 | Semua pemain dan musuh terlihat jelas dalam satu layar |
| F4 | Empat peran dengan dua skill masing-masing | P0 | Skill aktif sesuai tombol; cooldown tampil di UI |
| F5 | Markas dengan shared health | P0 | Nyawa berkurang saat diserang; kalah saat 0 |
| F6 | Gelombang musuh dan 3 jenis musuh | P0 | Musuh muncul sesuai jadwal level, bernavigasi ke markas, bisa dikalahkan |
| F7 | Koin, barikade, dan jebakan | P0 | Koin terkumpul, biaya terpotong, jebakan membuat musuh stun |
| F8 | Revive teman | P0 | Teman jatuh hidup kembali setelah 5 detik berdekatan |
| F9 | Tiga level termasuk boss | P0 | Level 1 ke 3 berurutan; boss punya tiga fase |
| F10 | Layar hasil dan skor tim | P0 | Skor, MVP, dan combo tampil; tombol Main Lagi berfungsi |
| F11 | Kontrol 3 keyboard + 1 gamepad | P0 | Hingga 3 pemain di keyboard dan 1 di gamepad tanpa konflik tombol |
| F12 | Mode solo dengan bot | P0 | Pemain tunggal bisa menyelesaikan Level 1 dengan 3 bot |
| F13 | Pengaturan kualitas grafis (Rendah/Sedang) | P0 | Mode Rendah mematikan bayangan dan efek berat untuk menjaga FPS |
| F14 | Deteksi dan efek combo | P1 | Combo terdeteksi, menambah skor, dan memunculkan teks/efek |
| F15 | Efek suara dan musik | P1 | Suara skill, hit, menang, dan kalah; volume bisa diatur |
| F16 | Reset otomatis ke menu | P1 | Kembali ke menu setelah 30 detik tanpa input |
| F17 | Skin karakter bertema Minang | P2 | Pergantian tampilan tidak mengubah gameplay |
| F18 | Leaderboard di layar pameran | P2 | Skor tertinggi tersimpan selama acara berlangsung |

## 9. Visual 3D, Aset, UI, Kontrol, dan Audio

**Arah visual**

- Gaya low-poly sederhana dengan warna datar atau tekstur kecil; suasana malam kampung: lampu pos ronda, sawah, pagar bambu, pohon besar.
- Pencahayaan ringan: satu cahaya terarah lembut, satu cahaya titik di pos ronda, tanpa bayangan real-time di mode grafis Rendah.
- Warna pemain dan siluet peran harus kontras terhadap latar gelap agar terbaca dari kamera atas.

**Anggaran aset (target awal)**

| Objek | Batas poligon | Catatan |
| --- | --- | --- |
| Karakter pemain | ≤ 800 | Animasi sederhana: diam, jalan, skill |
| Musuh biasa | ≤ 300–500 | Banyak instance, gunakan instancing |
| Boss | ≤ 3.000 | Satu instance |
| Pos ronda (markas) | ≤ 2.000 | Satu instance |
| Total adegan | ≤ 100.000 segitiga | Dihitung di mode debug |
| Tekstur | ≤ 1024 px, total di bawah 50 MB | Format .webp atau .png ringan |
| Format model | .glb | Satu file per model, dimuat saat awal |

Sumber aset: buatan sendiri (Blender) atau aset gratis berlisensi (Kenney.nl, Quaternius, itch.io); setiap sumber dicatat di README untuk kredit.

**Kontrol (usulan awal)**

| Pemain | Perangkat | Gerak | Skill 1 | Skill 2 |
| --- | --- | --- | --- | --- |
| P1 | Keyboard | W A S D | Q | E |
| P2 | Keyboard | Panah | , (koma) | . (titik) |
| P3 | Keyboard | I J K L | U | O |
| P4 | Gamepad | Stik kiri | Tombol A | Tombol B |

Gerak mengikuti arah layar (atas = menjauh dari kamera), dan karakter menghadap ke arah bergerak.

**UI dan audio**

- HUD berupa lapisan 2D di atas adegan: ikon peran, bar HP, cooldown, bar nyawa markas, koin; teks besar dan kontras tinggi untuk dibaca dari jarak 1–2 meter.
- Efek suara jelas untuk tiap skill, combo, dan boss; musik loop ringan dengan sentuhan musik daerah; volume bisa diatur.

## 10. Teknologi dan Anggaran Performa

Laptop target memakai Intel N100 dengan grafis Intel UHD bawaan (tanpa GPU terpisah), sehingga performa grafis menjadi batas utama. RAM 16GB dan SSD tambahan sudah cukup untuk proses pengembangan.

| Aspek | Keputusan |
| --- | --- |
| Engine 3D | Babylon.js (fisika, tabrakan, input gamepad, dan loader model sudah tersedia) |
| Bahasa dan build | TypeScript + Vite |
| Model dan aset | Format .glb; dibuat di Blender atau dari aset gratis berlisensi |
| Fisika | Tabrakan sederhana (kapsul/kotak) dan gerak kinematik; hindari fisika rigid-body penuh untuk banyak musuh |
| Input | Keyboard untuk 3 pemain, Gamepad API untuk pemain ke-4 |
| Data game | File JSON untuk peran, musuh, level, dan gelombang |
| Hosting | Vercel atau Netlify untuk link web, plus build lokal yang berjalan offline untuk laptop pameran |
| Kerja tim | Git dan GitHub; pembuatan kode dibantu Claude Code lewat Antigravity |

**Anggaran performa dan teknik penghematan**

| Batas | Nilai target |
| --- | --- |
| Frame rate | ≥ 30 FPS stabil di laptop target |
| Resolusi render | Skala internal bisa diturunkan (misalnya 0,75×) bila FPS turun |
| Musuh aktif bersamaan | ≤ 30 (usulan awal), memakai object pooling |
| Pencahayaan | ≤ 2 sumber cahaya aktif; bayangan hanya di mode Sedang |
| Efek pasca-proses | Mati secara default |
| Instancing | Wajib untuk objek berulang (pagar, pohon, musuh biasa) |
| Draw call | Jaga rendah dengan menggabungkan mesh statis |
| Muat aset | Semua aset dimuat di awal; tidak ada unduhan saat bermain |
| Offline | Wajib berjalan tanpa internet |

Setiap tahap pembangunan harus ditutup dengan pengecekan FPS di laptop target; jika turun di bawah 30 FPS, kurangi musuh aktif, resolusi, atau efek sebelum menambah fitur.

## 11. Rencana, Risiko, dan Pertanyaan Terbuka

**Keputusan go/no-go di awal.** Tahap 1 adalah prototipe performa: satu arena, 4 karakter sederhana, 30 musuh. Jika berjalan ≥ 30 FPS di laptop target, lanjut 3D. Jika tidak, hentikan dan pakai PRD versi 2D tanpa kehilangan banyak waktu.

**Tahapan (berurutan, durasi disesuaikan dengan tenggat dan jumlah anggota)**

1. **Prototipe performa dan fondasi:** setup proyek, arena 3D, kamera, gerak 4 pemain, 30 musuh sederhana, ukur FPS.
2. **Satu peran dan musuh:** pemilihan peran, markas, satu jenis musuh, koin, peran Penyerang.
3. **Peran lain:** Penjaga, Pembangun, Penyembuh, jebakan, barikade, revive.
4. **Level 1–2:** gelombang, musuh tambahan, skor tim, kesulitan adaptif.
5. **Boss, Level 3, hasil, dan bot solo.**
6. **Poles:** combo, suara, efek, reset otomatis, penyeimbangan, optimasi performa.
7. **Persiapan pameran:** build offline, uji stabilitas, uji perangkat, cadangan.

**Pembagian peran tim (usulan, sesuaikan jumlah anggota)**

| Bidang | Tanggung jawab |
| --- | --- |
| Programmer gameplay | Gerak, skill, musuh, markas, combo |
| Programmer sistem/UI | Menu, pemilihan peran, HUD, layar hasil, bot |
| Artis 3D | Model low-poly, animasi dasar, tekstur, optimasi aset |
| Desainer level dan balance | Arena, gelombang, angka, playtest |
| Audio | Efek suara dan musik |

**Risiko dan mitigasi**

| Risiko | Dampak | Mitigasi |
| --- | --- | --- |
| FPS rendah di Intel UHD | Game tersendat saat demo | Prototipe go/no-go, anggaran poligon, instancing, pooling, mode grafis Rendah |
| Pembuatan aset 3D memakan waktu | Visual tidak selesai | Pakai aset gratis berlisensi, placeholder kotak dulu, gaya sangat sederhana |
| Scope membengkak | Game tidak selesai | Kunci 4 peran dan 3 level; P1/P2 hanya setelah P0 stabil |
| Tombol bentrok di satu keyboard | Pemain 3 tidak bisa main | Uji kombinasi tombol sejak awal; siapkan gamepad atau keyboard cadangan |
| Bug saat demo | Kehilangan nilai di depan juri | Build cadangan, uji di perangkat acara, reset otomatis |
| Pengunjung bingung | Waktu main terbuang | Level 1 sebagai tutorial, petunjuk singkat, tes dengan orang baru |

**Rencana pengujian:** ukur FPS di setiap akhir tahap; playtest internal; satu uji dengan 3–4 orang yang belum pernah melihat game; uji stabilitas 1 jam di perangkat pameran.

**Pertanyaan terbuka**

- [ ] Berapa anggota tim, dan siapa yang berpengalaman membuat model 3D (Blender)?
- [ ] Berapa lama waktu pengerjaan sampai hari pameran?
- [ ] Apakah laptop pameran sama dengan laptop pengembangan (Advan TBook), atau ada perangkat lain?
- [ ] Memakai aset gratis berlisensi atau membuat model sendiri?
- [ ] Apakah ada syarat khusus dari panitia (format submission, durasi demo, kategori penilaian)?

## 12. Prompt Pembangunan per Tahap (Antigravity)

Kirim prompt berurutan, satu per satu, dan tes hasilnya (termasuk FPS) sebelum lanjut. Prompt 1 membuat file `docs/PRD.md` di proyek, sehingga prompt 2–7 cukup merujuk ke file itu dan tetap konsisten walau sesi baru dimulai. Jika FPS di Prompt 1 di bawah 30, berhenti dan kembali ke PRD versi 2D.

### Prompt 1: Fondasi dan prototipe performa

```
Kamu adalah game developer senior. Kita membangun game web 3D low-poly bernama Ronda Bareng (tema: Ronda Kampung) memakai Babylon.js + TypeScript + Vite. Kerjakan HANYA Tahap 1 di bawah. Setelah selesai, jalankan game (npm run dev), perbaiki error, laporkan FPS yang terukur, jelaskan cara mengetesnya, lalu BERHENTI dan tunggu perintah berikutnya.

LANGKAH PERTAMA: buat file docs/PRD.md berisi spesifikasi di bawah ini apa adanya, sebagai acuan semua tahap berikutnya.

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

=== TAHAP 1: FONDASI DAN PROTOTIPE PERFORMA ===
1. Setup proyek Babylon.js + TypeScript + Vite. Struktur folder: src/scenes, src/entities, src/systems, src/data (JSON), src/config, src/ui.
2. Scene arena 3D sederhana (lantai, beberapa objek dekorasi memakai instancing, pos ronda placeholder di tengah), kamera top-down miring tetap yang menampilkan seluruh arena, satu cahaya terarah lembut.
3. Empat karakter placeholder (kapsul berwarna berbeda dengan penanda hadap) yang bergerak pada bidang X-Z oleh masing-masing input: 3 keyboard + 1 gamepad, bersamaan tanpa saling mengganggu, tetap di dalam batas arena.
4. InputManager terpisah yang memetakan kontrol di atas dan mudah diubah.
5. Prototipe performa: spawn 30 musuh placeholder (kubus kecil) yang berjalan ke pos ronda memakai object pooling dan instancing.
6. Layar debug (toggle F1): FPS, jumlah draw call, jumlah segitiga, jumlah musuh aktif, serta input yang terdeteksi per pemain (untuk uji tombol bentrok).
7. Pengaturan kualitas grafis Rendah/Sedang (bayangan dan skala resolusi), tombol fullscreen.
8. Di akhir, laporkan FPS rata-rata dan terendah pada mode Rendah dan Sedang saat 4 karakter bergerak dan 30 musuh aktif.

Kriteria selesai: berjalan tanpa error, 4 karakter bergerak bersamaan, laporan FPS tertulis, panduan tes singkat di akhir jawaban.
```

### Prompt 2: Satu peran, markas, dan musuh

```
Baca docs/PRD.md sebagai acuan. Kerjakan HANYA Tahap 2. Sebelum mulai, jalankan game dan perbaiki error atau warning dari Tahap 1. Setelah selesai, laporkan FPS, jelaskan cara mengetes, lalu BERHENTI.

=== TAHAP 2: SATU PERAN, MARKAS, DAN MUSUH ===
1. RoleSelectScene: pemain bergabung dengan tombol skill 1 masing-masing, memilih peran dengan tombol gerak kiri/kanan. Satu peran hanya untuk satu pemain. Permainan mulai setelah semua pemain yang bergabung siap (minimal 2). Tampilkan ikon, nama, dan deskripsi satu kalimat tiap peran.
2. Data peran di src/data/roles.json dan musuh di src/data/enemies.json. Jangan tulis angka langsung di kode.
3. Pos ronda (markas) dengan shared health (awal 100), bar nyawa besar di HUD. Saat 0, tampilkan layar Kalah dengan tombol Coba Lagi.
4. Musuh Tikus Raksasa (model low-poly sederhana, maks 300 segitiga): muncul dari beberapa titik di tepi arena, bergerak ke markas dengan steering sederhana, menyerang markas, bisa dikalahkan. Pakai object pooling dan batas musuh aktif dari JSON.
5. Koin: musuh yang kalah menjatuhkan koin 3D kecil; pemain mengambil dengan menyentuh. Jumlah koin bersama di HUD.
6. Peran Penyerang lengkap: Serangan cepat (proyektil atau raycast searah hadap) dan Serangan area (radius 4, cooldown 15 dtk), dengan efek visual sederhana dan indikator cooldown di HUD.
7. Pemain punya HP dan bisa terkena musuh. Jika HP 0, pemain masuk status jatuh (revive di Tahap 3).
8. Satu gelombang percobaan yang berulang agar mekanik bisa dites. Pertahankan layar debug dari Tahap 1.

Kriteria selesai: pilih peran dan main; Penyerang mengalahkan Tikus Raksasa; koin terkumpul; markas bisa rusak dan kalah; FPS tetap ≥ 30 dengan 4 pemain dan musuh aktif maksimal.
```

### Prompt 3: Peran lain dan revive

```
Baca docs/PRD.md sebagai acuan. Kerjakan HANYA Tahap 3. Sebelum mulai, jalankan game dan perbaiki error atau warning dari Tahap 2. Setelah selesai, laporkan FPS, jelaskan cara mengetes, lalu BERHENTI.

=== TAHAP 3: PERAN LAIN DAN REVIVE ===
1. Penjaga: Perisai (blokir serangan dari satu arah 3 dtk, cooldown 8 dtk, tampilkan perisai di depan karakter) dan Pancing (musuh dalam radius 6 mengubah target ke Penjaga 4 dtk, cooldown 12 dtk, tampilkan lingkaran di tanah).
2. Pembangun: Barikade (blok penghalang di depan karakter, 10 koin, ada HP barikade) dan Jebakan (pasang di tanah, musuh yang menginjak terkena stun 3 dtk, 15 koin). Koin dipotong dari koin bersama; tolak aksi jika koin kurang dan beri umpan balik di HUD.
3. Penyembuh: Heal (pulihkan HP markas atau teman terdekat dalam radius 5) dan Buff (kecepatan tim +30% selama 5 dtk), dengan efek visual sederhana (cincin atau partikel ringan).
4. Revive: pemain jatuh dihidupkan teman yang berdiri di dekatnya selama 5 dtk (bar progres di atas karakter). Jika tidak, kembali di awal gelombang berikutnya.
5. Semua skill memakai nilai dari roles.json, dengan visual placeholder jelas dan indikator cooldown di HUD.
6. Musuh bereaksi benar terhadap barikade (mencari jalan atau menyerang barikade), jebakan (stun), dan Pancing (ganti target). Pastikan barikade dan jebakan tidak membuat FPS turun dengan memakai instancing.
7. Mode debug untuk menguji skill tanpa menunggu gelombang.

Kriteria selesai: keempat peran bisa dimainkan bersamaan, revive bekerja, kombinasi Pancing + Jebakan + Penyerang terasa efektif, FPS ≥ 30.
```

### Prompt 4: Level 1–2, gelombang, dan skor

```
Baca docs/PRD.md sebagai acuan. Kerjakan HANYA Tahap 4. Sebelum mulai, jalankan game dan perbaiki error atau warning dari Tahap 3. Setelah selesai, laporkan FPS, jelaskan cara mengetes, lalu BERHENTI.

=== TAHAP 4: LEVEL 1-2, GELOMBANG, DAN SKOR ===
1. Sistem level berbasis data di src/data/levels.json: gelombang (waktu muncul, jenis musuh, jumlah, titik spawn) per level. Buat LevelManager yang membaca data itu.
2. Dua arena 3D low-poly: Level 1 halaman pos ronda (kecil, terbuka) dan Level 2 jalan kampung dengan sawah dan pagar. Dekorasi berulang wajib memakai instancing. Seluruh arena harus terlihat oleh kamera tetap.
3. Musuh baru: Hantu Iseng (menembus barikade, menyerang pemain, terhenti oleh jebakan) dan Pencuri (mengincar koin yang jatuh lalu kabur; Pancing menarik perhatiannya). Model sederhana sesuai anggaran poligon di PRD.
4. Level 1 Latihan (±1 menit): hanya Tikus Raksasa, dengan petunjuk singkat di layar (maksimal satu kalimat per skill) yang muncul saat konteksnya tepat.
5. Level 2 Ronda Biasa (±2 menit): Tikus Raksasa + Hantu Iseng, 4 gelombang.
6. Kesulitan adaptif: jumlah dan HP musuh mengikuti jumlah pemain manusia (2, 3, atau 4) lewat pengali di levels.json.
7. ScoreSystem terpisah: (sisa HP markas x 10) + (jumlah combo x 50, sementara 0 sampai Tahap 6) + bonus waktu.
8. Alur: Level 1, Level 2, (nanti) Level 3. Layar transisi antar level menampilkan skor sementara. Kalah menampilkan Coba Lagi untuk level yang sama.
9. Pelacak kontribusi per peran (damage, blokir, heal, jebakan terpakai) untuk penentuan MVP di Tahap 5.

Kriteria selesai: Level 1 dan 2 bisa dimainkan berurutan sampai menang atau kalah, skor tim muncul, Pencuri dan Hantu Iseng berperilaku sesuai PRD, FPS ≥ 30 di kedua arena.
```

### Prompt 5: Boss, Level 3, layar hasil, dan bot solo

```
Baca docs/PRD.md sebagai acuan. Kerjakan HANYA Tahap 5. Sebelum mulai, jalankan game dan perbaiki error atau warning dari Tahap 4. Setelah selesai, laporkan FPS, jelaskan cara mengetes, lalu BERHENTI.

=== TAHAP 5: BOSS, LEVEL 3, LAYAR HASIL, DAN BOT SOLO ===
1. Boss Genderuwo (maks 3.000 segitiga): HP besar, 3 fase dengan perilaku berbeda (fase 1 berjalan lambat dan memukul, fase 2 memanggil Tikus Raksasa, fase 3 mengamuk lebih cepat). Boss hanya menerima damage saat terkena stun dari jebakan. Tampilkan bar HP boss dan fase di HUD.
2. Arena Level 3 Malam Jumat: lapangan dengan pohon besar dan kabut tipis (gunakan kabut sederhana, bukan efek berat). Level 3 (±2 menit) berisi semua jenis musuh + boss, data dari levels.json.
3. Layar hasil: skor tim, peran MVP (kontribusi terbesar dari pelacak Tahap 4), jumlah combo, tombol Main Lagi, kembali otomatis ke menu setelah 30 dtk tanpa input.
4. Bot sederhana untuk peran yang tidak dipilih manusia: tetap di sekitar markas dan memakai skill saat pemicu terpenuhi (Penjaga memancing saat musuh dekat markas, Pembangun memasang jebakan di jalur musuh jika koin cukup, Penyerang menembak musuh terdekat, Penyembuh heal saat HP markas di bawah 70%).
5. Pemain tunggal harus bisa menyelesaikan Level 1 dengan 3 bot.
6. Alur penuh: Menu, Pilih Peran, Level 1, Level 2, Level 3, Hasil, kembali ke Menu.

Kriteria selesai: seluruh alur bisa dimainkan dari menu sampai layar hasil dengan 1 sampai 4 pemain manusia, boss hanya bisa dikalahkan lewat kerja sama, FPS ≥ 30 saat boss dan musuh aktif.
```

### Prompt 6: Poles dan optimasi

```
Baca docs/PRD.md sebagai acuan. Kerjakan HANYA Tahap 6. Sebelum mulai, jalankan game dan perbaiki error atau warning dari Tahap 5. Setelah selesai, laporkan FPS, jelaskan cara mengetes, lalu BERHENTI.

=== TAHAP 6: POLES DAN OPTIMASI ===
1. ComboSystem terpisah: (a) Jebak dan habisi (musuh terkena jebakan lalu dikalahkan Penyerang dalam 3 dtk), (b) Tahan dan pulihkan (Penjaga memblokir dan Penyembuh heal markas dalam jendela waktu yang sama), i Web Audio atau file kecil berlisensi bebas. Pengaturan volume di menu.
3. Efek visual ringan: guncangan kamera singkat saat markas terkena serangan, partikel ringan (batasi jumlah) saat musuh kalah, penanda jelas untuk jebakan dan barikade.
4. Reset otomatis ke menu setelah 30 dtk tanpa input.
5. Optimasi performa: audit draw call dan jumlah segitiga, gabungkan mesh statis, pastikan instancing dan pooling dipakai di semua objek berulang, bersihkan objek dan tekstur saat berpindah level, pertimbangkan penurunan skala resolusi otomatis jika FPS turun di bawah 30.
6. Penyeimbangan: pindahkan semua angka yang masih ada di kode ke JSON dan buat docs/BALANCE.md untuk angka yang sering disetel.
7. Perbaiki hal yang membingungkan bagi pengunjung baru: petunjuk Level 1, keterbacaan ikon skill dan siluet peran dari kamera atas, warna pemain tidak bergantung warna saja.

Kriteria selesai: combo terdeteksi dan menambah skor, ada suara dan musik dengan kontrol volume, reset otomatis berfungsi, tidak ada angka keseimbangan yang tertanam di kode, FPS ≥ 30 di semua level.(c) Serangan area saat 3 musuh atau lebih menumpuk di barikade. Tiap combo menambah 50 skor dan memunculkan teks COMBO dengan efek visual singkat.
2. Efek suara untuk skill, kena serangan, koin, revive, combo, boss, menang, dan kalah. Musik loop ringan. Paka
```

### Prompt 7: Persiapan pameran

```
Baca docs/PRD.md sebagai acuan. Kerjakan HANYA Tahap 7. Sebelum mulai, jalankan game dan perbaiki error atau warning dari Tahap 6. Setelah selesai, jelaskan hasilnya, lalu BERHENTI.

=== TAHAP 7: PERSIAPAN PAMERAN ===
1. Build produksi (npm run build) yang berjalan sepenuhnya OFFLINE: tanpa CDN, font, atau aset dari internet saat game berjalan. Tambahkan cara menjalankan build secara lokal (npm run preview atau server statis sederhana) dan tulis langkahnya di README.md.
2. Audit performa di mode Rendah dan Sedang saat 4 pemain, musuh aktif maksimal, dan boss. Catat FPS rata-rata dan terendah di docs/TEST_REPORT.md. Cari kebocoran memori antar level dan antar ronde, lalu perbaiki.
3. Uji stabilitas: bermain berulang dari menu sampai hasil minimal 10 kali berturut-turut tanpa crash atau melambat. Catat hasilnya.
4. Uji input: kombinasi tombol 3 pemain di satu keyboard; jika ada yang bentrok, usulkan pemetaan alternatif dan buat kontrol bisa diubah lewat satu file konfigurasi.
5. Uji skenario pengunjung: pemain baru tanpa penjelasan, pemain sendirian dengan bot, 4 pemain bersamaan, tanpa gamepad, resolusi 1366x768 dan 1920x1080.
6. Tangani kasus error: gamepad dicabut saat bermain, tab kehilangan fokus (game otomatis jeda), WebGL tidak tersedia (tampilkan pesan jelas).
7. Tombol fullscreen yang jelas dan kursor disembunyikan saat bermain.
8. Perbarui README.md: cara instal, jalankan, build, kontrol, pengaturan grafis, cara mengubah angka keseimbangan, dan daftar kredit aset.

Kriteria selesai: build offline berjalan stabil di laptop target, laporan uji tertulis jujur termasuk masalah yang tersisa, README lengkap.
```

### Prompt cadangan: perbaikan bug atau FPS rendah

Pakai kapan saja ada masalah di tahap mana pun.

```
Baca docs/PRD.md sebagai acuan. Ada masalah di game:

Masalah: [jelaskan apa yang terjadi]
Seharusnya: [perilaku yang diharapkan sesuai PRD]
Langkah mengulang: [langkah 1, 2, 3]
Pesan error di konsol (jika ada): [tempel di sini]
FPS saat masalah terjadi (jika terkait performa): [angka dari layar debug F1, termasuk draw call dan jumlah segitiga]

Cari penyebab utamanya, perbaiki dengan perubahan sekecil mungkin tanpa merusak fitur lain, jelaskan penyebabnya, dan beri cara menguji bahwa masalah sudah hilang. Jangan menambah fitur baru.
```
