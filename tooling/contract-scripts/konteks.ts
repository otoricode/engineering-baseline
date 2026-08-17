/**
 * Konteks yang SETIAP skrip di direktori ini butuhkan: jalur, config, perender pesan, dan
 * penyitir aturan. Dirakit sekali di satu tempat supaya tidak ada skrip yang merakitnya
 * sendiri dengan sedikit berbeda — mis. memuat katalog `id` sementara config bilang `en`.
 */
import { buatSitiran, type Sitiran } from "./aturan.js";
import { buatJalur, muatJalur, type Jalur } from "./paths.js";
import { muatT, type T } from "./pesan.js";
import type { StandardConfig } from "../../src/config/schema.js";
import { muatPesan } from "../../src/messages/index.js";
import { buatT } from "./pesan.js";

export type Konteks = {
  jalur: Jalur;
  config: StandardConfig;
  t: T;
  aturan: Sitiran;
};

/**
 * Tiga kode keluar, dan perbedaannya bermakna bagi pemanggil otomatis:
 *
 *   0  pemeriksaannya berjalan dan lulus
 *   1  pemeriksaannya berjalan dan menemukan PELANGGARAN — perbaiki kontrak/kodenya
 *   2  ALATNYA yang gagal (config salah, berkas tak terbaca, bentuk tak dikenal) — pemeriksaannya
 *      TIDAK berjalan, jadi "tidak ada temuan" di sini bukan kabar baik
 *
 * Tanpa pemisahan itu, pembungkus yang menjalankan semua gate berurutan tidak bisa membedakan
 * "kontraknya salah" dari "gate-nya tidak jalan", dan keduanya menuntut tindakan yang berbeda.
 */
export const KELUAR_PELANGGARAN = 1;
export const KELUAR_ALAT_GAGAL = 2;

/**
 * Galat yang tak tertangkap dicetak sebagai PESANNYA, bukan sebagai stack trace Node.
 *
 * Skrip-skrip di sini menghasilkan pesan galat terkurasi yang menyebut berkas, baris, dan apa yang
 * harus diperbaiki. Membiarkannya keluar sebagai stack trace membuang seluruh kurasi itu tepat
 * pada momen orang paling butuh: keluaran CI yang merah. Stack-nya tetap tersedia lewat `DEBUG`,
 * karena membuangnya SELAMANYA akan menyembunyikan bug pemrograman sungguhan — dan galat terkurasi
 * tidak bisa dibedakan dari `TypeError` tanpa membaca stack-nya.
 */
function pasangPencetakGalat(): void {
  process.on("uncaughtException", (e: unknown) => {
    const pesan = e instanceof Error ? e.message : String(e);
    console.error(pesan);
    if (process.env["DEBUG"] && e instanceof Error) console.error(e.stack);
    process.exit(KELUAR_ALAT_GAGAL);
  });
}

export async function muatKonteks(): Promise<Konteks> {
  pasangPencetakGalat();
  const { jalur, config } = await muatJalur();
  const t = await muatT(config.language);
  return { jalur, config, t, aturan: buatSitiran(config, t) };
}

/** Perakit murni — dipakai uji supaya konteks bisa dibangun tanpa `standard.config.json`. */
export async function buatKonteks(config: StandardConfig, akar: string): Promise<Konteks> {
  const t = buatT(await muatPesan(config.language));
  return { jalur: buatJalur(config, akar), config, t, aturan: buatSitiran(config, t) };
}
