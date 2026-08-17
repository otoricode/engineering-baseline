/**
 * Pembacaan DIREKTORI feature — bukan pembacaan kode.
 *
 * Berkas ini dulu memuat parser regex atas berkas pendaftaran tiap feature: satu fungsi membaca
 * pemanggilan rute literal, satu lagi membaca peta guard deklaratif, dan gate membandingkan
 * hasilnya terhadap kontrak. Semuanya DIHAPUS, bukan diperbaiki.
 *
 * Alasannya mengikat dan berlaku di proyek mana pun: sejak sebuah modul memasang rutenya lewat
 * wiring hasil generate, rutenya TIDAK LAGI tertulis di berkas pendaftaran — ia lahir di berkas
 * generated, DITURUNKAN DARI KONTRAK YANG SAMA. Membandingkan kontrak terhadap sesuatu yang
 * digenerate dari kontrak hanya membuktikan generatornya jalan ([[G-05]]).
 *
 * Yang menggantikan perbandingannya: buku besar modul (dijaga dua arah, `mountedModules.ts`) di
 * sisi kontrak, dan uji per modul di sisi server yang menuntut kecocokan dua arah antara rute
 * yang BENAR-BENAR terpasang di router produksi dan spec hasil generate ([[B-01]]).
 *
 * Modul yang belum memakai wiring generated tidak diperiksa gate ini — dan itu keadaan yang
 * jujur, bukan pengampunan: ia belum diklaim bersih ([[G-02]]).
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * Kedua ejaan berkas pendaftaran yang sah, dalam urutan prioritas baca.
 *
 * Ejaan ber-`.gen` adalah keadaan TERGENERATE: modulnya sudah punya titik pendaftaran dan sudah
 * terpasang, kerangkanya cuma belum dibekukan. Ia harus dihitung persis seperti ejaan biasa di
 * setiap gate — kalau tidak, modul tergenerate terbaca "tidak punya berkas pendaftaran" dan
 * gate-nya memerah karena alasan yang salah, tepat pada modul yang paling butuh diperiksa.
 */
export const NAMA_REGISTER = ["register.go", "register.gen.go"] as const;

/** Jalur berkas pendaftaran sebuah feature, atau null bila tidak ada satu pun ejaannya. */
export function registerPath(featureDir: string, feature: string): string | null {
  for (const nama of NAMA_REGISTER) {
    const p = join(featureDir, feature, nama);
    if (existsSync(p)) return p;
  }
  return null;
}

/**
 * Nama direktori (bukan jalur) di bawah `featureDir` yang punya berkas pendaftaran — himpunan
 * fitur yang SEHARUSNYA terpasang di titik masuk.
 *
 * Fitur yang punya berkasnya tapi tak pernah terpasang adalah RUTE HANTU: kontrak dituntut
 * menyediakan operasi untuk endpoint yang tak pernah melayani trafik ([[B-01]]).
 */
export function listFeatureDirsWithRegister(featureDir: string): string[] {
  const out: string[] = [];
  for (const feature of readdirSync(featureDir, { withFileTypes: true })) {
    if (!feature.isDirectory()) continue;
    if (registerPath(featureDir, feature.name) !== null) out.push(feature.name);
  }
  return out;
}
