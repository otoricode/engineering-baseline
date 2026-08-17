# I — Idempotensi

Berlaku untuk setiap alur **upload → stage → execute**: mengunggah ulang berkas yang sama, atau
menjalankan ulang eksekusi, **tidak boleh** menghasilkan duplikat. Caranya ID ber-alamat konten,
bukan penjagaan di sisi pemanggil.

Ini **bukan** hal yang sama dengan idempotensi endpoint POST biasa (ID yang di-mint klien plus
kunci idempotensi di header). Keduanya saling melengkapi.

---

## I-01 · ID entitas deterministik dari konten, bukan acak

**Ditegakkan oleh:** `gate:golden-ids (konsumen)`

**Aturan.** Primary key entitas yang diimpor adalah **UUID berbasis nama** (v5, RFC 4122, SHA-1)
atas string kanonik yang dibangun dari field pengenal barisnya — **bukan** v4/acak. Konten yang
sama selalu menghasilkan kunci yang sama, sehingga pelanggaran unik saat insert ulang adalah
**lewatan idempoten yang aman** ([[I-04]]).

**Namespace-nya dicetak sekali per proyek dan TIDAK PERNAH diubah** setelah baris pertama
mendarat. Sampai ia dicetak, alat proyek menolak berjalan — nilai contoh bukan nilai yang sah.

**Mengapa.** Dengan ID acak, tidak ada kunci apa pun yang membuat lari kedua mengenali hasil lari
pertama; deduplikasi lalu harus dikarang per alur dari field bisnis, dan itu persis penilaian
yang gagal. Yang lebih halus dan lebih mahal: **namespace yang berubah membuat setiap ID yang
sudah tertulis tak terjangkau lagi oleh konten yang sama** — impor ulang berkas yang identik
berhenti melewati dan mulai **menggandakan data**, sambil melaporkan sukses di kedua lari. Karena
itu namespace-nya immutable, bukan sekadar "sebaiknya stabil".

**Cara memverifikasi.** `gate:golden-ids` — test golden mengunci nilai ID **persis** untuk
masukan tetap. Validator konfigurasi menolak berjalan selama namespace masih bernilai contoh.
Grep jalur impor untuk pemanggilan pembangkit UUID acak; satu kemunculan pun adalah pelanggaran.
Uji ujung-ke-ujung yang paling murah: jalankan impor yang sama **dua kali** dan assert jumlah
barisnya identik.

---

## I-02 · String kanonik: urutan field tetap, normalisasi tetap

**Ditegakkan oleh:** `gate:golden-ids (konsumen)`

**Aturan.** String kanonik menggabungkan field dengan **pemisah unit** (0x1F) dalam **urutan
field yang tetap**. Normalisasinya juga tetap:

- **Teks**: trim → rapatkan whitespace internal jadi satu spasi → huruf besar; null/undefined
  menjadi string kosong.
- **Tanggal**: format ISO tanggal; tidak sah atau kosong menjadi string kosong.
- **Field penyewa/lingkup**: masuk **MENTAH**, tidak dinormalisasi.

ID entitas turunan diturunkan dari **ID induknya**, dan saat kedua induknya sudah berupa ID
kanonik, **tidak ada normalisasi sama sekali**.

Perubahan apa pun pada urutan field, normalisasi, atau pemisah adalah **perubahan yang
merusak** setiap ID yang sudah tertulis — sekelas dengan mengganti namespace ([[I-01]]), dan
wajib dicerminkan di setiap implementasi sekaligus ([[I-03]]).

**Mengapa.** Setiap pilihan di atas menutup satu mode gagal yang konkret. Pemisahnya karakter
kontrol justru karena pemisah yang bisa dicetak — koma, pipa, tanda hubung — **bisa muncul di
dalam field yang sudah dinormalisasi**, dan begitu itu terjadi dua baris yang berbeda
menghasilkan string kanonik yang sama, lalu ID yang sama, lalu satu di antaranya hilang sebagai
"duplikat". Huruf besar dan perapatan spasi ada karena orang yang sama tiba sebagai `"  Budi
Santoso "` di satu unggahan dan `"BUDI SANTOSO"` di unggahan berikutnya; tanpa normalisasi itu
dua baris. Dan field penyewa masuk mentah karena ia **sudah** sebuah ID: menormalisasinya —
menghurufbesarkan pengenal yang case-sensitive — akan **memecah ruang ID satu penyewa yang sama**
jadi dua.

**Cara memverifikasi.** `gate:golden-ids` mengunci keluaran persis, dengan **minimal satu kasus
per cabang normalisasi**: whitespace di ujung, spasi ganda di tengah, campuran huruf besar-kecil,
field null, dan tanggal tidak sah. Untuk membuktikan urutan field benar-benar terkunci, **tukar
dua field bertetangga** di masukan test dan assert ID-nya **BERUBAH** — test yang tetap hijau di
situ tidak menguji urutan sama sekali.

---

## I-03 · Paritas lintas-bahasa dipin oleh test golden

**Ditegakkan oleh:** `gate:golden-ids (konsumen)`

**Aturan.** Kalau lebih dari satu implementasi menulis entitas yang sama — dua server, sebuah
server plus job batch, atau perhitungan awal di sisi klien — ID-nya wajib **identik
byte-per-byte**. String kanonik, urutan field, normalisasi, dan namespace **dicerminkan di setiap
implementasi**, dan dipin oleh test golden yang memuat **nilai ID literal yang sama**.

Mengubah satu sisi tanpa sisi lain bukan refactor: ia mengubah string kanonik ([[I-02]]) hanya
di satu tempat. Nilai golden di **semua** implementasi diperbarui dalam perubahan yang sama.

**Mengapa.** Satu frontend pernah menyetir **dua** server sekaligus. Kalau kedua sisi berselisih
satu byte saja — misalnya satu sisi menghurufbesarkan sebelum trim dan sisi lain sesudahnya —
impor yang sama lewat server yang berbeda **membuat himpunan duplikat penuh** alih-alih
melewatinya. Dan mode gagalnya senyap: **kedua lari melaporkan sukses**, karena masing-masing
memang berhasil menulis baris yang ia maksud.

**Cara memverifikasi.** `gate:golden-ids` berjalan di suite test **setiap** implementasi dengan
nilai harapan yang **sama persis**; nilainya **disalin**, bukan dihitung ulang per bahasa — suite
yang menghitung sendiri harapannya menguji implementasinya terhadap dirinya sendiri. Bentuk yang
lebih kuat dan murah: taruh ID harapan di **satu berkas fixture** yang dibaca semua suite,
sehingga suntingan sepihak langsung memerahkan suite di sisi lain.

---

## I-04 · Tulis idempoten: pelanggaran unik yang sama = lewati, bukan gagal

**Ditegakkan oleh:** manual-review-only — membedakan dua kelas pelanggaran unik menuntut tahu constraint MANA yang menyala, dan itu di luar jangkauan pencocokan pola

**Aturan.** Insert memakai ID deterministik sebagai primary key. Saat terjadi **pelanggaran
unik**, periksa ulang **berdasarkan ID itu**:

- Baris dengan **ID yang sama** sudah ada → **lewatan idempoten, dihitung SUKSES**, baris staging
  ditandai selesai.
- Pelanggaran unik **lain** (tabrakan kunci bisnis di bawah ID yang berbeda) → tandai **INVALID**,
  **jangan** dilewati.

Dua kewajiban pendamping:

- **Deduplikasi di waktu unggah**, terhadap tabel staging, dengan ID ber-alamat konten yang sama;
  laporkan jumlah yang dilewati kepada pengguna, jangan sembunyikan.
- **Kalau entitasnya sudah ada di penyewa itu** (dicocokkan lewat kunci bisnisnya), **UPDATE** ia
  — menulis seluruh field dan **menge-null-kan yang kosong** — alih-alih membuat baris kedua.

**Mengapa.** Mengempiskan kedua kasus jadi satu ("pelanggaran unik = lewati") mengubah tabrakan
kunci bisnis yang **sungguhan** — dua orang berbeda berbagi satu nomor identitas — jadi **sukses
senyap**, dan operatornya membaca "berhasil diimpor" untuk baris yang tidak pernah ditulis.
Mengempiskannya ke arah sebaliknya ("pelanggaran unik = gagal") membuat percobaan ulang atas lari
yang setengah selesai jadi **mustahil**, yang justru satu-satunya situasi percobaan ulang ada.

Klausa "nge-null-kan yang kosong" juga bukan detail: update yang melewati field kosong
meninggalkan nilai lama, dan hasilnya **tidak bisa dibedakan** dari update yang benar — barisnya
ada, timestamp-nya baru, dan sebagian isinya berasal dari unggahan sebelumnya.

**Cara memverifikasi.** `manual-review-only`. Yang harus dilihat di kode: penanganan galatnya
**bercabang pada constraint MANA** yang dilanggar, bukan hanya pada kelas galatnya; dan
pemeriksaan ulang by-ID terjadi **sebelum** sesuatu dihitung sebagai lewatan. Yang membuktikan
pelanggaran: satu blok tangkap yang memperlakukan pelanggaran unik apa pun sebagai sukses. Ujilah
dua-duanya, dan keduanya murah: (1) jalankan impor yang sama dua kali → jumlah baris identik dan
lari kedua melaporkan lewatan, bukan galat; (2) tanam tabrakan kunci bisnis di bawah ID berbeda →
ia mendarat sebagai INVALID, **bukan** sebagai sukses. Sabotase per [[G-06]]: longgarkan
percabangannya jadi "unik = lewati" dan pastikan test kedua MERAH.
