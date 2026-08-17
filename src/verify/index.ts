/**
 * `standard verify` — self-test PAKET INI, bukan pemeriksaan atas proyek pemakainya.
 *
 * # Apa yang dibuktikannya, dan kenapa suite vitest tidak cukup
 *
 * Suite paket ini membuktikan tiap bagian benar SENDIRI-SENDIRI. Yang tidak dibuktikannya adalah
 * bahwa bagian-bagian itu masih benar SETELAH DISALIN ke proyek lain, dijalankan lewat `bin/standard`
 * yang sama yang dipakai orang, atas proyek yang bukan repo ini. Itu yang berkas ini kerjakan: ia
 * mengabaikan `process.cwd()` sepenuhnya dan selalu bekerja atas berkas PAKET (`rules/`, katalog
 * pesan, fixture di `tooling/testdata/`), lalu memanggil `bin/standard` sebagai SUBPROSES —
 * permukaan yang sama persis dengan yang dipakai Makefile, workflow CI, dan skill agen.
 *
 * # Enam tahap, dan semuanya dijalankan
 *
 * Tiap tahap menyumbang temuan dan TIDAK menghentikan tahap berikutnya. Laporan utuh lebih berguna
 * daripada berhenti di tahap satu — orang yang menjalankan verify sesudah mengubah generator ingin
 * tahu seluruh radius ledaknya sekaligus, bukan menemukannya satu per satu lewat lima lari.
 *
 * Yang TIDAK ikut longgar adalah kode keluarnya: `temuan` memetakan ke 1 (pemeriksaannya berjalan
 * dan menemukan pelanggaran), `alatGagal` memetakan ke 2 (alatnya sendiri gagal, jadi
 * pemeriksaannya TIDAK berjalan sama sekali). Menyatukan keduanya akan membuat "go tidak terpasang"
 * terbaca sebagai "generatormu menghasilkan keluaran yang salah".
 *
 * # Kenapa tahap 6 ada, dan kenapa ia bukan sekadar berkas uji
 *
 * Tahap 6 memindai nama proyek asal dan mengadu inventaris `INSTALL.md` dengan kenyataan. Ia duduk
 * di sini, bukan di suite, karena alasan yang sama yang membuat seluruh berkas ini ada: pemeriksaan
 * yang hanya hidup di suite paket ini tidak ikut terbawa ke salinan yang dipasang orang — dan
 * justru orang itu yang paling butuh tahu bahwa foldernya masih bersih sesudah ia menyuntingnya.
 *
 * # Kenapa tahap 5 ada, padahal tahap 1-4 sudah hijau
 *
 * Task 10 menemukan cacat yang lolos gate paritas KUNCI dan gate paritas NAMA VARIABEL sekaligus:
 * kata bermuatan bahasa disuntik sebagai NILAI variabel, sehingga kalimat Inggrisnya berbunyi
 * "nullable request bodies NAIK to 1". Struktur katalognya sempurna di kedua pemeriksaan itu;
 * yang campur adalah kalimatnya. Nilai variabel lahir di KODE, bukan di katalog — jadi satu-satunya
 * penjaga untuk kelas ini adalah benar-benar MENJALANKAN alatnya dalam bahasa kedua dan membaca
 * keluarannya. Tahap 5 melakukan itu untuk seluruh pipa generasi DAN ketujuh gate.
 *
 * # Titik tetap palsu
 *
 * Nol selisih terhadap golden juga yang kau dapat kalau sebuah langkah generasi diam-diam
 * DILEWATI — karena tak ada yang berubah ketika tak ada yang dikerjakan, dan berkas fixture yang
 * ter-commit sudah berisi jawaban yang benar. Karena itu tiap langkah pipa MENGHAPUS keluarannya
 * sendiri lebih dulu (`hapusKeluaran`), tepat sebelum langkah itu dijalankan: sesudahnya, berkas
 * yang HILANG adalah bukti langsung bahwa langkahnya tidak mengerjakan apa-apa, dan itu dilaporkan
 * sebagai temuan alih-alih dibaca sebagai kecocokan.
 *
 * Penghapusan dilakukan per-langkah, bukan sekaligus di awal, dan itu bukan kerapian: `gen module`
 * MEMBACA cermin dto yang `gen dto` tulis (lihat commit fixture "cermin dto SUDAH ada saat
 * driver.sh semua rerun"). Menghapus seluruh keluaran di muka akan menjalankan `gen module` dalam
 * keadaan yang berbeda dari keadaan yang fixture-nya sudah terbukti stabil di dalamnya.
 */
import { execFile } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { loadConfig } from "../config/load.js";
import { jalankanDoctor } from "../doctor/index.js";
import { msg, muatPesan, type Pesan } from "../messages/index.js";
import { akarPaket } from "../paket.js";
import { rulesLint } from "../rules/command.js";
import {
  NAMA_PROYEK_ASAL,
  PENGECUALIAN,
  periksaInventarisInstall,
  pindaiNamaAsalRinci,
} from "./origin-scan.js";

const jalankanProses = promisify(execFile);

export const DIR_FIXTURE = path.join(akarPaket(), "tooling", "testdata", "fixture");
export const DIR_GOLDEN = path.join(akarPaket(), "tooling", "testdata", "golden");

/** Tag dan paket yang fixture ini punya. Satu-satunya, dan disebut sekali di sini. */
const TAG = "contoh";
const PKG = "contoh";

export type Tulis = (baris: string) => void;

export type OpsiVerify = {
  perbaruiGolden: boolean;
  /** Baris kemajuan; temuan TIDAK lewat sini — ia dikembalikan supaya pemanggil yang memutuskan. */
  tulis?: Tulis;
};

export type HasilVerify = {
  /** Pelanggaran: pemeriksaannya BERJALAN dan menemukan sesuatu. Memetakan ke kode keluar 1. */
  temuan: string[];
  /** Kegagalan ALAT: pemeriksaannya tidak berjalan sama sekali. Memetakan ke kode keluar 2. */
  alatGagal: string[];
  jumlahTahap: number;
  jumlahBerkasGolden: number;
};

/**
 * Satu langkah pipa generasi: perintah `standard` apa adanya, dan DAFTAR BERKAS yang langkah itu
 * bertanggung jawab menulis.
 *
 * Daftarnya eksplisit, bukan "apa pun yang berubah di pohon", dan itu keputusan yang dituntut oleh
 * bentuk fixture-nya: `apps/api/internal/gen/contoh/contoh.gen.go` dan
 * `packages/contract/dist/openapi.bundled.yaml` adalah MASUKAN ter-commit (keluaran `oapi-codegen`
 * dan redocly, dijaga provenansnya oleh `fixture.test.ts`), bukan keluaran alat paket ini. Golden
 * yang memuat mereka akan menguji alat orang lain sambil mengaku menguji alat kita.
 */
type LangkahPipa = { alat: string; argv: string[]; keluaran: string[] };

export const PIPA: readonly LangkahPipa[] = [
  {
    alat: "gen common",
    argv: ["gen", "common", "--apply"],
    keluaran: [
      "apps/api/internal/gen/permissions.go",
      "apps/api/internal/gen/errorcodes.go",
      "apps/web/src/generated/permissions.ts",
      "apps/web/src/generated/errorCodes.ts",
      "packages/contract/dist/openapi.shared.yaml",
    ],
  },
  {
    alat: "gen wiring",
    argv: ["gen", "wiring", "--tag", TAG, "--pkg", PKG, "--apply"],
    keluaran: [
      "apps/api/internal/gen/contoh/wiring.gen.go",
      "apps/api/internal/gen/contoh/shared.gen.go",
    ],
  },
  {
    alat: "gen module",
    argv: ["gen", "module", "--tag", TAG, "--pkg", PKG, "--apply"],
    keluaran: [
      "apps/api/internal/feature/contoh/register.gen.go",
      "apps/api/internal/feature/contoh/handler.gen.go",
      "apps/api/internal/feature/contoh/service.gen.go",
      "apps/api/internal/feature/contoh/repository.gen.go",
      "apps/api/internal/feature/contoh/repository_tenancy_test.contoh.md",
    ],
  },
  {
    alat: "gen dto",
    argv: ["gen", "dto", "--apply"],
    keluaran: [
      "apps/api/internal/feature/contoh/dto_contoh.gen.go",
      "apps/api/internal/feature/contoh/dto_contoh_roundtrip.gen_test.go",
    ],
  },
];

/**
 * Sabotase yang membuat SATU gate benar-benar merah, supaya kalimat GAGAL-nya ikut dirender di
 * bahasa kedua. Lihat butir (d) di `tahapDwibahasa`.
 *
 * Entri pertama menyasar situs cacat Task 10 apa adanya: baseline `badanNullable` dinaikkan ke 1
 * sementara kontrak fixture punya 0, jadi `check-request-body` mengambil cabang "baseline turun" —
 * salah satu dari sepasang kunci yang dulu berbentuk SATU kunci dengan kata arahnya disuntikkan
 * sebagai variabel. Sabotasenya menyentuh buku besar di salinan sementara saja, bukan kontraknya,
 * jadi ia tidak bisa gagal untuk alasan kedua (bundel yang tidak terurai).
 */
type ProbeMerah = { nama: string; argv: string[]; sabotase: (akar: string) => void };

export const PROBE_MERAH: readonly ProbeMerah[] = [
  {
    nama: "gate:contract-request-body",
    argv: ["gate", "--only", "request-body"],
    sabotase: (akar) => {
      const jalur = path.join(akar, "packages/contract/envelope-opt-in.json");
      const ledger = JSON.parse(readFileSync(jalur, "utf8")) as Record<string, unknown>;
      ledger["baseline"] = { badanNullable: 1 };
      writeFileSync(jalur, `${JSON.stringify(ledger, null, 2)}\n`);
    },
  },
];

/**
 * Kata Indonesia yang TIDAK BOLEH muncul di keluaran alat saat bahasanya `en`.
 *
 * Daftarnya sengaja terbatas pada kata FUNGSI dan kata kerja umum — bukan kata benda domain — dan
 * batas itu bukan kehati-hatian berlebihan, ia syarat supaya pemeriksaan ini tetap dipakai: fixture
 * ini bernama `contoh`, kontraknya menulis deskripsi berbahasa Indonesia, dan permission-nya
 * bernama Indonesia. Semua itu DATA, bukan prosa alat. Gate yang memerahkan data pemakai adalah
 * gate yang orang matikan (lihat [[G-06]]), jadi yang dipindai hanya kalimat yang alatnya sendiri
 * karang.
 *
 * `naik`/`turun` ada di daftar bukan karena kebetulan: itu dua kata persis yang melahirkan seluruh
 * pemeriksaan ini ("nullable request bodies NAIK to 1", Task 10).
 */
export const KATA_INDONESIA = [
  "yang", "tidak", "bukan", "berkas", "aturan", "dengan", "untuk", "dari", "dan", "atau",
  "adalah", "sudah", "belum", "wajib", "jalur", "temuan", "gagal", "jangan", "pernah", "harus",
  "akan", "bisa", "lalu", "tapi", "karena", "kalau", "hanya", "setiap", "dipakai", "ditulis",
  "dibaca", "naik", "turun", "melewati", "memakai", "milik", "sendiri", "lewat", "dulu", "saja",
  "berjalan", "dijalankan", "menjalankan", "langkah", "direktori", "diperiksa", "ditemukan",
] as const;

const POLA_INDONESIA = new RegExp(`\\b(${KATA_INDONESIA.join("|")})\\b`, "i");

export function kataIndonesiaPertama(baris: string): string | null {
  return POLA_INDONESIA.exec(baris)?.[1] ?? null;
}

/** Fixture TANPA `node_modules` — ia 40 MB paket redocly yang cuma dipakai `fixture.test.ts`. */
function salinFixture(tujuan: string): void {
  cpSync(DIR_FIXTURE, tujuan, {
    recursive: true,
    filter: (asal) => !path.relative(DIR_FIXTURE, asal).split(path.sep).includes("node_modules"),
  });
}

/**
 * Memanggil `bin/standard` sebagai SUBPROSES dengan cwd di proyek yang diuji.
 *
 * Bukan memanggil `rakitPerintahGen`/`jalankanAlat` di dalam proses ini, dan itu dua alasan sekali
 * jalan: (1) subperintah `gen`/`gate` membaca `process.cwd()` untuk menemukan config, dan
 * `process.chdir()` mengubah cwd untuk SELURUH proses — termasuk berkas uji lain yang kebetulan
 * berjalan bersamaan di worker vitest yang sama; (2) yang harus dibuktikan verify justru shim yang
 * dipakai orang, bukan jalur pintas yang cuma ada di dalam repo ini.
 *
 * Keluarannya DITANGKAP (bukan diwariskan) karena tahap 5 harus MEMBACANYA. `maxBuffer` dinaikkan
 * jauh di atas bawaan 1 MB: keluaran gate atas kontrak berukuran penuh sudah melewati batas itu,
 * dan `execFile` memotongnya diam-diam — yang hilang justru bagian akhirnya.
 */
async function jalankanStandard(
  argv: string[],
  cwd: string,
): Promise<{ kode: number; keluaran: string }> {
  const shim = path.join(akarPaket(), "bin", "standard");
  try {
    const { stdout, stderr } = await jalankanProses(shim, argv, { cwd, maxBuffer: 64 * 1024 * 1024 });
    return { kode: 0, keluaran: stdout + stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string; message?: string };
    return {
      kode: typeof err.code === "number" ? err.code : 2,
      keluaran: `${err.stdout ?? ""}${err.stderr ?? ""}${err.stdout === undefined ? (err.message ?? "") : ""}`,
    };
  }
}

/** Menghapus keluaran satu langkah SEBELUM langkah itu jalan — lihat "titik tetap palsu" di atas. */
function hapusKeluaran(akar: string, relatif: readonly string[]): void {
  for (const r of relatif) rmSync(path.join(akar, r), { force: true });
}

/**
 * Menjalankan pipa generasi atas satu salinan fixture dan memulangkan isi tiap berkas keluaran.
 *
 * Berkas yang TIDAK ada sesudah langkahnya berjalan tidak dilewati diam-diam — ia dipulangkan
 * sebagai `null`, dan pemanggilnya melaporkannya sebagai temuan.
 */
async function jalankanPipa(
  akar: string,
): Promise<{ isi: Map<string, string | null>; gagal: { alat: string; sebab: string }[] }> {
  const isi = new Map<string, string | null>();
  const gagal: { alat: string; sebab: string }[] = [];
  for (const l of PIPA) {
    hapusKeluaran(akar, l.keluaran);
    const hasil = await jalankanStandard(l.argv, akar);
    if (hasil.kode !== 0) gagal.push({ alat: l.alat, sebab: `kode ${hasil.kode}: ${hasil.keluaran.trim()}` });
    for (const r of l.keluaran) {
      const jalur = path.join(akar, r);
      isi.set(r, existsSync(jalur) ? await readFile(jalur, "utf8") : null);
    }
  }
  return { isi, gagal };
}

/** Semua berkas di bawah `DIR_GOLDEN`, jalur relatif, urut — untuk mendeteksi golden yang BASI. */
function daftarGolden(): string[] {
  if (!existsSync(DIR_GOLDEN)) return [];
  return (readdirSync(DIR_GOLDEN, { recursive: true }) as string[])
    .filter((r) => statSync(path.join(DIR_GOLDEN, r)).isFile())
    .sort();
}

/** Nomor baris pertama yang berbeda, 1-based, plus kedua isinya — bukan cuma "berbeda". */
function bedaPertama(golden: string, aktual: string): { baris: number; golden: string; aktual: string } {
  const a = golden.split("\n");
  const b = aktual.split("\n");
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i] !== b[i]) return { baris: i + 1, golden: a[i] ?? "(tidak ada baris)", aktual: b[i] ?? "(tidak ada baris)" };
  }
  return { baris: 0, golden: "", aktual: "" };
}

type Tahap = {
  nama: string;
  jalankan: (ctx: KonteksTahap) => Promise<{ temuan: string[] }>;
};

type KonteksTahap = {
  t: (kunci: string, vars?: Record<string, string>) => string;
  perbaruiGolden: boolean;
  tulis: Tulis;
  /** Keluaran pipa berbahasa `id`, diisi tahap 4 dan dibaca tahap 5. */
  golden: Map<string, string>;
  jumlahBerkasGolden: number;
};

async function tahapRulesLint(ctx: KonteksTahap): Promise<{ temuan: string[] }> {
  const keluaran: string[] = [];
  const kode = await rulesLint([path.join(akarPaket(), "rules")], (b) => keluaran.push(b));
  if (kode === 0) return { temuan: [] };
  if (kode !== 1) throw new Error(keluaran.join("\n"));
  // Baris ringkasan ("N aturan diperiksa, M temuan.") dan baris hitungan dokumen bukan temuan —
  // ia konteks. Yang dilaporkan hanya baris yang berbentuk `berkas:baris: pesan`.
  return {
    temuan: keluaran
      .filter((b) => /^.+:\d+: /.test(b))
      .map((b) => ctx.t("verify.rules_temuan", { baris: b })),
  };
}

async function tahapKatalogPesan(ctx: KonteksTahap): Promise<{ temuan: string[] }> {
  const baca = async (b: "id" | "en"): Promise<Record<string, string>> =>
    JSON.parse(await readFile(path.join(akarPaket(), "tooling", "messages", `${b}.json`), "utf8")) as Record<
      string,
      string
    >;
  const id = await baca("id");
  const en = await baca("en");
  const temuan: string[] = [];

  for (const kunci of Object.keys(id)) {
    if (!(kunci in en)) temuan.push(ctx.t("verify.pesan_kunci_hilang", { kunci, ada: "id.json", hilang: "en.json" }));
  }
  for (const kunci of Object.keys(en)) {
    if (!(kunci in id)) temuan.push(ctx.t("verify.pesan_kunci_hilang", { kunci, ada: "en.json", hilang: "id.json" }));
  }

  // Paritas NAMA VARIABEL, bukan cuma paritas kunci: `msg()` membiarkan `{nama}` apa adanya kalau
  // `vars` tidak memuatnya, jadi satu kunci yang menulis `{jalur}` di id dan `{path}` di en lolos
  // paritas kunci dan baru terlihat sebagai `{path}` harfiah — hanya untuk pemakai berbahasa
  // Inggris, yaitu pemakai yang paling kecil kemungkinannya diuji.
  const namaVar = (templat: string): string[] =>
    [...new Set([...templat.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();
  for (const kunci of Object.keys(id)) {
    if (!(kunci in en)) continue;
    const a = namaVar(id[kunci]!);
    const b = namaVar(en[kunci]!);
    if (a.join(",") !== b.join(",")) {
      temuan.push(ctx.t("verify.pesan_var_beda", { kunci, id: a.join(", ") || "-", en: b.join(", ") || "-" }));
    }
  }
  return { temuan };
}

async function tahapDoctorFixture(ctx: KonteksTahap): Promise<{ temuan: string[] }> {
  const { config, akar } = await loadConfig(DIR_FIXTURE);
  const hasil = await jalankanDoctor(config, akar);
  return { temuan: hasil.temuan.map((b) => ctx.t("verify.doctor_temuan", { baris: b })) };
}

async function tahapPipaGolden(ctx: KonteksTahap): Promise<{ temuan: string[] }> {
  const dir = buatDirSementara("standard-verify-id-");
  try {
    salinFixture(dir);
    const { isi, gagal } = await jalankanPipa(dir);
    if (gagal.length > 0) throw new Error(gagal.map((g) => `${g.alat}: ${g.sebab}`).join("\n"));

    const temuan: string[] = [];
    for (const [relatif, teks] of isi) {
      if (teks === null) {
        const alat = PIPA.find((l) => l.keluaran.includes(relatif))!.alat;
        temuan.push(ctx.t("verify.fixture_tak_ditulis", { alat, berkas: relatif }));
        continue;
      }
      ctx.golden.set(relatif, teks);
    }

    const jalurGolden = (r: string): string => path.join(DIR_GOLDEN, r);

    if (ctx.perbaruiGolden) {
      let ditulis = 0;
      for (const [relatif, teks] of ctx.golden) {
        mkdirSync(path.dirname(jalurGolden(relatif)), { recursive: true });
        writeFileSync(jalurGolden(relatif), teks);
        ditulis += 1;
      }
      // Golden yang tidak lagi punya pasangan DIHAPUS, bukan ditinggal: berkas golden yatim tetap
      // terbaca sebagai "diperiksa" oleh siapa pun yang melihat direktorinya.
      let dihapus = 0;
      for (const lama of daftarGolden()) {
        if (!ctx.golden.has(lama)) {
          unlinkSync(jalurGolden(lama));
          dihapus += 1;
        }
      }
      // `jumlahBerkasGolden` sengaja TETAP 0 di mode ini: angka itu dibaca sebagai "berapa berkas
      // yang DIBANDINGKAN dan cocok", dan tidak satu pun dibandingkan saat golden ditulis ulang.
      // Mengisinya dengan jumlah yang ditulis akan membuat baris ringkasan mengaku telah
      // memverifikasi apa yang sebenarnya baru saja ia karang.
      //
      // Dicetak, BUKAN dilaporkan sebagai temuan: `--update-golden` adalah operasi yang sengaja
      // diminta, jadi ia keluar 0. Kalau ia menyumbang temuan, tiap pembaruan golden akan keluar 1
      // dan pemanggil otomatis membacanya sebagai gate merah.
      ctx.tulis(
        ctx.t("verify.golden_diperbarui", {
          ditulis: String(ditulis),
          dihapus: String(dihapus),
          dir: DIR_GOLDEN,
        }),
      );
      return { temuan: [] };
    }

    let cocok = 0;
    for (const [relatif, teks] of ctx.golden) {
      if (!existsSync(jalurGolden(relatif))) {
        temuan.push(ctx.t("verify.golden_hilang", { berkas: relatif }));
        continue;
      }
      const emas = await readFile(jalurGolden(relatif), "utf8");
      if (emas === teks) {
        cocok += 1;
        continue;
      }
      const beda = bedaPertama(emas, teks);
      temuan.push(ctx.t("verify.fixture_beda", { berkas: relatif }));
      temuan.push(
        ctx.t("verify.fixture_beda_baris", {
          baris: String(beda.baris),
          golden: beda.golden,
          aktual: beda.aktual,
        }),
      );
    }
    for (const lama of daftarGolden()) {
      if (!ctx.golden.has(lama)) temuan.push(ctx.t("verify.golden_basi", { berkas: lama }));
    }
    ctx.jumlahBerkasGolden = cocok;
    return { temuan };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Tahap 5 — lari DWIBAHASA sungguhan. Lihat kepala berkas untuk sebab keberadaannya.
 *
 * Tiga pemeriksaan, dan ketiganya menyerang sisi yang berbeda dari cacat yang sama:
 *
 *   a. Keluaran STDOUT seluruh pipa + `doctor` + KETUJUH gate dipindai kata Indonesia. Ini yang
 *      menangkap kelas Task 10 apa adanya: nilai berbahasa Indonesia yang disuntik ke kalimat
 *      Inggris.
 *   b. Tiap berkas yang generator TULIS dibandingkan dengan versi berbahasa `id`-nya; baris yang
 *      hanya ada di versi `en` adalah prosa alat, dan dipindai dengan daftar yang sama. Global
 *      Constraints menyebut komentar yang generator tulis ke dalam kode hasil sebagai string yang
 *      menghadap pengguna — ini yang menegakkannya.
 *   c. Berkas yang IDENTIK di kedua bahasa dilaporkan. Keempat belas berkas keluaran fixture ini
 *      semuanya membawa prosa; yang tidak berubah saat bahasanya berubah berarti prosanya dipaku
 *      di kode alih-alih datang dari katalog — dan itu lolos (a) dan (b) sekaligus, karena tak ada
 *      baris `en`-unik untuk dipindai.
 *   d. PROBE MERAH: fixture ini sehat, jadi (a) hanya pernah membaca kalimat gate yang LULUS —
 *      sementara cacat Task 10 hidup di kalimat GAGAL, yang tidak pernah dirender oleh lari hijau.
 *      `PROBE_MERAH` menyabotase salinan sementaranya sampai sebuah gate benar-benar merah, lalu
 *      memindai kalimat gagalnya. Kalau sabotasenya TIDAK mendarat (gate tetap keluar 0), itu
 *      dilaporkan sebagai temuan: probe yang tidak merah adalah probe yang tidak memindai apa pun.
 */
async function tahapDwibahasa(ctx: KonteksTahap): Promise<{ temuan: string[] }> {
  const BAHASA = "en";
  const dir = buatDirSementara("standard-verify-en-");
  try {
    salinFixture(dir);
    const jalurConfig = path.join(dir, "standard.config.json");
    const config = JSON.parse(await readFile(jalurConfig, "utf8")) as Record<string, unknown>;
    config["language"] = BAHASA;
    writeFileSync(jalurConfig, `${JSON.stringify(config, null, 2)}\n`);

    const temuan: string[] = [];
    const keluaran: string[] = [];

    const doctor = await jalankanStandard(["doctor"], dir);
    if (doctor.kode !== 0) throw new Error(`doctor (${BAHASA}) kode ${doctor.kode}: ${doctor.keluaran.trim()}`);
    keluaran.push(doctor.keluaran);

    const { isi, gagal } = await jalankanPipa(dir);
    if (gagal.length > 0) throw new Error(gagal.map((g) => `${g.alat} (${BAHASA}): ${g.sebab}`).join("\n"));

    // Gate SESUDAH pipa, bukan sebelum: `gen module` menulis ulang daftar periksa penyewa, dan
    // gate:tenancy-checklist adalah gate yang membacanya. Menjalankan gate lebih dulu berarti
    // memeriksa keadaan yang bukan keadaan yang baru saja dihasilkan.
    const gate = await jalankanStandard(["gate"], dir);
    if (gate.kode !== 0) throw new Error(`gate (${BAHASA}) kode ${gate.kode}: ${gate.keluaran.trim()}`);
    keluaran.push(gate.keluaran);

    // Jalur tmpdir dibuang dari tiap baris sebelum dipindai — ia data, bukan prosa, dan namanya
    // kebetulan memuat kata Inggris/Indonesia yang tidak dikarang alat mana pun.
    for (const baris of keluaran.join("\n").split("\n")) {
      const bersih = baris.split(dir).join("<dir>");
      const kata = kataIndonesiaPertama(bersih);
      if (kata !== null) temuan.push(ctx.t("verify.dwibahasa_kata", { bahasa: BAHASA, kata, baris: bersih.trim() }));
    }

    for (const [relatif, teks] of isi) {
      if (teks === null) {
        const alat = PIPA.find((l) => l.keluaran.includes(relatif))!.alat;
        temuan.push(ctx.t("verify.fixture_tak_ditulis", { alat: `${alat} (${BAHASA})`, berkas: relatif }));
        continue;
      }
      const versiId = ctx.golden.get(relatif);
      if (versiId === undefined) {
        temuan.push(ctx.t("verify.dwibahasa_golden_hilang", { bahasa: BAHASA, berkas: relatif }));
        continue;
      }
      if (versiId === teks) {
        temuan.push(ctx.t("verify.dwibahasa_seragam", { bahasa: BAHASA, berkas: relatif }));
        continue;
      }
      const barisId = new Set(versiId.split("\n"));
      for (const baris of teks.split("\n")) {
        if (barisId.has(baris)) continue;
        const bersih = baris.split(dir).join("<dir>");
        const kata = kataIndonesiaPertama(bersih);
        if (kata !== null) {
          temuan.push(
            ctx.t("verify.dwibahasa_kata", { bahasa: BAHASA, kata, baris: `${relatif}: ${bersih.trim()}` }),
          );
        }
      }
    }

    // (d) Probe merah — kalimat GAGAL tidak pernah dirender oleh lari yang hijau.
    for (const probe of PROBE_MERAH) {
      probe.sabotase(dir);
      const hasil = await jalankanStandard(probe.argv, dir);
      if (hasil.kode === 0) {
        temuan.push(ctx.t("verify.probe_tidak_merah", { nama: probe.nama, bahasa: BAHASA }));
        continue;
      }
      // Kode 2 berarti ALATNYA gagal — sabotasenya mendarat di tempat yang salah dan gate-nya tidak
      // pernah berjalan, jadi kalimat gagalnya tetap tidak dirender. Itu kegagalan alat, bukan
      // temuan, dan `jalankanVerify` yang memetakannya ke kode keluar 2.
      if (hasil.kode !== 1) {
        throw new Error(`${probe.nama} (${BAHASA}) kode ${hasil.kode}: ${hasil.keluaran.trim()}`);
      }
      for (const baris of hasil.keluaran.split("\n")) {
        const bersih = baris.split(dir).join("<dir>");
        const kata = kataIndonesiaPertama(bersih);
        if (kata !== null) {
          temuan.push(
            ctx.t("verify.dwibahasa_kata", { bahasa: BAHASA, kata, baris: `${probe.nama}: ${bersih.trim()}` }),
          );
        }
      }
    }
    return { temuan };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * Tahap 6 — nama proyek asal, dan inventaris yang `INSTALL.md` nyatakan.
 *
 * # Kenapa ia tahap `verify` dan bukan sekadar berkas uji
 *
 * Pelajaran yang lima ronde Task 3 bayar: pemeriksaan yang hanya hidup di suite paket ini TIDAK
 * ikut terbawa ke salinan yang dipasang orang. Suite dijalankan kontributor paket ini; `verify`
 * dijalankan siapa pun yang menyalin foldernya, lewat `bin/standard` yang sama, sesudah menyunting
 * generatornya. Pemindai nama asal justru paling berguna di lari yang kedua itu.
 *
 * # Tiga hal yang dilaporkan, dan ketiganya punya arah yang berlawanan
 *
 *   a. Kemunculan nama proyek asal — pelanggaran, nol yang diharapkan.
 *   b. Pengecualian pemindai yang tidak pernah dipakai — bukan kemunculan, tapi pemeriksaan yang
 *      tidak berjalan. Pemindai ini penuh pengecualian; tiap satu butuh penjaganya.
 *   c. Inventaris `INSTALL.md` vs kenyataan yang dipindai — DUA ARAH. Prasyarat yang terpaku tanpa
 *      terdaftar adalah kejutan di mesin pemakai; entri terdaftar yang tidak lagi terpaku adalah
 *      dokumen yang berbohong.
 */
async function tahapNamaAsal(ctx: KonteksTahap): Promise<{ temuan: string[] }> {
  const akar = akarPaket();
  const temuan: string[] = [];

  const { temuan: kemunculan, jejak } = await pindaiNamaAsalRinci(akar, NAMA_PROYEK_ASAL);
  for (const k of kemunculan) {
    temuan.push(ctx.t("verify.asal_temuan", { berkas: k.berkas, baris: String(k.baris), teks: k.teks }));
  }
  for (const nama of PENGECUALIAN) {
    if ((jejak[nama] ?? 0) === 0) temuan.push(ctx.t("verify.asal_pengecualian_mati", { nama }));
  }

  for (const t of await periksaInventarisInstall(akar)) temuan.push(ctx.t(t.kunci, t.vars));
  return { temuan };
}

const TAHAP: readonly Tahap[] = [
  { nama: "rules-lint", jalankan: tahapRulesLint },
  { nama: "paritas katalog pesan", jalankan: tahapKatalogPesan },
  { nama: "doctor atas fixture", jalankan: tahapDoctorFixture },
  { nama: "pipa fixture vs golden", jalankan: tahapPipaGolden },
  { nama: "lari dwibahasa", jalankan: tahapDwibahasa },
  { nama: "nama asal + inventaris INSTALL.md", jalankan: tahapNamaAsal },
];

/**
 * Direktori sementara verify. Selalu di bawah `tmpdir()`, dan SELALU dihapus lewat `finally` —
 * termasuk saat tahapnya melempar, karena kegagalan adalah lari yang paling sering diulang dan
 * karena itu lari yang paling cepat memenuhi disk.
 */
function buatDirSementara(awalan: string): string {
  return mkdtempSync(path.join(tmpdir(), awalan));
}

export async function jalankanVerify(opsi: OpsiVerify): Promise<HasilVerify> {
  // Katalog `id` — verify adalah self-test PAKET, dan bahasa penulisan paket ini Indonesia
  // (Global Constraints). Ia tidak membaca `standard.config.json` proyek mana pun; tahap 5 yang
  // menjalankan alatnya dalam bahasa kedua, dan itu di dalam salinan fixture, bukan di sini.
  const pesan: Pesan = await muatPesan("id");
  const t = (kunci: string, vars: Record<string, string> = {}): string => msg(pesan, kunci, vars);
  const tulis = opsi.tulis ?? ((): void => {});

  const ctx: KonteksTahap = {
    t,
    perbaruiGolden: opsi.perbaruiGolden,
    tulis,
    golden: new Map(),
    jumlahBerkasGolden: 0,
  };

  const temuan: string[] = [];
  const alatGagal: string[] = [];

  for (const [i, tahap] of TAHAP.entries()) {
    tulis(t("verify.tahap", { nomor: String(i + 1), jumlah: String(TAHAP.length), nama: tahap.nama }));
    try {
      const hasil = await tahap.jalankan(ctx);
      temuan.push(...hasil.temuan);
    } catch (e) {
      // Tahap yang MELEMPAR bukan pelanggaran — ia alat yang tidak jalan. Dicatat terpisah supaya
      // kode keluarnya 2, lalu tahap berikutnya TETAP dijalankan: satu alat yang tidak terpasang
      // tidak boleh menyembunyikan pelanggaran yang tahap lain sudah siap temukan.
      alatGagal.push(t("verify.alat_gagal", { nama: tahap.nama, sebab: (e as Error).message }));
    }
  }

  return { temuan, alatGagal, jumlahTahap: TAHAP.length, jumlahBerkasGolden: ctx.jumlahBerkasGolden };
}
