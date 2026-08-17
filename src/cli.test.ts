import { describe, expect, it } from "vitest";
import { runCli, SUBCOMMANDS } from "./cli.js";

// Kunci sintetis, bukan nama subperintah nyata: Task 7/11/14 mengganti slot `null`
// yang ada sekarang dengan implementasi, sampai tidak ada slot `null` tersisa.
// Test kontrak "slot null keluar 3" tidak boleh bergantung pada subperintah mana pun
// yang kebetulan masih `null` — jadi ia menyuntikkan kuncinya sendiri.
const KUNCI_NULL_SINTETIS = "__belum-ada__";

describe("runCli", () => {
  it("mencetak daftar subperintah pada --help dan keluar 0", async () => {
    const keluaran: string[] = [];
    const kode = await runCli(["--help"], (baris) => keluaran.push(baris));
    expect(kode).toBe(0);
    expect(keluaran.join("\n")).toContain("doctor");
    expect(keluaran.join("\n")).toContain("rules-lint");
    expect(keluaran.join("\n")).toContain("verify");
  });

  it("keluar 2 untuk subperintah tak dikenal", async () => {
    const keluaran: string[] = [];
    const kode = await runCli(["bikin-kopi"], (baris) => keluaran.push(baris));
    expect(kode).toBe(2);
    expect(keluaran.join("\n")).toContain("bikin-kopi");
  });

  it("keluar 2 tanpa argumen", async () => {
    const kode = await runCli([], () => {});
    expect(kode).toBe(2);
  });

  it("keluar 3 untuk subperintah terdaftar tapi belum diimplementasikan (null)", async () => {
    SUBCOMMANDS[KUNCI_NULL_SINTETIS] = null;
    try {
      const keluaran: string[] = [];
      const kode = await runCli([KUNCI_NULL_SINTETIS], (baris) => keluaran.push(baris));
      expect(kode).toBe(3);
      expect(keluaran.join("\n")).toContain(KUNCI_NULL_SINTETIS);
    } finally {
      delete SUBCOMMANDS[KUNCI_NULL_SINTETIS];
    }
  });

  it("--help tetap mendaftar subperintah ber-null (dipesan, terlihat, belum sukses)", async () => {
    SUBCOMMANDS[KUNCI_NULL_SINTETIS] = null;
    try {
      const keluaran: string[] = [];
      const kode = await runCli(["--help"], (baris) => keluaran.push(baris));
      expect(kode).toBe(0);
      expect(keluaran.join("\n")).toContain(KUNCI_NULL_SINTETIS);
    } finally {
      delete SUBCOMMANDS[KUNCI_NULL_SINTETIS];
    }
  });
});
