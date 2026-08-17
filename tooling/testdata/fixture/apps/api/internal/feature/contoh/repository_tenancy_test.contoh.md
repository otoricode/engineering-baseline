# Daftar periksa lintas-penyewa — fitur `contoh` (tag `contoh`)

Dibangkitkan genmodule dari kontrak. Ia BUKAN kode: tipe store konkretmu, konstruktor konteks
penyewamu, driver basis datamu, dan pustaka assertion-mu adalah empat API yang standar ini tidak
nyatakan — dan generator yang mengarangnya akan memancarkan uji yang tidak kompilasi di mana pun
kecuali satu proyek. Yang portabel adalah kewajibannya, dan itu isi berkas ini.

SALIN jadi uji sungguhan di sebelah lapis kueri, lalu HAPUS berkas ini.

## Kenapa lapis kueri tidak ikut dibangkitkan

Batas penyewa hidup di predikat kueri dan tidak bisa diturunkan dari kontrak (T-01). Generator
yang menyentuh lapis itu adalah generator yang mengarang batas keamanan. Sampai kau menulisnya,
modul ini boot dengan store nil dan setiap operasinya berhenti keras saat dipanggil.

## Metode yang WAJIB punya uji predikat penyewa

Hanya metode berbentuk `(ctx)` dan `(ctx, id string)` yang terdaftar di sini, dan itu batasan
sadar: metode bermuatan menulis baris saat dijalankan, jadi menjalankannya tanpa penyiapan bukan
hal yang bisa digeneralisasi. Bentuk `(ctx, id)` justru kelas yang PALING SERING BOCOR — id
telanjang dari path, langsung ke basis data, tanpa predikat penyewa (T-02).

- [ ] `GetContohById` (ctx, contohId string) — GET /contoh/{contohId}

## Dua assertion per metode, dan keduanya wajib

1. **Predikat penyewa ADA di SQL yang dipancarkan.** Assertion-nya SQL-nya, bukan bentuk
   pemanggilannya: uji berbasis store tiruan tidak pernah menyentuh SQL, dan karena itu tidak
   bisa menangkap kelas cacat ini sama sekali. Isi predikat yang BENAR untuk modelmu — kolom
   penyewa langsung, lewat relasi, atau filter cakupan wilayah. Generator tidak tahu yang mana,
   dan menebaknya melahirkan uji yang hijau untuk predikat yang salah.
2. **Konteks TANPA penyewa tidak menyentuh basis data sama sekali.** Bukan "membalas galat":
   balasan galat yang benar di atas kueri tanpa batas penyewa tetap kebocoran (T-03). Yang
   di-assert adalah NOL kueri dipancarkan.

Untuk menangkap SQL tanpa basis data sungguhan, pakai mode dry-run lapis akses datamu kalau ia
punya — DSN yang sengaja tak terjangkau sudah cukup, karena SQL-nya dibangun tanpa dijalankan.

## Metode yang tabelnya memang GLOBAL

Hapus dari daftar ini, dan tulis alasannya di uji arsitektur lingkup penyewa — bukan di sini,
dan bukan hanya di pesan commit. Pengecualian yang diam adalah lolos-diam yang baru.

## Bukti yang TIDAK sah untuk mencentang daftar ini

Bahwa pemeriksa permission ada, bahwa CI hijau, bahwa gate kategori guard lulus, atau bahwa UI
tidak pernah menawarkan id semacam itu (T-04). Lubang kelas ini hanya terlihat lewat id yang tak
pernah ditawarkan UI.
