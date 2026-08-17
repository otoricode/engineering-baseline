import { readFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export type Pesan = Record<string, string>;

function jalurKatalog(bahasa: "id" | "en"): string {
  const dirPaket = path.dirname(fileURLToPath(import.meta.url));
  return path.join(dirPaket, "..", "..", "tooling", "messages", `${bahasa}.json`);
}

export async function muatPesan(bahasa: "id" | "en"): Promise<Pesan> {
  const jalur = jalurKatalog(bahasa);
  const mentah = JSON.parse(await readFile(jalur, "utf8")) as unknown;
  return validasiPesan(mentah, jalur);
}

const singgahanSinkron = new Map<string, Pesan>();

/**
 * Varian SINKRON, untuk satu keadaan saja: fungsi murni yang harus melempar galat BERBAHASA tanpa
 * bisa menunggu (mis. perakit perintah `gen`, yang dipanggil dari uji dengan dua argumen).
 *
 * Ia memuat katalog `id` sebagai bawaan dengan alasan yang sama seperti `GalatConfig` di
 * `config/load.ts`: itu bahasa penulisan paket ini sendiri, dan pemanggil yang TAHU bahasa proyek
 * (subperintah, sesudah `loadConfig` berhasil) meneruskan katalognya sendiri alih-alih memakai
 * bawaan ini. Jangan memakainya di jalur yang punya akses ke `config.language`.
 */
export function muatPesanSinkron(bahasa: "id" | "en"): Pesan {
  const tersimpan = singgahanSinkron.get(bahasa);
  if (tersimpan !== undefined) return tersimpan;
  const jalur = jalurKatalog(bahasa);
  const pesan = validasiPesan(JSON.parse(readFileSync(jalur, "utf8")) as unknown, jalur);
  singgahanSinkron.set(bahasa, pesan);
  return pesan;
}

// Katalog ini berkas data yang diedit tangan oleh task lain (Task 8/9/10 menambah kunci) dan
// oleh pemakai paket di proyek mereka sendiri — `as Pesan` bukan jaminan runtime. Tolak apa pun
// yang bukan objek datar bernilai string SEBELUM ia lolos ke `msg()`, karena pembaca Go yang
// membaca berkas yang sama tidak punya cara memulihkan diri dari kunci bersarang atau nilai
// non-string.
export function validasiPesan(mentah: unknown, jalur: string): Pesan {
  if (typeof mentah !== "object" || mentah === null || Array.isArray(mentah)) {
    const bentuk = Array.isArray(mentah) ? "array" : typeof mentah;
    throw new Error(`${jalur}: isi bukan objek datar (dapat ${bentuk}).`);
  }
  for (const [kunci, nilai] of Object.entries(mentah as Record<string, unknown>)) {
    if (typeof nilai !== "string") {
      throw new Error(`${jalur}: kunci "${kunci}" bernilai bukan string (dapat ${typeof nilai}).`);
    }
  }
  return mentah as Pesan;
}

export function msg(pesan: Pesan, kunci: string, vars: Record<string, string> = {}): string {
  const templat = pesan[kunci];
  if (templat === undefined) {
    throw new Error(`kunci pesan tidak dikenal: ${kunci}`);
  }
  return templat.replace(/\{(\w+)\}/g, (utuh, nama: string) => vars[nama] ?? utuh);
}
