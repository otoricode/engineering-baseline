/**
 * Sitiran ID aturan untuk pesan gagal gate — penegakan [[G-04]] di sisi alat.
 *
 * `config.rules.prefix` memetakan LAPIS ke prefix ID (`contract` -> `C`), jadi gate yang
 * dipasang di proyek yang menomori aturannya sendiri tetap menyitir ID yang benar DI PROYEK ITU.
 * Yang TIDAK dikonfigurasi adalah NOMOR butirnya: `C-01` selalu "envelope tunggal" karena
 * nomornya milik standar ini, bukan milik proyek yang memasangnya.
 *
 * Degradasi, bukan macet: prefix yang KOSONG (`""`) membuat gate tetap berjalan dan tetap
 * melaporkan pelanggarannya — hanya labelnya yang berubah jadi bentuk yang mengaku tidak bisa
 * menyebut ID, lengkap dengan kunci config yang harus diisi. Ini disengaja dan penting: gate
 * yang MATI karena config kurang lengkap adalah gate yang tidak memeriksa apa pun, dan itu
 * kerugian yang jauh lebih besar daripada label yang kurang tajam.
 *
 * Yang TIDAK dilakukan berkas ini, dan itu batas yang perlu disebut saat mengutipnya: ia
 * menjamin ID yang dicetak PUNYA bentuk yang benar, bukan bahwa ID itu aturan yang TEPAT untuk
 * pelanggaran yang sedang dilaporkan. Pemetaan pemeriksaan -> aturan adalah keputusan per pesan,
 * ditulis di tiap skrip, dan hanya review yang bisa membantahnya ([[G-04]] menyebut separuh ini
 * `manual-review-only` juga).
 */
import type { StandardConfig } from "../../src/config/schema.js";
import type { T } from "./pesan.js";

/**
 * Lapis yang skrip-skrip di direktori ini sitir. Sengaja dibatasi ke empat kunci yang
 * `config.schema.json` WAJIBKAN — lapis di luar itu boleh ada di config (blok `prefix` sengaja
 * terbuka untuk kedelapan lapis), tapi tidak ada gate kontrak yang menegakkannya, jadi
 * menyebutnya di sini akan mengarang kewajiban yang tak seorang pun periksa.
 */
export type Lapis = "contract" | "backend" | "gate" | "tenancy";

export type Sitiran = {
  /** ID lengkap (`C-01`), atau `null` kalau prefix lapisnya kosong. */
  id(lapis: Lapis, nomor: string): string | null;
  /** Label siap tempel di depan pesan gagal — selalu ada, bentuknya yang berbeda. */
  label(lapis: Lapis, nomor: string): string;
  /** Baris penutup "baca aturannya di mana", dipakai di kaki keluaran gate. */
  footer(lapis: Lapis, nomor: string): string;
};

/**
 * Pencatat sitiran: memulangkan label persis seperti `Sitiran.label`, TAPI mencatat aturan mana
 * yang benar-benar dipakai, supaya kaki keluaran hanya menunjuk aturan yang sungguh disitir.
 *
 * Kenapa ini perlu: sebuah gate bisa menyitir beberapa aturan, dan kakinya dicetak di AKHIR — jauh
 * dari temuannya. Kaki yang dipaku ke daftar tetap lalu mengirim pembaca ke aturan yang tidak
 * pernah menyala, dan pembaca membuka paragraf yang tidak menjelaskan temuannya. Terukur di gate
 * rute: satu temuan tabrakan nama parameter mencetak kaki yang menunjuk aturan pemasangan modul
 * dan aturan buku besar — dua aturan yang tak ada hubungannya dengan temuan itu.
 */
export type Pengumpul = {
  /** Label untuk ditempel di depan temuan; mendaftarkan aturannya sebagai KANDIDAT kaki. */
  label(lapis: Lapis, nomor: string): string;
  /**
   * Kaki untuk aturan yang benar-benar muncul di `temuan`, satu per baris; string kosong kalau nol.
   *
   * Disaring dari TEMUANNYA, bukan dari catatan pemanggilan `label()`. Bedanya menentukan: sebagian
   * label dirakit di muka untuk diteruskan ke fungsi pemeriksa sebagai prefix, jadi "pernah dirakit"
   * tidak sama dengan "pernah menyala" — dan kaki yang memakai catatan pemanggilan akan menunjuk
   * aturan yang nol temuannya, persis kesalahan arah yang fungsi ini ada untuk menutupnya.
   */
  kaki(temuan: string[]): string;
};

export function buatPengumpul(aturan: Sitiran): Pengumpul {
  const kandidat = new Map<string, { lapis: Lapis; nomor: string; label: string }>();
  return {
    label: (lapis, nomor) => {
      const label = aturan.label(lapis, nomor);
      kandidat.set(`${lapis}:${nomor}`, { lapis, nomor, label });
      return label;
    },
    kaki: (temuan) =>
      [...kandidat.values()]
        .filter((k) => temuan.some((e) => e.includes(k.label)))
        .map((k) => aturan.footer(k.lapis, k.nomor))
        .join("\n"),
  };
}

export function buatSitiran(config: StandardConfig, t: T): Sitiran {
  const id = (lapis: Lapis, nomor: string): string | null => {
    const prefix = config.rules.prefix[lapis];
    // `undefined` dan `""` diperlakukan sama, dan `.trim()` bukan kerapian: `"  "` lolos
    // `{"type":"string"}` di skema config, dan tanpa trim ia menghasilkan ID bernama `"  -01"`
    // yang terlihat seperti ID sungguhan di keluaran CI.
    if (prefix === undefined || prefix.trim() === "") return null;
    return `${prefix.trim()}-${nomor}`;
  };

  return {
    id,
    label: (lapis, nomor) => {
      const nyata = id(lapis, nomor);
      return nyata === null
        ? t("kontrak.sitiran_tanpa_prefix", { lapis, nomor })
        : t("kontrak.sitiran", { id: nyata });
    },
    footer: (lapis, nomor) => {
      const nyata = id(lapis, nomor);
      return t("kontrak.footer_aturan", {
        docBase: config.rules.docBase,
        id: nyata ?? t("kontrak.sitiran_tanpa_prefix", { lapis, nomor }),
      });
    },
  };
}
