/**
 * Uji atas pemindai portabilitas.
 *
 * # Satu jebakan yang berkas ini TIDAK BOLEH masuki
 *
 * Pemindai ini mencari nama proyek asal di SELURUH folder, dan berkas ini ada di dalam folder itu.
 * Menulis namanya utuh di sini — bahkan sebagai argumen uji — membuat pemindai menemukan dirinya
 * sendiri, dan uji "paket ini bersih" merah selamanya untuk alasan yang tidak ada hubungannya
 * dengan kebersihan paketnya. Karena itu namanya dirakit lewat penyambungan, bentuk yang sudah
 * dipakai `tooling/genmodule/main_test.go` dan `tooling/gendto/main_test.go` sejak Task 11.
 *
 * (Berkas ini juga dikecualikan dari pemindaian SUMBER ALAT — kelas 2 dan 3 — karena asersinya
 * menyebut modul dan simbol yang tidak boleh terbaca sebagai bukti. Pengecualian itu diuji di
 * bawah dengan kontrol positif, bukan diandaikan.)
 */
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { akarPaket } from "../paket.js";
import {
  BLOK_WAJIB,
  NAMA_PROYEK_ASAL,
  PENGECUALIAN,
  bacaInventarisInstall,
  periksaInventarisInstall,
  pindaiNamaAsal,
  pindaiNamaAsalRinci,
  pindaiPrasyaratModul,
  namespaceContoh,
  pindaiSimbolPlatform,
  placeholderTerpakai,
  uraiInventaris,
} from "./origin-scan.js";

const dirSementara: string[] = [];
async function tmpBaru(awalan: string): Promise<string> {
  const dir = await mkdtemp(path.join(tmpdir(), awalan));
  dirSementara.push(dir);
  return dir;
}

afterAll(async () => {
  for (const d of dirSementara) await rm(d, { recursive: true, force: true });
});

/** Menulis pohon berkas dari peta `jalur relatif -> isi`, membuat direktori induknya. */
async function pohon(peta: Record<string, string>): Promise<string> {
  const akar = await tmpBaru("eb-scan-");
  for (const [relatif, isi] of Object.entries(peta)) {
    const jalur = path.join(akar, relatif);
    await mkdir(path.dirname(jalur), { recursive: true });
    await writeFile(jalur, isi);
  }
  return akar;
}

describe("pindaiNamaAsal", () => {
  it("menemukan kemunculan dan melaporkan berkas:baris", async () => {
    const akar = await pohon({ "a.md": "baris satu\nada namaasal di sini\n" });
    const t = await pindaiNamaAsal(akar, ["namaasal"]);
    expect(t).toHaveLength(1);
    expect(t[0]!.baris).toBe(2);
    expect(t[0]!.berkas).toBe("a.md");
  });

  it("cocok tanpa peduli besar-kecil huruf", async () => {
    const akar = await pohon({ "a.md": "NamaAsal\n" });
    expect(await pindaiNamaAsal(akar, ["namaasal"])).toHaveLength(1);
  });

  /**
   * Pemindai ini pernah punya daftar berkas KEBAL — dokumen proses yang memang mencatat dari mana
   * paket ini diturunkan. Dokumennya dihapus, daftarnya dicabut, dan yang di-assert di sini adalah
   * keadaan sesudahnya: **markdown di akar tidak istimewa**. Tak ada nama berkas yang lolos.
   *
   * Nama berkas di bawah sengaja NETRAL. Memakai nama dokumen yang sudah tidak ada akan membuat uji
   * ini menyandera berkas yang tidak lagi bisa dilihat siapa pun — dan yang diuji memang bukan nama
   * berkasnya, melainkan ketiadaan pengecualian itu sendiri.
   */
  it("tidak ada nama berkas yang kebal — markdown di akar ikut dipindai", async () => {
    const akar = await pohon({
      "catatan.md": "diturunkan dari namaasal\n",
      "rencana.md": "namaasal\n",
      "README.md": "namaasal\n",
    });
    const t = await pindaiNamaAsal(akar, ["namaasal"]);
    expect(t.map((k) => k.berkas).sort()).toEqual(["README.md", "catatan.md", "rencana.md"]);
  });

  it("mengabaikan node_modules, .git, dan dist", async () => {
    const akar = await pohon({
      "node_modules/x/i.js": "namaasal\n",
      ".git/config": "namaasal\n",
      "dist/bundle.js": "namaasal\n",
    });
    expect(await pindaiNamaAsal(akar, ["namaasal"])).toEqual([]);
  });

  /**
   * Kontrol positif untuk keempat pengecualian di atas: pohon yang SAMA plus satu berkas biasa.
   *
   * Tanpa baris ini, uji-uji di atas juga lulus untuk pemindai yang tidak memindai apa pun.
   */
  it("berkas di luar pengecualian TETAP ditemukan di pohon yang sama", async () => {
    const akar = await pohon({
      "node_modules/x/i.js": "namaasal\n",
      "dist/b.js": "namaasal\n",
      "src/a.ts": "namaasal\n",
    });
    const t = await pindaiNamaAsal(akar, ["namaasal"]);
    expect(t.map((k) => k.berkas)).toEqual([path.join("src", "a.ts")]);
  });

  // Pengecualian yang tidak pernah dipakai adalah jalur di mana pemindaian tidak berjalan tanpa
  // ada yang tahu. `jejak` yang mencatatnya adalah penjaganya; tahap 6 verify yang melaporkannya.
  it("mencatat berapa kali TIAP pengecualian dipakai", async () => {
    const akar = await pohon({ "node_modules/x/i.js": "x\n", "dist/b.js": "x\n", "src/a.ts": "x\n" });
    const { jejak } = await pindaiNamaAsalRinci(akar, ["namaasal"]);
    expect(jejak["node_modules"]).toBe(1);
    expect(jejak["dist"]).toBe(1);
    expect(jejak[".git"] ?? 0).toBe(0); // tidak ada di pohon ini — pengecualian yang mati
  });

  // Ketiganya DIREKTORI, dan tak satu pun berkas. Di-assert sebagai daftar utuh supaya
  // pengecualian BERKAS yang kelak diselundupkan kembali memerahkan baris ini lebih dulu.
  it("PENGECUALIAN hanya tiga direktori — nol pengecualian berkas", () => {
    expect(PENGECUALIAN).toEqual([".git", "dist", "node_modules"]);
  });

  it("paket ini sendiri bersih dari nama proyek asal", async () => {
    expect(await pindaiNamaAsal(akarPaket(), NAMA_PROYEK_ASAL)).toEqual([]);
  });

  // Kontrol positif untuk kasus di atas: hijau di sana harus berarti "dipindai dan bersih", bukan
  // "polanya tidak pernah cocok dengan apa pun". Dokumen proses memuat namanya, jadi memindai
  // paket yang sama TANPA pengecualian dokumen proses wajib menemukan sesuatu — dan cara termurah
  // membuktikannya tanpa mengubah pemindai adalah memakai pola yang pasti ada.
  it("hijau di atas bukan karena pemindainya tidak memindai apa pun", async () => {
    const t = await pindaiNamaAsal(akarPaket(), ["engineering-baseline"]);
    expect(t.length).toBeGreaterThan(0);
  });

  it("seluruh pengecualian benar-benar terpakai atas paket ini", async () => {
    const { jejak } = await pindaiNamaAsalRinci(akarPaket(), NAMA_PROYEK_ASAL);
    for (const nama of PENGECUALIAN) expect(jejak[nama] ?? 0, nama).toBeGreaterThan(0);
  });
});

describe("pindaiPrasyaratModul", () => {
  it("menemukan jalur modul pihak ketiga di sumber alat", async () => {
    const akar = await pohon({ "tooling/x.go": 'import "github.com/pihak/ketiga"\n' });
    const hasil = await pindaiPrasyaratModul(akar);
    expect([...hasil.keys()]).toEqual(["github.com/pihak/ketiga"]);
    expect(hasil.get("github.com/pihak/ketiga")![0]!.baris).toBe(1);
  });

  /**
   * Pengecualian namespace contoh, dan alasannya yang konkret.
   *
   * `tooling/config.example.json`, `src/config/load.test.ts`, `src/doctor/index.test.ts`, dan
   * `tooling/gendto/main_test.go` memuat `example.com/p/apps/api` sebagai NILAI config —
   * `go.modulePath` proyek contoh. Pemindai yang meng-grep buta memerahkan keempatnya.
   */
  it("mengabaikan namespace contoh/uji yang dicadangkan, tapi TIDAK yang lain", async () => {
    const akar = await pohon({
      "tooling/config.example.json": '{"modulePath":"example.com/p/apps/api"}\n',
      "tooling/a_test.go": 'const m = "contoh.test/acme/servis"\n',
      "tooling/b_test.go": 'const m = "example.test/fixture/apps/api"\n',
      "tooling/nyata.go": 'import "gorm.example.org/x"\nimport "sungguhan.io/paket"\n',
    });
    expect([...(await pindaiPrasyaratModul(akar)).keys()]).toEqual(["sungguhan.io/paket"]);
  });

  /**
   * Keempat berkas yang keluhannya konkret — mereka memuat `example.com/p/apps/api` sebagai
   * `go.modulePath` proyek CONTOH, yaitu nilai config, bukan dependensi.
   *
   * Yang di-assert bukan "keempatnya tidak pernah muncul sebagai situs": `tooling/gendto/main_test.go`
   * memang MEMUAT `github.com/oapi-codegen/runtime/types` yang sungguhan, dan itu benar dilaporkan.
   * Yang di-assert adalah bahwa nilai contohnya TIDAK ikut, plus kontrol positif bahwa keempat
   * berkas itu memang memuatnya — kalau tidak, pengecualiannya lulus tanpa pernah diuji.
   */
  it("nilai config bernamespace contoh di keempat berkas itu tidak memerah", async () => {
    const hasil = await pindaiPrasyaratModul(akarPaket());
    for (const modul of hasil.keys()) expect(namespaceContoh(modul), modul).toBe(false);

    const berkas = [
      path.join("tooling", "config.example.json"),
      path.join("src", "config", "load.test.ts"),
      path.join("src", "doctor", "index.test.ts"),
      path.join("tooling", "gendto", "main_test.go"),
    ];
    for (const b of berkas) {
      const isi = await readFile(path.join(akarPaket(), b), "utf8");
      expect(isi, b).toContain("example.com/p/apps/api");
    }
  });

  /**
   * Fixture DIKECUALIKAN, golden TIDAK.
   *
   * `tooling/testdata/fixture/apps/api/go.sum` memuat 150+ modul — dependensi proyek fixture,
   * bukan asumsi paket ini. Diukur: tanpa pengecualian ini, ketiga prasyarat sungguhan terkubur di
   * bawah 180 entri kebisingan, dan daftar yang tak terbaca sama tak bergunanya dengan daftar yang
   * tak ada.
   */
  it("mengabaikan sumber fixture tapi TIDAK keluaran golden", async () => {
    const akar = await pohon({
      "tooling/testdata/fixture/apps/api/go.sum": "kebisingan.io/satu v1.0.0\n",
      "tooling/testdata/golden/apps/api/x.gen.go": 'import "keluaran.io/dua"\n',
    });
    expect([...(await pindaiPrasyaratModul(akar)).keys()]).toEqual(["keluaran.io/dua"]);
  });

  /**
   * Pemindai tidak boleh jadi buktinya sendiri.
   *
   * Komentar di `origin-scan.ts` menyebut `gin` dan `gorm` sebagai contoh. Tanpa pengecualian ini,
   * prosa itu terhitung sebagai situs yang memakukannya — dan hari generatornya berhenti
   * memakukan salah satunya, deklarasi basi di `INSTALL.md` tidak akan pernah bisa merah.
   */
  it("berkas pemindai ini sendiri tidak dihitung sebagai situs", async () => {
    const akar = await pohon({
      "src/verify/origin-scan.ts": 'const contoh = "hanyadikomentar.io/x";\n',
      "src/verify/origin-scan.test.ts": 'const contoh = "hanyadiuji.io/y";\n',
      "tooling/nyata.go": 'import "sungguhan.io/z"\n',
    });
    expect([...(await pindaiPrasyaratModul(akar)).keys()]).toEqual(["sungguhan.io/z"]);
  });

  it("paket ini memakukan tepat ketiga modul yang INSTALL.md daftarkan", async () => {
    const hasil = await pindaiPrasyaratModul(akarPaket());
    expect([...hasil.keys()].sort()).toEqual([
      "github.com/gin-gonic/gin",
      "github.com/oapi-codegen/runtime/types",
      "gorm.io/gorm",
    ]);
  });
});

describe("pindaiSimbolPlatform", () => {
  /**
   * `\t` HARFIAH sebelum simbolnya, dan itu bukan kasus buatan: `gen-wiring.ts` menulis kode Go di
   * dalam templat literal, jadi barisnya benar-benar berbunyi `\tguard.JoinPath(...)`. Regex
   * ber-`\b` gagal di sana karena `t` dan `g` sama-sama karakter kata — dan pengukuran pertama
   * task ini memang kehilangan `guard.JoinPath` dan `httpx.RegisterV2Paths` persis karena itu.
   */
  it("menemukan simbol yang didahului escape harfiah, bukan hanya batas kata", async () => {
    const akar = await pohon({
      "tooling/gen.ts": "const x = `\\tguard.JoinPath(base, p)`;\nconst y = ` httpx.Pagination`;\n",
    });
    expect([...(await pindaiSimbolPlatform(akar)).keys()].sort()).toEqual([
      "guard.JoinPath",
      "httpx.Pagination",
    ]);
  });

  it("hanya keempat paket platform, bukan pemanggilan paket lain", async () => {
    const akar = await pohon({ "tooling/gen.ts": "json.Marshal(x); guard.Allow(c, s, ok)\n" });
    expect([...(await pindaiSimbolPlatform(akar)).keys()]).toEqual(["guard.Allow"]);
  });
});

describe("uraiInventaris", () => {
  const blok = (isi: string): string => `<!-- inventaris: uji -->\n${isi}<!-- /inventaris -->\n`;

  it("membaca token ber-backtick pertama di kolom pertama", () => {
    const hasil = uraiInventaris(blok("| Modul | Untuk |\n|---|---|\n| `a.io/b` | sesuatu |\n"));
    expect(hasil.blok.get("uji")!.entri).toEqual(["a.io/b"]);
    expect(hasil.blok.get("uji")!.takDikenali).toEqual([]);
  });

  it("teks di luar blok tidak ikut terbaca", () => {
    const hasil = uraiInventaris(`prosa\n${blok("| `x` |\n")}prosa lagi\n`);
    expect(hasil.blok.get("uji")!.entri).toEqual(["x"]);
  });

  // Bagian yang tidak dikenali DILAPORKAN, bukan dibuang: baris yang salah tulis tidak ikut diadu
  // dengan hasil pemindai, jadi pemeriksaannya menciut tanpa satu pun temuan yang menandainya.
  it("melaporkan baris yang tidak dikenali alih-alih membuangnya", () => {
    const hasil = uraiInventaris(blok("| `a` | ok |\nprosa nyasar\n| b tanpa backtick | x |\n"));
    const isi = hasil.blok.get("uji")!;
    expect(isi.entri).toEqual(["a"]);
    expect(isi.takDikenali.map((b) => b.teks)).toEqual(["prosa nyasar", "| b tanpa backtick | x |"]);
  });

  it("melaporkan blok yang dibuka tapi tidak pernah ditutup", () => {
    const hasil = uraiInventaris("<!-- inventaris: uji -->\n| `a` | x |\n");
    expect(hasil.takTertutup).toEqual(["uji"]);
  });
});

describe("periksaInventarisInstall", () => {
  const INSTALL_LENGKAP = (tambahan = "", buang = ""): string =>
    [
      "<!-- inventaris: prasyarat-modul -->",
      "| Modul | Untuk |",
      "|---|---|",
      buang === "modul" ? "" : "| `sungguhan.io/z` | dipakai |",
      tambahan === "modul" ? "| `tidakadalagi.io/q` | basi |" : "",
      "<!-- /inventaris -->",
      ...["appcontext", "dtoconv", "guard", "httpx"].map(
        (p) =>
          `<!-- inventaris: platform:${p} -->\n| Simbol | Untuk |\n|---|---|\n${
            p === "guard" && buang !== "simbol" ? "| `Allow` | dipakai |\n" : ""
          }${p === "guard" && tambahan === "simbol" ? "| `SudahTidakAda` | basi |\n" : ""}<!-- /inventaris -->`,
      ),
      "<!-- inventaris: placeholder -->",
      "| Placeholder | Untuk |",
      "|---|---|",
      "<!-- /inventaris -->",
      "",
    ]
      .filter((b) => b !== "")
      .join("\n");

  const proyek = async (install: string): Promise<string> =>
    pohon({
      "INSTALL.md": install,
      "tooling/x.go": 'import "sungguhan.io/z"\n\nguard.Allow(c, spec, found)\n',
    });

  it("hijau bila tiap inventaris cocok dengan kenyataan", async () => {
    expect(await periksaInventarisInstall(await proyek(INSTALL_LENGKAP()))).toEqual([]);
  });

  it("MERAH bila sebuah modul terpaku tanpa terdaftar", async () => {
    const temuan = await periksaInventarisInstall(await proyek(INSTALL_LENGKAP("", "modul")));
    expect(temuan.map((t) => t.kunci)).toContain("verify.prasyarat_tak_terdaftar");
    expect(temuan.find((t) => t.kunci === "verify.prasyarat_tak_terdaftar")!.vars["entri"]).toBe(
      "sungguhan.io/z",
    );
  });

  it("MERAH bila sebuah modul terdaftar tapi tidak lagi terpaku", async () => {
    const temuan = await periksaInventarisInstall(await proyek(INSTALL_LENGKAP("modul")));
    expect(temuan.map((t) => t.kunci)).toContain("verify.prasyarat_basi");
  });

  it("MERAH ke DUA arah untuk simbol paket platform juga", async () => {
    const kurang = await periksaInventarisInstall(await proyek(INSTALL_LENGKAP("", "simbol")));
    expect(kurang.map((t) => t.kunci)).toContain("verify.simbol_tak_terdaftar");
    const basi = await periksaInventarisInstall(await proyek(INSTALL_LENGKAP("simbol")));
    expect(basi.map((t) => t.kunci)).toContain("verify.simbol_basi");
  });

  it("MERAH bila blok wajib hilang sama sekali", async () => {
    const temuan = await periksaInventarisInstall(await proyek("tanpa blok apa pun\n"));
    const hilang = temuan.filter((t) => t.kunci === "verify.install_blok_hilang");
    expect(hilang.map((t) => t.vars["blok"]).sort()).toEqual([...BLOK_WAJIB].sort());
  });

  it("MERAH bila INSTALL.md tidak ada", async () => {
    const akar = await pohon({ "tooling/x.go": "kosong\n" });
    expect((await periksaInventarisInstall(akar)).map((t) => t.kunci)).toEqual([
      "verify.install_hilang",
    ]);
  });

  it("meneruskan baris tak dikenali sebagai temuan, bukan membuangnya", async () => {
    const install = INSTALL_LENGKAP().replace(
      "| `sungguhan.io/z` | dipakai |",
      "| `sungguhan.io/z` | dipakai |\nprosa nyasar di dalam blok",
    );
    const temuan = await periksaInventarisInstall(await proyek(install));
    expect(temuan.map((t) => t.kunci)).toContain("verify.install_tak_dikenali");
  });
});

describe("INSTALL.md paket ini", () => {
  it("punya seluruh blok wajib, tanpa baris tak dikenali", async () => {
    const inv = await bacaInventarisInstall(akarPaket());
    expect(inv).not.toBeNull();
    expect(inv!.takTertutup).toEqual([]);
    for (const nama of BLOK_WAJIB) expect(inv!.blok.has(nama), nama).toBe(true);
    for (const [nama, isi] of inv!.blok) expect(isi.takDikenali, nama).toEqual([]);
  });

  it("mendaftarkan keenam placeholder yang template benar-benar pakai", async () => {
    const inv = await bacaInventarisInstall(akarPaket());
    expect([...(inv!.blok.get("placeholder")?.entri ?? [])].sort()).toEqual(
      [...(await placeholderTerpakai(akarPaket()))].sort(),
    );
  });

  it("nol temuan atas paket ini", async () => {
    const temuan = await periksaInventarisInstall(akarPaket());
    expect(temuan, JSON.stringify(temuan, null, 2)).toEqual([]);
  });
});
