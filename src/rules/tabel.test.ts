import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  lintHitunganManual,
  lintTabelPenegak,
  renderTabelPenegak,
  TABEL_PENEGAK_MULAI,
  TABEL_PENEGAK_SELESAI,
} from "./lint.js";
import { parseRules, type Rule } from "./parse.js";

const rule = (over: Partial<Rule> & { id: string }): Rule => ({
  judul: "j",
  ditegakkanOleh: "gate:x",
  usang: null,
  berkas: "rules/X.md",
  baris: 1,
  rujukan: [],
  ...over,
});

function bungkus(blok: string): string {
  return `# STANDARD\n\n## Tabel\n\n${TABEL_PENEGAK_MULAI}\n${blok}\n${TABEL_PENEGAK_SELESAI}\n\nAkhir.\n`;
}

describe("lintTabelPenegak", () => {
  const rules = [rule({ id: "A-01", judul: "Judul A", ditegakkanOleh: "gate:a" })];

  it("dokumen undefined: lolos (STANDARD.md belum disalin)", () => {
    expect(lintTabelPenegak(rules, undefined)).toEqual([]);
  });

  it("tanpa marker sama sekali: satu temuan, bukan diam", () => {
    const dok = { berkas: "STANDARD.md", isi: "# STANDARD\n\ntidak ada tabel di sini.\n" };
    const t = lintTabelPenegak(rules, dok);
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("marker");
  });

  it("tabel yang cocok persis dengan rules: lolos", () => {
    const blok = renderTabelPenegak(rules);
    const dok = { berkas: "STANDARD.md", isi: bungkus(blok) };
    expect(lintTabelPenegak(rules, dok)).toEqual([]);
  });

  it("aturan tanpa baris di tabel: temuan menyitir ID-nya", () => {
    const dok = { berkas: "STANDARD.md", isi: bungkus("| ID | Judul | Ditegakkan oleh |\n|---|---|---|") };
    const t = lintTabelPenegak(rules, dok);
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("A-01");
    expect(t[0]!.pesan).toContain("tidak punya baris");
  });

  it("baris basi (judul tidak cocok lagi dengan rules): temuan menyebut ekspektasi vs aktual", () => {
    const blokBasi = "| ID | Judul | Ditegakkan oleh |\n|---|---|---|\n| [[A-01]] | Judul LAMA | `gate:a` |";
    const dok = { berkas: "STANDARD.md", isi: bungkus(blokBasi) };
    const t = lintTabelPenegak(rules, dok);
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("basi");
    expect(t[0]!.pesan).toContain("Judul A");
    expect(t[0]!.pesan).toContain("Judul LAMA");
  });

  it("baris basi (penegak tidak cocok lagi): temuan", () => {
    const blokBasi = "| ID | Judul | Ditegakkan oleh |\n|---|---|---|\n| [[A-01]] | Judul A | `gate:lama` |";
    const dok = { berkas: "STANDARD.md", isi: bungkus(blokBasi) };
    const t = lintTabelPenegak(rules, dok);
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("basi");
  });

  it("urutan baris tertukar (isi tiap baris tetap cocok): temuan urutan", () => {
    const duaRules = [
      rule({ id: "S-01", judul: "S satu", ditegakkanOleh: "manual-review-only — x" }),
      rule({ id: "C-01", judul: "C satu", ditegakkanOleh: "gate:c" }),
    ];
    // Ekspektasi: S-01 dulu baru C-01 (urutan pilar S sebelum C). Tabel di
    // dokumen sengaja dibalik.
    const blokTerbalik =
      "| ID | Judul | Ditegakkan oleh |\n|---|---|---|\n" +
      "| [[C-01]] | C satu | `gate:c` |\n" +
      "| [[S-01]] | S satu | manual-review-only |";
    const dok = { berkas: "STANDARD.md", isi: bungkus(blokTerbalik) };
    const t = lintTabelPenegak(duaRules, dok);
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("urutan");
  });

  // Fix round 2, N2: sebelumnya baris duplikat tertelan diam-diam oleh
  // last-wins map — lolos HIJAU meski tabelnya secara fisik punya baris lebih
  // banyak daripada aturan yang ada.
  it("baris duplikat untuk ID yang sama: temuan menyebut duplikat", () => {
    const blokDuplikat =
      "| ID | Judul | Ditegakkan oleh |\n|---|---|---|\n" +
      "| [[A-01]] | Judul A | `gate:a` |\n" +
      "| [[A-01]] | Judul A | `gate:a` |";
    const dok = { berkas: "STANDARD.md", isi: bungkus(blokDuplikat) };
    const t = lintTabelPenegak(rules, dok);
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("duplikat");
    expect(t[0]!.pesan).toContain("A-01");
  });

  // Fix round 2, N2: sebelumnya baris yang tidak berbentuk "| [[ID]] | ... |"
  // sama sekali (regex-nya gagal cocok) lenyap TANPA sinyal — tidak masuk
  // `aktual`, jadi panjang array bisa kebetulan tetap cocok dan urutan-check
  // pun tidak pernah menyala.
  it("baris sampah tanpa [[ID]]: temuan menyebut isinya", () => {
    const blokSampah =
      "| ID | Judul | Ditegakkan oleh |\n|---|---|---|\n" +
      "| [[A-01]] | Judul A | `gate:a` |\n" +
      "| A-99 | baris rusak tanpa kurung ganda | `gate:x` |";
    const dok = { berkas: "STANDARD.md", isi: bungkus(blokSampah) };
    const t = lintTabelPenegak(rules, dok);
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("tak dikenal");
    expect(t[0]!.pesan).toContain("baris rusak tanpa kurung ganda");
  });

  // Fix round 2, N3: sebelumnya `indexOf` atas teks MENTAH berarti marker yang
  // dicontohkan di dalam blok ber-fence (mis. dokumentasi "begini bentuk
  // markernya") ikut cocok dan membuat fungsi mengambil wilayah yang salah —
  // reproduksi review: 37 temuan "tidak punya baris" sekaligus untuk tabel
  // yang sebenarnya benar dan tak pernah diperiksa.
  it("marker yang dicontohkan di dalam fence tidak dianggap marker sungguhan", () => {
    const isi =
      "# STANDARD\n\nBegini bentuk markernya:\n\n```md\n" +
      TABEL_PENEGAK_MULAI +
      "\ncontoh isi\n" +
      TABEL_PENEGAK_SELESAI +
      "\n```\n";
    const dok = { berkas: "STANDARD.md", isi };
    const t = lintTabelPenegak(rules, dok);
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("marker");
    // BUKAN 37 temuan "tidak punya baris" — persis kegagalan yang direview.
    expect(t[0]!.pesan).not.toContain("tidak punya baris");
  });

  // Arah sebaliknya: marker SUNGGUHAN di luar fence tetap ditemukan dan
  // diverifikasi normal, walau dokumennya JUGA punya contoh marker di dalam
  // fence di tempat lain.
  it("marker sungguhan di luar fence tetap lolos walau ada contoh marker di dalam fence", () => {
    const blok = renderTabelPenegak(rules);
    const isi =
      "# STANDARD\n\nContoh markernya:\n\n```md\n" +
      TABEL_PENEGAK_MULAI +
      "\n...\n" +
      TABEL_PENEGAK_SELESAI +
      "\n```\n\n" +
      bungkus(blok);
    const dok = { berkas: "STANDARD.md", isi };
    expect(lintTabelPenegak(rules, dok)).toEqual([]);
  });

  // Fix round 3, M1: header/pemisah dulu dicocokkan STRING PERSIS, jadi tiga
  // bentuk BAKU yang `prettier`/`markdownlint --fix` hasilkan begitu markdown
  // diformat jatuh ke cabang "sampah" (regresi dari fix N2 — sebelum N2,
  // baris tak-cocok dibuang diam-diam). Ketiganya wajib LOLOS: gate yang
  // memerah pada masukan yang benar mengajari orang mematikannya (G-06).
  it.each([
    ["header rata kolom + pemisah panjang", "| ID       | Judul   | Ditegakkan oleh |\n| -------- | ------- | --------------- |"],
    ["pemisah dengan alignment (:---:)", "| ID | Judul | Ditegakkan oleh |\n|:---|:---:|---:|"],
    ["header rata kolom, pemisah pendek", "|ID|Judul|Ditegakkan oleh|\n|-|-|-|"],
  ])("bentuk header/pemisah hasil formatter markdown (%s): tetap lolos", (_nama, headerPemisah) => {
    const dok = { berkas: "STANDARD.md", isi: bungkus(`${headerPemisah}\n| [[A-01]] | Judul A | \`gate:a\` |`) };
    expect(lintTabelPenegak(rules, dok)).toEqual([]);
  });

  // Arah sebaliknya harus tetap menyala: leniensi header/pemisah TIDAK boleh
  // menutupi baris duplikat atau baris sampah sungguhan yang baru N2 tangkap.
  it("bentuk header hasil formatter TIDAK menutupi baris duplikat", () => {
    const blok =
      "| ID       | Judul   | Ditegakkan oleh |\n| -------- | ------- | --------------- |\n" +
      "| [[A-01]] | Judul A | `gate:a` |\n" +
      "| [[A-01]] | Judul A | `gate:a` |";
    const dok = { berkas: "STANDARD.md", isi: bungkus(blok) };
    const t = lintTabelPenegak(rules, dok);
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("duplikat");
  });

  it("bentuk pemisah hasil formatter TIDAK menutupi baris sampah", () => {
    const blok =
      "| ID | Judul | Ditegakkan oleh |\n|:---|:---:|---:|\n" +
      "| [[A-01]] | Judul A | `gate:a` |\n" +
      "| A-99 | baris rusak tanpa kurung ganda | `gate:x` |";
    const dok = { berkas: "STANDARD.md", isi: bungkus(blok) };
    const t = lintTabelPenegak(rules, dok);
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("tak dikenal");
  });

  it("dokumen nyata paket ini: tabel STANDARD.md lolos lawan rules/ sungguhan", async () => {
    const isi = await readFile("STANDARD.md", "utf8");
    expect(lintTabelPenegak(await rulesNyata(), { berkas: "STANDARD.md", isi })).toEqual([]);
  });
});

async function rulesNyata(): Promise<Rule[]> {
  const nama = (await readdir("rules")).filter((n) => n.endsWith(".md") && n !== "README.md");
  const semua: Rule[] = [];
  for (const n of nama) semua.push(...parseRules(await readFile(path.join("rules", n), "utf8"), n));
  return semua;
}

/**
 * Kalimat hitungan di bawah tabel ("N dari M ber-`manual-review-only`") diturunkan dari kolom
 * penegak yang SAMA dengan tabelnya, tapi sampai `lintHitunganManual` ada ia tidak ber-gate sama
 * sekali: tabelnya merah kalau barisnya lupa ditambah, kalimatnya diam. Angka itu justru yang
 * orang baca sebagai ukuran seberapa besar bagian standar ini yang belum bisa dimesinkan — angka
 * yang dipakai untuk memutuskan apa yang dibangun berikutnya.
 */
describe("lintHitunganManual", () => {
  const kalimat = (teks: string): { berkas: string; isi: string } => ({
    berkas: "STANDARD.md",
    isi: `judul\n\n${teks}\n`,
  });
  const duaAturan = [
    rule({ id: "A-01", ditegakkanOleh: "`gate:a`" }),
    rule({ id: "A-02", ditegakkanOleh: "manual-review-only — mesin tak bisa membacanya" }),
  ];

  it("hijau bila kedua angkanya cocok", () => {
    expect(lintHitunganManual(duaAturan, kalimat("1 dari 2 ber-`manual-review-only`."))).toEqual([]);
  });

  it("merah bila angka manualnya basi, dan menyebut angka yang benar", () => {
    const t = lintHitunganManual(duaAturan, kalimat("2 dari 2 ber-`manual-review-only`."));
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("sebenarnya 1 dari 2");
  });

  it("merah bila TOTAL aturannya basi — arah yang paling mudah terlewat saat menambah aturan", () => {
    const t = lintHitunganManual(duaAturan, kalimat("1 dari 39 ber-`manual-review-only`."));
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("sebenarnya 1 dari 2");
  });

  // Kalimat yang HILANG dilaporkan, bukan dilewati: "tidak ada yang diperiksa" tidak boleh terbaca
  // sama dengan "lulus" — pilihan yang sama dengan marker tabel di atasnya.
  it("merah bila kalimatnya tidak ada sama sekali", () => {
    const t = lintHitunganManual(duaAturan, kalimat("tidak ada hitungan di sini."));
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("tidak memuat kalimat hitungan");
  });

  // Sama seperti marker tabel dan rujukan [[ID]]: contoh di dalam blok ber-fence adalah
  // PENJELASAN, bukan klaim. Memungutnya berarti memerahkan dokumen yang benar.
  it("kalimat di dalam blok ber-fence tidak dihitung sebagai kalimatnya", () => {
    const t = lintHitunganManual(duaAturan, kalimat("```\n1 dari 2 ber-`manual-review-only`.\n```"));
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("tidak memuat kalimat hitungan");
  });

  it("dokumen nyata paket ini: kalimat hitungan STANDARD.md cocok dengan rules/ sungguhan", async () => {
    const isi = await readFile("STANDARD.md", "utf8");
    expect(lintHitunganManual(await rulesNyata(), { berkas: "STANDARD.md", isi })).toEqual([]);
  });
});
