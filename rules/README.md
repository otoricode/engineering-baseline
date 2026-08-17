# `rules/` — skema ID, format, dan siklus hidup

Aturan hidup **hanya di sini**. `STANDARD.md` (pintu manusia) dan `AGENTS.md` (pintu agen)
**menunjuk** ID; keduanya tidak boleh memuat pernyataan aturan yang tidak ada di folder ini.
Salinan kedua pasti menyimpang dari yang pertama — itu kelas kegagalan yang standar ini sendiri
larang, dan ia berlaku untuk standar ini juga.

Berkas ini **dikecualikan** dari pemindaian aturan (`rules-lint` melewati `README.md`), jadi ia
boleh memuat contoh format sebanyak yang perlu.

---

## Skema prefix — delapan lapis

Berbasis **lapis**, bukan berbasis stack, supaya ID tetap sah saat stack diganti.

| Prefix | Berkas | Lapis | Cakupan |
|---|---|---|---|
| `S-` | `S-sumber-kebenaran.md` | Sumber kebenaran | siapa otoritas atas bentuk data; arah perbaikan saat mismatch; apa yang berstatus arsip |
| `C-` | `C-kontrak.md` | Kontrak | envelope tunggal, katalog error tertutup, auth & permission di kontrak, jebakan skema |
| `B-` | `B-backend.md` | Backend | antarmuka server ketat, pemetaan error terpusat, larangan mengedit artefak generated |
| `W-` | `W-frontend.md` | Frontend | klien generated saja, disiplin queryKey, pemeriksa tipe penuh |
| `G-` | `G-gate.md` | Gate | aturan mana ditegakkan gate mana; opt-in allowlist; baseline shrink-only |
| `T-` | `T-tenancy.md` | Tenancy | batas penyewa, akses-by-ID lintas penyewa, fail-closed, status balikan untuk baris penyewa lain, operasi destruktif, bukti yang tidak sah |
| `I-` | `I-idempotensi.md` | Idempotensi | ID deterministik content-hash, paritas lintas-bahasa, tulis idempoten |
| `O-` | `O-orkestrasi-agen.md` | Orkestrasi agen | dokumen tak menahan, gate menahan; jebakan worktree; klaim vs bukti |

Satu berkas per prefix. Di dalam berkas, aturan urut **menaik menurut nomor**.

## Format satu aturan

Empat bagian, urutannya tetap. Judul memakai titik-tengah `·` sebagai pemisah — bukan `-`,
bukan `—`. Satu karakter yang salah di sana membuat aturannya **hilang dari hasil parsing**
alih-alih dilaporkan sebagai salah format, jadi `rules-lint` memeriksanya terpisah.

```md
## C-01 · Envelope tunggal untuk seluruh respons JSON

**Ditegakkan oleh:** `gate:contract-envelope`

**Aturan.** Apa yang wajib/dilarang. Kalimat imperatif, bukan narasi.

**Mengapa.** Kegagalan KONKRET yang melahirkannya: apa yang rusak, seberapa banyak,
dan kenapa penjagaan yang terlihat ada ternyata tidak menahan. Bukan "demi konsistensi".

**Cara memverifikasi.** Perintah atau langkah yang bisa dijalankan orang. Untuk aturan
ber-gate, tunjuk gate-nya. Untuk `manual-review-only`, tulis apa persisnya yang harus
dilihat manusia, apa yang membuktikan pelanggarannya, dan bukti apa yang TIDAK sah.
```

### `**Ditegakkan oleh:**`

Satu baris, **tepat satu kali** per aturan. Isinya salah satu dari:

- nama gate, mis. `` `gate:contract-envelope` `` — dan gate itu harus benar-benar memeriksa
  aturan ini, **dengan pelaksana yang paket ini kirim**. Kolom penegak yang berbohong lebih buruk
  daripada kolom kosong: ia menghentikan orang membangun penjaga yang sungguhan. Lihat `G-01`.
- nama gate bertanda `` `gate:<nama> (konsumen)` `` — gate itu nyata dan mengikat, tapi
  **pelaksananya bukan paket ini**: proyek yang memasang standar ini yang wajib menyediakannya.
  Di proyek yang belum menyediakannya, aturan itu **tidak ditegakkan siapa pun** — perlakukan
  seperti `manual-review-only` sampai gate-nya benar-benar ada. Penandanya berarti "pelaksananya
  bukan paket standar", **bukan** "belum ada": aturan yang kau tulis sendiri di proyekmu dan kau
  tegakkan dengan gate buatanmu sendiri bertanda ini juga, dan itu benar — dari sudut paket
  standar, pelaksananya memang datang dari luar.
- `manual-review-only — <alasan mesin tak bisa memeriksanya>`. Alasannya wajib; "belum sempat"
  dan "mustahil dimesinkan" adalah dua keadaan berbeda dan keduanya perlu dibedakan saat
  memutuskan apa yang layak dibangun.

Keadaan kedua lahir dari cacat yang diukur, bukan dari kerapian. Sembilan nama gate menempati
keadaan PERTAMA tanpa satu baris sumber pun di paket ini, dan bentuk kolomnya identik dengan gate
yang sungguhan — jadi tidak ada cara membedakannya selain meng-grep sumbernya satu per satu.
`AGENTS.md` mengarahkan agen yang menghadapi gate merah ke tabel penegak, jadi agen yang patuh
diberi tahu `gate:tenancy-byid` (**batas penyewa**) menegakkan `T-02`, gate yang tidak ada di mana
pun. Penandanya sendiri ber-gate DUA ARAH (#12 di bawah), supaya ia tidak jadi keadaan ketiga yang
ikut berbohong.

Satu jebakan sintaks yang pasti kau temui: nilainya **tidak boleh memuat backtick di tengah**.
Nama gate boleh dibungkus backtick sepenuhnya, tapi menambahkan keterangan sesudahnya membuat
barisnya **tidak terbaca sama sekali**, dan aturannya dilaporkan tak punya penegak. Kalau sebuah
gate hanya menutup **sebagian** aturan — keadaan yang lazim, bukan pengecualian — tulis nama
gate-nya saja di baris ini dan jelaskan batasnya di **Cara memverifikasi**. Di situ tempatnya:
ia akan dibaca orang yang sedang memverifikasi, bukan orang yang sedang memindai daftar penegak.

### Rujukan silang

`[[C-02]]` di badan aturan mengikat aturan yang saling bergantung. Setiap ID yang dirujuk
**wajib ada**; `rules-lint` memerahkan rujukan ke ID yang tidak ada.

### Blok kode

Isi blok ber-fence dikecualikan dari deteksi heading, penegak, dan rujukan — jadi contoh format
di dalam fence aman, termasuk baris yang dimulai `## `. Uji inventaris memakai pembersih fence
yang sama dengan parser, jadi contoh di dalam blok kode tidak terhitung sebagai aturan.

## Siklus hidup ID

Sekali terbit, sebuah ID **tidak pernah dipakai ulang** — bahkan setelah aturannya dicabut. ID
yang dipakai ulang membuat arkeologi commit lama jadi menyesatkan: sebuah PR dari enam bulan
lalu yang menyitir `T-03` akan terbaca membenarkan aturan yang sama sekali lain.

Aturan yang dicabut **tetap di berkasnya**, ditandai:

```md
## C-09 · Judul lama apa adanya

**Status:** USANG — digantikan [[C-05]] karena bentuknya tak pernah mengikat (2026-08-16)

**Ditegakkan oleh:** manual-review-only — sudah tidak ditegakkan; dipertahankan sebagai riwayat
```

Baris `**Status:**` memuat **alasan** dan **tanggal**. `rules-lint` membacanya; aturan usang
tetap dihitung dan rujukan ke ID-nya tetap sah.

## Cara menambah aturan baru

1. Aturan lahir dari **temuan**, bukan dari preferensi. Kalau ia berulang (≥2 kejadian) atau
   mahal sekali (rusak di produksi), ia layak jadi aturan. Kalau belum, ia catatan.
2. Ambil **nomor berikutnya** di lapisnya. Jangan menyisipkan di tengah dan jangan memakai
   ulang nomor yang pernah hidup.
3. Isi keempat bagian. `**Mengapa.**` wajib menyebut kegagalan konkret — dengan angka kalau
   ada. Aturan tanpa temuan pendukung adalah selera, dan selera tidak mengikat siapa pun.
4. Sebut penegaknya dengan jujur, dan ketiga keadaannya berbeda: gate yang paket ini kirim; gate
   yang KONSUMEN wajib sediakan (`` `gate:<nama> (konsumen)` ``); atau `manual-review-only` beserta
   alasannya. Menulis nama gate yang tidak ada pelaksananya tanpa penanda itu MERAH (#12), bukan
   sekadar tidak sopan — pertimbangkan juga mendaftarkannya sebagai kandidat di `G-gate.md`.
5. Jalankan `./bin/standard rules-lint` sampai nol temuan, lalu `pnpm test`.

## Memeriksa folder ini

```bash
./bin/standard rules-lint          # default: folder "rules"
./bin/standard rules-lint <dir>    # folder lain (mis. salinan di proyek target)
```

Dua belas pemeriksaan. #6–#9 membebani penulis aturan dengan kewajiban yang tidak jelas dari format
saja — karena itu didaftar di sini, bukan cuma hidup di kode. #10 dan #11 berbeda golongan: keduanya
tidak memeriksa aturan di `dir`, melainkan empat pintu masuk dokumen **bersebelahan** dengannya di
akar paket (`README.md` — peta paket, **bukan** berkas ini — plus `STANDARD.md`, `AGENTS.md`, dan
`INSTALL.md`). Pembukaan berkas ini menjelaskan kenapa keempatnya hanya boleh menunjuk ID, tidak
menyatakan ulang isinya. #12 berbeda lagi: ia mengadu kolom penegak dengan KODE paket ini — daftar
gate yang benar-benar dikirim — bukan dengan dokumen mana pun:

1. **ID unik**, tak pernah dipakai ulang.
2. **Tiap aturan menyebut penegaknya** — kolom `**Ditegakkan oleh:**` tidak boleh kosong.
3. **Rujukan silang `[[ID]]` menunjuk ID yang ada.**
4. **Heading cocok pola judul** `## <ID> · <judul>`.
5. **`**Ditegakkan oleh:**` tidak muncul dua kali** dalam satu aturan.
6. **Nama penegak yang disebut di badan cocok dengan kolom penegaknya.** Kalau badan aturan
   menyebut nama penegak sama sekali, salah satunya wajib penegak aturan itu sendiri. Menyebut
   penegak **lain** tetap boleh — *"gate X menjaga aturan lain, bukan aturan ini"* kalimat yang
   sah — asal penegak sendiri ikut disebut. Yang ditolak: kolom penegak dipindah ke gate baru
   sementara prosa verifikasinya tertinggal menyebut yang lama, karena pembaca yang meng-grep
   sumber penegak untuk ID aturan ini lalu memeriksa gate yang salah dan menyimpulkan aturannya
   tak bertuan.
7. **Kelengkapan prosa** — tiap aturan yang masih berlaku memuat `**Aturan.**`, `**Mengapa.**`,
   dan `**Cara memverifikasi.**` **tepat sekali** masing-masing.
8. **Aturan ber-`**Status:** USANG` wajib berpenegak `manual-review-only — sudah tidak
   ditegakkan`** — kalimat itu **diperiksa mesin**, bukan basa-basi template. Penanda USANG
   membebaskan sebuah aturan dari pemeriksaan #7; tanpa pemeriksaan ini pembebasan itu jadi
   **tombol bisu** — satu baris teks yang membungkam pemeriksaan atas aturan yang masih hidup dan
   masih wajib ada. Awalan `manual-review-only` saja **tidak cukup**: kebanyakan aturan manual
   yang masih hidup sudah memenuhinya, jadi pada merekalah tombol bisu itu justru bekerja. Dengan
   kalimat penuh, mencabut sebuah aturan tetap mungkin tapi selalu menuntut **perubahan kedua
   yang terlihat**.
9. **Berkas ini sendiri tidak boleh memuat aturan.** `README.md` dikecualikan dari pemindaian
   aturan — pengecualian yang perlu, karena ia memuat contoh format. Tapi pengecualian tanpa
   penjaga adalah lubang: aturan yang ditaruh di sini **lenyap tanpa satu pun sinyal**, jadi
   tidak ada yang memeriksa ID-nya, penegaknya, maupun kelengkapan prosanya. Yang diperahkan
   hanyalah judul aturan **di luar** blok ber-fence; contoh di **dalam** fence tetap sah, dan
   berkas ini sendiri memuat dua di antaranya.
10. **Rujukan `[[ID]]` di `README.md`/`STANDARD.md`/`AGENTS.md`/`INSTALL.md` menunjuk ID yang
    hidup.** Keempat pintu masuk itu ada supaya tidak ada salinan kedua dari isi sebuah aturan —
    mereka boleh HANYA menunjuk ID. Pemeriksaan ini menjaga separuh larangan itu yang bisa
    dimesinkan (rujukan menunjuk ID yang ada); separuh yang lain — bahwa isinya benar-benar tidak
    menyatakan ulang aturan — tetap `manual-review-only`, karena itu penilaian prosa. Keempat
    berkas dicari sebagai **saudara** folder aturan (`dir`), bukan di dalamnya; kalau salah satu
    belum disalin ke sana, ia dilewati diam-diam (dan sekarang **terlihat**: `rules-lint` selalu
    mencetak berapa dari empat pintu masuk yang ditemukan, bukan cuma diam saat nol).
    `INSTALL.md` masuk daftar ini di fix round 1 Task 15: ia menyitir `[[G-01]]`, `[[G-02]]`, dan
    `[[T-01]]`, sitirannya sempat cuma diverifikasi tangan, dan ID yang kelak dicabut tidak akan
    memerahkan berkas yang justru paling banyak dibaca orang yang baru memasang paket ini.
11. **Tabel "aturan mana ditegakkan gate mana" di `STANDARD.md` sinkron dengan kolom
    `**Ditegakkan oleh:**` di `rules/`.** Tabel itu **artefak generated**, bukan diketik tangan —
    sekelas dengan pohon yang `B-03` atur, hanya beda level (markdown, bukan kode). Empat mode
    gagal, semuanya MERAH: aturan tanpa baris; baris basi (judul/penegaknya tidak cocok lagi
    dengan `rules/`); baris duplikat untuk ID yang sama; dan baris yang sama sekali tidak berbentuk
    `| [[ID]] | judul | penegak |`. Urutan baris yang tertukar (relatif urutan pilar naratif di
    atas tabel) MERAH juga, selama isi tiap barisnya sendiri sudah cocok. Rujukan mati di dalam
    tabel (baris untuk ID yang tak ada) sudah tertutup pemeriksaan #10, karena tiap sel ID tabel
    memuat `[[ID]]` biasa — tidak diulang di sini. Tabelnya dibatasi marker HTML
    (`<!-- rules-lint:tabel-penegak:mulai/selesai -->`); tanpa marker, pemeriksaan ini MERAH
    juga — nol pemeriksaan yang terlihat hijau adalah
    lubang yang sama dengan direktori nol-aturan di bawah.
12. **Tiap nama gate di kolom penegak benar-benar DIKIRIM paket ini, atau bertanda `(konsumen)`.**
    Inventarisnya bukan daftar tangan: ia `LANGKAH[].gate` (yang `standard gate` jalankan) ditambah
    nama `gate:*` yang muncul di `ci/*.template`. Dua mode gagal, keduanya MERAH: nama gate yang
    mengaku dikirim padahal tidak ada pelaksananya, dan penanda `(konsumen)` yang BASI — gate-nya
    kini benar-benar dikirim, jadi penandanya menyuruh pemakai membangun yang sudah ia punya.
    Aturan ber-`**Status:** USANG` dilewati. Ini yang membuat keadaan ketiga di atas tidak bisa
    jadi tempat parkir: menandai sesuatu `(konsumen)` selalu bisa diperiksa ulang mesin.

Direktori yang terbaca tapi **nol aturan** dilaporkan sebagai temuan, bukan sukses — folder yang
salah ditunjuk akan terlihat hijau padahal tidak memeriksa apa pun.

### Apa yang ikut terbawa saat paket ini disalin

Pemeriksaan yang hidup di `rules-lint` **ikut** ke proyek target; yang hidup di suite paket ini
**tidak** — `src/rules/inventaris.test.ts` memaku daftar ID milik paket ini dan tidak portabel.
Karena itu setiap pemeriksaan yang mengikat penulis aturan wajib duduk di kolom kiri:

| Pemeriksaan | `standard rules-lint` | `pnpm test` paket ini |
|---|---|---|
| #1–#9 di atas | ikut terbawa | ikut |
| #10 — rujukan dokumen di atas | ikut terbawa | ikut |
| #11 — tabel penegak sinkron di atas | ikut terbawa | ikut |
| #12 — nama gate terkirim vs `(konsumen)` di atas | ikut terbawa | ikut |
| Direktori nol aturan | ikut terbawa | ikut |
| Himpunan ID cocok dengan inventaris | **tidak** | khusus paket ini |

Kalau kau menambah pemeriksaan baru, taruh di `lintFormat`/`lintRules` — **bukan** di berkas
test. Pemeriksaan yang hanya hidup di suite adalah pemeriksaan yang **tidak berjalan sama sekali**
di setiap salinan yang dipasang, dan itu kelas kegagalan yang `G-01` catat: penjaga yang diklaim
ada padahal tidak.
