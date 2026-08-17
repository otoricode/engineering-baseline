/**
 * `gofmt -w` satu berkas Go hasil generate, dipakai bersama oleh semua generator di direktori ini.
 *
 * Bukan kerapian kosmetik, dan angkanya yang menjelaskan kenapa: sebuah berkas konstanta yang
 * sudah gofmt-rata ditulis ULANG **197 dari 197 baris** begitu diregenerasi tanpa langkah ini,
 * tanpa satu pun perubahan semantik — karena templat string generator tidak meratakan kolomnya.
 * Artinya gate yang meregenerasi lalu menuntut diff kosong ([[B-03]]) akan MERAH karena alasan
 * yang salah, dan gate yang merah tanpa sebab jelas adalah gate yang ditumpulkan orang: di-skip,
 * bukan diperbaiki akar masalahnya.
 *
 * Memanggil TOOLCHAIN Go asli di sini bukan pelanggaran disiplin "jangan membaca sumber Go dengan
 * teks": gofmt adalah alat yang BENAR untuk memformat. Larangan itu ada karena grep adalah alat
 * yang SALAH untuk membaca MAKNA — komentar dan string terbaca sebagai kode ([[O-04]]).
 */
import { execFileSync } from "node:child_process";
import type { T } from "../pesan.js";

/**
 * Jalankan `gofmt -w` pada `jalur`, lalu verifikasi lewat `gofmt -l` bahwa hasilnya BENAR-BENAR
 * gofmt-bersih. Melempar (bukan diam-diam lolos) kalau berkasnya masih terdaftar `-l` sesudah
 * `-w`: itu berarti templat generator menghasilkan sesuatu yang gofmt sendiri tidak bisa
 * stabilkan sekali jalan — mis. Go yang tidak valid. Gagal nyaring lebih baik daripada gate CI
 * yang meregenerasi tanpa henti.
 */
export function gofmtWrite(jalur: string, t: T): void {
  execFileSync("gofmt", ["-w", jalur], { stdio: "pipe" });
  const kotor = execFileSync("gofmt", ["-l", jalur], { stdio: "pipe" }).toString().trim();
  if (kotor) throw new Error(t("kontrak.gen.gofmt_tak_stabil", { jalur }));
}
