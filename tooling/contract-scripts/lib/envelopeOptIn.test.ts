import { describe, expect, it } from "vitest";
import {
  bacaBaseline,
  entriMentah,
  isEmpty,
  isOptedIn,
  parseOptIn,
  splitEntry,
  tagValidasiIsi,
} from "./envelopeOptIn.js";
import { buatT } from "../pesan.js";
import { muatPesan } from "../../../src/messages/index.js";

const t = buatT(await muatPesan("id"));
const LABEL = "opt-in.json";
const urai = (raw: unknown) => parseOptIn(raw, LABEL, t);

describe("parseOptIn", () => {
  it("memisahkan tag penuh dari operasi tunggal", () => {
    const o = urai({ tags: ["buku-tamu", "public:postPublicBukuTamu"] });
    expect([...o.tags]).toEqual(["buku-tamu"]);
    expect([...o.ops]).toEqual(["postPublicBukuTamu"]);
  });
  it("daftar kosong itu sah", () => expect(isEmpty(urai({ tags: [] }))).toBe(true));
  it("menolak entri tak lengkap", () => {
    expect(() => urai({ tags: ["public:"] })).toThrow(/tidak lengkap/);
    expect(() => urai({ tags: [":op"] })).toThrow(/tidak lengkap/);
  });
  // Mutan yang membuang validasi "entri bukan string" lolos tanpa test ini — angka/null/objek
  // harus ditolak, bukan cuma string kosong.
  it("menolak entri yang bukan string (mis. angka)", () => {
    expect(() => urai({ tags: [123] })).toThrow(/bukan string/);
  });
  // Mutan yang membuang HANYA cek string-kosong (menyisakan cek `typeof`) lolos tanpa test ini —
  // entri `"   "` akan diterima sebagai nama tag yang tak pernah cocok apa pun, dan gate lalu
  // melaporkan "sudah bermigrasi" untuk nol operasi.
  it("menolak entri string kosong/whitespace", () => {
    expect(() => urai({ tags: ["  "] })).toThrow(/bukan string/);
  });
  it("menolak `tags` bukan larik", () => expect(() => urai({})).toThrow(/harus larik/));
  it("pesan galatnya menyebut BERKAS yang dilaporkan, bukan nama berkas yang dipaku", () => {
    // Ini yang membuat skrip ini portabel: label datang dari `jalur.ledger(...)`, jadi pesan
    // galatnya menunjuk berkas yang benar di proyek mana pun.
    expect(() => parseOptIn({ tags: [1] }, "buku-besar-lain.json", t)).toThrow(/buku-besar-lain\.json/);
  });
});

describe("splitEntry", () => {
  it("mengembalikan { tag } untuk entri tanpa titik dua", () =>
    expect(splitEntry("buku-tamu", LABEL, t)).toEqual({ tag: "buku-tamu" }));
  it("mengembalikan { op } untuk entri tag:operationId", () =>
    expect(splitEntry("public:postPublicBukuTamu", LABEL, t)).toEqual({ op: "postPublicBukuTamu" }));
});

describe("entriMentah", () => {
  it("memulangkan entri APA ADANYA, supaya entri yang tak cocok apa pun bisa disebut satu per satu", () =>
    expect(entriMentah({ tags: ["a", "b:c"] }, LABEL, t)).toEqual(["a", "b:c"]));
});

describe("isOptedIn", () => {
  const o = urai({ tags: ["buku-tamu", "public:postPublicBukuTamu"] });
  it("cocok lewat tag", () =>
    expect(isOptedIn({ tags: ["buku-tamu"], operationId: "getBukuTamu" }, o)).toBe(true));
  it("cocok lewat operationId meski tag-nya tidak terdaftar", () =>
    expect(isOptedIn({ tags: ["public"], operationId: "postPublicBukuTamu" }, o)).toBe(true));
  it("TIDAK menyeret operasi lain bertag sama", () =>
    expect(isOptedIn({ tags: ["public"], operationId: "getPublicDesaDetail" }, o)).toBe(false));
});

// Dua mutan `isEmpty` lolos tanpa test ini — satu selalu-`true`, satu lagi hanya membaca `tags`
// dan mengabaikan `ops`. Konsekuensi nyata mutan kedua: opt-in yang isinya cuma satu operationId
// dibaca gate sebagai "daftar KOSONG", jadi gate mencetak "NOL diperiksa" padahal sedang memeriksa
// satu operasi — pesan hijau yang berbohong tentang cakupannya sendiri.
describe("isEmpty", () => {
  it("kosong kalau tags dan ops dua-duanya kosong", () => expect(isEmpty(urai({ tags: [] }))).toBe(true));
  it("TIDAK kosong kalau ada tag penuh", () => expect(isEmpty(urai({ tags: ["buku-tamu"] }))).toBe(false));
  it("TIDAK kosong kalau hanya operationId terisi", () =>
    expect(isEmpty(urai({ tags: ["public:postPublicBukuTamu"] }))).toBe(false));
});

describe("bacaBaseline", () => {
  it("default NOL saat blok baseline tidak ada — proyek baru memang harus nol", () => {
    expect(bacaBaseline({ tags: [] })).toEqual({ belumDiimplementasi: 0, badanNullable: 0 });
  });
  it("membaca angka yang tertulis", () => {
    expect(bacaBaseline({ baseline: { belumDiimplementasi: 13, badanNullable: 6 } })).toEqual({
      belumDiimplementasi: 13,
      badanNullable: 6,
    });
  });
  // Nilai bukan-bilangan TIDAK boleh mengalir sebagai NaN: setiap perbandingan `>` terhadap NaN
  // bernilai false, jadi baselinenya berhenti menahan apa pun TANPA satu pun galat — gate yang
  // mati diam-diam, persis kelas yang paling mahal.
  it("nilai bukan bilangan bulat non-negatif jatuh ke nol, bukan NaN", () => {
    expect(bacaBaseline({ baseline: { belumDiimplementasi: "13", badanNullable: -2 } })).toEqual({
      belumDiimplementasi: 0,
      badanNullable: 0,
    });
    expect(bacaBaseline({ baseline: { belumDiimplementasi: 1.5 } }).belumDiimplementasi).toBe(0);
  });
});

describe("tagValidasiIsi", () => {
  it("kosong kalau kuncinya tidak ada — allowlist yang belum diisi berarti belum ada yang diaudit", () =>
    expect(tagValidasiIsi({ tags: [] }).size).toBe(0));
  it("membaca daftar tag yang sudah diaudit", () =>
    expect([...tagValidasiIsi({ contentValidationTags: ["a", "b"] })]).toEqual(["a", "b"]));
});
