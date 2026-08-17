/**
 * Uji atas `tooling/Makefile.template` dan ketiga template workflow CI.
 *
 * Ketiganya adalah berkas yang TIDAK PERNAH dijalankan di repo ini — mereka dijalankan di proyek
 * yang memasang paket ini, berbulan-bulan kemudian, di mesin yang tidak bisa kita lihat. Karena
 * itu sifat-sifat yang menentukan apakah mereka benar-benar menegakkan sesuatu diikat DI SINI:
 *
 *   - satu permukaan (`standard <subperintah>`), bukan pemanggilan biner yang tersebar;
 *   - dry-run tetap default, tidak ada `--apply` yang dipaku;
 *   - `go tool oapi-codegen`, bukan `go run <modul>@versi`;
 *   - tiap placeholder yang DIPAKAI juga DIDAFTARKAN di berkas yang sama, supaya pemasang tidak
 *     perlu menebak — placeholder yang tertinggal di dalam `paths:` membuat workflow-nya tidak
 *     pernah terpicu, dan workflow yang tidak pernah terpicu terlihat persis seperti yang hijau;
 *   - YAML-nya sah, karena satu-satunya cara lain mengetahuinya adalah mendorongnya ke CI orang.
 */
import { execFile } from "node:child_process";
import { copyFileSync, mkdtempSync, rmSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { parse } from "yaml";
import { akarPaket } from "./paket.js";
import { bacaInventarisInstall } from "./verify/origin-scan.js";

const TEMPLATE_CI = ["contract-gate", "backend-gate", "frontend-gate"] as const;

/**
 * Himpunan placeholder yang BOLEH dipakai. Ia berhingga dengan sengaja: `INSTALL.md` mendaftarkan
 * satu per satu, dan placeholder yang lahir tanpa masuk daftar itu adalah placeholder yang tak
 * seorang pun tahu harus diisi.
 *
 * Daftar ini dan daftar di `INSTALL.md` wajib SAMA, dan uji terakhir di berkas ini yang mengadu
 * keduanya — dua daftar tangan yang harus cocok tanpa apa pun yang mengikatnya sudah dua kali jadi
 * cacat di paket ini.
 */
const PLACEHOLDER_SAH = new Set([
  "NODE_VERSION",
  "PNPM_VERSION",
  "GO_VERSION",
  "CONTRACT_DIR",
  "BACKEND_DIR",
  "FRONTEND_DIR",
]);

const POLA_PLACEHOLDER = /\{\{([A-Z_]+)\}\}/g;

const bacaTemplate = (nama: string): Promise<string> =>
  readFile(path.join(akarPaket(), "ci", `${nama}.yml.template`), "utf8");

const bacaMakefile = (): Promise<string> =>
  readFile(path.join(akarPaket(), "tooling", "Makefile.template"), "utf8");

const placeholder = (teks: string): string[] => [
  ...new Set([...teks.matchAll(POLA_PLACEHOLDER)].map((m) => m[1]!)),
];

/**
 * Baris RESEP Makefile yang benar-benar menjalankan sesuatu: diawali TAB, bukan komentar, dan
 * bukan `@echo` (bantuan `make help` menyebut `APPLY=--apply` dan bentuk `go run <modul>@versi`
 * justru karena ia menjelaskan keduanya).
 */
const barisPerintah = (isi: string): string[] =>
  isi
    .split("\n")
    .filter((b) => b.startsWith("\t"))
    .map((b) => b.trim())
    .filter((b) => b !== "" && !b.startsWith("#") && !b.startsWith("@echo"));

describe("Makefile.template", () => {
  it("tiap target generasi memanggil $(STANDARD), bukan biner alat langsung", async () => {
    const isi = await bacaMakefile();
    for (const sub of ["gen common", "gen wiring", "gen dto", "gen module", "freeze --pkg", "gate"]) {
      expect(isi, sub).toContain(`$(STANDARD) ${sub}`);
    }
    // Pemanggilan langsung alat paket ini — bentuk yang justru dihapus oleh keberadaan `standard`.
    expect(isi).not.toMatch(/go run \.\/gen(module|dto)/);
    expect(isi).not.toMatch(/tsx .*contract-scripts/);
  });

  // `go run <modul>@versi` mengambil apa pun yang kebetulan tersedia; keluaran generate lalu
  // berbeda antar mesin, dan yang gagal berikutnya adalah gate diff-kosong — merah karena alasan
  // yang sepenuhnya salah.
  it("memakai `go tool oapi-codegen` dan MENJELASKAN kenapa bukan `go run <modul>@versi`", async () => {
    const isi = await bacaMakefile();
    expect(isi).toContain("go tool oapi-codegen");
    // Dicari di baris PERINTAH saja: bentuk terlarangnya justru DIKUTIP di komentar penjelasnya,
    // dan pemeriksaan yang tidak membedakan keduanya akan memerahkan justru penjelasan yang
    // diminta ada.
    for (const b of barisPerintah(isi)) expect(b, b).not.toMatch(/go run\s+\S+@/);
    expect(isi).toMatch(/go run <modul>@versi/); // alasannya, bukan cuma perintahnya
    expect(isi).toContain("go.mod");
  });

  /**
   * `gen-go` adalah satu-satunya target yang memanggil biner langsung, dan dua baris yang membuat
   * pemanggilan itu benar-benar MENGHASILKAN sesuatu sempat hilang dari template ini:
   *
   *   - tanpa `-o`, oapi-codegen memancarkan berkasnya ke STDOUT. Resepnya keluar 0, nol berkas
   *     berubah, dan `make gen-go` terbaca sebagai langkah yang menghasilkan kode padahal ia cuma
   *     mencetak — lalu `gen wiring`/`gen module`/`gen dto`, yang KETIGANYA membaca paket
   *     generated, bekerja atas paket yang lama tanpa satu pun sinyal;
   *   - tanpa `go build ./internal/gen/...`, generasi yang tertulis tapi tidak bisa dikompilasi
   *     (mis. dua deklarasi untuk nama yang sama — lihat `exclude-schemas`) baru berbunyi saat ada
   *     yang kebetulan membangun backend.
   *
   * Keduanya diikat di sini karena template ini TIDAK PERNAH dijalankan penuh di repo ini: fixture
   * paket ini bukan modul Go yang bisa dikompilasi (`internal/platform/*` sengaja tidak ada), jadi
   * tak ada lari yang akan menangkap hilangnya baris-baris itu lagi.
   */
  it("gen-go menulis ke berkas (-o) dan mengompilasi hasilnya sesudahnya", async () => {
    const isi = await bacaMakefile();
    const perintah = barisPerintah(isi);
    const generate = perintah.find((b) => b.includes("go tool oapi-codegen"));
    expect(generate, "tidak ada baris perintah yang memanggil go tool oapi-codegen").toBeDefined();
    expect(generate).toMatch(/\s-o\s/);
    expect(perintah.some((b) => /go build \.\/internal\/gen\/\.\.\./.test(b))).toBe(true);
    // Jalur keluarannya lewat variabel yang bisa di-override, sama seperti BACKEND_DIR/OAPI_CONFIG:
    // konvensi letak berkas generated berbeda antar proyek, dan yang tidak boleh berbeda adalah
    // bahwa ada berkas yang ditulis sama sekali.
    expect(isi).toContain("OAPI_OUT ?=");
  });

  /**
   * Dry-run tetap default, dan pengecualiannya TEPAT SATU dan bernama.
   *
   * `gen-go` memanggil `oapi-codegen`, yang tidak punya dry-run: ia MENULIS dengan atau tanpa
   * APPLY. Prasyarat kerasnya karena itu harus ikut menulis — versi sebelumnya memakai `gen-common`
   * apa adanya, jadi `make gen-go TAG=x` tanpa APPLY menjalankan prasyaratnya DRY-RUN (nol berkas
   * ditulis) lalu tetap memancarkan paket tag-nya. Prasyarat KERAS yang dilewati, dan dilewatinya
   * senyap karena perintahnya berhasil — tepat saat pemasangan, saat pemakainya nol konteks.
   *
   * Diikat sebagai "tepat satu, dan ia yang ini", bukan sebagai "tidak ada": daftar pengecualian
   * yang bisa tumbuh diam-diam adalah pengecualian tanpa penjaga.
   */
  it("dry-run tetap default; --apply yang dipaku hanya di prasyarat gen-go", async () => {
    const isi = await bacaMakefile();
    const dipaku = barisPerintah(isi).filter((b) => b.includes("--apply"));
    expect(dipaku).toEqual(["$(STANDARD) gen common --apply"]);
    expect(isi).toContain("APPLY ?=");
    // Baris bantuan BOLEH menyebut --apply — ia justru yang memberitahu cara menyalakannya.
    expect(isi).toContain("APPLY=--apply");
    // Kepala berkas dan bantuannya wajib MENYATAKAN pengecualiannya, bukan membiarkan klaim
    // kategoris "dry-run adalah default" berdiri sendirian di atas resep yang menulis.
    expect(isi).toContain("DENGAN SATU PENGECUALIAN YANG DINAMAI");
    expect(isi).toMatch(/KECUALI gen-go/);
  });

  it("TAG, PKG, dan FEATURE divalidasi dengan contoh pemakaian yang bisa disalin", async () => {
    const isi = await bacaMakefile();
    expect(isi).toMatch(/\$\(call wajib,TAG,make gen-module TAG=|\$\(call wajib,TAG,gen-module TAG=/);
    expect(isi).toContain("$(call wajib,PKG,");
    expect(isi).toContain("FEATURE=");
    // Pesannya menyebut cara menjalankannya, bukan cuma nama variabelnya.
    expect(isi).toMatch(/contoh: make/);
  });

  it("hanya memakai placeholder yang terdaftar", async () => {
    for (const p of placeholder(await bacaMakefile())) expect(PLACEHOLDER_SAH.has(p), p).toBe(true);
  });
});

/**
 * Menjalankan `make` sungguhan atas templatenya.
 *
 * Asersi teks di atas tidak bisa membuktikan dua hal yang paling menentukan: bahwa berkasnya
 * MAKEFILE YANG SAH, dan bahwa penjaga `$(call wajib,...)` benar-benar menghentikan lari yang
 * variabelnya kosong. Keduanya cuma bisa dibuktikan dengan menjalankannya.
 *
 * Kalau `make` tidak ada di mesin ini, uji ini GAGAL — bukan dilewati. Melewatinya akan membuat
 * template Makefile terkirim tanpa pernah sekali pun diurai, dan "tidak diperiksa" akan terlihat
 * persis seperti "lulus".
 */
describe("Makefile.template dijalankan", () => {
  const dir = mkdtempSync(path.join(tmpdir(), "eb-make-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));
  const shim = path.join(akarPaket(), "bin", "standard");
  copyFileSync(path.join(akarPaket(), "tooling", "Makefile.template"), path.join(dir, "Makefile"));

  const make = async (argv: string[]): Promise<{ kode: number; keluaran: string }> => {
    try {
      const { stdout, stderr } = await promisify(execFile)("make", [...argv, `STANDARD=${shim}`], {
        cwd: dir,
      });
      return { kode: 0, keluaran: stdout + stderr };
    } catch (e) {
      const err = e as { code?: number; stdout?: string; stderr?: string; message?: string };
      return { kode: err.code ?? -1, keluaran: (err.stdout ?? "") + (err.stderr ?? "") + (err.message ?? "") };
    }
  };

  it("`make -n gen-module` merakit perintah standard, tanpa --apply", async () => {
    const { kode, keluaran } = await make(["-n", "gen-module", "TAG=buku-tamu", "PKG=bukutamu"]);
    expect(kode, keluaran).toBe(0);
    expect(keluaran).toContain("standard gen module --tag buku-tamu --pkg bukutamu");
    expect(keluaran).not.toContain("--apply");
  });

  it("APPLY=--apply sampai ke perintahnya", async () => {
    const { keluaran } = await make(["-n", "gen-module", "TAG=t", "PKG=p", "APPLY=--apply"]);
    expect(keluaran).toContain("--apply");
  });

  it("TAG kosong menghentikan lari, dengan contoh pemakaian", async () => {
    const { kode, keluaran } = await make(["gen-module", "PKG=p"]);
    expect(kode).not.toBe(0);
    expect(keluaran).toContain("TAG wajib diisi");
    expect(keluaran).toContain("make gen-module TAG=");
  });

  it("PKG kosong menghentikan lari", async () => {
    const { kode, keluaran } = await make(["freeze-module"]);
    expect(kode).not.toBe(0);
    expect(keluaran).toContain("PKG wajib diisi");
  });

  it("gate-backend memilih lapisnya", async () => {
    const { keluaran } = await make(["-n", "gate-backend"]);
    expect(keluaran).toContain("standard gate --lapis backend");
  });

  /**
   * Prasyarat `gen-go` benar-benar MENULIS, dibuktikan dengan menjalankan `make`, bukan dengan
   * membaca templatenya.
   *
   * Asersi teks tidak bisa membuktikan prasyarat mana yang dipilih `make` — itu keputusan grafik
   * dependensi, dan grafiknya cuma bisa dibaca `make` sendiri.
   */
  it("`make -n gen-go` menjalankan prasyarat gen-common yang MENULIS, tanpa APPLY sekalipun", async () => {
    const { kode, keluaran } = await make(["-n", "gen-go", "TAG=t"]);
    expect(kode, keluaran).toBe(0);
    expect(keluaran).toContain("gen common --apply");
    expect(keluaran).toContain("go tool oapi-codegen");
  });

  // Arah kedua: `gen-common` yang dipanggil SENDIRI tidak boleh ikut berubah jadi selalu-menulis.
  it("`make -n gen-common` sendiri tetap dry-run", async () => {
    const { keluaran } = await make(["-n", "gen-common"]);
    expect(keluaran).toContain("gen common");
    expect(keluaran).not.toContain("gen common --apply");
  });
});

describe("template workflow CI", () => {
  it("YAML-nya sah — placeholder dan semuanya", async () => {
    for (const nama of TEMPLATE_CI) {
      expect(() => parse(bacaTemplateSinkron(nama)), nama).not.toThrow();
    }
  });

  it("dipicu pull_request dengan paths yang menargetkan lapisnya", async () => {
    for (const nama of TEMPLATE_CI) {
      const doc = parse(await bacaTemplate(nama)) as { on?: { pull_request?: { paths?: string[] } } };
      const paths = doc.on?.pull_request?.paths;
      expect(paths, nama).toBeInstanceOf(Array);
      // `.github/workflows/**` ikut supaya PR PEMASANGANNYA sendiri memicu workflow ini — di
      // situlah placeholder yang belum diisi ketahuan, bukan berbulan-bulan kemudian.
      expect(paths, nama).toContain(".github/workflows/**");
    }
  });

  it("langkah pertama memindai placeholder yang belum diisi di SELURUH berkas workflow", async () => {
    for (const nama of TEMPLATE_CI) {
      const isi = await bacaTemplate(nama);
      expect(isi, nama).toContain(".github/workflows/");
      expect(isi, nama).toMatch(/grep -rEn/);
      expect(isi, nama).toContain("exit 1");
    }
  });

  it("menjalankan `standard doctor` sebelum gate lapisnya", async () => {
    for (const nama of TEMPLATE_CI) {
      const isi = await bacaTemplate(nama);
      expect(isi, nama).toContain("standard doctor");
    }
  });

  it("memanggil subperintah standard, bukan skrip/biner alat langsung", async () => {
    for (const nama of TEMPLATE_CI) {
      const isi = await bacaTemplate(nama);
      expect(isi, nama).not.toMatch(/go run \.\/gen(module|dto)/);
      expect(isi, nama).not.toMatch(/tsx .*contract-scripts/);
    }
  });

  it("tiap placeholder yang DIPAKAI juga DIDAFTARKAN di kepala berkasnya", async () => {
    for (const nama of TEMPLATE_CI) {
      const isi = await bacaTemplate(nama);
      const potong = isi.indexOf("\nname:");
      expect(potong, nama).toBeGreaterThan(0);
      const kepala = isi.slice(0, potong);
      const badan = isi.slice(potong);
      for (const p of placeholder(badan)) {
        expect(kepala.includes(`{{${p}}}`), `${nama}: {{${p}}} dipakai tapi tidak didaftarkan`).toBe(true);
        expect(PLACEHOLDER_SAH.has(p), `${nama}: {{${p}}}`).toBe(true);
      }
    }
  });

  // Enam, bukan tiga: `paths:` memakai CONTRACT_DIR/BACKEND_DIR/FRONTEND_DIR selain ketiga versi
  // toolchain, dan justru ketiga yang di `paths:` itu yang salah isinya membuat workflow tidak
  // pernah terpicu.
  it("daftar placeholder di INSTALL.md sama persis dengan yang diizinkan di sini", async () => {
    const inv = await bacaInventarisInstall(akarPaket());
    expect(inv, "INSTALL.md tidak terbaca").not.toBeNull();
    const diinstall = inv!.blok.get("placeholder")?.entri ?? [];
    expect([...diinstall].sort()).toEqual([...PLACEHOLDER_SAH].sort());
    expect(diinstall).toHaveLength(6);
  });

  it("ketiga placeholder versi benar-benar dipakai di suatu tempat", async () => {
    const semua = new Set<string>();
    for (const nama of TEMPLATE_CI) for (const p of placeholder(await bacaTemplate(nama))) semua.add(p);
    for (const wajib of ["NODE_VERSION", "PNPM_VERSION", "GO_VERSION"]) {
      expect(semua.has(wajib), wajib).toBe(true);
    }
  });

  // Kolom penegak [[C-05]] menyebut `gate:contract-lint`. Prosedur [[G-01]] — grep sumber gate
  // untuk ID aturannya — harus memulangkan hasil dari KEDUA ujung: langkah CI-nya di sini, dan
  // pemeriksanya di `tooling/contract-scripts/check-contract-lint.ts`.
  it("workflow kontrak memasang langkah gate:contract-lint dan menyitir C-05", async () => {
    const isi = await bacaTemplate("contract-gate");
    expect(isi).toContain("gate:contract-lint");
    expect(isi).toContain("C-05");
    expect(isi).toContain("standard gate --lapis contract");
  });

  /**
   * Bundel yang BASI adalah kelas yang workflow ini sempat sebut lalu tidak jaga: blok `env`-nya
   * menjelaskan bahwa gate membaca berkas bundel dan bundel basi berarti gate memeriksa kontrak
   * kemarin — lalu ia menjalankan perintah bundelnya tanpa menuntut diff apa pun. Yang hijau di CI
   * adalah bundel yang baru ditulis di runner; yang dibaca `gen wiring`/`gen dto` di mesin orang
   * adalah bundel ter-commit.
   *
   * Diikat berpasangan (perintah bundel DAN diffnya di langkah yang sama), bukan cuma "berkasnya
   * memuat git diff --exit-code" — lapis frontend dan backend punya baris itu juga, jadi asersi
   * yang tidak melihat pasangannya akan tetap hijau kalau baris bundelnya kelak dipindah.
   */
  it("workflow kontrak menuntut diff KOSONG sesudah membangun bundel", async () => {
    const isi = await bacaTemplate("contract-gate");
    const doc = parse(isi) as { jobs?: Record<string, { steps?: { run?: string }[] }> };
    const langkah = Object.values(doc.jobs ?? {}).flatMap((j) => j.steps ?? []);
    const bundel = langkah.filter((l) => (l.run ?? "").includes("$PERINTAH_BUNDLE"));
    expect(bundel.length, "tidak ada langkah yang menjalankan $PERINTAH_BUNDLE").toBe(1);
    expect(bundel[0]!.run).toContain("git diff --exit-code");
  });

  it("workflow backend memasang gate:generated-sync (menyitir B-03) dan gate lapis backend", async () => {
    const isi = await bacaTemplate("backend-gate");
    expect(isi).toContain("gate:generated-sync");
    expect(isi).toContain("B-03");
    expect(isi).toContain("git diff --exit-code");
    expect(isi).toContain("standard gate --lapis backend");
  });

  // Langkah yang daftar tag-nya kosong akan meregenerasi NOL berkas lalu melapor diff kosong.
  // Itu hijau yang berarti "tidak ada yang diperiksa".
  it("workflow backend menolak daftar tag kosong alih-alih melapor hijau", async () => {
    const isi = await bacaTemplate("backend-gate");
    expect(isi).toMatch(/if \[ -z "\$TAGS" \]/);
  });

  // Lapis frontend belum punya langkah `standard gate`; memanggilnya akan keluar 2. Yang tidak
  // boleh terjadi adalah workflow ini MENGAKU menjalankannya.
  it("workflow frontend tidak mengaku menjalankan `standard gate` untuk lapis yang tak ada", async () => {
    const isi = await bacaTemplate("frontend-gate");
    expect(isi).not.toMatch(/^\s*run:\s*standard gate/m);
    expect(isi).toContain("--lapis frontend");
    expect(isi).toContain("keluar 2");
  });
});

// `parse` dipakai di dalam `expect(() => ...)`, yang tidak boleh async — jadi isinya dibaca sekali
// di muka.
const isiTemplate = new Map<string, string>();
for (const nama of TEMPLATE_CI) {
  isiTemplate.set(nama, await bacaTemplate(nama));
}
function bacaTemplateSinkron(nama: string): string {
  return isiTemplate.get(nama)!;
}
