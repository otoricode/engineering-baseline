import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { lintBerkasDikecualikan, lintFormat, parseRules, type Rule } from "./parse.js";
import { lintRules } from "./lint.js";

const WAJIB = [
  "S-01","S-02","S-03",
  "C-01","C-02","C-03","C-04","C-05","C-06",
  "B-01","B-02","B-03",
  "W-01","W-02","W-03",
  "G-01","G-02","G-03","G-04","G-05","G-06",
  "T-01","T-02","T-03","T-04","T-05","T-06","T-07",
  "I-01","I-02","I-03","I-04",
  "O-01","O-02","O-03","O-04","O-05","O-06","O-07",
];

const DIR = "rules";

async function namaBerkasAturan(): Promise<string[]> {
  return (await readdir(DIR)).filter((n) => n.endsWith(".md") && n !== "README.md").sort();
}

async function muat(): Promise<Rule[]> {
  const semua: Rule[] = [];
  for (const n of await namaBerkasAturan()) {
    const jalur = path.join(DIR, n);
    semua.push(...parseRules(await readFile(jalur, "utf8"), jalur));
  }
  return semua;
}

describe("inventaris aturan", () => {
  it("memuat setiap ID wajib", async () => {
    const ada = new Set((await muat()).map((r) => r.id));
    expect(WAJIB.filter((id) => !ada.has(id))).toEqual([]);
  });

  it("tidak memuat aturan di luar inventaris", async () => {
    const wajib = new Set(WAJIB);
    const ada = (await muat()).map((r) => r.id);
    expect(ada.filter((id) => !wajib.has(id))).toEqual([]);
  });

  it("lulus rules-lint", async () => {
    expect(lintRules(await muat())).toEqual([]);
  });

  // Ini yang menegakkan kelengkapan prosa (`**Aturan.**`/`**Mengapa.**`/
  // `**Cara memverifikasi.**`) DAN cacat format lainnya. Pemeriksaannya sengaja
  // tinggal di `lintFormat`, bukan di berkas test ini: `rules-lint` memanggil
  // `lintFormat`, jadi proyek target yang menyalin paket ini ikut terjaga. Berkas
  // test ini tidak portabel — `WAJIB` memaku ke-38 ID milik paket ini — jadi apa pun
  // yang hanya hidup di sini tidak terbawa ke mana-mana.
  it("lulus lintFormat di setiap berkas aturan", async () => {
    for (const n of await namaBerkasAturan()) {
      const jalur = path.join(DIR, n);
      const isi = await readFile(jalur, "utf8");
      expect(lintFormat(isi, jalur), jalur).toEqual([]);
    }
  });

  // Menghitung lawan KONSTANTA, bukan lawan `parseRules`. Versi pertama asersi ini
  // membandingkan jumlah blok dengan jumlah aturan terparse — tautologi, karena blok
  // DIBUAT dari hasil parse; menambah satu aturan utuh memindahkan kedua sisi dan
  // tetap hijau. Terhadap `WAJIB.length` ia benar-benar bisa merah.
  it("jumlah aturan sama dengan jumlah entri inventaris", async () => {
    expect((await muat()).length).toBe(WAJIB.length);
  });

  // KONTROL POSITIF terbaik yang tersedia untuk pemeriksaan berkas-dikecualikan:
  // `rules/README.md` paket ini sendiri. Ia memuat contoh format ber-fence (dua
  // judul aturan di dalamnya), tabel prefix, siklus hidup ID, dan tabel cakupan —
  // persis bentuk yang pemeriksaan ini TIDAK boleh perahkan. Kalau ia memerahkan
  // dirinya sendiri, yang salah pemeriksaannya, bukan README-nya.
  it("README folder aturan tidak memerahkan dirinya sendiri", async () => {
    const jalur = path.join(DIR, "README.md");
    expect(lintBerkasDikecualikan(await readFile(jalur, "utf8"), jalur)).toEqual([]);
  });
});
