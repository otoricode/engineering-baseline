import path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Akar PAKET ini — bukan akar proyek target.
 *
 * Perbedaan itu satu-satunya alasan berkas ini ada, dan ia sudah pernah salah: alat Go paket ini
 * hidup di `tooling/` (sebuah modul Go tersendiri), jadi pembungkus WAJIB menjalankannya dengan
 * cwd di dalam `tooling/` PAKET. Sementara config yang harus dibaca alat itu adalah config PROYEK
 * TARGET. Dua akar yang berbeda, dan `-config` bawaan alat Go adalah cwd — jadi pembungkus yang
 * tidak menyebut `-config` secara eksplisit akan menyuruh alat memungut `standard.config.json`
 * milik PAKET (kalau ada) atau gagal mencari sampai akar filesystem, bukan membaca config proyek
 * yang sedang dikerjakan. Keduanya gagal ke arah yang sama buruknya: yang pertama menggenerate
 * memakai layout paket ini sendiri, yang kedua menolak jalan dengan alasan yang menyesatkan.
 *
 * Diturunkan dari `import.meta.url`, BUKAN dari `process.cwd()`: cwd adalah proyek target saat
 * subperintah dijalankan, jadi menurunkan akar paket darinya akan menghasilkan jalur yang benar
 * hanya ketika keduanya kebetulan sama — yaitu saat mengembangkan paket ini sendiri, satu-satunya
 * keadaan yang tidak pernah dialami pemakainya.
 */
export function akarPaket(): string {
  return path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
}

/** Direktori modul Go paket ini; cwd untuk `go run ./genmodule` dan `go run ./gendto`. */
export function dirTooling(): string {
  return path.join(akarPaket(), "tooling");
}

/** Direktori skrip kontrak paket ini; argumen berkas untuk `tsx`. */
export function dirSkripKontrak(): string {
  return path.join(dirTooling(), "contract-scripts");
}

/**
 * Penerjemah TypeScript paket ini. `bin/standard` sudah memakai jalur yang sama, jadi keberadaan
 * `node_modules` di dalam salinan paket bukan asumsi baru yang berkas ini perkenalkan — ia syarat
 * pemasangan yang sudah berlaku sejak shim-nya ditulis.
 */
export function jalurTsx(): string {
  return path.join(akarPaket(), "node_modules", ".bin", "tsx");
}
