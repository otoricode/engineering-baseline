import { readFile } from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { KUNCI_KONTRAK } from "./pesan.js";

/**
 * Dua arah, dan arah keduanya yang biasanya hilang ([[G-05]]): kunci yang DIPAKAI harus ada di
 * katalog, DAN kunci `kontrak.*` di katalog harus dipakai. Tanpa arah kedua, kunci yang skripnya
 * sudah dihapus menumpuk di kedua berkas bahasa selamanya, dan pembaca berikutnya tidak bisa
 * membedakan pesan yang hidup dari puing.
 */
async function katalog(bahasa: "id" | "en"): Promise<Record<string, string>> {
  return JSON.parse(await readFile(`tooling/messages/${bahasa}.json`, "utf8")) as Record<string, string>;
}

describe("kunci pesan skrip kontrak", () => {
  it("tiap kunci yang dipakai ada di katalog id DAN en", async () => {
    const id = await katalog("id");
    const en = await katalog("en");
    const hilangId = KUNCI_KONTRAK.filter((k) => !(k in id));
    const hilangEn = KUNCI_KONTRAK.filter((k) => !(k in en));
    expect(hilangId, "dipakai tapi tidak ada di id.json").toEqual([]);
    expect(hilangEn, "dipakai tapi tidak ada di en.json").toEqual([]);
  });

  it("tiap kunci kontrak.* di katalog benar-benar terdaftar sebagai dipakai", async () => {
    const id = await katalog("id");
    const daftar = new Set<string>(KUNCI_KONTRAK);
    const yatim = Object.keys(id).filter((k) => k.startsWith("kontrak.") && !daftar.has(k));
    expect(yatim, "ada di katalog tapi tidak terdaftar di KUNCI_KONTRAK").toEqual([]);
  });

  // Paritas nama variabel diperiksa untuk SELURUH katalog di `src/messages/index.test.ts`. Yang
  // diperiksa di sini lebih sempit dan tidak tertutup di sana: sebuah pesan yang templatnya TIDAK
  // punya variabel sama sekali padahal namanya menjanjikan konteks (mis. `...gagal` yang tidak
  // menyebut apa pun) akan lolos semua pemeriksaan lain sambil tetap jadi vonis generik yang
  // [[G-04]] larang. Yang bisa dimesinkan hanyalah setengahnya: pesan temuan per-artefak WAJIB
  // punya sekurang-kurangnya satu variabel.
  it("pesan temuan per-artefak membawa sekurang-kurangnya satu variabel", async () => {
    const id = await katalog("id");
    // Kunci yang memang TIDAK menunjuk artefak, dan alasannya masing-masing: judul bagian laporan,
    // baris pemakaian, dan kalimat penjelas yang menyertai temuan lain yang sudah menunjuk.
    const tanpaArtefak = new Set([
      // Pemberitahuan LEWATAN, bukan temuan: artefak yang biasanya ia sebut — direktori feature —
      // adalah persis yang TIDAK ADA di proyek contract-only. Menyuntikkan variabel di sini berarti
      // mengarang jalur untuk sesuatu yang tak pernah dirakit; kalimatnya justru menyebut kunci
      // config yang kosong, dan itu satu-satunya "tempat" yang benar untuk ditunjuk.
      "kontrak.rute.lewat_backend",
      "kontrak.permission.skema_keamanan_hilang", // artefaknya berkas config global, disebut di teks
      "kontrak.penerap.pemakaian",
      "kontrak.penerap.tidak_menulis",
      "kontrak.gen.pemakaian_wiring",
      "kontrak.deref.pemakaian",
      "kontrak.deref.identik",
      "kontrak.bootstrap.judul_domain_telanjang",
      "kontrak.bootstrap.judul_lintas_status",
      "kontrak.bootstrap.judul_hanya_test",
      "kontrak.sample.base_url_kosong",
      "kontrak.komentar.permission_semua",
      "kontrak.komentar.permission_parse",
      "kontrak.komentar.error_code_semua",
      "kontrak.komentar.error_code_parse",
      "kontrak.komentar.shared_spec_deskripsi",
      "kontrak.komentar.spec_by_route",
      "kontrak.komentar.public_routes",
      "kontrak.komentar.v2_paths",
      "kontrak.komentar.public_ops",
      "kontrak.komentar.guard_by_operation",
      "kontrak.komentar.content_by_operation",
      "kontrak.komentar.mount",
      "kontrak.komentar.shared_berkas",
    ]);
    const gundul = KUNCI_KONTRAK.filter(
      (k) => !tanpaArtefak.has(k) && !/\{\w+\}/.test(id[k] ?? ""),
    );
    expect(gundul, "pesan tanpa satu pun variabel — vonis generik").toEqual([]);
  });
});
