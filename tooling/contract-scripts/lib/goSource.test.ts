/**
 * Helper bersama untuk setiap pembaca sumber Go di direktori ini. Sebelum ia ada, dua pembaca
 * memecahkan kelas masalah yang sama ("apa yang komentar/string/rune, apa yang kode")
 * sendiri-sendiri, dan yang lebih baru justru lebih lemah: pemisahnya cuma menangani `//` dan
 * `"..."`, buta terhadap komentar blok `/* *\/` dan raw string `` ` ``.
 *
 * `blankNonCode` adalah SATU sumber kebenaran untuk KELIMA bentuk (komentar baris, komentar
 * blok, string, raw string, rune literal) — dipakai untuk pemeriksaan STRUKTURAL (batas
 * kurung/kurawal, kemunculan identifier telanjang), bukan untuk mengekstrak nilai
 * (path/permission literal tetap dibaca dari sumber ASLI, karena offset dijamin sama
 * panjang).
 *
 * Rune literal `'...'` WAJIB ikut dimodelkan, bukan ditolak nyaring — menolaknya SALAH SASARAN,
 * karena rune literal BISA dimodelkan
 * (mesinnya identik dengan string). `assertModeledLexemes` yang benar menolak lexeme yang
 * TIDAK PERNAH DITUTUP (string/raw-string/komentar-blok/rune yang mencapai EOF tanpa
 * penutup) — satu-satunya hal yang benar-benar tak bisa ditebak oleh `blankNonCode`, dan
 * dipanggil DARI DALAM `blankNonCode` sendiri supaya satu panggilan sudah cukup.
 *
 * Kasus test di bawah bernomor mengikuti daftar wajib brief (1-9) + koreksi tim lead (10-13)
 * — tiap satunya alasan nyata, bukan karangan (lihat komentar per kasus).
 */
import { describe, expect, it } from "vitest";
import {
  assertModeledLexemes,
  blankComments,
  blankNonCode,
  findBlockCommentStarts,
} from "./goSource.js";

const WHERE = "contoh/register.go";

// Dipakai berulang di beberapa describe block (kasus 1-9 dan invarian panjang).
const COMMENT_LINE = "// bukutamu.Register,";
const BLOCK_COMMENT = "/* bukutamu.Register, */";
const STR_WITH_SLASHES = '"a // b"';
const RAW_WITH_SLASHES = "`raw // string`";
// JS-level `\\"` -> satu backslash lalu satu kutip di string RUNTIME — merepresentasikan
// literal Go `"a \" b // c"` (kutip di-escape, isi string berlanjut sampai kutip PENUTUP
// sungguhan sesudah "c").
const STR_WITH_ESCAPED_QUOTE = '"a \\" b // c"';
const BLOCK_WITH_SLASHES = "/* a // b */";
const STR_WITH_BLOCK_MARKERS = '"a /* b */ c"';

describe("blankNonCode — kasus 1: isi komentar baris // hilang", () => {
  it("kasus nyata yang sudah menipu sebuah gate: pendaftaran yang dikomentari tetap terbaca terpasang", () => {
    const input = `foo\n${COMMENT_LINE}\nbar`;
    const expected = `foo\n${" ".repeat(COMMENT_LINE.length)}\nbar`;
    expect(blankNonCode(input, WHERE)).toBe(expected);
  });
});

describe("blankNonCode — kasus 2: isi komentar blok /* */ hilang", () => {
  it("celah yang diakui mainWiring.ts:64 sebelum task ini (tidak dimodelkan sama sekali)", () => {
    const input = `before ${BLOCK_COMMENT} after`;
    const expected = `before ${" ".repeat(BLOCK_COMMENT.length)} after`;
    expect(blankNonCode(input, WHERE)).toBe(expected);
  });
});

describe('blankNonCode — kasus 3: `//` di dalam string TIDAK dianggap komentar', () => {
  it("MARKER sesudah string tetap utuh — kalau // di dalam string keliru dianggap komentar, MARKER akan ikut hilang", () => {
    const input = `x := ${STR_WITH_SLASHES} MARKER`;
    const expected = `x := ${" ".repeat(STR_WITH_SLASHES.length)} MARKER`;
    expect(blankNonCode(input, WHERE)).toBe(expected);
  });
});

describe('blankNonCode — kasus 4: `//` di dalam raw string TIDAK dianggap komentar', () => {
  it("MARKER sesudah raw string tetap utuh", () => {
    const input = `x := ${RAW_WITH_SLASHES} MARKER`;
    const expected = `x := ${" ".repeat(RAW_WITH_SLASHES.length)} MARKER`;
    expect(blankNonCode(input, WHERE)).toBe(expected);
  });
});

describe("blankNonCode — kasus 5: escape di dalam string dihormati", () => {
  it("kutip yang di-escape (\\\") tidak mengakhiri string lebih awal — kalau diabaikan, sisa string akan terbaca kode lalu `//` sesudahnya keliru mulai komentar dan MARKER ikut hilang", () => {
    const input = `x := ${STR_WITH_ESCAPED_QUOTE} MARKER`;
    const expected = `x := ${" ".repeat(STR_WITH_ESCAPED_QUOTE.length)} MARKER`;
    expect(blankNonCode(input, WHERE)).toBe(expected);
  });
});

describe('blankNonCode — kasus 6: `//` di dalam komentar blok tidak membingungkan', () => {
  it("MARKER sesudah komentar blok tetap utuh, walau isinya sendiri memuat `//`", () => {
    const input = `${BLOCK_WITH_SLASHES} MARKER`;
    const expected = `${" ".repeat(BLOCK_WITH_SLASHES.length)} MARKER`;
    expect(blankNonCode(input, WHERE)).toBe(expected);
  });
});

describe('blankNonCode — kasus 7: `/*` di dalam string bukan komentar', () => {
  it("seluruh isi string (termasuk `/*` dan `*/` di dalamnya) hilang sebagai SATU string, MARKER sesudahnya utuh", () => {
    const input = `x := ${STR_WITH_BLOCK_MARKERS} MARKER`;
    const expected = `x := ${" ".repeat(STR_WITH_BLOCK_MARKERS.length)} MARKER`;
    expect(blankNonCode(input, WHERE)).toBe(expected);
  });
});

describe("blankNonCode — kasus 8: sumber tanpa komentar (dan tanpa string/rune) -> keluaran identik", () => {
  it("kode murni tanpa komentar maupun string/rune literal tidak berubah sama sekali", () => {
    const input = "package bukutamu\n\nfunc Register(public, protected *gin.RouterGroup) {\n\tg := protected.Group(x)\n}\n";
    expect(blankNonCode(input, WHERE)).toBe(input);
  });
});

// Kasus 10-13 (koreksi tim lead) — rune literal Go `'...'` adalah bentuk kutip KELIMA,
// bermesin identik dengan string, ditambahkan setelah draf pertama salah menolaknya nyaring.
const RUNE_PAREN = "')'";
const RUNE_ESCAPED_QUOTE = "'\\''"; // JS: backslash + kutip + kutip -> Go: '\''
const STR_WITH_APOSTROPHE = `"it's"`;
const COMMENT_WITH_APOSTROPHE = "// it's fine";

describe("blankNonCode — kasus 10: rune literal berisi karakter struktural ')' tidak mengacaukan penghitung kurung", () => {
  it("isi rune di-blank seperti string", () => {
    const input = `c := ${RUNE_PAREN} MARKER`;
    const expected = `c := ${" ".repeat(RUNE_PAREN.length)} MARKER`;
    expect(blankNonCode(input, WHERE)).toBe(expected);
  });

  it("dalam konteks pemanggilan fungsi sungguhan, kurung tetap seimbang sesudah blanking", () => {
    // Tanpa blanking rune, ')' di dalam '...' akan jadi ')' KEDUA di keluaran — merusak
    // pasangan kurung foo(...). Sesudah blanking, cuma SATU ')' asli (penutup foo) tersisa.
    const input = "foo(c := ')')";
    const out = blankNonCode(input, WHERE);
    expect((out.match(/\)/g) ?? []).length).toBe(1);
    expect(out.length).toBe(input.length);
  });
});

describe("blankNonCode — kasus 11: escape di dalam rune dihormati", () => {
  it("kutip yang di-escape (\\') di dalam rune tidak mengakhiri rune lebih awal, MARKER sesudahnya utuh", () => {
    const input = `c := ${RUNE_ESCAPED_QUOTE} MARKER`;
    const expected = `c := ${" ".repeat(RUNE_ESCAPED_QUOTE.length)} MARKER`;
    expect(blankNonCode(input, WHERE)).toBe(expected);
  });
});

describe("blankNonCode — kasus 12: kutip tunggal DI DALAM string bukan rune literal", () => {
  it("seluruh isi string (termasuk apostrof di dalamnya) hilang sebagai SATU string, MARKER sesudahnya utuh", () => {
    const input = `x := ${STR_WITH_APOSTROPHE} MARKER`;
    const expected = `x := ${" ".repeat(STR_WITH_APOSTROPHE.length)} MARKER`;
    expect(blankNonCode(input, WHERE)).toBe(expected);
  });
});

describe("blankNonCode — kasus 13: kutip tunggal di dalam komentar // bukan rune literal", () => {
  it("MARKER pada baris berikutnya tetap utuh", () => {
    const input = `${COMMENT_WITH_APOSTROPHE}\nMARKER`;
    const expected = `${" ".repeat(COMMENT_WITH_APOSTROPHE.length)}\nMARKER`;
    expect(blankNonCode(input, WHERE)).toBe(expected);
  });
});

describe("blankNonCode — kasus 9: panjang keluaran == panjang masukan, untuk KESELURUHAN kasus di atas (1-13)", () => {
  // Bukan formalitas (lihat brief): seluruh pemanggil (findMatchingParen/findMatchingBrace
  // di routes.ts, checkModuleWiring di mainWiring.ts) menghitung POSISI karakter — pergeseran
  // satu karakter pun merusak batas fungsi tanpa menghasilkan error sama sekali.
  const kasus: Array<[string, string]> = [
    ["komentar baris (kasus 1)", `foo\n${COMMENT_LINE}\nbar`],
    ["komentar blok (kasus 2)", `before ${BLOCK_COMMENT} after`],
    ["// di dalam string (kasus 3)", `x := ${STR_WITH_SLASHES} MARKER`],
    ["// di dalam raw string (kasus 4)", `x := ${RAW_WITH_SLASHES} MARKER`],
    ["escape di dalam string (kasus 5)", `x := ${STR_WITH_ESCAPED_QUOTE} MARKER`],
    ["// di dalam komentar blok (kasus 6)", `${BLOCK_WITH_SLASHES} MARKER`],
    ["/* di dalam string (kasus 7)", `x := ${STR_WITH_BLOCK_MARKERS} MARKER`],
    ["tanpa komentar/string/rune (kasus 8)", "func Register(a, b int) {\n\treturn a + b\n}\n"],
    ["rune berisi ')' (kasus 10)", `c := ${RUNE_PAREN} MARKER`],
    ["escape di dalam rune (kasus 11)", `c := ${RUNE_ESCAPED_QUOTE} MARKER`],
    ["kutip tunggal di dalam string (kasus 12)", `x := ${STR_WITH_APOSTROPHE} MARKER`],
    ["kutip tunggal di dalam komentar (kasus 13)", `${COMMENT_WITH_APOSTROPHE}\nMARKER`],
  ];

  for (const [nama, input] of kasus) {
    it(`panjang keluaran == panjang masukan — ${nama}`, () => {
      expect(blankNonCode(input, WHERE).length).toBe(input.length);
    });
  }
});

describe("blankNonCode — nomor baris tetap benar melintasi bentuk multi-baris", () => {
  // routes.ts memakai lineAt(source, idx) untuk pesan error (fitur + baris) — kalau bentuk
  // multi-baris (komentar blok, raw string) menggeser baris berikutnya, pesan error akan
  // menunjuk baris yang salah tanpa satu pun test yang gagal untuk memperingatkan.
  it("komentar blok yang membentang banyak baris tidak menggeser baris sesudahnya", () => {
    const input = "a\n/* blok\nkomentar\npanjang */\nb";
    const out = blankNonCode(input, WHERE);
    const outLines = out.split("\n");
    expect(outLines).toHaveLength(input.split("\n").length);
    expect(outLines[0]).toBe("a");
    expect(outLines[4]).toBe("b");
  });

  it("raw string yang membentang banyak baris tidak menggeser baris sesudahnya", () => {
    const input = "a\n`raw\nstring\npanjang`\nb";
    const out = blankNonCode(input, WHERE);
    const outLines = out.split("\n");
    expect(outLines).toHaveLength(input.split("\n").length);
    expect(outLines[0]).toBe("a");
    expect(outLines[4]).toBe("b");
  });
});

// Pemisah yang cuma menangani komentar MEMPERTAHANKAN isi string literal, jadi
// `metrics.Tag("laporan.Register")` di dalam daftar modul membuat fitur "laporan" salah terbaca
// "terpasang" biarpun cuma DISEBUT di dalam string. `blankNonCode` menutup ini dengan mem-blank
// isi string juga — regresi eksplisit di sini supaya perbaikannya tidak diam-diam lepas lagi.
describe("blankNonCode — isi string ikut di-blank, bukan cuma isi komentar", () => {
  it("identifier yang cuma disebut di dalam string literal tidak lagi terlihat sebagai kode", () => {
    const input = 'metrics.Tag("laporan.Register")';
    const out = blankNonCode(input, WHERE);
    expect(out).not.toContain("laporan");
    expect(out).toContain("metrics.Tag(");
  });
});

/**
 * assertModeledLexemes — SATU-SATUNYA hal yang benar-benar tak bisa dimodelkan blankNonCode
 * adalah lexeme berkutip (string, raw string, komentar blok, rune) yang TIDAK PERNAH
 * DITUTUP sampai akhir berkas — di situ tak ada cara tahu di mana ia SEHARUSNYA berakhir.
 * Draf pertama fungsi ini menolak SEMUA rune literal (bahkan yang tertutup rapi) — itu
 * gagal-nyaring yang salah sasaran, dikoreksi setelah verifikasi tim lead: rune literal
 * yang tertutup dengan benar sekarang dimodelkan (kasus 10-13 di atas), bukan ditolak.
 */
describe("assertModeledLexemes — lexeme tak tertutup (satu-satunya yang benar-benar tak dimodelkan)", () => {
  it("melempar untuk string \"...\" yang tidak pernah ditutup, menyebut where dan baris", () => {
    const src = 'x\ny := "belum ditutup sampai akhir berkas';
    expect(() => assertModeledLexemes(src, WHERE)).toThrow(new RegExp(WHERE.replace(/\//g, "\\/")));
    expect(() => assertModeledLexemes(src, WHERE)).toThrow(/baris 2/);
  });

  it("melempar untuk raw string `...` yang tidak pernah ditutup", () => {
    const src = "x\ny := `belum ditutup sampai akhir berkas";
    expect(() => assertModeledLexemes(src, WHERE)).toThrow(/raw string/);
  });

  it("melempar untuk komentar blok /* yang tidak pernah ditutup", () => {
    const src = "x\n/* belum ditutup sampai akhir berkas";
    expect(() => assertModeledLexemes(src, WHERE)).toThrow(/komentar blok/);
  });

  it("melempar untuk rune literal '...' yang tidak pernah ditutup", () => {
    const src = "x\nc := 'a";
    expect(() => assertModeledLexemes(src, WHERE)).toThrow(/rune literal/);
  });

  it("TIDAK melempar untuk kelima bentuk yang tertutup dengan benar", () => {
    const src = '// komentar\n/* blok */\nx := "string"\ny := `raw`\nc := \'a\'\n';
    expect(() => assertModeledLexemes(src, WHERE)).not.toThrow();
  });

  it("komentar baris // yang mencapai EOF tanpa baris baru TIDAK dianggap tak tertutup (EOF adalah penutup sah)", () => {
    const src = "kode\n// komentar sampai akhir berkas tanpa newline";
    expect(() => assertModeledLexemes(src, WHERE)).not.toThrow();
  });
});

describe("blankNonCode — melempar (lewat assertModeledLexemes) untuk lexeme tak tertutup, bukan diam-diam menelan sisa berkas", () => {
  it("string yang tidak pernah ditutup membuat blankNonCode melempar, bukan memotong senyap seperti stripLineComments lama", () => {
    const src = 'x := "tidak pernah ditutup';
    expect(() => blankNonCode(src, WHERE)).toThrow(new RegExp(WHERE.replace(/\//g, "\\/")));
  });
});

/**
 * `findBlockCommentStarts` ada supaya deteksi komentar blok memakai mesin leksikal yang SAMA
 * dengan `blankNonCode`, bukan lexer tangan-sendiri terpisah yang cuma sadar string `"..."` —
 * lexer semacam itu buta terhadap rune literal (menghasilkan rute hantu) dan terhadap raw string
 * (menghasilkan false-positive "komentar blok" untuk komentar yang tak pernah ada).
 */
describe("findBlockCommentStarts", () => {
  it("menemukan komentar blok sungguhan, mengembalikan indeks awalnya", () => {
    const src = "a /* blok */ b";
    expect(findBlockCommentStarts(src, WHERE)).toEqual([2]);
  });

  it("mengembalikan array kosong kalau tidak ada komentar blok sama sekali", () => {
    expect(findBlockCommentStarts('g.GET("/x", h.list) // komentar biasa', WHERE)).toEqual([]);
  });

  it("menemukan SEMUA komentar blok, bukan cuma yang pertama", () => {
    const src = "/* satu */ x /* dua */";
    expect(findBlockCommentStarts(src, WHERE)).toEqual([0, 13]);
  });

  // C2 arah 1: rune literal berisi kutip ganda ('"') mematikan deteksi komentar blok
  // sungguhan di lexer tangan-sendiri lama — inString jadi true selamanya sesudah rune ini
  // (tidak sadar rune sama sekali), jadi /* di baris berikutnya tidak pernah terdeteksi.
  it("rune literal berisi kutip ganda TIDAK mematikan deteksi komentar blok sesudahnya", () => {
    const src = "c := '\"'\n/* blok sungguhan */";
    expect(findBlockCommentStarts(src, WHERE)).toEqual([9]);
  });

  it("TIDAK menganggap '/*' di dalam rune literal sebagai komentar blok (rune cuma satu karakter, tapi tetap diuji lewat konteks di sekitarnya)", () => {
    const src = "c := '/' // bukan komentar blok, cuma rune '/' lalu komentar baris";
    expect(findBlockCommentStarts(src, WHERE)).toEqual([]);
  });

  // C2 arah 2: raw string berisi teks "/*" membuat lexer tangan-sendiri lama false-positive
  // melempar "Berkas memuat komentar blok" padahal sumbernya tidak punya komentar blok sama
  // sekali — sekelas dengan menolak rune literal yang sebenarnya bisa dimodelkan (menolak sesuatu
  // yang sebenarnya sah).
  it("TIDAK menganggap '/*' di dalam raw string sebagai komentar blok sungguhan", () => {
    const src = "doc := `contoh: /* ini bukan komentar */`";
    expect(findBlockCommentStarts(src, WHERE)).toEqual([]);
  });

  it("TIDAK menganggap '/*' di dalam string biasa sebagai komentar blok sungguhan", () => {
    const src = 'doc := "contoh: /* ini bukan komentar */"';
    expect(findBlockCommentStarts(src, WHERE)).toEqual([]);
  });

  it("TIDAK menganggap '/*' yang cuma DISEBUT di dalam komentar baris // sebagai komentar blok", () => {
    const src = "// lihat pola /* di tempat lain */ dulu\nkode()";
    expect(findBlockCommentStarts(src, WHERE)).toEqual([]);
  });

  // Pola nyata di apps/gobackend/internal/feature/media/register.go dan penduduk/register.go
  // — dijaga eksplisit oleh routes.test.ts (`assertNoUnmodeledComments` tidak boleh melempar
  // untuk keduanya). Diulang di sini di level goSource karena mesinnya sekarang sama.
  it("TIDAK menganggap wildcard Gin '/*fileUrl' di dalam string literal sebagai komentar blok", () => {
    const src = 'g.DELETE("/*fileUrl", h.deleteMedia)';
    expect(findBlockCommentStarts(src, WHERE)).toEqual([]);
  });

  it("melempar untuk komentar blok yang tidak pernah ditutup, sama seperti assertModeledLexemes", () => {
    const src = "a /* belum ditutup";
    expect(() => findBlockCommentStarts(src, WHERE)).toThrow(/komentar blok/);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────
// `blankNonCode` menjawab
// "di mana KODE-nya" — dipakai untuk POSISI (batas kurung/kurawal, di mana pemanggilan rute
// mulai). Ia TIDAK bisa dipakai untuk NILAI: literal path dan kode permission sendiri adalah
// string, jadi di `blankNonCode` mereka ikut jadi spasi.
//
// Membaca nilai dari `source` MENTAH juga salah, dan itu lubang yang sudah menggigit: baris yang
// DIKOMENTARI di dalam kurung pemanggilan ikut terbaca sebagai argumen sungguhan — guard
// permission yang dicabut tetap dilaporkan sebagai guard.
//
// `blankComments` adalah pasangan yang hilang: HANYA komentar (baris + blok) yang jadi spasi,
// string/raw string/rune tetap utuh, panjang tetap identik. Ketiga teks (`source`, hasil
// `blankNonCode`, hasil `blankComments`) karenanya selalu sejajar offset demi offset —
// POSISI dari yang satu, NILAI dari yang lain, pada offset yang SAMA.
// ─────────────────────────────────────────────────────────────────────────────────────────
describe("blankComments — komentar hilang, NILAI (isi string) tetap utuh", () => {
  it("isi komentar baris // hilang", () => {
    const input = `foo\n${COMMENT_LINE}\nbar`;
    expect(blankComments(input, WHERE)).toBe(`foo\n${" ".repeat(COMMENT_LINE.length)}\nbar`);
  });

  it("isi komentar blok /* */ hilang, baris baru di dalamnya dipertahankan", () => {
    const input = "a\n/* baris\nkedua */\nb";
    const out = blankComments(input, WHERE);
    expect(out).toBe(`a\n${" ".repeat(8)}\n${" ".repeat(8)}\nb`);
    expect(out.split("\n")).toHaveLength(4);
  });

  it("isi string BIASA tetap utuh — inilah bedanya dengan blankNonCode", () => {
    const input = 'g.GET("/role", h.list)';
    expect(blankComments(input, WHERE)).toBe(input);
    expect(blankNonCode(input, WHERE)).toBe(`g.GET(${" ".repeat(7)}, h.list)`);
  });

  it("isi raw string dan rune literal tetap utuh", () => {
    const input = "doc := `raw // string`\nc := '\"'";
    expect(blankComments(input, WHERE)).toBe(input);
  });

  it("`//` di dalam string TIDAK dianggap komentar (MARKER sesudahnya utuh)", () => {
    const input = `x := ${STR_WITH_SLASHES} MARKER`;
    expect(blankComments(input, WHERE)).toBe(input);
  });

  it("`/*` di dalam raw string TIDAK dianggap komentar blok", () => {
    const input = "doc := `contoh: /* bukan komentar */`\nMARKER";
    expect(blankComments(input, WHERE)).toBe(input);
  });

  it("panjang keluaran SELALU sama dengan masukan (offset tidak bergeser)", () => {
    const inputs = [
      `foo\n${COMMENT_LINE}\nbar`,
      `before ${BLOCK_COMMENT} after`,
      `x := ${STR_WITH_SLASHES} MARKER`,
      `x := ${RAW_WITH_SLASHES} MARKER`,
      `x := ${STR_WITH_ESCAPED_QUOTE} MARKER`,
      `${BLOCK_WITH_SLASHES} MARKER`,
      `x := ${STR_WITH_BLOCK_MARKERS} MARKER`,
      "tanpa komentar sama sekali",
    ];
    for (const input of inputs) {
      expect(blankComments(input, WHERE)).toHaveLength(input.length);
    }
  });

  it("sejajar offset demi offset dengan blankNonCode dan dengan source (invarian tiga-teks)", () => {
    const src = `
package x

func Register(public, protected *gin.RouterGroup) {
	g := protected.Group("/role") // basis
	g.GET("", // tenancy.RequirePermission(gen.PermRoleRead),
		h.listRoles)
}
`;
    const blanked = blankNonCode(src, WHERE);
    const commentBlanked = blankComments(src, WHERE);
    expect(blanked).toHaveLength(src.length);
    expect(commentBlanked).toHaveLength(src.length);
    // Di mana pun `blanked` masih menampilkan KODE (bukan spasi hasil blanking), ketiganya
    // wajib menampilkan karakter yang sama — itulah yang membuat "posisi dari yang satu,
    // nilai dari yang lain" aman.
    for (let i = 0; i < src.length; i++) {
      if (blanked[i] !== " " || src[i] === " ") {
        expect(commentBlanked[i]).toBe(src[i]);
        expect(blanked[i]).toBe(src[i]);
      }
    }
  });

  it("mewarisi gagal-nyaring yang sama (mesin walkLexemes yang sama dengan blankNonCode)", () => {
    expect(() => blankComments("a /* belum ditutup", WHERE)).toThrow(/komentar blok/);
    expect(() => blankComments('x := "belum ditutup', WHERE)).toThrow(/string/);
  });
});
