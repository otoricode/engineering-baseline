import { describe, expect, it } from "vitest";
import { LANGKAH } from "../gate/command.js";
import { gateTerkirim } from "./command.js";
import { lintGateTerkirim, lintRules } from "./lint.js";
import { PENANDA_KONSUMEN, type Rule } from "./parse.js";

const dasar = (p: Partial<Rule>): Rule => ({
  id: "C-01", judul: "j", ditegakkanOleh: "gate:x", usang: null,
  berkas: "rules/C.md", baris: 1, rujukan: [], ...p,
});

describe("lintRules", () => {
  it("menerima berkas yang sehat", () => {
    expect(lintRules([dasar({}), dasar({ id: "C-02" })])).toEqual([]);
  });

  it("menolak ID ganda", () => {
    const t = lintRules([dasar({}), dasar({ baris: 9 })]);
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("C-01");
    expect(t[0]!.baris).toBe(9);
  });

  it("menolak aturan tanpa penegak", () => {
    const t = lintRules([dasar({ ditegakkanOleh: "" })]);
    expect(t[0]!.pesan).toContain("Ditegakkan oleh");
  });

  it("menerima manual-review-only sebagai penegak sah", () => {
    expect(lintRules([dasar({ ditegakkanOleh: "manual-review-only" })])).toEqual([]);
  });

  it("menolak rujukan silang ke ID yang tidak ada", () => {
    const t = lintRules([dasar({ rujukan: ["T-99"] })]);
    expect(t[0]!.pesan).toContain("T-99");
  });

  it("membolehkan rujukan ke aturan usang", () => {
    expect(lintRules([
      dasar({ rujukan: ["C-02"] }),
      dasar({
        id: "C-02",
        usang: "digabung (2026-08-16)",
        ditegakkanOleh: "manual-review-only — sudah tidak ditegakkan",
      }),
    ])).toEqual([]);
  });
});

describe("USANG tidak boleh jadi tombol bisu", () => {
  // Mutasi yang dipakai pengulas, diulang persis: ambil aturan keamanan yang MASIH
  // ber-gate dan masih wajib ada, tempelkan satu baris "**Status:** USANG" karangan.
  // Sebelum pemeriksaan ini, baris itu membebaskannya dari tuntutan kelengkapan prosa
  // dan seluruh suite tetap hijau — pintu belakang setebal satu baris teks yang bisa
  // membungkam aturan apa pun.
  it("menolak aturan ber-gate yang diberi penanda USANG", () => {
    const t = lintRules([
      dasar({ id: "T-05", usang: "dicabut karangan (2026-08-16)", ditegakkanOleh: "gate:contract-permissions" }),
    ]);
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("T-05");
    expect(t[0]!.pesan).toContain("USANG");
    expect(t[0]!.pesan).toContain("gate:contract-permissions");
  });

  it("menerima aturan usang yang benar-benar dilepas dari gate-nya", () => {
    expect(lintRules([
      dasar({
        id: "T-05",
        usang: "digantikan [[T-02]] (2026-08-16)",
        ditegakkanOleh: "manual-review-only — sudah tidak ditegakkan; dipertahankan sebagai riwayat",
      }),
    ])).toEqual([]);
  });

  // Aturan tanpa penegak sama sekali sudah punya temuannya sendiri; USANG tidak
  // boleh menambahkan temuan KEDUA untuk cacat yang sama.
  it("aturan usang tanpa penegak hanya menghasilkan satu temuan", () => {
    const t = lintRules([dasar({ usang: "dicabut (2026-08-16)", ditegakkanOleh: "" })]);
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("tidak punya");
  });

  // Temuan fix-round-4 C2, mutasi pengulas: predikat berbasis AWALAN
  // "manual-review-only" sudah dipenuhi oleh 15 aturan manual yang MASIH HIDUP, jadi
  // pada mereka penanda USANG membungkam pemeriksaan kelengkapan prosa tanpa
  // perubahan kedua apa pun — justru pada aturan yang seluruh isinya prosa, karena
  // tak satu pun punya gate. Predikatnya kini kalimat penuh bentuk pencabutan.
  it("menolak aturan manual yang MASIH HIDUP saat diberi penanda USANG", () => {
    const t = lintRules([
      dasar({
        id: "T-03",
        usang: "karangan (2026-08-16)",
        ditegakkanOleh:
          "manual-review-only — menuntut mengikuti tipe balikan, bukan mencocokkan satu baris",
      }),
    ]);
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("T-03");
    expect(t[0]!.pesan).toContain("USANG");
  });

  it("penegak manual-review-only polos tetap sah selama aturannya TIDAK usang", () => {
    expect(lintRules([
      dasar({ ditegakkanOleh: "manual-review-only — mesin tak bisa memeriksanya" }),
    ])).toEqual([]);
  });
});

/**
 * Keadaan KETIGA kolom penegak: gate yang nyata tapi pelaksananya bukan paket ini.
 *
 * Diukur sebelum pemeriksaan ini ada: 11 kolom di `rules/` menyebut 9 nama gate yang punya NOL
 * sumber pelaksana — `gate:tenancy-byid` (batas penyewa) dan `gate:allowlist-monotonic` (fondasi
 * langkah 3–4 INSTALL.md) termasuk. Bentuknya identik dengan gate yang sungguhan, jadi tidak ada
 * cara membedakannya selain meng-grep sumber satu per satu.
 */
describe("lintGateTerkirim", () => {
  const TERKIRIM = new Set(["gate:contract-envelope", "gate:generated-sync"]);

  it("menerima gate yang benar-benar dikirim", () => {
    const t = lintGateTerkirim([dasar({ ditegakkanOleh: "gate:contract-envelope" })], TERKIRIM);
    expect(t).toEqual([]);
  });

  it("MERAH untuk nama gate yang tidak punya pelaksana dan tidak bertanda", () => {
    const t = lintGateTerkirim([dasar({ ditegakkanOleh: "gate:tenancy-byid" })], TERKIRIM);
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("gate:tenancy-byid");
    // Pesannya menyebut kedua jalan keluarnya, bukan cuma menyalahkan.
    expect(t[0]!.pesan).toContain(PENANDA_KONSUMEN);
  });

  it("menerima nama yang sama begitu ditandai (konsumen)", () => {
    const t = lintGateTerkirim([dasar({ ditegakkanOleh: `gate:tenancy-byid ${PENANDA_KONSUMEN}` })], TERKIRIM);
    expect(t).toEqual([]);
  });

  // Arah kedua, dan ia yang menjaga penanda itu tidak jadi tempat parkir: gate yang KINI dikirim
  // tapi masih bertanda menyuruh pemakai membangun yang sudah ia punya.
  it("MERAH untuk penanda (konsumen) yang BASI", () => {
    const t = lintGateTerkirim(
      [dasar({ ditegakkanOleh: `gate:contract-envelope ${PENANDA_KONSUMEN}` })],
      TERKIRIM,
    );
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("basi");
  });

  it("kolom ber-gate-banyak diperiksa per nama", () => {
    const t = lintGateTerkirim(
      [dasar({ ditegakkanOleh: `gate:contract-envelope + gate:golden-ids` })],
      TERKIRIM,
    );
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("gate:golden-ids");
  });

  it("manual-review-only dan `standard <subperintah>` bukan urusannya", () => {
    expect(lintGateTerkirim([dasar({ ditegakkanOleh: "manual-review-only — alasan" })], TERKIRIM)).toEqual([]);
    expect(lintGateTerkirim([dasar({ ditegakkanOleh: "standard rules-lint" })], TERKIRIM)).toEqual([]);
  });

  it("aturan USANG dilewati — gate yang ikut dicabut memang tidak dikirim siapa pun", () => {
    const t = lintGateTerkirim(
      [dasar({ ditegakkanOleh: "gate:sudah-mati", usang: "digantikan C-05 (2026-08-16)" })],
      TERKIRIM,
    );
    expect(t).toEqual([]);
  });
});

/**
 * Inventaris gate terkirim, diadu dengan kenyataan paket ini.
 *
 * Dua arah, karena inventaris yang terlalu LEBAR membuat pemeriksaan di atas tidak pernah merah —
 * bentuk "hijau karena tidak memeriksa apa pun" yang paket ini kejar di mana-mana.
 */
describe("gateTerkirim", () => {
  it("memuat gate yang `standard gate` jalankan DAN gate yang dikirim lewat template CI", async () => {
    const nama = await gateTerkirim();
    for (const l of LANGKAH) for (const g of l.gate) expect(nama.has(g), g).toBe(true);
    // Dikirim sebagai LANGKAH WORKFLOW, bukan skrip — sumber kedua inventaris ini.
    expect(nama.has("gate:generated-sync")).toBe(true);
  });

  it("TIDAK memuat gate yang paket ini memang tidak kirim", async () => {
    const nama = await gateTerkirim();
    for (const g of ["gate:tenancy-byid", "gate:golden-ids", "gate:frontend-typecheck"]) {
      expect(nama.has(g), g).toBe(false);
    }
  });
});
