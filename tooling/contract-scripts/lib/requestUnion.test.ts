/**
 * Test pencarian bentuk union di badan permintaan ([[C-05]], `gate:contract-lint`).
 *
 * Kontrol positifnya sama pentingnya dengan kasus merahnya: bentuk union di RESPONS itu sah dan
 * lazim (`oneOf` di payload polimorfik), dan gate yang memerahkannya akan memerahkan kontrak yang
 * benar di hari pertama pemasangan — kelas yang [[G-06]] larang.
 */
import { describe, expect, it } from "vitest";
import { periksaBadanUnion, type Bundel } from "./requestUnion.js";

const METODE = ["get", "post", "put", "delete", "patch"];

const bundel = (paths: Bundel["paths"], components?: Bundel["components"]): Bundel => ({
  paths,
  components,
});

describe("periksaBadanUnion", () => {
  it("union di akar badan permintaan = MERAH, menyebut operasi, media, dan lokasinya", () => {
    const h = periksaBadanUnion(
      bundel({
        "/pub": {
          post: {
            requestBody: {
              content: { "application/json": { schema: { oneOf: [{ type: "object" }, { type: "object" }] } } },
            },
          },
        },
      }),
      METODE,
    );
    expect(h.temuan).toHaveLength(1);
    expect(h.temuan[0]).toMatchObject({
      jenis: "union",
      operasi: "POST /pub",
      media: "application/json",
      kata: "oneOf",
      lokasi: "#/oneOf",
    });
    expect(h.badan).toBe(1);
  });

  // Union yang bersembunyi satu tingkat di dalam memancarkan kelas tipe yang sama di generator,
  // dan justru lebih sulit dilihat pembaca kontrak. Versi yang hanya memeriksa simpul akar lolos
  // di sini — itu kasus khusus dangkal yang selalu punya kasus keempat.
  it("union BERSARANG di properti badan juga MERAH", () => {
    const h = periksaBadanUnion(
      bundel({
        "/pub": {
          put: {
            requestBody: {
              content: {
                "application/json": {
                  schema: { type: "object", properties: { isi: { anyOf: [{ type: "string" }] } } },
                },
              },
            },
          },
        },
      }),
      METODE,
    );
    expect(h.temuan).toHaveLength(1);
    expect(h.temuan[0]).toMatchObject({ kata: "anyOf", lokasi: "#/properties/isi/anyOf" });
  });

  it("union di balik $ref skema tetap ketemu", () => {
    const h = periksaBadanUnion(
      bundel(
        {
          "/pub": {
            post: {
              requestBody: {
                content: { "application/json": { schema: { $ref: "#/components/schemas/Badan" } } },
              },
            },
          },
        },
        { schemas: { Badan: { oneOf: [{ type: "object" }] } } },
      ),
      METODE,
    );
    expect(h.temuan).toHaveLength(1);
    expect(h.temuan[0]).toMatchObject({ kata: "oneOf" });
  });

  it("badan permintaan berbentuk $ref ke components.requestBodies ikut diperiksa", () => {
    const h = periksaBadanUnion(
      bundel(
        { "/pub": { post: { requestBody: { $ref: "#/components/requestBodies/Pub" } } } },
        {
          requestBodies: {
            Pub: { content: { "application/json": { schema: { anyOf: [{ type: "object" }] } } } },
          },
        },
      ),
      METODE,
    );
    expect(h.temuan).toHaveLength(1);
    expect(h.badan).toBe(1);
  });

  // KONTROL POSITIF 1: union di RESPONS tidak disentuh sama sekali.
  it("union di respons TIDAK dilaporkan — aturannya soal badan permintaan", () => {
    const h = periksaBadanUnion(
      bundel({
        "/pub": {
          get: {
            responses: {
              "200": { content: { "application/json": { schema: { oneOf: [{ type: "object" }] } } } },
            },
          },
        },
      }),
      METODE,
    );
    expect(h.temuan).toEqual([]);
    expect(h.operasi).toBe(1);
    expect(h.badan).toBe(0);
  });

  // KONTROL POSITIF 2: badan biasa (objek, allOf, larik) tetap hijau.
  it("badan objek biasa, allOf, dan larik tetap hijau", () => {
    const h = periksaBadanUnion(
      bundel({
        "/pub": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: {
                    allOf: [
                      { type: "object", properties: { a: { type: "string" } } },
                      { type: "object", properties: { b: { type: "array", items: { type: "string" } } } },
                    ],
                  },
                },
              },
            },
          },
        },
      }),
      METODE,
    );
    expect(h.temuan).toEqual([]);
    expect(h.badan).toBe(1);
  });

  // KONTROL POSITIF 3: `example` memuat DATA pengguna, dan data boleh punya properti bernama
  // `oneOf`. Menelusurinya berarti memerahkan kontrak yang benar karena isi contohnya.
  it("properti bernama oneOf DI DALAM example tidak dilaporkan", () => {
    const h = periksaBadanUnion(
      bundel({
        "/pub": {
          post: {
            requestBody: {
              content: {
                "application/json": {
                  schema: { type: "object", example: { oneOf: ["ini data, bukan skema"] } },
                },
              },
            },
          },
        },
      }),
      METODE,
    );
    expect(h.temuan).toEqual([]);
  });

  // Skema REKURSIF (pohon menu, hierarki wilayah) itu sah dan lazim. Melemparnya berarti
  // melaporkan kontrak yang benar sebagai pelanggaran — dan menggantung berarti gate-nya mati.
  it("skema rekursif berhenti tanpa temuan dan tanpa menggantung", () => {
    const h = periksaBadanUnion(
      bundel(
        {
          "/pohon": {
            post: {
              requestBody: {
                content: { "application/json": { schema: { $ref: "#/components/schemas/Simpul" } } },
              },
            },
          },
        },
        {
          schemas: {
            Simpul: {
              type: "object",
              properties: { anak: { type: "array", items: { $ref: "#/components/schemas/Simpul" } } },
            },
          },
        },
      ),
      METODE,
    );
    expect(h.temuan).toEqual([]);
  });

  it("$ref menggantung dilaporkan sebagai temuan, bukan ditelan", () => {
    const h = periksaBadanUnion(
      bundel({
        "/pub": {
          post: {
            requestBody: {
              content: { "application/json": { schema: { $ref: "#/components/schemas/TidakAda" } } },
            },
          },
        },
      }),
      METODE,
    );
    expect(h.temuan).toHaveLength(1);
    expect(h.temuan[0]).toMatchObject({ jenis: "ref" });
  });

  // Semesta kosong: hitungannya yang membuat "hijau karena bersih" bisa dibedakan dari "hijau
  // karena tidak memeriksa apa pun" ([[G-05]]). Skripnya mencetak kedua angka ini SELALU.
  it("melaporkan hitungan operasi dan badan, termasuk saat nol", () => {
    const h = periksaBadanUnion(bundel({}), METODE);
    expect(h).toEqual({ temuan: [], operasi: 0, badan: 0 });
  });

  it("kunci non-metode (parameters, summary) tidak dihitung sebagai operasi", () => {
    const h = periksaBadanUnion(
      bundel({ "/pub": { parameters: [{ name: "id" }], summary: "x" } as never }),
      METODE,
    );
    expect(h.operasi).toBe(0);
  });
});
