/**
 * `INSTALL.md` DITEMPUH APA ADANYA untuk proyek contract-only, lalu diukur.
 *
 * # Ujinya: dokumen yang diikuti harfiah menghasilkan proyek HIJAU
 *
 * Berkas ini tidak memeriksa apakah dokumennya menyebut hal yang benar — itu bisa dipalsukan dengan
 * menambah kalimat. Ia MEMBANGUN proyek dari isi dokumen (config §1.2, keempat schema §1.3, berkas
 * seed §1.2, workflow yang §3 suruh salin, buku besar §3), lalu menjalankan perintah yang
 * dokumennya sarankan. Setiap penyesuaian yang tidak tertulis muncul di sini sebagai merah.
 *
 * # Empat celah yang cara ini temukan, dan tak satu pun terlihat dari membaca kode
 *
 *   1. §3 menyuruh SEMUA orang menyalin `backend-gate.yml`. `paths:`-nya menunjuk direktori backend
 *      yang tidak ada di proyek contract-only, jadi `doctor` keluar 1 — sementara §1.2 baru saja
 *      menjanjikan hijau. Dua bagian dokumen yang saling membantah.
 *   2. Tabel §1.2 cuma memuat `standard gate --lapis contract`, padahal kebiasaan orang mengetik
 *      `standard gate` polos — yang keluar 2 di `tenancy-checklist`.
 *   3. Config §1.2 menunjuk `contract.permissionSeeds` ke sebuah berkas yang TIDAK ADA satu langkah
 *      pun menyuruh membuatnya. Akibatnya `gate` keluar 2 dengan `ENOENT` telanjang — kelas yang
 *      sama persis dengan celah `openapi/_shared` yang sudah ditutup di ronde sebelumnya.
 *   4. §1.3 menyebut ketiga katalog "boleh kosong", benar untuk proyek BARU — tapi proyek yang
 *      sudah punya kontrak akan merah, karena katalognya TERTUTUP terhadap `x-permission` yang
 *      operasinya sebut.
 */
import { execFile, execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { beforeAll, afterAll, describe, expect, it } from "vitest";
import { akarPaket } from "../paket.js";
import { DIR_FIXTURE } from "../verify/index.js";

const jalankan = promisify(execFile);

const dirSementara: string[] = [];
afterAll(() => {
  for (const d of dirSementara) rmSync(d, { recursive: true, force: true });
});

let install = "";
beforeAll(async () => {
  install = await readFile(path.join(akarPaket(), "INSTALL.md"), "utf8");
});

/** Blok ber-fence yang didahului penanda `<!-- <jenis>: <nama> -->`. */
function blok(jenis: string, nama: string): string {
  const baris = install.split("\n");
  const pola = new RegExp(`^<!--\\s*${jenis}:\\s*${nama.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*-->$`);
  const i = baris.findIndex((b) => pola.test(b.trim()));
  if (i === -1) throw new Error(`INSTALL.md: penanda <!-- ${jenis}: ${nama} --> tidak ada`);
  const a = baris.findIndex((b, j) => j > i && b.startsWith("```"));
  const z = baris.findIndex((b, j) => j > a && b.trim() === "```");
  return `${baris.slice(a + 1, z).join("\n")}\n`;
}

type Config = {
  layout: { contractDir: string; backendDir?: string; frontendDir: string };
  contract: { sharedDir: string; shared: Record<string, string>; permissionSeeds?: string[] };
  ledgers: Record<string, string>;
  idempotency: { uuidNamespace: string };
};

/**
 * Proyek yang dibangun DARI DOKUMEN.
 *
 * Isi kontrak dan frontend datang dari fixture, dan itu bukan kecurangan: dokumen memasang STANDAR
 * ke proyek yang sudah punya kontraknya sendiri (§1.2 "isi dengan tata letak proyekmu yang
 * sungguhan"). Yang diuji adalah instruksi paketnya — config, schema bersama, seed, workflow, buku
 * besar — bukan kemampuan dokumen mengarang kontrak.
 */
function proyekDariDokumen(): { dir: string; config: Config } {
  const dir = mkdtempSync(path.join(tmpdir(), "eb-ikuti-"));
  dirSementara.push(dir);

  // §1.2 — config contract-only, disalin apa adanya.
  const config = JSON.parse(blok("berkas-contoh", "standard.config.contract-only.json")) as Config;
  expect(config.layout.backendDir, "config contract-only tidak boleh punya backendDir").toBeUndefined();
  // §2 — namespace proyek sendiri.
  config.idempotency.uuidNamespace = "3f1a9c22-0000-4000-8000-0000000000aa";
  writeFileSync(path.join(dir, "standard.config.json"), `${JSON.stringify(config, null, 2)}\n`);

  for (const sub of [config.layout.contractDir, config.layout.frontendDir]) {
    cpSync(path.join(DIR_FIXTURE, sub), path.join(dir, sub), { recursive: true });
  }

  // §1.3 — keempat schema bersama, dari templat dokumen. Katalog permission-nya diisi dari kontrak
  // proyek, persis seperti §1.3 suruh untuk proyek yang SUDAH punya kontrak.
  const dirShared = path.join(dir, config.layout.contractDir, config.contract.sharedDir);
  mkdirSync(dirShared, { recursive: true });
  for (const nama of Object.values(config.contract.shared)) {
    writeFileSync(path.join(dirShared, nama), blok("berkas", nama));
  }
  writeFileSync(
    path.join(dirShared, config.contract.shared["permissions"]!),
    "permissions:\n  - CONTOH_READ\n  - CONTOH_CREATE\nlegacyNames: []\n",
  );

  // §1.2 — berkas seed yang config tunjuk, dari templat dokumen.
  const seed = config.contract.permissionSeeds?.[0];
  expect(seed, "config §1.2 wajib menunjuk berkas seed").toBeDefined();
  mkdirSync(path.dirname(path.join(dir, seed!)), { recursive: true });
  writeFileSync(path.join(dir, seed!), blok("berkas-contoh", seed!));

  // §3 — workflow yang dokumen suruh salin untuk proyek contract-only, plus buku besar KOSONG.
  const wf = path.join(dir, ".github", "workflows");
  mkdirSync(wf, { recursive: true });
  for (const nama of workflowUntukContractOnly()) {
    const isi = blokTemplateCi(nama, config);
    writeFileSync(path.join(wf, `${nama}.yml`), isi);
  }
  // §3 — buku besar: blok perintahnya DIJALANKAN apa adanya, bukan disalin ke sini.
  //
  // Menyalin isinya ke berkas uji akan melahirkan kembar: dokumen dan uji yang wajib sama tanpa
  // apa pun yang mengikatnya. Diukur, kembar itu langsung menggigit — versi pertama berkas ini
  // memakai `{"modules":[]}` sementara pemuat buku besar menuntut lima kunci, dan yang merah
  // adalah proyeknya, bukan dokumennya. Menjalankan bloknya membuat dokumen jadi SATU-SATUNYA
  // sumber: perintah yang salah di sana = uji ini merah.
  jalankanBlokBash(blokBash(/Sekarang isi buku besarnya/), {
    "<proyek>/<contractDir>": path.join(dir, config.layout.contractDir),
  });

  return { dir, config };
}

/**
 * Workflow yang §3 suruh salin di proyek contract-only — DIBACA dari dokumennya.
 *
 * Yang dibaca adalah pengecualiannya: §3 menyuruh menyalin ketiganya, lalu menyatakan bahwa proyek
 * contract-only TIDAK menyalin `backend-gate`. Kalau pengecualian itu hilang dari dokumen, daftar
 * di sini ikut memuat `backend-gate`, proyeknya jadi merah, dan uji ini yang berbunyi.
 */
function workflowUntukContractOnly(): string[] {
  const semua = [...install.matchAll(/\.github\/workflows\/([a-z-]+)\.yml\b/g)].map((m) => m[1]!);
  const unik = [...new Set(semua)].filter((n) => n.endsWith("-gate"));
  const dikecualikan = /JANGAN salin `backend-gate\.yml`/.test(install) ? ["backend-gate"] : [];
  return unik.filter((n) => !dikecualikan.includes(n));
}

function blokTemplateCi(nama: string, config: Config): string {
  const isi = readFileSync(path.join(akarPaket(), "ci", `${nama}.yml.template`), "utf8");
  return isi
    .replaceAll("{{NODE_VERSION}}", "24")
    .replaceAll("{{PNPM_VERSION}}", "10.11.0")
    .replaceAll("{{GO_VERSION}}", "1.26")
    .replaceAll("{{CONTRACT_DIR}}", config.layout.contractDir)
    .replaceAll("{{FRONTEND_DIR}}", config.layout.frontendDir);
}

/** Blok ```bash PERTAMA sesudah baris yang cocok `penanda`. */
function blokBash(penanda: RegExp): string {
  const baris = install.split("\n");
  const i = baris.findIndex((b) => penanda.test(b));
  if (i === -1) throw new Error(`INSTALL.md: baris ${String(penanda)} tidak ada`);
  const a = baris.findIndex((b, j) => j > i && b.trim() === "```bash");
  const z = baris.findIndex((b, j) => j > a && b.trim() === "```");
  if (a === -1 || z === -1) throw new Error(`INSTALL.md: blok bash sesudah ${String(penanda)} tidak ada`);
  return baris.slice(a + 1, z).join("\n");
}

/** Menjalankan blok perintah dokumen sesudah placeholder-nya diganti jalur sungguhan. */
function jalankanBlokBash(blok: string, ganti: Record<string, string>): void {
  let skrip = blok;
  for (const [dari, ke] of Object.entries(ganti)) skrip = skrip.split(dari).join(ke);
  if (skrip.includes("<proyek>") || skrip.includes("<paket>")) {
    throw new Error(`placeholder dokumen belum tergantikan:\n${skrip}`);
  }
  execFileSync("sh", ["-euc", skrip], { stdio: "pipe" });
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

const BATAS = 120_000;

describe("INSTALL.md ditempuh apa adanya: proyek contract-only", () => {
  it(
    "`doctor` HIJAU tanpa penyesuaian yang tidak tertulis",
    async () => {
      const { dir } = proyekDariDokumen();
      const { kode, keluaran } = await standard(dir, ["doctor"]);
      expect(kode, keluaran).toBe(0);
    },
    BATAS,
  );

  it(
    "bentuk `gate` yang dokumen sarankan HIJAU",
    async () => {
      const { dir } = proyekDariDokumen();
      const { kode, keluaran } = await standard(dir, ["gate", "--lapis", "contract"]);
      expect(kode, keluaran).toBe(0);
      expect(keluaran).toContain("gate:backend-routes DILEWATI");
    },
    BATAS,
  );

  /**
   * KONTROL POSITIF untuk celah #1: kalau `backend-gate.yml` IKUT disalin — yaitu yang §3 suruh
   * sebelum pengecualiannya ditulis — `doctor` MERAH. Tanpa kasus ini, hijau di atas tidak
   * membuktikan bahwa pengecualian itu mengerjakan sesuatu.
   */
  it(
    "menyalin backend-gate.yml di proyek contract-only MEMANG merah",
    async () => {
      const { dir, config } = proyekDariDokumen();
      writeFileSync(
        path.join(dir, ".github/workflows/backend-gate.yml"),
        readFileSync(path.join(akarPaket(), "ci", "backend-gate.yml.template"), "utf8")
          .replaceAll("{{NODE_VERSION}}", "24")
          .replaceAll("{{PNPM_VERSION}}", "10.11.0")
          .replaceAll("{{GO_VERSION}}", "1.26")
          .replaceAll("{{CONTRACT_DIR}}", config.layout.contractDir)
          .replaceAll("{{BACKEND_DIR}}", "apps/api"),
      );
      const { kode, keluaran } = await standard(dir, ["doctor"]);
      expect(kode, keluaran).toBe(1);
      expect(keluaran).toContain("apps/api");
    },
    BATAS,
  );

  // Celah #3: config §1.2 menunjuk berkas seed, dan tidak ada langkah yang membuatnya. Yang
  // di-assert adalah bahwa dokumen KINI memuat templatnya — dan bahwa tanpa berkasnya gate memang
  // jatuh, supaya kalimat "harus kau BUAT" tidak jadi hiasan.
  it(
    "berkas seed yang config tunjuk punya templatnya sendiri, dan tanpa berkasnya gate JATUH",
    async () => {
      const { dir, config } = proyekDariDokumen();
      const seed = config.contract.permissionSeeds![0]!;
      expect(() => blok("berkas-contoh", seed), "templat seed tidak ada di INSTALL.md").not.toThrow();

      rmSync(path.join(dir, seed));
      const { kode, keluaran } = await standard(dir, ["gate", "--lapis", "contract"]);
      expect(kode, keluaran).not.toBe(0);
      expect(keluaran).toContain(seed);
    },
    BATAS,
  );

  // Celah #2: bentuk POLOS punya hasil yang berbeda, dan tabel §1.2 wajib menyatakannya.
  it(
    "`standard gate` polos keluar 2, dan dokumen mengatakannya",
    async () => {
      const { dir } = proyekDariDokumen();
      const { kode, keluaran } = await standard(dir, ["gate"]);
      expect(kode, keluaran).toBe(2);
      expect(keluaran).toContain("tidak menyatakan lapis backend");

      expect(install).toContain("`standard gate` (polos)");
      expect(install).toContain("keluar 2");
    },
    BATAS,
  );
});
