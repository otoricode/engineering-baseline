/**
 * SEKALI JALAN saat mengadopsi standar ini: kumpulkan seluruh kode error literal yang dipakai
 * server, dikelompokkan jadi laporan yang bisa DIPUTUSKAN MANUSIA ([[C-02]]).
 *
 * Pemakaian: `bootstrap-error-codes [--konstruktor <NamaFungsi>] [--keluar <berkas>] [--apply]`
 *
 * Skrip ini TIDAK memutuskan pemetaan katalog — ia hanya menyiapkan bahannya. Katalognya ditulis
 * terpisah, dengan penilaian manusia per (kode, status, pesan). Alasannya ada di angkanya: tanpa
 * katalog, satu server mengumpulkan 145 kode berbeda — 106 SCREAMING_SNAKE dan 39 PascalCase —
 * dengan sinonim yang hidup berdampingan dan kode yang isinya cuma nama domain. Menormalkannya
 * adalah keputusan per kode, bukan transformasi mekanis.
 *
 * Dibaca lewat pemisah leksikal Go (`lib/goSource.ts`), BUKAN grep mentah atas teks: grep membaca
 * isi komentar dan string sebagai kode — kelas kesalahan yang sudah menggigit delapan kali di
 * proyek asal, termasuk satu lubang otorisasi ([[O-04]]).
 *
 * Pembagian kerja dua teks (panjangnya identik, offset selalu sejajar):
 *   `blanked`         POSISI — di mana pemanggilan mulai, di mana kurung penutupnya. Kemunculan
 *                     yang cuma DISEBUT di komentar/string sudah jadi spasi, jadi tak pernah cocok.
 *   `commentBlanked`  NILAI — argumennya tetap string literal utuh di sini.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { muatKonteks } from "./konteks.js";
import { bacaBendera, BENDERA_APPLY, buatRencana } from "./argumen.js";
import { blankComments, blankNonCode } from "./lib/goSource.js";

const { jalur, t } = await muatKonteks();
const bendera = bacaBendera(
  process.argv.slice(2),
  [BENDERA_APPLY, { nama: "konstruktor", berNilai: true }, { nama: "keluar", berNilai: true }],
  t,
);

// Nama konstruktor galat adalah milik proyek, bukan milik standar — jadi ia bendera, bukan
// konstanta. Defaultnya nama yang paling lazim; proyek yang menamainya lain menyebutkannya.
const konstruktor = bendera.nilai("konstruktor") ?? "NewXError";
const akarSumber = jalur.backend();

/**
 * Semua `*.go` di bawah `dir`, rekursif — TERMASUK berkas uji. Kode error yang dikembalikan uji
 * adalah kode error sungguhan juga; tidak ada alasan mengecualikannya dari inventaris. Yang ADA
 * alasannya adalah memisahkannya saat menghitung mayoritas, dan itu dilakukan di bawah.
 */
function daftarGo(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...daftarGo(full));
    else if (entry.name.endsWith(".go")) out.push(full);
  }
  return out;
}

/**
 * Pemisah argumen top-level: koma di luar kutip dan di luar kurung/kurawal/kurung-siku bersarang.
 * Aman menebak batas kutip tanpa mengecek EOF karena `s` berasal dari sumber yang sudah lolos
 * pemisah leksikal (kutip dijamin seimbang); kalau tidak, pemisahnya sudah melempar duluan.
 */
function pecahArgumen(s: string): string[] {
  const parts: string[] = [];
  let depth = 0;
  let cur = "";
  let i = 0;
  while (i < s.length) {
    const c = s[i]!;
    if (c === '"' || c === "'" || c === "`") {
      let j = i + 1;
      while (j < s.length) {
        if (c !== "`" && s[j] === "\\") { j += 2; continue; }
        if (s[j] === c) { j++; break; }
        j++;
      }
      cur += s.slice(i, j);
      i = j;
      continue;
    }
    if (c === "(" || c === "[" || c === "{") { depth++; cur += c; i++; continue; }
    if (c === ")" || c === "]" || c === "}") { depth--; cur += c; i++; continue; }
    if (c === "," && depth === 0) { parts.push(cur); cur = ""; i++; continue; }
    cur += c;
    i++;
  }
  parts.push(cur);
  // Go mengizinkan koma tertinggal sebelum kurung penutup saat argumen dipecah ke beberapa baris.
  // Segmen kosong sesudahnya BUKAN argumen tambahan, cuma whitespace penutup — dibuang di sini,
  // bukan diam-diam disamakan dengan argumen sungguhan yang kebetulan kosong.
  if (parts.length > 0 && parts[parts.length - 1]!.trim() === "") parts.pop();
  return parts.map((p) => p.trim());
}

function barisDi(source: string, idx: number): number {
  let baris = 1;
  for (let i = 0; i < idx; i++) if (source[i] === "\n") baris++;
  return baris;
}

/** Kurung `(` seimbang mulai `openIdx` di teks yang sudah di-blank. */
function kurungPasangan(blanked: string, openIdx: number): number {
  let depth = 0;
  for (let i = openIdx; i < blanked.length; i++) {
    if (blanked[i] === "(") depth++;
    else if (blanked[i] === ")") {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

type Panggilan = { code: string; status: string; message: string; berkas: string; baris: number; uji: boolean };
const panggilan: Panggilan[] = [];
const pola = new RegExp(`\\b${konstruktor.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\(`, "g");

for (const berkas of daftarGo(akarSumber)) {
  const source = readFileSync(berkas, "utf8");
  const blanked = blankNonCode(source, berkas);
  const commentBlanked = blankComments(source, berkas);

  for (const m of blanked.matchAll(pola)) {
    const idx = m.index;
    // Lewati DEKLARASI fungsinya sendiri — bukan pemanggilan, tidak punya argumen literal.
    if (blanked.slice(Math.max(0, idx - 5), idx) === "func ") continue;

    const openIdx = idx + konstruktor.length;
    const closeIdx = kurungPasangan(blanked, openIdx);
    if (closeIdx === -1) {
      throw new Error(
        t("kontrak.bootstrap.argumen_tak_seimbang", {
          lokasi: `${berkas}:${barisDi(source, idx)}`,
          konstruktor,
        }),
      );
    }

    const bagian = pecahArgumen(commentBlanked.slice(openIdx + 1, closeIdx));
    if (bagian.length !== 3) {
      throw new Error(
        t("kontrak.bootstrap.argumen_jumlah", {
          lokasi: `${berkas}:${barisDi(source, idx)}`,
          konstruktor,
          jumlah: String(bagian.length),
          bentuk: JSON.stringify(bagian.join(",").slice(0, 160)),
        }),
      );
    }
    const [argKode, argPesan, argStatus] = bagian as [string, string, string];
    const cocok = /^"((?:[^"\\]|\\.)*)"$/.exec(argKode);
    if (!cocok) {
      throw new Error(
        t("kontrak.bootstrap.argumen_bukan_literal", {
          lokasi: `${berkas}:${barisDi(source, idx)}`,
          konstruktor,
          argumen: JSON.stringify(argKode),
        }),
      );
    }
    panggilan.push({
      code: cocok[1]!,
      status: argStatus,
      message: argPesan,
      berkas,
      baris: barisDi(source, idx),
      uji: berkas.endsWith("_test.go"),
    });
  }
}

const perKode = new Map<string, Panggilan[]>();
for (const c of panggilan) {
  if (!perKode.has(c.code)) perKode.set(c.code, []);
  perKode.get(c.code)!.push(c);
}

// Kode SUNGGUHAN selalu berbentuk identifier. Entri yang GAGAL pola ini bukan salah baca skrip:
// di proyek asal semuanya terbukti BUG URUTAN ARGUMEN — konstruktornya dipanggil dengan pesan
// manusia di slot kode, sehingga argumen KEDUA yang memuat kode aslinya. Dipisah supaya kelompok
// di bawah cuma memproses kode sungguhan; kalau ikut campur, kalimat manusia akan salah dihitung
// sebagai "nama domain telanjang".
const berbentukId = (c: string) => /^[A-Za-z][A-Za-z0-9_]*$/.test(c);
const mencurigakan = [...perKode.entries()].filter(([c]) => !berbentukId(c));
const sungguhan = new Map([...perKode.entries()].filter(([c]) => berbentukId(c)));

// Untuk keputusan triase, yang relevan adalah perilaku PRODUKSI: uji boleh memanggil konstruktor
// dengan kode yang tak pernah muncul di jalur produksi, dan itu akan salah mewarnai "mayoritas".
const produksi = new Map(
  [...sungguhan.entries()]
    .map(([c, u]) => [c, u.filter((x) => !x.uji)] as const)
    .filter(([, u]) => u.length > 0),
);
const hanyaUji = [...sungguhan.entries()].filter(([c]) => !produksi.has(c));
const urut = [...sungguhan.entries()].sort((a, b) => b[1].length - a[1].length);
const urutProduksi = [...produksi.entries()].sort((a, b) => b[1].length - a[1].length);

const baris: string[] = [];
const tulis = (s: string) => baris.push(s);

tulis(
  t("kontrak.bootstrap.judul_kode", {
    konstruktor,
    total: String(panggilan.length),
    uji: String(panggilan.filter((c) => c.uji).length),
    mentah: String(perKode.size),
    sungguhan: String(sungguhan.size),
    produksi: String(produksi.size),
    hanyaUji: String(hanyaUji.length),
    tertukar: String(mencurigakan.length),
  }),
);

if (hanyaUji.length) {
  tulis("");
  tulis(t("kontrak.bootstrap.judul_hanya_test"));
  for (const [c, u] of hanyaUji.sort((a, b) => b[1].length - a[1].length)) {
    tulis(`  ${String(u.length).padStart(4)}  ${c}  [${u[0]!.berkas}:${u[0]!.baris}]`);
  }
}

if (mencurigakan.length) {
  tulis("");
  tulis(t("kontrak.bootstrap.judul_argumen_tertukar", { konstruktor }));
  for (const [pesanSebagaiKode, u] of mencurigakan.sort((a, b) => b[1].length - a[1].length)) {
    tulis(`  argumen-1="${pesanSebagaiKode}" (${u.length}x)`);
    for (const x of u) tulis(`      argumen-2="${x.message}"  status=${x.status}  [${x.berkas}:${x.baris}]`);
  }
}

/** Satu bagian "membentang lebih dari satu status" — dipakai dua kali supaya cara hitungnya sama. */
function tulisLintasStatus(rows: [string, Panggilan[]][]) {
  for (const [code, u] of rows) {
    const statuses = new Set(u.map((x) => x.status));
    if (statuses.size <= 1) continue;
    tulis(`  ${code} (${u.length}x) — status: ${[...statuses].sort().join(", ")}`);
    const perStatus = new Map<string, Panggilan[]>();
    for (const x of u) {
      if (!perStatus.has(x.status)) perStatus.set(x.status, []);
      perStatus.get(x.status)!.push(x);
    }
    for (const [status, xs] of [...perStatus.entries()].sort((a, b) => b[1].length - a[1].length)) {
      tulis(`      ${status.padStart(3)} (${String(xs.length).padStart(3)}x)  ${xs[0]!.message}  [${xs[0]!.berkas}:${xs[0]!.baris}]`);
    }
  }
}

tulis("");
tulis(t("kontrak.bootstrap.judul_lintas_status"));
tulisLintasStatus(urutProduksi);

tulis("");
tulis(t("kontrak.bootstrap.judul_domain_telanjang"));
for (const [c, u] of urutProduksi.filter(([c]) => !c.includes("_") && /^[A-Z][a-z]/.test(c))) {
  tulis(`  ${String(u.length).padStart(4)}  ${c}`);
}

tulis("");
for (const [c, u] of urut) tulis(`  ${String(u.length).padStart(4)}  ${c}`);

const laporan = baris.join("\n") + "\n";
console.log(laporan);

// Laporan hanya DITULIS kalau diminta: defaultnya ia keluaran layar, bukan berkas — sebuah skrip
// inventaris yang menaruh berkas di tempat tak terduga adalah efek samping yang tak seorang pun
// minta. Tujuannya pun datang dari bendera, bukan dari jalur temp yang dipaku.
const tujuan = bendera.nilai("keluar");
if (tujuan !== undefined) {
  const rencana = buatRencana(bendera.ada("apply"), t, (s) => console.log(s));
  rencana.tambah(tujuan, laporan);
  rencana.jalankan();
}
