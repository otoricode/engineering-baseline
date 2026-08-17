# B — Backend

Server **menyesuaikan diri** dengan kontrak. Selisih server-vs-kontrak adalah **bug server**,
diperbaiki di server ([[S-02]]).

---

## B-01 · Handler mengimplementasikan antarmuka server ketat hasil generate

**Ditegakkan oleh:** `gate:backend-routes`

**Aturan.** Router dan tipe masuk/keluar **dibangkitkan dari kontrak**. Pendaftaran rute tulisan
tangan dihapus, bukan didampingi. Handler menjadi **method dari antarmuka server ketat hasil
generate**, sehingga menyimpang dari kontrak berarti **gagal compile**, bukan gagal review.

Konsekuensi yang justru jadi tujuannya: rute yang tidak ada di kontrak **mustahil hidup
diam-diam**, dan satu path dilayani tepat satu handler — mount ganda jadi tidak bisa
diekspresikan.

Antarmuka publik sebuah paket feature adalah **titik masuk pendaftarannya saja**, atau
konstruktor yang memulangkan **tipe antarmuka**. Handler, layanan, repository, dan tipe internal
tidak diekspor. Ke arah sebaliknya, tipe kabel hasil generate berhenti di handler: lapis layanan
dan akses data dilarang mengimpornya, karena mengetik mereka dengan tipe kontrak HTTP
**membalik** rantai [[S-01]] — lapis akses data jadi ditentukan kontrak HTTP, dan setiap
perubahan kontrak merambat sampai ke kueri.

**Mengapa.** Dengan pendaftaran tulisan tangan, dua router pernah di-mount pada prefix yang
sama dan **keduanya mendefinisikan 10 rute identik**. Kerangka kerjanya memenangkan mount yang
pertama, jadi **10 handler jadi kode mati** selama berbulan-bulan tanpa ada yang tahu — dan
anotasi sumber di kontrak untuk kesepuluh operasi menunjuk ke handler yang **mati**, sehingga
kontrak mendeskripsikan respons yang tidak pernah dikirim. Efek nyata yang akhirnya terlihat
pengguna: dua kolom UI kosong permanen. Penegakan saat compile adalah satu-satunya yang tidak
bisa dilewati; review tidak menangkapnya selama berbulan-bulan, dan tidak akan.

**Cara memverifikasi.** `gate:backend-routes` meregenerasi dari kontrak lalu menuntut diff
kosong dan build hijau, **ditambah** test per modul yang menuntut kecocokan **DUA ARAH** antara
rute yang benar-benar terpasang di router produksi dan spesifikasi hasil generate. Satu arah
tidak cukup: pemeriksaan "kontrak ⊆ terpasang" tetap hijau sementara rute hantu hidup — lihat
[[G-05]]. Dan berhati-hatilah membandingkan artefak generated dengan kontrak yang
menurunkannya: itu hanya membuktikan generatornya jalan.

---

## B-02 · Galat dipetakan terpusat; handler tidak menulis respons mentah

**Ditegakkan oleh:** `gate:backend-no-raw-write (konsumen)`

**Aturan.** Handler **memulangkan** galat, tidak menulis galat. Satu middleware memetakan galat
bertipe ke status HTTP plus envelope gagal ([[C-01]]), dan ia **satu-satunya tempat di seluruh
server** yang menulis envelope gagal. Handler tidak memanggil penulis respons mentah sama
sekali.

Respons yang memang **bukan JSON** — unduhan berkas, streaming — tidak tunduk aturan ini, dan
pengecualiannya **diturunkan dari kontrak**, bukan dari daftar tulisan tangan: kontrak sudah
menandai operasi mana yang responsnya non-JSON ([[C-01]]), jadi gate membaca penanda itu. Ini
pengecualian **permanen by design**, jadi ia **tidak boleh** hidup di baseline shrink-only —
daftar yang bentuk suksesnya menyusut sampai nol akan selamanya memuat entri yang tidak akan
pernah hilang, dan itu persis yang [[G-03]] butir 2 larang. Yang **boleh** masuk baseline
shrink-only hanyalah penulisan mentah **sisa migrasi** di jalur JSON.

**Mengapa.** Tanpa pemusatan, **114 konstruktor kegagalan** dan sekitar **190 penulisan 4xx/5xx
mentah** tersebar di kode feature, masing-masing memutuskan sendiri status dan bentuknya. Gaya
penulisannya bahkan bercabang tanpa alasan apa pun: 462 pemakaian konstanta status OK melawan
165 literal `200`; 107 konstanta BadRequest melawan 65 literal `400`; ditambah empat bentuk
pemanggilan penulis mentah yang berbeda. Memusatkannya membuat perubahan bentuk galat jadi
**satu edit, bukan tiga ratus**.

Dan ada mode gagal yang lebih halus di middleware yang sama: sanitizer di sana **menulis ulang**
kode di luar katalog jadi kode generik lalu mencatatnya ke log. Akibatnya sebuah test keanggotaan
katalog **lulus untuk respons yang jelas salah** — status bilang "kesalahan permintaan", kode
bilang "server rusak". Pemusatan menghilangkan tiga ratus tempat salah; ia tidak menghilangkan
kewajiban menguji tempat yang satu itu.

**Cara memverifikasi.** `gate:backend-no-raw-write` menuntut **nol** kemunculan penulis respons
mentah di seluruh kode feature, kecuali pada operasi yang **kontraknya** menandai responsnya
non-JSON, plus entri baseline sisa migrasi yang hanya boleh menyusut. Cocokkan
pemanggilan sungguhan lewat parser, bukan teks — gate yang menyala untuk **komentar** melatih
orang menulis ulang komentar ([[O-04]]). Tambahkan satu test yang menegaskan middleware itu
penulis tunggal badan gagal, dan buktikan lewat sabotase ([[G-06]]): tulis badan gagal langsung
dari sebuah handler dan pastikan merah.

---

## B-03 · Artefak generated tidak pernah diedit tangan

**Ditegakkan oleh:** `gate:generated-sync`

**Aturan.** Artefak hasil generate — bundel kontrak, antarmuka server, klien, cermin DTO —
**tidak pernah** disunting tangan. Regenerasi wajib menghasilkan pohon yang identik byte-per-
byte dengan yang di-commit.

Generator dipanggil lewat **versi yang dipin di berkas proyek**, bukan lewat pemanggilan
"ambil versi terbaru". Dan pohon artefak generated dimiliki **satu penulis** pada satu waktu —
lihat [[O-07]].

**Mengapa.** Versi generator bukan detail: memanggil generator dengan bentuk "jalankan
modul@versi" mengambil apa pun yang kebetulan tersedia di mesin itu, jadi keluarannya berbeda
antar pengembang dan gate sinkronisasi jadi merah karena alasan yang tidak ada hubungannya
dengan perubahan siapa pun. Yang lebih mahal: gate ini bisa **mati tanpa suara**. Job CI untuk
server historisnya hanya memasang toolchain kompilator; begitu target build-nya memanggil paket
manager bahasa lain untuk meregenerasi, langkah itu tidak pernah berjalan — dan job-nya tetap
melaporkan sukses. Gate yang tidak menjalankan pemeriksaannya melaporkan hijau yang sama persis
dengan gate yang lulus.

**Cara memverifikasi.** `gate:generated-sync` meregenerasi lalu menuntut diff kosong, lalu
build. Verifikasi **gate-nya sendiri** punya yang ia butuhkan: jalankan target gate di
lingkungan bersih dan pastikan ia benar-benar **meregenerasi** — jangan puas dengan exit code
nol, karena itu persis sinyal yang gate mati pancarkan. Kalau diff-nya merah dan pekerjaanmu
sendiri belum di-stage, gate akan mendiff berkas barumu sebagai hilang: stage dulu, baru baca
merahnya.
