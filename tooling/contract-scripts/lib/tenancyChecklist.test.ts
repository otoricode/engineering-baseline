/**
 * Test gate daftar periksa penyewa ([[T-07]]).
 *
 * Yang diuji bukan "apakah fungsinya jalan" melainkan apakah ia MERAH pada keadaan yang persis
 * dilaporkan pengulas — `-freeze -apply` sungguhan yang meninggalkan berkas daftar periksa di
 * dalam modul beku — dan HIJAU pada bentuk yang benar. Keduanya wajib, karena gate yang memerahkan
 * bentuk yang benar akan dibuang orang ([[G-06]]).
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import {
  NAMA_CHECKLIST_TENANCY,
  bacaFitur,
  periksaChecklistTenancy,
  type FiturChecklist,
} from "./tenancyChecklist.js";
import { buatT } from "../pesan.js";
import { muatPesan } from "../../../src/messages/index.js";

const t = buatT(await muatPesan("id"));
const SITIR = "[T-07]";

// Uji yang menumpuk direktori di /tmp orang lain akan dimatikan orang itu — diukur di mesin
// pengulas: 18 direktori tertinggal, 16 MB, di disk yang 94% penuh.
const dirSementara: string[] = [];
afterAll(() => {
  for (const d of dirSementara) rmSync(d, { recursive: true, force: true });
});

const fitur = (dir: string, keadaan: FiturChecklist["keadaan"], adaChecklist: boolean): FiturChecklist => ({
  dir,
  keadaan,
  adaChecklist,
});

describe("periksaChecklistTenancy", () => {
  it("modul BEKU yang masih memuat berkas daftar periksa = MERAH, menyebut direktorinya", () => {
    const h = periksaChecklistTenancy([fitur("keluarga", "handWired", true)], t, SITIR);
    expect(h.temuan).toHaveLength(1);
    expect(h.temuan[0]).toContain("keluarga");
    expect(h.temuan[0]).toContain(NAMA_CHECKLIST_TENANCY);
    expect(h.temuan[0]).toContain(SITIR);
    expect(h.beku).toBe(1);
  });

  it("modul beku TANPA berkas itu = hijau — itu bentuk yang benar", () => {
    const h = periksaChecklistTenancy([fitur("keluarga", "handWired", false)], t, SITIR);
    expect(h.temuan).toEqual([]);
    expect(h.beku).toBe(1);
  });

  // Kontrol positif kedua, dan yang paling mudah salah: tagihannya BELUM jatuh tempo selama
  // modulnya masih tergenerate. Gate yang memerahkannya akan memerah di setiap modul yang baru
  // dibangkitkan — yaitu setiap pemakaian pertama alat ini.
  it("modul yang masih TERGENERATE boleh membawa berkasnya, dan itu disebut di hitungan", () => {
    const h = periksaChecklistTenancy([fitur("keluarga", "tergenerate", true)], t, SITIR);
    expect(h.temuan).toEqual([]);
    expect(h.beku).toBe(0);
    expect(h.tergenerateDenganChecklist).toBe(1);
  });

  it("modul SETENGAH beku yang masih memuat berkasnya = MERAH, dengan pesan yang berbeda", () => {
    const h = periksaChecklistTenancy([fitur("penduduk", "campuran", true)], t, SITIR);
    expect(h.temuan).toHaveLength(1);
    expect(h.temuan[0]).toContain("penduduk");
    // Pesan campuran menyuruh MENYELESAIKAN pembekuannya lebih dulu; pesan beku tidak. Keduanya
    // dibedakan karena tindakannya berbeda — satu pesan bervariabel keadaan akan menyuruh pembaca
    // menebak mana dari dua yang dimaksud.
    expect(h.temuan[0]).not.toBe(
      periksaChecklistTenancy([fitur("penduduk", "handWired", true)], t, SITIR).temuan[0],
    );
  });

  it("direktori kosong tidak dihitung sebagai modul beku", () => {
    const h = periksaChecklistTenancy([fitur("baru", "kosong", true)], t, SITIR);
    expect(h.temuan).toEqual([]);
    expect(h.beku).toBe(0);
  });
});

describe("bacaFitur", () => {
  it("membaca keadaan beku + kehadiran berkas dari DISK, bukan dari daftar", () => {
    const akar = mkdtempSync(path.join(tmpdir(), "eb-checklist-"));
    dirSementara.push(akar);
    // `beku`: berkas kerangka tanpa sufiks generated, plus daftar periksanya yang tertinggal —
    // persis keadaan sesudah `genmodule -freeze -apply` yang pengulas ukur.
    mkdirSync(path.join(akar, "beku"));
    writeFileSync(path.join(akar, "beku", "repository.go"), "package beku\n");
    writeFileSync(path.join(akar, "beku", NAMA_CHECKLIST_TENANCY), "# daftar periksa\n");
    mkdirSync(path.join(akar, "segar"));
    writeFileSync(path.join(akar, "segar", "repository.gen.go"), "package segar\n");
    writeFileSync(path.join(akar, "segar", NAMA_CHECKLIST_TENANCY), "# daftar periksa\n");

    const hasil = bacaFitur(akar, ".gen.go");
    expect(hasil.find((f) => f.dir === "beku")).toEqual({
      dir: "beku",
      keadaan: "handWired",
      adaChecklist: true,
    });
    expect(hasil.find((f) => f.dir === "segar")).toEqual({
      dir: "segar",
      keadaan: "tergenerate",
      adaChecklist: true,
    });
    expect(periksaChecklistTenancy(hasil, t, SITIR).temuan).toHaveLength(1);
  });
});

/**
 * Nama berkasnya dipaku di DUA bahasa: konstanta Go `namaChecklistTenancy` yang MENULIS berkasnya,
 * dan konstanta TypeScript di atas yang MENCARINYA. Tanpa test ini, mengganti namanya di satu sisi
 * membuat gate ini mencari berkas yang tidak pernah ada lagi — dan gate yang mencari berkas yang
 * salah selalu hijau, di setiap proyek, tanpa satu pun sinyal.
 */
describe("paritas nama berkas lintas-bahasa", () => {
  it("konstanta TypeScript sama persis dengan namaChecklistTenancy di genmodule", async () => {
    const src = await readFile("tooling/genmodule/main.go", "utf8");
    const cocok = /namaChecklistTenancy\s*=\s*"([^"]+)"/.exec(src);
    expect(cocok, "konstanta namaChecklistTenancy tidak ditemukan di genmodule/main.go").not.toBeNull();
    expect(cocok![1]).toBe(NAMA_CHECKLIST_TENANCY);
  });
});
