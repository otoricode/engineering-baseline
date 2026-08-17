/**
 * Proyek CONTRACT-ONLY: config tanpa `layout.backendDir` dan tanpa blok `go`.
 *
 * # Sinyalnya kunci yang DIHILANGKAN, bukan direktori yang tidak ada
 *
 * Keputusan desain yang seluruh berkas ini jaga: "tidak ada lapis backend" dinyatakan dengan
 * MENGHILANGKAN `layout.backendDir` dari config, bukan dengan direktori yang kebetulan tidak ada di
 * disk. Kalau ketiadaan di disk yang jadi pemicu, satu salah ketik pada jalurnya berubah jadi
 * tombol mati diam-diam — `doctor` hijau, seluruh lapis backend berhenti diperiksa, dan tidak ada
 * yang tahu. Kasus "salah ketik TETAP merah" di bawah adalah yang membedakan pelonggaran ini dari
 * sebuah lubang, dan ia yang paling mudah hilang dari sebuah suite.
 *
 * # Kenapa lewat SUBPROSES
 *
 * Yang harus dibuktikan adalah kode keluar dan kalimat yang dilihat pemakai — permukaan yang sama
 * yang dipakai Makefile, CI, dan skill agen. `jalankanDoctor` dalam-proses membuktikan lapisan di
 * bawahnya, dan itu sudah punya berkas ujinya sendiri.
 */
import { execFile } from "node:child_process";
import { cpSync, mkdtempSync, rmSync } from "node:fs";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { akarPaket } from "../paket.js";
import { DIR_FIXTURE } from "../verify/index.js";

const jalankan = promisify(execFile);

const dirSementara: string[] = [];
afterAll(() => {
  for (const d of dirSementara) rmSync(d, { recursive: true, force: true });
});

function salinFixture(): string {
  const dir = mkdtempSync(path.join(tmpdir(), "eb-co-"));
  dirSementara.push(dir);
  cpSync(DIR_FIXTURE, dir, {
    recursive: true,
    filter: (asal) => !path.relative(DIR_FIXTURE, asal).split(path.sep).includes("node_modules"),
  });
  return dir;
}

type Config = {
  layout: { contractDir: string; backendDir?: string; frontendDir: string };
  go?: Record<string, string>;
  contract: { permissionSeeds?: string[] };
};

async function bacaConfig(dir: string): Promise<Config> {
  return JSON.parse(await readFile(path.join(dir, "standard.config.json"), "utf8")) as Config;
}

async function tulisConfig(dir: string, c: Config): Promise<void> {
  await writeFile(path.join(dir, "standard.config.json"), `${JSON.stringify(c, null, 2)}\n`);
}

/**
 * Proyek contract-only yang SEHAT: fixture minus lapis backend seluruhnya.
 *
 * Tiga hal ikut dibuang, dan ketiganya karena memang milik lapis backend — bukan untuk membuat
 * ujinya hijau: direktori `apps/api`, workflow `backend-gate.yml` (yang `paths:`-nya menunjuk
 * `apps/api/**`), dan `contract.permissionSeeds` yang menunjuk seeder Go. Seed-nya diganti berkas
 * TypeScript, karena proyek contract-only tetap wajib membuktikan tiap permission bisa dipegang
 * role — [[C-03]] tidak melonggar hanya karena backendnya bukan Go.
 */
async function proyekContractOnly(): Promise<string> {
  const dir = salinFixture();
  await rm(path.join(dir, "apps/api"), { recursive: true, force: true });
  await rm(path.join(dir, ".github/workflows/backend-gate.yml"), { force: true });

  const c = await bacaConfig(dir);
  delete c.layout.backendDir;
  delete c.go;
  c.contract.permissionSeeds = ["db/seed/permissions.ts"];
  await tulisConfig(dir, c);

  await writeFile(
    path.join(dir, "db/seed/permissions.ts"),
    'export const seedPermissions = [\n  { code: "CONTOH_READ" },\n  { code: "CONTOH_CREATE" },\n];\n',
    { flag: "w" },
  ).catch(async () => {
    const { mkdir } = await import("node:fs/promises");
    await mkdir(path.join(dir, "db/seed"), { recursive: true });
    await writeFile(
      path.join(dir, "db/seed/permissions.ts"),
      'export const seedPermissions = [\n  { code: "CONTOH_READ" },\n  { code: "CONTOH_CREATE" },\n];\n',
    );
  });
  return dir;
}

async function standard(cwd: string, argv: string[]): Promise<{ kode: number; keluaran: string }> {
  try {
    const { stdout, stderr } = await jalankan(path.join(akarPaket(), "bin", "standard"), argv, {
      cwd,
      maxBuffer: 32 * 1024 * 1024,
    });
    return { kode: 0, keluaran: stdout + stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { kode: err.code ?? -1, keluaran: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

/** Angka dari baris ringkasan `doctor`, mis. "config sehat: 12 pemeriksaan lulus." */
function jumlahPemeriksaan(keluaran: string): number {
  const m = /(\d+) pemeriksaan lulus/.exec(keluaran);
  if (m === null) throw new Error(`baris ringkasan doctor tidak ditemukan di:\n${keluaran}`);
  return Number(m[1]);
}

const BATAS = 120_000;

describe("doctor: proyek contract-only", () => {
  it(
    "HIJAU, dan jumlah pemeriksaannya MENGECIL",
    async () => {
      const penuh = await standard(DIR_FIXTURE, ["doctor"]);
      expect(penuh.kode, penuh.keluaran).toBe(0);

      const co = await standard(await proyekContractOnly(), ["doctor"]);
      expect(co.kode, co.keluaran).toBe(0);

      // Yang dilewati wajib TERBACA, bukan cuma tidak terjadi. Tiga pemeriksaan lapis backend
      // (direktori, go.mod, dan kedua alat toolchain) hilang bersama dua liputan `paths:`
      // workflow yang ikut terbuang — yang penting bukan angka pastinya melainkan bahwa ia
      // mengecil, dan bahwa hijaunya tidak menyembunyikan pemeriksaan yang diam-diam lulus.
      expect(jumlahPemeriksaan(co.keluaran)).toBeLessThan(jumlahPemeriksaan(penuh.keluaran));
    },
    BATAS,
  );

  /**
   * KASUS YANG MEMBEDAKAN PELONGGARAN DARI LUBANG.
   *
   * `backendDir` yang ADA tapi salah ketik tetap MERAH — kalau tidak, satu huruf yang salah
   * mematikan seluruh lapis backend tanpa satu pun sinyal, dan itu persis kelas cacat yang seluruh
   * paket ini ada untuk melawannya.
   */
  it(
    "backendDir yang SALAH KETIK tetap MERAH",
    async () => {
      const dir = salinFixture();
      const c = await bacaConfig(dir);
      c.layout.backendDir = "app/api"; // sengaja: `apps/api` kurang satu huruf
      await tulisConfig(dir, c);

      const { kode, keluaran } = await standard(dir, ["doctor"]);
      expect(kode, keluaran).toBe(1);
      expect(keluaran).toContain("layout.backendDir");
      expect(keluaran).toContain("app/api");
    },
    BATAS,
  );

  // KONTROL POSITIF: pemeriksaan toolchain ronde sebelumnya tidak boleh ikut mati oleh pelonggaran
  // ini. Fixture penuh + PATH tanpa Go harus tetap merah.
  it(
    "fixture penuh tanpa Go di PATH TETAP merah — pemeriksaan toolchain tidak ikut mati",
    async () => {
      const pathTanpaGo = [path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter);
      const { kode, keluaran } = await (async () => {
        try {
          const { stdout, stderr } = await jalankan(
            path.join(akarPaket(), "bin", "standard"),
            ["doctor"],
            { cwd: DIR_FIXTURE, env: { ...process.env, PATH: pathTanpaGo } },
          );
          return { kode: 0, keluaran: stdout + stderr };
        } catch (e) {
          const err = e as { code?: number; stdout?: string; stderr?: string };
          return { kode: err.code ?? -1, keluaran: (err.stdout ?? "") + (err.stderr ?? "") };
        }
      })();
      expect(kode, keluaran).toBe(1);
      expect(keluaran).toContain("tidak bisa diresolusi di PATH");
    },
    BATAS,
  );
});

describe("gate dan gen: proyek contract-only", () => {
  it(
    "`gate --lapis contract` HIJAU, dan lewatannya muncul di RINGKASAN",
    async () => {
      const { kode, keluaran } = await standard(await proyekContractOnly(), [
        "gate",
        "--lapis",
        "contract",
      ]);
      expect(kode, keluaran).toBe(0);
      // Dua tempat, dan keduanya wajib: langkahnya sendiri mencetak lewatannya, DAN baris
      // ringkasan menandainya — CI paling sering cuma menyimpan baris terakhir.
      expect(keluaran).toContain("gate:backend-routes DILEWATI");
      expect(keluaran).toMatch(/CATATAN: gate:backend-routes TIDAK dijalankan/);
    },
    BATAS,
  );

  it(
    "perintah yang keluarannya SELURUHNYA backend keluar 2, dengan sebabnya",
    async () => {
      const dir = await proyekContractOnly();
      for (const argv of [
        ["gate", "--only", "tenancy-checklist"],
        ["gen", "wiring", "--tag", "contoh", "--pkg", "contoh"],
        ["gen", "dto"],
        ["gen", "module", "--tag", "contoh", "--pkg", "contoh"],
      ]) {
        const { kode, keluaran } = await standard(dir, argv);
        expect(kode, `${argv.join(" ")}:\n${keluaran}`).toBe(2);
        expect(keluaran, argv.join(" ")).toContain("tidak menyatakan lapis backend");
        expect(keluaran, argv.join(" ")).toContain("layout.backendDir");
      }
    },
    BATAS,
  );

  /**
   * `gen common` adalah satu-satunya perintah generasi yang keluarannya BERCAMPUR, dan aturannya
   * karena itu berbeda: perintah yang keluarannya seluruhnya backend keluar 2, perintah yang
   * keluarannya bercampur memancarkan paruh yang bisa dipancarkan.
   *
   * Yang di-assert adalah BERKASNYA, bukan kode keluarnya: exit 0 juga yang kau dapat dari
   * perintah yang tidak menulis apa pun.
   */
  it(
    "`gen common` menulis paruh TypeScript + schema bersama, dan MENYEBUT berkas Go yang tidak ditulis",
    async () => {
      const dir = await proyekContractOnly();
      const { kode, keluaran } = await standard(dir, ["gen", "common", "--apply"]);
      expect(kode, keluaran).toBe(0);

      for (const b of [
        "apps/web/src/generated/permissions.ts",
        "apps/web/src/generated/errorCodes.ts",
        "packages/contract/dist/openapi.shared.yaml",
      ]) {
        const isi = await readFile(path.join(dir, b), "utf8");
        expect(isi.length, `${b} kosong`).toBeGreaterThan(0);
      }

      // Berkas Go-nya TIDAK ada — dan lewatannya disebut per berkas, supaya orang yang kelak
      // menumbuhkan lapis backend tahu apa yang belum pernah ada.
      for (const b of ["permissions.go", "errorcodes.go"]) {
        expect(keluaran, b).toContain(`keluaran Go DILEWATI: ${b}`);
      }
    },
    BATAS,
  );

  // KONTROL POSITIF untuk kasus di atas: config PENUH menulis kedua paruh. Tanpa ini, "berkas Go
  // tidak ada" juga yang kau dapat dari generator yang rusak dan tidak menulis apa pun.
  it(
    "config PENUH tetap menulis kedua paruh",
    async () => {
      const dir = salinFixture();
      const { kode, keluaran } = await standard(dir, ["gen", "common", "--apply"]);
      expect(kode, keluaran).toBe(0);
      for (const b of [
        "apps/api/internal/gen/permissions.go",
        "apps/api/internal/gen/errorcodes.go",
        "apps/web/src/generated/permissions.ts",
      ]) {
        const isi = await readFile(path.join(dir, b), "utf8");
        expect(isi.length, `${b} kosong`).toBeGreaterThan(0);
      }
      expect(keluaran).not.toContain("keluaran Go DILEWATI");
    },
    BATAS,
  );
});
