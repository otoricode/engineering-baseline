# C — Kontrak

Kontrak diturunkan dari skema data ([[S-01]]) lalu **mengikat** semua konsumen. Ia diedit
tangan lewat PR; artefak bundel dibangkitkan dan tidak pernah disunting ([[B-03]]).

> **Prasyarat teknologi — baca ini sebelum menyimpulkan sebuah aturan di sini tidak berlaku.**
> Lapis ini memakai kosakata **OpenAPI 3.0** sebagai contoh konkret: `anyOf`/`oneOf`/`allOf`,
> `nullable`, `multipart/form-data`, dan "bundel ter-dereference". Pilihan 3.0 dan bukan 3.1
> sendiri punya alasan mengikat: sebagian generator server hanya mendukung 3.0, jadi memilih 3.1
> membuat sisi server tidak bisa dibangkitkan sama sekali.
>
> **Kosakata itu contoh, bukan syarat berlakunya.** `nullable` bahkan **dihapus di OpenAPI 3.1**.
> Di proyek yang memakai 3.1, GraphQL, protobuf, atau skema lain, baca tiap aturan lewat
> **padanan generiknya** — satu kalimat yang dicetak di aturan yang terdampak. Aturan yang
> keyword-nya tidak ada di stack-mu **tidak** otomatis tidak berlaku; yang tidak ada cuma
> ejaannya, dan menyimpulkan sebaliknya adalah cara sebuah kewajiban hilang saat paket ini
> berpindah.

---

## C-01 · Envelope tunggal untuk seluruh respons JSON

**Ditegakkan oleh:** `gate:contract-envelope`

**Aturan.** Ada **satu** bentuk sukses dan **satu** bentuk gagal untuk seluruh respons JSON.

Sukses membawa `status`, `message`, `data`, dan `metaData` opsional. `message` wajib karena ia
berguna: mutasi menaruh kalimat untuk manusia di sana ("3 baris dilewati karena duplikat") dan
frontend cukup menampilkannya — satu tempat, bukan ratusan string yang dikarang di komponen.

Gagal membawa `status`, `code` (dari katalog tertutup, [[C-02]]), `message`, dan `errors`
**hanya** pada respons validasi. **Tidak ada `data` pada respons gagal.** Jalur setiap galat
field adalah **string** notasi titik/kurung, bukan larik, supaya bisa langsung disuap ke penyetel
galat pustaka form.

Empat batasan turunannya, dan semuanya mutlak:

- **`data` operasi list adalah larik telanjang**, bukan objek yang membungkus larik.
- **`metaData` membawa HANYA paginasi.** Field kedua apa pun dilarang. Agregat — hitungan,
  ringkasan, jumlah kolom — adalah **DATA**: taruh di `data`, atau di endpoint saudara terpisah
  kalau bentuknya tidak muat.
- **Status HTTP mencerminkan isi badan.** Respons 2xx dilarang mereferensikan envelope gagal,
  dan sebaliknya.
- **Envelope hanya untuk JSON.** Respons biner tetap biner dan tidak dibungkus; penanda itu juga
  yang dipakai klien untuk mengecualikannya dari validasi.

Menuliskan envelope per operasi adalah **pekerjaan skrip, bukan tangan**. Di sisi konsumen,
envelope dibaca apa adanya — tidak dibuka oleh adapter per modul ([[W-01]]).

**Padanan generik.** Kalau stack-mu tidak punya media type atau "bundel ter-dereference",
kewajibannya tetap utuh: **satu** bentuk pembungkus untuk seluruh respons berhasil, **satu** untuk
seluruh respons gagal, muatan list telanjang, metadata yang isinya hanya paginasi, dan kanal
non-terstruktur (biner, stream) yang tidak dibungkus sama sekali.

**Mengapa.** Sebelum bentuknya tunggal, server mencampur `{data, pagination}`, `{data, meta}`,
`{data}`, dan payload telanjang di rute yang berbeda; setiap konsumen menebak, dan tebakan yang
salah baru ketahuan di runtime. Di sisi server itu melahirkan **lima struct paginasi berbeda**
untuk satu konsep, dengan `total` yang kadang bilangan 32-bit kadang 64-bit — selisih yang cukup
untuk menghasilkan JSON berbeda pada dataset besar.

Klausa "`metaData` HANYA paginasi" mutlak karena versi longgarnya sudah gagal sekali: aturan
"agregat boleh asal bukan ukuran domain" menuntut penilaian **per field** saat ulasan, dan
penilaian itulah yang meleset — **sembilan kolom penjumlahan** lolos ke `metaData` karena
disebut "agregat". Aturan mutlak tidak butuh penilaian: gate menghitung field, tidak menimbang
maknanya.

Dan "pekerjaan skrip" bukan gaya: ditulis tangan ratusan kali, envelope pasti menyimpang —
preseden terukur, **30 dari 39 operasi** di satu tag menulis ulang entitas yang sama inline,
8591 baris untuk 39 operasi.

**Cara memverifikasi.** `gate:contract-envelope` berjalan di atas bundel ter-dereference dan
memeriksa: tiap respons 200/201 ber-JSON memakai envelope sukses; operasi list menaruh paginasi
di `metaData.pagination` dengan komponen paginasi bersama dan `data` bertipe larik; respons
4xx/5xx memakai envelope gagal dan **tidak ada** 2xx yang mereferensikannya maupun sebaliknya;
respons non-JSON tidak dibungkus. Untuk `metaData`, gate **menghitung field** — dan hitunglah
dari tipe hasil generate, bukan dari sumber kontrak, supaya yang diukur adalah apa yang benar-
benar sampai ke kabel.

---

## C-02 · Katalog kode error tertutup per domain

**Ditegakkan oleh:** manual-review-only — gate pem-parse sumbernya belum ditulis, dan ketiga klausa yang belum tertutup itu bisa dimesinkan seluruhnya; ini utang yang layak dibangun, bukan batas yang mustahil dilewati

**Aturan.** `code` pada envelope gagal **bukan teks bebas**. Ia enum di satu katalog bersama,
dua lapis:

- **Generik** — `NOT_FOUND`, `VALIDATION_ERROR`, `UNAUTHENTICATED`, `FORBIDDEN`, `CONFLICT`,
  `RATE_LIMITED`, `INTERNAL_ERROR`, dan sejenisnya.
- **Spesifik domain** — wajib berpola `<DOMAIN>_<ALASAN>`.

**Nama domain telanjang dilarang**: ia menempati kolom yang seharusnya berisi **alasan**.
Konstanta di setiap bahasa dibangkitkan dari katalog yang sama, dan katalognya tertutup — kode
baru masuk lewat katalog lebih dulu, bukan lewat pemanggilan.

**Mengapa.** Tanpa katalog, satu server mengumpulkan **145 kode berbeda**: 106 bergaya
SCREAMING_SNAKE dan 39 PascalCase, dengan sinonim yang hidup berdampingan (`NOT_FOUND` 154 kali
**dan** `NotFound` 54 kali; `VALIDATION_ERROR` 54 kali **dan** `VALIDATION` 22 kali) plus kode
yang isinya cuma nama domain (55, 31, dan 25 kali). Kode yang berbunyi nama domain tidak memberi
tahu klien apa yang salah, jadi bercabang berdasarkan kode memang mustahil — dan itu sebabnya
**621 pemanggilan toast galat** di frontend nyaris semuanya cuma menampilkan pesan mentah.

Dan satu jebakan yang membuat aturan ini butuh gate sungguhan, bukan tipe: dalam bahasa bertipe
statis yang memakai *defined type* di atas string, **konstanta tak bertipe tetap diterima** —
`var _ ErrorCode = "KODE_KARANGAN"` meng-compile tanpa keluhan; hanya **variabel** bertipe
string yang ditolak. Selama bertahun-tahun aturan ini diklaim "dijaga kompilator" atas dasar
itu, dan klaimnya salah. Di bahasa dengan union literal, klaim yang sama justru benar — jadi
"bertipe = gagal compile" adalah kalimat yang menyesatkan begitu dipakai lintas lapis.

**Cara memverifikasi.** Aturan ini punya **empat klausa, dan hanya satu yang punya penegak hari
ini** — katakan itu setiap kali mengutipnya, karena kolom penegak yang membulatkan "satu dari
empat" jadi "ditegakkan" adalah persis kebohongan yang [[G-01]] hukum.

1. Tiap `code` yang muncul di kontrak ada di katalog — **belum ada penegaknya**.
2. Kode domain cocok pola `<DOMAIN>_<ALASAN>` — **belum ada penegaknya**.
3. Nama domain telanjang ditolak — **belum ada penegaknya**.
4. Konstanta hasil generate di setiap bahasa sinkron dengan katalog — **tertutup**, dan bukan oleh
   gate milik aturan ini melainkan sebagai efek samping [[B-03]]: konstantanya DIBANGKITKAN dari
   katalog, dan gate regenerasi menuntut diff kosong, jadi katalog yang bergerak tanpa regenerasi
   (atau konstanta yang disunting tangan) MERAH di sana. Itu penegakan sungguhan, tapi ia milik
   aturan lain, dan meminjam namanya ke kolom penegak di atas akan mengirim pembaca meng-grep
   sebuah langkah diff yang tak pernah menyebut ID aturan ini.

Ketiga klausa yang terbuka **bisa dimesinkan seluruhnya** — mem-parse bundel untuk tiap `code`,
mencocokkan pola, menolak nama telanjang. Tidak ada yang menghalangi selain belum ditulisnya.
Bedakan itu dari klausa yang memang di luar jangkauan mesin: yang pertama menuntut seseorang
membangunnya, yang kedua menuntut seseorang membacanya.

Saat gate itu dibangun, kontrol positif yang wajib: sisipkan satu kode di luar katalog ke sebuah
berkas sumber dan pastikan MERAH — pemeriksaan berbasis tipe akan tetap hijau di situ, dan itu
persis kegagalan yang aturan ini catat. Jangan menerima **baris log** sebagai penjaga: log
pelanggaran katalog sudah ditulis sepanjang umur sistem itu dan tidak pernah ada yang
menindaknya ([[T-04]]).

---

## C-03 · Auth dan permission dinyatakan di kontrak

**Ditegakkan oleh:** `gate:contract-permissions`

**Aturan.** Siapa boleh memanggil apa dinyatakan **di kontrak**, bukan hanya di kode server:

1. Skema keamanan dideklarasikan global. Operasi publik menulis `security` kosong **eksplisit**
   — bukan diam-diam mewarisi — dan terdaftar di buku besar operasi publik, diperiksa dua arah
   ([[G-05]]).
2. Operasi ber-guard menyatakan permission-nya di kontrak, diambil dari katalog tertutup.
   Operasi yang hanya butuh sesi ditandai **berbeda** dari yang benar-benar publik.
3. Operasi ber-security wajib mendeklarasikan respons 401 dan 403; operasi ber-parameter ID di
   path wajib mendeklarasikan **404** juga ([[T-05]]).
4. **401 = belum terautentikasi. 403 = terautentikasi tapi tak berhak.** Batasnya tegas dan
   tidak ditawar per endpoint: kredensial tidak ada, token tidak sah, token kedaluwarsa, sesi
   belum dibuat — semuanya **401**. Pesan "perlu login" dalam bentuk apa pun adalah 401.
   **Satu pengecualian, dan ia bukan negosiasi per endpoint melainkan kelas tersendiri: batas
   penyewa TIDAK dijawab 403.** Baris milik penyewa lain dijawab **404** — dari sudut pandang
   penyewa yang meminta ia tidak ada, dan 403 di situ **mengonfirmasi keberadaannya**. Aturannya
   beserta syarat batasnya ada di [[T-05]]; jangan menerapkan butir ini ke kasus lintas-penyewa
   tanpa membacanya.
5. Nama permission adalah **data**, bukan enum kode: ia baris di basis data yang sudah dipegang
   role di produksi. Menggantinya adalah **migrasi data plus penugasan ulang role**, dan mode
   gagalnya adalah *seseorang kehilangan akses tanpa ada yang sadar*. Karena itu nama warisan
   yang melanggar pola penamaan **dibiarkan apa adanya** dan didaftar terpisah; pola berlaku
   hanya untuk entri baru.

Kategori guard yang benar **bukan** batas penyewa. Lihat [[T-01]].

**Mengapa.** Tanpa aturan ini, **503 rute** dijaga permission di server dan **tidak satu pun**
terlihat dari kontrak; frontend menebaknya dengan **43 literal permission yang diketik tangan**,
sementara server memakai 168 dan seeder memuat 210 — tiga angka, tiga tempat, nol mekanisme yang
menghubungkannya. Ganti nama di server, dan frontend tetap menampilkan tombol yang selalu
ditolak. Untuk respons: hanya **6 dari 694 operasi** mendokumentasikan 401 (6 juga untuk 403),
jadi klien generated tidak punya tipe untuk kasus yang paling sering terjadi.

Batas 401/403 sendiri butuh diputuskan, bukan diwarisi: berkas otorisasi di server memuat **tiga
komentar yang saling bertentangan** tentang perilakunya sendiri — baris 15 menulis 403, baris 33
menulis 401, baris 67 menulis 403 — sementara kodenya 401. Karena guard-nya menjaga setiap
endpoint, divergensinya universal, dan saat diluruskan ia memunculkan **17 kegagalan test
sekaligus**, sepertiga dari seluruh kegagalan test server saat itu.

**Cara memverifikasi.** `gate:contract-permissions` memeriksa lima sisi, semuanya harus cocok:
tiap permission di kontrak ada di katalog; tiap entri katalog ada di data seed (kalau tidak,
guard menunjuk permission yang tak bisa dipegang role mana pun); operasi ber-security punya 401
dan 403; operasi ber-parameter ID di path punya 404 ([[T-05]]); operasi publik menyatakan
`security` kosong **dan** terdaftar di buku besar publik, dua arah. Buktikan dengan sabotase
([[G-06]]): tandai satu operasi terjaga jadi publik diam-diam dan pastikan gate merah **menyebut
operationId-nya**.

**Batas yang gate ini TIDAK tutup, dan sebutkan saat mengutipnya:** ia memeriksa apa yang
**dideklarasikan**, bukan apa yang **dipancarkan**. Bahwa 404 tertulis di kontrak tidak
membuktikan server benar-benar menjawab 404 untuk baris penyewa lain — separuh runtime itu milik
[[T-05]] dan dijaga uji per modul, bukan gate ini.

---

## C-04 · Jangan pernah menambah `nullable` ke badan permintaan

**Ditegakkan oleh:** `gate:contract-request-body`

**Aturan.** Nullability dari skema data berlaku untuk **respons saja**. Skema masukan memakai
*optional*, yang **menolak nilai null**. Menambahkan `nullable` ke badan permintaan membuat
kontrak menjanjikan sesuatu yang server tolak.

Ini satu-satunya pengecualian atas [[S-01]], dan ia disengaja.

**Padanan generik, dan di sini ia bukan formalitas: `nullable` DIHAPUS di OpenAPI 3.1.** Kewajiban
dasarnya bukan tentang keyword itu — masukan yang boleh dihilangkan dinyatakan sebagai **absen
(opsional)**, tidak pernah sebagai **hadir-tapi-kosong**. Di stack apa pun yang membedakan kedua
keadaan itu, aturan ini berlaku utuh; kalau kau membacanya sebagai aturan tentang sebuah keyword,
kau akan menyimpulkan ia tidak berlaku padamu justru saat ia paling berlaku.

**Mengapa.** Preseden dari penyapuan nullability yang menyentuh 88 properti respons: badan
permintaan **sengaja tidak disentuh** di sana, dan itu keputusan yang benar. Validator masukan
hasil generate menolak `null` untuk field opsional, jadi kontrak yang mengizinkannya
menghasilkan 400 untuk payload yang kontraknya sendiri nyatakan sah — kelas bug yang paling
sulit didebug, karena semua dokumen yang tersedia membenarkan si pemanggil.

**Cara memverifikasi.** `gate:contract-request-body` memindai seluruh skema badan permintaan di
bundel ter-dereference dan menggagalkan kemunculan `nullable` mana pun. Ia sengaja **terpisah**
dari gate envelope, dan namanya bagian dari aturannya: nama gate menjadi pesan gagal, jadi gate
bernama envelope akan mengirim orang membaca aturan envelope untuk cacat yang letaknya di
**masukan**. Saat menambah field, pertanyaannya satu: apakah ia di badan permintaan? Kalau ya —
*optional*, tidak pernah nullable.

---

## C-05 · Bentuk union di badan permintaan dilarang

**Ditegakkan oleh:** `gate:contract-lint`

**Aturan.** Badan permintaan dilarang berbentuk union (`anyOf`/`oneOf`). Operasi yang menerima
beberapa bentuk **dipecah jadi satu operasi per bentuk**, dan jenisnya ditentukan **URL**, bukan
diskriminator di badan. Tiap operasi hasil pecahan lalu mengikat lewat lapis generated tanpa
tambalan tulisan tangan ([[B-01]]).

**Padanan generik.** Kewajibannya bukan tentang `anyOf`/`oneOf` melainkan tentang **badan
permintaan yang bentuknya bercabang**, dengan mekanisme apa pun yang stack-mu punya: union, sum
type, `oneof`, atau input interface. Pecah jadi satu operasi per cabang, dan biarkan **alamatnya**
yang menentukan jenisnya.

Aturan ini satu keluarga dengan bentuk-bentuk lain yang **lolos lint tapi ditolak generator**,
dan gate yang sama menahannya: `items` bentuk tuple, `allOf` bertipe kontradiktif, dua properti
berbeda yang menciut ke nama tipe hasil generate yang sama, objek di dalam badan multipart, dan
graf rujukan yang siklik. Semuanya berbagi satu sifat: **linter kontrak bukan jaminan dokumen
diterima generator.**

**Mengapa.** Badan union bisa **diam-diam tidak mengikat**. Terukur pada satu generator server:
untuk badan union ia memancarkan tipe badan permintaan dalam **dua bentuk berbeda yang dibedakan
satu karakter** — sebagai *alias* (yang membawa serta method receiver-nya, jadi tetap memenuhi
antarmuka unmarshal dan mengikat dengan benar) atau sebagai *tipe terdefinisi* (yang tidak).
Pada bentuk kedua, pengikatan badan **berhasil tanpa mengisi apa pun**: badan kosong, tanpa
galat, sukses dengan nilai nol. Audit menemukan empat badan union di seluruh pohon generated —
dua alias yang aman dan dua terdefinisi yang cacat sejak lahir. Menambalnya menuntut membangun
ulang union dari badan mentah, plus dispatch diskriminator dan validator field wajib yang
ditulis tangan di server, plus skema form yang direlokasi tangan di frontend untuk menghindari
bug UX "semua cabang divalidasi". Memecahnya jadi satu operasi per bentuk **menghapus seluruh
tambalan itu** dan mengikat lewat lapis generated tanpa satu baris pun jalan pintas.

Sisa keluarganya sama konkretnya: `allOf` bertipe kontradiktif memancarkan skema validasi yang
tidak meng-compile; dua properti bersarang yang menciut ke nama yang sama memancarkan **dua
deklarasi tipe dengan nama identik** — judul yang berbeda maupun skema yang identik tidak
menolong, hanya komponen bersama yang menyelesaikannya; dan objek di badan multipart
memancarkan penambahan form-data bertipe union yang ditolak pemeriksa tipe, karena field
multipart hanya bisa string atau blob.

**Cara memverifikasi.** `gate:contract-lint` menolak `anyOf`/`oneOf` di bawah badan permintaan
mana pun di bundel ter-dereference, dan menolak kelima bentuk saudaranya. Penjaga kedua yang
murah di sisi server, untuk menangkap kambuhnya lewat generator: setiap tipe badan permintaan
hasil generate yang **bukan alias** DAN tidak punya implementasi unmarshal sendiri = gagal.
Jangan berhenti di linter kontrak — jalankan codegen kedua sisi sebagai bagian gate, karena
kelas ini justru didefinisikan oleh "lolos lint, ditolak generator".

---

## C-06 · Satu nama parameter per posisi path

**Ditegakkan oleh:** `gate:contract-routes`

**Aturan.** Dalam satu metode HTTP, sebuah **posisi** path — didefinisikan sebagai prefix statis
yang menuju ke sana — hanya boleh dituju **satu nama parameter**. `/keluarga/{id}` dan
`/keluarga/{keluargaId}` menempati posisi yang sama dan karena itu dilarang hidup berdampingan;
menyamakan namanya adalah satu-satunya perbaikan.

Cakupannya **per metode**, bukan per dokumen: router pohon-radix menyimpan satu pohon per metode,
jadi `GET /x/{a}` dan `POST /x/{b}` tidak bertabrakan. Menuntut keseragaman lintas metode akan
memerahkan kontrak yang sepenuhnya sah — dan gate yang memerahkan bentuk yang benar akan dibuang
orang ([[G-06]]).

Dua path yang **divergen sesudah** parameternya tetap berbagi posisi itu: `/keluarga/{x}/split`
dan `/keluarga/{y}/merge` bertabrakan, karena percabangannya terjadi SETELAH simpul parameter.

**Padanan generik.** Kewajibannya bukan tentang sintaks `{...}` OpenAPI melainkan tentang **satu
slot alamat, satu nama**. Di stack apa pun yang memasang rute lewat pencocokan pohon — dan hampir
semuanya begitu — dua nama untuk slot yang sama adalah bentuk yang tidak bisa dipasang.

**Mengapa.** Ini kelas yang lolos SETIAP pemeriksaan yang ada dan gagal di tempat yang paling
mahal. OpenAPI **tidak melarangnya**: tiap path item berdiri sendiri, jadi linter kontrak
meloloskannya tanpa sepatah kata. Generator server juga meloloskannya — ia memancarkan pendaftaran
rute untuk keduanya dengan patuh. Yang menolak adalah **router saat runtime**, dan ia tidak menolak
dengan galat yang bisa ditangani: ia **panic saat pendaftaran**, yaitu saat proses boot. Akibatnya
seluruh server gagal start — bukan satu endpoint yang rusak, melainkan semuanya, termasuk endpoint
yang tak ada hubungannya dengan tabrakan itu.

Dan ia sudah terjadi: `/keluarga/{id}`, `/keluarga/{keluargaId}/...`, dan
`/keluarga/{targetKeluargaId}/merge` hidup berdampingan di satu kontrak yang lolos lint, lolos
codegen, dan di-commit. Nama-nama itu lahir wajar — tiap operasi ditulis di gelombang yang berbeda,
masing-masing menamai parameternya sesuai konteksnya sendiri, dan tak satu pun penulisnya melihat
dua path lain yang bukan bagian dari pekerjaannya.

**Cara memverifikasi.** `gate:contract-routes` membangun satu trie per metode HTTP dari segmen path
kontrak dan memerahkan tiap simpul yang cabang parameternya dituju lebih dari satu nama. Pesannya
menyebut **posisi**-nya (prefix statis menuju ke sana) dan **seluruh** nama yang bertabrakan
beserta satu contoh path per nama — bukan cuma yang pertama, karena tabrakan tiga-arah yang
dilaporkan sebagai dua-arah menuntut dua putaran perbaikan. Buktikan dengan sabotase ([[G-06]]):
tambahkan satu path yang menamai ulang parameter di posisi yang sudah dipakai → MERAH menyebut
kedua namanya; ubah dua path yang divergen sesudah parameter agar namanya sama → HIJAU.
