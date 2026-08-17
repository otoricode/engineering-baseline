# O — Orkestrasi agen

Pelajaran yang berlaku untuk proyek mana pun yang dikerjakan agen otonom, ditulis sebagai aturan
ber-ID dengan **cara memverifikasi**, bukan sebagai anekdot.

**Ketujuhnya `manual-review-only`, dan itu bukan kelalaian melainkan sifat lapisnya:** yang diatur
di sini adalah **cara sebuah kesimpulan diambil**, bukan bentuk sebuah artefak, jadi tidak ada
yang bisa dibandingkan mesin. Menuliskan nama gate di salah satunya akan menghasilkan penegak yang
berbohong — kelas yang [[G-01]] hukum, dan yang [[O-07]] hampir jadi korbannya.

Itu **tidak** berarti lapis ini lemah: [[O-01]] justru menyatakan sebaliknya, dan jalan keluarnya
bukan mengarang gate di sini melainkan **memindahkan batasannya ke lapis yang punya gate**. Tiap
aturan di bawah karena itu menunjuk ke sana di bagian Cara memverifikasi.

---

## O-01 · Dokumen tidak menahan agen; gate menahan

**Ditegakkan oleh:** manual-review-only — yang diperiksa adalah apakah sebuah batasan punya penegak sama sekali; kalau ia bisa dimesinkan, ia seharusnya sudah pindah ke lapis lain dan berhenti jadi aturan di sini

**Aturan.** Batasan yang hanya hidup di dokumen **tidak menahan agen otonom**. Kalau sebuah
batasan penting, ia wajib berbentuk **gate yang gagal**, **tanda tangan yang tidak meng-compile**,
atau **izin yang memblokir** — bukan paragraf.

Konsekuensi praktis saat menulis penugasan: klausa yang paling sering dilanggar ditulis sebagai
**syarat kiriman yang bisa diperiksa** ("commit dan lapor sebelum idle"), bukan sebagai imbauan.
Dan saat memilih apa yang ditulis di dokumen: dokumen berguna untuk **alasan** dan **cara
memverifikasi**; ia tidak berguna sebagai rem.

**Mengapa.** Agen menyimpang dengan penalaran yang **masuk akal**, dan penalaran yang masuk akal
mengalahkan aturan yang diingat. Terukur: sebuah subagen menyimpang dari penugasannya dengan
alasan yang terdengar benar, lalu **mengabaikan perintah berhenti yang eksplisit dan terus
melakukan commit**. Kelas yang sama terukur di level dokumen: satu aturan freeze dilanggar di PR
pertama sesudah ia mendarat dan baru berlaku setelah jadi gate CI ([[S-03]], [[G-01]]). Dan di
tiga lari terpisah, agen **idle sebelum commit dan lapor** — dua dari dua di satu gelombang —
yang membuat klausa itu wajib ada di teks penugasan, bukan di budaya.

**Cara memverifikasi.** `manual-review-only`. Untuk tiap batasan yang kau anggap penting, jawab
satu pertanyaan: **apa yang gagal kalau ia dilanggar?** Kalau jawaban jujurnya "ada yang
menyadarinya saat review", ia belum ditegakkan. Ujinya konkret dan murah: langgar batasan itu di
branch coretan dan lihat apakah ada yang memerah. Kalau tidak ada, batasan itu sebuah harapan —
naikkan jadi gate, atau turunkan klaimnya.

---

## O-02 · Klaim status bukan bukti; buktikan lawan keadaan

**Ditegakkan oleh:** manual-review-only — yang diperiksa adalah apakah sebuah kesimpulan dibaca dari label atau dari keadaan; keduanya menghasilkan kalimat yang identik

**Aturan.** **Label status bukan bukti keadaan yang ia namai.** Ganti setiap pembacaan label
dengan pembacaan keadaan:

| Alih-alih | Buktikan dengan |
|---|---|
| status "sudah di-merge" | pemeriksaan ancestry — apakah commit-nya benar-benar leluhur branch target |
| "pemeriksaan hijau" | daftar pemeriksaan **untuk SHA head**, bukan hasil agregat yang bisa basi |
| "perintahnya sukses" | baca kembali objeknya; sebagian alat keluar nol walau tulisannya gagal |
| "branch-nya sudah dihapus" | daftar remote sungguhan sesudah push berikutnya |

**Mengapa.** Sebuah PR di-merge dan branch-nya dihapus; push berikutnya **diam-diam MEMBUAT ULANG
branch itu**, jadi commit duduk di remote **tanpa PR** — sementara **kelima** sinyal "definition
of done" tetap melaporkan sehat. Terpisah: sebuah perintah penyuntingan metadata **gagal
diam-diam** pada kelas repositori itu — badan PR-nya tetap basi sementara perintahnya melaporkan
sukses — dan daftar pemeriksaan menampilkan **hijau basi** dari lari yang lebih lama daripada
commit head. Satu lagi dari kelas alat: sebuah CLI agen **selalu keluar dengan kode 0** walau
pekerjaannya gagal.

Tidak satu pun dari ini eksotis. Semuanya adalah **pembacaan default dari keluaran alat itu
sendiri**, yang justru sebabnya mereka lolos.

**Cara memverifikasi.** `manual-review-only`. Sebelum menyatakan sesuatu selesai, sebutkan untuk
tiap klaim **perintah pembacaan keadaan** yang mendukungnya, bukan label yang kau lihat. Bukti
yang **TIDAK sah**: exit code sendirian, pada alat yang diketahui keluar nol saat gagal; dan
ringkasan status apa pun yang tidak terikat ke SHA head. Lihat [[G-05]] untuk bentuk yang sama
pada buku besar, dan [[T-04]] untuk daftar bukti tidak sah di kelas keamanan.

---

## O-03 · Hitungan alat bisa jadi lantai, bukan kebenaran

**Ditegakkan oleh:** manual-review-only — menilai apakah sebuah hitungan bisa menutupi hitungan lain menuntut tahu bagaimana alatnya berhenti, bukan membaca angkanya

**Aturan.** Hitungan galat atau pelanggaran dari sebuah alat adalah **LANTAI**, bukan kebenaran,
setiap kali kegagalan yang lebih awal bisa menutupi yang berikutnya. Perbaiki penyebab
penutupnya dulu, **ukur ulang**, dan ulangi sampai angkanya **stabil di dua lari berturut-turut**.

Setiap angka sebelum kestabilan itu dilaporkan **dengan label "lantai"**. Dan sebutkan cacat
pengukuranmu **sendiri** saat kau tahu ada satu — angka yang dilaporkan tanpa titik butanya akan
dikutip tanpa titik butanya.

**Mengapa.** Hitungan galat pemeriksa tipe diperlakukan sebagai ukuran pekerjaan; alias tulisan
tangan yang rusak di satu berkas **menutupi galat di seluruh situs hilirnya**, jadi angkanya
justru **naik** saat alias-aliasnya diperbaiki. Bentuk yang sama di kompilator: sebuah galat tipe
patologis mendegradasi tipe raksasa jadi tipe serba-boleh dan **menelan galat lain**, sehingga
kode yang sama lulus di lokal dan gagal di CI. Dan di gate, versi terburuknya: hasil disaring
berdasarkan jalur, jadi **75 galat nyata dibuang** sementara berkasnya sudah ada di dalam program
kompilator — di sana angkanya bukan lantai, ia **fiksi** ([[W-03]]).

**Cara memverifikasi.** `manual-review-only`. Ukur → perbaiki penyebab teratas → ukur lagi.
Laporkan angkanya hanya setelah **dua pengukuran berturut-turut identik**; sebelum itu tulis
"lantai" di sebelah angkanya, setiap kali. Kalau angka itu dipakai memperkirakan besar pekerjaan
atau memutuskan cakupan, pengukuran ulangnya bukan opsional. Bukti yang **TIDAK sah**: satu lari
pengukuran, betapapun rapi keluarannya — dan angka yang turun setelah perbaikan, karena di kelas
ini angka yang **naik** justru tanda perbaikannya bekerja.

---

## O-04 · Survei berbasis grep kalah dari pemeriksa tipe

**Ditegakkan oleh:** manual-review-only — yang dinilai adalah apakah alat yang lebih kuat tersedia untuk pertanyaan itu, dan itu penilaian per pertanyaan

**Aturan.** Di mana pemeriksa tipe atau parser sungguhan bisa menjawab pertanyaannya, **jawaban
merekalah buktinya** dan pencarian teks hanya petunjuk awal. Berlaku ke dua arah:

- **Survei** dibuktikan dengan meng-compile, bukan dengan nge-grep.
- **Gate** mencocokkan artefak sungguhan lewat parser — daftar impor lewat parser impor, bukan
  regex atas teks berkas.

Dan satu klausa yang menyelamatkan banyak waktu: **sertakan kontrol positif** — satu kasus yang
kau **tahu** harus cocok — supaya hasil nol bisa dibedakan dari kueri yang rusak.

**Mengapa.** Sebuah survei berbasis grep atas risiko-break di frontend **salah pada 2 dari 6
klaim**, karena skema validasi yang didefinisikan lokal dan alias tipe tulisan tangan
**tak terlihat** oleh pencarian teks; pemeriksa tipe yang akhirnya menyelesaikannya. Ke arah
sebaliknya, sebuah gate yang mencocokkan **teks** menyalakan alarm untuk **komentar** yang
menyebut jalur impor terlarang — dua kali dalam dua gelombang — dan gate yang menyala untuk
komentar **melatih orang menulis ulang komentar**, bukan kode.

Kelas ketiga, dan yang paling mahal per laporan: klaim "kontrak kehilangan field X" yang
diturunkan dari interface frontend **meleset 14 dari 41 kali**, karena sebuah interface frontend
memodelkan API yang **DIINGINKAN** seseorang. Buktikan field yang hilang terhadap pembaca atau
pemancar di sisi server, dengan kontrol positif.

**Cara memverifikasi.** `manual-review-only`. Untuk tiap klaim survei, **sebut alat yang
menghasilkannya** — itu bagian dari membuktikan lawan keadaan, bukan lawan label ([[O-02]]), dan
angkanya tetap sebuah lantai sampai diukur ulang ([[O-03]]). Kalau alatnya grep sementara sebuah
kompilator bisa menjawab pertanyaan yang sama, ulangi dengan kompilator **sebelum** melaporkan.
Untuk hasil nol, tunjukkan kontrol positifnya; tanpa itu, nol dan rusak terlihat sama persis.

---

## O-05 · Worktree bercabang dari basis default, bukan branch kerjamu

**Ditegakkan oleh:** manual-review-only — kesalahannya ada di keadaan lingkungan saat itu, bukan di berkas mana pun yang bisa dipindai

**Aturan.** Worktree terisolasi bercabang dari **basis default repositori**, bukan dari branch
yang sedang kau kerjakan, kecuali kau menyuruhnya sebaliknya. Verifikasi yang dijalankan di sana
karena itu bisa **hijau terhadap basis yang salah**.

Dua sifat pendamping yang sama menjebaknya:

- **Worktree satu repositori BERBAGI index git.** Staging milik agen lain bisa ikut tersapu ke
  dalam commit-mu.
- **Jalur yang dilaporkan kepadamu bisa milik agen lain, dan jalur logis bisa berbohong.**
  Selesaikan jalur **fisik**-nya, dan pakai jalur absolut di setiap perintah — direktori kerja
  shell bisa berpindah antar pemanggilan.

**Mengapa.** Sebuah worktree yang dibuat untuk kerja paralel bercabang dari basis default alih-
alih dari branch integrasi; **verifikasinya lulus justru karena itu**, dan tulisan git-nya
mendarat di checkout **bersama** lalu **me-rename branch integrasinya**. Terpisah: perpindahan
berkas milik satu subagen **ikut tersapu** ke dalam commit agen lain lewat index bersama. Dan
sebuah hook isolasi pernah menunjuk worktree **milik agen lain** sementara direktori kerja yang
dilaporkan berbohong — jalur fisiknya berbeda dari yang tercetak.

**Cara memverifikasi.** `manual-review-only`. Di dalam worktree, **sebelum** menyentuh apa pun:
cetak merge-base terhadap branch yang kau maksudkan; kalau ia basis default, isolasinya salah dan
setiap hasil verifikasi di sana tidak berarti. Selesaikan jalur fisiknya dan pakai jalur absolut.
Sebelum **setiap** commit, periksa apa yang benar-benar ter-stage — jalur ter-stage yang tidak
kau sentuh milik orang lain, dan meng-commit-nya adalah kerusakan yang baru terlihat berjam-jam
kemudian ([[O-07]]).

---

## O-06 · Diam bukan bukti selesai

**Ditegakkan oleh:** manual-review-only — ketiadaan sinyal tidak punya artefak untuk diperiksa; yang salah adalah kesimpulan yang ditarik darinya

**Aturan.** Agen yang diam **belum tentu** selesai. Laporan sebuah subagen mengalir ke sesi yang
memiliki transkripnya, **bukan** otomatis ke pemanggil yang men-spawn-nya — jadi tidak adanya
laporan bukan tidak adanya pekerjaan.

Tiga sifat turunan:

- **Stempel waktu berkas yang tenang bukan bukti selesai**, dan artefak keluaran yang terlihat
  jelas bisa berupa symlink yang stempel waktunya tidak berarti apa-apa. Yang tumbuh adalah
  transkrip agennya sendiri.
- **Menghapus worktree tidak membunuh agennya.**
- **Pesan lintas-agen tiba BASI di kedua arah.** Koreksi yang kau kirim bisa mendarat setelah
  keadaan yang ia koreksi sudah lewat. Verifikasi keadaannya dulu; jangan kirim ulang koreksi
  yang sudah tidak berlaku, dan tulis koreksi sebagai **spesifikasi keadaan-akhir**, bukan urutan
  instruksi — urutan bisa setengah diterapkan saat ia tiba.

**Bertanya itu gratis; mengasumsikan menghabiskan satu gelombang.**

**Mengapa.** Seorang orkestrator menyimpulkan agen-agennya berhenti diam-diam, padahal laporan
mereka mengalir ke sesi induk. Di sisi lain, sebuah agen yang worktree-nya sudah **dihapus** tetap
hidup **36 menit** dan menulis ke worktree **yang lain**. Pengukuran "apakah ia masih bekerja"
juga salah alat: berkas keluaran per-tugas yang paling jelas ternyata **symlink**, jadi stempel
waktunya tidak mengatakan apa pun. Dan pesan berpapasan terukur berulang: koreksi dari orkestrator
ke subagen tiba basi berkali-kali dalam satu gelombang, begitu juga koreksi ke arah sebaliknya.

**Cara memverifikasi.** `manual-review-only`. Sebelum menyimpulkan sebuah agen selesai atau macet:
baca transkrip yang **tumbuh**, bukan keluaran yang ter-symlink; **tanya langsung**; dan cari
kerjanya di pohon berkas. Sebelum menyimpulkan koreksimu diterapkan, baca **keadaannya**, bukan
tanda terimanya ([[O-02]]).

---

## O-07 · Pohon artefak generated dimiliki satu penulis

**Ditegakkan oleh:** manual-review-only — gate sinkronisasi yang ada memeriksa satu hal, diff kosong, dan itu klaim aturan lain; ketiga klausa aturan ini tidak punya artefak untuk dibandingkan mesin

**Aturan.** Pohon artefak generated ([[B-03]]) dimiliki **tepat satu penulis** pada satu waktu.
Kalau kau bukan penulis itu, **diff merah di sana milik orang lain: laporkan, jangan
meregenerasi**.

Dua kewajiban praktis:

- **Catat checksum pohon itu SEBELUM pekerjaanmu mulai**, supaya kau bisa membuktikan mana
  perubahan yang milikmu.
- **Stage berkas barumu sendiri sebelum menjalankan gate.** Gate yang mendiff seluruh pohon akan
  membaca berkasmu yang belum ter-stage sebagai hilang, dan memerah karena alasan yang tidak ada
  hubungannya dengan perubahan siapa pun.

**Mengapa.** Agen paralel yang meregenerasi pohon yang sama menghasilkan diff yang **masing-masing
membaca sebagai kerusakannya sendiri**, lalu memperbaiki hal yang tidak rusak. Terukur di satu
gelombang: gate sinkronisasi mendiff **SELURUH** pohon generated alih-alih bagian yang diminta,
sehingga pekerjaan yang belum ter-stage memerahkannya secara palsu. Dan efek hilirnya nyata:
memindahkan sebuah operasi ke tag lain **menariknya masuk ke antarmuka server ketat**, dan dua
artefak turunan menjadi basi **sementara sebelas gate tetap hijau** — kepemilikan yang kabur
membuat tak seorang pun merasa bertanggung jawab memeriksanya.

**Cara memverifikasi.** `manual-review-only`, dan alasan memilihnya patut ditulis karena ia
menghindari cacat yang [[G-01]] hukum. Aturan ini **berpasangan** dengan gate sinkronisasi milik
[[B-03]] tapi **tidak ditegakkan olehnya**: gate itu memeriksa satu hal — pohonnya sinkron dengan
sumbernya — dan tidak satu pun dari tiga klausa di sini (penulis tunggal, checksum pra-kerja,
laporkan-jangan-regenerasi) punya artefak yang bisa ia bandingkan. Menuliskannya sebagai penegak
akan menghasilkan gate yang, per [[G-04]], wajib menyitir sebuah aturan yang **tak satu pun
klausanya ia periksa** — kolom penegak yang berbohong di dalam himpunan aturannya sendiri.

Pembagian kerjanya, dan ini yang membuat pasangan itu berguna: saat gate sinkronisasi **merah**,
[[B-03]] memberitahumu **pohonnya tidak sinkron**; aturan ini yang memberitahumu **itu milik
siapa**. Yang harus dilihat manusia: bandingkan diff merah terhadap checksum pra-kerja yang kau
catat — kalau perbedaannya di berkas yang tidak kau sentuh, ia milik penulis lain, jadi laporkan
ke pemiliknya dan **jangan** menjalankan generator. Sebelum menyalahkan gate, stage dulu berkas
barumu dan jalankan ulang. Bukti yang **TIDAK sah**: bahwa gate sinkronisasi hijau — ia hijau juga
saat dua penulis kebetulan menghasilkan pohon yang sama, dan diam sepenuhnya soal siapa yang
menulisnya.
