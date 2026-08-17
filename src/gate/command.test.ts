import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LANGKAH, buatTGate, pilihLangkah } from "./command.js";
import { muatPesan } from "../messages/index.js";
import { dirSkripKontrak } from "../paket.js";

const t = buatTGate(await muatPesan("id"));
const nama = (argv: string[]): string[] => pilihLangkah(argv, t).map((l) => l.nama);

describe("pilihLangkah", () => {
  it("tanpa bendera menjalankan seluruh langkah", () => {
    expect(nama([])).toEqual(LANGKAH.map((l) => l.nama));
  });

  it("--only memilih satu langkah", () => {
    expect(nama(["--only", "envelope"])).toEqual(["envelope"]);
  });

  it("--lapis backend memilih langkah lapis backend saja", () => {
    expect(nama(["--lapis", "backend"])).toEqual(["routes", "tenancy-checklist"]);
  });

  // `routes` memainkan gate:backend-routes DAN gate:contract-routes, jadi ia wajib ikut di KEDUA
  // lapis: perubahan kontrak saja yang menabrakkan nama parameter tidak menyentuh berkas backend
  // mana pun, jadi workflow yang hanya menjalankan lapis kontrak harus tetap menangkapnya.
  it("langkah dua-lapis ikut di kedua lapis", () => {
    expect(nama(["--lapis", "contract"])).toContain("routes");
    expect(nama(["--lapis", "backend"])).toContain("routes");
  });

  /**
   * Diikat ke pesan yang PERSIS, bukan sekadar "melempar sesuatu yang menyebut envelop".
   *
   * Diukur, bukan dikira: versi pertama uji ini mencocokkan `/envelop/` dan tetap HIJAU ketika
   * penjaga `--only tak dikenal` dicabut sepenuhnya — karena nama yang salah ketik lalu jatuh ke
   * penjaga irisan-kosong di bawahnya, yang pesannya kebetulan juga memuat kata itu. Uji yang
   * tidak bisa membedakan dua penjaga tidak bisa membuktikan salah satunya ada.
   */
  it("--only yang tak dikenal DILAPORKAN oleh penjaganya sendiri", () => {
    const diharapkan = t("gate.hanya_tak_dikenal", {
      nama: "envelop",
      dikenal: LANGKAH.map((l) => l.nama).join(", "),
    });
    expect(() => pilihLangkah(["--only", "envelop"], t)).toThrow(diharapkan);
  });

  it("--lapis yang tak dikenal DILAPORKAN oleh penjaganya sendiri", () => {
    const diharapkan = t("gate.lapis_tak_dikenal", { nama: "frontend", dikenal: "contract, backend" });
    expect(() => pilihLangkah(["--lapis", "frontend"], t)).toThrow(diharapkan);
  });

  it("irisan kosong DILAPORKAN, bukan keluar 0", () => {
    expect(() => pilihLangkah(["--only", "envelope", "--lapis", "backend"], t)).toThrow(
      /--only envelope --lapis backend/,
    );
  });

  it("bendera tak dikenal ditolak, tidak diabaikan", () => {
    expect(() => pilihLangkah(["--onlyy", "envelope"], t)).toThrow(/--onlyy/);
  });

  it("bendera bernilai yang nilainya bendera lain ditolak", () => {
    expect(() => pilihLangkah(["--only", "--lapis"], t)).toThrow(/--only/);
  });

  it("argumen posisional ditolak", () => {
    expect(() => pilihLangkah(["envelope"], t)).toThrow(/envelope/);
  });
});

describe("daftar langkah", () => {
  it("tiap langkah menunjuk skrip yang benar-benar ada di paket", async () => {
    for (const l of LANGKAH) {
      const jalur = path.join(dirSkripKontrak(), l.skrip);
      await expect(readFile(jalur, "utf8"), l.nama).resolves.toBeTypeOf("string");
    }
  });

  /**
   * [[G-01]] menyuruh pembaca meng-grep SUMBER GATE untuk ID aturannya. Prosedur itu hanya bisa
   * dijalankan kalau nama gate yang daftar ini iklankan benar-benar muncul di sumber skripnya —
   * kalau tidak, pembaca meng-grep nama yang tak dimiliki berkas mana pun, dapat nol hasil, dan
   * menyimpulkan aturannya tak bertuan padahal penegaknya ada.
   */
  it("tiap nama gate yang diiklankan muncul di sumber skripnya", async () => {
    for (const l of LANGKAH) {
      const isi = await readFile(path.join(dirSkripKontrak(), l.skrip), "utf8");
      for (const g of l.gate) expect(isi, `${l.nama} -> ${g}`).toContain(g);
    }
  });

  it("nama langkah unik", () => {
    const semua = LANGKAH.map((l) => l.nama);
    expect(new Set(semua).size).toBe(semua.length);
  });
});
