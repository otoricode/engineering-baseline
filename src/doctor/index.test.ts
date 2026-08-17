import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { DIR_WORKFLOW, jalankanDoctor } from "./index.js";
import type { StandardConfig } from "../config/schema.js";

// Dibersihkan lewat afterAll, BUKAN di akhir tiap kasus: pembersihan di akhir kasus tidak pernah
// berjalan untuk kasus yang GAGAL — yaitu tepat lari yang paling sering diulang. Sebelum ini
// berkas ini tidak membersihkan APA PUN: 162 direktori `eb-doc-*` terukur tertinggal di /tmp,
// bagian dari 410 total dari empat berkas uji, di disk yang 94% penuh.
const dirSementara: string[] = [];
const daftarkan = (d: string): string => (dirSementara.push(d), d);
afterAll(async () => {
  for (const d of dirSementara) await rm(d, { recursive: true, force: true });
});

function cfg(ubah: Partial<StandardConfig> = {}): StandardConfig {
  return {
    layout: { contractDir: "packages/contract", backendDir: "apps/api", frontendDir: "apps/web" },
    go: { modulePath: "example.com/p/apps/api", genDir: "internal/gen", featureDir: "internal/feature",
          dtoconvPkg: "internal/platform/dtoconv", genSuffix: ".gen.go" },
    contract: { bundle: "dist/openapi.bundled.yaml", sharedDir: "openapi/_shared",
                shared: { envelope: "envelope.yaml", permissions: "permissions.yaml",
                          errors: "errors.yaml", publicOps: "public-operations.yaml" } },
    ledgers: { envelopeOptIn: "opt-in.json", mountedModules: "mounted.json",
               routes: "routes.json", coverage: "coverage.json" },
    emit: { permissions: "apps/web/src/generated/permissions.ts",
            errorCodes: "apps/web/src/generated/errorCodes.ts" },
    idempotency: { uuidNamespace: "9f1c2b7e-0000-4000-8000-000000000001" },
    rules: { docBase: "docs/rules", prefix: { contract: "C", backend: "B", gate: "G", tenancy: "T" } },
    language: "id",
    ...ubah,
  };
}

async function proyekSehat(): Promise<string> {
  const akar = daftarkan(await mkdtemp(path.join(tmpdir(), "eb-doc-")));
  const c = cfg();
  await mkdir(path.join(akar, c.layout.contractDir, c.contract.sharedDir), { recursive: true });
  await mkdir(path.join(akar, c.layout.backendDir), { recursive: true });
  await mkdir(path.join(akar, c.layout.frontendDir), { recursive: true });
  await writeFile(path.join(akar, c.layout.backendDir, "go.mod"), `module ${c.go.modulePath}\n\ngo 1.26\n`);
  for (const n of Object.values(c.contract.shared)) {
    await writeFile(path.join(akar, c.layout.contractDir, c.contract.sharedDir, n), "{}\n");
  }
  for (const n of Object.values(c.ledgers)) {
    await writeFile(path.join(akar, c.layout.contractDir, n), "{}\n");
  }
  return akar;
}

describe("jalankanDoctor", () => {
  it("nol temuan untuk proyek sehat", async () => {
    const akar = await proyekSehat();
    const h = await jalankanDoctor(cfg(), akar);
    expect(h.temuan).toEqual([]);
    expect(h.jumlahPemeriksaan).toBeGreaterThan(5);
  });

  it("menyebut kunci config saat path hilang", async () => {
    const akar = await proyekSehat();
    const h = await jalankanDoctor(cfg({ layout: { contractDir: "tidak/ada",
      backendDir: "apps/api", frontendDir: "apps/web" } }), akar);
    expect(h.temuan.join("\n")).toContain("layout.contractDir");
  });

  it("menolak modulePath yang tak cocok dengan go.mod", async () => {
    const akar = await proyekSehat();
    const h = await jalankanDoctor(cfg({ go: { ...cfg().go, modulePath: "example.com/lain" } }), akar);
    expect(h.temuan.join("\n")).toContain("go.mod");
  });

  it("menolak namespace UUID yang masih nilai contoh", async () => {
    const akar = await proyekSehat();
    const h = await jalankanDoctor(cfg({ idempotency: { uuidNamespace: "REPLACE-ME" } }), akar);
    expect(h.temuan.join("\n")).toContain("uuidNamespace");
  });

  // Regresi: sinyal "ada" sebelumnya cuma "stat()/readFile() tidak melempar" -- config yang
  // menaruh berkas pada kunci yang seharusnya direktori (atau sebaliknya) lolos sebagai sehat
  // walau strukturnya salah.
  it("menolak berkas yang seharusnya direktori", async () => {
    const akar = await proyekSehat();
    const c = cfg();
    // layout.frontendDir mestinya direktori -- ganti jadi berkas biasa.
    await rm(path.join(akar, c.layout.frontendDir), { recursive: true, force: true });
    await writeFile(path.join(akar, c.layout.frontendDir), "bukan direktori\n");

    const h = await jalankanDoctor(c, akar);
    expect(h.temuan.join("\n")).toContain("layout.frontendDir");
  });

  it("menolak direktori yang seharusnya berkas", async () => {
    const akar = await proyekSehat();
    const c = cfg();
    // contract.shared.envelope mestinya berkas -- ganti jadi direktori.
    const jalurEnvelope = path.join(
      akar,
      c.layout.contractDir,
      c.contract.sharedDir,
      c.contract.shared.envelope,
    );
    await rm(jalurEnvelope, { recursive: true, force: true });
    await mkdir(jalurEnvelope);

    const h = await jalankanDoctor(c, akar);
    expect(h.temuan.join("\n")).toContain("contract.shared.envelope");
  });
});

/**
 * `paths:` workflow terpasang vs `layout.*`.
 *
 * Kelas yang diuji di sini bukan placeholder yang TERTINGGAL — langkah pertama tiap template CI
 * sudah memindainya, dan pindaian itu berjalan di CI. Yang diuji adalah placeholder yang TERISI
 * SALAH: mode gagalnya identik (workflow tidak pernah terpicu, hijau yang sama butanya), tapi
 * pemindai placeholder meloloskannya karena memang tidak ada placeholder tersisa.
 */
describe("jalankanDoctor: paths: workflow vs layout.*", () => {
  const tulisWorkflow = async (akar: string, nama: string, isi: string): Promise<void> => {
    await mkdir(path.join(akar, DIR_WORKFLOW), { recursive: true });
    await writeFile(path.join(akar, DIR_WORKFLOW, nama), isi);
  };

  const workflow = (nama: string, paths: string[]): string =>
    `name: ${nama}\non:\n  pull_request:\n    paths:\n${paths
      .map((p) => `      - ${JSON.stringify(p)}`)
      .join("\n")}\njobs:\n  ${nama}:\n    runs-on: ubuntu-latest\n    steps:\n      - run: standard doctor\n`;

  it("hijau untuk workflow yang paths-nya cocok dengan layout", async () => {
    const akar = await proyekSehat();
    await tulisWorkflow(
      akar,
      "backend-gate.yml",
      workflow("backend-gate", ["apps/api/**", "packages/contract/**", ".github/workflows/**"]),
    );
    const h = await jalankanDoctor(cfg(), akar);
    expect(h.temuan, h.temuan.join("\n")).toEqual([]);
  });

  // Satu huruf: `app/api` alih-alih `apps/api`. Inilah kegagalan yang dokumen ini ada untuk
  // menangkapnya, dan ia lolos setiap pemeriksaan lain di paket ini.
  it("MERAH untuk direktori yang salah ketik — dua kali: tidak ada, DAN tidak meliput", async () => {
    const akar = await proyekSehat();
    await tulisWorkflow(
      akar,
      "backend-gate.yml",
      workflow("backend-gate", ["app/api/**", "packages/contract/**", ".github/workflows/**"]),
    );
    const gabung = (await jalankanDoctor(cfg(), akar)).temuan.join("\n");
    expect(gabung).toContain("app/api");
    expect(gabung).toContain("layout.backendDir");
  });

  it("MERAH bila kunci layout yang lapisnya butuh tidak diliput sama sekali", async () => {
    const akar = await proyekSehat();
    // Semua jalurnya ADA, jadi pemeriksaan keberadaan hijau — yang hilang adalah liputannya.
    await tulisWorkflow(
      akar,
      "backend-gate.yml",
      workflow("backend-gate", ["apps/api/**", ".github/workflows/**"]),
    );
    const gabung = (await jalankanDoctor(cfg(), akar)).temuan.join("\n");
    expect(gabung).toContain("layout.contractDir");
    expect(gabung).not.toContain("layout.backendDir");
  });

  it("MERAH bila placeholder masih tertinggal di dalam paths", async () => {
    const akar = await proyekSehat();
    await tulisWorkflow(
      akar,
      "contract-gate.yml",
      workflow("contract-gate", ["{{CONTRACT_DIR}}/**", ".github/workflows/**"]),
    );
    expect((await jalankanDoctor(cfg(), akar)).temuan.join("\n")).toContain("{{CONTRACT_DIR}}");
  });

  it("MERAH bila workflow paket ini tidak punya blok paths sama sekali", async () => {
    const akar = await proyekSehat();
    await tulisWorkflow(akar, "contract-gate.yml", "name: contract-gate\non: pull_request\njobs: {}\n");
    expect((await jalankanDoctor(cfg(), akar)).temuan.join("\n")).toContain("paths");
  });

  // Workflow milik PROYEK, bukan kiriman paket ini: liputan layout-nya bukan urusan kita, tapi
  // jalur yang tidak ada tetap salah ketik dan tetap dilaporkan.
  it("workflow proyek sendiri tidak dituntut meliput layout, tapi jalurnya tetap diperiksa", async () => {
    const akar = await proyekSehat();
    await tulisWorkflow(akar, "rilis.yml", workflow("rilis", ["apps/api/**"]));
    expect((await jalankanDoctor(cfg(), akar)).temuan).toEqual([]);

    await tulisWorkflow(akar, "rilis.yml", workflow("rilis", ["salah-ketik/**"]));
    expect((await jalankanDoctor(cfg(), akar)).temuan.join("\n")).toContain("salah-ketik");
  });

  it("YAML rusak dilaporkan, bukan dilewati diam-diam", async () => {
    const akar = await proyekSehat();
    await tulisWorkflow(akar, "backend-gate.yml", "name: [rusak\n  - : :\n");
    expect((await jalankanDoctor(cfg(), akar)).temuan.join("\n")).toContain("backend-gate.yml");
  });

  /**
   * Proyek tanpa `.github/workflows/` bukan temuan — langkah 1 `INSTALL.md` mendahului langkah 3.
   * Yang tidak boleh adalah menyembunyikannya: jumlah berkas workflow yang diperiksa ikut masuk
   * `jumlahPemeriksaan`, jadi "nol pemeriksaan workflow" bisa dibaca dari angka yang doctor cetak.
   */
  it("tanpa .github/workflows tidak ada temuan, dan hitungannya ikut turun", async () => {
    const akar = await proyekSehat();
    const tanpa = await jalankanDoctor(cfg(), akar);
    await tulisWorkflow(
      akar,
      "contract-gate.yml",
      workflow("contract-gate", ["packages/contract/**", ".github/workflows/**"]),
    );
    const dengan = await jalankanDoctor(cfg(), akar);
    expect(tanpa.temuan).toEqual([]);
    expect(dengan.temuan).toEqual([]);
    expect(dengan.jumlahPemeriksaan).toBe(tanpa.jumlahPemeriksaan + 1);
  });
});
