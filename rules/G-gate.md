# G — Gate

Aturan tanpa penegak adalah harapan. Berkas ini mengatur bagaimana penegaknya dibangun, dipasang
tanpa memerahkan seluruh papan, dan dibuktikan benar-benar menggigit.

---

## G-01 · Tiap aturan menyebut penegaknya

**Ditegakkan oleh:** `standard rules-lint`

**Aturan.** Setiap aturan menyebut penegaknya: **nama gate**, atau `manual-review-only` beserta
**alasan** mesin tak bisa memeriksanya. Aturan yang hanya dijaga review mengatakannya. **Tidak
ada aturan yang berpura-pura ditegakkan.**

Dan alasannya wajib membedakan dua keadaan yang sering dikaburkan: *belum ada yang menuliskan
gate-nya* versus *memang tidak bisa dimesinkan*. Keduanya menghasilkan kolom "review" yang sama
dan menuntut keputusan yang sama sekali berbeda saat memilih apa yang layak dibangun.

Rujukan silang `[[ID]]` mengikat aturan yang saling bergantung, dan setiap ID yang dirujuk wajib
ada.

**Mengapa.** Aturan tanpa gate cepat basi: satu aturan freeze ditulis sebagai proses lalu
**dilanggar di PR pertama sesudahnya, tiga hari kemudian** ([[S-03]]), dan baru berlaku setelah
jadi gate CI.

Arah sebaliknya sama mahalnya dan jauh lebih sulit dilihat: dalam satu ulasan atas satu himpunan
aturan, **tiga aturan menyebut penegak yang tidak menjaganya**. Satu menyebut gate yang
**belum pernah ada sama sekali**. Satu dibantah oleh pengukuran — linter yang disebutnya
**meloloskan tanpa sepatah kata pun** pola yang aturan itu larang, jadi justru aturan itulah yang
paling butuh gate karena tooling mengabaikannya diam-diam dan tidak ada gejala alami. Satu lagi
menyebut sebuah gate envelope yang sumbernya memuat **nol** rujukan ke aturan tersebut. Kolom
penegak yang berbohong lebih buruk daripada kolom kosong: ia **menghentikan orang membangun
penjaga yang sungguhan**, karena masalahnya tampak sudah beres.

**Cara memverifikasi.** `standard rules-lint` — ID unik dan tak pernah dipakai ulang, tiap aturan
punya baris penegak, tiap `[[ID]]` menunjuk aturan yang ada, heading cocok pola judul.
Pemeriksaan kedua yang tidak bisa dilakukan lint dan wajib dilakukan manusia: untuk tiap aturan
yang menyebut sebuah gate, **grep sumber gate itu untuk ID aturannya**. Nol hasil berarti kolom
penegaknya sebuah klaim, bukan fakta — dan itu langsung mengikat [[G-04]].

---

## G-02 · Gate opt-in: daftar hanya boleh bertambah

**Ditegakkan oleh:** `gate:allowlist-monotonic (konsumen)`

**Aturan.** Gate baru dipasang **ketat sejak hari pertama**, tapi hanya memeriksa yang terdaftar
di allowlist-nya. Daftar itu **hanya boleh bertambah**, dan tiap PR menambahkan **tepat satu**
nama **sekaligus memindahkan kodenya**. Menambah nama tanpa memindahkan kodenya = daftar
berbohong, dan itu sendiri pelanggaran ber-ID.

Modul di luar daftar **tidak sedang diampuni** — ia **belum diklaim bersih**, pernyataan yang
lebih lemah sekaligus lebih jujur.

Ini **bukan** baseline ([[G-03]]), dan arah pertumbuhannya yang membedakan: allowlist tumbuh
dengan menambah **verifikasi** (satu baris baru = satu modul dituntut lulus), baseline tumbuh
dengan menambah **pengampunan** (satu baris baru = satu pelanggaran disembunyikan). Karena itu
allowlist tidak butuh penjaga anti-tambah sama sekali, sementara baseline butuh. Tiap gate punya
daftarnya **sendiri**: lulus satu gate bukan berarti lulus yang lain, dan satu daftar bersama
akan berbohong tentang salah satunya.

**Mengapa.** Alternatifnya sudah diukur. Satu aturan batas antarmuka dilanggar di **hampir semua
modul**: sekitar **970 simbol berlebih** di 29 paket, sementara titik masuk aplikasi hanya
merujuk sekitar 32. Gate repo-wide di sana akan merah di ~970 titik sekaligus — itu bukan gate,
itu kebisingan yang **dimatikan orang, bukan diperbaiki**, dan merah berikutnya diabaikan juga.
Dengan allowlist, aturan yang sama dikirim ketat dan sudah mencakup **25 dari 29 modul** di hari
pertama.

**Cara memverifikasi.** `gate:allowlist-monotonic` membandingkan daftar terhadap branch basis dan
gagal saat ada entri hilang. Lalu buktikan pembatasan lingkupnya **disengaja dan bekerja, dua
arah** ([[G-06]]): (1) sisipkan pelanggaran ke modul **terdaftar** → harus MERAH, menyebut berkas
yang tepat; (2) sisipkan pelanggaran yang sama ke modul **tidak terdaftar** → harus tetap HIJAU.
Arah kedua sama pentingnya: tanpanya, gate yang salah menelusuri direktori akan terlihat "hijau"
dengan alasan yang sepenuhnya berbeda.

---

## G-03 · Baseline shrink-only untuk utang yang terlanjur besar

**Ditegakkan oleh:** gate:contract-envelope + gate:contract-request-body

**Aturan.** Kalau pelanggarannya sudah terlanjur banyak, catat entri atau hitungannya dan
gagalkan gate saat ia **naik**. Baseline adalah **daftar utang dengan pemilik**, bukan tempat
sampah.

Tiga klausa yang menentukan apakah ia bekerja:

1. Entri **basi** — sudah bersih, atau berkasnya hilang — wajib **GAGAL**, bukan memperingatkan.
2. Baseline **bukan tempat menyatakan pengecualian yang disengaja**. Pengecualian yang memang
   dirancang dinyatakan **di kode**, di tempat pengulas berikutnya akan membacanya. Mencampurnya
   membuat utang tak terbedakan dari desain.
3. Baseline yang menyusut sampai nol **menghapus dirinya sendiri**; itu bentuk suksesnya.

Kalau utangnya masih bisa dipetakan **per modul**, pakai allowlist ([[G-02]]) alih-alih baseline:
arah pertumbuhannya berlawanan, dan yang tumbuh dengan menambah verifikasi selalu lebih murah
dijaga daripada yang tumbuh dengan menambah pengampunan.

**Mengapa.** Baseline yang hanya memperingatkan pada entri basi menghasilkan mode gagal terburuk
di kelas ini, dan ia terjadi: sebuah gate mencetak *"baseline memuat entri yang sudah bersih —
hapus barisnya"* padahal cacatnya **masih ada di berkas dan kodenya tidak berubah**. Ia muncul
**satu kali dari empat run** dan tidak bisa direproduksi. Gate yang **kadang** menganjurkan
mencabut penanda utang untuk cacat yang masih hidup akan dipercaya seseorang tepat pada run yang
salah, dan tidak ada sabotase yang bisa membuktikan ia sudah aman. Arah sehatnya juga terbukti:
sebuah baseline yang menyusut sampai nol menghapus berkasnya sendiri, dan itu justru buktinya
bekerja.

**Cara memverifikasi.** Aturan ini **tidak punya satu gate bernama "baseline"**, dan itu bukan
kelalaian: sebuah baseline hidup DI DALAM gate yang memeriksanya, jadi yang menegakkan aturan ini
adalah setiap gate yang memegang baseline — hari ini `gate:contract-envelope` (hitungan operasi
yang diklaim belum diimplementasi) dan `gate:contract-request-body` (hitungan badan permintaan
ber-nullable). Gate baseline generik yang berdiri sendiri akan menuntut kolom penegak menyebut
nama yang tak dimiliki sumber mana pun, lalu pembaca yang menjalankan prosedur [[G-01]] — grep
sumber gate itu untuk ID aturannya — mencari berkas yang tidak ada dan menyimpulkan aturan ini
tak bertuan. Tiap gate baru yang membawa baseline **menambahkan namanya ke kolom di atas**.

Keduanya gagal saat hitungannya **naik**, dan `gate:contract-request-body` gagal saat ia **turun**
juga, dengan perintah menurunkan angka baselinenya di commit yang sama — daftarnya berhingga, tiap
barisnya cacat, dan satu-satunya arah yang sah adalah turun. Sebut titik butanya eksplisit, karena
tanpa itu PR berikutnya akan **tampak lulus pemeriksaan yang tidak berjalan**: cek "hanya boleh
menyusut" **inert pada PR yang memperkenalkan berkas baselinenya** — ia membandingkan terhadap
branch basis, dan di sana berkasnya belum ada. Isi awal baseline diaudit lewat **review diff**,
bukan lewat gate. Nilai baseline yang bukan bilangan bulat non-negatif wajib **jatuh ke nol**,
bukan mengalir sebagai nilai bukan-angka: setiap perbandingan terhadap nilai semacam itu bernilai
false, jadi baselinenya berhenti menahan apa pun tanpa satu galat pun.

---

## G-04 · Pesan gagal gate wajib menyitir ID aturan

**Ditegakkan oleh:** `gate:message-cites-rule (konsumen)`

**Aturan.** Setiap pesan gagal gate menyitir **ID aturan** yang ia tegakkan, dan menunjuk
**artefak spesifik** — berkas dan baris, operationId, atau nama modul — bukan vonis generik.
Gate yang bilang "invalid" mengajari orang menebak.

Tiap pelanggaran dilaporkan sebagai satuan tersendiri (subtest bernama jalur berkasnya, satu
baris per temuan), bukan satu pesan gagal yang menampung semuanya.

ID yang disitir wajib **ada** di inventaris aturan, dan aturan itu wajib menyebut gate ini
sebagai penegaknya — dua arah, sama seperti [[G-05]]. Pemeriksaannya di sisi aturan adalah
[[G-01]].

**Mengapa.** Nilai ID yang bisa disitir terukur justru dari sisi yang tidak punya. Kelas cacat
paling merusak di satu basis kode — isolasi penyewa — adalah satu-satunya yang **tidak punya ID
sama sekali**, dan akibatnya **setiap** temuan kebocoran lintas-penyewa dan akses-by-ID di
seluruh gelombang dilaporkan dengan **"no rule ID"**: tidak bisa dikutip, tidak punya bentuk
perbaikan yang dibakukan, dan **tidak bisa dipakai menolak PR**. Sementara di kelas yang ID-nya
ada, ID yang sama dirujuk lintas PR berbulan-bulan tanpa pernah ambigu.

**Cara memverifikasi.** Gate menutup **separuh, dan katakan itu saat mengutipnya**:
`gate:message-cites-rule` memindai skrip dan workflow gate, mengambil jalur keluaran
kegagalannya, dan menuntut ada token ID yang cocok dengan inventaris aturan — yaitu **kehadiran**
sebuah ID, bukan **ketepatannya**. Klausa kedua aturan ini ("pesannya menunjuk artefak yang
spesifik dan benar") **tidak terputuskan mesin** dan dijaga review; menuliskannya seolah gate
menutupnya akan mengulang cacat yang [[G-01]] hukum.

Uji manual yang menutup separuh sisanya: jalankan tiap gate dalam keadaan gagal buatan satu kali
dan baca keluarannya seperti orang yang belum pernah melihat repo ini — kalau ia tidak
memberitahumu **paragraf mana** yang harus dibaca dan **berkas mana** yang harus dibuka, ia belum
memenuhi aturan ini walau gate-nya hijau.

---

## G-05 · Buku besar diperiksa dua arah

**Ditegakkan oleh:** gate:contract-permissions + gate:contract-envelope + gate:backend-routes

**Aturan.** Berkas apa pun yang **mengklaim keadaan** — modul mana yang sudah dipasang, rute mana
terdaftar, operasi mana publik, permission mana ada — diperiksa terhadap kenyataan **di kedua
arah**: klaim tanpa kenyataan MERAH, dan kenyataan tanpa klaim MERAH.

Dua syarat tambahan yang membuatnya bukan sekadar dua loop:

- **Jangan membandingkan artefak dengan turunan artefak itu sendiri.** Perbandingan semacam itu
  hanya membuktikan generatornya jalan.
- **Assert semestanya tidak kosong.** Tuntut `artefak-ditemukan >= entri-buku-besar` dan
  **gagal pada nol**. Gate yang memeriksa nol artefak bukan hijau — ia buta.

**Mengapa.** Ketiganya sudah menagih. Satu gate membandingkan himpunan rute kontrak terhadap
rute yang diparse dari pendaftaran tulisan tangan; begitu modul pindah ke wiring hasil generate,
rute itu sendiri **diturunkan dari kontrak yang sama** — yang tersisa untuk dibandingkan hanyalah
generator terhadap dirinya sendiri. Parser-nya **dihapus**, bukan diperbaiki, dan diganti buku
besar dua arah.

Arah kedua juga terbukti punya gigi, dan kegagalannya halus: sebuah pemeriksa permission
membandingkan **hanya satu field** di kedua sisi. Operasi yang cuma butuh sesi memberi nilai
kosong di field itu; rute yang duduk di grup terlindungi **tanpa middleware apa pun** juga
memberi nilai kosong — jadi keduanya **cocok dan sama-sama lulus**. **102 rute** berada dalam
keadaan itu. Lebih dalam lagi, tipe data yang dipakai gate itu **tidak merekam kehadiran guard
sesi sama sekali**, jadi tidak ada data untuk menegakkannya walau seseorang mau.

Dan semesta kosong bukan hipotesis: pada satu gate, kalau pencarian berkasnya nol-cocok, loop
berjalan **nol kali** dan gate mencetak OK. Setiap redefinisi cakupan — termasuk setiap
perbaikan — bisa mengosongkan himpunan itu **diam-diam**.

**Cara memverifikasi.** Aturan ini **tidak punya satu gate bernama "ledger-bidirectional"**, dan
alasannya sama dengan [[G-03]]: sebuah buku besar diperiksa oleh gate yang MEMBACANYA, bukan oleh
gate terpisah yang tidak tahu apa isinya berarti. Yang menegakkannya adalah setiap gate yang
memegang buku besar — `gate:contract-permissions` (buku besar operasi publik),
`gate:contract-envelope` (buku besar opt-in envelope), dan `gate:backend-routes` (buku besar modul
terpasang beserta sumbu generasinya). Gate generik berdiri sendiri akan membuat kolom penegak
menyebut nama yang tak dimiliki sumber mana pun; pembaca yang menjalankan prosedur [[G-01]] lalu
mencari berkas yang tidak ada. Buku besar baru **menambahkan nama gate pembacanya ke kolom di
atas**.

Untuk tiap buku besar, jalankan kedua arah dan assert semestanya non-kosong. Buktikan dengan
sabotase ([[G-06]]): (1) hapus satu entri dari buku besar sementara kodenya tetap ada → merah;
(2) tambahkan entri untuk sesuatu yang tidak ada → merah; (3) arahkan gate ke direktori kosong →
merah, bukan hijau.

---

## G-06 · Test sabotase untuk tiap batas keamanan

**Ditegakkan oleh:** manual-review-only — tidak ada mesin yang bisa membedakan test yang akan gagal saat penjagaannya dilepas dari test yang tidak, tanpa benar-benar melepasnya

**Aturan.** Setiap batas keamanan memiliki test yang **dibuktikan GAGAL saat penjagaannya
dilepas**. Menulis test-nya belum cukup — **demonstrasinya bagian dari kiriman**: lepas
predikatnya, lihat merah, kembalikan, lihat hijau, dan catat keduanya.

Tiga syarat turunannya:

- Untuk gate berlingkup, tunjukkan **dua arah** — di dalam lingkup MERAH, di luar lingkup tetap
  HIJAU ([[G-02]]).
- **Gate wajib bisa menangkap contoh-buruknya sendiri.** Blok contoh salah yang ditulis di
  aturannya adalah fixture-nya. Aturan yang gate-nya tidak menangkap contoh-buruknya sendiri
  belum punya penjaga.
- Bentuk yang **benar** ikut jadi kasus uji yang harus **LULUS**. Gate yang memerahkan perbaikan
  yang wajar akan dibuang orang, lalu merah berikutnya diabaikan juga.

**Mengapa.** Sebuah gate tenancy dibangun, diserang pengulasnya, lalu ditarik sebelum ship — dan
alasan yang paling telak: ia **melewatkan KEDUA contoh salah yang ditulis di aturan yang ia
tegakkan**, karena keduanya diakhiri komentar dan polanya menuntut akhir baris. Di samping itu
ia punya **lima jalur lolos-diam yang terkonfirmasi** dan satu keenam yang ditemukan belakangan.
Lebih buruk, ia memberi **false positive pada perbaikan yang benar** dari dua kebocoran yang
**gate itu sendiri temukan** — artinya orang yang menambal dengan benar lalu memilih antara
mengubah perbaikannya jadi bentuk yang gate suka (mungkin lebih buruk) atau menyimpulkan gate
ini tidak bisa dipercaya. Keduanya lebih mahal daripada tidak punya gate.

Dan test hijau membuktikan lebih sedikit daripada kelihatannya: sebuah test keanggotaan katalog
**lulus untuk respons yang jelas salah**, karena sanitizer di jalur galat mengganti kodenya jadi
anggota katalog yang sah sebelum asersinya berjalan ([[B-02]]).

**Cara memverifikasi.** `manual-review-only`. Yang harus dilihat manusia, tiga hal: (a) PR-nya
memuat **bukti lepas-dan-merah**, bukan hanya test-nya; (b) fixture-nya mencakup contoh salah
milik aturan itu sendiri; (c) untuk gate berlingkup, lari hijau di luar lingkup ikut ditunjukkan.
Bukti yang **TIDAK sah**: "test-nya lulus", "CI hijau", dan **baris log** — kalau satu-satunya
konsekuensi sebuah pelanggaran adalah baris log, anggap pelanggaran itu tidak terdeteksi. Lihat
[[T-04]] untuk daftar bukti tidak sah selengkapnya, dan [[O-02]] untuk kelas klaim-versus-
keadaan yang melahirkannya.
