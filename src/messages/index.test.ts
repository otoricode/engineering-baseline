import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { msg, muatPesan, validasiPesan } from "./index.js";

describe("katalog pesan", () => {
  it("kunci id.json dan en.json identik, dan setiap nilai adalah string", async () => {
    const id = JSON.parse(await readFile("tooling/messages/id.json", "utf8")) as Record<string, unknown>;
    const en = JSON.parse(await readFile("tooling/messages/en.json", "utf8")) as Record<string, unknown>;
    const a = Object.keys(id).sort();
    const b = Object.keys(en).sort();
    expect(a.filter((k) => !b.includes(k)), "ada di id, hilang di en").toEqual([]);
    expect(b.filter((k) => !a.includes(k)), "ada di en, hilang di id").toEqual([]);

    // Bukan cuma paritas kunci — tiap NILAI juga wajib string. Kunci bersarang/array/angka
    // yang lolos ke sini akan mematahkan pembaca Go yang membaca berkas JSON yang sama.
    for (const [kunci, nilai] of Object.entries(id)) {
      expect(typeof nilai, `id.json: kunci "${kunci}" bernilai bukan string (dapat ${typeof nilai})`).toBe(
        "string",
      );
    }
    for (const [kunci, nilai] of Object.entries(en)) {
      expect(typeof nilai, `en.json: kunci "${kunci}" bernilai bukan string (dapat ${typeof nilai})`).toBe(
        "string",
      );
    }
  });

  // Paritas KUNCI tidak menyentuh isi templatnya, dan di situ ada lubang yang berbentuk hijau:
  // `msg()` mengganti `{nama}` hanya kalau `vars` memuat `nama` — kalau tidak, ia mengembalikan
  // `{nama}` APA ADANYA (lihat `msg`). Jadi satu kunci yang di `id` menulis `{jalur}` dan di `en`
  // menulis `{path}` LULUS paritas kunci, lulus pemeriksaan tipe nilai, dan baru terlihat sebagai
  // `{path}` harfiah di keluaran — hanya untuk pemakai berbahasa Inggris, yaitu justru pemakai
  // yang paling kecil kemungkinannya diuji di sini. Himpunan nama variabel per kunci karena itu
  // wajib identik di kedua bahasa; jumlah kemunculannya boleh berbeda (satu bahasa boleh menyebut
  // variabel yang sama dua kali), yang tidak boleh adalah namanya berbeda.
  it("nama variabel templat identik per kunci di kedua bahasa", async () => {
    const id = JSON.parse(await readFile("tooling/messages/id.json", "utf8")) as Record<string, string>;
    const en = JSON.parse(await readFile("tooling/messages/en.json", "utf8")) as Record<string, string>;
    const namaVar = (templat: string): string[] =>
      [...new Set([...templat.matchAll(/\{(\w+)\}/g)].map((m) => m[1]!))].sort();

    for (const kunci of Object.keys(id)) {
      if (!(kunci in en)) continue; // paritas kunci sudah diperiksa test di atas
      expect(namaVar(en[kunci]!), `kunci "${kunci}": nama variabel id vs en`).toEqual(namaVar(id[kunci]!));
    }
  });

  it("mengganti variabel di templat", async () => {
    const p = await muatPesan("id");
    expect(msg(p, "config.tidak_ditemukan", { dari: "/x" })).toContain("/x");
  });

  it("melempar untuk kunci tak dikenal alih-alih mengembalikan kuncinya", async () => {
    const p = await muatPesan("id");
    expect(() => msg(p, "kunci.tidak.ada")).toThrow(/kunci.tidak.ada/);
  });

  it("validasiPesan melempar bila katalog punya nilai bersarang, alih-alih meloloskannya", () => {
    const rusak = { "a.b": "ok", "c.d": { nested: "oops" } };
    expect(() => validasiPesan(rusak, "contoh.json")).toThrow(/c\.d/);
  });
});
