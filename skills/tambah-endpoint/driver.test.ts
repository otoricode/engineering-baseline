import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";

const jalankan = promisify(execFile);

const AKAR_PAKET = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const DRIVER = path.join(AKAR_PAKET, "skills", "tambah-endpoint", "driver.sh");

describe("driver.sh", () => {
  it("menolak langkah tak dikenal dengan kode 2", async () => {
    await expect(
      jalankan("bash", ["skills/tambah-endpoint/driver.sh", "terbang"]),
    ).rejects.toMatchObject({ code: 2 });
  });

  it("mencetak urutan langkah pada --help", async () => {
    const { stdout } = await jalankan("bash", ["skills/tambah-endpoint/driver.sh", "--help"]);
    for (const langkah of ["bundle", "gen", "scaffold", "freeze", "gate"]) {
      expect(stdout).toContain(langkah);
    }
  });

  it("tidak memanggil biner alat secara langsung", async () => {
    const { readFile } = await import("node:fs/promises");
    const isi = await readFile("skills/tambah-endpoint/driver.sh", "utf8");
    expect(isi).not.toMatch(/go run \.\/gen/);
    expect(isi).not.toMatch(/tsx scripts\//);
  });
});

/**
 * Kontrak kode keluar (lihat komentar header `driver.sh`): 0 lulus, 1 = pemeriksaan berjalan dan
 * menemukan pelanggaran, 2 = ALATNYA sendiri gagal — pemeriksaan tidak berjalan sama sekali.
 * Driver ini konsumen PERTAMA yang mengambil keputusan dari pemisahan itu, jadi diikat di sini
 * dengan bukti mekanis, bukan cuma dinyatakan di prosa SKILL.md.
 *
 * Direktori sementara dibersihkan di `afterAll` (bukan di akhir tiap `it`) supaya tetap bersih
 * kalau salah satu kasus gagal di tengah jalan.
 */
describe("driver.sh — kode keluar 1 (pelanggaran) vs 2 (alat gagal)", () => {
  const dirSementara: string[] = [];

  afterAll(async () => {
    await Promise.all(dirSementara.map((d) => rm(d, { recursive: true, force: true })));
  });

  async function buatDirSementara(prefix: string): Promise<string> {
    const d = await mkdtemp(path.join(tmpdir(), prefix));
    dirSementara.push(d);
    return d;
  }

  it("langkah bundle: PERINTAH_BUNDLE yang gagal dijalankan keluar 2 (alat gagal)", async () => {
    const cwd = await buatDirSementara("driver-bundle-alat-gagal-");
    await expect(
      jalankan("bash", [DRIVER, "bundle"], {
        cwd,
        env: { ...process.env, PERINTAH_BUNDLE: "false" },
      }),
    ).rejects.toMatchObject({ code: 2 });
  });

  // Fix round 1, Important 1: draf sebelumnya menyamakan "git diff --exit-code apa pun selain 0"
  // dengan "bundel basi" (kode 1) — jadi git yang GAGAL JALAN (bukan direktori git) ikut
  // dilaporkan sebagai bundel basi dengan saran "commit ulang", padahal tidak ada yang
  // dibandingkan sama sekali. Diikat di sini: PERINTAH_BUNDLE-nya sendiri BERHASIL (beda dari
  // kasus "PERINTAH_BUNDLE gagal" di atas), tapi cwd BUKAN direktori git — kode WAJIB 2 (alat
  // gagal), bukan 1 (bundel basi), dan pesannya wajib menyebut "git", bukan "BASI".
  it("langkah bundle: cwd bukan direktori git keluar 2 (git gagal), BUKAN 1 (bundel basi)", async () => {
    const cwd = await buatDirSementara("driver-bundle-bukan-git-");
    await writeFile(path.join(cwd, "regen.sh"), "#!/bin/sh\necho ok > bundel.txt\n");
    let ditolak: { code?: number; stderr?: string } | undefined;
    try {
      await jalankan("bash", [DRIVER, "bundle"], {
        cwd,
        env: { ...process.env, PERINTAH_BUNDLE: "sh regen.sh" },
      });
    } catch (e) {
      ditolak = e as { code?: number; stderr?: string };
    }
    expect(ditolak?.code).toBe(2);
    expect(ditolak?.stderr ?? "").not.toContain("BASI");
    expect(ditolak?.stderr ?? "").toContain("git");
  });

  it("langkah bundle: regenerasi menghasilkan diff keluar 1 (bundel basi), beda dari alat gagal", async () => {
    const cwd = await buatDirSementara("driver-bundle-basi-");
    const gitOpt = ["-c", "user.email=t@t.local", "-c", "user.name=t"];
    await jalankan("git", [...gitOpt, "init", "-q"], { cwd });
    await writeFile(path.join(cwd, "bundel.txt"), "versi-lama\n");
    await jalankan("git", [...gitOpt, "add", "-A"], { cwd });
    await jalankan("git", [...gitOpt, "commit", "-q", "-m", "awal"], { cwd });
    // Skrip terpisah (bukan `sh -c "..."` lewat env var) supaya tidak ada kutip bersarang yang
    // rusak saat env var diteruskan lewat word-splitting `$PERINTAH_BUNDLE` di driver.sh.
    await writeFile(path.join(cwd, "regen.sh"), "#!/bin/sh\necho versi-baru > bundel.txt\n");

    // PERINTAH_BUNDLE di sini mensimulasikan regenerasi yang menghasilkan bundel BERBEDA dari
    // yang ter-commit — persis kelas kegagalan yang langkah "bundle" wajib tangkap.
    await expect(
      jalankan("bash", [DRIVER, "bundle"], {
        cwd,
        env: { ...process.env, PERINTAH_BUNDLE: "sh regen.sh" },
      }),
    ).rejects.toMatchObject({ code: 1 });
  });

  it("langkah bundle: regenerasi TANPA diff keluar 0", async () => {
    const cwd = await buatDirSementara("driver-bundle-bersih-");
    const gitOpt = ["-c", "user.email=t@t.local", "-c", "user.name=t"];
    await jalankan("git", [...gitOpt, "init", "-q"], { cwd });
    await writeFile(path.join(cwd, "bundel.txt"), "versi-sama\n");
    await jalankan("git", [...gitOpt, "add", "-A"], { cwd });
    await jalankan("git", [...gitOpt, "commit", "-q", "-m", "awal"], { cwd });
    await writeFile(path.join(cwd, "regen.sh"), "#!/bin/sh\necho versi-sama > bundel.txt\n");

    // Menulis isi yang IDENTIK dengan yang sudah ter-commit — bukan bundel basi.
    await jalankan("bash", [DRIVER, "bundle"], {
      cwd,
      env: { ...process.env, PERINTAH_BUNDLE: "sh regen.sh" },
    });
  });

  it("langkah semua: berhenti di langkah merah PERTAMA (doctor) dan TIDAK melanjutkan ke bundle", async () => {
    const cwd = await buatDirSementara("driver-semua-berhenti-");
    // Tanpa standard.config.json di mana pun di atas direktori ini, "standard doctor" wajib
    // keluar 2 (config tak ditemukan) SEBELUM langkah "bundle" sempat dipanggil. PERINTAH_BUNDLE
    // di sini menulis penanda kalau-kalau ia sempat dijalankan — kalau penanda itu ADA sesudah
    // proses berakhir, driver TIDAK berhenti di langkah merah pertama.
    const penanda = path.join(cwd, "bundle-sempat-jalan");
    let kode: number | undefined;
    try {
      await jalankan("bash", [DRIVER, "semua"], {
        cwd,
        env: { ...process.env, PERINTAH_BUNDLE: `touch ${penanda}` },
      });
    } catch (e) {
      kode = (e as { code?: number }).code;
    }
    expect(kode).toBe(2);
    await expect(jalankan("test", ["-e", penanda])).rejects.toBeTruthy();
  });
});
