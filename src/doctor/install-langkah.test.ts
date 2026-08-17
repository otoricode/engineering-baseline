/**
 * `INSTALL.md` diikuti HARFIAH, lalu `doctor` dijalankan di tiap langkahnya.
 *
 * # Cacat yang melahirkan berkas ini
 *
 * Seorang pengulas memasang paket ini atas proyek Go+OpenAPI kosong dengan mengikuti dokumennya
 * kata per kata. Sesudah langkah 1, 2, DAN 3 penuh, `doctor` masih merah — pada empat berkas
 * schema bersama (`openapi/_shared/*.yaml`) yang **tak satu langkah pun menyuruh membuatnya**. Kata
 * `_shared` nol kemunculan di seluruh dokumen yang menghadap pemasang. Satu-satunya contoh yang
 * jalan terkubur di fixture, dan dokumennya menyebut fixture sekali, di bagian terakhir, sebagai
 * "yang dijalankan verify".
 *
 * Cacat keduanya lebih halus dan lahir dari sebab yang sama: kriteria keluar langkah 1 berbunyi
 * "`doctor` sampai bersih", padahal buku besar baru lahir di langkah 3 dan namespace di langkah 2.
 * **Urutan dokumennya sendiri menjamin langkah 1 gagal**, dan pemasang yang menuruti kriteria itu
 * berhenti di hari pertama.
 *
 * # Kenapa uji, bukan review
 *
 * Prosa tidak menahan; gate menahan. Berkas ini mengambil templat YAML **dari `INSTALL.md` sendiri**
 * (bukan salinan di sini — salinan kedua pasti menyimpang), menulisnya ke proyek sementara persis
 * seperti yang dokumen suruh, lalu menuntut jumlah temuan `doctor` di tiap langkah SAMA dengan
 * angka yang dokumen janjikan. Dua arah sekaligus: `doctor` yang berubah memerahkan berkas ini, dan
 * angka dokumen yang dikarang memerahkannya juga.
 */
import { execFile } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { jalankanDoctor } from "./index.js";
import type { StandardConfig } from "../config/schema.js";
import { akarPaket } from "../paket.js";

const jalankan = promisify(execFile);

const dirSementara: string[] = [];
afterAll(async () => {
  for (const d of dirSementara) await rm(d, { recursive: true, force: true });
});

/**
 * Templat berkas di `INSTALL.md`, diambil lewat penanda `<!-- berkas: <nama> -->` yang mendahului
 * blok ber-fence-nya. Penanda, bukan judul bagian: judul disunting orang, penanda tidak.
 */
function templatInstall(isi: string): Map<string, string> {
  const hasil = new Map<string, string>();
  const baris = isi.split("\n");
  for (let i = 0; i < baris.length; i++) {
    const m = /^<!--\s*berkas:\s*(\S+)\s*-->$/.exec(baris[i]!.trim());
    if (m === null) continue;
    const mulai = baris.findIndex((b, j) => j > i && b.startsWith("```"));
    if (mulai === -1) continue;
    const selesai = baris.findIndex((b, j) => j > mulai && b.trim() === "```");
    if (selesai === -1) continue;
    hasil.set(m[1]!, `${baris.slice(mulai + 1, selesai).join("\n")}\n`);
  }
  return hasil;
}

let install = "";
let contoh: StandardConfig;
let templat: Map<string, string>;

beforeAll(async () => {
  install = await readFile(path.join(akarPaket(), "INSTALL.md"), "utf8");
  contoh = JSON.parse(
    await readFile(path.join(akarPaket(), "tooling", "config.example.json"), "utf8"),
  ) as StandardConfig;
  templat = templatInstall(install);
});

/** Proyek target sesudah §1 dijalankan harfiah: layout, go.mod, dan keempat schema bersama. */
/**
 * `cfg()` selalu merakit config BERLAPIS BACKEND, jadi kedua bidang opsionalnya pasti terisi —
 * tapi kompiler tidak tahu itu. Penyempitannya lewat pemeriksaan runtime yang MELEMPAR, bukan `!`:
 * hari `cfg()` berubah jadi contract-only, yang gagal adalah baris ini beserta kalimatnya, bukan
 * sebuah `undefined` yang menyelinap ke `path.join`.
 */
function lapisBackend(c: StandardConfig): { dir: string; modulePath: string } {
  const dir = c.layout.backendDir;
  const go = c.go;
  if (dir === undefined || go === undefined) {
    throw new Error("cfg() uji ini wajib menyatakan lapis backend (layout.backendDir + go)");
  }
  return { dir, modulePath: go.modulePath };
}

async function proyekSesudahLangkah1(): Promise<{ akar: string; config: StandardConfig }> {
  const akar = await mkdtemp(path.join(tmpdir(), "eb-install-"));
  dirSementara.push(akar);
  const c = structuredClone(contoh);

  // §1.1: `cp tooling/config.example.json <proyek>/standard.config.json`. Ditulis ke DISK, bukan
  // cuma dipegang sebagai objek: kasus yang menjalankan `bin/standard` sebagai subproses mencari
  // config dari direktori kerjanya, sama seperti pemasang sungguhan.
  await writeFile(path.join(akar, "standard.config.json"), `${JSON.stringify(c, null, 2)}\n`);

  for (const d of [c.layout.contractDir, lapisBackend(c).dir, c.layout.frontendDir]) {
    await mkdir(path.join(akar, d), { recursive: true });
  }
  await writeFile(
    path.join(akar, lapisBackend(c).dir, "go.mod"),
    `module ${lapisBackend(c).modulePath}\n\ngo 1.26\n`,
  );

  const dirShared = path.join(akar, c.layout.contractDir, c.contract.sharedDir);
  await mkdir(dirShared, { recursive: true });
  for (const nama of Object.values(c.contract.shared)) {
    const isi = templat.get(nama);
    expect(isi, `INSTALL.md tidak punya templat untuk ${nama}`).toBeDefined();
    await writeFile(path.join(dirShared, nama), isi!);
  }
  return { akar, config: c };
}

describe("INSTALL.md §1.3 — keempat berkas schema bersama", () => {
  it("punya templat untuk TIAP berkas yang contract.shared tunjuk", () => {
    for (const nama of Object.values(contoh.contract.shared)) {
      expect(templat.has(nama), nama).toBe(true);
    }
    // Arah kedua: templat untuk berkas yang config TIDAK tunjuk adalah templat yang menyesatkan.
    for (const nama of templat.keys()) {
      expect(Object.values(contoh.contract.shared), nama).toContain(nama);
    }
  });

  // Kata yang nol kemunculannya di dokumen inilah yang menghentikan pengulas. Diikat sebagai
  // KEHADIRAN yang di-assert, bukan sekadar diperbaiki sekali.
  it("menyebut direktori _shared dan menunjuk contoh lengkap di fixture", () => {
    expect(install).toContain("_shared");
    expect(install).toContain("tooling/testdata/fixture/packages/contract/openapi/_shared");
  });
});

describe("INSTALL.md diikuti harfiah, `doctor` di tiap langkah", () => {
  it("sesudah §1: tepat 5 temuan — keempat buku besar dan namespace, tidak lebih", async () => {
    const { akar, config } = await proyekSesudahLangkah1();
    const h = await jalankanDoctor(config, akar);
    expect(h.temuan, h.temuan.join("\n")).toHaveLength(5);
    // Yang tersisa HARUS cuma dua kelas itu; berkas schema bersama tidak boleh ada di antaranya.
    for (const t of h.temuan) expect(t, t).toMatch(/ledgers\.|uuidNamespace/);
    expect(install).toContain("| 1 | **5** |");
  });

  it("sesudah §2 (namespace diisi): tepat 4 temuan", async () => {
    const { akar, config } = await proyekSesudahLangkah1();
    config.idempotency.uuidNamespace = "9f1c2b7e-0000-4000-8000-000000000001";
    const h = await jalankanDoctor(config, akar);
    expect(h.temuan, h.temuan.join("\n")).toHaveLength(4);
    for (const t of h.temuan) expect(t, t).toContain("ledgers.");
    expect(install).toContain("| 2 | **4** |");
  });

  it("sesudah §3 (buku besar dibuat): HIJAU", async () => {
    const { akar, config } = await proyekSesudahLangkah1();
    config.idempotency.uuidNamespace = "9f1c2b7e-0000-4000-8000-000000000001";
    for (const berkas of Object.values(config.ledgers)) {
      await writeFile(path.join(akar, config.layout.contractDir, berkas), "{}\n");
    }
    const h = await jalankanDoctor(config, akar);
    expect(h.temuan, h.temuan.join("\n")).toEqual([]);
    expect(install).toContain("| 3 | **0** |");
  });

  /**
   * Kontrol positif untuk ketiganya: tanpa §1.3, `doctor` merah pada keempat schema bersama —
   * yaitu keadaan yang pengulas alami. Kalau baris ini hijau, ketiga kasus di atas tidak
   * membuktikan bahwa §1.3 mengerjakan sesuatu.
   */
  it("TANPA §1.3, doctor merah pada keempat berkas schema bersama", async () => {
    const { akar, config } = await proyekSesudahLangkah1();
    for (const nama of Object.values(config.contract.shared)) {
      await rm(path.join(akar, config.layout.contractDir, config.contract.sharedDir, nama));
    }
    const h = await jalankanDoctor(config, akar);
    expect(h.temuan).toHaveLength(9);
    expect(h.temuan.filter((t) => t.includes("contract.shared."))).toHaveLength(4);
  });
});

/**
 * Janji yang dokumen ini SEMPAT buat: "templat §1.3 cukup untuk membuat `doctor` hijau **dan
 * `gen common` berjalan**". Paruh keduanya salah — terukur `EXIT=2`, `ENOENT` pada bundel kontrak
 * yang tak satu langkah pun menghasilkannya.
 *
 * Kelasnya sama persis dengan kriteria keluar mustahil yang baru saja diperbaiki satu paragraf di
 * atasnya: dokumen yang ada UNTUK bisa diikuti, menjanjikan sesuatu yang tidak terjadi. Karena itu
 * yang diikat bukan prosanya melainkan KEDUA keadaannya — yang gagal dan yang berhasil — supaya
 * janji versi berikutnya tidak bisa dibuat tanpa dibuktikan lebih dulu.
 */
describe("INSTALL.md §4.0 — bundel kontrak adalah prasyarat `gen common`", () => {
  const standard = async (cwd: string, argv: string[]): Promise<{ kode: number; keluaran: string }> => {
    try {
      const { stdout, stderr } = await jalankan(path.join(akarPaket(), "bin", "standard"), argv, {
        cwd,
        maxBuffer: 16 * 1024 * 1024,
      });
      return { kode: 0, keluaran: stdout + stderr };
    } catch (e) {
      const err = e as { code?: number; stdout?: string; stderr?: string };
      return { kode: err.code ?? -1, keluaran: (err.stdout ?? "") + (err.stderr ?? "") };
    }
  };

  it(
    "TANPA bundel: keluar 2 dan menyebut jalur bundelnya — bukan hijau, bukan pesan lain",
    async () => {
      const { akar, config } = await proyekSesudahLangkah1();
      const { kode, keluaran } = await standard(akar, ["gen", "common"]);
      expect(kode, keluaran).toBe(2);
      expect(keluaran).toContain(config.contract.bundle);
    },
    60_000,
  );

  // Kontrol positif, dan ia yang membuat kasus di atas berarti sesuatu: prasyarat yang dokumen
  // sebut memang CUKUP. Bundelnya diambil dari fixture — artefak yang sudah ada di repo ini dan
  // sudah dijaga provenansnya oleh `fixture.test.ts`, jadi uji ini tidak menuntut bundler terpasang.
  it(
    "DENGAN bundel di `contract.bundle`: perintah yang sama keluar 0",
    async () => {
      const { akar, config } = await proyekSesudahLangkah1();
      const tujuan = path.join(akar, config.layout.contractDir, config.contract.bundle);
      await mkdir(path.dirname(tujuan), { recursive: true });
      await copyFile(
        path.join(akarPaket(), "tooling/testdata/fixture/packages/contract/dist/openapi.bundled.yaml"),
        tujuan,
      );
      const { kode, keluaran } = await standard(akar, ["gen", "common"]);
      expect(kode, keluaran).toBe(0);
      // Keenam schema bersama datang dari templat §1.3, bukan dari bundelnya — bukti bahwa
      // templat itulah yang dipakai, bukan sekadar ikut ada.
      expect(keluaran).toContain("EnvelopeSuccess");
    },
    60_000,
  );

  it("dokumen menyatakan prasyaratnya, dan TIDAK lagi menjanjikan `gen common` jalan sesudah §1.3", () => {
    expect(install).toContain("Prasyarat: bundel kontrak");
    expect(install).toContain("`contract.bundle`");
    // Janji lama, verbatim. Ia tidak boleh kembali.
    expect(install).not.toContain("cukup untuk membuat `doctor` hijau dan `gen common` berjalan");
  });
});

describe("INSTALL.md §1.2 — kunci config yang tidak boleh tak disebut", () => {
  // Ketiganya nol kemunculan di dokumen ini maupun di SPEC sebelum gelombang ini, dan dua di
  // antaranya menonaktifkan gate SECARA DIAM-DIAM kalau kosong.
  it("menyebut ketiga kunci opsional beserta akibat mengosongkannya", () => {
    for (const kunci of ["go.entrypoint", "go.registrarType", "contract.permissionSeeds"]) {
      expect(install, kunci).toContain(kunci);
    }
    // `registrarType` isinya potongan sumber Go HARFIAH — kalau dokumennya tidak mengatakannya,
    // pemasang akan menulis nama tipe saja dan gate rute berhenti menemukan daftar modulnya.
    expect(install).toContain("[]server.FeatureRegistrar{");
  });
});
