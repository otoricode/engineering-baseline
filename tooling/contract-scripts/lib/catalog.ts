/**
 * Katalog permission: vokabuler TERTUTUP, dibaca dari kontrak dan dicocokkan terhadap data seed.
 *
 * Nama permission adalah DATA, bukan enum kode: ia baris di basis data yang sudah dipegang role
 * di produksi. Menggantinya adalah migrasi data plus penugasan ulang role, dan mode gagalnya
 * adalah *seseorang kehilangan akses tanpa ada yang sadar*. Karena itu nama warisan yang
 * melanggar pola penamaan DIBIARKAN apa adanya dan didaftar terpisah; pola berlaku hanya untuk
 * entri baru ([[C-03]] butir 5).
 */
import { readFileSync } from "node:fs";
import { parse } from "yaml";

export type PermissionCatalog = {
  permissions: string[];
  legacyNames: string[];
};

/**
 * Aksi yang diakui di akhir nama permission. Daftar TERTUTUP — menambah aksi baru adalah
 * keputusan sadar, bukan efek samping dari seseorang mengarang nama.
 */
const AKSI = ["READ", "CREATE", "UPDATE", "DELETE", "MANAGE", "EXPORT", "IMPORT", "APPROVE"];

/**
 * Pola kanonik: `<DOMAIN>_<AKSI>`, dengan DOMAIN boleh bersegmen banyak (`SURAT_TEMPLATE_MANAGE`).
 * Yang ditolak: nama domain TELANJANG tanpa aksi (`BUMDES`) — ia menempati kolom yang seharusnya
 * berisi alasan — dan urutan terbalik (`CREATE_GRUP_TEMPLATE`).
 */
export function isCanonicalPermissionName(name: string): boolean {
  if (!/^[A-Z][A-Z0-9_]*$/.test(name)) return false;
  const parts = name.split("_");
  if (parts.length < 2) return false;
  if (!AKSI.includes(parts[parts.length - 1]!)) return false;
  // Aksi dilarang muncul di awal — itu urutan terbalik.
  if (AKSI.includes(parts[0]!)) return false;
  return true;
}

export function loadPermissionCatalog(jalur: string): PermissionCatalog {
  const doc = parse(readFileSync(jalur, "utf8")) as {
    permissions?: string[];
    legacyNames?: string[];
  };
  return {
    permissions: [...(doc.permissions ?? [])].sort(),
    legacyNames: [...(doc.legacyNames ?? [])].sort(),
  };
}

/**
 * Ekstrak kode permission LITERAL dari satu berkas sumber data seed — hanya nilai pada field
 * `code:`/`code =`/`Code:` yang berupa STRING LITERAL, BUKAN setiap string huruf-besar di berkas.
 * Fungsi murni (bukan IO) supaya bisa diuji tanpa berkas sungguhan.
 *
 * Kenapa presisi field-spesifik dan bukan superset kasar: objek seed yang sama biasanya juga
 * punya field lain bergaya huruf besar (tingkat, tipe organisasi, nilai enum) yang cocok pola
 * huruf-besar tapi BUKAN kode permission. Terukur di proyek asal: regex superset menangkap 210
 * kandidat dan menuntut kurasi tangan (18 dibuang); versi field-spesifik ini menghasilkan 192
 * dengan NOL kurasi, identik dengan katalog yang sudah dikurasi.
 *
 * Sengaja mengabaikan `code: string` (deklarasi tipe), `code: {` (filter kueri), dan
 * `code: variabel.code` (rujukan variabel) — ketiganya lazim ada di berkas yang sama tapi bukan
 * nilai permission; pola kutip di bawah menolak ketiganya karena bukan string literal.
 */
export function extractPermissionCodesFromSource(src: string): string[] {
  return [...src.matchAll(/\b[Cc]ode\s*[:=]\s*["'`]([A-Z][A-Z0-9_]*)["'`]/g)].map((m) => m[1]!);
}

/** Union kode permission dari beberapa berkas sumber data seed sekaligus. */
export function readSeederPermissionCodes(jalurBerkas: string[]): Set<string> {
  const found = new Set<string>();
  for (const jalur of jalurBerkas) {
    for (const code of extractPermissionCodesFromSource(readFileSync(jalur, "utf8"))) {
      found.add(code);
    }
  }
  return found;
}

// Di proyek asal ada satu mekanisme lagi di sini: baseline pengecualian untuk permission yang
// dipakai `x-permission` tapi belum ada di katalog, plus pendeteksi entri baselinenya yang basi.
// Baseline itu SUDAH KOSONG saat diangkat, dan yang benar untuk baseline kosong bukan dibawa
// serta melainkan DIHAPUS: [[G-03]] butir 3 menyebut baseline yang menyusut sampai nol menghapus
// dirinya sendiri — itu bentuk suksesnya. Membawanya ke sini berarti memasang lubang pengecualian
// permanen yang tidak pernah dipakai siapa pun, di paket yang justru mengajarkan bahwa
// pengecualian tanpa penjaga adalah jalur di mana pemeriksaan tidak berjalan.
