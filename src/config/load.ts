import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Ajv from "ajv";
import { msg, muatPesan } from "../messages/index.js";
import type { StandardConfig } from "./schema.js";

const NAMA = "standard.config.json";

// Kedua kegagalan ini terjadi SEBELUM `config.language` bisa diketahui — config itu sendiri
// yang gagal dibaca, jadi tak ada bahasa pilihan pengguna untuk dirujuk. `.message` dirender
// di katalog `id` (bahasa penulisan paket ini sendiri; lihat Global Constraints) supaya
// pemanggil LAMA yang cuma membaca `.message` tidak berubah perilakunya SAMA SEKALI — teks
// yang dihasilkan identik dengan versi hardcode sebelumnya. Pemanggil yang tahu bahasa mana
// yang mau dipakai (mis. `doctor`) bisa merender ulang dari `.kode` + `.params` di katalog
// pilihannya sendiri, tanpa parsing ulang `.message`.
//
// `.message` diturunkan dari katalog (lewat `msg()`), BUKAN diketik ulang sebagai literal
// terpisah — supaya tidak ada dua salinan teks pesan yang bisa saling menyimpang.
export class GalatConfig extends Error {
  readonly kode: "config.tidak_ditemukan" | "config.skema_gagal";
  readonly params: Record<string, string>;

  private constructor(
    kode: "config.tidak_ditemukan" | "config.skema_gagal",
    params: Record<string, string>,
    pesanTerender: string,
  ) {
    super(pesanTerender);
    this.name = "GalatConfig";
    this.kode = kode;
    this.params = params;
  }

  static async buat(
    kode: "config.tidak_ditemukan" | "config.skema_gagal",
    params: Record<string, string>,
  ): Promise<GalatConfig> {
    const pesan = await muatPesan("id");
    return new GalatConfig(kode, params, msg(pesan, kode, params));
  }
}

export async function loadConfig(
  mulaiDari: string,
): Promise<{ config: StandardConfig; akar: string }> {
  let dir = path.resolve(mulaiDari);
  for (;;) {
    const kandidat = path.join(dir, NAMA);
    // Cakupan try SENGAJA sempit — hanya membungkus pembacaan `kandidat`. `validasi()`
    // membaca berkas lain (`config.schema.json`) dan bisa melempar ENOENT-nya SENDIRI kalau
    // skema itu hilang. Kalau `validasi()` ikut dibungkus di sini, ENOENT skema tertukar
    // dengan "config tak ada di direktori ini": penelusuran diam-diam lanjut naik, dan berakhir
    // dengan pesan yang salah ("config tidak ditemukan") padahal config-nya ADA — cuma skemanya
    // yang hilang. Jangan "rapikan" ini kembali jadi satu blok try.
    let mentah: unknown;
    try {
      mentah = JSON.parse(await readFile(kandidat, "utf8")) as unknown;
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== "ENOENT") throw e;
      mentah = undefined;
    }
    if (mentah !== undefined) {
      return { config: await validasi(mentah, kandidat), akar: dir };
    }
    const naik = path.dirname(dir);
    if (naik === dir) {
      throw await GalatConfig.buat("config.tidak_ditemukan", { dari: mulaiDari });
    }
    dir = naik;
  }
}

async function validasi(mentah: unknown, jalur: string): Promise<StandardConfig> {
  const dirPaket = path.dirname(fileURLToPath(import.meta.url));
  const skema = JSON.parse(
    await readFile(path.join(dirPaket, "..", "..", "tooling", "config.schema.json"), "utf8"),
  ) as object;
  const ajv = new Ajv({ allErrors: true });
  const periksa = ajv.compile(skema);
  if (periksa(mentah)) return mentah as StandardConfig;
  const rincian = (periksa.errors ?? [])
    .map((e) => `${e.instancePath || "/"} ${e.message} ${JSON.stringify(e.params)}`)
    .join("; ");
  throw await GalatConfig.buat("config.skema_gagal", { jalur, rincian });
}
