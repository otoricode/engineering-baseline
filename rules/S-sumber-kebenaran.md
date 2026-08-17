# S — Sumber kebenaran

Siapa yang berwenang atas bentuk data, ke mana arah perbaikan saat dua lapis berselisih, dan
apa artinya sebuah komponen berstatus arsip.

---

## S-01 · Rantai sumber kebenaran berarah dan tertulis

**Ditegakkan oleh:** manual-review-only — tidak ada artefak tunggal yang bisa dibandingkan mesin; yang diperiksa adalah apakah sebuah keputusan bentuk data mengalir ke arah yang benar

**Aturan.** Ada **satu** rantai berarah, ditulis eksplisit di repo, bukan disimpan di kepala
siapa pun:

```
lapis skema data  ->  kontrak  ->  server & klien generated
(otoritas bentuk)     (spesifikasi      (menyesuaikan)
                       yang mengikat)
```

Lapis skema data memutuskan tipe dan nullability. Kontrak **diturunkan** darinya lalu menjadi
spesifikasi yang mengikat semua konsumen. Server dan klien **menyesuaikan diri** dengan
kontrak; klien adalah **turunan, bukan penafsir** — setiap tipe, kunci cache, dan nama
permission berasal dari kontrak, tidak ada yang diketik tangan. Setiap field opsional di skema
yang muncul di respons wajib dinyatakan nullable di kontrak. Pengecualiannya satu, dan hanya
satu: badan permintaan — lihat [[C-04]].

**Padanan generik.** Kalau kontrakmu tidak punya keyword nullability — ia tidak ada di setiap
bahasa skema, dan `nullable` bahkan dihapus di OpenAPI 3.1 — kewajibannya tidak hilang
bersamanya: bentuk yang lapis skema izinkan kosong wajib **terbaca kosong di kontrak**, lewat
mekanisme apa pun yang stack-mu punya (tipe opsional, union dengan null, field bertanda
kehadiran).

Tenancy **tidak** mengikuti rantai ini: ia tidak diturunkan dari mana pun. Lihat [[T-01]].

**Mengapa.** Sebelum rantainya ditulis, kontrak dipatok ke perilaku **server yang kebetulan
sedang jalan**. Server itu mendeklarasikan dua field data kelahiran sebagai string
non-nullable, sementara skema data menyatakan keduanya opsional — dan sebagian baris memang
kosong. Karena asumsi itu menyebar lewat satu komponen bersama, **88 properti di 34 operasi**
salah sekaligus. Ia ketahuan hanya karena satu dari 216 respons yang divalidasi tangan
kebetulan mengenainya; tidak ada mekanisme yang akan menemukannya sendiri. Kontrak yang
berbohong lebih berbahaya daripada tidak ada kontrak, karena klien generated mempercayainya.

**Cara memverifikasi.** Dokumen rantainya ada dan menyebut, untuk tiap lapis, satu otoritas dan
satu arah. Uji petik yang murah dan mengulang kelas D di atas: ambil sepuluh field opsional
acak dari skema data, telusuri masing-masing ke respons kontrak; setiap yang tidak nullable di
kontrak adalah pelanggaran. Bukti yang **TIDAK sah**: bahwa server yang sedang jalan
mengembalikan bentuk itu — perilaku server bukan otoritas, ia konsumen ([[S-02]]); dan bahwa
anotasi tipe di sebuah fungsi menjanjikannya, karena anotasi yang disokong cast tidak diperiksa
sama sekali dan anotasi yang meneruskan nilai dari pemanggilan lain tidak dipersempit. Untuk gate
yang menutup seluruh kelas ini sekaligus, bandingkan skema dengan kontrak field-per-field — itu
kandidat otomatisasi bernilai tertinggi di lapis ini.

---

## S-02 · Arah perbaikan saat dua lapis berbeda pendapat

**Ditegakkan oleh:** manual-review-only — menentukan lapis mana yang salah menuntut membaca maksud perubahan, bukan bentuknya

**Aturan.** Saat menemukan ketidakcocokan, tanya **berurutan**:

1. Apa kata **skema data**? Itu kebenarannya.
2. Apakah **kontrak** berbeda dari skema? → perbaiki **kontrak**.
3. Apakah **server** berbeda dari kontrak? → perbaiki **server**.
4. Apakah **komponen arsip** berbeda? → **catat, jangan perbaiki**. Lihat [[S-03]].

Dua larangan turunannya, dan keduanya sering terasa seperti kepatuhan saat dilanggar:

- **Jangan dokumentasikan bug.** Kalau server mengirim bentuk yang salah, kontrak tidak
  mengikutinya. Kontrak menyatakan bentuk yang **benar**; server yang menyesuaikan.
- **Jangan bikin kontrak lebih ketat dari server.** Cerminnya. Kalau server benar-benar
  menerima bentuk longgar, menyempitkan kontrak membuat baris data pertama yang tidak sesuai
  mengubah kontrak jadi pembohong. Perbaikan yang benar memperketat **keduanya** bersamaan,
  setelah memeriksa data lama.

**Mengapa.** Kedua arah sudah menagih ongkosnya. Ke arah pertama: empat operasi di satu modul
mengirim **amplop ganda** — router membungkus ulang hasil layanan yang sudah beramplop.
Menuliskannya ke kontrak akan merestui bug itu jadi permanen, dan setiap klien generated
diturunkan dari bentuk yang salah itu. Ke arah kedua: satu field dideklarasikan sebagai skema
kosong karena servernya memvalidasi dengan tipe serba-boleh; menuliskannya sebagai larik string
— yang jelas dimaksudkan — akan membuat kontrak lebih ketat daripada server yang ia jelaskan.
Yang menentukan bukan bentuk mana yang lebih rapi, tapi lapis mana yang berwenang.

**Cara memverifikasi.** Baca diff PR-nya dan jawab satu pertanyaan: apakah ia menggerakkan
kontrak **mendekati skema data**, atau **mendekati keluaran server yang diamati**? Yang kedua
adalah pelanggaran, dan bentuknya khas — kontrak berubah, server tidak. Setiap PR
ketidakcocokan wajib menyebut di lapis mana ia memperbaiki dan kenapa lapis itu; PR yang
mengubah kontrak agar cocok dengan keluaran yang diamati, tanpa satu baris pun perubahan
server, ditolak.

---

## S-03 · Komponen arsip: baca-saja, dan bagian mana yang tidak ikut diarsipkan

**Ditegakkan oleh:** `gate:archive-freeze (konsumen)`

**Aturan.** Komponen yang tidak lagi melayani produksi dinyatakan **arsip baca-saja**. Ia tetap
berguna sebagai rujukan perilaku — membaca fungsi proyeksinya sering jadi cara tercepat
menemukan bentuk respons lama — tapi ia **berhenti jadi otoritas**, **tidak diperbaiki**, dan
selisih terhadapnya **dicatat, bukan ditutup**.

Pernyataan arsip wajib menyebut eksplisit **bagian mana yang TIDAK ikut diarsipkan**. Sebuah
komponen yang dibekukan hampir selalu masih menampung sesuatu yang hidup; membekukannya
sekalian adalah kerusakan yang jauh lebih besar daripada kelalaian yang dicegah.

Gate menolak perubahan apa pun di bawah jalur arsip, kecuali PR-nya membawa label pengecualian
eksplisit.

**Mengapa.** Aturan freeze ini pernah ditulis sebagai aturan proses, lalu **dilanggar di PR
pertama sesudah ia mendarat, tiga hari kemudian**. Ia baru benar-benar berlaku setelah jadi
gate CI — itu preseden yang melahirkan [[G-01]]. Klausa "bagian mana yang tidak ikut" juga
dibayar: definisi skema data secara fisik tinggal **di dalam** direktori yang dibekukan, jadi
freeze yang menelannya akan membekukan satu-satunya lapis yang seluruh rantai [[S-01]]
turunkan darinya, dan setiap perubahan data berikutnya akan menabrak gate yang benar-benar
dimaksudkan menjaga hal lain.

**Cara memverifikasi.** `gate:archive-freeze` menggagalkan diff apa pun yang menyentuh jalur
arsip tanpa label pengecualian. Buktikan ia menggigit **dua arah**, karena hanya satu arah
tidak membedakan gate yang benar dari gate yang salah alamat: (1) ubah satu baris di bawah
jalur arsip → harus MERAH; (2) ubah satu baris di bawah subjalur yang dikecualikan → harus
HIJAU. Gate yang memerahkan subjalur yang dikecualikan salah konfigurasi, dan orang akan
melabeli-pengecualian setiap PR untuk melewatinya — yang menghapus gate-nya tanpa menghapus
berkasnya.
