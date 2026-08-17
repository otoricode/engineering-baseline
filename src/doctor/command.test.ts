import { execFile } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, describe, expect, it, vi } from "vitest";
import { msg, muatPesan } from "../messages/index.js";

const execFileAsync = promisify(execFile);

// Dibersihkan lewat afterAll, BUKAN di akhir kasus: kasus di bawah menegaskan sebuah KEGAGALAN
// (config tak ditemukan), jadi ia justru kasus yang paling mungkin melempar sebelum baris
// pembersihan tercapai. Terukur: 27 direktori `eb-doc-cmd-*` tertinggal di /tmp sebelum ini.
const dirSementara: string[] = [];
const daftarkan = (d: string): string => (dirSementara.push(d), d);
afterAll(async () => {
  for (const d of dirSementara) await rm(d, { recursive: true, force: true });
});

// `doctor` (src/doctor/command.ts) membaca `process.cwd()` langsung -- ia bukan sesuatu yang
// bisa disuntik lewat parameter tanpa mengubah kontrak `Subperintah` yang dipakai task lain.
// Test ini SENGAJA spawn proses `tsx` terpisah dengan `cwd` di-set lewat opsi child_process,
// BUKAN `process.chdir()` di proses test ini sendiri -- `process.chdir()` mengubah cwd untuk
// SELURUH proses Node (bukan per-test), dan kalau vitest menjalankan test file lain di worker
// yang sama secara konkuren, itu bisa membocorkan cwd yang salah ke test lain. Spawn proses
// anak mengisolasi cwd secara sungguhan di level OS, sama seperti pengujian black-box CLI biasa.
const AKAR_PAKET = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const TSX = path.join(AKAR_PAKET, "node_modules", ".bin", "tsx");
const CLI_ENTRY = path.join(AKAR_PAKET, "src", "cli-entry.ts");

describe("doctor (command, end-to-end)", () => {
  it("mencetak teks katalog bahasa bawaan yang benar saat config tak ditemukan", async () => {
    const akar = daftarkan(await mkdtemp(path.join(tmpdir(), "eb-doc-cmd-")));

    let stdout = "";
    let kodeKeluar = 0;
    try {
      const hasil = await execFileAsync(TSX, [CLI_ENTRY, "doctor"], { cwd: akar });
      stdout = hasil.stdout;
    } catch (e) {
      // execFile melempar kalau exit code != 0 -- doctor KELUAR 2 di sini, itu yang diharapkan.
      const galat = e as { stdout?: string; code?: number };
      stdout = galat.stdout ?? "";
      kodeKeluar = galat.code ?? 1;
    }

    expect(kodeKeluar).toBe(2);

    const pesan = await muatPesan("id");
    const diharapkan = msg(pesan, "config.tidak_ditemukan", { dari: akar });
    expect(stdout).toContain(diharapkan);
  }, 20_000);
});

// Test end-to-end di atas TIDAK CUKUP untuk membuktikan "doctor merender dari .kode + .params
// katalog, bukan sekadar mencetak .message" -- karena `GalatConfig.message` (dibangun di
// load.ts) SUDAH dirender di katalog "id" juga (itulah maksud "hapus duplikasi" di ronde ini),
// jadi kedua pendekatan kebetulan menghasilkan teks yang SAMA PERSIS untuk bahasa bawaan
// sekarang. Test di bawah membedakannya secara nyata: `.message` dirusak SENGAJA sesudah
// instance dibuat, lalu dibuktikan `doctor` TETAP mencetak teks yang benar -- yang cuma
// mungkin kalau ia merender ulang dari `.kode`/`.params`, bukan membaca `.message` yang rusak.
const { loadConfigMock } = vi.hoisted(() => ({ loadConfigMock: vi.fn() }));
vi.mock("../config/load.js", async (importOriginal) => {
  const asli = await importOriginal<typeof import("../config/load.js")>();
  return { ...asli, loadConfig: loadConfigMock };
});

describe("doctor (command, unit -- membuktikan render dari .kode/.params)", () => {
  it("mencetak teks dari .kode + .params walau .message GalatConfig dirusak sesudah dibuat", async () => {
    const { GalatConfig } = await import("../config/load.js");
    const galat = await GalatConfig.buat("config.tidak_ditemukan", { dari: "/contoh/tak-ada" });
    Object.defineProperty(galat, "message", {
      value: "PESAN RUSAK SENGAJA UNTUK TEST -- tak boleh muncul di keluaran",
      configurable: true,
    });
    loadConfigMock.mockRejectedValueOnce(galat);

    const { doctor } = await import("./command.js");
    const keluaran: string[] = [];
    const kode = await doctor([], (baris) => keluaran.push(baris));

    expect(kode).toBe(2);
    expect(keluaran.join("\n")).not.toContain("PESAN RUSAK SENGAJA");
    // Teks yang benar (dirender ulang dari .kode + .params, bahasa bawaan "id") tetap muncul.
    const pesan = await muatPesan("id");
    const diharapkan = msg(pesan, "config.tidak_ditemukan", { dari: "/contoh/tak-ada" });
    expect(keluaran.join("\n")).toContain(diharapkan);
  });
});
