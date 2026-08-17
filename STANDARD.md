# Standard — pintu masuk manusia

Ini bukan daftar gaya. Setiap baris di `rules/` lahir dari sebuah kegagalan yang sudah dibayar —
di produksi, di review, atau di tangan agen otonom yang menyimpang dengan penalaran yang terdengar
masuk akal. Dokumen ini menjelaskan **bentuk** keputusannya per lapis: kenapa rantainya begini,
dan apa yang rusak tanpanya. **Isi aturannya sendiri hidup satu tempat saja** — `rules/` — dan
dokumen ini hanya **menunjuk** ID (`[[ID]]`). Kalau kau merasa perlu tahu persis apa yang
diwajibkan sebuah aturan, buka berkasnya; menyalinnya ke sini akan menyimpang dari aslinya cepat
atau lambat, dan itu kelas cacat yang standar ini sendiri melarang ([[G-01]]).

Delapan lapis, tiap prefix satu berkas di `rules/` — skema lengkapnya, format satu aturan, dan
siklus hidup ID ada di [`rules/README.md`](rules/README.md). Baca itu sebelum menambah aturan
baru; jangan menebak formatnya dari sini.

## Rantai sumber kebenaran

Kalau tidak ada satu tempat tertulis yang bilang siapa berwenang atas bentuk data, kontrak diam-
diam patok ke perilaku server yang **kebetulan** sedang jalan — dan begitu itu terjadi, kontrak
yang salah lebih berbahaya daripada tidak ada kontrak sama sekali, karena klien generated
mempercayainya. [[S-01]] menulis rantainya eksplisit supaya pertanyaan "siapa benar" selalu punya
jawaban yang bisa ditunjuk, bukan ditebak dari kode yang paling baru diubah.

Begitu rantainya ada, ketidakcocokan antar lapis berhenti jadi soal selera — ia jadi pertanyaan
berurutan tentang lapis mana yang berwenang. [[S-02]] mengunci urutan itu, termasuk dua arah yang
sama-sama terasa seperti "perbaikan yang wajar" saat ditulis.

Komponen yang berhenti melayani produksi tidak hilang dari repo dan tidak diam-diam jadi tidak
terpercaya; [[S-03]] menetapkan apa artinya "arsip" dan — sama pentingnya — bagian mana darinya
yang justru **tidak** ikut boleh dibekukan.

## Kontrak: spesifikasi yang mengikat

Kontrak bukan dokumentasi atas API yang sudah ada; ia yang menentukan bentuknya, dan server-klien
menyesuaikan diri. Lima aturan di lapis ini masing-masing menutup satu bentuk konkret dari
"kontrak yang menjanjikan sesuatu yang tidak ditepati kabel": respons yang bentuknya beda-beda
per rute [[C-01]], kode error yang tidak bisa dipercabangi klien [[C-02]], siapa-boleh-apa yang
cuma hidup di kepala penulis server [[C-03]], nullability respons yang bocor ke badan permintaan
[[C-04]], dan bentuk badan permintaan yang lolos linter tapi ditolak generator [[C-05]].

## Backend: menyesuaikan diri, tidak menafsirkan

Server tidak punya wewenang atas bentuk data — selisih server-vs-kontrak selalu bug server
([[S-02]]). Tiga aturan menutup tiga jalan pintas yang sama-sama terasa aman saat ditulis tangan:
rute yang bisa hidup diam-diam di luar kontrak [[B-01]], penulisan respons gagal yang tersebar
sehingga tak ada satu tempat untuk mengubah bentuknya [[B-02]], dan artefak generated yang
disunting tangan sehingga regenerasi berikutnya menghapus perbaikan siapa pun tanpa peringatan
[[B-03]].

## Frontend: turunan, bukan penafsir

Prinsipnya satu kalimat: frontend tidak menafsirkan API, ia menurunkan diri darinya. [[W-01]]
menutup jalan pintas paling umum — merakit pemanggilan sendiri di atas fungsi generated, yang
terlihat lebih enak dipakai tapi diam-diam menyimpang dari tipe dan envelope aslinya. [[W-02]]
menutup kunci cache yang dikarang ulang di tiap titik panggil, sumber invalidasi yang tidak pernah
cocok. Dan [[W-03]] menutup pemeriksa tipe yang filternya sendiri jadi tempat galat nyata
bersembunyi.

## Tenancy: satu-satunya lapis yang tidak diturunkan

Tenancy memotong seluruh rantai sumber kebenaran di atas — ia **tidak** diturunkan dari kontrak
atau skema data, karena batasnya hanya ada sebagai predikat di kueri. [[T-01]] menetapkan ini
sebagai satu-satunya kelas aturan yang wajib ditulis tangan di setiap repository, dan kenapa
kehadiran pemeriksa permission bukan bukti batas ini ditegakkan.

Lima aturan turunannya masing-masing menutup satu bentuk kebocoran yang **tidak** tertutup oleh
guard permission biasa: akses-by-ID yang lupa membawa konteks penyewa [[T-02]], lingkup yang tak
terselesaikan lalu jatuh ke kueri telanjang [[T-03]], klaim keamanan yang benar tapi tanpa syarat
batasnya lalu dibaca sebagai jaminan penuh [[T-04]], status respons yang membocorkan keberadaan
baris milik penyewa lain [[T-05]], dan operasi destruktif yang mengira sebuah tabel ber-soft-
delete padahal tidak [[T-06]].

## Idempotensi: ID dari konten, bukan dari acak

Alur upload → stage → execute yang memakai ID acak tidak punya cara mengenali larinya sendiri —
deduplikasi lalu dikarang per alur dari field bisnis, dan penilaian itulah yang gagal. Empat
aturan menutup empat cara mekanisme ID-dari-konten bisa bocor: sumber ID-nya sendiri [[I-01]],
kestabilan string yang dibangunnya [[I-02]], paritas antar implementasi yang menulis entitas yang
sama [[I-03]], dan cara insert yang gagal dibedakan dari insert yang memang idempoten [[I-04]].

## Gate: yang membuat aturan mengikat

Aturan tanpa penegak adalah harapan, dan harapan basi dalam hitungan hari — satu aturan freeze
pernah dilanggar di PR pertama sesudah ia mendarat. [[G-01]] menuntut setiap aturan menyebut
penegaknya secara jujur, karena kolom penegak yang berbohong lebih buruk daripada kolom kosong.

Lima aturan lain mengatur bagaimana penegak itu sendiri dipasang tanpa memerahkan seluruh papan
dan dibuktikan benar-benar menggigit: allowlist yang hanya boleh bertambah [[G-02]], baseline
shrink-only untuk utang yang sudah terlanjur besar [[G-03]], pesan gagal yang menyitir ID dan
artefak spesifik [[G-04]], buku besar yang diperiksa dua arah [[G-05]], dan test sabotase yang
membuktikan sebuah batas keamanan benar-benar gagal saat penjagaannya dilepas [[G-06]].

## Orkestrasi agen: pelajaran tentang cara aturan ini sendiri dijaga

Tujuh aturan terakhir bukan tentang bentuk kode — tentang cara sebuah kesimpulan diambil saat agen
otonom mengerjakan repo mana pun, termasuk repo ini, karena agen menyimpang dengan penalaran yang
terdengar masuk akal, bukan dengan niat buruk. [[O-01]] menetapkan prinsipnya: dokumen tidak
menahan, gate menahan.

Enam aturan lain masing-masing menutup satu cara sebuah kesimpulan bisa keliru walau semua
langkahnya terasa hati-hati: membaca label alih-alih keadaan sungguhan [[O-02]], mempercayai
hitungan sebuah alat sebagai kebenaran padahal ia bisa jadi lantai [[O-03]], mempercayai survei
teks di tempat kompilator bisa menjawab [[O-04]], mengira sebuah worktree terisolasi dari branch
kerja padahal ia bercabang dari basis default [[O-05]], menyimpulkan sebuah agen selesai dari
diamnya [[O-06]], dan meregenerasi pohon artefak yang sedang dikerjakan penulis lain [[O-07]].

---

## Aturan mana ditegakkan gate mana

Tabel di bawah ini adalah **artefak generated** — dibangkitkan dari kolom **Ditegakkan oleh** di
`rules/`, bukan diketik tangan — dan `rules-lint` memverifikasinya dua arah: aturan tanpa baris
di sini MERAH, dan baris yang judul atau penegaknya sudah tidak cocok lagi dengan `rules/` juga
MERAH. Jangan mengedit baris tabelnya langsung; ubah aturannya di `rules/`, lalu samakan tabel ini
di PR yang sama sampai `rules-lint` hijau lagi.

<!-- rules-lint:tabel-penegak:mulai -->
| ID | Judul | Ditegakkan oleh |
|---|---|---|
| [[S-01]] | Rantai sumber kebenaran berarah dan tertulis | manual-review-only |
| [[S-02]] | Arah perbaikan saat dua lapis berbeda pendapat | manual-review-only |
| [[S-03]] | Komponen arsip: baca-saja, dan bagian mana yang tidak ikut diarsipkan | `gate:archive-freeze (konsumen)` |
| [[C-01]] | Envelope tunggal untuk seluruh respons JSON | `gate:contract-envelope` |
| [[C-02]] | Katalog kode error tertutup per domain | manual-review-only |
| [[C-03]] | Auth dan permission dinyatakan di kontrak | `gate:contract-permissions` |
| [[C-04]] | Jangan pernah menambah `nullable` ke badan permintaan | `gate:contract-request-body` |
| [[C-05]] | Bentuk union di badan permintaan dilarang | `gate:contract-lint` |
| [[C-06]] | Satu nama parameter per posisi path | `gate:contract-routes` |
| [[B-01]] | Handler mengimplementasikan antarmuka server ketat hasil generate | `gate:backend-routes` |
| [[B-02]] | Galat dipetakan terpusat; handler tidak menulis respons mentah | `gate:backend-no-raw-write (konsumen)` |
| [[B-03]] | Artefak generated tidak pernah diedit tangan | `gate:generated-sync` |
| [[W-01]] | Frontend memanggil klien generated saja | `gate:frontend-client-sync (konsumen)` |
| [[W-02]] | Disiplin queryKey dan invalidasi | `gate:frontend-query (konsumen)` |
| [[W-03]] | Pemeriksa tipe penuh, bukan sebagian | `gate:frontend-typecheck (konsumen)` |
| [[T-01]] | Batas penyewa hidup di predikat query dan tidak bisa diturunkan dari kontrak | manual-review-only |
| [[T-02]] | Akses by-ID wajib disaring penyewa, bukan hanya dicek permission | `gate:tenancy-byid (konsumen)` |
| [[T-03]] | Fail-closed saat lingkup tak terselesaikan | manual-review-only |
| [[T-04]] | Kehadiran pemeriksa permission bukan bukti batas penyewa | manual-review-only |
| [[T-05]] | Sumber daya milik penyewa lain dijawab 404, bukan 403 | `gate:contract-permissions` |
| [[T-06]] | Operasi destruktif tidak boleh mengandalkan soft-delete yang tidak ada | manual-review-only |
| [[T-07]] | Daftar periksa penyewa yang digenerate wajib dikonsumsi sebelum pembekuan | `gate:tenancy-checklist` |
| [[I-01]] | ID entitas deterministik dari konten, bukan acak | `gate:golden-ids (konsumen)` |
| [[I-02]] | String kanonik: urutan field tetap, normalisasi tetap | `gate:golden-ids (konsumen)` |
| [[I-03]] | Paritas lintas-bahasa dipin oleh test golden | `gate:golden-ids (konsumen)` |
| [[I-04]] | Tulis idempoten: pelanggaran unik yang sama = lewati, bukan gagal | manual-review-only |
| [[G-01]] | Tiap aturan menyebut penegaknya | `standard rules-lint` |
| [[G-02]] | Gate opt-in: daftar hanya boleh bertambah | `gate:allowlist-monotonic (konsumen)` |
| [[G-03]] | Baseline shrink-only untuk utang yang terlanjur besar | `gate:contract-envelope + gate:contract-request-body` |
| [[G-04]] | Pesan gagal gate wajib menyitir ID aturan | `gate:message-cites-rule (konsumen)` |
| [[G-05]] | Buku besar diperiksa dua arah | `gate:contract-permissions + gate:contract-envelope + gate:backend-routes` |
| [[G-06]] | Test sabotase untuk tiap batas keamanan | manual-review-only |
| [[O-01]] | Dokumen tidak menahan agen; gate menahan | manual-review-only |
| [[O-02]] | Klaim status bukan bukti; buktikan lawan keadaan | manual-review-only |
| [[O-03]] | Hitungan alat bisa jadi lantai, bukan kebenaran | manual-review-only |
| [[O-04]] | Survei berbasis grep kalah dari pemeriksa tipe | manual-review-only |
| [[O-05]] | Worktree bercabang dari basis default, bukan branch kerjamu | manual-review-only |
| [[O-06]] | Diam bukan bukti selesai | manual-review-only |
| [[O-07]] | Pohon artefak generated dimiliki satu penulis | manual-review-only |
<!-- rules-lint:tabel-penegak:selesai -->

16 dari 39 ber-`manual-review-only`. Itu bukan celah tersembunyi — [[G-01]] menuntut kolomnya
jujur, dan alasan tiap satu tertulis di aturannya sendiri, bukan cuma di kata kuncinya. Baca
alasannya, jangan cuma kata kuncinya: sebagian berarti *mustahil dimesinkan*, sebagian lagi
berarti *gate-nya belum ditulis* — dan hanya yang kedua yang layak masuk daftar apa yang
dibangun berikutnya.

**Sisanya TIDAK otomatis berarti terjaga, dan penandanya ada di kolom yang sama.** Nama gate
bertanda `(konsumen)` nyata dan mengikat, tapi **pelaksananya bukan paket ini** — proyek yang
memasang standar ini yang wajib menyediakannya, dan sebelum ia menyediakannya aturan itu tidak
ditegakkan siapa pun. Bacalah baris bertanda itu seperti `manual-review-only`. Yang membuat
pembacaan ini bisa dipercaya bukan janji melainkan gate: `standard rules-lint` mengadu tiap nama
gate di kolom ini dengan daftar gate yang paket ini benar-benar kirim, dan memerahkan **kedua**
arahnya — nama yang mengaku dikirim padahal tak punya pelaksana, dan penanda yang basi karena
gate-nya kini sungguh dikirim. Kolom ini karena itu tidak bisa berbohong ke arah mana pun tanpa
CI ikut merah.
