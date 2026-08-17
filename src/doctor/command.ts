import type { Subperintah } from "../cli.js";
import { GalatConfig, loadConfig } from "../config/load.js";
import { msg, muatPesan } from "../messages/index.js";
import { jalankanDoctor } from "./index.js";

// Bahasa dipakai untuk merender `GalatConfig` — kegagalan `loadConfig` yang terjadi SEBELUM
// config berhasil dibaca, jadi SEBELUM `config.language` bisa diketahui sama sekali. "id"
// dipilih sebagai bawaan, bukan tebakan acak, karena dua alasan konkret: (1) itu bahasa
// penulisan paket ini sendiri — SPEC, PLAN, seluruh dokumen aturan, dan komentar kode semuanya
// Indonesia per Global Constraints; (2) `tooling/config.example.json`, contoh kanonis paket
// ini, sendiri memakai `"language": "id"`. Begitu config BERHASIL dibaca, cabang di bawah
// (baik temuan maupun status sehat) memakai `config.language` yang sesungguhnya, bukan bawaan
// ini — bawaan ini HANYA berlaku untuk kegagalan sebelum config terbaca.
const BAHASA_BAWAAN_GALAT_CONFIG = "id";

export const doctor: Subperintah = async (_argv, tulis) => {
  let config, akar;
  try {
    ({ config, akar } = await loadConfig(process.cwd()));
  } catch (e) {
    if (e instanceof GalatConfig) {
      const pesan = await muatPesan(BAHASA_BAWAAN_GALAT_CONFIG);
      tulis(msg(pesan, e.kode, e.params));
    } else {
      tulis((e as Error).message);
    }
    return 2;
  }

  const hasil = await jalankanDoctor(config, akar);
  for (const t of hasil.temuan) tulis(t);
  if (hasil.temuan.length === 0) {
    const pesan = await muatPesan(config.language);
    tulis(msg(pesan, "doctor.sehat", { jumlah: String(hasil.jumlahPemeriksaan) }));
    return 0;
  }
  return 1;
};
