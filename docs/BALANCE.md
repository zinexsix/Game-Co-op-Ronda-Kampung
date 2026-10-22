# Penyeimbangan Ronda Bareng

Semua angka gameplay ada di empat file JSON di `src/data/`. Kode tidak menyimpan angka keseimbangan.
Yang tersisa di kode hanya konstanta tampilan (durasi animasi, kedipan, ukuran efek) dan perkakas benchmark.

| File | Isi |
|---|---|
| `roles.json` | Peran: HP, kecepatan, semua angka skill |
| `enemies.json` | Musuh: HP, kecepatan, damage, perilaku, boss, steering (`ai`) |
| `levels.json` | Gelombang per level, pengali jumlah pemain, skor, alur, petunjuk |
| `game.json` | Markas, koin, revive, bot, combo, MVP, audio, reset idle, kualitas otomatis |

Ubah angka, simpan, lalu muat ulang halaman. Dev server (`npm run dev`) memuat ulang sendiri.

## Cara menguji perubahan dengan cepat

- `?roles=penyerang,pembangun&level=3&uji` langsung masuk Level 3 dengan mode uji.
  - F7 memunculkan musuh bergiliran: Tikus, Hantu, Pencuri.
  - F8 menambah koin dan mengosongkan cooldown.
  - F9 menjatuhkan pemain.
- `&bot=0` mematikan bot; `&idle=0` mematikan reset ke menu.
- F1 membuka layar debug: FPS, kontribusi per peran, dan skor tim.

## Angka yang paling sering disetel

### Kesulitan umum

| Angka | Lokasi | Nilai | Efek |
|---|---|---|---|
| Nyawa pos ronda | `game.json` → `markas.hp` | 100 | Makin besar, makin lama tim bertahan |
| Pengali jumlah & HP musuh | `levels.json` → `playerScaling` | 1: 0,75/0,85 · 2: 1/1 · 3: 1,3/1,15 · 4: 1,6/1,3 | Kunci = jumlah pemain **manusia** (bot tidak dihitung) |
| Musuh aktif maksimal | `enemies.json` → `maxActive` | 30 | Batas performa; gelombang menunggu jika penuh |
| Jadwal gelombang | `levels.json` → `levels[].waves[]` | `at`, `count`, `interval` | `at` = detik sejak level mulai |
| Gelombang dimajukan | `levels.json` → `flow.earlyNextWaveSec` | 3 | Arena kosong selama ini → gelombang berikutnya langsung mulai |

### Musuh

| Angka | Lokasi | Nilai | Catatan |
|---|---|---|---|
| Tikus: HP / kecepatan / damage markas | `enemies.json` → `tikus` | 20 / 3,2 / 1 per 1 dtk | Musuh utama, rentan Serangan Area |
| Hantu: HP / damage pemain | `enemies.json` → `hantu` | 30 / 8 | Menembus barikade, mengejar pemain |
| Pencuri: koin dicuri / kabur | `enemies.json` → `pencuri` | `carryMax` 3, `fleeSpeedMult` 1,25 | `lureMultiplier` 1,75 = mudah dipancing |
| Boss: HP | `enemies.json` → `genderuwo.hp` | 380 | Hanya terluka saat terjebak |
| Boss: koin per kali terjebak | `genderuwo.boss.coinsOnStun` | 8 | Mencegah tim kehabisan koin jebakan. Jangan 0 |
| Boss: kebal stun setelah stun | `genderuwo.boss.stunCooldownSec` | 3 | Makin kecil, makin mudah "dikunci" di jebakan |
| Boss: fase | `phase2At` / `phase3At` | 0,66 / 0,33 | Rasio HP; fase 2 memanggil tikus, fase 3 mengamuk |
| Boss: damage ke pos / pemain | `baseDamage` / `playerDamage` | 3 / 18 | Hantaman mengenai semua pemain dalam `slamRadius` 2,6 |

### Peran

| Angka | Lokasi | Nilai | Catatan |
|---|---|---|---|
| Kecepatan kelas | `roles.json` → `speedClasses` | lambat 3,6 · sedang 4,6 · cepat 5,8 | m/dtk |
| Serangan Cepat | `penyerang.skills[0]` | 7 dmg, jeda 0,16 dtk, jarak 13 | Sekitar 44 DPS saat ditahan terus |
| Serangan Area | `penyerang.skills[1]` | radius 4, 40 dmg, cooldown 15 | 40 dmg = langsung mengalahkan tikus |
| Perisai | `penjaga.skills[0]` | 3 dtk, cooldown 8, sudut 150° | Memblokir dari arah hadap |
| Pancing | `penjaga.skills[1]` | radius 6, 4 dtk, cooldown 12 | |
| Barikade | `pembangun.skills[0]` | 10 koin, HP 60, lebar 2,6 | Maksimal 6, yang tertua diganti |
| Jebakan | `pembangun.skills[1]` | 15 koin, stun 3 dtk, 3 muatan | `triggerRadius` 0,8 (injak), `radius` 2,2 (stun) |
| Heal | `penyembuh.skills[0]` | +30 teman / +12 pos, cooldown 6 | |
| Buff | `penyembuh.skills[1]` | +30% kecepatan, 5 dtk, cooldown 14 | Untuk seluruh tim |

### Ekonomi, revive, skor, combo

| Angka | Lokasi | Nilai | Catatan |
|---|---|---|---|
| Koin per musuh | `enemies.json` → `coinDrop` | tikus 1, hantu 2, pencuri 2, boss 12 | |
| Umur koin di tanah | `game.json` → `coins.lifetimeSec` | 20 | Berkedip 3 dtk terakhir |
| Revive | `game.json` → `revive` | 5 dtk, radius 1,8, bangkit 50% HP | `decayPerSec` = bar turun jika ditinggal |
| Skor | `levels.json` → `score` | HP pos ×10, combo ×50, bonus waktu 5/dtk | Bonus waktu = (waktu par − waktu main) × 5 |
| Jendela combo | `game.json` → `combos` | jebak→habisi 3 dtk, blokir↔heal 4 dtk | Sapu Barikade: minimal 3 musuh dalam 1,4 m dari barikade |
| Bobot MVP | `game.json` → `mvp` | damage 1, kill 5, revive 30, … | Poin kontribusi berbobot per peran |

### Bot (peran yang tidak dipilih manusia)

Semua ada di `game.json` → `bots`. Yang paling berpengaruh:

| Angka | Nilai | Efek |
|---|---|---|
| `leashRadius` | 11 | Seberapa jauh bot boleh meninggalkan pos ronda |
| `healMarkasBelow` | 0,7 | Penyembuh bot memulihkan pos di bawah 70% HP |
| `lureMinEnemies` | 2 | Jumlah musuh dekat pos sebelum Penjaga bot memancing |
| `bossTrapReserve` | 2 | Pembangun bot menyimpan koin untuk jebakan boss |
| `areaMinEnemies` | 3 | Penyerang bot memakai Serangan Area jika musuh sebanyak ini berkerumun |

## Catatan dari pengujian Tahap 5–6

- Level 1 dan 2 solo (1 manusia + 3 bot) menang dengan nyaman.
- Level 3 solo masih menantang. Jika terlalu sulit di stan, setel dulu salah satu dari:
  - `genderuwo.hp` (turunkan),
  - `coinsOnStun` (naikkan),
  - `playerScaling."1"` (turunkan).
- Boss tanpa koin jebakan tidak bisa dilukai sama sekali. Jaga agar `coinsOnStun` dan koin dari tikus panggilan (`summonCount`) cukup untuk jebakan berikutnya (15 koin).
