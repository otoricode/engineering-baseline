/**
 * `doctor` atas pemasangan yang tidak punya toolchain Go.
 *
 * # Cacat yang melahirkan berkas ini
 *
 * Diukur di mesin dengan lingkungan disterilkan (`env -i`, PATH tanpa direktori Go), atas klon
 * bersih dari remote:
 *
 *     standard doctor   -> config sehat: 16 pemeriksaan lulus.        EXIT=0
 *     standard gate     -> 7 gate lulus.                              EXIT=0
 *     standard verify   -> go tidak bisa dijalankan: spawn go ENOENT  EXIT=2
 *
 * `doctor` HIJAU di mesin tanpa Go. `INSTALL.md` §10 menamai `doctor` sebagai cara membuktikan
 * pemasangannya benar, jadi pemakainya dapat hijau, mempercayainya, lalu meledak di `make gen-go`
 * pertama. Kegagalan `verify` sendiri sudah benar — keluar 2, menyebut alatnya, menolak
 * berpura-pura memeriksa; yang salah adalah `doctor` menyatakan sehat atas pemasangan yang tidak
 * bisa menjalankan separuh perintahnya.
 *
 * # PATH dipalsukan lewat SUBPROSES, bukan dengan mengubah PATH proses uji
 *
 * `process.env.PATH` milik seluruh proses vitest, termasuk berkas uji lain yang kebetulan berjalan
 * di worker yang sama. Pola yang dipakai di sini sama dengan `buatGoPalsu` di
 * `src/gen/instalasi.test.ts`: direktori berisi alat palsu, diletakkan di depan PATH milik
 * SUBPROSES saja.
 *
 * Basis PATH-nya tetap butuh isi — `bin/standard` menjalankan `tsx`, yang shebang-nya
 * `#!/usr/bin/env node`, jadi `env` dan `node` wajib bisa diresolusi. Yang TIDAK boleh ada di basis
 * itu adalah `go`/`gofmt`, dan itu tidak diandaikan: `beforeAll` MEMBUKTIKANNYA lebih dulu.
 */
import { execFile } from "node:child_process";
import { cpSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { access, rm } from "node:fs/promises";
import { constants } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { akarPaket } from "../paket.js";
import { DIR_FIXTURE } from "../verify/index.js";

const jalankan = promisify(execFile);

const dirSementara: string[] = [];
function tmpBaru(awalan: string): string {
  const d = mkdtempSync(path.join(tmpdir(), awalan));
  dirSementara.push(d);
  return d;
}
afterAll(() => {
  for (const d of dirSementara) rmSync(d, { recursive: true, force: true });
});

/**
 * PATH minimal yang cukup untuk MENJALANKAN `bin/standard`, dan tidak lebih.
 *
 * `dirname(process.execPath)` menyediakan `node`; `/usr/bin` dan `/bin` menyediakan `env` dan `sh`.
 * Tak satu pun dari ketiganya boleh menyediakan `go` — dan itu dibuktikan, bukan diandaikan.
 */
const PATH_DASAR = [path.dirname(process.execPath), "/usr/bin", "/bin"].join(path.delimiter);

async function adaDiPath(nama: string, daftarPath: string): Promise<boolean> {
  for (const dir of daftarPath.split(path.delimiter)) {
    if (dir === "") continue;
    try {
      await access(path.join(dir, nama), constants.X_OK);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

/** Direktori berisi alat palsu yang bisa dieksekusi. Isinya tak pernah dijalankan `doctor`. */
function dirAlatPalsu(nama: string[]): string {
  const dir = tmpBaru("eb-alat-");
  for (const n of nama) writeFileSync(path.join(dir, n), "#!/bin/sh\nexit 0\n", { mode: 0o755 });
  return dir;
}

/** Salinan fixture — proyek Go sungguhan yang `doctor`-nya hijau saat toolchain-nya ada. */
function proyekFixture(): string {
  const dir = tmpBaru("eb-toolchain-");
  cpSync(DIR_FIXTURE, dir, {
    recursive: true,
    filter: (asal) => !path.relative(DIR_FIXTURE, asal).split(path.sep).includes("node_modules"),
  });
  return dir;
}

async function doctor(cwd: string, daftarPath: string): Promise<{ kode: number; keluaran: string }> {
  try {
    const { stdout, stderr } = await jalankan(path.join(akarPaket(), "bin", "standard"), ["doctor"], {
      cwd,
      env: { ...process.env, PATH: daftarPath },
    });
    return { kode: 0, keluaran: stdout + stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { kode: err.code ?? -1, keluaran: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

/** Temuan toolchain untuk satu alat: baris temuan diawali nama alatnya. */
const mengeluhkan = (keluaran: string, alat: string): boolean =>
  keluaran.split("\n").some((b) => b.trim().startsWith(`${alat} tidak bisa diresolusi di PATH`));

beforeAll(async () => {
  // Prasyarat yang membuat seluruh berkas ini bermakna. Kalau `go` ternyata ADA di PATH dasar,
  // kasus "hilang" di bawah akan hijau untuk alasan yang salah — jadi ia dibuktikan di sini, dan
  // pesannya menyebut apa yang harus diperbuat kalau mesin pengulasnya berbeda.
  for (const alat of ["go", "gofmt"]) {
    expect(
      await adaDiPath(alat, PATH_DASAR),
      `PATH dasar uji ini menyediakan ${alat} (${PATH_DASAR}) — kasus "toolchain hilang" tidak bisa dibedakan dari kasus lengkap. Pindahkan toolchain Go keluar dari direktori itu, atau persempit PATH_DASAR.`,
    ).toBe(false);
  }
});

describe("doctor: toolchain Go", () => {
  const BATAS = 60_000;

  it(
    "MERAH bila go.mod ada tapi go DAN gofmt tidak bisa diresolusi",
    async () => {
      const { kode, keluaran } = await doctor(proyekFixture(), PATH_DASAR);
      expect(kode, keluaran).toBe(1);
      expect(mengeluhkan(keluaran, "go"), keluaran).toBe(true);
      expect(mengeluhkan(keluaran, "gofmt"), keluaran).toBe(true);
      // Kalimatnya menyebut AKIBATNYA, bukan cuma apa yang kurang — pembacanya perlu tahu apa yang
      // rusak, dan `doctor` adalah tempat ia pertama kali membacanya.
      expect(keluaran).toContain("make gen-go");
      expect(keluaran).toContain("keluar 2");
    },
    BATAS,
  );

  // `gofmt` gagal SENDIRIAN di mesin steril — itu yang membuat kedua alat diperiksa terpisah alih-alih
  // `gofmt` diandaikan ikut `go`. Kasus ini yang menahan andaian itu lahir kembali.
  it(
    "MERAH untuk gofmt sendirian, dan TIDAK mengeluhkan go yang ada",
    async () => {
      const { kode, keluaran } = await doctor(
        proyekFixture(),
        [dirAlatPalsu(["go"]), PATH_DASAR].join(path.delimiter),
      );
      expect(kode, keluaran).toBe(1);
      expect(mengeluhkan(keluaran, "gofmt"), keluaran).toBe(true);
      expect(mengeluhkan(keluaran, "go"), keluaran).toBe(false);
    },
    BATAS,
  );

  /**
   * KONTROL POSITIF. Tanpa kasus ini, kedua kasus merah di atas juga yang kau dapat dari
   * pemeriksaan yang SELALU merah — dan tak ada yang membedakannya.
   */
  it(
    "HIJAU bila go.mod ada dan kedua alat bisa diresolusi",
    async () => {
      const { kode, keluaran } = await doctor(
        proyekFixture(),
        [dirAlatPalsu(["go", "gofmt"]), PATH_DASAR].join(path.delimiter),
      );
      expect(kode, keluaran).toBe(0);
      expect(keluaran).toContain("config sehat");
    },
    BATAS,
  );

  /**
   * Separuh keputusan yang paling mudah hilang: proyek TANPA lapis Go tidak boleh dituntut punya
   * toolchain Go.
   *
   * Yang di-assert adalah KETIADAAN temuan toolchain, bukan `doctor` hijau — dan bedanya nyata:
   * `doctor` tetap merah di sini karena ia SUDAH menuntut `layout.backendDir/go.mod` ada, jauh
   * sebelum ronde ini. Itu perilaku lama yang di luar cakupan perubahan ini; yang harus dibuktikan
   * adalah bahwa pemeriksaan BARU tidak ikut menyumbang temuan.
   */
  it(
    "TIDAK memeriksa toolchain bila go.mod tidak ada",
    async () => {
      const proyek = proyekFixture();
      await rm(path.join(proyek, "apps/api/go.mod"));
      const { keluaran } = await doctor(proyek, PATH_DASAR);
      expect(mengeluhkan(keluaran, "go"), keluaran).toBe(false);
      expect(mengeluhkan(keluaran, "gofmt"), keluaran).toBe(false);
      // Kontrol positif untuk ketiadaan di atas: doctor MEMANG berjalan dan MEMANG melapor.
      expect(keluaran).toContain("layout.backendDir/go.mod");
    },
    BATAS,
  );
});
