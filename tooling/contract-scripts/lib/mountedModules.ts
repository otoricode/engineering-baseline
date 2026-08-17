/**
 * Buku besar wiring: modul mana yang rutenya sudah berasal dari kontrak lewat wiring generated,
 * dan mana yang belum.
 *
 * Kenapa berkas ini ada, satu kalimat: sejak modul memakai wiring generated, rutenya TIDAK LAGI
 * tertulis di berkas pendaftarannya — ia lahir dari kontrak. Perbandingan himpunan rute berbasis
 * pembacaan teks karena itu berhenti bermakna untuk modul semacam itu, dan yang membuktikan
 * "rute terpasang == spec kontrak" pindah ke uji per modul di sisi server ([[B-01]]).
 *
 * Yang tersisa untuk dijaga dari sisi kontrak adalah keutuhan buku besar ini sendiri, dan itu
 * WAJIB dua arah ([[G-05]]):
 *
 *   - modul di `mount` harus benar-benar memakai wiring generated — kalau tidak, buku besarnya
 *     mengklaim verifikasi yang tidak ada;
 *   - modul di LUAR `mount` harus TIDAK memakainya — tanpa arah ini, meretrofit sebuah modul
 *     lalu lupa mencatatnya membuat modul itu lolos tanpa diperiksa siapa pun, diam-diam.
 *
 * Satu direktori feature bisa memikul DUA tag, jadi status "sudah mount" dinilai per DIREKTORI,
 * bukan per tag.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { registerPath } from "./routes.js";
import type { T } from "../pesan.js";

export type BukuBesar = {
  mount: Record<string, string>;
  optInBelumMount: Record<string, string>;
  belumOptIn: string[];
  tergenerate: Record<string, string>;
  handWired: Record<string, string>;
};

const BAGIAN = ["mount", "optInBelumMount", "tergenerate", "handWired"] as const;

/** Deteksi pemakaian wiring generated — sengaja sesempit mungkin, BUKAN parser rute. */
const MOUNT_RE = /\.Mount\(/;

/**
 * Muat dan validasi bentuk berkas. Melempar dengan pesan terkurasi (bukan stack trace runtime)
 * supaya kegagalan konfigurasi terbaca sebagai kegagalan konfigurasi.
 */
export function loadBukuBesar(raw: string, label: string, t: T): BukuBesar {
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch (err) {
    throw new Error(t("kontrak.bukubesar.bukan_json", { berkas: label, sebab: (err as Error).message }));
  }
  if (typeof data !== "object" || data === null || Array.isArray(data)) {
    throw new Error(t("kontrak.bukubesar.bukan_objek", { berkas: label }));
  }
  const o = data as Record<string, unknown>;

  for (const bagian of BAGIAN) {
    const v = o[bagian];
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
      throw new Error(t("kontrak.bukubesar.bagian_bukan_objek", { berkas: label, bagian }));
    }
    for (const [tag, dir] of Object.entries(v as Record<string, unknown>)) {
      if (typeof dir !== "string" || dir.trim() === "") {
        throw new Error(t("kontrak.bukubesar.nilai_bukan_direktori", { berkas: label, bagian, tag }));
      }
    }
  }
  if (!Array.isArray(o["belumOptIn"]) || (o["belumOptIn"] as unknown[]).some((x) => typeof x !== "string")) {
    throw new Error(t("kontrak.bukubesar.belum_opt_in_bukan_array", { berkas: label }));
  }

  return {
    mount: o["mount"] as Record<string, string>,
    optInBelumMount: o["optInBelumMount"] as Record<string, string>,
    belumOptIn: o["belumOptIn"] as string[],
    tergenerate: o["tergenerate"] as Record<string, string>,
    handWired: o["handWired"] as Record<string, string>,
  };
}

/**
 * Buku besar harus mencakup TEPAT tag opt-in envelope — tidak kurang, tidak lebih.
 *
 * Tanpa ini, meng-opt-in tag baru tanpa mencatatnya di sini membuat tag itu tak pernah masuk
 * radar gate mana pun.
 */
export function periksaCakupanTag(
  bb: BukuBesar,
  tagOptIn: string[],
  label: { bukuBesar: string; optIn: string },
  t: T,
  sitir: string,
): string[] {
  const dicatat = new Set([...Object.keys(bb.mount), ...Object.keys(bb.optInBelumMount)]);
  const optIn = new Set(tagOptIn);
  const errors: string[] = [];

  for (const tag of optIn) {
    if (!dicatat.has(tag)) {
      errors.push(`${sitir} ${t("kontrak.bukubesar.tag_tak_tercatat", { tag, berkas: label.bukuBesar })}`);
    }
  }
  for (const tag of dicatat) {
    if (!optIn.has(tag)) {
      errors.push(
        `${sitir} ${t("kontrak.bukubesar.tag_bukan_opt_in", { tag, berkas: label.bukuBesar, optIn: label.optIn })}`,
      );
    }
  }
  return errors;
}

/**
 * Status mount yang DICATAT harus sama dengan keadaan sungguhnya di berkas pendaftaran, dua arah.
 *
 * `bacaRegister` disuntikkan supaya fungsi ini bisa diuji tanpa menyentuh disk.
 */
export function periksaKesesuaianMount(
  bb: BukuBesar,
  bacaRegister: (featureDir: string) => string | null,
  label: string,
  t: T,
  sitir: string,
): string[] {
  const errors: string[] = [];

  const cek = (tag: string, dir: string, harusMount: boolean, bagian: string) => {
    const src = bacaRegister(dir);
    if (src === null) {
      errors.push(`${sitir} ${t("kontrak.bukubesar.tanpa_register", { bagian, tag, dir })}`);
      return;
    }
    const adaMount = MOUNT_RE.test(src);
    if (harusMount && !adaMount) {
      errors.push(`${sitir} ${t("kontrak.bukubesar.klaim_mount_palsu", { tag, dir })}`);
    }
    if (!harusMount && adaMount) {
      errors.push(`${sitir} ${t("kontrak.bukubesar.mount_tak_tercatat", { tag, dir, berkas: label })}`);
    }
  };

  for (const [tag, dir] of Object.entries(bb.mount)) cek(tag, dir, true, "mount");
  for (const [tag, dir] of Object.entries(bb.optInBelumMount)) cek(tag, dir, false, "optInBelumMount");

  for (const dir of bb.belumOptIn) {
    const src = bacaRegister(dir);
    if (src === null) {
      errors.push(`${sitir} ${t("kontrak.bukubesar.belum_opt_in_tanpa_register", { dir })}`);
      continue;
    }
    if (MOUNT_RE.test(src)) {
      errors.push(`${sitir} ${t("kontrak.bukubesar.belum_opt_in_sudah_mount", { dir })}`);
    }
  }
  return errors;
}

/** Pembaca berkas pendaftaran dari disk, untuk pemakaian sungguhan. */
export function pembacaRegister(featureRoot: string) {
  return (dir: string): string | null => {
    const p = registerPath(featureRoot, dir);
    return p === null ? null : readFileSync(p, "utf8");
  };
}

// ── Sumbu kedua: generasi kerangka modul ──────────────────────────────────────

/**
 * Keempat berkas yang generator kerangka modul miliki. Sufiks generated-lah yang membedakan
 * kerangka yang masih boleh ditulis ulang dari hasil kawin tangan yang tidak boleh.
 */
export const BERKAS_KERANGKA = ["register", "handler", "service", "repository"] as const;

/**
 * Keadaan yang buku besar boleh MENGKLAIM — dan sekaligus satu-satunya keadaan yang boleh masuk ke
 * pesan apa adanya, karena keduanya adalah KUNCI HARFIAH buku besar itu. Nama kunci tidak
 * diterjemahkan; menerjemahkannya akan menyuruh pembaca mencari kunci yang tidak ada di berkasnya.
 */
export type KlaimGenerasi = "tergenerate" | "handWired";

/**
 * Keadaan yang bisa dibaca dari DISK. Dua nilai tambahannya adalah kata Indonesia, bukan kunci
 * buku besar, jadi keduanya TIDAK boleh mengalir ke pesan sebagai variabel — ia akan mencetak kata
 * Indonesia di tengah kalimat Inggris, kelas yang lolos gate paritas kunci MAUPUN gate paritas
 * nama variabel dan hanya terlihat kalau gate-nya dijalankan dalam bahasa kedua.
 *
 * Yang menahan kebocoran itu adalah TIPE, bukan urutan pernyataan: `pesanKlaimBeda` di bawah hanya
 * menerima `KlaimGenerasi`, jadi meneruskan nilai yang belum dipersempit gagal saat pemeriksaan
 * tipe. Bentuk sebelumnya menahan lewat dua `continue` yang kebetulan berdiri lebih dulu —
 * penjagaan yang lenyap begitu seseorang menyusun ulang blok itu, tanpa satu sinyal pun.
 */
export type KeadaanGenerasi = KlaimGenerasi | "campuran" | "kosong";

/**
 * Baca keadaan generasi dari DISK. Inilah kebenarannya; buku besar cuma klaim atasnya.
 *
 * "campuran" bukan keadaan yang sah: sebagian berkas dibekukan dan sebagian belum berarti
 * pembekuannya berhenti di tengah, dan menjalankan generator lagi akan menimpa yang belum beku
 * sementara yang sudah beku tertinggal di versi lama — dua lapisan modul dari dua usia kontrak
 * yang berbeda, tanpa satu pun galat kompilasi yang menandainya.
 */
export function keadaanGenerasi(featureRoot: string, dir: string, sufiksGen: string): KeadaanGenerasi {
  let gen = 0;
  let beku = 0;
  for (const n of BERKAS_KERANGKA) {
    if (existsSync(join(featureRoot, dir, `${n}${sufiksGen}`))) gen++;
    if (existsSync(join(featureRoot, dir, `${n}.go`))) beku++;
  }
  if (gen > 0 && beku > 0) return "campuran";
  if (gen > 0) return "tergenerate";
  if (beku > 0) return "handWired";
  return "kosong";
}

/**
 * Buku besar sumbu generasi harus sama dengan keadaan disk, DUA ARAH ([[G-05]]).
 *
 * Arah pertama (klaim -> disk) menangkap catatan basi. Arah kedua (disk -> klaim) yang lebih
 * penting: sebuah direktori berkerangka generated yang TIDAK tercatat adalah kerangka yang
 * mendarat tanpa ada yang tahu ia belum punya implementasi akses datanya — modul yang boot,
 * terdaftar di router, dan PANIC pada request pertama. Tanpa arah ini kegagalannya diam sampai
 * ada yang memanggil endpoint-nya di produksi.
 *
 * `bacaKeadaan` dan `daftarDir` disuntikkan supaya fungsi ini bisa diuji tanpa menyentuh disk.
 */
export function periksaGenerasi(
  bb: BukuBesar,
  daftarDir: () => string[],
  bacaKeadaan: (dir: string) => KeadaanGenerasi,
  label: string,
  t: T,
  sitir: string,
): string[] {
  const errors: string[] = [];

  const dicatat = new Map<string, KlaimGenerasi>();
  for (const dir of Object.values(bb.tergenerate)) dicatat.set(dir, "tergenerate");
  for (const dir of Object.values(bb.handWired)) {
    if (dicatat.get(dir) === "tergenerate") {
      errors.push(`${sitir} ${t("kontrak.generasi.dua_status", { dir })}`);
      continue;
    }
    dicatat.set(dir, "handWired");
  }

  // Kedua nilai bukan-klaim ditangani lewat pesannya SENDIRI — masing-masing punya perbaikan yang
  // berbeda, jadi menggabungkannya jadi satu pesan bervariabel akan menyuruh pembaca menebak mana
  // dari dua tindakan yang dimaksud. Efek sampingnya yang dipakai di sini: sesudah kedua cabang,
  // `nyata` sudah bertipe `KlaimGenerasi`, dan `pesanKlaimBeda` menolak apa pun selain itu.
  const pesanKlaimBeda = (dir: string, klaim: KlaimGenerasi, nyata: KlaimGenerasi): string =>
    t("kontrak.generasi.klaim_beda", { dir, klaim, nyata, berkas: label });

  for (const [dir, klaim] of dicatat) {
    const nyata = bacaKeadaan(dir);
    if (nyata === "kosong") {
      errors.push(`${sitir} ${t("kontrak.generasi.tanpa_kerangka", { klaim, dir })}`);
      continue;
    }
    if (nyata === "campuran") {
      errors.push(`${sitir} ${t("kontrak.generasi.campuran", { dir })}`);
      continue;
    }
    if (nyata !== klaim) {
      errors.push(`${sitir} ${pesanKlaimBeda(dir, klaim, nyata)}`);
    }
  }

  for (const dir of daftarDir()) {
    if (dicatat.has(dir)) continue;
    const nyata = bacaKeadaan(dir);
    if (nyata === "tergenerate" || nyata === "campuran") {
      errors.push(`${sitir} ${t("kontrak.generasi.tak_tercatat", { dir })}`);
    }
  }
  return errors;
}

/** Pembaca keadaan generasi + daftar direktori dari disk, untuk pemakaian sungguhan. */
export function pembacaGenerasi(featureRoot: string, sufiksGen: string) {
  return {
    daftarDir: () =>
      readdirSync(featureRoot, { withFileTypes: true })
        .filter((e) => e.isDirectory())
        .map((e) => e.name),
    bacaKeadaan: (dir: string) => keadaanGenerasi(featureRoot, dir, sufiksGen),
  };
}
