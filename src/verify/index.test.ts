/**
 * Uji atas `standard verify` — self-test paket ini.
 *
 * Berkas ini punya masalah yang melingkar: `verify` SENDIRI adalah pemeriksa, jadi uji yang cuma
 * memanggilnya dan melihat "nol temuan" membuktikan persis nol. Hijau adalah juga yang kau dapat
 * dari pemeriksa yang tidak memeriksa apa pun. Karena itu tiap kasus di bawah dipasangkan dengan
 * sabotase yang MENDARAT lebih dulu (dibuktikan dengan membaca kembali berkas yang disabotase),
 * baru hasilnya dibaca.
 *
 * Yang TIDAK dilakukan di sini: menyabotase `rules/`, katalog pesan, atau fixture. Ketiganya milik
 * bersama task lain dan sabotase yang gagal dipulihkan akan memerahkan suite orang lain. Golden
 * (`tooling/testdata/golden/`) adalah artefak MILIK subperintah ini sendiri, jadi ia satu-satunya
 * yang disabotase di dalam suite; keempat tahap lain dibuktikan bisa merah lewat sabotase manual
 * yang dicatat di laporan task ini.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { SUBCOMMANDS } from "../cli.js";
import { DIR_GOLDEN, kataIndonesiaPertama, jalankanVerify } from "./index.js";

// Tiga lari `jalankanVerify` yang masing-masing men-spawn `bin/standard` enam kali (tsx dari nol
// tiap kali) plus membangun dua alat Go. Diukur sendirian: ~10 detik per lari. Di bawah `pnpm test`
// penuh, 33 berkas uji lain berebut CPU yang sama — batas ini dilebihkan dengan sengaja, dengan
// alasan yang sama seperti timeout di `fixture.test.ts`.
const BATAS = 240_000;

const GOLDEN_DISABOTASE = path.join(
  DIR_GOLDEN,
  "apps/api/internal/feature/contoh/register.gen.go",
);

let isiAsli: string | null = null;
afterAll(() => {
  if (isiAsli !== null) writeFileSync(GOLDEN_DISABOTASE, isiAsli);
});

const statusTestdata = (): string =>
  execFileSync("git", ["status", "--porcelain", "--", "tooling/testdata"], { encoding: "utf8" });

/**
 * Keadaan `tooling/testdata` SEBELUM satu kasus pun berjalan — diambil saat modul ini dimuat.
 *
 * Dibandingkan lawan keadaan awal, bukan lawan string kosong, dan bedanya nyata: pada PR yang
 * memperkenalkan `tooling/testdata/golden/` itu sendiri, berkas goldennya belum ter-commit, jadi
 * "kosong" akan merah untuk alasan yang tidak ada hubungannya dengan apa yang diuji — dan cara
 * termurah membuatnya hijau lagi adalah membuang kasusnya. Yang mau dibuktikan di sini adalah
 * DELTA-nya nol: verify tanpa `--update-golden` tidak menambah, mengubah, atau menghapus apa pun.
 */
const STATUS_AWAL = statusTestdata();

describe("jalankanVerify", () => {
  it(
    "hijau pada paket yang sehat",
    async () => {
      const h = await jalankanVerify({ perbaruiGolden: false });
      expect(h.alatGagal, h.alatGagal.join("\n")).toEqual([]);
      expect(h.temuan, h.temuan.join("\n")).toEqual([]);
      // Hijau yang tidak menyentuh satu berkas golden pun terbaca sama dengan hijau yang
      // membandingkan keempat belasnya. Angka ini yang membedakannya.
      expect(h.jumlahBerkasGolden).toBe(14);
      expect(h.jumlahTahap).toBe(6);
    },
    BATAS,
  );

  it(
    "MERAH bila golden tidak lagi cocok dengan keluaran generator",
    async () => {
      isiAsli = readFileSync(GOLDEN_DISABOTASE, "utf8");
      const disabotase = isiAsli.replace("contohgen.Mount(", "contohgenSABOTASE.Mount(");
      // Sabotasenya dibuktikan MENDARAT sebelum hasilnya dibaca — `replace` yang tidak menemukan
      // polanya mengembalikan teks yang sama persis, dan lari berikutnya lalu HIJAU untuk alasan
      // yang tidak ada hubungannya dengan apa yang sedang diuji.
      expect(disabotase, "pola sabotase tidak ditemukan di berkas golden").not.toBe(isiAsli);
      writeFileSync(GOLDEN_DISABOTASE, disabotase);
      expect(readFileSync(GOLDEN_DISABOTASE, "utf8")).toBe(disabotase);

      const h = await jalankanVerify({ perbaruiGolden: false });
      expect(h.alatGagal, h.alatGagal.join("\n")).toEqual([]);
      const gabung = h.temuan.join("\n");
      expect(gabung).toContain("register.gen.go");
      expect(gabung).toContain("SABOTASE");
      // Bukan cuma "berbeda": pesannya menyebut baris pertama yang berbeda, supaya pembacanya
      // tidak perlu menjalankan diff sendiri untuk tahu apa yang berubah.
      expect(gabung).toMatch(/baris \d+/);
    },
    BATAS,
  );

  it(
    "--update-golden memulihkan golden yang disabotase, dan lari berikutnya hijau lagi",
    async () => {
      const h = await jalankanVerify({ perbaruiGolden: true });
      expect(h.alatGagal, h.alatGagal.join("\n")).toEqual([]);
      expect(h.temuan, h.temuan.join("\n")).toEqual([]);
      // Dibandingkan lawan isi ASLI yang disimpan di kasus sebelumnya: itu membuktikan
      // `--update-golden` menulis keluaran generator SUNGGUHAN, bukan sekadar berhenti mengeluh.
      expect(readFileSync(GOLDEN_DISABOTASE, "utf8")).toBe(isiAsli);
    },
    BATAS,
  );

  // Tanpa `--update-golden`, verify TIDAK BOLEH menulis apa pun di luar direktori sementaranya —
  // "dry-run adalah default" berlaku untuk tiap subperintah yang bisa menulis berkas. Kasus ini
  // sengaja TERAKHIR, sesudah kasus sabotase memulihkan berkasnya: ia mengukur pohon kerja apa
  // adanya, jadi ia hanya bermakna kalau semua kasus di atasnya sudah rapi.
  it("tidak meninggalkan perubahan tak ter-commit di tooling/testdata", () => {
    expect(
      statusTestdata(),
      "tooling/testdata berubah sesudah verify berjalan tanpa --update-golden",
    ).toBe(STATUS_AWAL);
  });
});

describe("pemindai kata Indonesia (tahap dwibahasa)", () => {
  // Kalimat PERSIS yang melahirkan seluruh tahap 5 (Task 10): struktur katalognya sempurna —
  // kunci sama, nama variabel sama — tapi NILAI variabelnya berbahasa Indonesia, jadi kalimat
  // Inggrisnya campur. Paritas kunci dan paritas nama variabel keduanya HIJAU untuk baris ini.
  it("menangkap nilai berbahasa Indonesia yang disuntik ke kalimat Inggris", () => {
    expect(kataIndonesiaPertama("nullable request bodies NAIK to 1")).toBe("NAIK");
  });

  // Sisi lain dari batas yang sama, dan ia menentukan apakah pemeriksaan ini akan tetap dipakai:
  // fixture ini bernama `contoh`, permission-nya bernama Indonesia, dan kontraknya menulis
  // deskripsi Indonesia. Semua itu DATA. Gate yang memerahkan data pemakai adalah gate yang orang
  // matikan ([[G-06]]).
  it("tidak memerahkan identitas domain berbahasa Indonesia di keluaran Inggris", () => {
    for (const baris of [
      "gen-wiring: contoh -> contoh (3 operation(s), 0 public, 6 shared alias(es))",
      "contract-permissions OK — 3 operation(s) checked, 2 permission(s) (0 legacy).",
      "  repository_tenancy_test.contoh.md: 48 line(s) (cross-tenant checklist — COPY it into a real test)",
      "permission constants: 2 entries.",
    ]) {
      expect(kataIndonesiaPertama(baris), baris).toBeNull();
    }
  });
});

describe("pendaftaran di CLI", () => {
  it("slot verify tidak lagi null — memanggilnya menjalankan pemeriksaan, bukan keluar 3", () => {
    expect(SUBCOMMANDS["verify"]).not.toBeNull();
    expect(typeof SUBCOMMANDS["verify"]).toBe("function");
  });
});
