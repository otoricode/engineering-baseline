/**
 * Punya berkas pendaftaran tidak sama dengan MELAYANI TRAFIK. Sebuah modul yang tak pernah masuk
 * daftar modul di titik masuk menghasilkan RUTE HANTU — kontrak dituntut menyediakan operasi
 * untuk endpoint yang tak pernah dipanggil siapa pun ([[B-01]]).
 *
 * Ini satu-satunya pembaca sumber Go yang tersisa di direktori ini, dan ia bertahan karena
 * pertanyaannya berbeda: bukan "rute apa saja yang didaftarkan" (itu urusan kontrak dan wiring
 * generated), melainkan "apakah modul ini dipasang sama sekali" — sesuatu yang hanya titik
 * masuknya yang tahu.
 *
 * Ia pembaca TEKS, bukan parser Go sungguhan: kalau bentuk berkas yang diasumsikan di sini
 * berubah (blok import, atau penanda daftar modul), gagal NYARING (throw), jangan diam-diam
 * melewati pemeriksaan. Pemisahan "apa yang kode, apa yang komentar/string" TIDAK dikerjakan
 * sendiri di sini — ia memakai `goSource.ts`, satu sumber kebenaran untuk seluruh direktori.
 * Berkas ini pernah punya pemisahnya sendiri, dan pemisah itu buta terhadap komentar blok dan
 * raw string; pelajaran dari berkas tetangga tidak diwariskan sampai keduanya dipaksa berbagi.
 *
 * Dua jebakan yang lolos bahkan setelah pemisahnya benar, dan keduanya sudah menggigit:
 *   - Penanda daftar modul dicari di teks yang SUDAH di-blank, bukan mentah. Penanda yang cuma
 *     DISEBUT di dalam komentar (`// dulu: []server.FeatureRegistrar{ posyandu.Register }`,
 *     ditulis persis begitu saat seseorang mencabut modul) terbaca sebagai penanda SUNGGUHAN dan
 *     mengubah gate dari 28 galat jadi NOL.
 *   - Isi blok import dibaca dari teks yang cuma komentarnya di-blank, bukan dari teks
 *     ber-blank-penuh: jalur import ADALAH string, jadi di teks ber-blank-penuh ia sudah jadi
 *     spasi dan SELURUH import gagal terbaca (0 dari 29).
 */
import { blankComments, blankNonCode } from "./goSource.js";
import type { T } from "../pesan.js";

/** Baris impor satu fitur: alias opsional lalu jalur yang diakhiri "/<featureDir>/<nama>". */
function featureImportRe(featureDir: string): RegExp {
  const dir = featureDir.split("/").filter(Boolean).map(escapeRegExp).join("/");
  return new RegExp(`^\\s*(?:(\\w+)\\s+)?"[^"]*/${dir}/([A-Za-z0-9_]+)"\\s*$`);
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Cari indeks `}` yang menutup `{` di `openIdx` (harus menunjuk karakter `{` itu sendiri di
 * `blanked`), dengan menghitung kedalaman kurawal.
 *
 * `blanked` HARUS `blankNonCode(source)` dari teks yang sama — komentar dan string sudah jadi
 * spasi di sana, jadi kurawal di dalamnya tidak ada lagi untuk dihitung.
 *
 * `blanked[openIdx]` DITEGAKKAN harus `{`: jaring kedua yang murah untuk pemanggil yang mencari
 * `{` di teks MENTAH lalu mendarat di posisi yang sudah di-blank. Tanpa penegakan ini, fungsi
 * mulai menghitung dari sana secara SENYAP dan memulangkan rentang yang salah tanpa satu galat
 * pun. Diekspor supaya bisa diuji langsung — tanpa itu, menghapusnya tidak membuat satu test pun
 * merah, dan penjaga yang penghapusannya tidak terlihat bukan penjaga ([[G-06]]).
 */
export function findMatchingBrace(blanked: string, openIdx: number): number {
  if (blanked[openIdx] !== "{") {
    throw new Error(
      `findMatchingBrace: openIdx ${openIdx} bukan '{' di sumber blanked (ditemukan ` +
        `${JSON.stringify(blanked[openIdx] ?? "<EOF>")}) — posisi kurawal WAJIB dihitung dari teks ` +
        `yang sudah di-blank, bukan dari teks mentah. Yang salah adalah pemanggilnya, bukan berkas ` +
        `Go yang sedang dibaca.`,
    );
  }
  let depth = 0;
  for (let i = openIdx; i < blanked.length; i++) {
    const c = blanked[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

/**
 * Peta nama-direktori-fitur -> identifier yang dipakai mengaksesnya di titik masuk (alias impor
 * kalau ada, kalau tidak nama fitur itu sendiri — asumsi nama paket == nama direktori).
 */
export function parseFeatureImports(sumber: string, featureDir: string, namaBerkas: string): Map<string, string> {
  const blanked = blankNonCode(sumber, namaBerkas);

  const importsOpen = blanked.indexOf("import (");
  if (importsOpen === -1) {
    throw new Error(
      `${namaBerkas}: blok "import (...)" tidak ditemukan — bentuk berkas berubah. Perbaiki ` +
        `checkModuleWiring sebelum melanjutkan.`,
    );
  }
  const importsClose = blanked.indexOf("\n)", importsOpen);
  if (importsClose === -1) {
    throw new Error(`${namaBerkas}: blok import tidak tertutup ")" — perbaiki checkModuleWiring.`);
  }
  // NILAI-nya diambil dari teks yang hanya KOMENTARNYA di-blank: jalur import adalah string
  // (hilang di blankNonCode), sementara komentar di EKOR baris impor — Go yang sepenuhnya sah —
  // membuat pola akhir-baris di bawah tidak cocok sama sekali kalau dibaca dari teks mentah.
  const commentBlanked = blankComments(sumber, namaBerkas);
  const block = commentBlanked.slice(importsOpen + "import (".length, importsClose);

  const re = featureImportRe(featureDir);
  const map = new Map<string, string>();
  for (const line of block.split("\n")) {
    const m = re.exec(line);
    if (!m) continue;
    map.set(m[2]!, m[1] ?? m[2]!);
  }
  return map;
}

/**
 * Gabungan SELURUH literal daftar modul di titik masuk — dicari lewat penandanya
 * (`go.registrarType`), bukan lewat nama fieldnya, karena literal itu lazim pindah ke dalam
 * sebuah fungsi perakit.
 *
 * `slice` adalah gabungan isi SEMUA literal yang ditemukan, bukan yang pertama saja: kalau wiring
 * dipecah jadi dua literal, modul di literal KEDUA salah terbaca "tak terpasang" DAN modul yang
 * hilang dari literal pertama tetap lolos — salah di dua arah sekaligus. `preamble` adalah
 * seluruh teks DI LUAR rentang setiap literal (bukan cuma "sebelum literal pertama"), supaya
 * deklarasi tak-langsung yang duduk DI ANTARA dua literal tetap terlihat.
 */
export function extractModulesSliceAndPreamble(
  sumber: string,
  penanda: string,
  namaBerkas: string,
): { slice: string; preamble: string; blankedSlice: string; blankedPreamble: string } {
  const blanked = blankNonCode(sumber, namaBerkas);

  const contentRanges: Array<[number, number]> = [];
  const fullRanges: Array<[number, number]> = [];
  let searchFrom = 0;
  for (;;) {
    const markerIdx = blanked.indexOf(penanda, searchFrom);
    if (markerIdx === -1) break;
    const openIdx = markerIdx + penanda.length - 1; // indeks '{' pembuka
    const closeIdx = findMatchingBrace(blanked, openIdx);
    if (closeIdx === -1) {
      throw new Error(`${namaBerkas}: kurawal daftar modul tidak seimbang — perbaiki checkModuleWiring.`);
    }
    contentRanges.push([openIdx + 1, closeIdx]);
    fullRanges.push([markerIdx, closeIdx + 1]);
    searchFrom = closeIdx + 1;
  }

  if (contentRanges.length === 0) {
    throw new Error(
      `${namaBerkas}: penanda "${penanda}" (go.registrarType) tidak ditemukan — bentuk daftar modul ` +
        `berubah, atau kunci config-nya salah. Perbaiki salah satunya sebelum melanjutkan; jangan ` +
        `biarkan gate ini lewat tanpa memeriksa apa pun.`,
    );
  }

  const joinContent = (text: string): string =>
    contentRanges.map(([start, end]) => text.slice(start, end)).join("\n");

  const excludeRanges = (text: string): string => {
    let out = "";
    let cursor = 0;
    for (const [start, end] of fullRanges) {
      out += text.slice(cursor, start);
      cursor = end;
    }
    return out + text.slice(cursor);
  };

  return {
    slice: joinContent(sumber),
    preamble: excludeRanges(sumber),
    blankedSlice: joinContent(blanked),
    blankedPreamble: excludeRanges(blanked),
  };
}

/**
 * Untuk tiap direktori feature yang punya berkas pendaftaran, pastikan ia benar-benar terpasang
 * di daftar modul titik masuk. Dua pola dikenali:
 *
 *   - LANGSUNG: `<identifier>.Sesuatu(...)` muncul di dalam daftar;
 *   - TIDAK LANGSUNG: di luar daftar ada `varName := <identifier>.Sesuatu(...)`, dan `varName.`
 *     muncul di dalam daftar.
 *
 * Mengembalikan daftar pesan galat (kosong = semua terpasang). MELEMPAR (bukan mengembalikan
 * galat) kalau BENTUK titik masuknya sendiri tak terbaca — lihat catatan modul.
 */
export function checkModuleWiring(
  sumber: string,
  featureDirs: string[],
  opsi: { featureDir: string; penanda: string; namaBerkas: string },
  t: T,
  sitir: string,
): string[] {
  const imports = parseFeatureImports(sumber, opsi.featureDir, opsi.namaBerkas);
  const { blankedSlice: slice, blankedPreamble: preamble } = extractModulesSliceAndPreamble(
    sumber,
    opsi.penanda,
    opsi.namaBerkas,
  );

  const errors: string[] = [];
  for (const feature of featureDirs) {
    const identifier = imports.get(feature);
    if (identifier === undefined) {
      errors.push(`${sitir} ${t("kontrak.rute.fitur_tak_diimpor", { fitur: feature, berkas: opsi.namaBerkas })}`);
      continue;
    }

    if (new RegExp(`\\b${escapeRegExp(identifier)}\\.`).test(slice)) continue;

    let wired = false;
    const indirectRe = new RegExp(`(\\w+)\\s*:=\\s*${escapeRegExp(identifier)}\\.\\w+\\(`, "g");
    for (const m of preamble.matchAll(indirectRe)) {
      if (new RegExp(`\\b${escapeRegExp(m[1]!)}\\.`).test(slice)) {
        wired = true;
        break;
      }
    }

    if (!wired) {
      errors.push(
        `${sitir} ${t("kontrak.rute.fitur_tak_terpasang", {
          fitur: feature,
          paket: identifier,
          berkas: opsi.namaBerkas,
        })}`,
      );
    }
  }
  return errors;
}
