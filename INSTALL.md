# Memasang `engineering-baseline` di proyek baru

Paket ini dipasang dengan **menyalin foldernya** ke proyek target — bukan lewat registry, bukan
lewat submodule. Yang kau salin adalah folder yang bisa dijalankan: aturan, generator, gate, dan
satu entry point (`bin/standard`).

Dokumen ini ditulis untuk orang yang **belum pernah melihat paket ini**. Tiap langkah punya
perintah yang bisa disalin apa adanya, dan tiap langkah punya cara membuktikan ia berhasil.

Ganti `<proyek>` di bawah dengan akar repo targetmu, dan `<paket>` dengan tempat paket ini mendarat
di dalamnya (rekomendasi: `<proyek>/standards/engineering-baseline`).

---

## 0. Sebelum mulai — prasyarat yang tidak bisa ditawar

Ada tiga kelompok, dan ketiganya **asumsi**: paket ini tidak bisa memeriksanya untukmu, dan kalau
salah satunya tidak terpenuhi kau akan menemukannya sebagai galat kompilasi, bukan sebagai gate
merah yang menjelaskan diri.

### 0.1 Toolchain

| Alat | Untuk apa |
|---|---|
| Node + pnpm | `bin/standard` adalah CLI TypeScript; **seluruh** subperintah menuntutnya, termasuk gate lapis backend |
| Go | kedua alat generator (`genmodule`, `gendto`) dan `go tool oapi-codegen` |
| `git`, `make` | template Makefile dan gate diff-kosong |

Jalankan `pnpm install` **di dalam folder paket** setelah menyalinnya — `bin/standard` mencari
`node_modules/.bin/tsx` relatif terhadap dirinya sendiri, bukan relatif terhadap proyekmu.

### 0.2 Tumpukan Go yang diandaikan generator

Generator paket ini menulis jalur modul pihak ketiga **harfiah** ke dalam kode yang ia pancarkan.
Itu keputusan yang diambil sadar, bukan kelalaian: bentuk pendaftaran modul (apa yang titik masuk
aplikasi oper ke `Register`) adalah keputusan APLIKASI, dan tidak ada tempat di kontrak maupun di
config yang bisa menurunkannya. Konsekuensinya harus kau baca sekarang, bukan kau simpulkan dari
gate yang hijau nanti:

<!-- inventaris: prasyarat-modul -->
| Modul | Terpaku di | Konsekuensi kalau tumpukanmu berbeda |
|---|---|---|
| `github.com/gin-gonic/gin` | keluaran `gen wiring` dan `gen module` | router selain Gin: tanda tangan `Mount`/`Register` dan grup rute harus disunting tangan di tiap modul |
| `gorm.io/gorm` | keluaran `gen module` | ORM selain GORM: parameter `db *gorm.DB` di `Register` harus diganti; ia hanya diteruskan, tidak dipakai generator |
| `github.com/oapi-codegen/runtime/types` | keluaran `gen dto` | tipe `openapi_types.*` (Date, UUID, …) di cermin DTO; ia datang dari runtime `oapi-codegen` yang memang wajib dipakai standar ini |
<!-- /inventaris -->

Daftar ini **diadu dengan sumber alat oleh `standard verify`** (tahap 6). Modul pihak ketiga baru
yang terpaku tanpa masuk daftar ini akan merah; entri di daftar ini yang tidak lagi terpaku di mana
pun juga merah. Kalau kau membaca daftar ini, kau membaca kenyataan — bukan niat.

### 0.3 Empat paket platform yang HARUS kau tulis sendiri

Lihat [§6](#6-kontrak-paket-platform). Ini bagian terpenting dokumen ini dan satu-satunya bagian
yang menyangkut **keamanan**; jangan menunda membacanya sampai kode hasilnya gagal kompilasi.

---

## 1. Salin folder, isi config, buat berkas yang config tunjuk

### 1.1 Salin dan pasang dependensinya

```bash
cp -R <paket-asal> <proyek>/standards/engineering-baseline
cd <proyek>/standards/engineering-baseline && pnpm install
cp tooling/config.example.json <proyek>/standard.config.json
export PATH="<proyek>/standards/engineering-baseline/bin:$PATH"
```

`standard.config.json` tinggal di **akar proyek target** (bukan di dalam folder paket) — semua
subperintah mencarinya ke atas dari direktori kerja. `PATH` di baris terakhir membuat sisa dokumen
ini bisa disalin apa adanya.

### 1.2 Isi tiap kunci config

Isi dengan tata letak proyekmu yang sungguhan. Yang paling sering salah:

| Kunci | Isi dengan |
|---|---|
| `layout.contractDir` / `backendDir` / `frontendDir` | jalur relatif akar proyek, mis. `packages/contract`, `apps/api`, `apps/web` |
| `go.modulePath` | direktif `module` di `go.mod` backend-mu, **persis** — `doctor` membandingkannya |
| `go.dtoconvPkg` | jalur paket `dtoconv`; **induknya** dipakai sebagai direktori lapis platform (§6) |
| `contract.shared.*` | nama keempat berkas schema bersama di `contract.sharedDir` — §1.3 membuatnya |
| `ledgers.*` | nama keempat buku besar, relatif `contractDir` — §3 membuatnya |
| `rules.docBase` | tempat aturan tinggal di proyekmu, untuk sitiran gate |

Tiga kunci sisanya **opsional**, dan bukan basa-basi: kalau kosong, gate yang membacanya berhenti
memeriksa apa pun alih-alih gagal, jadi isi ketiganya begitu proyekmu punya bentuknya.

| Kunci opsional | Isi dengan | Kalau kosong |
|---|---|---|
| `go.entrypoint` | jalur titik masuk aplikasi relatif `backendDir`, mis. `cmd/server/main.go` | gate rute tidak bisa membuktikan modulmu benar-benar terpasang; MERAH kalau direktori feature TIDAK kosong |
| `go.registrarType` | potongan sumber Go **harfiah** yang membuka daftar modul di titik masuk, mis. `[]server.FeatureRegistrar{` — salin dari kodemu, termasuk kurung kurawalnya | sama seperti di atas: gate rute kehilangan titik bacanya |
| `contract.permissionSeeds` | daftar berkas tempat baris permission DIBUAT (seeder/migrasi/fixture), relatif akar proyek | gate permission tidak bisa membuktikan tiap entri katalog bisa dipegang role; kosong + katalog TIDAK kosong = MERAH |

### 1.3 Buat keempat berkas schema bersama

**Ini langkah yang paling sering terlewat, dan ia yang menghentikanmu di hari pertama.**
`contract.shared.*` di config menunjuk empat berkas; `doctor` menuntut keempatnya ADA, dan
`gen common` membaca ketiganya untuk memancarkan katalog permission, katalog kode error, dan
schema bersama. Tak satu pun dibuat otomatis.

Templat minimal di bawah cukup untuk membuat **`doctor` hijau**. Ia **belum** cukup untuk
menjalankan `gen common`: perintah itu menuntut satu hal lagi yang tidak lahir di langkah mana pun
di atas — **bundel kontrak** di `contract.bundle`. Tanpanya `gen common` keluar **2** dengan
`ENOENT` pada jalur bundel itu, dan itu terukur, bukan dugaan. Bundel adalah artefak PROYEK yang
dibangun perintah proyekmu sendiri; §4 menyatakan prasyaratnya sebelum perintah pertama yang
membutuhkannya.

Contoh LENGKAP yang sudah terisi ada di
`tooling/testdata/fixture/packages/contract/openapi/_shared/` — buka empat berkas di sana kalau kau
ingin melihat bentuk yang sudah dipakai sungguhan.

```bash
mkdir -p <proyek>/<contractDir>/openapi/_shared
cd <proyek>/<contractDir>/openapi/_shared
```

<!-- berkas: envelope.yaml -->
```yaml
# envelope.yaml — bentuk sukses dan gagal TUNGGAL untuk seluruh respons JSON [[C-01]].
# Nama-nama di components.schemas inilah yang wajib kau daftarkan di `exclude-schemas`
# konfigurasi codegen per-tag (§7); `gen common` mencetak daftarnya untuk disalin.
components:
  schemas:
    EnvelopeStatus:
      type: string
      enum: [success]
    EnvelopeErrorStatus:
      type: string
      enum: [failed]
    EnvelopeSuccess:
      type: object
      required: [status, message, data]
      properties:
        status:
          $ref: "#/components/schemas/EnvelopeStatus"
        message:
          type: string
        data: {}
        metaData:
          $ref: "#/components/schemas/EnvelopeMeta"
    EnvelopeError:
      type: object
      required: [status, code, message]
      properties:
        status:
          $ref: "#/components/schemas/EnvelopeErrorStatus"
        code:
          type: string
        message:
          type: string
        errors:
          type: array
          items:
            type: object
            required: [field, message]
            properties:
              field:
                type: string
              message:
                type: string
    Pagination:
      type: object
      required: [page, limit, total, totalPages]
      properties:
        page: { type: integer, minimum: 1 }
        limit: { type: integer, minimum: 1 }
        total: { type: integer, minimum: 0 }
        totalPages: { type: integer, minimum: 0 }
    EnvelopeMeta:
      type: object
      required: [pagination]
      properties:
        pagination:
          $ref: "#/components/schemas/Pagination"
```

<!-- berkas: permissions.yaml -->
```yaml
# permissions.yaml — katalog permission TERTUTUP [[C-03]]. Nama baru wajib pola <DOMAIN>_<AKSI>;
# nama warisan yang melanggar pola didaftar di legacyNames, terpisah, supaya yang lama tidak
# memaksa yang baru ikut salah bentuk.
permissions: []
legacyNames: []
```

<!-- berkas: errors.yaml -->
```yaml
# errors.yaml — katalog kode error TERTUTUP, dua lapis [[C-02]]: generik lintas domain, dan
# spesifik domain berpola <DOMAIN>_<ALASAN>.
generic:
  - VALIDATION_ERROR
  - UNAUTHENTICATED
  - FORBIDDEN
  - CONFLICT
domain: []
```

<!-- berkas: public-operations.yaml -->
```yaml
# public-operations.yaml — buku besar operasi publik [[C-03]], dua arah: operasi ber-`security: []`
# eksplisit WAJIB terdaftar di sini, dan yang terdaftar di sini wajib benar-benar publik.
# KOSONG adalah bentuk yang benar untuk proyek yang belum punya endpoint publik.
publicOperations: []
```

Ketiga katalog boleh **kosong** di hari pertama dan itu bentuk yang benar — sama alasannya dengan
allowlist kosong di §3: nol entri berarti nol yang bisa gagal, dan tiap entri masuk lewat pintu
depan. `envelope.yaml` yang kosong TIDAK sah, karena `gen common` memancarkan schema bersama
darinya.

### 1.4 Jalankan `doctor` — dan baca apa yang WAJAR masih merah

```bash
cd <proyek> && standard doctor
```

`doctor` memeriksa config **terhadap repo yang sungguhan**: direktori yang tidak ada, berkas yang
ternyata direktori, `go.mod` yang modulnya berbeda dari `go.modulePath`, dan — begitu kau memasang
CI di langkah 3 — blok `paths:` workflow yang tidak cocok dengan `layout.*`.

**Ia belum hijau di sini, dan itu bukan kegagalanmu.** Dua hal yang `doctor` tuntut baru lahir di
langkah berikutnya, jadi urutan dokumen ini menjamin langkah 1 berakhir merah. Yang harus kau
periksa bukan "nol temuan", melainkan bahwa temuan yang tersisa **persis** yang di bawah:

| Sesudah langkah | Sisa temuan `doctor` | Isinya |
|---|---|---|
| 1 | **5** | 4 buku besar (`ledgers.*`) + `idempotency.uuidNamespace` masih nilai contoh |
| 2 | **4** | keempat buku besar saja |
| 3 | **0** | hijau — dan mulai titik ini "nol temuan" adalah kriteria yang sah |

Temuan lain apa pun di langkah 1 — direktori layout yang tidak ada, `go.mod` yang tidak cocok,
berkas schema bersama yang belum kau buat — adalah temuan sungguhan. Perbaiki dulu; jangan
melanjutkan ke langkah 2 dengan daftar yang lebih panjang dari lima baris itu.

## 2. Cetak namespace UUID proyekmu sendiri

```bash
python3 -c "import uuid; print(uuid.uuid4())"
```

Tempel hasilnya ke `idempotency.uuidNamespace`. **`doctor` menolak selama nilainya masih
`REPLACE-ME`**, dan penolakan itu disengaja: namespace adalah bagian dari ID konten yang
deterministik, jadi dua proyek yang memakai namespace yang sama akan memancarkan ID yang sama untuk
baris yang berbeda. Namespace ini **tidak pernah berubah lagi** setelah baris pertama ditulis —
mengubahnya membuat setiap ID lama tidak bisa dihitung ulang.

```bash
standard doctor   # sisa 4: keempat buku besar, yang lahir di langkah 3
```

## 3. Pasang gate — dengan allowlist KOSONG

```bash
mkdir -p <proyek>/.github/workflows
cp <paket>/ci/contract-gate.yml.template <proyek>/.github/workflows/contract-gate.yml
cp <paket>/ci/backend-gate.yml.template  <proyek>/.github/workflows/backend-gate.yml
cp <paket>/ci/frontend-gate.yml.template <proyek>/.github/workflows/frontend-gate.yml
cp <paket>/tooling/Makefile.template     <proyek>/Makefile      # atau gabungkan isinya
```

Buang akhiran `.template` (sudah dilakukan di perintah di atas), lalu isi **keenam** placeholder.
Tidak tiga — enam:

<!-- inventaris: placeholder -->
| Placeholder | Isi dengan |
|---|---|
| `NODE_VERSION` | versi Node, mis. `24` |
| `PNPM_VERSION` | versi pnpm, mis. `10.11.0` |
| `GO_VERSION` | versi Go, mis. `1.26` |
| `CONTRACT_DIR` | `layout.contractDir` dari `standard.config.json` |
| `BACKEND_DIR` | `layout.backendDir` dari `standard.config.json` |
| `FRONTEND_DIR` | `layout.frontendDir` dari `standard.config.json` |
<!-- /inventaris -->

Tiga yang terakhir dipakai di dalam blok `paths:`, dan itu yang membuat mereka berbahaya. Ada dua
cara gagal, dan **keduanya menghasilkan workflow yang tidak pernah terpicu**:

- **placeholder tertinggal** — langkah pertama tiap workflow memindainya, dan `paths:` memuat
  `.github/workflows/**` supaya PR pemasangan memicu dirinya sendiri;
- **placeholder terisi SALAH** — `{{BACKEND_DIR}}` diisi `app/api` padahal direktorinya `apps/api`.
  Pemindai placeholder lolos (memang tidak ada placeholder tersisa), workflow-nya hijau, dan
  hijaunya berarti "tidak pernah berjalan". Salah ketik satu direktori jauh lebih mungkin daripada
  lupa mengisi enam placeholder sekaligus — karena itu **`standard doctor` membandingkan `paths:`
  workflow terpasang dengan `layout.*`**, dan itulah alasan langkah berikut ada:

```bash
standard doctor   # jalankan LAGI sesudah workflow terpasang
```

Sekarang isi buku besarnya, semuanya dengan daftar **kosong**:

```bash
cd <proyek>/<contractDir>
echo '{"tags":[]}'    > envelope-opt-in.json      # nama berkas dari ledgers.* di config-mu
echo '{"modules":[]}' > mounted-modules.json
echo '{"routes":[]}'  > routes.json
echo '{"coverage":[]}'> coverage.json
```

Kosong = **ketat sejak hari pertama tanpa memerahkan satu pun modul lama**. Gate opt-in hanya
memeriksa nama yang terdaftar; nol nama berarti nol pemeriksaan yang bisa gagal, dan tiap modul
masuk lewat pintu depan di langkah 4. Ini yang membuat proyek berjalan tidak perlu big-bang.

```bash
cd <proyek> && standard doctor   # SEKARANG harus hijau — nol temuan
```

Ini titik pertama di mana "nol temuan" adalah kriteria yang sah. Kalau ia masih merah di sini,
bandingkan nama berkas yang `doctor` sebut dengan `ledgers.*` di config-mu: perintah `echo` di atas
memakai nama BAWAAN, dan config-mu boleh memakai nama lain.

Isi juga `TAGS` di `backend-gate.yml` begitu tag pertamamu ada — daftar tag kosong membuat langkah
`gate:generated-sync` meregenerasi nol berkas lalu melapor diff kosong, dan workflow itu menolaknya
alih-alih melapor hijau.

## 4. Pindahkan modul satu per satu

### 4.0 Prasyarat: bundel kontrak

**Perintah pertama di bawah tidak akan jalan tanpa ini**, dan paket standar sengaja tidak
menyediakannya: bundel adalah artefak PROYEK, dibangun **perintah proyekmu sendiri**. Yang paket ini
tetapkan hanya bentuknya:

- satu dokumen **OpenAPI 3.0.3** (bukan 3.1 — `oapi-codegen`/`kin-openapi` hanya mendukung 3.0),
- seluruh `$ref` antar-berkasnya sudah **disatukan**,
- tersimpan **persis** di jalur yang `contract.bundle` sebut, relatif `layout.contractDir`.

Konvensi yang dipakai template CI-nya (`PERINTAH_BUNDLE`, lihat `ci/contract-gate.yml.template`)
adalah satu skrip proyek; fixture paket ini memakai `redocly`, dan bentuknya bisa disalin:

```bash
cd <proyek>/<contractDir>
pnpm exec redocly bundle openapi/openapi.yaml -o dist/openapi.bundled.yaml
```

Bundelnya **di-commit** — `gen wiring`, `gen dto`, dan setiap gate membacanya dari checkout, bukan
membangunnya sendiri. Karena itu workflow kontrak meregenerasinya lalu menuntut `git diff` KOSONG:
bundel basi berarti gate memeriksa kontrak kemarin.

Bukti bahwa prasyarat ini benar-benar yang kurang, dan bahwa ia CUKUP: dengan keempat berkas §1.3
saja `standard gen common` keluar **2** (`ENOENT` pada `contract.bundle`); dengan bundel di
tempatnya, perintah yang sama keluar **0**. Keduanya diikat uji, bukan dijanjikan di sini.

### 4.1 Satu modul, satu perubahan

Tiap perubahan menambah **tepat satu** nama ke daftar opt-in **dan** memindahkan kodenya — tidak
pernah salah satunya saja `[[G-02]]`.

```bash
standard gen common                                  # katalog permission, kode error, schema bersama
standard gen wiring --tag <TAG> --pkg <PKG>          # wiring rute + manifest isi satu tag
standard gen dto                                     # cermin dto privat per fitur
standard gen module --tag <TAG> --pkg <PKG>          # kerangka modul feature
# tulis lapis kueri tangan (batas penyewa hidup di sini, [[T-01]]) — lalu:
standard freeze --pkg <PKG>
standard gate
```

**Dry-run adalah default**: perintah di atas tidak menulis satu berkas pun sampai kau menambahkan
`--apply`. `skills/tambah-endpoint/` adalah prosedur lengkapnya, dan ia **berhenti di gate merah
pertama** alih-alih melanjutkan.

Menambah nama ke daftar opt-in tanpa memindahkan kodenya membuat gate hijau atas modul yang tidak
pernah pindah; memindahkan kode tanpa menambah namanya membuat modul yang pindah tidak pernah
diperiksa. Keduanya adalah utang yang terlihat seperti kemajuan.

## 5. Seed berkas instruksi agen dengan PENUNJUK, bukan salinan

Proyekmu punya berkas instruksi agen (`CLAUDE.md`, `AGENTS.md`, atau apa pun namanya). Isi dengan
**penunjuk** ke `rules/`, bukan salinan aturannya `[[G-01]]`:

```markdown
## Aturan rekayasa yang mengikat
Aturan ber-ID tinggal di `standards/engineering-baseline/rules/`. Baca sebelum kerja lapis:
| Berkas | Lapis |
|---|---|
| `rules/S-sumber-kebenaran.md` | rantai sumber kebenaran |
| `rules/C-kontrak.md` | kontrak |
| `rules/B-backend.md` | backend |
| `rules/W-frontend.md` | frontend |
| `rules/G-gate.md` | gate |
| `rules/T-tenancy.md` | tenancy |
| `rules/I-idempotensi.md` | idempotensi |
| `rules/O-orkestrasi-agen.md` | orkestrasi agen |
Sitir ID-nya (`C-04`, `G-02`, `T-01`) di commit, PR, dan pesan gate.
```

Salinan **akan** menyimpang dari aslinya, dan yang menyimpang tanpa suara adalah kelas cacat yang
seluruh paket ini ada untuk melawannya. Satu sumber, banyak penunjuk.

---

## 6. Kontrak paket platform

`gen wiring` dan `gen module` memancarkan kode yang memanggil **empat paket yang kau tulis
sendiri**. Generator tidak pernah menuliskannya untukmu, dan itu disengaja: seluruh logika
otorisasi hidup di sana, ditulis tangan dan diuji **sekali**, alih-alih digandakan sebanyak jumlah
tag oleh generator.

Letaknya diturunkan dari `go.dtoconvPkg` di config: **induk** dari jalur itu adalah direktori lapis
platform. Kalau `go.dtoconvPkg` = `internal/platform/dtoconv`, keempatnya tinggal di
`internal/platform/{appcontext,dtoconv,guard,httpx}`.

> **Peringatan keamanan — baca sebelum menulis `Mount`.**
>
> Godaan terbesar saat memasang paket ini adalah menyediakan `Mount` sebagai adaptor tipis:
>
> ```go
> // JANGAN. Ini membuang split publik/protected DAN seluruh rantai izin.
> func Mount(public, protected *gin.RouterGroup, impl StrictServerInterface) {
> 	RegisterHandlers(protected, NewStrictHandler(impl, nil))
> }
> ```
>
> Bentuk itu meng-compile, semua rutenya menjawab, dan setiap testmu hijau — sementara
> `RequireSession`, `RequirePermissionForRoute`, dan peta `SpecByRoute` **tidak pernah dipasang**.
> Komentar yang generator tulis ke `register.gen.go` tetap berbunyi "seluruh wiring permission
> berasal dari kontrak"; kalimat itu lalu jadi kebohongan, dan kebohongannya mengarah ke sisi yang
> salah.
>
> `Mount` bukan sekadar tanda tangan yang harus ada. Ia punya **kewajiban**, dan keempatnya
> mengikat: (1) rute publik dan rute terjaga dipasang ke grup yang BERBEDA; (2) grup terjaga
> memasang `guard.RequireSession`, `guard.RequirePermissionForRoute(...)`, dan
> `guard.BufferJSONBody`; (3) middleware strict-handler memasang `guardByOperation` (dan
> `contentByOperation` bila manifest isi aktif); (4) hook galat diarahkan ke `httpx.*ErrorV2`
> supaya badan galatnya seragam. Bentuk yang benar ada apa adanya di keluaran `gen wiring` —
> **baca `wiring.gen.go` yang ia tulis, lalu sediakan paket yang membuatnya jalan.** Jangan
> menulis `Mount` sendiri.

### Kolom mana yang dijaga mesin, dan kolom mana yang tidak

Bacalah ini sebelum keempat tabel di bawah, karena ketiga kolomnya **tidak sama derajat
kepercayaannya** — dan menyamakannya adalah persis kesalahan yang [[O-01]] namai: dokumen tidak
menahan, gate yang menahan.

| Kolom | Dijaga apa | Kalau salah |
|---|---|---|
| **Simbol** | `standard verify` tahap 6, **dua arah** | simbol yang dipancarkan generator tapi tak masuk tabel = MERAH; simbol di tabel yang tak lagi dipancarkan = MERAH |
| **Bentuk** (tanda tangan Go) | **tidak ada** | tanda tangan yang salah tulis terbaca sebagai kebenaran sampai kau mengompilasi kode platform-mu sendiri |
| **Kewajiban** | **kehadirannya saja** — baris tanpa kolom ini MERAH | isi kalimatnya tidak diperiksa siapa pun |

Batas itu nyata dan tidak disembunyikan: memverifikasi tanda tangan atau kewajiban menuntut
mengompilasi paket platform yang justru **belum kau tulis** — paket ini tidak punya jalan ke sana.
Yang bisa dilakukannya sudah dilakukan (nama simbolnya ber-gate, kehadiran kewajibannya ber-gate,
dan satu kewajiban yang punya jejak di paket ini — bahwa generator benar-benar MENYERAHKAN sinyal
"tidak ditemukan" ke `guard.Allow` — diikat uji tersendiri). Sisanya bergantung pada kau
membacanya.

Kalimat paling menanggung-beban di seluruh dokumen ini ada di kolom yang paling lemah
penjagaannya: **`found == false` WAJIB menolak**. Jangan lewati barisnya.

Simbol di keempat tabel di bawah adalah **yang benar-benar dipancarkan generator**, diadu dengan
sumber alat oleh `standard verify` tahap 6.

### `guard` — mesin otorisasi

Yang terbesar dari keempatnya, dan bukan util kecil: di sinilah keputusan "boleh atau tidak"
diambil. `SpecByOperation`/`SpecByRoute` yang generator tulis hanyalah DATA; yang membacanya dan
menolak permintaan adalah paket ini.

<!-- inventaris: platform:guard -->
| Simbol | Bentuk | Kewajiban |
|---|---|---|
| `RouteSpec` | `type RouteSpec struct { OperationID string; AuthOnly bool; Perms []gen.Permission }` | tipe data yang generator isi; `AuthOnly` = cukup bersesi, `Perms` = butuh izin |
| `Allow` | `func Allow(c *gin.Context, spec RouteSpec, found bool) bool` | **`found == false` WAJIB menolak** — operasi yang tak ada di peta adalah operasi yang belum diputuskan, bukan operasi yang bebas |
| `RequireSession` | `gin.HandlerFunc` | menolak permintaan tanpa sesi sah sebelum handler mana pun jalan |
| `RequirePermissionForRoute` | `func RequirePermissionForRoute(basePath string, byRoute map[string]RouteSpec) gin.HandlerFunc` | penjaga lapis rute: menegakkan izin dari `METHOD /path`, sebelum badan permintaan disentuh |
| `BufferJSONBody` | `gin.HandlerFunc` | menyangga badan JSON supaya bisa dibaca lebih dari sekali (guard lalu validasi isi lalu binding) |
| `RestoreBody` | `func RestoreBody(c *gin.Context)` | mengembalikan badan yang sudah disangga sebelum pembaca berikutnya |
| `LowerFirst` | `func LowerFirst(s string) string` | menormalkan `operationID` dari generator ke kunci peta |
| `JoinPath` | `func JoinPath(base, p string) string` | menggabungkan base path grup dengan path operasi untuk daftar path v2 |
<!-- /inventaris -->

`Allow` mengembalikan `false` **dan sudah menulis responsnya sendiri** — kode generated hanya
`return nil, nil` sesudahnya. Kalau implementasimu mengembalikan `false` tanpa menulis respons,
kliennya menerima 200 kosong untuk permintaan yang ditolak.

### `httpx` — bentuk respons dan galat

<!-- inventaris: platform:httpx -->
| Simbol | Bentuk | Kewajiban |
|---|---|---|
| `RenderFailureV2` | hook `HandlerErrorFunc` | merender galat handler jadi badan galat berbentuk amplop |
| `RequestBindErrorV2` | hook `RequestErrorHandlerFunc` | galat binding badan permintaan |
| `ResponseSerializeErrorV2` | hook `ResponseErrorHandlerFunc` | galat serialisasi respons |
| `ParamBindErrorV2` | `ErrorHandler` untuk `ServerInterfaceWrapper` | galat binding parameter path/query |
| `RegisterV2Paths` | `func RegisterV2Paths(paths ...string)` | mendaftarkan path yang memakai amplop v2 |
| `Pagination` | `type Pagination struct { ... }` | bentuk paginasi bersama; `gen module` membaca tipe `metaData` dan menuntut bentuk ini |
| `ParseBodyObject` | `func ParseBodyObject(c *gin.Context) (map[string]any, bool, bool)` | mengurai badan JSON jadi objek mentah untuk validasi isi |
| `ContentField` | `type ContentField struct { Name string; Required, Nullable bool; Kind Kind; Children []ContentField; Items *ContentField }` | manifest satu field; generator memancarkan literalnya |
| `ContentIssues` | `func ContentIssues(raw map[string]any, fields []ContentField) []Issue` | memeriksa badan mentah terhadap manifest |
| `FieldValidationError` | `type FieldValidationError struct { Message string; Fields []Issue }` | galat validasi isi, dirender jadi 422 berbutir |
| `Kind` | `type Kind int` + konstanta `KindString`, `KindNumber`, `KindBool`, `KindObject`, `KindArray`, … | jenis field; generator memancarkan `httpx.Kind<Jenis>` dari nama jenis di kontrak |
| `PesanValidasi` | `const PesanValidasi = "..."` | pesan tunggal untuk galat validasi isi |
<!-- /inventaris -->

### `appcontext` — konteks permintaan

<!-- inventaris: platform:appcontext -->
| Simbol | Bentuk | Kewajiban |
|---|---|---|
| `AppContext` | `type AppContext struct { ... }` | konteks permintaan (identitas, penyewa, jejak) yang setiap metode service dan repository terima sebagai parameter PERTAMA |
| `From` | `func From(c *gin.Context) *AppContext` | mengambilnya dari konteks Gin di lapis handler |
<!-- /inventaris -->

`AppContext` di **setiap** metode bukan gaya penulisan, ia syarat keamanan: batas penyewa hidup di
predikat kueri, dan predikat itu tidak bisa ditulis tanpa konteks yang membawa penyewanya
`[[T-01]]`.

### `dtoconv` — konversi antar bentuk

<!-- inventaris: platform:dtoconv -->
| Simbol | Bentuk | Kewajiban |
|---|---|---|
| `Ptr` | `func Ptr[T any](v T) *T` | nilai ke pointer |
| `Slice` | `func Slice[A, B any](in []A, f func(A) B) []B` | memetakan slice lewat fungsi konversi |
| `Map` | `func Map[K comparable, A, B any](in map[K]A, f func(A) B) map[K]B` | memetakan map lewat fungsi konversi |
<!-- /inventaris -->

---

## 7. Konvensi generasi yang harus kau ikuti

- **`gen common` adalah prasyarat keras, bukan saran.** `gen wiring` mengalias schema envelope
  bersama ke paket `common` alih-alih menuliskannya ulang per tag. Kalau config codegen tag-mu
  memakai `output-options.exclude-schemas`, generasinya benar secara sintaks bahkan kalau
  `gen common` belum pernah jalan — tapi `dist/openapi.shared.yaml`, satu-satunya sumber paket
  `common` itu sendiri, **hanya** ditulis oleh `gen common`. Diukur: tanpa urutan ini, proyek
  menabrak `Pagination redeclared` begitu tag KEDUA yang memakai `exclude-schemas` dibangkitkan.
- **`exclude-schemas` wajib berisi nama yang SAMA dengan `components.schemas` di berkas envelope
  bersamamu.** Kalau tidak, paket generated tag itu punya dua deklarasi untuk nama yang sama (satu
  lokal dari `oapi-codegen`, satu alias dari `gen wiring`) dan Go menolaknya. `gen common` mencetak
  daftar yang harus disalin ke sana.
- **`metaData` yang membawa paginasi tetap PER-TAG.** `gen module` membaca tipe `metaData` dari
  paket generated tag itu sendiri dan tidak mengikuti alias lintas paket; `metaData` yang
  dialiaskan ke `common` membuat regenerasi ditolak.
- **Paket `common` sendiri dibangkitkan lewat target yang sama** dengan `TAG=common` dan bundel
  diarahkan ke `dist/openapi.shared.yaml`. Config codegen-nya wajib `output-options.skip-prune:
  true` — dokumen sumbernya sengaja `paths: {}`, dan tanpa itu generator memangkas semuanya.

---

## 8. Seluruh folder ikut disalin — dan nol jejak proyek asal

**Tidak ada berkas yang dikecualikan.** Salin foldernya utuh; setiap berkas di dalamnya memang untuk
dibawa, dan tidak ada saringan di mana pun yang bisa menciutkannya diam-diam.

**Nol jejak proyek asal, tanpa satu pun pengecualian berkas.** Paket ini tidak menyebut proyek,
organisasi, mesin, atau jalur tempat ia dibangun — di berkas mana pun. Yang menjaganya **gate**
(`standard verify` tahap 6), bukan review: pemindainya menelusuri seluruh folder dan hanya
melewatkan tiga direktori yang memang bukan milik paket — `node_modules`, `.git`, `dist`. Setiap
berkas lain dipindai, termasuk berkas pemindainya sendiri.

Kalau kau menambahkan dokumen ke folder ini, ia ikut dipindai sejak berkasnya ada. Tidak ada daftar
kebal untuk ditambahi.

## 9. Apa yang di-commit di proyek target

Keputusan pemakai; ini rekomendasinya.

| Bagian | Rekomendasi | Alasan |
|---|---|---|
| `tooling/` | **ikut di-commit** | generator dan skrip gate; CI menjalankannya |
| `ci/` | **ikut di-commit** (versi terisi ada di `.github/workflows/`) | supaya placeholder yang diisi bisa direview |
| `skills/` | **ikut di-commit** | prosedur agen; ia membaca config proyekmu |
| `bin/`, `src/` | **ikut di-commit** | `bin/standard` adalah entry point yang dipanggil Makefile dan CI |
| `rules/` | ikut di-commit **atau** dirujuk dari salinan induk | keduanya sah; yang tidak sah adalah menyalin ISI aturannya ke berkas lain (§5) |

Kalau kau memilih merujuk `rules/` dari salinan induk alih-alih men-commit-nya, ingat bahwa pesan
gate menyitir ID aturan: pembaca pesan itu harus bisa menemukan aturannya. Isi `rules.docBase` di
config dengan tempat aturan benar-benar bisa dibaca oleh orang di proyekmu.

---

## 10. Membuktikan pemasangannya benar

```bash
standard doctor                    # config vs repo nyata, termasuk paths: workflow vs layout.*
standard gate                      # seluruh gate; 0 = lulus, 1 = pelanggaran, 2 = ALATNYA gagal
cd <paket> && ./bin/standard verify   # self-test PAKET-nya sendiri, bukan proyekmu
```

Bedanya penting: `doctor` dan `gate` memeriksa **proyekmu**; `verify` memeriksa **paket ini** —
enam tahap, termasuk menjalankan seluruh pipa generator atas proyek fixture dan membandingkannya
dengan berkas golden. Kalau `verify` merah sesudah kau menyunting sesuatu di dalam folder paket,
yang rusak adalah standarnya, bukan proyekmu.
