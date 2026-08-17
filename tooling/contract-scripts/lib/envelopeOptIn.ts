/**
 * Pembacaan buku besar opt-in envelope: tag (atau operasi tunggal) mana yang responsnya SUDAH
 * memakai envelope tunggal, plus baseline yang gate envelope pakai.
 *
 * Ini allowlist [[G-02]], bukan baseline [[G-03]]: daftar ini tumbuh dengan menambah VERIFIKASI
 * (satu entri baru = satu tag dituntut lulus), bukan dengan menambah pengampunan. Tag di luar
 * daftar TIDAK sedang diampuni — ia belum diklaim bersih.
 *
 * Nama berkasnya tidak pernah muncul di sini: jalurnya datang dari `jalur.ledger("envelopeOptIn")`
 * dan diteruskan sebagai `label` supaya pesan galat tetap menunjuk berkas yang benar di proyek
 * mana pun.
 */
import type { T } from "../pesan.js";

export type OptIn = { tags: Set<string>; ops: Set<string> };

/** Satu entri mentah dipecah jadi bentuk TAG atau OPERATIONID — persis satu di antaranya. */
export type SplitEntry = { tag: string; op?: undefined } | { tag?: undefined; op: string };

/**
 * Baseline yang gate envelope dan gate badan permintaan pakai, dibaca dari buku besar yang sama.
 *
 * Defaultnya NOL, dan itu keputusan yang disengaja: proyek baru memang harus punya nol operasi
 * belum-terimplementasi dan nol `nullable` di badan permintaan. Proyek yang mengadopsi standar
 * ini di atas kode yang sudah ada menuliskan angkanya SEKALI, terlihat di diff, lalu menurunkannya
 * ([[G-03]]). Default yang longgar akan membuat kedua gate lahir hijau tanpa ada yang memutuskan.
 */
export type Baseline = { belumDiimplementasi: number; badanNullable: number };

/**
 * Pisahkan SATU entri mentah jadi tag penuh atau operationId. Dipakai parser opt-in DAN pelacak
 * "entri tidak cocok operasi apa pun" — satu tempat, supaya keduanya tidak menyimpang (dua parser
 * untuk kelas yang sama akan menyimpang, dan itu terukur).
 */
export function splitEntry(entry: unknown, label: string, t: T): SplitEntry {
  if (typeof entry !== "string" || !entry.trim()) {
    throw new Error(t("kontrak.optin.entri_bukan_string", { berkas: label, entri: JSON.stringify(entry) }));
  }
  const i = entry.indexOf(":");
  if (i < 0) return { tag: entry };
  const tag = entry.slice(0, i).trim();
  const op = entry.slice(i + 1).trim();
  if (!tag || !op) throw new Error(t("kontrak.optin.entri_tak_lengkap", { berkas: label, entri: entry }));
  return { op };
}

/** Entri: `"buku-tamu"` (satu tag penuh) atau `"public:postPublicBukuTamu"` (satu operasi). */
export function parseOptIn(raw: unknown, label: string, t: T): OptIn {
  const list = (raw as { tags?: unknown } | null)?.tags;
  if (!Array.isArray(list)) throw new Error(t("kontrak.optin.tags_bukan_array", { berkas: label }));
  const tags = new Set<string>();
  const ops = new Set<string>();
  for (const entry of list) {
    const parsed = splitEntry(entry, label, t);
    if (parsed.tag !== undefined) tags.add(parsed.tag);
    else ops.add(parsed.op);
  }
  return { tags, ops };
}

/** Daftar entri mentah, apa adanya — dipakai melacak entri yang tak pernah cocok apa pun. */
export function entriMentah(raw: unknown, label: string, t: T): string[] {
  const list = (raw as { tags?: unknown } | null)?.tags;
  if (!Array.isArray(list)) throw new Error(t("kontrak.optin.tags_bukan_array", { berkas: label }));
  return list.map((e) => String(e));
}

/**
 * Baca baseline dari buku besar yang sama. Nilai yang bukan bilangan bulat non-negatif
 * diperlakukan sebagai TIDAK ADA (yaitu nol) — bukan dibiarkan mengalir sebagai `NaN`, yang
 * membuat setiap perbandingan `>` bernilai false dan mematikan gate-nya tanpa suara.
 */
export function bacaBaseline(raw: unknown): Baseline {
  const b = (raw as { baseline?: Record<string, unknown> } | null)?.baseline ?? {};
  const angka = (v: unknown): number =>
    typeof v === "number" && Number.isInteger(v) && v >= 0 ? v : 0;
  return {
    belumDiimplementasi: angka(b["belumDiimplementasi"]),
    badanNullable: angka(b["badanNullable"]),
  };
}

/**
 * Tag yang sudah diaudit untuk manifest validasi isi badan permintaan — allowlist [[G-02]] kedua,
 * di berkas yang sama. Generator meregenerasi SELURUH tag; tanpa daftar ini, menyentuh templat
 * bersama akan menyalakan validasi baru yang belum diaudit di SEMUA tag sekaligus.
 */
export function tagValidasiIsi(raw: unknown): Set<string> {
  const list = (raw as { contentValidationTags?: unknown } | null)?.contentValidationTags;
  return new Set(Array.isArray(list) ? list.map((e) => String(e)) : []);
}

export function isOptedIn(op: { tags?: string[]; operationId?: string }, o: OptIn): boolean {
  if (op.operationId && o.ops.has(op.operationId)) return true;
  return (op.tags ?? []).some((t) => o.tags.has(t));
}

export function isEmpty(o: OptIn): boolean {
  return o.tags.size === 0 && o.ops.size === 0;
}
