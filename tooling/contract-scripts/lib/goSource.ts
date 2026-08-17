/**
 * SATU sumber kebenaran untuk "apa yang komentar/string/rune, apa yang kode" di sumber Go,
 * dipakai bersama oleh setiap pembaca sumber di direktori ini.
 *
 * Sebelum berkas ini ada, dua pembaca memecahkan kelas masalah yang sama sendiri-sendiri, dan
 * yang lebih baru justru lebih lemah: pemisahnya cuma menangani komentar `//` dan string
 * `"..."`, buta terhadap komentar blok dan raw string sama sekali. Lima ronde perbaikan yang
 * sudah dibayar di pembaca pertama tidak sampai ke berkas yang ditulis kemudian — pelajaran
 * yang hanya hidup di satu tempat tidak ikut terbawa ([[O-07]] untuk kelas yang sama di pohon
 * artefak).
 *
 * Go punya LIMA bentuk leksikal "bukan kode struktural" yang bisa memuat karakter
 * `(`/`)`/`{`/`}` tanpa itu berarti kode sungguhan: komentar baris `//`, komentar blok
 * `/* *\/`, string `"..."`, raw string `` `...` ``, dan rune literal `'...'` (mis. `')'`
 * — satu karakter kutip tunggal yang isinya kebetulan tanda kurung). Rune literal WAJIB ikut
 * dimodelkan, bukan dijadikan alasan melempar: mesinnya identik dengan string (kutip tunggal
 * plus maksimal satu escape), jadi melemparinya adalah gagal-nyaring yang SALAH SASARAN — ia
 * memblokir kode Go yang sepenuhnya sah (mis. `strings.ContainsRune(s, ')')`) untuk masalah
 * yang tidak ada.
 *
 * Yang BENAR-BENAR tak bisa dimodelkan, dan karenanya layak gagal nyaring, adalah lexeme yang
 * TIDAK PERNAH DITUTUP — string/raw-string/komentar-blok/rune yang mencapai akhir berkas tanpa
 * penutup. Di situ blanking tidak bisa benar: tidak ada cara tahu di mana ia SEHARUSNYA
 * berakhir, jadi menebak (bentuk lamanya: `if (lineEnd === -1) break;`) berarti diam-diam
 * menelan sisa berkas tanpa satu galat pun. `assertModeledLexemes` di bawah menutup persis
 * lubang itu.
 *
 * Keempat fungsi publik berkas ini berbagi SATU generator pemindaian (`walkLexemes`) — mesinnya
 * satu, kebijakannya (blank vs validasi vs cari-posisi) yang berbeda. Itu bukan kerapian:
 * versi sebelumnya adalah tiga loop tangan-sendiri yang KEBETULAN sama isinya sampai salah
 * satunya diperbaiki sendirian.
 *
 * Kenapa DUA fungsi blanking, dan kenapa memilih yang salah itu berbahaya:
 *   `blankNonCode`  menjawab "di mana KODE-nya" — dipakai untuk POSISI. Ia TIDAK bisa dipakai
 *                   untuk NILAI, karena literal jalur dan kode permission SENDIRI adalah string
 *                   dan ikut jadi spasi di sana.
 *   `blankComments` menjawab "apa NILAI-nya" — nilai tetap utuh, hanya komentar jadi spasi.
 * Membaca nilai dari teks MENTAH adalah lubang yang sudah menggigit: baris yang DIKOMENTARI di
 * dalam kurung pemanggilan rute ikut terbaca sebagai argumen sungguhan, jadi guard permission
 * yang sudah dicabut tetap dilaporkan sebagai guard — gate HIJAU untuk endpoint tanpa proteksi.
 *
 * Pembaca ini adalah pembaca TEKS, bukan parser Go sungguhan: kalau bentuk yang diasumsikan di
 * sini berubah atau ada bentuk leksikal yang tak dimodelkan, gagal NYARING (throw), jangan
 * diam-diam salah hitung ([[O-04]]).
 */

/** Nomor baris (1-based) dari indeks karakter `idx` di `source`. */
function lineAt(source: string, idx: number): number {
  let line = 1;
  for (let i = 0; i < idx; i++) if (source[i] === "\n") line++;
  return line;
}

/**
 * Cari indeks TEPAT SESUDAH kutip penutup untuk lexeme berkutip (string `"..."` atau rune
 * `'...'`) yang mulai di `openIdx` (`source[openIdx]` harus `quoteChar` itu sendiri),
 * menghormati escape `\x` — satu backslash + SATU karakter berikutnya dilewati tanpa
 * dianggap kutip penutup. Ini cukup untuk menemukan kutip penutup SUNGGUHAN walau escape Go
 * asli kadang lebih dari satu karakter (mis. `\x41`, `é`): sisa digit sesudah karakter
 * yang dilewati bukan kutip maupun backslash, jadi tetap terbaca sebagai isi biasa sampai
 * kutip penutup nyata ditemukan — sama seperti string, tak perlu parser escape Go penuh.
 * Mengembalikan -1 kalau EOF tercapai sebelum kutip penutup ditemukan (lexeme tak tertutup).
 */
function scanQuoted(source: string, openIdx: number, quoteChar: string): number {
  const n = source.length;
  let i = openIdx + 1;
  while (i < n) {
    const c = source[i];
    if (c === "\\") {
      i += 2; // lewati backslash + satu karakter yang di-escape (termasuk quoteChar itu sendiri)
      continue;
    }
    if (c === quoteChar) return i + 1;
    i++;
  }
  return -1;
}

/** Satu rentang lexeme "bukan kode struktural" yang ditemukan `walkLexemes`. */
type LexemeSpan = {
  kind: "linecomment" | "blockcomment" | "string" | "rawstring" | "rune";
  /** Indeks karakter pertama (delimiter pembuka, mis. posisi `/` pada `//`). */
  start: number;
  /** Indeks TEPAT SESUDAH karakter terakhir (delimiter penutup) — setengah-terbuka. */
  end: number;
};

/**
 * SATU pemindaian atas `source`, menghasilkan span untuk tiap kemunculan salah satu dari
 * LIMA bentuk "bukan kode struktural" Go, berurutan sesuai posisi. Ini SATU-SATUNYA tempat
 * yang tahu cara mengenali kelima bentuk itu — `assertModeledLexemes`, `blankNonCode`, dan
 * `findBlockCommentStarts` semuanya cuma mengonsumsi generator ini dengan cara berbeda,
 * bukan menduplikasi logika pengenalannya sendiri-sendiri.
 *
 * Melempar (bukan mengembalikan) begitu menemukan lexeme berkutip yang TIDAK PERNAH
 * DITUTUP — komentar baris `//` dikecualikan, sah berakhir di baris baru ATAU akhir berkas.
 * Pemanggil yang men-drain generator ini sampai habis otomatis mendapat jaminan
 * `assertModeledLexemes` tanpa memanggilnya terpisah.
 */
function* walkLexemes(source: string, where: string): Generator<LexemeSpan> {
  const n = source.length;
  let i = 0;

  while (i < n) {
    const c = source[i];
    const c2 = i + 1 < n ? source[i + 1] : "";

    if (c === "/" && c2 === "/") {
      const lineEnd = source.indexOf("\n", i);
      const end = lineEnd === -1 ? n : lineEnd;
      yield { kind: "linecomment", start: i, end };
      i = end;
      continue;
    }

    if (c === "/" && c2 === "*") {
      const close = source.indexOf("*/", i + 2);
      if (close === -1) {
        throw new Error(
          `${where}: komentar blok /* ... */ tidak pernah ditutup — mulai baris ` +
            `${lineAt(source, i)}. blankNonCode tidak bisa menebak di mana ia seharusnya ` +
            `berakhir; perbaiki sumbernya (kutip/komentar yang belum ditutup).`,
        );
      }
      const end = close + 2;
      yield { kind: "blockcomment", start: i, end };
      i = end;
      continue;
    }

    if (c === '"') {
      const end = scanQuoted(source, i, '"');
      if (end === -1) {
        throw new Error(
          `${where}: string "..." tidak pernah ditutup — mulai baris ${lineAt(source, i)}. ` +
            `blankNonCode tidak bisa menebak di mana ia seharusnya berakhir; perbaiki ` +
            `sumbernya (kutip/komentar yang belum ditutup).`,
        );
      }
      yield { kind: "string", start: i, end };
      i = end;
      continue;
    }

    if (c === "'") {
      const end = scanQuoted(source, i, "'");
      if (end === -1) {
        throw new Error(
          `${where}: rune literal '...' tidak pernah ditutup — mulai baris ${lineAt(source, i)}. ` +
            `blankNonCode tidak bisa menebak di mana ia seharusnya berakhir; perbaiki ` +
            `sumbernya (kutip/komentar yang belum ditutup).`,
        );
      }
      yield { kind: "rune", start: i, end };
      i = end;
      continue;
    }

    if (c === "`") {
      const close = source.indexOf("`", i + 1);
      if (close === -1) {
        throw new Error(
          `${where}: raw string \`...\` tidak pernah ditutup — mulai baris ${lineAt(source, i)}. ` +
            `blankNonCode tidak bisa menebak di mana ia seharusnya berakhir; perbaiki ` +
            `sumbernya (kutip/komentar yang belum ditutup).`,
        );
      }
      const end = close + 1;
      yield { kind: "rawstring", start: i, end };
      i = end;
      continue;
    }

    i++;
  }
}

/**
 * Gagal NYARING (throw, sebut `where` + baris mulai) kalau `source` memuat lexeme berkutip
 * yang TIDAK PERNAH DITUTUP. Sekadar men-drain `walkLexemes` — validasinya sendiri hidup di
 * generator itu — satu sumber kebenaran.
 *
 * Ini yang membuat `blankNonCode` di bawah AMAN menebak batas lexeme: begitu fungsi ini
 * lolos tanpa melempar, setiap lexeme berkutip di `source` dijamin punya penutup, jadi
 * `blankNonCode` tidak pernah perlu menebak "sampai mana isi ini seharusnya di-blank" — beda
 * dengan pemisah lama tangan-sendiri yang diam-diam memotong
 * berkas di titik manapun ia kehabisan input tanpa menyadari itu tanda kerusakan:
 * `if (lineEnd === -1) break;`.
 *
 * Dipanggil dari `blankNonCode` sendiri di awal (bukan tanggung jawab pemanggil untuk ingat
 * memanggil keduanya) — tetap diekspor supaya bisa dipanggil berdiri sendiri kalau perlu
 * pesan gagal SEBELUM operasi lain (mis. sebelum membaca berkas berikutnya dalam sebuah loop).
 */
export function assertModeledLexemes(source: string, where: string): void {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  for (const _span of walkLexemes(source, where)) {
    // Men-drain generator sudah cukup — validasi (throw) hidup di dalam walkLexemes.
  }
}

/**
 * Kembalikan `source` dengan panjang **sama persis** (baris dan offset karakter tidak
 * bergeser — baris baru selalu dipertahankan apa adanya), di mana isi KELIMA bentuk
 * "bukan kode struktural" Go diganti spasi:
 *
 *   - komentar baris `// ...` (sampai akhir baris)
 *   - komentar blok `/* ... *\/` (boleh membentang banyak baris)
 *   - string `"..."` (menghormati escape `\"`, tidak berhenti di kutip yang di-escape)
 *   - raw string `` `...` `` (boleh membentang banyak baris, tanpa escape — aturan Go)
 *   - rune literal `'...'` (menghormati escape `\'`, mesinnya sama seperti string)
 *
 * Delimiter (`//`, `/* *\/`, kutip pembuka/penutup) IKUT diganti spasi, bukan cuma isinya —
 * supaya pemanggil yang cuma peduli "apakah identifier telanjang X muncul di sini" (mis.
 * checkModuleWiring) tidak perlu tahu apa pun soal sintaks komentar/string/rune sama sekali:
 * cukup jalankan regex identifier atas hasil `blankNonCode`. Ini juga menutup M1 (review
 * identifier yang cuma DISEBUT di dalam string literal (mis.
 * `metrics.Tag("laporan.Register")`) tidak lagi salah terbaca sebagai kode sungguhan,
 * karena isi string ikut di-blank, bukan cuma isi komentar.
 *
 * Pemanggil yang butuh NILAI SUNGGUHAN (path literal, kode permission) tetap membaca dari
 * `source` ASLI pada offset yang sama — `blankNonCode` cuma dipakai untuk pemeriksaan
 * STRUKTURAL (batas kurung/kurawal, kemunculan identifier telanjang), karena panjangnya
 * dijamin sama sehingga offset di kedua versi selalu selaras.
 *
 * Memanggil `assertModeledLexemes(source, where)` DULU secara implisit (lewat `walkLexemes`
 * yang sama) — jadi pemanggil cukup memanggil fungsi ini SENDIRIAN untuk dapat jaminan penuh
 * (blanking + gagal-nyaring untuk lexeme tak tertutup), tidak perlu ingat memanggil dua
 * fungsi berurutan. Kalau sumbernya benar-benar rusak (kutip/komentar tak tertutup),
 * `blankNonCode` melempar SEBELUM mengembalikan apa pun yang keliru terlihat masuk akal.
 */
export function blankNonCode(source: string, where: string): string {
  return blankSpans(source, where, () => true);
}

/**
 * Kembalikan `source` dengan panjang **sama persis** (offset tidak bergeser), di mana HANYA
 * isi komentar (`// ...` dan `/* ... *\/`) diganti spasi — string `"..."`, raw string
 * `` `...` ``, dan rune literal `'...'` dibiarkan UTUH.
 *
 * Ini pasangan yang hilang dari `blankNonCode`.
 * Pembagian kerjanya:
 *
 *   - **POSISI** (di mana pemanggilan rute mulai, batas kurung/kurawal) → `blankNonCode`.
 *     Segala sesuatu yang cuma DISEBUT di dalam komentar/string/raw-string/rune sudah jadi
 *     spasi, jadi tak pernah bisa dikira kode struktural.
 *   - **NILAI** (literal path, kode permission) → `blankComments`. `blankNonCode` tidak bisa
 *     dipakai di sini karena nilai-nilai itu SENDIRI adalah string, jadi di sana mereka ikut
 *     jadi spasi. Membacanya dari `source` MENTAH juga salah, dan itu lubang yang sudah menggigit:
 *     baris yang DIKOMENTARI di dalam kurung pemanggilan rute ikut terbaca sebagai argumen
 *     sungguhan, sehingga guard permission yang dicabut (`// tenancy.RequirePermission(...)`)
 *     tetap dilaporkan sebagai guard — gate HIJAU untuk endpoint yang Go layani tanpa
 *     proteksi apa pun.
 *
 * Karena ketiga teks (`source`, hasil `blankNonCode`, hasil `blankComments`) panjangnya
 * dijamin identik, offset di ketiganya selalu sejajar: POSISI boleh diambil dari yang satu
 * dan NILAI dari yang lain, pada offset yang SAMA.
 *
 * Sama seperti `blankNonCode`, memanggil `assertModeledLexemes` secara implisit lewat
 * `walkLexemes` yang sama — satu panggilan sudah cukup untuk dapat jaminan penuh.
 */
export function blankComments(source: string, where: string): string {
  return blankSpans(source, where, (kind) => kind === "linecomment" || kind === "blockcomment");
}

/**
 * Mesin bersama `blankNonCode`/`blankComments`: satu jalan atas `walkLexemes`, mengganti
 * span yang dipilih `shouldBlank` dengan spasi (baris baru dipertahankan apa adanya supaya
 * nomor baris dan offset tidak bergeser), dan membiarkan sisanya apa adanya.
 */
function blankSpans(
  source: string,
  where: string,
  shouldBlank: (kind: LexemeSpan["kind"]) => boolean,
): string {
  let out = "";
  let cursor = 0;

  for (const span of walkLexemes(source, where)) {
    // Span yang TIDAK di-blank tetap harus melewati `walkLexemes` (validasi lexeme tak
    // tertutup jalan untuk SEMUA bentuk, bukan cuma yang di-blank) — ia cuma disalin apa
    // adanya lewat `source.slice` berikutnya, jadi cukup jangan menggeser `cursor`.
    if (!shouldBlank(span.kind)) continue;

    out += source.slice(cursor, span.start); // kode sungguhan sebelum span ini, apa adanya
    for (let i = span.start; i < span.end; i++) {
      out += source[i] === "\n" ? "\n" : " "; // isi + delimiter span diganti spasi, baris baru dipertahankan
    }
    cursor = span.end;
  }
  out += source.slice(cursor); // sisa kode sungguhan sesudah span terakhir

  return out;
}

/**
 * Kembalikan indeks awal (posisi karakter `/` pertama) tiap komentar blok `/* *\/` SUNGGUHAN
 * di `source` — yaitu yang bukan cuma DISEBUT di dalam bentuk lain (string, raw string,
 * rune literal, atau di dalam komentar baris `//`). Dipakai `routes.ts`'s
 * pendeteksi komentar blok: sebelum ini, deteksinya lewat lexer
 * tangan-sendiri yang cuma sadar string `"..."` — buta terhadap rune literal (`'"'`
 * mematikan deteksi komentar blok sungguhan di baris berikutnya, menghasilkan rute hantu)
 * dan raw string (isi `` `/* ...` `` false-positive melempar "komentar blok" padahal tak
 * ada). Memakai `walkLexemes` yang sama dengan `blankNonCode` menutup keduanya sekaligus —
 * kebijakan (routes.ts tetap MENOLAK komentar blok) tidak berubah, cuma mesinnya disatukan.
 */
export function findBlockCommentStarts(source: string, where: string): number[] {
  const starts: number[] = [];
  for (const span of walkLexemes(source, where)) {
    if (span.kind === "blockcomment") starts.push(span.start);
  }
  return starts;
}
