# engineering-baseline

Standar rekayasa portabel: satu folder berisi aturan ber-ID, gate yang menegakkannya, dan tooling
generator — disalin utuh ke proyek lain. Dokumen tanpa tooling diabaikan; tooling tanpa dokumen
disalahpakai; keduanya tanpa gate menyimpang dalam hitungan minggu. Paket ini mengirim ketiganya.

## Isi paket

| Berkas / folder | Untuk siapa |
|---|---|
| [`STANDARD.md`](STANDARD.md) | Pintu masuk **manusia** — naratif, alasan tiap aturan |
| [`AGENTS.md`](AGENTS.md) | Pintu masuk **agen** — imperatif, berdaftar-periksa |
| [`rules/`](rules/README.md) | Aturan ber-ID, satu sumber kebenaran — [`rules/README.md`](rules/README.md) untuk skema |
| `tooling/` | Config, generator, gate — jalan lewat `bin/standard` |
| `bin/standard` | Satu-satunya entry point CLI |
| [`INSTALL.md`](INSTALL.md) | Prosedur pemasangan — lima langkah, prasyarat, dan kontrak paket platform |

## Empat pilar

1. **Rantai sumber kebenaran** (`S-`) — satu arah tertulis dari skema data sampai ke klien, dan
   prosedur saat dua lapis berbeda pendapat. [[S-01]]
2. **Kontrak, backend, frontend sebagai satu rantai turunan** (`C-`, `B-`, `W-`) — kontrak
   mengikat, server menyesuaikan, klien menurunkan diri; tidak ada lapis yang menafsirkan sendiri.
3. **Gate: aturan jadi mesin** (`G-`) — opt-in allowlist yang hanya bertambah, baseline
   shrink-only untuk utang lama, pesan gagal yang menyitir ID, buku besar dua arah, test sabotase
   untuk tiap batas keamanan.
4. **Tenancy dan orkestrasi agen** (`T-`, `I-`, `O-`) — tenancy satu-satunya kelas yang tidak
   diturunkan dari kontrak dan wajib ditulis tangan di tiap repo; idempotensi untuk alur
   upload→stage→execute; pelajaran orkestrasi untuk proyek mana pun yang dikerjakan agen otonom.

Rincian tiap pilar dan **mengapa** ia berbentuk begitu ada di [`STANDARD.md`](STANDARD.md).

## Cara pasang

Salin folder ini ke proyek target, lalu ikuti [`INSTALL.md`](INSTALL.md): isi
`standard.config.json`, jalankan `standard doctor` sampai hijau, pasang gate dengan allowlist
kosong, pindahkan modul satu per satu. Ketat sejak hari pertama — bukan big-bang.

Dua bagian `INSTALL.md` yang tidak bisa disimpulkan dari kode dan karena itu wajib dibaca lebih
dulu: **tiga modul pihak ketiga yang generator tulis harfiah** ke dalam kode hasil
(`gin`, `gorm`, runtime `oapi-codegen` — prasyarat yang sengaja dipilih, bukan kelalaian), dan
**kontrak keempat paket platform** yang konsumen wajib tulis sendiri. Yang terakhir itu menyangkut
keamanan: `guard` adalah mesin otorisasinya, dan `Mount` yang dipasang sebagai adaptor tipis
membuang seluruh rantai izin sementara komentar di kode generated tetap menjanjikannya ada.

## Perintah di proyek target

Semuanya lewat `bin/standard`; tidak ada pemanggil yang memanggil biner alat langsung.

```bash
standard doctor                                   # config vs repo nyata
standard gen common                               # katalog permission, kode error, schema bersama
standard gen wiring --tag <TAG> --pkg <PKG>       # wiring rute + manifest isi satu tag
standard gen dto                                  # cermin dto privat per fitur
standard gen module --tag <TAG> --pkg <PKG>       # kerangka modul feature
standard freeze --pkg <PKG>                       # akhiri masa regenerasi sebuah modul
standard gate [--lapis contract|backend] [--only <langkah>]
```

**Dry-run adalah default**: tanpa `--apply` tak satu berkas pun ditulis.
`tooling/Makefile.template` membungkus perintah-perintah ini jadi target `make`, dan
`ci/*.yml.template` memasangnya sebagai workflow per lapis — keduanya disalin dan placeholder-nya
diisi saat pemasangan ([`INSTALL.md`](INSTALL.md)).

## Cara menguji paket ini

```bash
pnpm test              # suite paket ini: parsing aturan, lint, konfigurasi
./bin/standard rules-lint   # 0 temuan diharapkan
./bin/standard verify       # self-test penuh: enam tahap, semuanya dijalankan
./bin/standard verify --update-golden   # tulis ULANG golden, saat generatornya memang berubah
```

`standard verify` menjalankan seluruh pipa generator lewat sebuah proyek fixture kecil dan
membandingkan keluarannya dengan berkas golden — ini yang membuktikan tooling-nya jalan **lewat
config**, bukan cuma jalan di proyek asalnya. Enam tahapnya: `rules-lint`, paritas katalog pesan
(kunci **dan** nama variabel per kunci), `doctor` atas fixture, pipa fixture vs
`tooling/testdata/golden/`, **lari dwibahasa**, dan **pemindai nama asal + inventaris
`INSTALL.md`**.

Tahap terakhir itu ada karena tiga tahap sebelumnya pernah hijau bersama-sama untuk katalog yang
kalimatnya campur: kata bermuatan bahasa disuntikkan sebagai NILAI variabel, jadi keluaran
Inggrisnya berbunyi "nullable request bodies NAIK to 1" sementara paritas kunci DAN paritas nama
variabel keduanya lolos. Nilai variabel lahir di kode, bukan di katalog — satu-satunya penjaganya
adalah benar-benar menjalankan alat dan gate-nya dalam bahasa kedua lalu membaca keluarannya,
termasuk kalimat GAGAL-nya (fixture yang sehat tidak pernah merender kalimat gagal, jadi tahap ini
menyabotase salinan sementaranya sampai satu gate benar-benar merah).

Tahap keenam adalah pemindai portabilitas, dan ia ada di `verify` — bukan di suite — karena
pemeriksaan yang hanya hidup di suite paket ini tidak ikut terbawa ke salinan yang dipasang orang.
Ia melaporkan tiga hal: kemunculan nama proyek asal **di berkas mana pun, tanpa pengecualian**
(nol yang diharapkan); pengecualian pemindai yang tidak pernah dipakai (pemeriksaan yang diam-diam
tidak berjalan); dan ketiga inventaris `INSTALL.md` diadu **dua arah** dengan kenyataan yang
dipindai — modul pihak ketiga yang terpaku di sumber alat, simbol keempat paket platform yang generator
pancarkan, dan daftar placeholder template. Yang terpaku tanpa terdaftar adalah kejutan di mesin
pemakai; yang terdaftar tanpa terpaku adalah dokumen yang berbohong.

Tanpa `--update-golden`, `verify` tidak menulis satu berkas pun di luar direktori sementaranya.
Dengan bendera itu ia menulis ulang golden dan tetap keluar 0 — **diffnya yang jadi bahan review**,
jadi jangan menjalankannya untuk membuat merahnya hilang tanpa membaca apa yang berubah.

**Suite ini menuntut `git`, `make`, dan toolchain Go ada di mesin**, dan ketiganya gagal keras
kalau tidak ada — bukan dilewati. Alasannya sama untuk ketiganya: `git` membangun salinan paket
"terpasang" yang dipakai menguji apa yang benar-benar terkirim, `make` mengurai
`tooling/Makefile.template`, dan Go membangun kedua alat Go untuk membuktikan kode keluarnya lolos
utuh. Melewatinya berarti mengirim ketiga artefak itu tanpa pernah sekali pun dijalankan — dan
"tidak diperiksa" terlihat persis seperti "lulus". Ini syarat KONTRIBUTOR paket ini, bukan syarat
proyek yang memasangnya.

## Struktur ID

Delapan prefix, satu berkas per lapis — lihat [`rules/README.md`](rules/README.md). ID tidak
pernah dipakai ulang; aturan yang dicabut tetap di berkasnya, ditandai `USANG` beserta alasan dan
tanggal.
