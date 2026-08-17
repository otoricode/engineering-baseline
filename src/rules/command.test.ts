import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { rulesLint } from "./command.js";

let dirSementara: string | null = null;

afterEach(async () => {
  if (dirSementara !== null) {
    await rm(dirSementara, { recursive: true, force: true });
    dirSementara = null;
  }
});

describe("rulesLint", () => {
  it("direktori tak terbaca: keluar 2", async () => {
    const keluaran: string[] = [];
    const kode = await rulesLint(["/jalur/tidak/ada/direktori-begini"], (baris) => keluaran.push(baris));
    expect(kode).toBe(2);
  });

  // Temuan fix-round-1 #4: direktori yang terbaca tapi nol aturan terparse
  // BUKAN keberhasilan (mis. salah menunjuk folder saat memasang paket ini di
  // proyek lain) — harus dilaporkan dan keluar bukan-nol, bukan diam-diam 0.
  it("direktori terbaca tapi kosong: keluar bukan-nol dan menyebut direktorinya", async () => {
    dirSementara = await mkdtemp(path.join(tmpdir(), "rules-lint-kosong-"));
    const keluaran: string[] = [];
    const kode = await rulesLint([dirSementara], (baris) => keluaran.push(baris));
    expect(kode).not.toBe(0);
    expect(keluaran.join("\n")).toContain(dirSementara);
  });

  it("direktori sehat berisi satu aturan valid: keluar 0", async () => {
    dirSementara = await mkdtemp(path.join(tmpdir(), "rules-lint-sehat-"));
    await writeFile(
      path.join(dirSementara, "A-contoh.md"),
      "# A — Contoh\n\n## A-01 · Judul\n\n**Ditegakkan oleh:** `gate:x (konsumen)`\n\n" +
        "**Aturan.** ok.\n\n**Mengapa.** Kegagalan konkret yang melahirkannya.\n\n" +
        "**Cara memverifikasi.** Langkah yang bisa dijalankan.\n",
      "utf8",
    );
    const keluaran: string[] = [];
    const kode = await rulesLint([dirSementara], (baris) => keluaran.push(baris));
    expect(kode).toBe(0);
  });

  // Temuan fix-round-4 C1, mutasi pengulas dijalankan lewat GATE-nya, bukan lewat
  // suite: kelengkapan prosa dulu hanya diperiksa `inventaris.test.ts`, yang tidak
  // portabel (`WAJIB` memaku ID milik paket ini). Di setiap salinan yang dipasang di
  // proyek lain, satu-satunya pemeriksaan mesin atas syarat inti seluruh lapis aturan
  // karena itu TIDAK berjalan sama sekali — `rules-lint` melaporkan hijau.
  it("aturan tanpa Mengapa: keluar bukan-nol dan menyebut bagian yang hilang", async () => {
    dirSementara = await mkdtemp(path.join(tmpdir(), "rules-lint-tanpa-mengapa-"));
    await writeFile(
      path.join(dirSementara, "A-contoh.md"),
      "# A — Contoh\n\n## A-01 · Judul\n\n**Ditegakkan oleh:** `gate:x (konsumen)`\n\n" +
        "**Aturan.** ok.\n\n**Cara memverifikasi.** Langkah yang bisa dijalankan.\n",
      "utf8",
    );
    const keluaran: string[] = [];
    const kode = await rulesLint([dirSementara], (baris) => keluaran.push(baris));
    expect(kode).not.toBe(0);
    expect(keluaran.join("\n")).toContain("**Mengapa.**");
    expect(keluaran.join("\n")).toContain("A-01");
  });
});

describe("rulesLint: README.md dikecualikan, tapi tidak tanpa penjaga", () => {
  const ATURAN_SEHAT =
    "# A — Contoh\n\n## A-01 · Aturan yang terlihat\n\n**Ditegakkan oleh:** `gate:a (konsumen)`\n\n" +
    "**Aturan.** Isi.\n\n**Mengapa.** Kegagalan konkret.\n\n**Cara memverifikasi.** Langkahnya.\n";

  // Repro pengulas, hidup sejak ronde 3 dan baru ditutup di ronde 5: aturan yang
  // ditaruh di README lenyap dari pemindaian TANPA satu pun sinyal. Di paket ini
  // daftar ID di inventaris.test.ts menutupinya secara KEBETULAN; proyek target yang
  // menyalin paket ini tidak punya padanannya, jadi di sana lubangnya terbuka penuh.
  it("README yang memuat judul aturan: keluar bukan-nol dan menyebut ID-nya", async () => {
    dirSementara = await mkdtemp(path.join(tmpdir(), "rules-lint-readme-beraturan-"));
    await writeFile(path.join(dirSementara, "A-contoh.md"), ATURAN_SEHAT, "utf8");
    await writeFile(
      path.join(dirSementara, "README.md"),
      "# README\n\n## A-02 · Aturan yang DISEMBUNYIKAN di README\n\nTanpa penegak. Tanpa Mengapa.\n",
      "utf8",
    );
    const keluaran: string[] = [];
    const kode = await rulesLint([dirSementara], (baris) => keluaran.push(baris));
    expect(kode).not.toBe(0);
    expect(keluaran.join("\n")).toContain("A-02");
    expect(keluaran.join("\n")).toContain("dikecualikan dari pemindaian aturan");
  });

  // Arah sebaliknya, dan tiap ronde membuktikan arah inilah yang lebih sering
  // terlewat: README yang WAJAR memuat contoh format ber-fence, tabel prefix, dan
  // heading biasa — semuanya harus tetap LOLOS.
  it("README wajar berisi contoh format ber-fence: keluar 0", async () => {
    dirSementara = await mkdtemp(path.join(tmpdir(), "rules-lint-readme-wajar-"));
    await writeFile(path.join(dirSementara, "A-contoh.md"), ATURAN_SEHAT, "utf8");
    await writeFile(
      path.join(dirSementara, "README.md"),
      "# README\n\n## Format satu aturan\n\n" +
        "```md\n## C-01 · Envelope tunggal\n\n**Ditegakkan oleh:** `gate:contract-envelope`\n\n" +
        "**Aturan.** Apa yang wajib.\n```\n\n" +
        "| Prefix | Berkas |\n|---|---|\n| `S-` | `S-sumber-kebenaran.md` |\n\n" +
        "## Siklus hidup ID\n\nSekali terbit, ID tidak pernah dipakai ulang.\n",
      "utf8",
    );
    const keluaran: string[] = [];
    const kode = await rulesLint([dirSementara], (baris) => keluaran.push(baris));
    expect(kode, keluaran.join("\n")).toBe(0);
  });
});

/**
 * Fix round 1 Task 12, Important 2: sebelum ini, rujukan `[[ID]]` mati di `skills/**\/*.md`
 * (mis. `skills/tambah-endpoint/SKILL.md`) tidak pernah dipindai sama sekali — hanya README/
 * STANDARD/AGENTS. Diikat di sini dengan kedua arah: rujukan mati DILAPORKAN, rujukan hidup
 * TIDAK dilaporkan (arah kedua yang justru lebih sering terlewat, lihat test README wajar di
 * atas — bentuk yang sah tidak boleh ikut memerah).
 */
describe("rulesLint: skills/**/*.md ikut dipindai untuk rujukan [[ID]]", () => {
  const ATURAN_SEHAT =
    "# A — Contoh\n\n## A-01 · Aturan yang terlihat\n\n**Ditegakkan oleh:** `gate:a (konsumen)`\n\n" +
    "**Aturan.** Isi.\n\n**Mengapa.** Kegagalan konkret.\n\n**Cara memverifikasi.** Langkahnya.\n";

  it("SKILL.md di subfolder skill merujuk ID yang tidak ada: keluar bukan-nol dan menyebut jalurnya", async () => {
    dirSementara = await mkdtemp(path.join(tmpdir(), "rules-lint-skill-rujukan-mati-"));
    // "rules/" bersebelahan dengan "skills/" di akar — struktur yang sama dengan paket
    // sungguhan (lihat komentar DOKUMEN_PINTU_MASUK di command.ts).
    await mkdir(path.join(dirSementara, "rules"), { recursive: true });
    await writeFile(path.join(dirSementara, "rules", "A-contoh.md"), ATURAN_SEHAT, "utf8");
    await mkdir(path.join(dirSementara, "skills", "tambah-endpoint"), { recursive: true });
    await writeFile(
      path.join(dirSementara, "skills", "tambah-endpoint", "SKILL.md"),
      "# tambah-endpoint\n\nLihat [[X-99]] untuk detailnya.\n",
      "utf8",
    );
    const keluaran: string[] = [];
    const kode = await rulesLint([path.join(dirSementara, "rules")], (baris) => keluaran.push(baris));
    expect(kode).not.toBe(0);
    expect(keluaran.join("\n")).toContain("[[X-99]]");
    expect(keluaran.join("\n")).toContain(path.join("skills", "tambah-endpoint", "SKILL.md"));
  });

  it("SKILL.md di subfolder skill merujuk ID yang ADA: keluar 0 (bentuk sah tidak ikut memerah)", async () => {
    dirSementara = await mkdtemp(path.join(tmpdir(), "rules-lint-skill-rujukan-hidup-"));
    await mkdir(path.join(dirSementara, "rules"), { recursive: true });
    await writeFile(path.join(dirSementara, "rules", "A-contoh.md"), ATURAN_SEHAT, "utf8");
    await mkdir(path.join(dirSementara, "skills", "tambah-endpoint"), { recursive: true });
    await writeFile(
      path.join(dirSementara, "skills", "tambah-endpoint", "SKILL.md"),
      "# tambah-endpoint\n\nLihat [[A-01]] untuk detailnya, bukan menyalin klausanya.\n",
      "utf8",
    );
    const keluaran: string[] = [];
    const kode = await rulesLint([path.join(dirSementara, "rules")], (baris) => keluaran.push(baris));
    expect(kode, keluaran.join("\n")).toBe(0);
  });
});
