import { describe, expect, it } from "vitest";
import { buatPengumpul, buatSitiran } from "./aturan.js";
import { buatT } from "./pesan.js";
import { muatPesan } from "../../src/messages/index.js";
import type { StandardConfig } from "../../src/config/schema.js";

const t = buatT(await muatPesan("id"));

const cfg = (prefix: Record<string, string>): StandardConfig =>
  ({ rules: { docBase: "docs/rules", prefix } }) as unknown as StandardConfig;

describe("buatSitiran", () => {
  it("merakit ID dari prefix lapis di config, bukan dari prefix yang dipaku", () => {
    const a = buatSitiran(cfg({ contract: "C", backend: "B", gate: "G", tenancy: "T" }), t);
    expect(a.id("contract", "01")).toBe("C-01");
    expect(a.label("contract", "01")).toBe("[C-01]");
    expect(a.id("gate", "05")).toBe("G-05");

    // Prefix proyek boleh apa saja — nomornya milik standar, prefiksnya milik proyek.
    const b = buatSitiran(cfg({ contract: "KTR", backend: "B", gate: "G", tenancy: "T" }), t);
    expect(b.label("contract", "01")).toBe("[KTR-01]");
  });

  it("prefix kosong = degradasi, bukan macet: label tetap ada dan menyebut kunci yang harus diisi", () => {
    const a = buatSitiran(cfg({ contract: "", backend: "B", gate: "G", tenancy: "T" }), t);
    expect(a.id("contract", "01")).toBeNull();
    const label = a.label("contract", "01");
    expect(label).toContain("rules.prefix.contract");
    expect(label).toContain("01");
    // Dan ia TIDAK boleh terbaca seperti ID sungguhan: pembaca yang menuruti `[-01]` akan mencari
    // aturan yang tidak ada, lalu menyimpulkan gate-nya berbohong.
    expect(label).not.toMatch(/^\[[A-Za-z]*-01\]$/);
  });

  it("prefix berisi spasi diperlakukan sebagai kosong, bukan dirakit jadi ID palsu", () => {
    // `"  "` lolos `{"type":"string"}` di skema config. Tanpa trim, ia merakit `"  -01"` — sebuah
    // token yang di keluaran CI terlihat persis seperti ID sungguhan yang kolomnya bergeser.
    const a = buatSitiran(cfg({ contract: "  ", backend: "B", gate: "G", tenancy: "T" }), t);
    expect(a.id("contract", "01")).toBeNull();
    expect(a.label("contract", "01")).toContain("rules.prefix.contract");
  });

  it("spasi di sekitar prefix dipangkas, bukan ikut masuk ke ID", () => {
    const a = buatSitiran(cfg({ contract: " C ", backend: "B", gate: "G", tenancy: "T" }), t);
    expect(a.id("contract", "01")).toBe("C-01");
  });

  it("footer menunjuk folder aturan proyek DAN ID-nya", () => {
    const a = buatSitiran(cfg({ contract: "C", backend: "B", gate: "G", tenancy: "T" }), t);
    const f = a.footer("contract", "01");
    expect(f).toContain("docs/rules");
    expect(f).toContain("C-01");
  });

  it("footer tetap berguna saat prefiksnya kosong: folder aturannya tetap disebut", () => {
    const a = buatSitiran(cfg({ contract: "", backend: "B", gate: "G", tenancy: "T" }), t);
    const f = a.footer("contract", "01");
    expect(f).toContain("docs/rules");
    expect(f).toContain("rules.prefix.contract");
  });
});

// Kaki keluaran gate dicetak di AKHIR, jauh dari temuannya. Sebuah gate yang bisa menyitir
// beberapa aturan lalu mudah sekali mencetak kaki untuk aturan yang tidak pernah menyala —
// terukur: satu temuan tabrakan nama parameter mencetak kaki yang menunjuk aturan pemasangan
// modul dan aturan buku besar, dua aturan yang tak ada hubungannya dengan temuan itu.
describe("buatPengumpul", () => {
  const aturan = buatSitiran(cfg({ contract: "C", backend: "B", gate: "G", tenancy: "T" }), t);

  it("kaki hanya menyebut aturan yang BENAR-BENAR muncul di temuan", () => {
    const p = buatPengumpul(aturan);
    const labelC06 = p.label("contract", "06");
    p.label("backend", "01"); // dirakit untuk diteruskan ke pemeriksa, tapi tidak pernah menyala
    p.label("gate", "05");

    const kaki = p.kaki([`${labelC06} ada tabrakan`]);
    expect(kaki).toContain("C-06");
    expect(kaki).not.toContain("B-01");
    expect(kaki).not.toContain("G-05");
  });

  it("beberapa aturan menyala: kaki menyebut semuanya, satu per baris", () => {
    const p = buatPengumpul(aturan);
    const a = p.label("contract", "01");
    const b = p.label("gate", "03");
    const kaki = p.kaki([`${a} x`, `${b} y`]);
    expect(kaki.split("\n")).toHaveLength(2);
    expect(kaki).toContain("C-01");
    expect(kaki).toContain("G-03");
  });

  it("nol temuan: kaki kosong, bukan daftar seluruh kandidat", () => {
    const p = buatPengumpul(aturan);
    p.label("contract", "01");
    expect(p.kaki([])).toBe("");
  });
});
