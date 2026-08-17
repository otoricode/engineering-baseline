/**
 * Bukti bahwa `gate:contract-lint` benar-benar MENGGIGIT lewat permukaan yang proyek target pakai
 * ([[C-05]], [[G-06]]).
 *
 * Uji unit di `lib/requestUnion.test.ts` membuktikan predikatnya benar. Yang dibuktikan di sini
 * adalah bahwa predikat itu terpasang di jalur yang dijalankan: daftar langkah `standard gate`,
 * pembacaan config proyek, letak bundel, kode keluar, dan sitiran ID aturannya di pesan gagal.
 * Pemeriksaan yang hanya hidup di satu tempat tidak ikut terbawa.
 */
import { execFile } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { afterAll, describe, expect, it } from "vitest";
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

const BADAN_UNION = `openapi: 3.0.3
info: { title: contoh, version: "1.0.0" }
paths:
  /pub:
    post:
      operationId: postPub
      requestBody:
        content:
          application/json:
            schema:
              oneOf:
                - type: object
                  properties: { judul: { type: string } }
                - type: object
                  properties: { isi: { type: string } }
      responses:
        "200": { description: ok }
`;

const BADAN_TUNGGAL = `openapi: 3.0.3
info: { title: contoh, version: "1.0.0" }
paths:
  /pub/berita:
    post:
      operationId: postPubBerita
      requestBody:
        content:
          application/json:
            schema:
              type: object
              properties: { judul: { type: string } }
      responses:
        "200": { description: ok }
`;

/** Proyek mini: config sungguhan (dari contoh paket ini) + satu berkas bundel. */
function buatProyek(bundel: string): string {
  const akar = daftarkan(mkdtempSync(path.join(tmpdir(), "eb-lint-")));
  const config = JSON.parse(
    readFileSync(path.join(asal, "tooling/config.example.json"), "utf8"),
  ) as { layout: { contractDir: string }; contract: { bundle: string } };
  writeFileSync(path.join(akar, "standard.config.json"), JSON.stringify(config));
  const jalurBundel = path.join(akar, config.layout.contractDir, config.contract.bundle);
  mkdirSync(path.dirname(jalurBundel), { recursive: true });
  writeFileSync(jalurBundel, bundel);
  return akar;
}

async function gate(akar: string): Promise<{ kode: number; keluaran: string }> {
  try {
    const { stdout, stderr } = await jalankan(
      path.join(asal, "bin/standard"),
      ["gate", "--only", "contract-lint"],
      { cwd: akar },
    );
    return { kode: 0, keluaran: stdout + stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { kode: err.code ?? -1, keluaran: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

describe("gate:contract-lint lewat standard gate", () => {
  it("badan permintaan berbentuk union = MERAH, menyebut operasinya dan ID aturannya", async () => {
    const akar = buatProyek(BADAN_UNION);
    const { kode, keluaran } = await gate(akar);
    expect(kode).toBe(1);
    expect(keluaran).toContain("POST /pub");
    expect(keluaran).toContain("oneOf");
    expect(keluaran).toContain("C-05");
  });

  it("badan permintaan bentuk tunggal = HIJAU, dan hitungannya disebut", async () => {
    const akar = buatProyek(BADAN_TUNGGAL);
    const { kode, keluaran } = await gate(akar);
    expect(kode, keluaran).toBe(0);
    // Hijau yang menyebut berapa yang diperiksa — hijau tanpa angka tidak bisa dibedakan dari
    // gate yang membaca nol badan permintaan ([[G-05]]).
    expect(keluaran).toMatch(/1/);
  });
});
