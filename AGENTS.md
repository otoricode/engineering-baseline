# Agents — pintu masuk agen

Untuk agen yang mengeksekusi perubahan di sebuah repository yang memasang standar ini.
Imperatif, berdaftar-periksa. Aturan hidup **hanya** di `rules/`; berkas ini **menunjuk** ID
(`[[ID]]`), tidak pernah menyatakan ulang isinya — kalau sebuah larangan di bawah terasa kurang
detail, itu disengaja: buka `[[ID]]`-nya, jangan tebak dari judulnya.

## 1. Baca dulu

Sebelum menyentuh kode di lapis mana pun, baca:

- [`rules/README.md`](rules/README.md) — skema prefix delapan lapis, format satu aturan, siklus
  hidup ID, dan tabel cakupan (mana yang ikut terbawa saat paket ini disalin ke proyek lain).
- Berkas aturan **lapis yang kau sentuh** — `S-`, `C-`, `B-`, `W-`, `G-`, `T-`, `I-`, atau `O-` di
  `rules/`. Jangan mulai dari [`STANDARD.md`](STANDARD.md); itu ringkasan naratif untuk manusia,
  bukan sumbernya.

Kalau kau tidak yakin lapis mana yang relevan, itu sendiri sinyal: baca [[T-01]] lebih dulu —
tenancy memotong seluruh lapis lain dan sering yang paling mudah terlewat.

## 2. Larangan keras

Tiga larangan berikut tidak bisa ditawar oleh konteks tugas apa pun:

- **Jangan menyunting artefak generated dengan tangan.** Kalau keluarannya salah, itu tanda
  sumbernya yang perlu diperbaiki, bukan hasil generate-nya — cakupan persisnya (apa saja yang
  termasuk "generated") ada di [[B-03]].
- **Jangan menulis atau menyalin lapisan query seolah ia bisa digenerate.** Ini satu-satunya
  lapis yang wajib ditulis tangan di tiap repository; alasannya, dan kenapa generator yang
  menyentuhnya dianggap mengarang batas keamanan, ada di [[T-01]].
- **Jangan mengedit daftar opt-in (allowlist) dengan cara apa pun selain menambah tepat satu
  entri sekaligus memindahkan kodenya.** Bentuk yang salah, dan kenapa menambah nama tanpa
  memindahkan kodenya membuat daftarnya berbohong, ada di [[G-02]].

## 3. Sebelum mengklaim selesai

Klaim "selesai" tanpa bukti keadaan bukan laporan, itu label — dan label bukan bukti. [[O-02]]

- [ ] Jalankan perintah verifikasi yang relevan dengan perubahanmu (`pnpm test`,
      `./bin/standard rules-lint`, `./bin/standard doctor`, atau gate spesifik lapis yang kau
      sentuh) dan **tempel keluarannya**, bukan ringkasan yang kau tulis ulang. Suite paket
      standar sendiri menuntut `git`, `make`, dan toolchain Go ada di mesin — ketiganya gagal
      keras, bukan dilewati, karena artefak yang tidak pernah dijalankan terlihat persis seperti
      artefak yang lulus.
- [ ] Kalau klaimmu menyangkut keamanan atau batas penyewa, jangan menuliskannya tanpa syarat
      batasnya — klaim yang terdengar benar sering gugur begitu dibaca lebih dalam. Bentuk laporan
      yang lengkap dan daftar kalimat yang **bukan** bukti meski terdengar seperti bukti ada di
      [[T-04]].
- [ ] Kalau klaimmu menyangkut sebuah PR, branch, atau perintah yang barusan kau jalankan,
      buktikan lawan keadaan sungguhan, bukan lawan label yang kau baca — apa yang menghitung
      sebagai bukti untuk tiap jenis klaim ada di [[O-02]].
- [ ] Kalau kau bekerja di pohon artefak generated, pastikan kau bisa membuktikan mana perubahan
      yang milikmu sebelum menjalankan gate sinkronisasinya. [[O-07]]

## 4. Saat gate merah

Urutannya tetap, jangan dibalik:

1. **Baca ID aturan di pesan gate-nya.** Setiap gate wajib menyitirnya. [[G-04]]
2. **Buka aturan itu di `rules/`** — bagian **Aturan**, **Mengapa**, dan **Cara memverifikasi**.
   Bagian **Mengapa** memberitahumu kegagalan konkret yang melahirkannya; itu sering yang
   menjelaskan kenapa perbaikan yang "terlihat benar" masih ditolak.
3. **Perbaiki lapis yang aturan itu tegakkan**, bukan gate-nya. Gate yang tampak salah biasanya
   sedang mengungkap sebuah asumsi yang keliru di kode, bukan sebaliknya — kalau kau tetap yakin
   gate-nya salah, itu perubahan yang butuh alasan tertulis, bukan bypass diam-diam.
4. **Jangan menebak dari nama gate saja.** Nama gate memberi arah lapisnya, bukan isi aturannya,
   dan satu gate sering menegakkan lebih dari satu aturan sekaligus. Cek relasi gate-ke-aturan di
   tabel penutup [`STANDARD.md`](STANDARD.md#aturan-mana-ditegakkan-gate-mana) sebelum
   menyimpulkan kau sudah menutup semuanya.
5. **Baca penanda `(konsumen)` di kolom penegak sebelum menyimpulkan sebuah aturan terjaga.** Nama
   gate bertanda itu **tidak dikirim paket ini**; proyeknya yang wajib menyediakannya, dan di
   proyek yang belum menyediakannya aturan itu tidak ditegakkan siapa pun. Perlakukan seperti
   `manual-review-only`: buktikan dengan membaca kode, jangan menyimpulkan dari gate yang hijau.
   Sembilan nama gate hari ini bertanda begitu, [[T-02]] (batas penyewa) dan [[G-02]] (allowlist
   monoton) termasuk. Penandanya sendiri ber-gate: `rules-lint` memerahkan nama gate yang mengaku
   dikirim padahal tidak, dan penanda yang basi.
