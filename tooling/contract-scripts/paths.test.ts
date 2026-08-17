import path from "node:path";
import { describe, expect, it } from "vitest";
import { buatJalur } from "./paths.js";
import type { StandardConfig } from "../../src/config/schema.js";

const cfg = {
  layout: { contractDir: "packages/contract", backendDir: "apps/api", frontendDir: "apps/web" },
  contract: { bundle: "dist/openapi.bundled.yaml", sharedDir: "openapi/_shared",
              shared: { envelope: "envelope.yaml", permissions: "permissions.yaml",
                        errors: "errors.yaml", publicOps: "public-operations.yaml" } },
  ledgers: { envelopeOptIn: "opt-in.json", mountedModules: "mounted.json",
             routes: "routes.json", coverage: "cakupan.json" },
  emit: { permissions: "apps/web/src/generated/permissions.ts",
          errorCodes: "apps/web/src/generated/errorCodes.ts" },
  go: { modulePath: "example.com/p/apps/api", genDir: "internal/gen", featureDir: "internal/feature",
        dtoconvPkg: "internal/platform/dtoconv", genSuffix: ".gen.go" },
} as unknown as StandardConfig;

describe("buatJalur", () => {
  const j = buatJalur(cfg, "/proyek");

  it("bundle relatif terhadap contractDir", () => {
    expect(j.bundle()).toBe(path.join("/proyek", "packages/contract", "dist/openapi.bundled.yaml"));
  });

  it("berkas shared di bawah sharedDir", () => {
    expect(j.shared("envelope")).toBe(
      path.join("/proyek", "packages/contract", "openapi/_shared", "envelope.yaml"));
  });

  it("buku besar di akar contractDir", () => {
    expect(j.ledger("routes")).toBe(path.join("/proyek", "packages/contract", "routes.json"));
  });

  it("target emit relatif terhadap akar proyek, bukan contractDir", () => {
    expect(j.emit("permissions")).toBe(
      path.join("/proyek", "apps/web/src/generated/permissions.ts"));
  });

  // Berkas turunan tidak punya kunci config sendiri — letaknya DITENTUKAN oleh `contract.bundle`,
  // dan menaruhnya di kunci terpisah mengundang keduanya menunjuk direktori yang berbeda.
  it("berkas turunan duduk di direktori bundelnya, bukan di jalur terpisah", () => {
    expect(j.deref()).toBe(path.join("/proyek", "packages/contract", "dist", "openapi.deref.json"));
    expect(j.sharedSpec()).toBe(path.join("/proyek", "packages/contract", "dist", "openapi.shared.yaml"));
  });

  // Direktori fitur adalah SAUDARA sharedDir. Kalau keduanya bisa menunjuk induk yang berbeda,
  // `$ref` relatif yang ditulis penerap envelope tidak akan resolve dari berkas mana pun.
  it("direktori fitur saudara sharedDir, dan $ref relatifnya konsisten dengan itu", () => {
    expect(j.fitur()).toBe(path.join("/proyek", "packages/contract", "openapi", "features"));
    expect(j.refShared("envelope", "#/components/schemas/SuccessEnvelope")).toBe(
      "../_shared/envelope.yaml#/components/schemas/SuccessEnvelope");
  });

  it("jalur Go: berkas dari layout, IMPOR dari modulePath — dan impor selalu berpemisah '/'", () => {
    expect(j.goGen("btgen", "wiring.gen.go")).toBe(
      path.join("/proyek", "apps/api", "internal/gen", "btgen", "wiring.gen.go"));
    expect(j.goFeature("bukutamu")).toBe(path.join("/proyek", "apps/api", "internal/feature", "bukutamu"));
    // `genDir` adalah jalur BERKAS; disambung mentah ke jalur impor ia akan membawa pemisah host.
    expect(j.goImportGen()).toBe("example.com/p/apps/api/internal/gen");
    expect(j.goImportGen("common")).toBe("example.com/p/apps/api/internal/gen/common");
    expect(j.goPlatform("guard")).toBe("example.com/p/apps/api/internal/platform/guard");
  });

  // `go.entrypoint` opsional. `null` BUKAN izin melewati pemeriksaan — pemanggilnya wajib
  // memerahkan gate; yang dijamin di sini cuma bahwa ketiadaannya terbaca sebagai ketiadaan,
  // bukan sebagai jalur ke direktori backend yang kebetulan ada.
  it("entrypoint: null saat tak dikonfigurasi, absolut saat diisi", () => {
    expect(j.goEntrypoint()).toBeNull();
    const dengan = buatJalur(
      { ...cfg, go: { ...cfg.go, entrypoint: "cmd/server/main.go" } } as StandardConfig,
      "/proyek",
    );
    expect(dengan.goEntrypoint()).toBe(path.join("/proyek", "apps/api", "cmd/server/main.go"));
  });

  it("permissionSeeds: larik kosong saat tak dikonfigurasi, absolut terhadap AKAR saat diisi", () => {
    expect(j.permissionSeeds()).toEqual([]);
    const dengan = buatJalur(
      { ...cfg, contract: { ...cfg.contract, permissionSeeds: ["apps/api/seed/perm.go"] } } as StandardConfig,
      "/proyek",
    );
    expect(dengan.permissionSeeds()).toEqual([path.join("/proyek", "apps/api/seed/perm.go")]);
  });
});
