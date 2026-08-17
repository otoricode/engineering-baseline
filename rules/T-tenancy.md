# T — Tenancy

Setiap baris data milik satu **penyewa**. Berkas ini mengatur bagaimana batas itu ditegakkan di
**kueri** — dan hanya di sana.

Tiga hal terus-menerus dikacaukan, dan menutup dua yang pertama **tidak menyentuh yang ketiga
sama sekali**:

| # | Pertanyaannya | Ditutup oleh |
|---|---|---|
| 1 | **Akses anonim** — bisakah permintaan tanpa sesi mencapai rute ini? | guard di rute |
| 2 | **Kategori guard** — apakah guard-nya cocok dengan yang kontrak nyatakan? | [[C-03]] |
| 3 | **Isolasi penyewa** — bisakah pengguna penyewa A membaca/mengubah baris penyewa B? | **berkas ini, dan hanya berkas ini** |

Aturan di sini tidak berbunyi "jangan bocorkan data lintas penyewa" — semua sudah setuju soal
itu, dan tak seorang pun tahu harus mengubah apa. Yang ditulis di sini adalah **bentuk kode yang
salah**, **bentuk yang benar**, dan **kenapa bentuk yang salah terasa benar saat ditulis**.

---

## T-01 · Batas penyewa hidup di predikat query dan tidak bisa diturunkan dari kontrak

**Ditegakkan oleh:** manual-review-only — tidak ada artefak yang bisa diturunkan darinya; batas penyewa hanya ada sebagai predikat di kueri, dan itu persis yang tidak bisa dinyatakan kontrak

**Aturan.** Tenancy **memotong seluruh rantai** [[S-01]] dan **diturunkan dari nol**. Kontrak
tidak bisa menyatakannya dan codegen tidak bisa memaksakannya: batasnya hidup di **predikat
kueri**. Karena itu ia satu-satunya kelas aturan yang **wajib ditulis tangan di setiap
repository**.

Konsekuensi desainnya, dan ia sengaja: **lapis kueri tidak digenerate.** Ia satu-satunya
pemegang predikat penyewa, dan generator yang menyentuhnya adalah generator yang **mengarang
batas keamanan**. Sampai lapis itu ditulis tangan, modul lebih baik boot dengan store kosong
yang membuat tiap operasinya berhenti keras saat dipanggil — setengah jadi yang **terlihat**,
bukan yang diam.

**Mengapa.** Diukur sebelum kelas aturan ini ada: atas **62 aturan ber-ID** di satu himpunan
pedoman, kata-kata untuk penyewa, akses-by-ID lintas penyewa, cakupan, dan kolom ID penyewa
muncul **nol kali** masing-masing; sapuan kata kunci atas seluruh himpunan memberi **empat**
kecocokan, tak satu pun sebuah aturan. Akibatnya terukur: di gelombang berikutnya, **setiap**
temuan kebocoran lintas-penyewa dan akses-by-ID dilaporkan dengan **"no rule ID"** — kelas cacat
paling merusak adalah satu-satunya yang tidak bisa dikutip dan tidak bisa dipakai menolak PR.

Dan pemisahan tiga lapis di atas bukan kerapian: guard sesi pada rute data rujukan adalah guard
yang **tepat** untuk kategorinya, dan ia **tetap** mengizinkan baca lintas-penyewa kalau lapis
akses datanya tidak menyaring. Lapis 2 lulus; lapis 3 tidak pernah diperiksa.

**Cara memverifikasi.** `manual-review-only`, karena menurunkannya justru yang mustahil. Yang
harus dilihat manusia: **predikat kueri di lapis akses data**, bukan rutenya. Yang membuktikan
pelanggaran: satu kueri list atau by-ID tanpa predikat penyewa yang bisa dicapai dari rute
terjaga. Bukti yang **TIDAK sah**: bahwa pemeriksa permission ada ([[T-04]]), bahwa CI hijau,
bahwa gate kategori guard lulus, atau bahwa sebuah ulasan nol-temuan — **ulasan yang tidak
memeriksa satu pun kueri akses data belum menyentuh lapis ini**, dan itu wajib dikatakan
eksplisit, bukan disimpulkan dari sunyi.

---

## T-02 · Akses by-ID wajib disaring penyewa, bukan hanya dicek permission

**Ditegakkan oleh:** `gate:tenancy-byid (konsumen)`

**Aturan.** Setiap lookup by-ID membawa predikat penyewa — **baca, TULIS, dan HAPUS**, bukan
baca saja. Kelas ini **berbeda** dari filter cakupan ([[T-03]]) dan tidak tertutup olehnya:
cakupan bocor ketika **filternya jadi no-op**; akses-by-ID bocor karena lookup-nya **tidak
pernah menanyakan penyewa**.

**Perbaiki tanda tangannya, jangan tambahkan pemeriksaan.** Bentuk yang benar adalah helper
ber-lingkup yang menerima konteks permintaan **dan** id, sehingga pemanggil yang tidak meneruskan
konteks **tidak meng-compile**. Tambalan yang ditambahkan satu per satu akan terlupa di titik
kesepuluh; perubahan tanda tangan tidak bisa terlupa.

Dua batasan bentuk:

- **Kepemilikan yang berbeda struktur menuntut helper yang berbeda** — kolom langsung, lewat
  relasi, dan lingkup tunggal tanpa cakupan. Tiga helper, **bukan satu ber-flag**: flag adalah
  tempat lahirnya keputusan-yang-bisa-lupa yang justru sedang dibunuh.
- **Pakai filter cakupan, bukan perbandingan lingkup tunggal.** Penyewa yang sah bisa memiliki
  banyak lingkup; perbandingan tunggal akan merusak mereka.

**Mengapa.** Di satu modul, sebuah lookup by-ID **tidak menerima konteks sama sekali** — jadi
siapa pun yang memegang permission verifikasi **di organisasi mana pun** bisa membaca,
**MENYETUJUI**, atau menolak verifikasi identitas pengguna mana pun di seluruh platform; dan
persetujuan itu menyalakan flag yang menggerbangi akses ke satu area layanan penuh.

Di modul lain: **14 cacat terverifikasi**, di antaranya **7 TULIS dan 2 HAPUS** — termasuk satu
penghapusan tanpa soft-delete yang **tak terpulihkan**, dan satu penulisan yang menandai orang
milik penyewa lain sebagai meninggal.

Yang paling berbahaya: **kelas ini tidak terlihat lewat UI.** Di modul itu daftarnya **memang**
ber-cakupan, jadi UI hanya memunculkan baris dalam cakupan. Lubangnya **tidak bisa ditemukan
lewat alur yang dimaksudkan**; ia hanya terlihat kalau kau mengirim ID yang tidak pernah
ditawarkan UI. **Jangan menyimpulkan "aman" dari menelusuri aplikasi.**

**Cara memverifikasi.** `gate:tenancy-byid` menuntut setiap metode akses data ber-parameter ID
entitas juga menerima konteks permintaan. Sebut ambangnya jujur: versi naif memerahkan ratusan
titik yang sebagian sah — batas atas mentah per modul terukur di 83, 68, 27, dan 23, dan di modul
yang diaudit tangan **23 kandidat menyusut jadi 14 cacat nyata**. Rasio itulah yang membuat gate
naif tidak bisa dipakai; jadi pasang dengan allowlist ([[G-02]]) dan tumbuhkan lewat verifikasi.
Buktikan menggigit lewat sabotase ([[G-06]]): lepas predikat dari satu helper ber-lingkup dan
pastikan merah.

**Dan pikul riwayatnya, jangan biarkan ia hidup di aturan lain:** gate untuk kelas tenancy di
repo asalnya **pernah dibangun, diserang pengulasnya tiga ronde, lalu DITARIK sebelum ship**. Ia
melewatkan kedua contoh salah yang ditulis di aturan yang ia tegakkan, punya lima jalur lolos-diam
terkonfirmasi plus satu keenam yang ditemukan belakangan, dan memberi false positive pada
perbaikan yang benar dari dua kebocoran yang **ia sendiri temukan**. Yang membuatnya tidak layak
ship bukan kegagalannya menangkap, melainkan bahwa **ia dipercaya**: men-ship gate lalu
mendaftarkannya sebagai penjaga memindahkan hijau palsu dari kode ke dokumen — dan dokumen
bertahan lebih lama. Jangan memasang gate untuk aturan ini tanpa lebih dulu memenuhi [[G-06]],
termasuk kasus yang harus **LULUS**.

---

## T-03 · Fail-closed saat lingkup tak terselesaikan

**Ditegakkan oleh:** manual-review-only — bentuk cacatnya menuntut mengikuti tipe balikan dan setiap jalur return sebuah fungsi, bukan mencocokkan satu baris; gate berbasis pola yang dicoba justru membuang dua kebocoran hidup yang ia sendiri temukan

**Aturan.** Dua fungsi, dua kewajiban.

**Pembangun lingkup** — yang memutuskan "cakupan apa yang berlaku untuk permintaan ini" — ada
**satu per modul** dan **memulangkan galat**, bukan filter yang boleh null. Lima hasil, dan null
diam-diam bukan salah satunya:

| Keadaan | Hasil |
|---|---|
| ada penyewa + ada cakupan | filter dari cakupan |
| ada penyewa + **nol** cakupan | galat `<MODUL>_COVERAGE_EMPTY` |
| tanpa penyewa + ada lingkup tunggal di konteks | filter lingkup tunggal |
| tanpa keduanya | galat `<MODUL>_TENANT_CONTEXT_MISSING` |
| **sengaja global** | tanpa filter — dan **dinyatakan di kode**, bukan didiamkan |

Dua kode galat yang **berbeda**, bukan satu untuk keduanya ([[C-02]]), karena **pemulihannya**
berbeda: konteks yang hilang diselesaikan **pengguna** dengan memilih penyewa; cakupan kosong
hanya bisa diselesaikan **admin** dengan mengonfigurasinya.

**Penerap filter** — yang menempelkan cakupan ke kueri — **dilarang memulangkan kuerinya tanpa
menambah predikat**. Saat tidak ada yang bisa difilter, ia memancarkan predikat yang **tidak
cocok apa pun**. Hasil kosong itu **SALAH tapi AMAN**; kueri telanjang membocorkan **SELURUH**
penyewa.

Tiga syarat batas yang wajib ikut saat aturan ini dikutip:

1. **Predikat tak-cocok-apa-pun bisa jadi 500 pada agregat.** Penjumlahan atas himpunan kosong
   memulangkan NULL, bukan nol; NULL yang discan ke tipe numerik non-pointer adalah galat scan.
   Pakai tipe pointer atau nilai default eksplisit, jangan biarkan cabang gagal-tertutup
   menyamarkan sebabnya sebagai kerusakan server.
2. **Ia tidak kebal terhadap OR.** Ia mengandalkan predikat berikutnya di-AND. Begitu rantai
   kuerinya memakai OR, penjaganya lenyap.
3. **Gagal-tertutup dilarang mematikan sesi yang sah.** Keadaan "tanpa penyewa tapi ada lingkup
   tunggal" adalah keadaan **yang didukung** dan biasanya kelas pengguna terbesar; cabang
   fallback-nya dipertahankan, bukan dihapus atas nama keseragaman. Aturan keamanan yang
   mematikan pengguna sah akan dicabut, lalu kebocorannya kembali.

**Mengapa.** Diukur di satu branch: **17 cabang gagal-terbuka di 10 penerap, di 9 modul**. Dua di
antaranya **belum pernah dilaporkan siapa pun** — keduanya lolos setiap ulasan manusia karena
bentuknya **cabang ketiga** (predikat ditempel di dalam sebuah `if`, lalu kuerinya dipulangkan
telanjang di akhir), bukan pemeriksaan null yang semua orang cari. Ada **bentuk keempat** yang
letaknya di **titik panggil** dan bukan di penerap: filter dibangun sebagai variabel lokal lalu
penerapannya dibungkus `if` — tidak ada fungsi bernama untuk diinspeksi sama sekali.

Di sisi pembangun, akibatnya langsung: sembilan pemanggil berbentuk *"kalau filternya ada,
terapkan"* — mereka **MELEWATI** filter alih-alih menolak permintaan. **Enam** di antaranya
membocorkan baris orang per orang (nomor identitas, nama, alamat, nama orang tua) lintas
**seluruh** penyewa, dan satu dipakai rute **publik tanpa autentikasi**.

**Cara memverifikasi.** `manual-review-only`. Yang harus dilihat: **tipe balikan pembangunnya**
(apakah ia membawa galat?) dan **setiap jalur return penerapnya** (adakah yang memulangkan kueri
tanpa menambah predikat?). Yang membuktikan pelanggaran: satu return telanjang di fungsi yang
tipe pulangnya adalah tipe kueri. Bukti yang **TIDAK sah**: bahwa cabangnya tak terjangkau hari
ini — nilainya ada pada apa yang terjadi saat pemanggil baru lahir; dan **bukan** "kami
menampilkan nol ke pengguna", yang sukses palsu sekelas stub yang memulangkan sukses kosong.

Kalau kau membangun gate untuk ini, lingkupi **berdasarkan TIPE PULANG saja**. Terukur:
menambahkan syarat parameter **membuang dua kebocoran hidup** yang gate itu sendiri temukan
(keduanya membangun kueri dari receiver, bukan dari parameter), **dan** menyalakan alarm pada
**13 helper preload yang sehat** dari 21 fungsi yang cocok. Kecualikan bentuk gagal-tertutup yang
sah, tapi buat pengecualiannya **BERISIK** — cetak daftarnya tiap run, karena pengecualian yang
diam adalah lolos-diam yang baru.

---

## T-04 · Kehadiran pemeriksa permission bukan bukti batas penyewa

**Ditegakkan oleh:** manual-review-only — ia mengatur bentuk ARGUMEN manusia, bukan bentuk kode; tidak ada yang bisa diparse

**Aturan.** Kalimat-kalimat berikut **tidak sah** sebagai bukti keamanan penyewa, di PR, di
komentar kode, maupun di laporan:

| Klaim | Kenapa ia bukan bukti |
|---|---|
| "pemeriksa permission ada di rute itu" | Ia nol rujukan ke penyewa dan nol rujukan ke baris yang diminta |
| "ada token di permintaan itu" | Token milik penyewa lain **dibuang** dan permintaannya lanjut **sebagai anonim** — kehadiran token tidak menyatakan penyewa apa pun |
| "penggunanya terautentikasi, jadi ia anggota penyewa ini" | Konteks pengguna tetap terpasang **walau nol peran ter-resolve** |
| "test guard-nya lulus" | Ia lulus pada skenario yang ia dimaksudkan menangkap; kehadiran guard bukan ketiadaan akses-by-ID lintas penyewa |
| "CI hijau" | Gate mana? Tidak satu pun aturan di berkas ini dijaga mesin secara default |
| "gate kategori guard hijau" | Itu lapis 2, bukan lapis 3 |
| "ada baris log untuk pelanggarannya" | Log bukan pengganti gate |

Dan satu kewajiban positif yang melekat padanya: **setiap klaim keamanan wajib menyebut syarat
batasnya** — di mana ia berlaku dan di mana tidak. Klaim tanpa syarat batas dilarang, walau benar
di kasus yang mendasarinya. **Koreksi juga adalah klaim**, dan ia mewarisi batas lingkup si
pengoreksi: *"X tidak berlaku untuk Y"* belum lengkap tanpa *"dan aku memeriksa Y saja, bukan
Z"*.

**Mengapa.** Modul yang **setiap** rutenya memanggil pemeriksa permission tetap membocorkan
**14 metode akses-by-ID lintas penyewa**, karena permission menjawab *"boleh melakukan jenis
tindakan ini"* sementara batas penyewa menjawab *"atas baris yang mana"* — dua pertanyaan
berbeda. Ini yang paling mahal dari seluruh daftar, karena berkas pendaftaran rute yang penuh
pemeriksa permission **terbaca seperti terjaga**.

Butir-butir lain juga sudah menipu orang: sebuah test keanggotaan katalog **hijau untuk respons
yang jelas salah** karena sanitizer mengganti kodenya lebih dulu; dan **baris log** untuk setiap
pelanggaran katalog sudah ditulis **sepanjang umur sistem itu** tanpa satu pun ditindak — kalau
satu-satunya konsekuensi sebuah pelanggaran adalah baris log, anggap ia tidak terdeteksi.

Kewajiban syarat batas dibayar dengan angka telak: dalam satu gelombang, **empat** klaim keamanan
disebarkan lintas modul oleh orkestratornya lalu **dibatalkan sebagian** oleh pengulas yang
membaca lebih dalam — **empat dari empat**. Yang membedakan klaim yang bertahan dari yang gugur
bukan seberapa yakin penulisnya, tapi **apakah ia menyebut syaratnya**. Dan kelas ini
**bereproduksi lewat koreksi**: satu koreksi yang ber-syarat tapi hanya mengutip satu cabang
melahirkan aturan turunan yang akan memerahkan jalur login yang sah.

**Cara memverifikasi.** `manual-review-only`. Saat menulis temuan tenancy, sebut **tiga** hal:
(1) apa yang kau periksa, dan lapis mana dari tabel pembuka; (2) apa yang kau **TIDAK** periksa —
"nol kueri akses data diperiksa" adalah **fakta yang wajib ditulis**, bukan celah yang dibiarkan
pembaca simpulkan sendiri; (3) di keadaan apa kesimpulanmu berhenti berlaku. Laporan yang
kehilangan butir ketiga tidak lengkap walau benar. Saat merevisi, tempat pertama yang kau periksa
bukan yang kau **tambahkan**, tapi yang **mengelilingi** apa yang kau **ubah** — menambah aman;
mengubah struktur meninggalkan prosa di sekitarnya berbohong ([[O-02]]).

---

## T-05 · Sumber daya milik penyewa lain dijawab 404, bukan 403

**Ditegakkan oleh:** `gate:contract-permissions`

**Aturan.** Permintaan by-ID atas baris milik penyewa lain dijawab **404**, **sama persis** dengan
ID yang memang tidak ada. Bukan 403, dan **bukan** kode domain semacam "penyewa terlarang" — kode
seperti itu boleh hidup di log dan di test, **tidak di kabel**. Tidak boleh ada apa pun di
responsnya yang membuat pemanggil bisa membedakan *"ada, tapi bukan milikmu"* dari *"tidak ada"*:
tidak statusnya, tidak kodenya, tidak pesannya.

Ini **pengecualian atas batas 401/403** di [[C-03]], dan ia bukan negosiasi per endpoint melainkan
kelas tersendiri: dari sudut pandang penyewa yang meminta, baris itu **tidak ada**.

Jangan tertukar dengan keadaan "tidak bisa di-scope sama sekali". Satu pertanyaan memutuskannya:
**apakah servernya tahu penyewa mana yang dimaksud?**

| Keadaan | Status | Kenapa |
|---|---|---|
| tidak ada konteks penyewa sama sekali | **400** | permintaannya tak bisa di-scope, dan tak ada keberadaan yang sedang dirahasiakan ([[T-03]]) |
| konteks penyewa ADA, sumber dayanya milik penyewa lain | **404** | di sini keberadaannya justru yang harus dirahasiakan |

**Syarat batas ([[T-04]]) — 404 bekerja dengan merahasiakan keberadaan.** Kalau keberadaan sumber
dayanya **sengaja dapat ditemukan**, tidak ada yang dirahasiakan dan 404 justru **merugikan**:
pengguna sah yang ditolak akan menyimpulkan sumber dayanya tidak ada lalu berhenti mencoba. Di
situ **403 yang benar**, karena yang ditolak adalah **tindakannya**, bukan **pengetahuannya**.
Operasi bergaya "gabung ke penyewa X" adalah **instans** dari syarat itu, bukan pengecualian yang
harus dihafal.

**Urutan mengerjakannya, dan jangan dibalik: deklarasikan 404 di kontrak lebih dulu**, baru
tambahkan predikat penyewanya — sesuai rantai [[S-01]].

**Mengapa.** 403 memberi tahu penyerang bahwa ID itu **ada** di penyewa lain. Yang membuat itu
bukan kebocoran teoretis **di paket ini** adalah [[I-01]]: ID entitas **sengaja deterministik dan
diturunkan dari konten**, jadi ia **bisa dihitung**. Respons yang bisa dibedakan lalu
mengonfirmasi keberadaan **baris spesifik** di penyewa lain dengan **satu permintaan**; tanpa itu
penyerang harus menebak UUID acak. Paket ini menyimpan bahayanya di [[I-01]] — jadi ia wajib
menyimpan mitigasinya juga, dan di sinilah tempatnya.

**Syarat batas atas premis itu sendiri, karena aturan sumbernya sempat melanggarnya:** "ID bisa
dihitung" **hanya berlaku bagi penyerang yang sudah bisa memperoleh field penyewa korban** — ia
field **pertama** di string kanonik ([[I-02]]), jadi menghitung ID baris penyewa A menuntut
pengenal lingkup A **plus** kunci bisnisnya. Sebut jalur yang memancarkan pengenal itu saat
mengutip aturan ini; jangan biarkan pembaca menyimpulkan setiap ID bisa ditebak dari nol.

Sisi kontraknya juga terukur: kontrak modul yang melahirkan aturan ini memuat **nol** respons
404, sementara aturan yang mewajibkan 401 dan 403 **diam soal 404** — jadi lead yang menuruti
aturan ini apa adanya akan memancarkan status yang **tidak dideklarasikan kontraknya**, dan tidak
ada gate yang akan menangkapnya. Di **runtime** ini justru bukan perubahan bentuk: jalur by-ID
yang benar sudah 404 untuk ID tak dikenal, jadi menambah predikat penyewa membuat kasus
lintas-penyewa **jatuh ke jalur yang sudah ada**.

**Cara memverifikasi.** `gate:contract-permissions` menutup **separuh saja, dan sebutkan itu tiap
kali mengutip aturan ini — sisi DEKLARASI**: tiap operasi ber-parameter ID di path wajib
mendeklarasikan respons 404, diperiksa gate yang sama yang menegakkan 401/403 ([[C-03]]). Separuh
**runtime** tidak bisa diturunkan dari kontrak dan **tidak** dijaga gate itu:
tambahkan uji per modul yang menuntut **404 untuk ID milik penyewa lain**, digabung ke uji
koherensi status-lawan-kode. Yang membuktikan pelanggaran: respons apa pun yang membuat pemanggil
bisa membedakan kedua keadaan — termasuk **kode error yang berbeda pada status yang sama**. Bukti
yang **TIDAK sah**: bahwa UI tidak pernah menawarkan ID semacam itu — lubang kelas ini justru
hanya terlihat lewat ID yang tak pernah ditawarkan UI ([[T-02]]).

---

## T-06 · Operasi destruktif tidak boleh mengandalkan soft-delete yang tidak ada

**Ditegakkan oleh:** manual-review-only — menuntut tahu tabel mana punya kolom penanda hapus DAN kueri mana membacanya; itu analisis alir, bukan pencocokan pola

**Aturan.** Sebelum menulis operasi destruktif — penghapusan, atau penulisan yang menimpa keadaan
yang tak terpulihkan — **tetapkan lebih dulu apakah soft-delete benar-benar BERLAKU** untuk tabel
itu. Soft-delete **tidak otomatis** hanya karena kolom penanda hapusnya ada: apakah lapis akses
data menerapkannya bergantung pada **tipe kolom yang dideklarasikan**, dan di mana ia tidak
diterapkan, **setiap** kueri wajib menulis predikat "belum dihapus" dengan tangan.

Dua akibat yang **berlawanan arah**, dan keduanya nyata:

- Penghapusan yang kau **kira** lunak ternyata **KERAS** → kehilangan data **tak terpulihkan**.
- Baris yang kau **kira** terhapus ternyata masih **dibaca** → cakupan yang sudah dicabut tetap
  memberi visibilitas, dan itu kebocoran penyewa ([[T-03]]).

Karena itu jalur destruktif **menyatakan di kode** ia berada di rezim yang mana. Dan jalur
destruktif by-ID melewati gerbang penyewa yang sama dengan jalur baca: [[T-02]] berlaku untuk
**tulis dan hapus**, bukan baca saja.

**Mengapa.** Terukur di satu basis kode: **56 berkas model** mendeklarasikan kolom penanda hapus
dengan tipe pointer biasa, sementara tipe soft-delete bawaan lapis akses datanya muncul **nol
kali** di seluruh pohon — jadi **tidak ada** filter soft-delete yang diterapkan di mana pun, dan
setiap predikat "belum dihapus" ditulis tangan. Satu-satunya tempat yang melakukannya dengan benar
menulis **ketiga** predikatnya sendiri: dua di dalam join, satu di klausa where. Konsekuensinya
langsung: satu-satunya penulis yang menghapus baris cakupan karena itu melakukan **HARD delete**,
padahal namanya tidak memberi tahu siapa pun. Dan di audit akses-by-ID, di antara 14 cacat
terverifikasi, **satu adalah penghapusan tanpa soft-delete atas baris penyewa lain — tak
terpulihkan**.

**Syarat batas ([[T-04]]), dan ia MEMPERKECIL aturan ini — jangan kutip tanpa bagian ini:** di
basis kode itu, pada saat diukur, paruh **kebocoran** belum punya penghasil — nol jalur yang
men-soft-delete baris cakupan. Itu **tidak** membuat aturannya hiasan: kolomnya **ada**, penulis
lain bisa mengisinya, dan penulis berikutnya yang beralih ke soft-delete akan mewarisi kebocoran
itu **tanpa satu pun kueri berubah**. Kutip aturan ini sebagai **syarat sebelum soft-delete
diperkenalkan**, bukan sebagai bukti kebocoran yang sedang berjalan.

**Cara memverifikasi.** `manual-review-only`. Yang harus dilihat, untuk tiap tabel yang disentuh
jalur destruktif: (a) **tipe kolom penanda hapusnya** — itu yang memutuskan apakah lapis akses
data menyaring sama sekali; (b) apakah kueri yang membaca tabel itu menulis predikatnya dengan
tangan. Yang membuktikan pelanggaran: sebuah penghapusan yang dipresentasikan di review sebagai
"bisa dipulihkan" pada tabel yang tipe kolomnya tidak memberi filter otomatis; atau sebuah kueri
baca atas tabel ber-kolom itu tanpa predikatnya. Bukti yang **TIDAK sah**: **kehadiran kolomnya**
("kita kan punya soft-delete"), dan **test yang lulus** — kedua rezim menghasilkan hasil yang
identik sampai ada baris yang benar-benar dihapus. Uji yang murah dan menyelesaikannya: hapus satu
baris lewat jalur itu, lalu baca kembali lewat jalur **list**. Kalau ia kembali, penghapusannya
lunak dan setiap kueri cakupan wajib diperiksa ulang; kalau ia hilang selamanya, **tulis itu di
PR**.

---

## T-07 · Daftar periksa penyewa yang digenerate wajib dikonsumsi sebelum pembekuan

**Ditegakkan oleh:** `gate:tenancy-checklist`

**Aturan.** Generator kerangka modul memancarkan berkas KELIMA di samping keempat berkas kodenya:
daftar periksa lintas-penyewa untuk metode store berbentuk `(ctx)` dan `(ctx, id string)` — yaitu
kelas yang [[T-02]] jaga. Teks berkas itu menyuruh mengubahnya jadi uji sungguhan lalu
**menghapusnya**. Aturan ini menetapkan **kapan** tagihannya jatuh tempo: pada `-freeze`. Modul
yang sudah dibekukan dan masih memuat berkas daftar periksanya adalah **MERAH**.

Titik itu bukan pilihan sembarang. Selama modulnya masih tergenerate, daftar periksa itu memang
belum waktunya dikonsumsi — lapis kueri belum ditulis, jadi belum ada predikat yang bisa diuji.
`-freeze` justru MENANDAI transisi "kerangka ini sudah dikawinkan dengan tangan": sejak saat itu
lapis kueri ada, dan bersamanya ada atau tidak adanya predikat penyewa.

**Batasnya, dan sebut ia saat mengutip aturan ini:** gate ini **tidak membaca satu pun predikat
kueri** dan tidak bisa — itu persis yang tidak bisa diturunkan dari artefak mana pun ([[T-01]]).
Yang ia buktikan hanya bahwa pertanyaannya pernah **dijawab**, bukan bahwa jawabannya benar. Modul
yang LULUS gate ini belum terbukti aman; modul yang GAGAL terbukti belum pernah menjawab.

**Mengapa.** Diukur, bukan dibayangkan. Seorang pengulas menjalankan `-freeze -apply` sungguhan
atas modul contoh dan membuktikan berkas daftar periksa itu **bertahan di modul yang sudah beku** —
keadaan yang teks berkas itu sendiri larang — **tanpa satu pun peringatan**. Sebabnya struktural:
berkas itu prosa `.md`, jadi ia tidak dikompilasi, tidak dijalankan uji mana pun, dan tidak muncul
di satu pun gate yang ada. Kewajiban yang tak terlihat CI mana pun adalah kewajiban tanpa penegak,
dan dokumen tidak menahan agen — gate yang menahan ([[O-01]]).

Harga kegagalannya dipinjam dari kelas yang ia jaga: di satu modul, **14 cacat akses-by-ID
terverifikasi**, di antaranya 7 TULIS dan 2 HAPUS. Tak satu pun terlihat lewat UI, karena
daftarnya memang ber-cakupan — lubangnya hanya muncul kalau seseorang mengirim id yang tidak pernah
ditawarkan UI ([[T-02]]).

**Cara memverifikasi.** `gate:tenancy-checklist` memindai tiap direktori feature, membaca keadaan
generasinya dari NAMA BERKAS di disk (bukan dari sebuah daftar yang bisa menyimpang), dan
memerahkan setiap direktori yang keadaannya `handWired` atau setengah beku sementara berkas daftar
periksanya masih ada. Direktori feature yang tidak ada sama sekali **gagal sebagai kegagalan alat**,
bukan lulus — gate yang memindai nol artefak tidak bisa dibedakan dari gate yang lulus ([[G-05]]).
Buktikan menggigit lewat sabotase ([[G-06]]): (1) bekukan sebuah modul tanpa menghapus berkasnya →
harus MERAH menyebut nama direktorinya; (2) hapus berkasnya → HIJAU; (3) modul yang masih
tergenerate dan masih membawa berkasnya → tetap HIJAU, karena tagihannya memang belum jatuh tempo,
dan gate yang memerahkan bentuk yang benar akan dibuang orang.
