/**
 * Kontrak paket platform di `INSTALL.md` §6 — yang bisa diikat, diikat di sini.
 *
 * # Batas yang berkas ini TIDAK bisa lewati, dan kenapa ia tetap ada
 *
 * Kolom **Kewajiban** memuat kalimat paling menanggung-beban di seluruh paket ini —
 * `found == false` WAJIB menolak — dan kalimat itu tidak bisa diverifikasi mesin dari sini:
 * pelaksananya adalah paket `guard` yang justru belum ditulis konsumen. Yang bisa diverifikasi ada
 * tiga, dan ketiganya di bawah:
 *
 *   1. dokumennya MENYATAKAN batas itu, alih-alih membiarkan pembaca mengira kolomnya terjaga;
 *   2. tiap simbol punya kewajiban TERTULIS (kehadirannya, bukan isinya — lihat `tanpaKeterangan`
 *      di `origin-scan.ts`, dan `verify` tahap 6 yang melaporkannya);
 *   3. separuh kewajiban `Allow` yang jejaknya ADA di paket ini: generator wajib benar-benar
 *      MENYERAHKAN sinyal "tidak ditemukan" ke `guard.Allow`. Kalau ia berhenti meneruskannya,
 *      `guard` sepatuh apa pun tidak punya apa-apa untuk ditolak, dan kewajiban itu jadi mustahil
 *      dipenuhi dari sisi konsumen.
 *
 * Butir 3 memang juga terpaku golden, tapi golden adalah perbandingan SELURUH berkas: ia merah
 * untuk perubahan apa pun dan diam untuk niat apa pun. Yang dituntut di sini dinamai, jadi orang
 * yang menjalankan `--update-golden` untuk membuat merahnya hilang tetap bertemu asersi ini.
 */
import { readFile } from "node:fs/promises";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { akarPaket } from "../paket.js";
import { bacaInventarisInstall, PAKET_PLATFORM } from "./origin-scan.js";

const bacaInstall = (): Promise<string> => readFile(path.join(akarPaket(), "INSTALL.md"), "utf8");

describe("INSTALL.md §6 menyatakan batas penjagaannya", () => {
  it("menyebut ketiga kolom beserta apa yang menjaganya", async () => {
    const isi = await bacaInstall();
    // Bagian ini ada supaya pembaca tahu kolom mana yang dijaga mesin dan kolom mana yang
    // bergantung pada dirinya sendiri. Tanpanya, ketiganya terbaca sama meyakinkannya.
    expect(isi).toContain("Kolom mana yang dijaga mesin, dan kolom mana yang tidak");
    expect(isi).toContain("**Bentuk** (tanda tangan Go)");
    expect(isi).toContain("**Kewajiban**");
    expect(isi).toContain("`found == false` WAJIB menolak");
  });

  it("tiap simbol di keempat tabel punya kewajiban TERTULIS", async () => {
    const inv = await bacaInventarisInstall(akarPaket());
    expect(inv).not.toBeNull();
    for (const pkg of PAKET_PLATFORM) {
      const blok = inv!.blok.get(`platform:${pkg}`);
      expect(blok, pkg).toBeDefined();
      expect(blok!.tanpaKeterangan, pkg).toEqual([]);
      expect(blok!.entri.length, pkg).toBeGreaterThan(0);
    }
  });
});

/**
 * Separuh kewajiban `Allow` yang punya jejak di paket ini.
 *
 * `guard.Allow(c, spec, found)` — argumen ketiga adalah hasil pencarian di peta rute. Generator
 * yang memanggilnya sebagai `guard.Allow(c, spec)` menghapus satu-satunya cara `guard` mengetahui
 * bahwa sebuah operasi TIDAK ADA di peta, dan operasi yang tidak ada di peta adalah operasi yang
 * belum diputuskan — bukan operasi yang bebas.
 */
describe("gen wiring menyerahkan sinyal \"tidak ditemukan\" ke guard", () => {
  const bacaGenWiring = (): Promise<string> =>
    readFile(path.join(akarPaket(), "tooling", "contract-scripts", "gen-wiring.ts"), "utf8");

  it("memancarkan pencarian peta berpasangan `spec, found`, lalu meneruskan keduanya", async () => {
    const isi = await bacaGenWiring();
    expect(isi).toContain("spec, found := SpecByOperation[opID]");
    expect(isi).toContain("guard.Allow(c, spec, found)");
  });

  it("keluaran golden benar-benar memuat panggilan itu, bukan cuma sumbernya", async () => {
    const wiring = await readFile(
      path.join(
        akarPaket(),
        "tooling/testdata/golden/apps/api/internal/gen/contoh/wiring.gen.go",
      ),
      "utf8",
    );
    expect(wiring).toContain("guard.Allow(c, spec, found)");
  });

  // Rute PUBLIK melewati guard lebih awal (`publicOps`), dan itu satu-satunya jalan pintas yang
  // sah. Diikat supaya jalan pintas kedua tidak lahir tanpa terlihat: kalau `publicOps` berhenti
  // jadi satu-satunya cabang yang mengembalikan `f(c, request)` sebelum `Allow`, asersi ini merah.
  it("satu-satunya jalan melewati Allow adalah daftar operasi publik", async () => {
    const isi = await bacaGenWiring();
    const mulai = isi.indexOf("func guardByOperation");
    const cabangAllow = isi.indexOf("if !guard.Allow(c, spec, found)");
    expect(mulai, "guardByOperation tidak ditemukan").toBeGreaterThan(-1);
    expect(cabangAllow, "cabang penolakan Allow tidak ditemukan").toBeGreaterThan(mulai);
    // Potongan SEBELUM cabang penolakan: tepat satu cabang, dan cabang itu daftar operasi publik.
    // Cabang kedua di sini adalah jalan pintas otorisasi baru, dan ia lahir tanpa terlihat.
    const sebelum = isi.slice(mulai, cabangAllow);
    expect(sebelum).toContain("if publicOps[opID] {");
    expect(sebelum.match(/if /g) ?? []).toHaveLength(1);
  });
});
