import { describe, expect, it } from "vitest";
import { extractPermissionCodesFromSource, isCanonicalPermissionName } from "./catalog.js";

// Di proyek asal, berkas ini juga memuat tiga blok yang memaku ISI katalog kode error milik
// proyek itu (kode domain AUTH_*, TERRITORY_*, PENDUDUK_*, beserta hitungannya). Ketiganya
// TIDAK ikut diangkat, dan bukan karena lupa: yang mereka uji adalah kontrak SATU proyek, bukan
// perilaku alat ini — di paket standar mereka akan merah di setiap proyek yang katalognya berbeda,
// yaitu semua proyek. Pemeriksaan yang setara di sini dijalankan gate atas katalog proyek sendiri.

describe("isCanonicalPermissionName", () => {
  it("menerima pola <DOMAIN>_<AKSI>, domain boleh bersegmen banyak", () => {
    expect(isCanonicalPermissionName("BUKU_TAMU_READ")).toBe(true);
    expect(isCanonicalPermissionName("PENDUDUK_CREATE")).toBe(true);
    expect(isCanonicalPermissionName("SURAT_TEMPLATE_MANAGE")).toBe(true);
  });

  it("menolak nama domain telanjang tanpa aksi", () => {
    // Nama domain telanjang menempati kolom yang seharusnya berisi ALASAN — ia tidak memberi tahu
    // klien apa yang salah, jadi bercabang berdasarkan nama itu memang mustahil.
    expect(isCanonicalPermissionName("BUMDES")).toBe(false);
    expect(isCanonicalPermissionName("DESA")).toBe(false);
  });

  it("menolak urutan terbalik (aksi lalu domain)", () => {
    expect(isCanonicalPermissionName("CREATE_GRUP_TEMPLATE")).toBe(false);
    expect(isCanonicalPermissionName("DELETE_GRUP_TEMPLATE")).toBe(false);
  });

  it("menolak huruf kecil dan tanda hubung", () => {
    expect(isCanonicalPermissionName("buku_tamu_read")).toBe(false);
    expect(isCanonicalPermissionName("BUKU-TAMU-READ")).toBe(false);
  });

  it("menolak aksi di luar daftar tertutup", () => {
    // Daftar aksinya TERTUTUP: menambah aksi baru adalah keputusan sadar, bukan efek samping dari
    // seseorang mengarang nama.
    expect(isCanonicalPermissionName("PENDUDUK_FROBNICATE")).toBe(false);
  });
});

describe("extractPermissionCodesFromSource", () => {
  it("mengambil nilai field kode, mengabaikan field lain yang juga huruf besar", () => {
    const src = `
      export const servicePermissions = [
        {
          name: "Contoh",
          code: "FOO_READ",
          level: "DESA",
          organizationTypes: ["PEMERINTAH_DESA", "DISDUKCAPIL"],
        },
      ];
    `;
    // "DESA", "PEMERINTAH_DESA", "DISDUKCAPIL" cocok pola huruf-besar tapi BUKAN field kode —
    // inilah persis kelas false-positive yang menipu regex superset: ia menangkap 210 kandidat
    // dan menuntut kurasi tangan (18 dibuang), sementara versi field-spesifik ini menangkap 192
    // dengan nol kurasi.
    expect(extractPermissionCodesFromSource(src)).toEqual(["FOO_READ"]);
  });

  it("mengambil beberapa entri berurutan", () => {
    expect(extractPermissionCodesFromSource(`code: "A_READ",\ncode: "B_UPDATE",`)).toEqual([
      "A_READ",
      "B_UPDATE",
    ]);
  });

  it("mengenali bentuk seed bahasa lain: Code: \"X\" dan Code = \"X\"", () => {
    // Data seed tidak selalu TypeScript. Kalau ekstraksinya hanya mengenali satu ejaan, proyek
    // yang men-seed permission-nya dari bahasa lain mendapat NOL kode — dan gate lalu melaporkan
    // seluruh katalognya "tidak ada di data seed", ratusan temuan palsu sekaligus.
    expect(extractPermissionCodesFromSource(`Code: "A_READ",`)).toEqual(["A_READ"]);
    expect(extractPermissionCodesFromSource(`Code = "B_UPDATE"`)).toEqual(["B_UPDATE"]);
  });

  it("mengabaikan deklarasi tipe dan rujukan non-literal", () => {
    expect(extractPermissionCodesFromSource("code: string;")).toEqual([]);
    expect(extractPermissionCodesFromSource("code: permission.code,")).toEqual([]);
    expect(extractPermissionCodesFromSource("code: {")).toEqual([]);
  });
});
