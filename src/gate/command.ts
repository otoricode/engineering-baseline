/**
 * Subperintah `gate` — menjalankan gate paket ini berurutan, lewat SATU permukaan.
 *
 * # Kenapa daftarnya di sini, bukan di tiap pemanggil
 *
 * Makefile proyek target, tiga workflow CI, dan skill agen semuanya perlu menjalankan "gate lapis
 * X". Kalau daftarnya hidup di masing-masing, menambah satu gate menuntut menyunting tiga tempat —
 * dan yang terlewat tidak gagal nyaring: ia menjalankan gate yang lebih sedikit dan tetap hijau.
 * Daftar di bawah adalah satu-satunya salinannya; pemanggil menyebut LAPIS, bukan berkas.
 *
 * # Kode keluar
 *
 * Diteruskan apa adanya dari skrip yang gagal, dan pemisahannya bermakna (lihat `konteks.ts` di
 * skrip kontrak): 1 = pemeriksaannya berjalan dan menemukan pelanggaran; 2 = ALATNYA gagal, jadi
 * pemeriksaannya TIDAK berjalan dan "tidak ada temuan" bukan kabar baik. Berhenti di langkah merah
 * PERTAMA — bundel yang rusak membuat gate berikutnya melapor puluhan temuan turunan yang
 * menenggelamkan sebabnya.
 */
import { existsSync } from "node:fs";
import path from "node:path";
import type { Subperintah, Tulis } from "../cli.js";
import { msg, type Pesan } from "../messages/index.js";
import { bacaArgv } from "../argv.js";
import { cetakBantuanSub, jalankanAlat, mintaBantuan, muatKonteksAlat } from "../gen/command.js";
import { dirSkripKontrak, jalurTsx } from "../paket.js";

export type LapisGate = "contract" | "backend";

export const LAPIS: readonly LapisGate[] = ["contract", "backend"];

export type Langkah = {
  /** Nama yang dipakai `--only`, dan yang muncul di keluaran CI. */
  nama: string;
  /**
   * Lapis yang langkah ini jaga — BOLEH lebih dari satu, dan `routes` adalah alasannya: satu skrip
   * memainkan `gate:backend-routes` (modul terpasang) sekaligus `gate:contract-routes` (tabrakan
   * nama parameter, murni sisi kontrak). Memaksanya ke satu lapis berarti salah satu perubahan —
   * kontrak saja, atau backend saja — melewati pemeriksaan yang justru dirancang untuknya.
   */
  lapis: readonly LapisGate[];
  skrip: string;
  /** Nama gate yang skrip ini mainkan; dicetak supaya pesan CI cocok dengan kolom penegak aturan. */
  gate: readonly string[];
};

export const LANGKAH: readonly Langkah[] = [
  {
    nama: "envelope",
    lapis: ["contract"],
    skrip: "check-envelope.ts",
    gate: ["gate:contract-envelope"],
  },
  {
    nama: "permissions",
    lapis: ["contract"],
    skrip: "check-permissions.ts",
    gate: ["gate:contract-permissions"],
  },
  {
    nama: "public-allowlist",
    lapis: ["contract"],
    skrip: "check-public-allowlist.ts",
    gate: ["gate:contract-permissions"],
  },
  {
    nama: "request-body",
    lapis: ["contract"],
    skrip: "check-request-body.ts",
    gate: ["gate:contract-request-body"],
  },
  {
    nama: "contract-lint",
    lapis: ["contract"],
    skrip: "check-contract-lint.ts",
    gate: ["gate:contract-lint"],
  },
  {
    nama: "routes",
    lapis: ["backend", "contract"],
    skrip: "check-routes.ts",
    gate: ["gate:backend-routes", "gate:contract-routes"],
  },
  {
    nama: "tenancy-checklist",
    lapis: ["backend"],
    skrip: "check-tenancy-checklist.ts",
    gate: ["gate:tenancy-checklist"],
  },
];

export type KunciGate =
  | "cli.bendera_tak_dikenal"
  | "cli.bendera_tanpa_nilai"
  | "cli.posisional"
  | "gate.hanya_tak_dikenal"
  | "gate.lapis_tak_dikenal"
  | "gate.nol_langkah"
  | "gate.langkah"
  | "gate.langkah_gagal"
  | "gate.berkas_hilang"
  | "gate.ok";

export type TGate = (kunci: KunciGate, vars?: Record<string, string>) => string;

export function buatTGate(pesan: Pesan): TGate {
  return (kunci, vars = {}) => msg(pesan, kunci, vars);
}

const BENDERA = [
  { nama: "only", berNilai: true },
  { nama: "lapis", berNilai: true },
];

/**
 * Pemilihan langkah, terpisah dari penjalanannya supaya bisa diuji tanpa menjalankan apa pun.
 *
 * Tiga bentuk masukan yang salah, ketiganya DILAPORKAN alih-alih dibaca sebagai "tidak ada yang
 * perlu dijalankan":
 *
 *   `--only <nama-yang-tak-ada>`   salah ketik nama langkah — tanpa penolakan ia keluar 0 dan CI
 *                                  hijau setelah menjalankan NOL gate;
 *   `--lapis <lapis-yang-tak-ada>` sama, satu tingkat di atasnya;
 *   irisan kosong                  `--only envelope --lapis backend` menyebut dua hal yang sah
 *                                  masing-masing tapi tidak beririsan.
 *
 * Ketiganya melempar. Gate yang menjalankan nol pemeriksaan tidak boleh terbaca sama dengan gate
 * yang lulus — itu bentuk "hijau dan buta terlihat sama" yang paling murah untuk dicegah.
 */
export function pilihLangkah(argv: string[], t: TGate): Langkah[] {
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

  const namaLangkah = LANGKAH.map((l) => l.nama);
  const hanya = b.nilai("only");
  if (hanya !== undefined && !namaLangkah.includes(hanya)) {
    throw new Error(t("gate.hanya_tak_dikenal", { nama: hanya, dikenal: namaLangkah.join(", ") }));
  }
  const lapis = b.nilai("lapis");
  if (lapis !== undefined && !LAPIS.includes(lapis as LapisGate)) {
    throw new Error(t("gate.lapis_tak_dikenal", { nama: lapis, dikenal: LAPIS.join(", ") }));
  }

  const terpilih = LANGKAH.filter(
    (l) =>
      (hanya === undefined || l.nama === hanya) &&
      (lapis === undefined || l.lapis.includes(lapis as LapisGate)),
  );
  if (terpilih.length === 0) {
    throw new Error(
      t("gate.nol_langkah", {
        pilihan: [hanya === undefined ? "" : `--only ${hanya}`, lapis === undefined ? "" : `--lapis ${lapis}`]
          .filter((s) => s !== "")
          .join(" "),
        dikenal: namaLangkah.join(", "),
      }),
    );
  }
  return terpilih;
}

export const gate: Subperintah = async (argv, tulis) => {
  // Bantuan sebelum config, alasan yang sama dengan `gen`: yang paling butuh melihat daftar
  // langkahnya adalah orang yang belum punya config sama sekali.
  if (mintaBantuan(argv)) {
    return cetakBantuanSub(tulis, "cli.bantuan_gate", {
      langkah: LANGKAH.map((l) => `${l.nama} (${l.gate.join(" + ")})`).join("\n  "),
      lapis: LAPIS.join(", "),
    });
  }
  const konteks = await muatKonteksAlat(tulis);
  if (konteks === null) return 2;
  const t = buatTGate(konteks.pesan);

  let terpilih: Langkah[];
  try {
    terpilih = pilihLangkah(argv, t);
  } catch (e) {
    tulis((e as Error).message);
    return 2;
  }

  // Berkas yang hilang dari SALINAN PAKET dilaporkan sebagai kegagalan alat, bukan dibiarkan jadi
  // ENOENT mentah dari `spawn`. Ini kelas kegagalan pemasangan, dan pesannya harus menyebut jalur
  // yang dicari — pemakainya baru saja menyalin paket ini dan tidak punya cara lain menebak
  // bagian mana yang tidak ikut terkirim.
  const tsx = jalurTsx();
  if (!existsSync(tsx)) {
    tulis(t("gate.berkas_hilang", { jalur: tsx, langkah: "tsx" }));
    return 2;
  }

  for (const l of terpilih) {
    const skrip = path.join(dirSkripKontrak(), l.skrip);
    if (!existsSync(skrip)) {
      tulis(t("gate.berkas_hilang", { jalur: skrip, langkah: l.nama }));
      return 2;
    }
    tulis(t("gate.langkah", { nama: l.nama, skrip: l.skrip, gate: l.gate.join(" + ") }));
    let kode: number;
    try {
      kode = await jalankanAlat({
        jenis: "skrip",
        biner: tsx,
        argumen: [skrip],
        cwd: konteks.akar,
        alat: l.nama,
      });
    } catch (e) {
      tulis(t("gate.berkas_hilang", { jalur: tsx, langkah: `${l.nama}: ${(e as Error).message}` }));
      return 2;
    }
    if (kode !== 0) {
      tulis(t("gate.langkah_gagal", { nama: l.nama, kode: String(kode), gate: l.gate.join(" + ") }));
      return kode;
    }
  }

  tulis(t("gate.ok", { jumlah: String(terpilih.length), langkah: terpilih.map((l) => l.nama).join(", ") }));
  return 0;
};
