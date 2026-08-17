import { execFileSync } from "node:child_process";
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { loadConfig } from "../config/load.js";
import { jalankanDoctor } from "../doctor/index.js";

const FIXTURE = path.resolve("tooling/testdata/fixture");
const AKAR_PAKET = path.resolve(".");
const STANDARD_BIN = path.join(AKAR_PAKET, "bin/standard");

/** Jalankan satu perintah, kembalikan status+keluaran TANPA melempar pada kode keluar nonzero —
 * assertion di kasus uji yang membaca status itu sendiri, bukan try/catch di sekeliling `it()`. */
function jalankan(argv: string[], cwd: string): { status: number; output: string } {
  try {
    const output = execFileSync(argv[0]!, argv.slice(1), { cwd, encoding: "utf8", stdio: "pipe" });
    return { status: 0, output };
  } catch (e) {
    const err = e as { status: number | null; stdout?: string; stderr?: string };
    return { status: err.status ?? 1, output: `${err.stdout ?? ""}${err.stderr ?? ""}` };
  }
}

describe("proyek fixture", () => {
  it("punya config yang lolos skema", async () => {
    const { config, akar } = await loadConfig(FIXTURE);
    expect(akar).toBe(FIXTURE);
    expect(config.language).toBe("id");
  });

  it("namespace UUID sudah diisi, bukan nilai contoh", async () => {
    const { config } = await loadConfig(FIXTURE);
    expect(config.idempotency.uuidNamespace).not.toBe("REPLACE-ME");
  });

  it("doctor hijau di fixture", async () => {
    const { config, akar } = await loadConfig(FIXTURE);
    const h = await jalankanDoctor(config, akar);
    expect(h.temuan).toEqual([]);
  });

  // `standard gate` melatih SELURUH tujuh gate paket ini — bukan cuma doctor. Sebelum kasus ini
  // ada, empat dari tujuh (envelope, permissions, tenancy-checklist, routes) tidur atau buta di
  // fixture: hijau karena tak pernah memeriksa apa pun, bukan karena kontraknya benar. Kasus ini
  // menjadi PENJAGA — perubahan berikutnya ke fixture yang membuat satu gate tidur lagi (mis.
  // mengosongkan envelope-opt-in.json) akan merah di sini, bukan lolos diam-diam sampai Task 14
  // kebetulan menjalankan `standard gate` dan menemukannya sendiri.
  it(
    "standard gate atas fixture keluar 0 — ketujuh gate benar-benar berjalan",
    () => {
      const hasil = jalankan([STANDARD_BIN, "gate"], FIXTURE);
      expect(hasil.status, hasil.output).toBe(0);
      for (const nama of [
        "envelope",
        "permissions",
        "public-allowlist",
        "request-body",
        "contract-lint",
        "routes",
        "tenancy-checklist",
      ]) {
        expect(hasil.output, hasil.output).toContain(nama);
      }
    },
    // `standard gate` menjalankan TUJUH langkah berurutan, masing-masing membangun/menjalankan
    // `tsx` sebagai subproses baru — bawaan vitest 5 detik cukup di isolasi tapi TERLAMPAUI di
    // bawah beban `pnpm test` penuh (32 berkas uji lain berebut CPU yang sama). Diukur: timeout
    // di suite penuh, lulus (~5-7 detik) saat berkas ini dijalankan sendirian. Ini bukan
    // sabotase gate yang disamarkan jadi timeout — statusnya 0 begitu diberi waktu cukup.
    60_000,
  );

  // gate:tenancy-checklist (T-07) hanya MENYALA untuk modul BEKU (handWired/campuran) — fixture
  // ter-commit sengaja TIDAK beku (Task 14 perlu meregenerasi modulnya dari nol untuk
  // dibandingkan dengan golden; modul beku menolak regenerasi tanpa --force). Jadi membuktikan
  // gate ini bisa merah butuh keadaan yang fixture ter-commit tidak boleh punya.
  //
  // Dua pilihan yang mungkin: (a) fixture KEDUA yang permanen dalam keadaan beku, atau (b)
  // bekukan SALINAN sementara di dalam uji ini. Dipilih (b): fixture kedua adalah proyek KEDUA
  // yang harus dipelihara selamanya — persis pola "fixture berkembang biak" yang dihindari sejak
  // Task 13 dimulai — sedangkan (b) memakai `-freeze` SUNGGUHAN (alat yang sama yang dipakai
  // proyek nyata) atas salinan tmpdir yang dibersihkan `afterAll`, dan tidak menambah satu
  // berkas pun ke git.
  let dirTenancy: string | undefined;
  afterAll(() => {
    if (dirTenancy) rmSync(dirTenancy, { recursive: true, force: true });
  });

  it("gate:tenancy-checklist menangkap modul beku yang masih membawa daftar periksa (T-07)", () => {
    dirTenancy = mkdtempSync(path.join(tmpdir(), "standard-fixture-tenancy-"));
    cpSync(FIXTURE, dirTenancy, { recursive: true });

    execFileSync(
      "go",
      ["run", "./genmodule", "-config", dirTenancy, "-pkg", "contoh", "-freeze", "-apply"],
      { cwd: path.join(AKAR_PAKET, "tooling"), stdio: "pipe" },
    );

    // Sesudah freeze, pesan alatnya sendiri menyuruh memindahkan klaim ledger dari
    // "tergenerate" ke "handWired" — persis yang dilakukan manusia di proyek nyata.
    const jalurLedger = path.join(dirTenancy, "packages/contract/mounted-modules.json");
    const ledger = JSON.parse(readFileSync(jalurLedger, "utf8")) as Record<string, unknown>;
    ledger.tergenerate = {};
    ledger.handWired = { contoh: "contoh" };
    writeFileSync(jalurLedger, JSON.stringify(ledger, null, 2));

    const jalurChecklist = path.join(
      dirTenancy,
      "apps/api/internal/feature/contoh/repository_tenancy_test.contoh.md",
    );

    // `-freeze` TIDAK menghapus checklist-nya (itu bukan tanggung jawabnya) — jadi keadaan
    // "beku + checklist masih ada" adalah keadaan NYATA yang alat sungguhan hasilkan, bukan
    // sabotase yang dikarang. Gate ini ada justru untuk menangkap keadaan itu.
    const merah = jalankan([STANDARD_BIN, "gate", "--only", "tenancy-checklist"], dirTenancy);
    expect(merah.status, merah.output).not.toBe(0);
    expect(merah.output).toContain("T-07");
    expect(merah.output).toContain("repository_tenancy_test.contoh.md");

    // Checklist "dikonsumsi" (disalin jadi uji sungguhan lalu dihapus, persis teks berkasnya
    // sendiri) -> gate kembali hijau.
    rmSync(jalurChecklist);
    const hijau = jalankan([STANDARD_BIN, "gate", "--only", "tenancy-checklist"], dirTenancy);
    expect(hijau.status, hijau.output).toBe(0);
    // Timeout diperpanjang seperti kasus "standard gate ... keluar 0" — kasus ini menjalankan
    // `go run ./genmodule -freeze` (kompilasi alat Go dari nol) DITAMBAH dua pemanggilan
    // `standard gate`, tiap panggilan men-spawn `tsx` subproses sendiri.
  }, 60_000);

  // Bundel kontrak (packages/contract/dist/openapi.bundled.yaml) adalah artefak GENERATED yang
  // IKUT DI-COMMIT — beda dari paket generated di bawah (yang MASUKAN dan dijaga provenansnya),
  // bundel ini BOLEH basi dan justru HARUS tertangkap kalau basi (gate:generated-sync, lihat
  // `skills/tambah-endpoint/SKILL.md`: proyek target meng-commit bundelnya dan menuntut diff
  // kosong terhadap regenerasi). Kasus ini menutup jarak itu di dalam suite paket ini sendiri,
  // supaya kebasian bundel fixture tertangkap di sini — bukan menunggu Task 14 menemukannya
  // (atau, lebih buruk, tidak pernah menemukannya karena Task 14 tidak kebetulan melihat bundel).
  //
  // `redocly` dipanggil lewat `pnpm exec`, BUKAN `npx` — temuan yang mengoreksi bentuk awal
  // berkas ini: `npx @redocly/cli@<versi>` bergantung pada cache `~/.npm/_npx` milik mesin yang
  // kebetulan menjalankannya, ENOTCACHED di mesin mana pun yang cache-nya bersih. Itu `go run
  // <modul>@versi` dalam pakaian npm — persis yang [[batasan global]] paket ini larang untuk
  // Go. `@redocly/cli` sekarang devDependency TERPAKU (`package.json` + `pnpm-lock.yaml`),
  // dijalankan dari binari yang `pnpm install` PASANG — bukan diunduh/di-resolve saat uji jalan.
  let dirSementaraBundle: string | undefined;
  afterAll(() => {
    if (dirSementaraBundle) rmSync(dirSementaraBundle, { recursive: true, force: true });
  });

  it("bundel kontrak ter-commit cocok dengan sumbernya (diff kosong terhadap regenerasi)", async () => {
    dirSementaraBundle = mkdtempSync(path.join(tmpdir(), "standard-fixture-bundle-"));
    const bundelBaru = path.join(dirSementaraBundle, "openapi.bundled.yaml");
    execFileSync(
      path.join(AKAR_PAKET, "node_modules/.bin/redocly"),
      ["bundle", "openapi/openapi.yaml", "-o", bundelBaru],
      { cwd: path.join(FIXTURE, "packages/contract"), stdio: "pipe" },
    );
    const isiBaru = await readFile(bundelBaru, "utf8");
    const isiTerCommit = await readFile(
      path.join(FIXTURE, "packages/contract/dist/openapi.bundled.yaml"),
      "utf8",
    );
    expect(isiBaru).toBe(isiTerCommit);
  }, 30_000);

  // Paket generated di fixture (apps/api/internal/gen/contoh/contoh.gen.go) adalah MASUKAN
  // fixture ini, bukan keluaran yang diuji terhadap golden (itu milik Task 14): ia dibangkitkan
  // oleh `go tool oapi-codegen` sungguhan atas kontrak fixture ini sendiri, lalu di-commit —
  // persis seperti bundel kontrak dan lockfile `go.sum` di sisinya, bukan sesuatu yang ditulis
  // tangan.
  //
  // Penjaga ini SEBELUMNYA membaca satu BARIS (penanda `// Code generated ... DO NOT EDIT.`,
  // plus syarat menyebut "oapi-codegen"). Itu terbukti tembus: menyalin header ASLI apa adanya
  // lalu menulis BADANNYA dengan tangan tetap lolos kedua syarat itu — penjaga itu membuktikan
  // provenans BARIS, bukan provenans BERKAS. Diganti di sini dengan pola yang berkas ini SUDAH
  // pakai untuk bundel: REGENERASI SUNGGUHAN, lalu tuntut identik byte-demi-byte. `GOPROXY=off
  // GOSUMDB=off` membuktikan ini tidak pernah butuh jaringan — modul `oapi-codegen` v2.8.0 sudah
  // ada di `GOMODCACHE` lokal lewat direktif `tool` di `apps/api/go.mod` fixture.
  let dirOapiCodegen: string | undefined;
  afterAll(() => {
    if (dirOapiCodegen) rmSync(dirOapiCodegen, { recursive: true, force: true });
  });

  it("paket generated di fixture cocok dengan regenerasi oapi-codegen sungguhan (bukan pengganti tulisan tangan)", async () => {
    dirOapiCodegen = mkdtempSync(path.join(tmpdir(), "standard-fixture-oapi-"));
    const keluaran = path.join(dirOapiCodegen, "contoh.gen.go");
    execFileSync(
      "go",
      [
        "tool",
        "oapi-codegen",
        "-config",
        "../../packages/contract/codegen/contoh.yaml",
        "-o",
        keluaran,
        "../../packages/contract/dist/openapi.bundled.yaml",
      ],
      {
        cwd: path.join(FIXTURE, "apps/api"),
        env: { ...process.env, GOPROXY: "off", GOSUMDB: "off" },
        stdio: "pipe",
      },
    );
    const isiBaru = await readFile(keluaran, "utf8");
    const isiTerCommit = await readFile(
      path.join(FIXTURE, "apps/api/internal/gen/contoh/contoh.gen.go"),
      "utf8",
    );
    expect(isiBaru).toBe(isiTerCommit);
  }, 30_000);

  // Kasus terakhir dengan sengaja, bukan letak sembarang: seluruh kasus DI ATASNYA di berkas ini
  // hanya membaca fixture ATAU menulis ke tmpdir (dibersihkan `afterAll`) — nol tulis ke
  // `tooling/testdata/fixture` itu sendiri. Kasus ini menutup pintu itu supaya tetap begitu
  // SELAMANYA — uji berikutnya yang ditambah ke berkas ini dan ternyata menulis ke fixture akan
  // MERAH di sini, bukan lolos diam-diam sampai seseorang kebetulan menjalankan `git status`
  // sesudahnya dan bingung ada kerja "belum selesai" yang sebenarnya cuma residu lari uji.
  // `tooling/testdata/fixture` MILIK berkas uji ini — tidak ada penulis lain yang sah — jadi
  // baris apa pun di sini bukan ambiguitas, ia pelanggaran.
  //
  // Batasnya jujur: ini tidak bisa membedakan mutasi dari uji di berkas ini dari perubahan yang
  // kebetulan mendarat di jalur yang sama dari proses LAIN yang berjalan bersamaan di worktree
  // yang sama (git index dan working tree di sini dipakai bersama antar agen) — ia cuma
  // membuktikan "kosong pada titik ini", bukan "kosong KARENA berkas ini".
  it("menjalankan berkas ini tidak meninggalkan efek samping tak ter-commit di fixture", () => {
    const status = execFileSync(
      "git",
      ["status", "--porcelain", "--", "tooling/testdata/fixture"],
      { encoding: "utf8" },
    );
    expect(status, "tooling/testdata/fixture berubah sesudah kasus uji di atas berjalan").toBe("");
  });
});
