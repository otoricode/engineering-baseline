/**
 * Subperintah `gen` dan `freeze` — pembungkus tipis di atas kedua alat Go paket ini.
 *
 * # Satu permukaan, bukan tiga belas
 *
 * `bin/standard` adalah satu-satunya permukaan yang harus stabil. Makefile, workflow CI, dan skill
 * agen memanggil `standard gen module …`, bukan `go run ./genmodule …`. Konsekuensinya: setiap
 * detail pemanggilan alat — direktori kerja, letak config, nama bendera — hidup DI SINI, satu
 * salinan, bukan tersebar di tiap pemanggil.
 *
 * # Dua akar, dan `-config` yang wajib disebut
 *
 * Alat Go duduk di modul Go paket ini (`<paket>/tooling`), jadi `go run ./genmodule` HARUS berjalan
 * dengan cwd di situ. Tapi config yang harus dibacanya adalah config PROYEK TARGET. Bawaan
 * `-config` pada alat itu adalah cwd — yaitu paket ini — jadi pembungkus yang tidak menyebut
 * `-config` akan menyuruh alat membaca layout PAKET, bukan layout proyek. Karena itu `-config
 * <akar proyek>` selalu diteruskan eksplisit, untuk `gen module`, `gen dto`, MAUPUN `freeze`.
 * Uji yang mengikatnya berjalan atas paket TERPASANG (`instalasi.test.ts`), bukan atas checkout
 * repo: kalau `tooling/**` ternyata tidak ikut terkirim saat paket dipasang, uji atas checkout
 * tetap hijau sementara pemakainya gagal.
 *
 * # Dry-run adalah default
 *
 * Tanpa `--apply`, `-apply` TIDAK diteruskan; kedua alat Go melaporkan rencananya dan keluar 0
 * tanpa menyentuh disk. Itu yang membuat generator aman dipanggil agen: memanggilnya tanpa
 * membacanya lebih dulu tidak bisa merusak apa pun.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Subperintah, Tulis } from "../cli.js";
import { GalatConfig, loadConfig } from "../config/load.js";
import { msg, muatPesan, muatPesanSinkron, type Pesan } from "../messages/index.js";
import { bacaArgv, type Bendera, type SpesifikasiBendera } from "../argv.js";
import { dirSkripKontrak, dirTooling, jalurTsx } from "../paket.js";
// Kode keluarnya diimpor dari tempat ia DINYATAKAN (skrip kontrak), bukan diketik ulang di sini:
// pembungkus ini memetakan kegagalannya ke nilai yang sama persis, dan dua salinan sebuah
// konstanta yang wajib sama cepat atau lambat tidak sama. Arah impornya aman — `konteks.js` tidak
// punya efek samping saat dimuat dan tidak mengimpor apa pun dari `src/gen/`.
import { KELUAR_ALAT_GAGAL } from "../../tooling/contract-scripts/konteks.js";

/**
 * Satu perintah alat, dalam dua bentuk yang cara MENJALANKANNYA berbeda:
 *
 *   `go`     alat Go paket ini. DIBANGUN dulu ke biner sementara, lalu binernya yang dijalankan —
 *            lihat `jalankanAlat` untuk alasannya (kode keluar).
 *   `skrip`  skrip kontrak TypeScript, dijalankan lewat tsx paket ini.
 *
 * `alat` bukan bagian dari tanda tangan yang task ini terima — ia ditambahkan supaya baris laporan
 * "menjalankan X …" menyebut NAMA alat alih-alih mengindeks `argumen[1]`. Indeks itu benar hari ini
 * dan diam-diam salah begitu urutan argumennya berubah.
 *
 * `argumen` pada bentuk `go` adalah argumen ALAT-nya, bukan argumen perintah `go`.
 */
export type PerintahAlat =
  | { jenis: "go"; paket: string; argumen: string[]; cwd: string; alat: string }
  | { jenis: "skrip"; biner: string; argumen: string[]; cwd: string; alat: string };

export type KunciGen =
  | "cli.bantuan_gen"
  | "cli.bantuan_freeze"
  | "cli.bendera_tak_dikenal"
  | "cli.bendera_tanpa_nilai"
  | "cli.posisional"
  | "gen.jenis_wajib"
  | "gen.jenis_tak_dikenal"
  | "gen.jenis_jamak"
  | "gen.tag_wajib"
  | "gen.pkg_wajib"
  | "gen.menjalankan_go"
  | "gen.menjalankan_skrip"
  | "gen.force"
  | "gen.alat_tak_bisa_dijalankan";

export type TGen = (kunci: KunciGen, vars?: Record<string, string>) => string;

export function buatTGen(pesan: Pesan): TGen {
  return (kunci, vars = {}) => msg(pesan, kunci, vars);
}

/** Katalog bawaan untuk pemanggil yang belum (atau tidak bisa) memuat bahasa proyek. */
const tBawaan = (): TGen => buatTGen(muatPesanSinkron("id"));

const JENIS = ["common", "module", "dto", "wiring"] as const;

/**
 * Generator kontrak yang TIDAK berbutir tag: katalog permission, katalog kode error, dan dokumen
 * schema bersama. Ketiganya jalan sebagai satu satuan (`gen common`) karena ketiganya diturunkan
 * dari berkas shared yang sama dan tidak punya urutan yang bermakna di antara mereka.
 */
const SKRIP_COMMON = ["gen-permissions.ts", "gen-error-codes.ts", "gen-shared-spec.ts"] as const;

const BENDERA_MODULE: SpesifikasiBendera[] = [
  { nama: "tag", berNilai: true },
  { nama: "pkg", berNilai: true },
  { nama: "feature", berNilai: true },
  { nama: "out", berNilai: true },
  { nama: "apply", berNilai: false },
  { nama: "force", berNilai: false },
];

const BENDERA_DTO: SpesifikasiBendera[] = [
  { nama: "only", berNilai: true },
  { nama: "apply", berNilai: false },
];

const BENDERA_COMMON: SpesifikasiBendera[] = [{ nama: "apply", berNilai: false }];

const BENDERA_WIRING: SpesifikasiBendera[] = [
  { nama: "tag", berNilai: true },
  { nama: "pkg", berNilai: true },
  { nama: "apply", berNilai: false },
];

const BENDERA_FREEZE: SpesifikasiBendera[] = [
  { nama: "pkg", berNilai: true },
  { nama: "feature", berNilai: true },
  { nama: "apply", berNilai: false },
];

/**
 * Contoh pemakaian yang ikut di pesan "butuh --tag/--pkg" — PERINTAH PENUH, satu per pemanggil.
 *
 * Bentuk sebelumnya memaku "standard gen module …" di dalam teks katalognya, sementara kunci yang
 * sama dipakai `freeze` dan `gen wiring`. Hasilnya: `standard freeze` tanpa `--pkg` mencetak contoh
 * yang tidak bisa dijalankan untuk masalah yang sedang dilaporkan — pesan gagal yang menyuruh orang
 * menjalankan subperintah yang SALAH lebih buruk daripada pesan tanpa contoh sama sekali.
 */
const CONTOH_MODULE = "standard gen module --tag <TAG> --pkg <PKG>";
const CONTOH_WIRING = "standard gen wiring --tag <TAG> --pkg <PKG>";
const CONTOH_FREEZE = "standard freeze --pkg <PKG>";

function baca(argv: string[], dikenal: SpesifikasiBendera[], t: TGen): Bendera {
  const b = bacaArgv(argv, dikenal, {
    takDikenal: (bendera, daftar) => t("cli.bendera_tak_dikenal", { bendera, dikenal: daftar }),
    tanpaNilai: (bendera, daftar) => t("cli.bendera_tanpa_nilai", { bendera, dikenal: daftar }),
  });
  // Argumen posisional yang tersisa DILAPORKAN, tidak dibuang: `standard gen module keluarga`
  // (lupa `--tag`) akan lolos sebagai perintah tanpa tag kalau posisionalnya ditelan diam-diam,
  // dan pesan galatnya lalu menyalahkan bendera yang hilang alih-alih argumen yang salah bentuk.
  if (b.posisi.length > 0) {
    throw new Error(
      t("cli.posisional", {
        argumen: b.posisi.join(" "),
        dikenal: dikenal.map((d) => `--${d.nama}`).join(", "),
      }),
    );
  }
  return b;
}

/**
 * Perintah untuk sebuah SKRIP KONTRAK (TypeScript), bukan alat Go.
 *
 * Letak config-nya diteruskan lewat mekanisme yang BERBEDA, dan bedanya bukan ketidakkonsistenan:
 * skrip kontrak memanggil `loadConfig(process.cwd())` — ia tidak punya bendera `-config` sama
 * sekali — jadi yang menentukan config mana yang dibaca adalah cwd, dan cwd-nya WAJIB akar proyek
 * target. Alat Go sebaliknya: cwd-nya wajib modul Go paket ini, jadi config-nya wajib disebut
 * lewat bendera. Menyamakan keduanya secara mekanis akan mematahkan salah satunya.
 */
function perintahSkrip(nama: string, akar: string, tambahan: string[]): PerintahAlat {
  return {
    jenis: "skrip",
    biner: jalurTsx(),
    argumen: [path.join(dirSkripKontrak(), nama), ...tambahan],
    cwd: akar,
    alat: nama,
  };
}

/** Perintah untuk sebuah ALAT GO paket ini. `argumen` di sini argumen ALAT, bukan argumen `go`. */
function perintahGo(alat: string, argumen: string[]): PerintahAlat {
  return { jenis: "go", paket: `./${alat}`, argumen, cwd: dirTooling(), alat };
}

/**
 * Perakit sesungguhnya: satu jenis bisa berarti BEBERAPA perintah (`common` menjalankan tiga
 * generator). `rakitPerintahGen` di bawah adalah fasad tunggalnya.
 */
export function rakitPerintahGenBanyak(
  argv: string[],
  akar: string,
  t: TGen = tBawaan(),
): PerintahAlat[] {
  const [jenis, ...sisa] = argv;
  const dikenal = JENIS.join("|");
  if (jenis === undefined) throw new Error(t("gen.jenis_wajib", { dikenal }));

  if (jenis === "common") {
    const b = baca(sisa, BENDERA_COMMON, t);
    const tambahan = b.ada("apply") ? ["--apply"] : [];
    return SKRIP_COMMON.map((s) => perintahSkrip(s, akar, tambahan));
  }

  if (jenis === "wiring") {
    const b = baca(sisa, BENDERA_WIRING, t);
    const tag = b.nilai("tag");
    const pkg = b.nilai("pkg");
    if (tag === undefined) throw new Error(t("gen.tag_wajib", { contoh: CONTOH_WIRING }));
    if (pkg === undefined) throw new Error(t("gen.pkg_wajib", { contoh: CONTOH_WIRING }));
    const tambahan = ["--tag", tag, "--pkg", pkg, ...(b.ada("apply") ? ["--apply"] : [])];
    return [perintahSkrip("gen-wiring.ts", akar, tambahan)];
  }

  return [rakitPerintahSatu(jenis, sisa, akar, t, dikenal)];
}

/**
 * Fasad SATU perintah. Jenis yang mekar jadi beberapa perintah (`common`) ditolak di sini dengan
 * pesannya sendiri, bukan dengan "jenis tak dikenal" — jenisnya dikenal, cuma bentuk hasilnya yang
 * tidak muat, dan pesan yang salah akan mengirim pembaca mencari salah ketik yang tidak ada.
 *
 * `akar` adalah akar PROYEK TARGET (hasil `loadConfig`), dan untuk alat Go ia mendarat di
 * `-config` — bukan di `cwd`. `cwd` alat Go adalah modul Go PAKET ini. Menukar keduanya adalah
 * cacat yang paling mudah ditulis di berkas ini dan paling sulit dilihat dari keluarannya.
 */
export function rakitPerintahGen(argv: string[], akar: string, t: TGen = tBawaan()): PerintahAlat {
  const semua = rakitPerintahGenBanyak(argv, akar, t);
  if (semua.length !== 1) {
    throw new Error(
      t("gen.jenis_jamak", { jenis: String(argv[0]), jumlah: String(semua.length) }),
    );
  }
  return semua[0]!;
}

function rakitPerintahSatu(
  jenis: string,
  sisa: string[],
  akar: string,
  t: TGen,
  dikenal: string,
): PerintahAlat {
  if (jenis === "module") {
    const b = baca(sisa, BENDERA_MODULE, t);
    const tag = b.nilai("tag");
    const pkg = b.nilai("pkg");
    if (tag === undefined) throw new Error(t("gen.tag_wajib", { contoh: CONTOH_MODULE }));
    if (pkg === undefined) throw new Error(t("gen.pkg_wajib", { contoh: CONTOH_MODULE }));
    const argumen = ["-config", akar, "-tag", tag, "-pkg", pkg];
    const feature = b.nilai("feature");
    if (feature !== undefined) argumen.push("-feature", feature);
    const out = b.nilai("out");
    if (out !== undefined) argumen.push("-out", out);
    if (b.ada("force")) argumen.push("-force");
    if (b.ada("apply")) argumen.push("-apply");
    return perintahGo("genmodule", argumen);
  }

  if (jenis === "dto") {
    const b = baca(sisa, BENDERA_DTO, t);
    const argumen = ["-config", akar];
    const only = b.nilai("only");
    if (only !== undefined) argumen.push("-only", only);
    if (b.ada("apply")) argumen.push("-apply");
    return perintahGo("gendto", argumen);
  }

  throw new Error(t("gen.jenis_tak_dikenal", { jenis, dikenal }));
}

/** `freeze` memakai alat yang sama dengan `gen module`, mode berbeda: `-freeze`. */
export function rakitPerintahFreeze(
  argv: string[],
  akar: string,
  t: TGen = tBawaan(),
): PerintahAlat {
  const b = baca(argv, BENDERA_FREEZE, t);
  const pkg = b.nilai("pkg");
  if (pkg === undefined) throw new Error(t("gen.pkg_wajib", { contoh: CONTOH_FREEZE }));
  const argumen = ["-config", akar, "-pkg", pkg];
  const feature = b.nilai("feature");
  if (feature !== undefined) argumen.push("-feature", feature);
  argumen.push("-freeze");
  if (b.ada("apply")) argumen.push("-apply");
  return perintahGo("genmodule", argumen);
}

/**
 * Menjalankan satu proses dengan stdio DIWARISKAN, bukan dibuffer.
 *
 * `execFile` (bentuk yang plan task ini contohkan) mengumpulkan keluaran di memori dengan batas
 * bawaan 1 MB dan MEMOTONGNYA diam-diam saat terlampaui — keluaran gate atas kontrak berukuran
 * penuh sudah melewati batas itu, dan yang hilang adalah bagian akhirnya: justru ringkasan dan
 * kaki "baca aturannya di sini".
 *
 * Kegagalan MENJALANKAN (biner tak ada) ditolak sebagai galat, bukan dipetakan ke kode keluar 1:
 * kode 1 berarti "pemeriksaannya berjalan dan menemukan pelanggaran", dan `go` yang tidak
 * terpasang bukan pelanggaran apa pun. Ia kegagalan ALAT — kode 2 di pemanggilnya.
 */
function jalankanProses(biner: string, argumen: string[], cwd: string): Promise<number> {
  return new Promise((selesai, tolak) => {
    const anak = spawn(biner, argumen, { cwd, stdio: "inherit" });
    anak.on("error", tolak);
    // `kode === null` berarti anaknya mati oleh SINYAL, bukan keluar normal. Itu bukan sukses dan
    // bukan pelanggaran — dipetakan ke 2 (alat gagal), sama seperti kegagalan menjalankan.
    anak.on("close", (kode) => selesai(kode ?? KELUAR_ALAT_GAGAL));
  });
}

/**
 * Menjalankan sebuah `PerintahAlat`, dan untuk alat Go itu berarti **BANGUN dulu, jalankan
 * binernya** — bukan `go run`.
 *
 * # Kenapa bukan `go run`
 *
 * `go run` TIDAK meneruskan kode keluar programnya. Ia mencetak `exit status 2` ke stderr lalu
 * keluar **1** sendiri. Diukur, tiga kali atas kasus yang sama:
 *
 *	biner genmodule langsung   EXIT=2   (kegagalan alat)
 *	go run ./genmodule         EXIT=1
 *	standard freeze --pkg …    EXIT=1
 *
 * Pemisahan 1-vs-2 adalah kontrak yang seluruh lapis di atasnya pakai untuk mengambil keputusan
 * (lihat `KELUAR_PELANGGARAN`/`KELUAR_ALAT_GAGAL` di skrip kontrak, dan `standard gate` yang
 * meneruskannya apa adanya): **1 = pemeriksaannya berjalan dan menemukan pelanggaran; 2 = ALATNYA
 * gagal, jadi pemeriksaannya tidak berjalan sama sekali.** Dengan `go run`, SETIAP kegagalan yang
 * lahir di dalam alat Go — config tak ditemukan, katalog tak terbaca, keluaran yang tidak bisa
 * diformat — tiba sebagai 1, yaitu "ada pelanggaran". Orang yang membacanya lalu mencari
 * pelanggaran kontrak yang tidak pernah ada, dan pemanggil otomatis (skill, driver, CI) mengambil
 * keputusan berhenti yang salah.
 *
 * Biayanya satu langkah build ke direktori sementara. Ia memakai cache build Go yang SAMA dengan
 * `go run`, jadi bedanya hampir nol sesudah lari pertama; yang ditukar adalah biaya itu dengan
 * kode keluar yang utuh.
 *
 * Build yang GAGAL memulangkan 2, bukan kode compiler-nya: kegagalan kompilasi alat adalah
 * kegagalan ALAT, dan galat compiler-nya sendiri sudah mengalir ke stderr lewat stdio warisan.
 */
export async function jalankanAlat(p: PerintahAlat): Promise<number> {
  if (p.jenis === "skrip") return jalankanProses(p.biner, p.argumen, p.cwd);

  const dirBiner = mkdtempSync(path.join(tmpdir(), "standard-go-"));
  try {
    const biner = path.join(dirBiner, p.alat);
    const kodeBangun = await jalankanProses("go", ["build", "-o", biner, p.paket], p.cwd);
    if (kodeBangun !== 0) return KELUAR_ALAT_GAGAL;
    return await jalankanProses(biner, p.argumen, p.cwd);
  } finally {
    rmSync(dirBiner, { recursive: true, force: true });
  }
}

/**
 * Katalog dikembalikan MENTAH, bukan sudah dibungkus perender: tiap subperintah punya union kunci
 * sendiri (`KunciGen`, `KunciGate`), dan mengembalikan salah satunya memaksa yang lain memakai
 * cast — yang mematikan justru pemeriksaan tipe yang membuat kunci salah ketik merah saat compile.
 */
export type KonteksAlat = { akar: string; pesan: Pesan };

/**
 * Config proyek target + katalog dalam bahasa proyek itu. Mengembalikan `null` sesudah mencetak
 * sebabnya — pemanggilnya keluar 2 (kegagalan ALAT: pemeriksaan/generasinya tidak berjalan sama
 * sekali, jadi "tidak ada keluhan" di sini bukan kabar baik).
 */
/** `--help`, `-h`, dan `help`, semuanya di posisi pertama. */
export function mintaBantuan(argv: string[]): boolean {
  const a = argv[0];
  return a === "--help" || a === "-h" || a === "help";
}

/**
 * Bantuan dijawab SEBELUM config dimuat, dan itu keputusan yang sama dengan yang sudah dipegang
 * alat Go paket ini: alat yang tak bisa menjelaskan dirinya sebelum dikonfigurasi memaksa orang
 * menebak bendera apa yang ada — dan yang pertama menabraknya adalah orang yang baru memasang
 * paket ini, yang justru belum punya config.
 *
 * Kalau config KEBETULAN ketemu, bantuannya dicetak dalam bahasa proyek itu; kalau tidak, dalam
 * SELURUH bahasa katalog. Alat yang belum dikonfigurasi tidak tahu bahasa siapa yang benar, dan
 * menebak salah satu sama buruknya dengan diam.
 */
export async function cetakBantuanSub(
  tulis: Tulis,
  kunci: string,
  vars: Record<string, string>,
): Promise<number> {
  let bahasa: ("id" | "en")[] = ["id", "en"];
  try {
    bahasa = [(await loadConfig(process.cwd())).config.language];
  } catch {
    // Tanpa config: dwibahasa, lihat alasan di atas.
  }
  let pertama = true;
  for (const b of bahasa) {
    if (!pertama) tulis("");
    tulis(msg(await muatPesan(b), kunci, vars));
    pertama = false;
  }
  return 0;
}

export async function muatKonteksAlat(tulis: Tulis): Promise<KonteksAlat | null> {
  try {
    const { config, akar } = await loadConfig(process.cwd());
    return { akar, pesan: await muatPesan(config.language) };
  } catch (e) {
    if (e instanceof GalatConfig) {
      // Bahasa proyek justru ada DI DALAM berkas yang tak terbaca; "id" adalah bawaan paket ini
      // sendiri, sama seperti di `doctor`.
      tulis(msg(muatPesanSinkron("id"), e.kode, e.params));
    } else {
      tulis((e as Error).message);
    }
    return null;
  }
}

async function jalankan(
  rakit: (argv: string[], akar: string, t: TGen) => PerintahAlat[],
  argv: string[],
  tulis: Tulis,
): Promise<number> {
  const konteks = await muatKonteksAlat(tulis);
  if (konteks === null) return 2;
  const t = buatTGen(konteks.pesan);
  let semua: PerintahAlat[];
  try {
    semua = rakit(argv, konteks.akar, t);
  } catch (e) {
    tulis((e as Error).message);
    return 2;
  }

  for (const p of semua) {
    // `--force` mematikan penolakan "modul sudah dibekukan" — satu-satunya jalur di seluruh
    // pembungkus ini yang MELEWATI sebuah penjagaan. Jalur "lewati kasus ini" yang tidak berbunyi
    // adalah jalur yang dipakai orang tanpa sadar; jadi ia berbunyi.
    if (p.argumen.includes("-force")) tulis(t("gen.force", { alat: p.alat }));
    // Dua kalimat, karena letak config-nya memang dua mekanisme yang berbeda: alat Go menerimanya
    // lewat `-config`, skrip kontrak membacanya dari CWD. Satu kalimat untuk keduanya akan
    // menyebut bendera yang tidak dimiliki separuh alatnya — dan komentar di `perintahSkrip` yang
    // menerangkan perbedaan itu lalu dibantah oleh baris laporannya sendiri.
    tulis(
      p.jenis === "go"
        ? t("gen.menjalankan_go", { alat: p.alat, config: konteks.akar, cwd: p.cwd })
        : t("gen.menjalankan_skrip", { alat: p.alat, cwd: p.cwd }),
    );
    let kode: number;
    try {
      kode = await jalankanAlat(p);
    } catch (e) {
      tulis(
        t("gen.alat_tak_bisa_dijalankan", {
          biner: p.jenis === "go" ? "go" : p.biner,
          sebab: (e as Error).message,
        }),
      );
      return KELUAR_ALAT_GAGAL;
    }
    // Berhenti di kegagalan PERTAMA: generator berikutnya membaca keluaran generator sebelumnya,
    // jadi melanjutkan berarti melaporkan kegagalan turunan yang menenggelamkan sebabnya.
    if (kode !== 0) return kode;
  }
  return 0;
}

export const gen: Subperintah = (argv, tulis) =>
  mintaBantuan(argv)
    ? cetakBantuanSub(tulis, "cli.bantuan_gen", { dikenal: JENIS.join("|") })
    : jalankan(rakitPerintahGenBanyak, argv, tulis);

export const freeze: Subperintah = (argv, tulis) =>
  mintaBantuan(argv)
    ? cetakBantuanSub(tulis, "cli.bantuan_freeze", {})
    : jalankan((a, akar, t) => [rakitPerintahFreeze(a, akar, t)], argv, tulis);
