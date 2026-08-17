import { describe, expect, it } from "vitest";
import {
  checkModuleWiring,
  extractModulesSliceAndPreamble,
  findMatchingBrace,
  parseFeatureImports,
} from "./mainWiring.js";
import { blankNonCode } from "./goSource.js";
import { buatT } from "../pesan.js";
import { muatPesan } from "../../../src/messages/index.js";

const t = buatT(await muatPesan("id"));

// Modul contoh yang SENGAJA generik: berkas ini menguji pembacanya, bukan tata letak satu proyek.
const MODUL = "example.com/p/apps/api";
const FEATURE_DIR = "internal/feature";
const PENANDA = "[]server.FeatureRegistrar{";
const BERKAS = "cmd/server/main.go";
const SITIR = "[B-01]";

const imports = (src: string) => parseFeatureImports(src, FEATURE_DIR, BERKAS);
const iris = (src: string) => extractModulesSliceAndPreamble(src, PENANDA, BERKAS);
const periksa = (src: string, dirs: string[]) =>
  checkModuleWiring(src, dirs, { featureDir: FEATURE_DIR, penanda: PENANDA, namaBerkas: BERKAS }, t, SITIR);

const MAIN_GO = `
package main

import (
	"fmt"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	authfeature "${MODUL}/${FEATURE_DIR}/auth"
	"${MODUL}/${FEATURE_DIR}/notification"
	"${MODUL}/${FEATURE_DIR}/role"
	"${MODUL}/${FEATURE_DIR}/wired"
	"${MODUL}/${FEATURE_DIR}/orphan"
	"${MODUL}/internal/platform/server"
)

func main() {
	authMod := authfeature.NewModule(gdb, rdb, cfg, email.LogSender{})
	notificationMod := notification.NewModule(gdb, notification.LogPusher{})

	r := server.New(server.Deps{
		Modules: ${PENANDA}
			func(pub, prot *gin.RouterGroup, _ *gorm.DB) { authMod.Register(pub, prot, nil) },
			role.Register(rdb),
			wired.Register,
			func(pub, prot *gin.RouterGroup, _ *gorm.DB) { notificationMod.Register(pub, prot, nil) },
		},
	})
}
`;

describe("parseFeatureImports", () => {
  it("memetakan nama fitur ke identifier default (nama paket == nama direktori)", () => {
    const m = imports(MAIN_GO);
    expect(m.get("role")).toBe("role");
    expect(m.get("wired")).toBe("wired");
    expect(m.get("orphan")).toBe("orphan");
  });

  it("memetakan nama fitur ke ALIAS impor kalau ada (bukan nama direktori)", () => {
    expect(imports(MAIN_GO).get("auth")).toBe("authfeature");
  });

  it("melempar kalau blok import tidak ditemukan", () => {
    expect(() => imports("package main\n\nfunc main() {}\n")).toThrow(/import/);
  });

  it("direktori feature datang dari config: impor di bawah direktori LAIN tidak terbaca", () => {
    // Ini yang membuat pembaca ini portabel. Kalau `internal/feature` dipaku di dalam pola, proyek
    // yang menamai direktornya lain mendapat NOL impor terbaca — dan gate lalu melaporkan SETIAP
    // fitur sebagai "tidak diimpor": nyaring, spesifik, dan seluruhnya salah.
    const lain = parseFeatureImports(MAIN_GO, "internal/modul", BERKAS);
    expect(lain.size).toBe(0);
    const cocok = parseFeatureImports(
      MAIN_GO.replaceAll(`/${FEATURE_DIR}/`, "/internal/modul/"),
      "internal/modul",
      BERKAS,
    );
    expect(cocok.get("role")).toBe("role");
  });
});

describe("extractModulesSliceAndPreamble", () => {
  it("mengembalikan isi daftar modul dan teks di luarnya", () => {
    const { slice, preamble } = iris(MAIN_GO);
    expect(slice).toContain("role.Register(rdb)");
    expect(preamble).toContain('authfeature "example.com');
    expect(preamble).not.toContain("role.Register(rdb)");
  });

  it("melempar kalau penandanya tidak ditemukan — dan menyebut kunci config-nya", () => {
    // Gate yang penandanya tidak cocok TIDAK boleh lewat diam-diam: ia tidak memeriksa apa pun.
    expect(() => iris("package main\n")).toThrow(/registrarType/);
  });
});

// Sebelum ini, hanya literal PERTAMA yang dibaca. Kalau wiring dipecah jadi dua literal, modul yang
// cuma ada di literal KEDUA salah terbaca "tak terpasang" DAN modul yang hilang dari literal
// pertama tetap lolos — salah di dua arah sekaligus.
const DUA_LITERAL = MAIN_GO.replace(
  "func main() {",
  `func main() {
	early := ${PENANDA}
		role.Register(rdb),
	}
	_ = early
`,
).replace("role.Register(rdb),\n\t\t\twired.Register,", "wired.Register,");

describe("extractModulesSliceAndPreamble — DUA literal daftar modul", () => {
  it("menggabung isi KEDUA literal, bukan cuma yang pertama", () => {
    const { slice } = iris(DUA_LITERAL);
    expect(slice).toContain("role.Register(rdb)");
    expect(slice).toContain("wired.Register");
  });
});

describe("checkModuleWiring — DUA literal daftar modul", () => {
  it("modul yang cuma ada di literal KEDUA tetap terbaca terpasang", () => {
    expect(periksa(DUA_LITERAL, ["role", "wired"])).toEqual([]);
  });

  it("modul yang benar-benar tak ada di literal mana pun tetap terlapor, bukan short-circuit ke hijau", () => {
    const errors = periksa(DUA_LITERAL, ["role", "wired", "orphan"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"orphan"');
  });
});

describe("checkModuleWiring", () => {
  it("tidak melapor untuk fitur yang terpasang LANGSUNG", () => {
    expect(periksa(MAIN_GO, ["role", "wired"])).toEqual([]);
  });

  it("tidak melapor untuk fitur yang terpasang TIDAK LANGSUNG lewat variabel", () => {
    expect(periksa(MAIN_GO, ["auth", "notification"])).toEqual([]);
  });

  it("melapor — MENYITIR ID aturan — untuk berkas pendaftaran yang diimpor tapi tak terpasang", () => {
    const errors = periksa(MAIN_GO, ["orphan"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(SITIR);
    expect(errors[0]).toContain("orphan");
    expect(errors[0]).toContain("RUTE HANTU");
  });

  it("BARIS YANG DIKOMENTARI tidak dianggap terpasang", () => {
    // Ditemukan saat menyusun bukti-merah: mencabut modul lalu menyisakan barisnya sebagai
    // komentar sempat lolos sebelum pemisah komentar dipakai.
    const src = MAIN_GO.replace("wired.Register,", "// wired.Register, // dicabut sementara");
    const errors = periksa(src, ["wired"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"wired"');
  });

  it("melapor untuk fitur yang malah tidak diimpor sama sekali", () => {
    const errors = periksa(MAIN_GO, ["neverimported"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(SITIR);
    expect(errors[0]).toContain("tidak diimpor");
  });

  it("tidak salah cocok identifier terhadap pemanggilan identifier LAIN yang berakhiran sama", () => {
    // Tanpa jangkar batas-kata, `/role\./` cocok di TENGAH "adminrole.Register(...)" — paket yang
    // sama sekali berbeda, bukan bukti fitur "role" terpasang.
    const src = MAIN_GO.replace("role.Register(rdb),", "role.Register(rdb),\n\t\t\tadminrole.Register,");
    expect(periksa(src, ["role"])).toEqual([]);

    const tanpaRoleAsli = src.replace("role.Register(rdb),\n\t\t\t", "");
    const errors = periksa(tanpaRoleAsli, ["role"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"role"');
  });
});

// Nama fitur yang satu jadi AWALAN nama fitur lain ("desil" / "desilimport"). Belum terjadi di
// proyek mana pun yang diukur, jadi ini menjaga penambahan berikutnya, bukan memperbaiki bug hidup.
describe("checkModuleWiring — pencocokan nama paket berjangkar penuh", () => {
  const denganDesil = MAIN_GO.replace(
    `"${MODUL}/${FEATURE_DIR}/orphan"`,
    `"${MODUL}/${FEATURE_DIR}/orphan"\n\t"${MODUL}/${FEATURE_DIR}/desil"\n\t"${MODUL}/${FEATURE_DIR}/desilimport"`,
  );

  it("'desil' TIDAK terbaca terpasang hanya karena 'desilimport' terpasang", () => {
    const src = denganDesil.replace("wired.Register,", "wired.Register,\n\t\t\tdesilimport.Register,");
    const errors = periksa(src, ["desil"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"desil"');
    // Alasannya harus BENAR-BENAR "tak ditemukan di daftar", bukan "tak diimpor" — yang terakhir
    // akan lolos tanpa membuktikan apa pun soal batas kata.
    expect(errors[0]).toContain("RUTE HANTU");
  });

  it("'desilimport' TIDAK terbaca terpasang hanya karena 'desil' terpasang", () => {
    const src = denganDesil.replace("wired.Register,", "wired.Register,\n\t\t\tdesil.Register,");
    const errors = periksa(src, ["desilimport"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"desilimport"');
  });

  it("keduanya terbaca terpasang kalau keduanya benar-benar muncul sendiri-sendiri", () => {
    const src = denganDesil.replace(
      "wired.Register,",
      "wired.Register,\n\t\t\tdesil.Register,\n\t\t\tdesilimport.Register,",
    );
    expect(periksa(src, ["desil", "desilimport"])).toEqual([]);
  });
});

// Penanda yang cuma DISEBUT di dalam komentar. Pola nyatanya: seseorang mencabut modul dan
// menyisakan catatan. Pencarian atas teks MENTAH menganggapnya penanda sungguhan — dan itu
// mengubah gate dari MERAH keras jadi HIJAU diam-diam.
describe("penanda di dalam komentar TIDAK dianggap literal sungguhan", () => {
  const denganUmpan = MAIN_GO.replace(
    "func main() {",
    `func main() {\n\t// dulu: ${PENANDA} role.Register(rdb) }\n`,
  );

  it("irisannya membaca daftar SUNGGUHAN, bukan teks di dalam komentar", () => {
    expect(iris(denganUmpan).slice).toContain("wired.Register");
  });

  it("fitur yang benar-benar tak terpasang TETAP dilaporkan walau ada komentar berumpan", () => {
    const src = denganUmpan.replace("role.Register(rdb),\n\t\t\t", "");
    const errors = periksa(src, ["role"]);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"role"');
  });

  it("fitur yang MEMANG terpasang tidak jadi salah lapor karena komentar berumpan", () => {
    expect(periksa(denganUmpan, ["wired", "auth", "notification"])).toEqual([]);
  });
});

// Raw string yang isinya kebetulan memuat "import (" / "\n)". Pencarian atas teks mentah bisa
// mendarat di posisi yang salah — terukur: SELURUH 29 impor gagal terbaca (0 dari 29).
const UMPAN_RAW_STRING = MAIN_GO.replace(
  "package main\n\nimport (",
  'package main\n\nvar decoy = `import (\n\t"nonexistent/feature"\n)`\n\nimport (',
);

describe("parseFeatureImports — raw string berisi teks 'import (' tidak mengacaukan batas blok", () => {
  it("tetap membaca SEMUA impor sungguhan", () => {
    const m = imports(UMPAN_RAW_STRING);
    expect(m.get("role")).toBe("role");
    expect(m.get("wired")).toBe("wired");
    expect(m.get("notification")).toBe("notification");
    expect(m.get("auth")).toBe("authfeature");
  });

  it("tidak membaca jalur fiktif di dalam raw string sebagai impor sungguhan", () => {
    expect(imports(UMPAN_RAW_STRING).get("feature")).toBeUndefined();
  });
});

// Komentar `//` di EKOR baris impor — Go yang sepenuhnya sah. Membaca ISI blok dari teks mentah
// membuat baris itu tidak cocok pola akhir-baris, lalu "tidak diimpor" dilaporkan untuk berkas
// yang mengimpornya dengan benar: gagal nyaring, salah diagnosis.
describe("parseFeatureImports — komentar di ekor baris impor", () => {
  it("impor tanpa alias dengan komentar trailing tetap terbaca", () => {
    const src = MAIN_GO.replace(
      `"${MODUL}/${FEATURE_DIR}/role"`,
      `"${MODUL}/${FEATURE_DIR}/role" // dipakai perakit modul`,
    );
    expect(imports(src).get("role")).toBe("role");
  });

  it("impor BERALIAS dengan komentar trailing tetap terbaca sebagai aliasnya", () => {
    const src = MAIN_GO.replace(
      `authfeature "${MODUL}/${FEATURE_DIR}/auth"`,
      `authfeature "${MODUL}/${FEATURE_DIR}/auth" // modul, bukan registrar polos`,
    );
    expect(imports(src).get("auth")).toBe("authfeature");
  });

  it("komentar trailing tidak membuat checkModuleWiring salah lapor 'tidak diimpor'", () => {
    const src = MAIN_GO.replace(
      `"${MODUL}/${FEATURE_DIR}/role"`,
      `"${MODUL}/${FEATURE_DIR}/role" // dipakai perakit modul`,
    );
    expect(periksa(src, ["role"])).toEqual([]);
  });

  it("ARAH SEBALIKNYA: baris impor yang seluruhnya DIKOMENTARI tetap tidak terbaca sebagai impor", () => {
    const src = MAIN_GO.replace(
      `"${MODUL}/${FEATURE_DIR}/role"`,
      `// "${MODUL}/${FEATURE_DIR}/role"`,
    );
    expect(imports(src).has("role")).toBe(false);
  });
});

// Jaring kedua `blanked[openIdx] === "{"`. Tak terjangkau lewat pemanggil normal (posisinya selalu
// dihitung dari teks ber-blank), jadi diuji langsung — diekspor khusus untuk itu. Penjaga yang
// penghapusannya tidak membuat satu test pun merah bukan penjaga ([[G-06]]).
describe("findMatchingBrace — jaring kedua posisi", () => {
  it("melempar kalau openIdx menunjuk posisi yang di teks ber-blank sudah jadi spasi", () => {
    const src = `// dulu: ${PENANDA} posyandu.Register }\n`;
    const blanked = blankNonCode(src, BERKAS);
    const idxMentah = src.indexOf("{");
    expect(blanked[idxMentah]).toBe(" ");
    expect(() => findMatchingBrace(blanked, idxMentah)).toThrow(/bukan '\{'/);
  });

  it("tetap bekerja normal untuk openIdx yang benar (jaringnya bukan penolak umum)", () => {
    const blanked = blankNonCode("x := []T{ a{b}, c }", BERKAS);
    expect(findMatchingBrace(blanked, 8)).toBe(18);
  });
});
