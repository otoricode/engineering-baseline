import { mkdtempSync, existsSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { bacaBendera, BENDERA_APPLY, buatRencana } from "./argumen.js";
import { buatT } from "./pesan.js";
import { muatPesan } from "../../src/messages/index.js";

const t = buatT(await muatPesan("id"));
const DIKENAL = [BENDERA_APPLY, { nama: "tag", berNilai: true }];

describe("bacaBendera", () => {
  it("membaca bendera tanpa nilai, bendera bernilai, dan argumen posisional", () => {
    const b = bacaBendera(["--tag", "buku", "--apply", "sisa"], DIKENAL, t);
    expect(b.ada("apply")).toBe(true);
    expect(b.nilai("tag")).toBe("buku");
    expect(b.posisi).toEqual(["sisa"]);
  });

  it("bendera tak dikenal GAGAL, bukan diabaikan", () => {
    // Salah ketik `--aply` yang diabaikan diam-diam terbaca sebagai dry-run oleh pemakai yang
    // yakin ia baru saja menulis berkas.
    expect(() => bacaBendera(["--aply"], DIKENAL, t)).toThrow(/--aply/);
  });

  it("bendera bernilai yang nilainya hilang tidak menelan bendera berikutnya", () => {
    // Tanpa penjaga ini, `--tag --apply` menetapkan tag bernama "--apply" DAN kehilangan --apply,
    // jadi perintahnya diam-diam berubah jadi dry-run atas tag yang tidak ada.
    expect(() => bacaBendera(["--tag", "--apply"], DIKENAL, t)).toThrow();
  });
});

describe("buatRencana", () => {
  // Dibersihkan lewat afterAll, BUKAN di akhir tiap kasus: pembersihan di akhir kasus tidak
  // pernah berjalan untuk kasus yang GAGAL. Terukur: 59 direktori `rencana-*` tertinggal di /tmp
  // sebelum ini — berkas ini sebelumnya membuat direktorinya dan tidak pernah menghapusnya.
  const dir = mkdtempSync(path.join(tmpdir(), "rencana-"));
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  it("tanpa --apply: melaporkan rencananya dan TIDAK menulis satu berkas pun", () => {
    const target = path.join(dir, "kering", "a.txt");
    const keluaran: string[] = [];
    const r = buatRencana(false, t, (s) => keluaran.push(s));
    r.tambah(target, "isi");
    const ditulis = r.jalankan();

    expect(ditulis).toEqual([]);
    expect(existsSync(target), "dry-run TIDAK boleh menyentuh disk").toBe(false);
    expect(keluaran.join("\n")).toContain("--apply");
    expect(keluaran.join("\n")).toContain(target);
  });

  it("dengan --apply: menulis, membuat direktori induknya, lalu menjalankan hook sesudah-tulis", () => {
    const target = path.join(dir, "basah", "b.txt");
    const dilihatHook: string[] = [];
    const r = buatRencana(true, t, () => {});
    r.tambah(target, "isi", (p) => dilihatHook.push(p));
    const ditulis = r.jalankan();

    expect(ditulis).toEqual([target]);
    expect(readFileSync(target, "utf8")).toBe("isi");
    expect(dilihatHook).toEqual([target]);
  });

  it("hook sesudah-tulis TIDAK berjalan pada dry-run", () => {
    // Hooknya memformat berkas yang baru ditulis. Pada dry-run berkasnya tidak ada, jadi
    // menjalankannya akan gagal untuk alasan yang tidak ada hubungannya dengan apa pun yang
    // sedang diperiksa — dan kegagalan itu akan terbaca sebagai temuan gate.
    const r = buatRencana(false, t, () => {});
    let dipanggil = false;
    r.tambah(path.join(dir, "tak-pernah.txt"), "x", () => { dipanggil = true; });
    r.jalankan();
    expect(dipanggil).toBe(false);
  });

  it("tidak ada penulisan sampai jalankan() dipanggil", () => {
    // Sifat inilah yang membuat "gagal di tengah run" berarti pohon kerja tidak tersentuh sama
    // sekali, bukan setengah termigrasi.
    const target = path.join(dir, "tertunda", "c.txt");
    const r = buatRencana(true, t, () => {});
    r.tambah(target, "isi");
    expect(existsSync(target)).toBe(false);
    expect(r.jumlah()).toBe(1);
  });
});
