# W — Frontend

Prinsipnya satu kalimat: **frontend tidak menafsirkan API, ia menurunkan diri darinya.** Setiap
tipe, kunci cache, nama permission, dan skema form berasal dari kontrak ([[S-01]]). Yang diketik
tangan hanya yang memang tidak ada di kontrak.

---

## W-01 · Frontend memanggil klien generated saja

**Ditegakkan oleh:** `gate:frontend-client-sync (konsumen)`

**Aturan.** Hook, fungsi permintaan, tipe entitas, skema validasi form, dan union nama
permission semuanya datang dari klien generated. Merakit pemanggilan sendiri di atas fungsi
generated dilarang — dan dua keadaan yang terus dicampur punya tempat yang **berbeda**:

- **Komposisi yang memang sah dan permanen** — kueri gabungan lintas endpoint, kueri berantai
  yang saling bergantung — **dinyatakan di kode**: satu pemanggilan bernama, dengan komentar yang
  menyebut aturan ini dan alasan kenapa hook generated tidak bisa melakukannya. Ia **bukan
  utang**, jadi ia **tidak masuk baseline**: daftar yang bentuk suksesnya menyusut sampai nol
  tidak boleh memuat entri yang tidak akan pernah hilang ([[G-03]] butir 2).
- **Pembungkus sisa migrasi** — pemanggilan tulisan tangan yang cuma membungkus satu fungsi
  generated — adalah utang murni, dan **itulah** yang masuk baseline shrink-only.

Envelope dibaca **apa adanya** ([[C-01]]): baca `data`, paginasi di `metaData`, dan `message`
langsung dari hasil hook. Dilarang membuat adapter per modul yang tugasnya membuka envelope —
ia terlihat lebih enak dipakai tapi membuat tipe berbohong dan membuang paginasi serta pesan
dari jangkauan.

Tipe entitas API **tidak pernah** disalin ke berkas tipe lokal; berkas tipe per modul hanya
untuk yang memang bukan dari kontrak, seperti state UI dan props. Skema form memakai skema
generated dengan aturan tambahan **di atasnya**, bukan diketik ulang; ketidakcocokan
opsionalitas diselesaikan dengan menaruh nilai default **di kontrak**, bukan dengan cast di
frontend.

**Mengapa.** Dari **363 pemanggilan kueri/mutasi tulisan tangan**, **175 hanya membungkus fungsi
generated** — kode tambahan tanpa kemampuan tambahan, tapi dengan kunci cache yang dikarang
sendiri ([[W-02]]) dan opsi default yang menyimpang.

Tipe yang disalin lebih mahal lagi: satu kelas bug **seluruhnya** salinan basi. Satu modul
mendeklarasikan tiga field yang **tidak ada** di respons; satu mengetik stempel waktu sebagai
objek tanggal padahal di kabel ia string; satu mengetik field kunci-terhapus sebagai angka
padahal ia objek; satu mewajibkan nama organisasi bersarang yang tidak pernah dikirim. Semuanya
tersembunyi karena modulnya tidak pernah masuk program pemeriksa tipe ([[W-03]]). Dan dua
endpoint **rusak di produksi selama berbulan-bulan** karena halaman create-nya tidak pernah
mengirim ID yang di-mint klien — tak terlihat karena modulnya memakai pembungkus klien tanpa
tipe; tipe generated yang akhirnya menangkapnya.

**Cara memverifikasi.** `gate:frontend-client-sync` meregenerasi klien lalu menuntut diff kosong
([[B-03]]); menggagalkan konstruktor kueri/mutasi langsung di luar direktori generated kecuali
terdaftar di baseline; dan menggagalkan literal nama permission di luar union generated.
Kegagalan tipe adalah bukti utamanya — jalankan pemeriksa tipe penuh ([[W-03]]) dan baca galat
"properti wajib hilang" sebagai gejala ID yang tidak dikirim, bukan sebagai gangguan.

---

## W-02 · Disiplin queryKey dan invalidasi

**Ditegakkan oleh:** `gate:frontend-query (konsumen)`

**Aturan.** Kunci cache **selalu** dari helper kunci generated, tidak pernah dari larik literal.
Helper tanpa argumen menghasilkan **prefiks**, dan cache mencocokkan prefiks — jadi satu
pemanggilan invalidasi membatalkan semua variasi parameter sekaligus.

Konfigurasi cache mengikuti kunci yang benar, bukan menambal kunci yang meleset: refetch-saat-
mount kembali ke default begitu kuncinya benar, dan **retry tidak mengulang 4xx** — mengulang
penolakan izin itu sia-sia sekaligus membuatnya terasa lambat.

**Mengapa.** Kunci yang dikarang ulang di tiap titik panggil adalah akar **591 pemanggilan
invalidasi yang meleset**. Gayanya bahkan tidak seragam antar dua berkas di modul yang sama.
Karena invalidasi tidak pernah cocok, ia ditambal dengan **12 refetch manual** dan sebuah flag
refetch-saat-mount global — tambalan yang menyembunyikan penyakitnya dan membebani setiap
halaman lain. Yang membuatnya menyakitkan: **332 helper kunci generated tersedia, dan hanya 7
yang dipakai.**

**Cara memverifikasi.** `gate:frontend-query` menggagalkan `queryKey:` yang diikuti larik
literal di seluruh kode aplikasi (dikecualikan direktori generated, tempat hook generated
memanggilnya sendiri), lewat baseline shrink-only. Entri baseline yang **basi** — sudah bersih,
atau berkasnya hilang — wajib **GAGAL**, bukan sekadar memperingatkan ([[G-03]]). Periksa juga
konfigurasi cache-nya secara langsung: cari kebijakan retry dan pastikan ia tidak mengulang
respons 4xx.

---

## W-03 · Pemeriksa tipe penuh, bukan sebagian

**Ditegakkan oleh:** `gate:frontend-typecheck (konsumen)`

**Aturan.** Pemeriksa tipe berjalan atas **seluruh program aplikasi**, dengan deteksi lokal-tak-
terpakai menyala. **Menyaring hasilnya berdasarkan jalur dilarang.** Cakupan gate dienumerasi
eksplisit, bukan lewat glob, dan tanpa jatah galat.

**Mengapa.** Filter yang buta lebih berbahaya daripada tidak ada gate. Terukur: sebuah gate
hanya mencocokkan jalur di bawah direktori klien-API dan direktori modul, jadi **75 galat tipe**
dari pohon komponen bersama **dibuang oleh filter** dan gate tetap hijau — berkasnya bahkan
sudah ada di dalam program kompilator, hanya **hasilnya** yang dibuang. Saat pemeriksa penuh
akhirnya
terpasang, ia bernilai **164 galat turun ke nol**.

Impor tipe mati adalah kelas yang sama: ia **inert** terhadap setiap gate — tidak menggagalkan
lint, tidak menggagalkan kompilator, dan bagi siapa pun yang nge-grep ia terbaca sebagai
dependensi nyata. Akibatnya sebuah modul disangka masih terikat padahal tidak, **lima kali
dalam dua gelombang**.

Dan pemasangannya sendiri punya prasyarat yang mahal: pemeriksa penuh sempat **tidak bisa
dijalankan sama sekali** — kehabisan memori pada heap default, 6 GB, maupun 12 GB — karena satu
tipe patologis plus alias yang menarik seluruh paket tetangga ke dalam programnya. Kehabisan
memori pada gate punya **dua sebab berbeda**: patologis (tidak sembuh dengan heap lebih besar)
dan skala (sembuh). Bisect per modul yang membedakannya; jangan langsung menaikkan heap.

**Cara memverifikasi.** `gate:frontend-typecheck` menjalankan pemeriksa tipe untuk seluruh
aplikasi tanpa filter jalur. Buktikan tidak ada filter yang menyembunyikan apa pun: sisipkan
satu galat tipe **di berkas di luar cakupan filter historis** (mis. sebuah komponen bersama) dan
pastikan gate MERAH. Ukur hitungan galatnya **dua kali** dan perlakukan angka pertama sebagai
lantai — lihat [[O-03]]. Jangan percaya "hijau di lokal": tipe yang terdegradasi diam-diam bisa
menelan galat lain, sehingga kode yang sama lulus lokal dan gagal di CI ([[O-04]]).
