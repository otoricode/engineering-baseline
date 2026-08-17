/**
 * SATU-SATUNYA sumber jalur untuk seluruh skrip kontrak.
 *
 * Aturannya keras dan tidak punya pengecualian: **tidak ada satu pun literal jalur di kelima
 * belas skrip**. Kalau sebuah skrip perlu berkas yang belum punya metode di sini, metodenya
 * ditambahkan di berkas INI — bukan jalur pintas satu baris di skrip itu.
 *
 * Alasannya bukan kerapian. Skrip-skrip ini diangkat dari sebuah proyek yang layoutnya
 * dipaku di 40-an tempat berbeda; memasangnya di proyek lain berarti berburu ke-40 tempat itu
 * dan melewatkan sebagian. Yang terlewat tidak gagal nyaring — ia menunjuk berkas yang tidak
 * ada, dan gate yang berkasnya tidak ada gampang sekali terbaca sebagai "tidak ada pelanggaran".
 *
 * Nama BERKAS turunan (mis. bundel ter-dereference, dokumen schema bersama) juga hidup di sini,
 * bukan di skrip pemakainya, karena alasan yang sama: nama itu jalur juga, cuma pendek.
 */
import path from "node:path";
import { loadConfig } from "../../src/config/load.js";
import type { StandardConfig } from "../../src/config/schema.js";

/**
 * Nama berkas turunan yang TIDAK punya kunci config sendiri karena ia bukan pilihan proyek —
 * ia keluaran alat yang skrip-skrip ini sendiri jalankan, dan letaknya ditentukan oleh
 * `contract.bundle` (keduanya duduk di direktori yang sama).
 */
const NAMA_DEREF = "openapi.deref.json";
const NAMA_SHARED_SPEC = "openapi.shared.yaml";
/** Direktori sumber kontrak per-fitur dan direktori contoh respons — saudara `contract.sharedDir`. */
const NAMA_DIR_FITUR = "features";
const NAMA_DIR_SAMPLES = "samples";

export type Jalur = {
  akar: string;

  // ── Empat metode yang pembungkus CLI panggil; tanda tangannya MENGIKAT. ──────
  bundle(): string;
  shared(nama: keyof StandardConfig["contract"]["shared"]): string;
  ledger(nama: keyof StandardConfig["ledgers"]): string;
  emit(nama: keyof StandardConfig["emit"]): string;

  // ── Sisanya: jalur yang dibutuhkan skrip-skrip di direktori ini. ──────────────
  /** Akar paket kontrak. `kontrak()` sendiri = direktorinya. */
  kontrak(...seg: string[]): string;
  /** Direktori keluaran bundel — diturunkan dari `contract.bundle`, bukan dikonfigurasi ulang. */
  dist(...seg: string[]): string;
  /** Bundel ter-dereference (`redocly bundle --dereferenced`). */
  deref(): string;
  /** Dokumen OpenAPI berisi HANYA schema bersama; keluaran `gen-shared-spec`. */
  sharedSpec(): string;
  /** Direktori sumber kontrak per-fitur, saudara `contract.sharedDir`. */
  fitur(...seg: string[]): string;
  /** Direktori contoh respons yang divalidasi `validate-samples`. */
  samples(...seg: string[]): string;
  /**
   * `$ref` relatif DARI sebuah berkas di `fitur()` KE sebuah berkas shared — bentuk yang
   * ditulis ke dalam YAML kontrak, jadi ia harus relatif, bukan absolut.
   */
  refShared(nama: keyof StandardConfig["contract"]["shared"], pointer: string): string;

  /** Akar aplikasi backend. */
  backend(...seg: string[]): string;
  /** Direktori paket generated Go. */
  goGen(...seg: string[]): string;
  /** Direktori paket feature Go. */
  goFeature(...seg: string[]): string;
  /**
   * Titik masuk Go (tempat daftar modul dirakit), atau `null` kalau `go.entrypoint` kosong.
   * `null` BUKAN izin melewati pemeriksaan — pemanggilnya wajib memerahkan gate; lihat
   * catatan `go.entrypoint` di `src/config/schema.ts`.
   */
  goEntrypoint(): string | null;
  /** Berkas sumber tempat baris permission dibuat; `[]` kalau `contract.permissionSeeds` kosong. */
  permissionSeeds(): string[];

  /** Jalur IMPOR Go (bukan jalur berkas) ke sebuah paket di bawah modul backend. */
  goImport(...seg: string[]): string;
  /** Jalur impor Go ke paket generated (`go.genDir`) atau subpaketnya. */
  goImportGen(...seg: string[]): string;
  /** Jalur impor Go ke paket platform (saudara `go.dtoconvPkg`), mis. `guard`, `httpx`. */
  goPlatform(nama: string): string;
  /** Sufiks berkas hasil generate, mis. `.gen.go`. */
  sufiksGen(): string;
};

export function buatJalur(config: StandardConfig, akar: string): Jalur {
  const kontrak = path.join(akar, config.layout.contractDir);
  const distDir = path.dirname(config.contract.bundle);
  // Direktori fitur adalah SAUDARA sharedDir (`openapi/_shared` -> `openapi/features`), bukan
  // kunci tersendiri: kedua direktori itu selalu berdampingan di dalam satu dokumen OpenAPI,
  // dan memberi masing-masing kunci sendiri mengundang keduanya menunjuk induk yang berbeda —
  // yang membuat `refShared()` di bawah menghasilkan `$ref` yang tidak resolve.
  const dirOpenApi = path.dirname(config.contract.sharedDir);
  const dirFitur = path.join(dirOpenApi, NAMA_DIR_FITUR);

  const jalur: Jalur = {
    akar,

    bundle: () => path.join(kontrak, config.contract.bundle),
    shared: (nama) => path.join(kontrak, config.contract.sharedDir, config.contract.shared[nama]),
    ledger: (nama) => path.join(kontrak, config.ledgers[nama]),
    emit: (nama) => path.join(akar, config.emit[nama]),

    kontrak: (...seg) => path.join(kontrak, ...seg),
    dist: (...seg) => path.join(kontrak, distDir, ...seg),
    deref: () => path.join(kontrak, distDir, NAMA_DEREF),
    sharedSpec: () => path.join(kontrak, distDir, NAMA_SHARED_SPEC),
    fitur: (...seg) => path.join(kontrak, dirFitur, ...seg),
    samples: (...seg) => path.join(kontrak, NAMA_DIR_SAMPLES, ...seg),
    refShared: (nama, pointer) => {
      // `path.relative` memulangkan bentuk POSIX-atau-Windows menurut host; `$ref` di dalam
      // dokumen OpenAPI SELALU POSIX. Normalkan, kalau tidak kontrak yang ditulis di Windows
      // memuat `..\_shared\envelope.yaml` yang tidak resolve di mana pun.
      const rel = path
        .relative(path.join(kontrak, dirFitur), path.join(kontrak, config.contract.sharedDir))
        .split(path.sep)
        .join("/");
      return `${rel}/${config.contract.shared[nama]}${pointer}`;
    },

    backend: (...seg) => path.join(akar, config.layout.backendDir, ...seg),
    goGen: (...seg) => path.join(akar, config.layout.backendDir, config.go.genDir, ...seg),
    goFeature: (...seg) => path.join(akar, config.layout.backendDir, config.go.featureDir, ...seg),
    goEntrypoint: () => {
      const e = config.go.entrypoint;
      return e === undefined || e.trim() === "" ? null : path.join(akar, config.layout.backendDir, e);
    },
    permissionSeeds: () => (config.contract.permissionSeeds ?? []).map((p) => path.join(akar, p)),

    // Jalur IMPOR Go selalu memakai `/`, apa pun pemisah jalur host-nya — kunci config yang
    // menyimpan jalur BERKAS (`genDir`, `dtoconvPkg`) karena itu dipecah per segmen lalu
    // disatukan ulang, bukan disambung mentah.
    goImport: (...seg) => [config.go.modulePath, ...seg.flatMap((s) => s.split(/[\\/]/))]
      .filter((s) => s !== "")
      .join("/"),
    goImportGen: (...seg) => jalur.goImport(config.go.genDir, ...seg),
    goPlatform: (nama) => jalur.goImport(path.dirname(config.go.dtoconvPkg), nama),
    sufiksGen: () => config.go.genSuffix,
  };
  return jalur;
}

export async function muatJalur(): Promise<{ jalur: Jalur; config: StandardConfig }> {
  const { config, akar } = await loadConfig(process.cwd());
  return { jalur: buatJalur(config, akar), config };
}
