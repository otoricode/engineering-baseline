import { readFile, readdir } from "node:fs/promises";
import path from "node:path";
import type { Subperintah } from "../cli.js";
import { LANGKAH } from "../gate/command.js";
import { akarPaket } from "../paket.js";
import { lintBerkasDikecualikan, lintFormat, parseRules, type Rule } from "./parse.js";
import {
  lintGateTerkirim,
  lintHitunganManual,
  lintRujukanDokumen,
  lintRules,
  lintTabelPenegak,
  type Temuan,
} from "./lint.js";

/**
 * Nama gate yang paket ini BENAR-BENAR kirim pelaksananya — dua sumber, keduanya sudah ada
 * sebelum pemeriksaan ini; yang belum ada adalah persilangannya dengan kolom penegak:
 *
 *   1. `LANGKAH[].gate` — gate yang `standard gate` jalankan sebagai skrip;
 *   2. nama `gate:*` yang muncul di `ci/*.template` — gate yang dikirim sebagai LANGKAH WORKFLOW
 *      alih-alih sebagai skrip (`gate:generated-sync` satu-satunya hari ini, dan ia sungguhan:
 *      resepnya meregenerasi lalu menuntut diff kosong).
 *
 * Dibaca dari `akarPaket()`, BUKAN dari saudara folder aturan: inventaris ini sifat paket INI, dan
 * `rules-lint` boleh dijalankan atas folder aturan yang disalin ke mana saja. Direktori `ci/` yang
 * tidak terbaca memulangkan himpunan yang lebih kecil, bukan galat — dan itu arah yang aman: gate
 * yang benar-benar dikirim lalu terbaca sebagai tidak dikirim akan MERAH, bukan lolos diam-diam.
 */
export async function gateTerkirim(): Promise<Set<string>> {
  const nama = new Set<string>();
  for (const l of LANGKAH) for (const g of l.gate) nama.add(g);

  const dirCi = path.join(akarPaket(), "ci");
  let berkas: string[];
  try {
    berkas = await readdir(dirCi);
  } catch {
    return nama;
  }
  for (const b of berkas) {
    const isi = await readFile(path.join(dirCi, b), "utf8").catch(() => "");
    for (const m of isi.matchAll(/gate:[a-z0-9-]+/g)) nama.add(m[0]);
  }
  return nama;
}

/**
 * Keempat pintu masuk dokumen — README peta paket, STANDARD entry manusia, AGENTS
 * entry agen, INSTALL prosedur pemasangan — dicari sebagai SAUDARA folder aturan
 * (`path.dirname(dir)`), bukan di CWD literal dan bukan di dalam `dir` itu sendiri.
 * Itu struktur paket ini: `rules/` bersebelahan dengan keempatnya di akar, jadi
 * `dir` default ("rules") memulangkan ".", dan direktori uji sementara yang tidak
 * punya saudara keempat berkas ini otomatis dilewati lewat "bila ada" di bawah —
 * bukan dilaporkan sebagai temuan. Copy paket ini yang belum menyalin salah satu
 * dari keempatnya tetap bisa menjalankan `rules-lint` atas aturannya sendiri.
 *
 * `INSTALL.md` ditambahkan di fix round 1 Task 15, dan ironi letaknya yang jadi
 * alasannya: ia menyitir `[[G-01]]`/`[[G-02]]`/`[[T-01]]`, sitirannya sempat cuma
 * diverifikasi TANGAN, dan ID yang kelak dicabut tidak akan memerahkannya. Itu
 * persis kelas yang paket ini habiskan lima belas task untuk memberantas —
 * dokumen tidak menahan, gate yang menahan — tersisa di berkas yang paling banyak
 * dibaca orang yang baru memasang paket ini.
 *
 * Diekspor supaya `dokumen.test.ts` mengadu daftar yang SAMA alih-alih menulis
 * ulang ketiga (kini keempat) namanya — dua daftar tangan yang wajib cocok tanpa
 * apa pun yang mengikatnya adalah kelas cacat yang paket ini sudah tiga kali
 * perangi.
 */
export const DOKUMEN_PINTU_MASUK = ["README.md", "STANDARD.md", "AGENTS.md", "INSTALL.md"];

/**
 * Fix round 1 Task 12, Important 2: rujukan `[[ID]]` mati tidak cuma bisa muncul di
 * keempat pintu masuk di atas — tiap `skills/<nama>/SKILL.md` juga menunjuk ID, dan
 * sebelum ini TIDAK ADA yang memeriksanya. Rujukan salah alamat di sana tidak akan
 * pernah memerah selamanya kalau tidak ikut dipindai di sini — bukan cuma di paket
 * asal, tapi di tiap salinan yang dipasang di proyek lain juga (alasan yang sama
 * dengan kenapa `DOKUMEN_PINTU_MASUK` di atas dipindai per-copy, bukan cuma di CI
 * paket ini).
 *
 * Dipindai REKURSIF (`cariMarkdownRekursif`, bukan cuma top-level `skills/*.md`)
 * karena satu skill boleh punya lebih dari satu berkas `.md` di subfoldernya
 * sendiri. Ini HANYA memeriksa bahwa `[[ID]]` menunjuk ID yang hidup — sama
 * seperti `lintRujukanDokumen` untuk keempat pintu masuk di atas, ia TIDAK (dan
 * tidak bisa) memeriksa bahwa isinya menyalin klausa aturan alih-alih menunjuknya;
 * itu tetap `manual-review-only`.
 */
const DIR_SKILLS = "skills";

/**
 * Semua `.md` di bawah `dir`, rekursif, jalur relatif dinormalkan jadi absolut
 * (relatif terhadap `dir`) supaya pesan temuan `lintRujukanDokumen` menunjuk
 * berkas yang bisa langsung dibuka, bukan jalur relatif yang ambigu. "Direktori
 * tidak ada" bukan kegagalan di sini — proyek yang belum punya `skills/` (atau
 * paket ini sebelum Task 12) tetap lulus `rules-lint`, bukan dilaporkan rusak.
 */
async function cariMarkdownRekursif(dir: string): Promise<string[]> {
  let relatif: string[];
  try {
    relatif = await readdir(dir, { recursive: true });
  } catch {
    return [];
  }
  return relatif
    .filter((r) => r.endsWith(".md"))
    .map((r) => path.join(dir, r))
    .sort();
}

export const rulesLint: Subperintah = async (argv, tulis) => {
  const dir = argv[0] ?? "rules";
  let isiDir: string[];
  try {
    isiDir = await readdir(dir);
  } catch {
    tulis(`direktori aturan tidak terbaca: ${dir}`);
    return 2;
  }

  const namaBerkas = isiDir.filter((n) => n.endsWith(".md") && n !== "README.md");
  // `README.md` dikecualikan dari pemindaian ATURAN, dan pengecualian itu perlu —
  // ia memuat contoh format ber-fence. Tapi pengecualian tanpa penjaga adalah
  // lubang: aturan yang ditaruh di sana lenyap tanpa satu pun sinyal. Jadi berkasnya
  // tetap DIBACA, hanya dengan pemeriksaan yang berbeda.
  const namaDikecualikan = isiDir.filter((n) => n === "README.md");

  const semua: Rule[] = [];
  const temuanFormat: Temuan[] = [];
  for (const nama of namaBerkas.sort()) {
    const jalur = path.join(dir, nama);
    const isi = await readFile(jalur, "utf8");
    semua.push(...parseRules(isi, jalur));
    temuanFormat.push(...lintFormat(isi, jalur));
  }
  for (const nama of namaDikecualikan) {
    const jalur = path.join(dir, nama);
    temuanFormat.push(...lintBerkasDikecualikan(await readFile(jalur, "utf8"), jalur));
  }

  const dirDokumen = path.dirname(dir);
  const dokumen: { berkas: string; isi: string }[] = [];
  for (const nama of DOKUMEN_PINTU_MASUK) {
    const jalur = path.join(dirDokumen, nama);
    try {
      dokumen.push({ berkas: jalur, isi: await readFile(jalur, "utf8") });
    } catch {
      // "bila ada" — belum disalin ke sini bukan kegagalan.
    }
  }

  // Fix round 1, butir 4: sebelumnya dokumen yang tidak ditemukan dilewati
  // TANPA satu kata pun — kalau `dir` menunjuk direktori yang saudaranya bukan
  // akar paket sungguhan (mis. rules disalin ke `docs/rules/` tapi
  // STANDARD.md/AGENTS.md tetap di akar repo), nol dokumen diperiksa dan tidak
  // ada yang memberitahu. Ikuti presedennya sendiri (baris "N aturan
  // diperiksa" beberapa baris di bawah): cetak jumlahnya SELALU, bukan cuma
  // saat ada temuan.
  tulis(
    `${dokumen.length} dari ${DOKUMEN_PINTU_MASUK.length} pintu masuk dokumen ditemukan di ${dirDokumen} (${DOKUMEN_PINTU_MASUK.join(", ")}).`,
  );

  // Dihitung TERPISAH dari baris di atas — baris itu tetap berarti "N dari 4", bukan
  // "N dari 4 + entah berapa berkas skill", karena jumlah berkas skill tidak tetap.
  // Ditambahkan ke `dokumen` SESUDAH baris dicetak, supaya `standardDoc.find` di
  // bawah tidak perlu berubah (tidak ada `skills/**/*.md` yang bernama STANDARD.md).
  const dirSkills = path.join(dirDokumen, DIR_SKILLS);
  const berkasSkills = await cariMarkdownRekursif(dirSkills);
  for (const jalur of berkasSkills) {
    dokumen.push({ berkas: jalur, isi: await readFile(jalur, "utf8") });
  }
  if (berkasSkills.length > 0) {
    tulis(`${berkasSkills.length} berkas markdown di ${dirSkills} ikut dipindai untuk rujukan [[ID]].`);
  }

  const standardDoc = dokumen.find((d) => path.basename(d.berkas) === "STANDARD.md");
  const temuan = [
    ...temuanFormat,
    ...lintRules(semua),
    ...lintGateTerkirim(semua, await gateTerkirim()),
    ...lintRujukanDokumen(dokumen, semua),
    ...lintTabelPenegak(semua, standardDoc),
    ...lintHitunganManual(semua, standardDoc),
  ];

  // Direktori terbaca tapi nol aturan terparse bukan keberhasilan — kemungkinan
  // besar folder yang salah ditunjuk (mis. saat memasang paket ini di proyek
  // lain). Diam-diam keluar 0 di sini akan terlihat hijau padahal tak memeriksa
  // apa-apa, jadi ini masuk daftar temuan seperti yang lain.
  if (semua.length === 0) {
    temuan.push({
      berkas: dir,
      baris: 0,
      pesan: `direktori ${dir} terbaca tapi tidak memuat satu aturan pun — periksa apakah ini folder aturan yang benar.`,
    });
  }

  for (const t of temuan) tulis(`${t.berkas}:${t.baris}: ${t.pesan}`);
  tulis(`${semua.length} aturan diperiksa, ${temuan.length} temuan.`);
  return temuan.length === 0 ? 0 : 1;
};
