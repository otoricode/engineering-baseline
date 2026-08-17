/**
 * # Gate yang dimainkan berkas ini
 *
 * - **`gate:contract-request-body`** — `nullable` di badan permintaan ([[C-04]]), beserta baseline
 *   shrink-only-nya ([[G-03]]).
 *
 * Satu berkas boleh memainkan lebih dari satu gate, dan tiap gate yang ia mainkan disebutkan di
 * blok ini. Alasannya prosedural: [[G-01]] menyuruh pembaca meng-grep SUMBER GATE untuk ID
 * aturannya, jadi nama gate yang tak pernah muncul di sumber mana pun membuat prosedur itu
 * memulangkan nol hasil — dan nol hasil dibaca sebagai "aturannya tak bertuan", padahal
 * penegaknya ada.
 *
 * Nullability skema data berlaku untuk RESPONS SAJA; skema masukan memakai *optional*, yang
 * menolak nilai null.
 *
 * **Kenapa ini berkas TERSENDIRI dan bukan satu blok di dalam gate envelope:** pemisahannya
 * BAGIAN DARI ATURANNYA. Nama gate menjadi pesan gagal, jadi gate bernama envelope akan mengirim
 * orang membaca aturan envelope untuk cacat yang letaknya di MASUKAN — dan orang itu akan sampai
 * pada paragraf yang tidak menjelaskan apa pun tentang temuannya. Di proyek asal kedua
 * pemeriksaan ini memang satu berkas; menyalinnya begitu saja akan membawa serta cacat yang
 * [[C-04]] sebut secara eksplisit.
 *
 * Cakupannya SELURUH tag, bukan hanya yang opt-in envelope: `nullable` di badan permintaan selalu
 * salah, terlepas dari sudah-belumnya sebuah tag bermigrasi.
 *
 * `$ref` DIURAI dulu. Sejak bentuk payload pindah ke komponen bersama, skema `requestBody` di
 * `paths` sering hanya `{$ref: …}` — dan mencari `nullable` di dalamnya SELALU nihil. Itu bukan
 * perbaikan, itu pengukur yang berhenti mengukur: baselinenya lalu melaporkan "turun jadi 0" dan
 * mengunci nol palsu.
 */
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { muatKonteks } from "./konteks.js";
import { bacaBaseline } from "./lib/envelopeOptIn.js";

const METODE = ["get", "post", "put", "delete", "patch"];

const { jalur, t, aturan } = await muatKonteks();

const berkasOptIn = jalur.ledger("envelopeOptIn");
const baseline = bacaBaseline(JSON.parse(readFileSync(berkasOptIn, "utf8")) as unknown);

const bundle = parse(readFileSync(jalur.bundle(), "utf8")) as {
  paths?: Record<string, Record<string, any>>;
  components?: { schemas?: Record<string, unknown> };
};

/**
 * Uraikan `$ref` internal jadi isinya, rekursif. Simpul yang sudah dikunjungi dikembalikan apa
 * adanya supaya skema rekursif — yang SAH — tidak membuat fungsi ini berputar selamanya.
 */
function uraikan(node: any, seen: ReadonlySet<string> = new Set()): any {
  if (node === null || typeof node !== "object") return node;
  if (Array.isArray(node)) return node.map((v) => uraikan(v, seen));
  if (typeof node.$ref === "string") {
    const nama = node.$ref.split("#/components/schemas/")[1];
    if (!nama || seen.has(nama)) return node;
    const target = bundle.components?.schemas?.[nama];
    if (target === undefined) return node;
    return uraikan(target, new Set([...seen, nama]));
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) out[k] = uraikan(v, seen);
  return out;
}

const pelanggar: string[] = [];
for (const [urlPath, ops] of Object.entries(bundle.paths ?? {})) {
  for (const [method, op] of Object.entries(ops)) {
    if (!METODE.includes(method)) continue;
    const badan = uraikan(op?.requestBody?.content?.["application/json"]?.schema);
    if (badan && JSON.stringify(badan).includes('"nullable":true')) {
      pelanggar.push(`${method.toUpperCase()} ${urlPath}`);
    }
  }
}

// Baselinenya menyusut, dan TURUN pun gagal — dengan perintah menurunkan angkanya di commit yang
// sama. Bedanya dari baseline yang cuma melarang naik: daftar ini berhingga, tiap barisnya cacat,
// dan satu-satunya arah yang sah adalah turun. Entri basi yang cuma memperingatkan menghasilkan
// mode gagal terburuk di kelasnya ([[G-03]] butir 1).
if (pelanggar.length !== baseline.badanNullable) {
  // DUA kunci, bukan satu kunci dengan kata arahnya disuntikkan sebagai variabel. Bentuk yang
  // menyuntikkan (`arah: naik ? "NAIK" : "turun"`) lolos paritas kunci DAN paritas nama variabel,
  // lalu mencetak kata Indonesia di tengah kalimat Inggris — terbukti saat gate ini dijalankan
  // dengan `language: "en"`. Kata yang berbeda per bahasa adalah PESAN, bukan variabel.
  const naik = pelanggar.length > baseline.badanNullable;
  console.error(
    `${aturan.label("contract", "04")} ${t(naik ? "kontrak.badan.nullable_naik" : "kontrak.badan.nullable_turun", {
      jumlah: String(pelanggar.length),
      baseline: String(baseline.badanNullable),
      berkas: berkasOptIn,
      operasi: pelanggar.join(", ") || "-",
    })}`,
  );
  console.error(aturan.footer("contract", "04"));
  process.exit(1);
}

console.log(
  t("kontrak.badan.ok", { jumlah: String(pelanggar.length), baseline: String(baseline.badanNullable) }),
);
