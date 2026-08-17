/**
 * Subperintah `verify` — pembungkus tipis di atas `jalankanVerify`.
 *
 * # Kode keluarnya BUKAN "nol temuan berarti nol"
 *
 * Kontrak paket ini memisahkan dua keadaan yang mudah tertukar, dan berkas ini adalah tempat
 * pemisahan itu diputuskan untuk `verify`:
 *
 *   0  lulus.
 *   1  pemeriksaannya BERJALAN dan menemukan pelanggaran (`temuan`).
 *   2  ALATNYA sendiri gagal, jadi pemeriksaannya TIDAK berjalan (`alatGagal`).
 *
 * `alatGagal` diperiksa LEBIH DULU: sebuah lari yang tahap 4-nya tidak pernah berjalan karena `go`
 * tidak terpasang punya nol temuan dari tahap itu, dan melaporkannya sebagai 1 (atau lebih buruk,
 * 0) akan menyuruh pembacanya mencari pelanggaran yang tidak pernah diperiksa.
 *
 * # `--update-golden` tidak mengubah kode keluar
 *
 * Ia MENULIS ULANG golden dan keluar 0 — ia dipakai sengaja saat generatornya memang berubah, dan
 * diffnya yang jadi bahan review. Tahap lain tetap berjalan seperti biasa; kalau salah satunya
 * menemukan pelanggaran, kode keluarnya tetap 1.
 */
import type { Subperintah } from "../cli.js";
import { bacaArgv } from "../argv.js";
import { cetakBantuanSub, mintaBantuan } from "../gen/command.js";
import { msg, muatPesan } from "../messages/index.js";
import { jalankanVerify } from "./index.js";

const BENDERA = [{ nama: "update-golden", berNilai: false }];

export const verify: Subperintah = async (argv, tulis) => {
  if (mintaBantuan(argv)) return cetakBantuanSub(tulis, "cli.bantuan_verify", {});

  // Katalog `id`: verify adalah self-test PAKET dan tidak membaca config proyek mana pun (lihat
  // `jalankanVerify`), jadi tidak ada `config.language` untuk diikuti di sini.
  const pesan = await muatPesan("id");
  const t = (kunci: string, vars: Record<string, string> = {}): string => msg(pesan, kunci, vars);

  let perbaruiGolden: boolean;
  try {
    const b = bacaArgv(argv, BENDERA, {
      takDikenal: (bendera, dikenal) => t("cli.bendera_tak_dikenal", { bendera, dikenal }),
      tanpaNilai: (bendera, dikenal) => t("cli.bendera_tanpa_nilai", { bendera, dikenal }),
    });
    if (b.posisi.length > 0) {
      throw new Error(
        t("cli.posisional", {
          argumen: b.posisi.join(" "),
          dikenal: BENDERA.map((d) => `--${d.nama}`).join(", "),
        }),
      );
    }
    perbaruiGolden = b.ada("update-golden");
  } catch (e) {
    tulis((e as Error).message);
    return 2;
  }

  const hasil = await jalankanVerify({ perbaruiGolden, tulis });

  for (const baris of hasil.temuan) tulis(baris);
  for (const baris of hasil.alatGagal) tulis(baris);

  if (hasil.alatGagal.length > 0) return 2;
  if (hasil.temuan.length > 0) {
    tulis(t("verify.ringkas_temuan", { jumlah: String(hasil.temuan.length), tahap: String(hasil.jumlahTahap) }));
    return 1;
  }
  tulis(
    t("verify.ringkas_ok", {
      tahap: String(hasil.jumlahTahap),
      berkas: String(hasil.jumlahBerkasGolden),
    }),
  );
  return 0;
};
