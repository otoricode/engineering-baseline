import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { GalatConfig, loadConfig } from "./load.js";

// Dibersihkan lewat afterAll, BUKAN di akhir tiap kasus — dan berkas ini adalah contoh paling
// tajam kenapa: hampir setiap kasus di sini menegaskan sebuah LEMPARAN, jadi baris pembersihan
// di akhir kasus adalah baris yang paling sering tidak pernah dieksekusi. Terukur: 162 direktori
// (`eb-`, `eb-kosong-`, `eb-rusak-`, `eb-kosong-galat-`, `eb-rusak-galat-`) tertinggal di /tmp.
//
// `mkdtempSementara` membungkus mkdtemp alih-alih membungkus tiap pemanggilan dengan
// `daftarkan(...)`: satu pun pemanggilan telanjang yang lolos ke berkas ini di kemudian hari akan
// bocor lagi diam-diam, dan pembungkus yang MENGGANTIKAN nama fungsinya membuat itu terlihat.
const dirSementara: string[] = [];
async function mkdtempSementara(awalan: string): Promise<string> {
  const d = await mkdtemp(path.join(tmpdir(), awalan));
  dirSementara.push(d);
  return d;
}
afterAll(async () => {
  for (const d of dirSementara) await rm(d, { recursive: true, force: true });
});

const MINIMAL = {
  layout: { contractDir: "packages/contract", backendDir: "apps/api", frontendDir: "apps/web" },
  go: { modulePath: "example.com/p/apps/api", genDir: "internal/gen", featureDir: "internal/feature",
        dtoconvPkg: "internal/platform/dtoconv", genSuffix: ".gen.go" },
  contract: { bundle: "dist/openapi.bundled.yaml", sharedDir: "openapi/_shared",
              shared: { envelope: "envelope.yaml", permissions: "permissions.yaml",
                        errors: "errors.yaml", publicOps: "public-operations.yaml" } },
  ledgers: { envelopeOptIn: "envelope-opt-in.json", mountedModules: "mounted-modules.json",
             routes: "routes.json", coverage: "coverage.json" },
  emit: { permissions: "apps/web/src/generated/permissions.ts",
          errorCodes: "apps/web/src/generated/errorCodes.ts" },
  idempotency: { uuidNamespace: "REPLACE-ME" },
  rules: { docBase: "docs/rules", prefix: { contract: "C", backend: "B", gate: "G", tenancy: "T" } },
  language: "id",
};

async function proyek(): Promise<string> {
  const akar = await mkdtempSementara("eb-");
  await writeFile(path.join(akar, "standard.config.json"), JSON.stringify(MINIMAL));
  await mkdir(path.join(akar, "a", "b"), { recursive: true });
  return akar;
}

describe("loadConfig", () => {
  it("menemukan config dengan menaiki direktori", async () => {
    const akar = await proyek();
    const { config, akar: ketemu } = await loadConfig(path.join(akar, "a", "b"));
    expect(ketemu).toBe(akar);
    // Config contoh menyatakan lapis backend, jadi `go` ADA — dituntut eksplisit alih-alih
    // dibungkam `!`, supaya hari config contoh berubah bentuk yang merah adalah baris ini.
    expect(config.go, "config contoh wajib menyatakan blok go").toBeDefined();
    expect(config.go?.modulePath).toBe("example.com/p/apps/api");
  });

  it("melempar bila tidak ada config di jalur ke atas", async () => {
    const kosong = await mkdtempSementara("eb-kosong-");
    await expect(loadConfig(kosong)).rejects.toThrow(/standard.config.json/);
  });

  it("melempar dengan menyebut kunci yang salah bila skema tak lolos", async () => {
    const akar = await mkdtempSementara("eb-rusak-");
    const rusak = structuredClone(MINIMAL) as Record<string, unknown>;
    delete (rusak["go"] as Record<string, unknown>)["modulePath"];
    await writeFile(path.join(akar, "standard.config.json"), JSON.stringify(rusak));
    await expect(loadConfig(akar)).rejects.toThrow(/modulePath/);
  });

  it("melempar GalatConfig dengan .kode dan .params benar bila tidak ada config di jalur ke atas, dan .message identik seperti sebelum GalatConfig ada", async () => {
    const kosong = await mkdtempSementara("eb-kosong-galat-");
    let galat: unknown;
    try {
      await loadConfig(kosong);
    } catch (e) {
      galat = e;
    }
    expect(galat).toBeInstanceOf(GalatConfig);
    const g = galat as GalatConfig;
    expect(g.kode).toBe("config.tidak_ditemukan");
    expect(g.params).toEqual({ dari: kosong });
    // Pemanggil LAMA yang cuma membaca `.message` (belum tahu GalatConfig sama sekali) wajib
    // melihat teks yang SAMA PERSIS seperti sebelum GalatConfig ditambahkan -- dicek lawan
    // wording literal, bukan diturunkan dari katalog, supaya test ini juga menangkap kalau
    // load.ts DAN katalog menyimpang bersamaan ke arah yang sama-sama salah.
    expect(g.message).toBe(
      `standard.config.json tidak ditemukan dari ${kosong} sampai akar filesystem.`,
    );
  });

  it("melempar GalatConfig dengan .kode dan .params benar bila skema tak lolos, dan .message tetap menyebut kunci yang salah", async () => {
    const akar = await mkdtempSementara("eb-rusak-galat-");
    const rusak = structuredClone(MINIMAL) as Record<string, unknown>;
    delete (rusak["go"] as Record<string, unknown>)["modulePath"];
    await writeFile(path.join(akar, "standard.config.json"), JSON.stringify(rusak));

    let galat: unknown;
    try {
      await loadConfig(akar);
    } catch (e) {
      galat = e;
    }
    expect(galat).toBeInstanceOf(GalatConfig);
    const g = galat as GalatConfig;
    expect(g.kode).toBe("config.skema_gagal");
    expect(g.params.jalur).toBe(path.join(akar, "standard.config.json"));
    expect(g.params.rincian).toContain("modulePath");
    expect(g.message).toBe(`${g.params.jalur} tidak lolos skema: ${g.params.rincian}`);
  });

  /**
   * Kasus "config.schema.json hilang" PINDAH ke `src/gen/instalasi.test.ts`.
   *
   * Versinya di sini me-RENAME berkas skema NYATA paket lalu memulihkannya lewat `finally`, dan
   * alasan yang membenarkannya ("pulih dalam hitungan detik, `git status` langsung
   * menunjukkannya") mengandaikan working tree git yang TIDAK AKAN ADA di tempat yang penting:
   * model distribusi paket ini adalah salin-folder lalu `pnpm test`, dan di folder salinan tidak
   * ada git. Ctrl-C di jendela sempit itu meninggalkan PAKET TERKIRIM dalam keadaan rusak, dan
   * kegagalan lanjutannya menunjuk ke ketiadaan berkas, bukan ke sebabnya.
   *
   * Penjagaannya tidak hilang — ia dipindahkan ke tempat yang memang sudah membangun SALINAN paket
   * di tmpdir, dan di sana skemanya boleh benar-benar dihapus.
   */
});
