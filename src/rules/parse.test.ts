import { describe, expect, it } from "vitest";
import { lintBerkasDikecualikan, lintFormat, parseRules, uraikanPenegak } from "./parse.js";

const CONTOH = `# C — Kontrak

## C-01 · Envelope tunggal

**Ditegakkan oleh:** \`gate:contract-envelope\`

**Aturan.** Satu bentuk pembungkus. Lihat [[C-02]].

## C-02 · Katalog error tertutup

**Status:** USANG — digabung ke [[C-01]] (2026-08-16)

**Ditegakkan oleh:** manual-review-only

**Aturan.** Tidak berlaku lagi.
`;

describe("parseRules", () => {
  it("mengambil id, judul, dan penegak", () => {
    const r = parseRules(CONTOH, "rules/C-kontrak.md");
    expect(r).toHaveLength(2);
    expect(r[0]!.id).toBe("C-01");
    expect(r[0]!.judul).toBe("Envelope tunggal");
    expect(r[0]!.ditegakkanOleh).toBe("gate:contract-envelope");
    expect(r[0]!.usang).toBeNull();
  });

  it("mengambil status usang beserta alasannya", () => {
    const r = parseRules(CONTOH, "rules/C-kontrak.md");
    expect(r[1]!.usang).toContain("digabung ke");
  });

  it("mengumpulkan rujukan silang", () => {
    const r = parseRules(CONTOH, "rules/C-kontrak.md");
    expect(r[0]!.rujukan).toEqual(["C-02"]);
    expect(r[1]!.rujukan).toEqual(["C-01"]);
  });

  it("mencatat nomor baris agar temuan bisa diklik", () => {
    const r = parseRules(CONTOH, "rules/C-kontrak.md");
    expect(r[0]!.baris).toBe(3);
  });
});

describe("heading tak cocok pola: lintFormat melaporkan, parseRules salah alamat", () => {
  // Bukti berpasangan (temuan fix-round-1 #1): sebelum lintFormat ada, sebuah
  // heading "## " yang salah format (di sini: pemisah "-" bukan "·") tertelan
  // diam-diam oleh parseRules jadi badan aturan SEBELUMNYA — dan [[ID]] apa pun
  // di baris tertelan itu salah alamat jadi rujukan milik aturan sebelumnya.
  // lintFormat tidak mengubah perilaku parseRules (tanda tangannya dikunci
  // Task 3/4) — ia hanya membuat cacat itu terlihat, bukan diam-diam lolos.
  const CONTOH = `# T — Uji

## T-01 · Aturan pertama

**Ditegakkan oleh:** \`gate:pertama\`

**Aturan.** Badan pertama.

## T-02 - Salah pemisah, harusnya titik tengah [[T-99]]

**Ditegakkan oleh:** \`gate:kedua\`

**Aturan.** Ini seharusnya jadi aturan sendiri tapi headingnya salah format.
`;

  it("lintFormat melaporkan baris heading yang tak cocok pola, di baris yang tepat", () => {
    const temuan = lintFormat(CONTOH, "rules/T.md");
    const temuanHeading = temuan.find((t) => t.baris === 9);
    expect(temuanHeading).toBeDefined();
    expect(temuanHeading!.pesan).toContain("## <ID> · <judul>");
  });

  it("tanpa perbaikan format, parseRules menelan heading itu jadi badan T-01 dan salah alamat [[T-99]]", () => {
    const r = parseRules(CONTOH, "rules/T.md");
    expect(r).toHaveLength(1);
    expect(r[0]!.id).toBe("T-01");
    expect(r[0]!.rujukan).toContain("T-99");
  });
});

describe("lintFormat: Ditegakkan-oleh ganda dalam satu aturan", () => {
  const CONTOH = `## D-01 · Judul

**Ditegakkan oleh:** \`gate:pertama\`

**Aturan.** Isi.

**Mengapa.** Kegagalan konkret.

**Cara memverifikasi.** Langkahnya.

**Ditegakkan oleh:** \`gate:kedua-tak-sengaja\`
`;

  it("melaporkan kemunculan kedua, bukan yang pertama", () => {
    const temuan = lintFormat(CONTOH, "rules/D.md");
    expect(temuan).toHaveLength(1);
    expect(temuan[0]!.baris).toBe(11);
    expect(temuan[0]!.pesan).toContain("Ditegakkan oleh");
  });
});

describe("lintFormat: badan menyebut penegak yang berbeda dari kolom penegak", () => {
  // Temuan fix-round-2 #1: kolom penegak dipindah ke gate lain, prosa verifikasinya
  // tertinggal menyebut yang lama. `lintRules` buta terhadap ini — ia hanya membaca
  // baris "**Ditegakkan oleh:**" dan tak pernah membandingkannya dengan nama gate
  // yang disebut di badan aturan.
  it("melaporkan aturan yang badannya hanya menyebut penegak lain", () => {
    const isi = `## C-04 · Judul

**Ditegakkan oleh:** \`gate:contract-request-body\`

**Aturan.** Isi.

**Mengapa.** Kegagalan konkret.

**Cara memverifikasi.** \`gate:contract-envelope\` memindai badan permintaan.
`;
    const temuan = lintFormat(isi, "rules/C.md");
    expect(temuan).toHaveLength(1);
    expect(temuan[0]!.pesan).toContain("C-04");
    expect(temuan[0]!.pesan).toContain("gate:contract-request-body");
    expect(temuan[0]!.pesan).toContain("gate:contract-envelope");
  });

  it("badan yang tidak menyebut penegak apa pun bukan cacat", () => {
    const isi = `## G-05 · Judul

**Ditegakkan oleh:** \`gate:ledger-bidirectional\`

**Aturan.** Isi.

**Mengapa.** Kegagalan konkret.

**Cara memverifikasi.** Jalankan kedua arah dan assert semestanya non-kosong.
`;
    expect(lintFormat(isi, "rules/G.md")).toEqual([]);
  });

  // Bentuk sah yang TIDAK boleh tertangkap: "gate X menjaga aturan lain, bukan aturan
  // ini" adalah kalimat berguna. Ia sah selama penegaknya sendiri ikut disebut — itu
  // yang membuat pemeriksaan ini bebas false positive, bukan sekadar belum kena.
  it("badan boleh menyebut penegak LAIN asal penegaknya sendiri ikut disebut", () => {
    const isi = `## B-03 · Judul

**Ditegakkan oleh:** \`gate:generated-sync\`

**Aturan.** Isi.

**Mengapa.** Kegagalan konkret.

**Cara memverifikasi.** \`gate:generated-sync\` meregenerasi lalu menuntut diff kosong;
kepemilikan pohonnya urusan \`gate:allowlist-monotonic\`, bukan gate ini.
`;
    expect(lintFormat(isi, "rules/B.md")).toEqual([]);
  });

  it("manual-review-only tidak dituntut menyebut nama penegak", () => {
    const isi = `## O-07 · Judul

**Ditegakkan oleh:** manual-review-only — tidak ada artefak untuk dibandingkan

**Aturan.** Isi.

**Mengapa.** Kegagalan konkret.

**Cara memverifikasi.** Bukti yang TIDAK sah: \`gate:generated-sync\` hijau.
`;
    expect(lintFormat(isi, "rules/O.md")).toEqual([]);
  });

  // Temuan fix-round-3 B2: saat pemeriksaan #3 ditambahkan, reset keadaan jadi
  // BERSYARAT `idAktif !== null`, sehingga penegak di PREAMBLE tak pernah dibersihkan
  // dan bocor jadi milik aturan pertama — temuan "penegak ganda" palsu SEKALIGUS
  // penegak asli yang terbuang, sehingga pemeriksaan nama gate berjalan atas nilai
  // yang salah. Kode sebelum pemeriksaan #3 ada: nol temuan untuk masukan yang sama.
  it("penegak di preamble tidak bocor ke aturan pertama", () => {
    const isi = `# C — Kontrak

**Ditegakkan oleh:** \`gate:nyasar-di-preamble\`

## C-01 · Judul

**Ditegakkan oleh:** \`gate:contract-envelope\`

**Aturan.** Isi.

**Mengapa.** Kegagalan konkret.

**Cara memverifikasi.** \`gate:contract-envelope\` memeriksa bundel ter-dereference.
`;
    expect(lintFormat(isi, "rules/C.md")).toEqual([]);
  });
});

describe("lintBerkasDikecualikan: README boleh mencontohkan, tidak boleh memuat aturan", () => {
  it("judul aturan di LUAR fence dilaporkan, menyebut ID-nya", () => {
    const isi = `# README

## A-02 · Aturan yang disembunyikan di sini

Tanpa penegak, tanpa prosa, dan tanpa satu pun pemeriksaan.
`;
    const t = lintBerkasDikecualikan(isi, "rules/README.md");
    expect(t).toHaveLength(1);
    expect(t[0]!.baris).toBe(3);
    expect(t[0]!.pesan).toContain("A-02");
  });

  // Arah sebaliknya — yang justru jadi seluruh alasan pengecualian README ada.
  it("judul aturan di DALAM fence tidak dilaporkan", () => {
    const isi = `# README

Format satu aturan:

\`\`\`md
## C-01 · Envelope tunggal

**Ditegakkan oleh:** \`gate:contract-envelope\`
\`\`\`

Selesai.
`;
    expect(lintBerkasDikecualikan(isi, "rules/README.md")).toEqual([]);
  });

  it("heading biasa dan tabel tidak dilaporkan", () => {
    const isi = `# README

## Skema prefix — delapan lapis

| Prefix | Berkas |
|---|---|
| \`S-\` | \`S-sumber-kebenaran.md\` |

## Siklus hidup ID

Sekali terbit, ID tidak pernah dipakai ulang.
`;
    expect(lintBerkasDikecualikan(isi, "rules/README.md")).toEqual([]);
  });
});

describe("lintFormat: kelengkapan prosa, dan pengecualian USANG-nya", () => {
  const HIDUP = `## T-03 · Aturan hidup berpenegak manual

**Ditegakkan oleh:** manual-review-only — menuntut mengikuti tipe balikan, bukan mencocokkan satu baris

**Aturan.** Isi.

**Mengapa.** Kegagalan konkret.

**Cara memverifikasi.** Langkahnya.
`;

  it("aturan lengkap: nol temuan", () => {
    expect(lintFormat(HIDUP, "rules/T.md")).toEqual([]);
  });

  // Mutasi pengulas untuk C1: cabut Mengapa dari sebuah aturan. Sebelum pemeriksaan
  // ini pindah ke `lintFormat`, `rules-lint` melaporkannya HIJAU — kelengkapan prosa
  // hanya diperiksa di suite paket ini, yang tidak ikut tersalin ke proyek target.
  it("aturan hidup yang kehilangan Mengapa dilaporkan, menamai aturannya", () => {
    const t = lintFormat(HIDUP.replace("**Mengapa.** Kegagalan konkret.\n\n", ""), "rules/T.md");
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("T-03");
    expect(t[0]!.pesan).toContain("**Mengapa.**");
  });

  it("bagian prosa ganda juga dilaporkan", () => {
    const t = lintFormat(HIDUP.replace("**Aturan.** Isi.", "**Aturan.** Isi.\n\n**Aturan.** Dua kali."), "rules/T.md");
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("2 kali");
  });

  // Pengecualian USANG tetap berlaku — dan ia aman justru karena `lintRules`
  // menuntut bentuk penegak pencabutan yang eksplisit; lihat lint.test.ts.
  it("aturan USANG dikecualikan dari tuntutan kelengkapan prosa", () => {
    const dicabut = `## X-01 · Judul lama apa adanya

**Status:** USANG — digantikan [[X-02]] (2026-08-16)

**Ditegakkan oleh:** manual-review-only — sudah tidak ditegakkan; dipertahankan sebagai riwayat
`;
    expect(lintFormat(dicabut, "rules/X.md")).toEqual([]);
  });
});

// Satu fixture yang melewati SETIAP wilayah dokumen yang bisa ditemui pemeriksa:
// preamble sebelum heading pertama, aturan hidup, aturan USANG, blok ber-fence yang
// memuat heading & penegak palsu, dan akhir berkas. Dua ronde berturut-turut cacat
// yang lolos justru duduk di wilayah yang pemeriksaannya sendiri tidak "miliki" —
// preamble (B2) dan aturan USANG (B1). Fixture ini menguncinya sekaligus, dan ia
// yang dijalankan lebih dulu setiap kali `lintFormat` disentuh.
describe("fixture lintas-wilayah: seluruh keadaan dokumen dalam satu berkas", () => {
  const SEMUA = `# X — Lintas wilayah

Preamble bebas. Ia boleh menyebut \`gate:apa-pun\` tanpa jadi milik aturan mana pun.

## X-01 · Aturan hidup ber-gate

**Ditegakkan oleh:** \`gate:x-satu\`

**Aturan.** Isi.

**Mengapa.** Alasan konkret.

**Cara memverifikasi.** \`gate:x-satu\` memeriksanya, dan \`gate:x-dua\` menjaga [[X-02]].

## X-02 · Aturan yang dicabut

**Status:** USANG — digantikan [[X-01]] (2026-08-16)

**Ditegakkan oleh:** manual-review-only — sudah tidak ditegakkan; dipertahankan sebagai riwayat

## X-03 · Aturan dengan contoh ber-fence

**Ditegakkan oleh:** manual-review-only — contoh

**Aturan.** Formatnya begini:

\`\`\`md
## BUKAN-01 · heading palsu di dalam fence
**Ditegakkan oleh:** \`gate:palsu\`
\`\`\`

**Mengapa.** Alasan konkret.

**Cara memverifikasi.** Langkahnya.
`;

  it("nol temuan format", () => {
    expect(lintFormat(SEMUA, "rules/X.md")).toEqual([]);
  });

  it("parseRules melihat tepat tiga aturan, dan fence tidak menambah aturan keempat", () => {
    const r = parseRules(SEMUA, "rules/X.md");
    expect(r.map((x) => x.id)).toEqual(["X-01", "X-02", "X-03"]);
  });

  it("penegak preamble tidak jadi milik X-01, dan status usang X-02 terbaca", () => {
    const r = parseRules(SEMUA, "rules/X.md");
    expect(r[0]!.ditegakkanOleh).toBe("gate:x-satu");
    expect(r[1]!.usang).toContain("digantikan");
    expect(r[1]!.ditegakkanOleh).toContain("manual-review-only");
  });
});

describe("blok kode ber-fence dikecualikan dari deteksi heading dan rujukan", () => {
  const CONTOH = `## F-01 · Judul dengan contoh kode

**Ditegakkan oleh:** \`gate:x\`

**Aturan.** Contoh format aturan (JANGAN dianggap heading/rujukan sungguhan):

\`\`\`
## bukan heading sungguhan [[F-99]]
**Ditegakkan oleh:** juga-bukan-penegak-sungguhan
\`\`\`

**Mengapa.** Kegagalan konkret.

**Cara memverifikasi.** lihat di atas.
`;

  it("parseRules tidak membaca isi fence sebagai heading, rujukan, atau penegak", () => {
    const r = parseRules(CONTOH, "rules/F.md");
    expect(r).toHaveLength(1);
    expect(r[0]!.rujukan).toEqual([]);
    expect(r[0]!.ditegakkanOleh).toBe("gate:x");
  });

  it("lintFormat tidak melaporkan heading/penegak palsu di dalam fence", () => {
    expect(lintFormat(CONTOH, "rules/F.md")).toEqual([]);
  });
});

// Satu aturan boleh ditegakkan LEBIH DARI SATU gate, dan itu keadaan biasa, bukan sudut kasus:
// baseline shrink-only hidup di dalam setiap gate yang punya baseline, buku besar dua arah di
// dalam setiap gate yang membacanya. Sebelum dukungan ini ada, kolom penegak dipaksa menyebut
// SATU nama — jadi ia berbohong ke salah satu arah: entah menyebut gate generik yang tak dimiliki
// sumber mana pun (dan pembaca yang menjalankan prosedur G-01 mencari berkas yang tidak ada),
// entah menyebut satu gate saja dan menyembunyikan yang lain.
describe("kolom penegak ber-gate-banyak", () => {
  const dua = (badan: string) => `# G

## G-99 · Contoh

**Ditegakkan oleh:** gate:contract-envelope + gate:contract-request-body

**Aturan.** x

**Mengapa.** ${badan}

**Cara memverifikasi.** y
`;

  it("uraikanPenegak memecah kolom jadi daftar nama gate", () => {
    expect(uraikanPenegak("gate:a + gate:b")).toEqual({
      gate: ["gate:a", "gate:b"], konsumen: [], manual: false, salah: [],
    });
    expect(uraikanPenegak("gate:contract-envelope").gate).toEqual(["gate:contract-envelope"]);
  });

  it("uraikanPenegak mengenali bentuk manual, dan TIDAK memecah alasannya", () => {
    // Alasan manual adalah kalimat bebas: koma, tanda hubung, bahkan `+` boleh ada di dalamnya.
    // Memecahnya akan melahirkan potongan tak bermakna yang lalu dilaporkan sebagai nama salah
    // bentuk — gate yang memerah pada masukan yang benar.
    const a = uraikanPenegak("manual-review-only — tidak ada artefak, jadi tidak ada yang dibandingkan");
    expect(a).toEqual({ gate: [], konsumen: [], manual: true, salah: [] });
    expect(uraikanPenegak("manual-review-only — alasan dengan a + b di dalamnya").salah).toEqual([]);
    expect(uraikanPenegak("manual-review-only")).toEqual({ gate: [], konsumen: [], manual: true, salah: [] });
  });

  // Kedua bentuk di bawah SEBELUMNYA memulangkan larik kosong dan karenanya MEMATIKAN pemeriksaan
  // "badan menyebut penegaknya sendiri" tanpa satu sinyal pun. Yang kedua bahkan pelemahan
  // dibanding bentuk sebelum fungsi ini ada, yang membandingkan string mentah.
  it("uraikanPenegak MELAPORKAN potongan tak dikenali, bukan membuangnya", () => {
    // Kolom CAMPURAN: bukan bentuk manual (ada `+` tepat sesudah kata kuncinya), jadi ia dipecah —
    // gate-nya tetap bisa diperiksa, dan kata kunci manual yang nyasar dilaporkan.
    expect(uraikanPenegak("manual-review-only + gate:x")).toEqual({
      gate: ["gate:x"],
      konsumen: [],
      manual: false,
      salah: ["manual-review-only"],
    });
    // Nama SALAH BENTUK: dilaporkan, tidak disaring habis.
    expect(uraikanPenegak("Gate:A")).toEqual({ gate: [], konsumen: [], manual: false, salah: ["Gate:A"] });
    // Campuran sah + salah: yang sah tetap terbaca, yang salah tetap dilaporkan.
    expect(uraikanPenegak("gate:a + Gate:B")).toEqual({
      gate: ["gate:a"],
      konsumen: [],
      manual: false,
      salah: ["Gate:B"],
    });
  });

  it("parseRules menyimpan kolomnya utuh, apa adanya", () => {
    expect(parseRules(dua("apa pun"), "G.md")[0]!.ditegakkanOleh).toBe(
      "gate:contract-envelope + gate:contract-request-body",
    );
  });

  it("badan yang menyebut SALAH SATU penegaknya: LOLOS", () => {
    // Irisan tak-kosong sudah cukup. Menuntut badan menyebut SEMUANYA akan memerahkan prosa yang
    // wajar — gate yang memerah pada masukan yang benar akan dibuang orang ([[G-06]]).
    expect(lintFormat(dua("Dipakai `gate:contract-envelope`."), "G.md")).toEqual([]);
  });

  it("badan yang menyebut KEDUANYA: LOLOS", () => {
    expect(
      lintFormat(dua("Dipakai `gate:contract-envelope` dan `gate:contract-request-body`."), "G.md"),
    ).toEqual([]);
  });

  // Kedua bentuk di bawah pernah HIJAU, dan keduanya mematikan pemeriksaan #3 lewat pintu yang
  // sama: kolom penegaknya menghasilkan NOL nama gate, jadi pemeriksaannya melewati aturan itu
  // sepenuhnya. Diukur lawan pengurai sebelum perbaikan — keduanya hijau di sana, sementara probe
  // kontrol (multi-gate sah, badan menyebut satu) hijau di kedua versi.
  it("kolom CAMPURAN manual + gate: MERAH, dan gate-nya tetap bisa diperiksa", () => {
    const isi = `## X-01 · Contoh

**Ditegakkan oleh:** manual-review-only + gate:x

**Aturan.** Isi.

**Mengapa.** Dipakai \`gate:asing\`.

**Cara memverifikasi.** Langkahnya.
`;
    const t = lintFormat(isi, "X.md");
    expect(t.length).toBeGreaterThan(0);
    expect(t.some((x) => x.pesan.includes("bukan nama penegak yang dikenali"))).toBe(true);
    expect(t.some((x) => x.pesan.includes("manual-review-only"))).toBe(true);
  });

  it("nama penegak SALAH BENTUK: MERAH, mengutip pelanggarnya dan menyebut bentuk yang diharapkan", () => {
    const isi = `## X-01 · Contoh

**Ditegakkan oleh:** Gate:A

**Aturan.** Isi.

**Mengapa.** Dipakai \`gate:asing\`.

**Cara memverifikasi.** Langkahnya.
`;
    const t = lintFormat(isi, "X.md");
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain('"Gate:A"');
    expect(t[0]!.pesan).toContain("gate:<nama-huruf-kecil>");
  });

  it("satu nama sah + satu salah bentuk: yang salah tetap dilaporkan walau #3 sudah puas", () => {
    // Arah yang mudah hilang: badan menyebut penegaknya sendiri, jadi pemeriksaan #3 diam — dan
    // tanpa temuan tersendiri, potongan yang salah bentuk lolos tanpa satu pun sinyal.
    const isi = `## X-01 · Contoh

**Ditegakkan oleh:** gate:contract-envelope + Gate:B

**Aturan.** Isi.

**Mengapa.** Dipakai \`gate:contract-envelope\`.

**Cara memverifikasi.** Langkahnya.
`;
    const t = lintFormat(isi, "X.md");
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain('"Gate:B"');
  });

  it("alasan manual yang memuat `+` TIDAK dibaca sebagai daftar gate", () => {
    // Arah sebaliknya, dan ia yang menjaga perbaikan ini dari jadi gate yang memerahkan masukan
    // benar: alasan manual adalah kalimat bebas.
    const isi = `## X-01 · Contoh

**Ditegakkan oleh:** manual-review-only — menuntut membaca maksud, bukan bentuk a + b

**Aturan.** Isi.

**Mengapa.** Tidak menyebut gate apa pun.

**Cara memverifikasi.** Langkahnya.
`;
    expect(lintFormat(isi, "X.md")).toEqual([]);
  });

  it("badan yang HANYA menyebut gate asing: tetap MERAH", () => {
    // Arah ini yang membuat pelonggaran di atas bukan lubang: kolom penegak yang dipindah ke gate
    // baru sementara prosanya tertinggal menyebut yang lama tetap tertangkap.
    const t = lintFormat(dua("Dipakai `gate:asing` saja."), "G.md");
    expect(t).toHaveLength(1);
    expect(t[0]!.pesan).toContain("gate:asing");
  });
});

/**
 * Sufiks `(konsumen)` — keadaan ketiga kolom penegak.
 *
 * Sintaksnya tunduk pada jebakan yang `rules/README.md` sudah namai: kolomnya tidak boleh memuat
 * backtick DI TENGAH, jadi penandanya harus masuk ke dalam backtick yang sama
 * (`` `gate:x (konsumen)` ``), bukan ditempel sesudahnya.
 */
describe("penanda (konsumen) di kolom penegak", () => {
  it("nama gate dipulangkan TANPA sufiksnya, dan ditandai terpisah", () => {
    const t = uraikanPenegak("gate:tenancy-byid (konsumen)");
    expect(t.gate).toEqual(["gate:tenancy-byid"]);
    expect(t.konsumen).toEqual(["gate:tenancy-byid"]);
    expect(t.salah).toEqual([]);
  });

  // Yang ditandai TETAP di `gate`, bukan dipindah ke larik sendiri: pemeriksaan "badan aturan
  // menyebut penegaknya sendiri" berlaku sama untuk gate yang dikirim konsumen, dan memisahnya
  // akan mematikannya untuk sembilan gate sekaligus.
  it("kolom campuran: yang ditandai dan yang tidak sama-sama masuk `gate`", () => {
    const t = uraikanPenegak("gate:contract-envelope + gate:golden-ids (konsumen)");
    expect(t.gate).toEqual(["gate:contract-envelope", "gate:golden-ids"]);
    expect(t.konsumen).toEqual(["gate:golden-ids"]);
  });

  it("`standard <subperintah>` tidak boleh ditandai — ia selalu perintah paket ini sendiri", () => {
    const t = uraikanPenegak("standard rules-lint (konsumen)");
    expect(t.gate).toEqual([]);
    expect(t.salah).toEqual(["standard rules-lint (konsumen)"]);
  });

  it("penanda salah tulis DILAPORKAN, bukan dibaca sebagai nama gate biasa", () => {
    expect(uraikanPenegak("gate:x (Konsumen)").salah).toEqual(["gate:x (Konsumen)"]);
    expect(uraikanPenegak("gate:x konsumen").salah).toEqual(["gate:x konsumen"]);
  });
});
