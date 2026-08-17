/**
 * Kode keluar alat Go, diuji dengan alat Go SUNGGUHAN dan kompilasi Go sungguhan.
 *
 * # Kenapa berkas ini terpisah dari `instalasi.test.ts`
 *
 * Di sana `go` adalah skrip palsu: cepat, dan cukup untuk membuktikan rantai penyalurannya. Yang
 * TIDAK bisa dibuktikan skrip palsu adalah bahwa alat sungguhan — yang keluar 2 lewat
 * `os.Exit(2)` di dalam Go — sampai ke pemanggilnya sebagai 2. Itu yang diukur di sini.
 *
 * # Yang sedang dijaga
 *
 * Pemisahan kode keluar adalah kontrak yang seluruh lapis di atas pakai untuk mengambil keputusan:
 *
 *	1  pemeriksaan/generasinya BERJALAN dan menemukan pelanggaran
 *	2  ALATNYA gagal — jadi tidak ada yang berjalan, dan "tidak ada keluhan" bukan kabar baik
 *
 * `go run` MERATAKAN pemisahan itu: ia mencetak `exit status 2` ke stderr lalu keluar 1 sendiri.
 * Diukur langsung sebelum perbaikan ini ditulis:
 *
 *	biner genmodule langsung   EXIT=2
 *	go run ./genmodule         EXIT=1
 *	standard freeze --pkg …    EXIT=1
 *
 * Karena itu pembungkus MEMBANGUN alatnya lalu menjalankan binernya. Uji di bawah adalah
 * penjaganya: kembalikan ke `go run` dan ia merah.
 */
import { execFile } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { akarPaket } from "../paket.js";

const jalankan = promisify(execFile);
const asal = akarPaket();
const dirSementara: string[] = [];

afterAll(() => {
  for (const d of dirSementara) rmSync(d, { recursive: true, force: true });
});

/**
 * Proyek mini yang config-nya SAH tapi pohon Go-nya kosong. Itu tepat keadaan yang membuat
 * genmodule gagal sebagai ALAT (paket generated tak terbaca) — bukan sebagai temuan.
 */
function buatProyek(): string {
  const akar = mkdtempSync(path.join(tmpdir(), "eb-kode-"));
  dirSementara.push(akar);
  writeFileSync(
    path.join(akar, "standard.config.json"),
    readFileSync(path.join(asal, "tooling/config.example.json"), "utf8"),
  );
  return akar;
}

async function standard(argv: string[], cwd: string): Promise<{ kode: number; keluaran: string }> {
  try {
    const { stdout, stderr } = await jalankan(path.join(asal, "bin/standard"), argv, { cwd });
    return { kode: 0, keluaran: stdout + stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { kode: err.code ?? -1, keluaran: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

describe("kode keluar alat Go sungguhan", () => {
  it(
    "kegagalan yang lahir DI DALAM genmodule tiba sebagai 2, bukan diratakan jadi 1",
    async () => {
      const akar = buatProyek();
      const { kode, keluaran } = await standard(["gen", "module", "--tag", "t", "--pkg", "p"], akar);
      // 2 = alatnya gagal. 1 di sini berarti pembungkusnya memakai `go run` lagi, dan setiap
      // kegagalan alat Go akan terbaca sebagai "ada pelanggaran".
      expect(kode, keluaran).toBe(2);
      // Jejak khas `go run` saat program keluar bukan-nol. Kehadirannya berarti kode keluarnya
      // sudah diratakan di suatu tempat.
      expect(keluaran).not.toContain("exit status");
      // Dan yang gagal memang genmodule, bukan sesuatu yang lain: pesannya menyebut jalur paket
      // generated yang ia cari.
      expect(keluaran).toContain("internal/gen");
    },
    60_000,
  );

  it(
    "freeze atas modul yang tidak ada juga keluar 2",
    async () => {
      const akar = buatProyek();
      const { kode, keluaran } = await standard(["freeze", "--pkg", "p"], akar);
      expect(kode, keluaran).toBe(2);
      expect(keluaran).not.toContain("exit status");
    },
    60_000,
  );
});
