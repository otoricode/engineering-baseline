/**
 * Test buku besar wiring.
 *
 * Yang diuji di sini bukan "apakah fungsinya jalan", tapi apakah ia GAGAL pada keadaan yang
 * seharusnya gagal. Buku besar ini menggantikan perbandingan himpunan rute yang dulu dilakukan
 * dengan mem-parse sumber Go; kalau ia bisa berbohong tanpa ketahuan, penggantiannya rugi.
 *
 * Dua arah yang paling penting, dan keduanya punya test sendiri:
 *   - mengklaim sudah Mount padahal belum  -> harus GAGAL;
 *   - sudah Mount tapi lupa dicatat        -> harus GAGAL.
 *
 * Arah kedua itu yang menjaga daftar tetap tumbuh dengan verifikasi, bukan dengan pengampunan.
 */
import { describe, expect, it } from "vitest";
import {
  loadBukuBesar,
  periksaCakupanTag,
  periksaGenerasi,
  periksaKesesuaianMount,
  type BukuBesar,
  type KeadaanGenerasi,
} from "./mountedModules.js";
import { buatT } from "../pesan.js";
import { muatPesan } from "../../../src/messages/index.js";

const t = buatT(await muatPesan("id"));
const LABEL = "modul-terpasang.json";
const OPTIN = "opt-in.json";
const SITIR = "[G-05]";

const bb = (over: Partial<BukuBesar> = {}): BukuBesar => ({
  mount: {},
  optInBelumMount: {},
  belumOptIn: [],
  tergenerate: {},
  handWired: {},
  ...over,
});

/** Pembaca berkas pendaftaran tiruan: peta direktori -> isi sumber. */
const pembaca = (peta: Record<string, string>) => (dir: string) => peta[dir] ?? null;

const DENGAN_MOUNT = "func Register(p, q *gin.RouterGroup, db *gorm.DB) {\n\tfoogen.Mount(p, q, &handler{})\n}\n";
const TANPA_MOUNT = 'func Register(p, q *gin.RouterGroup, db *gorm.DB) {\n\tq.GET("/x", h.x)\n}\n';

/** Bentuk minimum yang SAH — tiap test bentuk merusak tepat satu bagian darinya. */
const SAH = { mount: {}, optInBelumMount: {}, belumOptIn: [], tergenerate: {}, handWired: {} };

describe("loadBukuBesar — validasi bentuk", () => {
  it("menerima bentuk yang sah", () => {
    const raw = JSON.stringify({
      mount: { a: "a" },
      optInBelumMount: { b: "b" },
      belumOptIn: ["c"],
      tergenerate: { d: "d" },
      handWired: { e: "e" },
    });
    expect(loadBukuBesar(raw, LABEL, t)).toEqual({
      mount: { a: "a" },
      optInBelumMount: { b: "b" },
      belumOptIn: ["c"],
      tergenerate: { d: "d" },
      handWired: { e: "e" },
    });
  });

  it("menolak JSON rusak dengan pesan terkurasi, bukan stack trace", () => {
    expect(() => loadBukuBesar("{ bukan json", LABEL, t)).toThrow(/bukan JSON yang sah/);
  });

  it("menolak bagian yang bukan objek", () => {
    expect(() => loadBukuBesar(JSON.stringify({ ...SAH, mount: [] }), LABEL, t)).toThrow(/"mount"/);
  });

  it("menolak nilai direktori kosong — entri semacam itu tak bisa diperiksa", () => {
    expect(() => loadBukuBesar(JSON.stringify({ ...SAH, mount: { a: "  " } }), LABEL, t)).toThrow(/mount\."a"/);
  });

  it("menolak belumOptIn yang bukan array string", () => {
    expect(() => loadBukuBesar(JSON.stringify({ ...SAH, belumOptIn: [1] }), LABEL, t)).toThrow(/belumOptIn/);
  });
});

describe("periksaCakupanTag — buku besar harus mencakup TEPAT tag opt-in", () => {
  it("hijau saat cakupannya persis", () => {
    expect(periksaCakupanTag(bb({ mount: { a: "a" }, optInBelumMount: { b: "b" } }), ["a", "b"], { bukuBesar: LABEL, optIn: OPTIN }, t, SITIR)).toEqual([]);
  });

  it("GAGAL saat tag opt-in baru tidak tercatat — kalau tidak, ia lolos tanpa radar", () => {
    const errs = periksaCakupanTag(bb({ mount: { a: "a" } }), ["a", "baru"], { bukuBesar: LABEL, optIn: OPTIN }, t, SITIR);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/"baru".*tidak tercatat/s);
  });

  it("GAGAL saat buku besar mencatat tag yang bukan opt-in", () => {
    const errs = periksaCakupanTag(bb({ mount: { hantu: "x" } }), [], { bukuBesar: LABEL, optIn: OPTIN }, t, SITIR);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/"hantu".*BUKAN tag opt-in/s);
  });
});

describe("periksaKesesuaianMount — dua arah", () => {
  it("hijau saat catatan cocok dengan kenyataan", () => {
    const errs = periksaKesesuaianMount(
      bb({ mount: { a: "fa" }, optInBelumMount: { b: "fb" }, belumOptIn: ["fc"] }),
      pembaca({ fa: DENGAN_MOUNT, fb: TANPA_MOUNT, fc: TANPA_MOUNT }),
      LABEL, t, SITIR,
    );
    expect(errs).toEqual([]);
  });

  it("GAGAL saat tag DIKLAIM sudah memakai wiring generated tapi berkas pendaftarannya tidak", () => {
    const errs = periksaKesesuaianMount(bb({ mount: { a: "fa" } }), pembaca({ fa: TANPA_MOUNT }), LABEL, t, SITIR);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/mengklaim verifikasi yang tidak ada/);
  });

  // Arah yang paling mudah lupa, dan yang paling berbahaya kalau hilang: modul diretrofit,
  // catatannya tidak dipindah, lalu ia tidak diperiksa gate mana pun — diam-diam.
  it("GAGAL saat berkas pendaftaran sudah memakai wiring generated tapi masih tercatat optInBelumMount", () => {
    const errs = periksaKesesuaianMount(bb({ optInBelumMount: { a: "fa" } }), pembaca({ fa: DENGAN_MOUNT }), LABEL, t, SITIR);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/pindahkan ke "mount"/);
  });

  it("GAGAL saat feature belumOptIn ternyata sudah memakai wiring generated", () => {
    const errs = periksaKesesuaianMount(bb({ belumOptIn: ["fc"] }), pembaca({ fc: DENGAN_MOUNT }), LABEL, t, SITIR);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/tercatat "belumOptIn"/);
  });

  it("GAGAL saat entri menunjuk direktori tanpa berkas pendaftaran — salah ketik nama paket", () => {
    const errs = periksaKesesuaianMount(bb({ mount: { a: "tidak-ada" } }), pembaca({}), LABEL, t, SITIR);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/tidak punya berkas pendaftaran/);
  });

  // Satu direktori feature bisa memikul DUA tag (`desil` melayani `desil` dan `desil-import`).
  // Saat direktorinya diretrofit, KEDUA tag harus pindah bersama — kalau hanya satu yang
  // dipindah, arah kedua di atas yang menangkapnya.
  it("menangkap direktori dua-tag yang catatannya dipindah setengah", () => {
    const errs = periksaKesesuaianMount(
      bb({ mount: { desil: "desil" }, optInBelumMount: { "desil-import": "desil" } }),
      pembaca({ desil: DENGAN_MOUNT }),
      LABEL, t, SITIR,
    );
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/desil-import/);
  });
});

describe("periksaGenerasi — sumbu generasi kerangka, dua arah", () => {
  /** Pembaca keadaan tiruan: peta direktori -> keadaan. Direktori tak dikenal = "kosong". */
  const keadaan = (peta: Record<string, KeadaanGenerasi>) => ({
    daftarDir: () => Object.keys(peta),
    baca: (dir: string): KeadaanGenerasi => peta[dir] ?? "kosong",
  });

  it("hijau saat klaim == disk", () => {
    const k = keadaan({ a: "tergenerate", b: "handWired" });
    const errs = periksaGenerasi(bb({ tergenerate: { a: "a" }, handWired: { b: "b" } }), k.daftarDir, k.baca, LABEL, t, SITIR);
    expect(errs).toEqual([]);
  });

  it("GAGAL saat direktori punya kerangka generated tapi tidak tercatat — modul yang boot lalu PANIC saat dipanggil", () => {
    const k = keadaan({ a: "tergenerate" });
    const errs = periksaGenerasi(bb(), k.daftarDir, k.baca, LABEL, t, SITIR);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/feature\/a.*TIDAK tercatat/s);
  });

  it("GAGAL saat diklaim tergenerate padahal berkasnya sudah beku", () => {
    const k = keadaan({ a: "handWired" });
    const errs = periksaGenerasi(bb({ tergenerate: { a: "a" } }), k.daftarDir, k.baca, LABEL, t, SITIR);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/tercatat "tergenerate" tapi berkasnya menunjukkan "handWired"/);
  });

  it("GAGAL saat pembekuan berhenti di tengah — dua lapisan modul dari dua usia kontrak", () => {
    const k = keadaan({ a: "campuran" });
    const errs = periksaGenerasi(bb({ handWired: { a: "a" } }), k.daftarDir, k.baca, LABEL, t, SITIR);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/BEKU dan TERGENERATE sekaligus/);
  });

  it("GAGAL saat satu direktori tercatat di kedua bagian sekaligus", () => {
    const k = keadaan({ a: "tergenerate" });
    const errs = periksaGenerasi(bb({ tergenerate: { a: "a" }, handWired: { alias: "a" } }), k.daftarDir, k.baca, LABEL, t, SITIR);
    expect(errs.some((e) => /"tergenerate" DAN "handWired" sekaligus/.test(e))).toBe(true);
  });

  it("GAGAL saat klaim menunjuk direktori tanpa berkas kerangka sama sekali", () => {
    const k = keadaan({});
    const errs = periksaGenerasi(bb({ handWired: { hantu: "hantu" } }), k.daftarDir, k.baca, LABEL, t, SITIR);
    expect(errs).toHaveLength(1);
    expect(errs[0]).toMatch(/tidak punya berkas kerangka/);
  });
});
