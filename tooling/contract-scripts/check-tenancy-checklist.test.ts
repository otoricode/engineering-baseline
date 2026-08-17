/**
 * Bukti sabotase untuk `gate:tenancy-checklist` ([[T-07]], [[G-06]]) — dijalankan LEWAT permukaan
 * yang proyek target pakai (`standard gate --only tenancy-checklist`), bukan dengan memanggil
 * fungsinya langsung.
 *
 * Perbedaan itu yang membuat berkas ini ada di samping `lib/tenancyChecklist.test.ts`: uji unit
 * membuktikan predikatnya benar, uji ini membuktikan predikat itu benar-benar TERPASANG di jalur
 * yang dipakai — daftar langkah, pemilihan `--only`, cwd proyek, pembacaan config, dan kode keluar.
 * Pemeriksaan yang hanya hidup di satu tempat tidak ikut terbawa.
 *
 * Empat keadaan, dan dua di antaranya harus HIJAU: gate yang memerahkan bentuk yang benar akan
 * dibuang orang, lalu merah berikutnya diabaikan juga.
 */
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
import { NAMA_CHECKLIST_TENANCY } from "./lib/tenancyChecklist.js";
import { akarPaket } from "../../src/paket.js";

const jalankan = promisify(execFile);
const asal = akarPaket();

// Dibersihkan lewat afterAll, BUKAN di akhir tiap kasus: pembersihan di akhir kasus tidak
// pernah berjalan untuk kasus yang GAGAL — yaitu tepat lari yang paling sering diulang.
const dirSementara: string[] = [];
const daftarkan = (d: string): string => (dirSementara.push(d), d);
afterAll(() => {
  for (const d of dirSementara) rmSync(d, { recursive: true, force: true });
});

/** Proyek mini: config sungguhan + pohon feature yang keadaannya diatur per kasus. */
function buatProyek(): { akar: string; dirFitur: string } {
  const akar = daftarkan(mkdtempSync(path.join(tmpdir(), "eb-tenancy-")));
  // Config contoh paket ini dipakai apa adanya supaya uji ini tidak diam-diam menguji layout
  // karangan sendiri: layout yang dipakai di sini persis yang `INSTALL.md` suruh salin.
  const config = JSON.parse(
    readFileSync(path.join(asal, "tooling/config.example.json"), "utf8"),
  ) as { layout: { backendDir: string }; go: { featureDir: string } };
  writeFileSync(path.join(akar, "standard.config.json"), JSON.stringify(config));
  const dirFitur = path.join(akar, config.layout.backendDir, config.go.featureDir);
  mkdirSync(dirFitur, { recursive: true });
  return { akar, dirFitur };
}

function modul(dirFitur: string, nama: string, berkas: Record<string, string>): string {
  const dir = path.join(dirFitur, nama);
  mkdirSync(dir, { recursive: true });
  for (const [n, isi] of Object.entries(berkas)) writeFileSync(path.join(dir, n), isi);
  return dir;
}

async function gate(akar: string): Promise<{ kode: number; keluaran: string }> {
  try {
    const { stdout, stderr } = await jalankan(
      path.join(asal, "bin/standard"),
      ["gate", "--only", "tenancy-checklist"],
      { cwd: akar },
    );
    return { kode: 0, keluaran: stdout + stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { kode: err.code ?? -1, keluaran: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

describe("gate:tenancy-checklist lewat standard gate", () => {
  it("modul BEKU yang masih membawa daftar periksa = MERAH, menyebut modulnya dan ID aturannya", async () => {
    const { akar, dirFitur } = buatProyek();
    modul(dirFitur, "keluarga", {
      "repository.go": "package keluarga\n",
      [NAMA_CHECKLIST_TENANCY]: "# daftar periksa penyewa\n",
    });
    const { kode, keluaran } = await gate(akar);
    expect(kode).toBe(1);
    expect(keluaran).toContain("keluarga");
    expect(keluaran).toContain(NAMA_CHECKLIST_TENANCY);
    expect(keluaran).toContain("T-07");
  });

  it("modul beku TANPA daftar periksa = HIJAU", async () => {
    const { akar, dirFitur } = buatProyek();
    modul(dirFitur, "keluarga", { "repository.go": "package keluarga\n" });
    const { kode, keluaran } = await gate(akar);
    expect(kode, keluaran).toBe(0);
  });

  it("modul yang masih TERGENERATE boleh membawa daftar periksanya = HIJAU", async () => {
    const { akar, dirFitur } = buatProyek();
    modul(dirFitur, "keluarga", {
      "repository.gen.go": "package keluarga\n",
      [NAMA_CHECKLIST_TENANCY]: "# daftar periksa penyewa\n",
    });
    const { kode, keluaran } = await gate(akar);
    expect(kode, keluaran).toBe(0);
  });

  // Semesta kosong: direktori feature yang tidak ada sama sekali. Hijau di sini akan terbaca sama
  // dengan "setiap modul bersih", padahal nol modul dibaca ([[G-05]]).
  it("direktori feature yang tidak ada = kegagalan ALAT (2), bukan hijau", async () => {
    const { akar, dirFitur } = buatProyek();
    rmSync(dirFitur, { recursive: true, force: true });
    const { kode, keluaran } = await gate(akar);
    expect(kode).toBe(2);
    expect(keluaran).toContain(dirFitur);
  });
});
