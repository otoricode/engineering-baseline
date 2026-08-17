---
name: tambah-endpoint
description: Alur "tambah endpoint/handler baru" dari kontrak sampai gate, dijalankan sebagai prosedur (driver.sh) — bukan prosa. Berhenti di langkah merah pertama.
---

# tambah-endpoint

## Kapan dipakai

Setiap kali kau menambah operasi baru ke kontrak, atau mengubah bentuk operasi yang sudah ada
(request/response, permission, path) — di proyek mana pun yang sudah memasang paket standar ini
(`standard doctor` hijau, lihat `INSTALL.md`). Jangan mulai menulis kode handler dengan tangan
sebelum kontraknya berubah dan digenerate; itu membalik arah rantai turunan `[[S-01]]`.

Prasyarat: `standard.config.json` terisi dan `standard doctor` sudah hijau. Kalau belum, urus itu
dulu — setiap langkah di bawah membaca config yang sama, dan config yang salah membuat langkah
pertama gagal karena alasan yang menyalahkan kontrak padahal masalahnya pemasangan.

## Urutan tujuh langkah

`driver.sh <langkah>` menjalankan satu langkah pada satu waktu dan **berhenti** di langkah merah
pertama — melanjutkan sesudah gate merah berarti membangun di atas basis yang sudah diketahui
salah. Dua langkah (1 dan 4) sengaja **tidak** punya subperintah driver: keduanya kerja tangan,
bukan sesuatu yang bisa dijalankan mesin.

| # | Langkah | Perintah | Verifikasi |
|---|---|---|---|
| 1 | Ubah kontrak (operasi/schema OpenAPI) | tangan, di `packages/contract` (atau `layout.contractDir` proyekmu) | — |
| 2 | Bundle kontrak | `driver.sh bundle` | keluar 0; keluar 1 kalau bundel ter-commit basi (regenerasi menghasilkan diff) |
| 3a | Generate server (per tag) | `make gen-go TAG=<tag>` — **di luar `driver.sh`**, lihat "Kenapa server bukan langkah driver" | `git diff --exit-code` di `layout.backendDir` |
| 3b | Generate wiring (peta guard + `Mount`) | `driver.sh wiring --tag <TAG> --pkg <PKG>` | `standard gen wiring` — dry-run bawaan, `--apply` untuk menulis |
| 3c | Scaffold kerangka modul | `driver.sh scaffold --tag <TAG> --pkg <PKG>` | `standard gen module` — dry-run bawaan, `--apply` untuk menulis |
| 3d | Generate cermin DTO | `driver.sh gen` | `standard gen dto` — dry-run bawaan, `--apply` untuk menulis |
| 4 | Tulis lapisan query tangan | tangan, di modul yang baru di-scaffold | **tidak ada** subperintah — lihat larangan `[[T-01]]` di bawah |
| 5 | Freeze modul | `driver.sh freeze --pkg <PKG>` | `standard freeze` — akhiri masa regenerasi modul ini |
| 6 | Jalankan seluruh gate | `driver.sh gate` | `standard gate` |

**3b (wiring) sebelum 3c/3d, dan posisinya bukan selera.** `gen wiring` menulis KE DALAM paket
generated (`go.genDir/<pkg>/wiring.gen.go` + `shared.gen.go` — bukan ke direktori fitur), jadi ia
konseptual satu kelompok dengan 3a (menyiapkan paket generated), bukan dengan 3c (menyiapkan
lapis fitur). `register.gen.go` yang `standard gen module` bangkitkan di 3c memanggil
`<pkg>gen.Mount(...)` — sebelum langkah ini ada di urutan resmi, panggilan itu menunjuk fungsi
yang tidak pernah dibangkitkan siapa pun. Diukur (Task 13 fix round 4, `impl-t13`): sebelum
perbaikan ini, **nol** kemunculan `gen wiring` di seluruh `skills/` — padahal subperintahnya ADA
(`standard gen wiring`) dan target Makefile-nya ADA (`tooling/Makefile.template:102-106`); yang
hilang bukan artefak, satu LANGKAH dari pipa resmi.

**Batasan yang diketahui, belum tertutup (Task 13 fix round 4):** `wiring.gen.go`/`shared.gen.go`
mengalias schema envelope bersama ke paket `common` — dan itu VALID hanya kalau config codegen
per-tag (3a) dikonfigurasi `-import-mapping` supaya oapi-codegen TIDAK ikut men-generate ulang
schema yang sama secara lokal. Tanpa konfigurasi itu (belum ada template/dokumentasinya di paket
ini), paket generated punya DUA deklarasi utuk nama yang sama (mis. `EnvelopeMeta`) — satu struct
lokal dari 3a, satu alias dari 3b — yang gagal kompilasi, DAN `standard gen module` (3c) menolak
regenerasi untuk operasi ber-metaData wajib dengan pesan `EnvelopeMeta bukan lagi struct { Pagination
... }` (genmodule hanya membaca SATU direktori paket generated; ia tidak mengikuti alias lintas
paket ke `common`). **Untuk tag dengan operasi berpaginasi, `driver.sh semua` KELUAR 2 di langkah
scaffold (3c) selama batasan ini belum ditutup** — diukur langsung: dijalankan atas tag baru
(direktori fiturnya sengaja dihapus), wiring (3b) sukses, scaffold (3c) langsung gagal dengan
pesan di atas. Menutupnya menuntut baik konfigurasi `-import-mapping` yang benar (di luar paket
ini, milik proyek) MAUPUN kemampuan `genmodule` membaca lintas paket (belum ada) — dua pekerjaan
terpisah, tidak dikerjakan di ronde ini.

`driver.sh semua` merangkai `bundle -> wiring -> scaffold -> gen -> gate` (langkah 2, 3b, 3c, 3d,
6) dalam satu panggilan. **`freeze` sengaja tidak ikut** — itu keputusan manusia (modul sudah
benar-benar dikawinkan tangan atau belum), bukan sesuatu yang boleh otomatis lulus karena gate
lain hijau. Langkah 1, 3a, dan 4 juga tidak ikut `semua`, dengan alasan yang berbeda-beda: 1 dan 4
kerja tangan; 3a butuh `--tag` per operasi dan config codegen milik proyek yang tidak seragam
antar proyek (lihat di bawah).

### Kenapa server bukan langkah driver

`standard` sengaja tidak membungkus `go tool oapi-codegen`: config codegen-nya (`OAPI_CONFIG` di
`tooling/Makefile.template`) satu berkas **per tag**, milik proyek, bukan bagian
`standard.config.json`. Jalur resminya `make gen-go TAG=<tag>` — pakai `go tool`, BUKAN
`go run <modul>@versi`, supaya versi generator dipaku direktif `tool` di `go.mod` proyek dan
setiap mesin memancarkan hasil yang sama untuk kontrak yang identik.

### Kenapa `bundle` tidak lewat `standard gate`

Bundling kontrak (mis. `redocly bundle`) juga milik proyek, bukan alat paket ini — sama seperti
`gen-go`. `driver.sh bundle` menjalankannya lewat `$PERINTAH_BUNDLE` (bawaan
`pnpm run contract:bundle`, bisa dioverride lewat env), lalu menuntut diff kosong terhadap yang
sudah ter-commit — pola yang sama dengan `gate:generated-sync`.

## Larangan keras

- **Jangan menyunting artefak generated dengan tangan** (keluaran langkah 2/3a/3b/3d). Kalau
  keluarannya salah, perbaiki SUMBERNYA (kontrak) lalu regenerasi; menyunting hasilnya langsung
  membuat regenerasi berikutnya menghapus perbaikanmu tanpa peringatan. Cakupan persis apa yang
  terhitung "generated" ada di `[[B-03]]`.
- **Jangan menulis atau menyalin lapisan query (langkah 4) seolah ia bisa digenerate.** Ini
  satu-satunya lapis yang wajib ditulis tangan di tiap repository; alasannya, dan kenapa
  generator yang menyentuhnya dianggap mengarang batas keamanan, ada di `[[T-01]]`.
- **Jangan mengedit daftar opt-in (allowlist gate) dengan cara apa pun selain menambah tepat
  satu entri sekaligus memindahkan kodenya.** Bentuk yang salah, dan kenapa menambah nama tanpa
  memindahkan kodenya membuat daftarnya berbohong, ada di `[[G-02]]`.

## Kalau gate merah

Baca **ID aturan** di pesan gagalnya, buka aturannya di `rules/` (bukan `STANDARD.md` atau
`AGENTS.md` — keduanya cuma menunjuk, isinya cuma di `rules/`), lalu perbaiki apa yang aturan itu
sebutkan. Jangan menebak dari nama gate-nya atau dari nama langkahnya di driver ini — nama gate
dan judul aturan tidak selalu satu-satu, dan tebakan yang masuk akal tetap bisa salah alamat.

Bedakan juga **kode keluar** langkahnya sebelum mencari-cari: `driver.sh` mencetak `MERAH` untuk
kode 1 (pemeriksaan berjalan dan menemukan pelanggaran — perbaiki kontrak/kode) dan `GAGAL` untuk
kode lain (alatnya sendiri tidak jalan — pemeriksaan TIDAK berjalan sama sekali, perbaiki
pemasanganmu: config, toolchain, path). Mencari pelanggaran kontrak yang sebetulnya tidak pernah
diperiksa membuang waktu di tempat yang salah.
