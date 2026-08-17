import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { DOKUMEN_PINTU_MASUK } from "./command.js";
import { lintRujukanDokumen } from "./lint.js";
import type { Rule } from "./parse.js";

const rule = (id: string): Rule => ({
  id, judul: "j", ditegakkanOleh: "gate:x", usang: null,
  berkas: "rules/X.md", baris: 1, rujukan: [],
});

describe("lintRujukanDokumen", () => {
  it("menerima dokumen yang hanya merujuk ID hidup", () => {
    const t = lintRujukanDokumen([{ berkas: "STANDARD.md", isi: "Lihat [[C-01]]." }], [rule("C-01")]);
    expect(t).toEqual([]);
  });

  it("menolak rujukan ke ID yang tidak ada", () => {
    const t = lintRujukanDokumen([{ berkas: "AGENTS.md", isi: "Lihat [[Z-99]]." }], [rule("C-01")]);
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("Z-99");
  });

  it("dokumen nyata di paket ini hanya merujuk ID hidup", async () => {
    const { parseRules } = await import("./parse.js");
    const { readdir } = await import("node:fs/promises");
    const path = await import("node:path");
    const nama = (await readdir("rules")).filter((n) => n.endsWith(".md") && n !== "README.md");
    const rules: Rule[] = [];
    for (const n of nama) {
      rules.push(...parseRules(await readFile(path.join("rules", n), "utf8"), n));
    }
    // Daftarnya DIIMPOR dari `rules-lint`, bukan ditulis ulang: uji ini memeriksa keempat pintu
    // masuk yang subperintahnya benar-benar pindai, jadi pintu masuk yang ditambahkan nanti ikut
    // terperiksa di sini tanpa ada yang harus ingat menyunting dua tempat.
    const dok = await Promise.all(
      DOKUMEN_PINTU_MASUK.map(async (b) => ({
        berkas: b, isi: await readFile(b, "utf8"),
      })),
    );
    expect(dok).toHaveLength(4);
    expect(lintRujukanDokumen(dok, rules)).toEqual([]);
  });

  // Fix round 1, butir 2: draf pertama TIDAK memakai `bersihkanFence`, jadi
  // sebuah dokumen yang CONTOH-kan sintaks [[ID]] di dalam blok markdown
  // ber-fence — bentuk yang paling mungkin muncul justru di README/STANDARD/
  // AGENTS, karena `rules/README.md` sendiri sudah melakukannya — dilaporkan
  // sebagai rujukan mati sungguhan. Repro persis dari review: blok ```md```
  // berisi "Lihat [[X-01]]" di STANDARD.md dulu membuat rules-lint MERAH.
  it("mengabaikan [[ID]] mati di dalam blok ber-fence (contoh format, bukan rujukan sungguhan)", () => {
    const isi = [
      "# STANDARD",
      "",
      "Begini cara menulis rujukan:",
      "",
      "```md",
      "Lihat [[X-01]].",
      "```",
      "",
    ].join("\n");
    const t = lintRujukanDokumen([{ berkas: "STANDARD.md", isi }], [rule("C-01")]);
    expect(t).toEqual([]);
  });

  // Arah sebaliknya harus tetap menyala: rujukan mati DI LUAR fence, di
  // dokumen yang juga punya fence di tempat lain, masih dilaporkan.
  it("tetap menolak [[ID]] mati di luar fence walau dokumennya juga punya fence lain", () => {
    const isi = ["# STANDARD", "", "```md", "contoh [[C-01]] sah", "```", "", "Rujukan nyata: [[Z-99]]."].join(
      "\n",
    );
    const t = lintRujukanDokumen([{ berkas: "STANDARD.md", isi }], [rule("C-01")]);
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("Z-99");
  });
});
