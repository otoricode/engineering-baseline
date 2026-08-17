/**
 * Bungkus setiap respons sukses ber-JSON milik satu tag ke envelope sukses, dan tukar respons
 * gagalnya ke envelope gagal ([[C-01]]).
 *
 * Pemakaian: `apply-envelope --tag <tag|operationId> [--apply]`
 *
 * WAJIB skrip, bukan tangan, dan itu bagian dari aturannya: ditulis tangan ratusan kali envelope
 * pasti menyimpang — terukur, 30 dari 39 operasi di satu tag menulis ulang entitas yang sama
 * inline, 8591 baris untuk 39 operasi.
 *
 * Idempoten: skema yang sudah terbungkus dilewati, bukan dibungkus dua kali.
 *
 * DUA LINTASAN, dan itu bukan gaya. Versi satu-lintasan menulis di akhir tiap berkas, sebelum
 * seluruh run selesai diperiksa — kalau berkas lain (atau operasi lain di berkas yang sama) punya
 * bentuk yang tidak dikenali, operasi yang sudah tersentuh ditinggalkan SETENGAH BERMIGRASI oleh
 * run yang toh berakhir gagal. Itu lebih buruk daripada tidak menulis apa pun: run berikutnya
 * berangkat dari campuran dua bentuk. Di sini isi dokumen dimutasi di memori, dan tidak satu
 * penulisan pun terjadi sampai SELURUH run terbukti bersih.
 */
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { isMap, isSeq, parseDocument, YAMLMap } from "yaml";
import { muatKonteks } from "./konteks.js";
import { bacaBendera, BENDERA_APPLY, buatRencana } from "./argumen.js";

const METODE = ["get", "post", "put", "delete", "patch"];

const { jalur, t, aturan } = await muatKonteks();
const bendera = bacaBendera(process.argv.slice(2), [BENDERA_APPLY, { nama: "tag", berNilai: true }], t);

const tag = bendera.nilai("tag");
if (!tag) {
  console.error(t("kontrak.penerap.pemakaian"));
  process.exit(1);
}

const dirFitur = jalur.fitur();
const refSukses = jalur.refShared("envelope", "#/components/schemas/SuccessEnvelope");
const refGagal = jalur.refShared("envelope", "#/components/schemas/FailureEnvelope");
const refRespGagal = jalur.refShared("envelope", "#/components/responses/Failure");
const refRespValidasi = jalur.refShared("envelope", "#/components/responses/ValidationFailure");

// Properti saudara `data` pada skema sukses warisan. `metaData` dibawa VERBATIM (ia berisi hal
// nyata — paginasi list — dan menghilangkannya adalah kehilangan informasi); `message`/`status`/
// `code` dibuang karena envelope sudah menyediakannya. Apa pun DI LUAR kedua kelompok itu
// dilaporkan lalu run dibatalkan: menebak pola pembuangan untuk properti yang belum pernah
// diperiksa maknanya adalah cara data hilang tanpa ada yang tahu.
const BUANG_DIAM = new Set(["data", "message", "status", "code"]);
const BAWA_VERBATIM = "metaData";
const KOMPONEN_GAGAL_SUDAH_V2 = /#\/components\/responses\/(Unauthenticated|Forbidden|Failure|ValidationFailure)$/;
const KOMPONEN_VALIDASI_LAMA = /#\/components\/responses\/(ZodValidationError|ValidationError)$/;
const KOMPONEN_GAGAL_LAMA = /#\/components\/responses\/(FailureResponse|ErrorResponse)$/;

let dibungkus = 0, sudahV2 = 0, nonJson = 0;
let refDitukar = 0, refDilewati = 0, inlineDitulisUlang = 0;
let operasiCocok = 0;
let buangMessage = 0, buangStatus = 0, buangCode = 0;
let buangMetaKosong = 0, pangkasMetaKosong = 0;
const refTakDikenal: string[] = [];
const propTakDikenal: string[] = [];
const tertunda: { jalur: string; isi: string }[] = [];

for (const berkas of readdirSync(dirFitur).filter((f) => f.endsWith(".yaml"))) {
  const jalurBerkas = join(dirFitur, berkas);
  const doc = parseDocument(readFileSync(jalurBerkas, "utf8"));
  const paths = doc.get("paths");
  if (!isMap(paths)) continue;
  let berubah = false;

  for (const pathItem of paths.items) {
    const urlPath = String(pathItem.key);
    const ops = pathItem.value;
    if (!isMap(ops)) continue;

    for (const opEntry of (ops as YAMLMap).items) {
      const method = String(opEntry.key).toLowerCase();
      if (!METODE.includes(method)) continue;
      const op = opEntry.value as YAMLMap;

      // Penerap dipanggil dengan SATU sasaran, jadi sasarannya cocok kalau tag-nya sama ATAU
      // operationId-nya persis sama (bentuk untuk memindahkan satu operasi tunggal).
      const tags = op.get("tags");
      const opId = String(op.get("operationId") ?? "");
      if (!(isSeq(tags) && tags.items.some((x) => String(x) === tag)) && opId !== tag) continue;
      operasiCocok++;

      const responses = op.get("responses");
      if (!isMap(responses)) continue;

      for (const resEntry of (responses as YAMLMap).items) {
        const kode = String(resEntry.key);
        const label = `${method.toUpperCase()} ${urlPath} ${kode}`;
        const res = resEntry.value;
        if (!isMap(res)) continue;

        // Respons yang ditulis sebagai `$ref` ke komponen bersama TIDAK punya `content`. Versi
        // yang langsung mencari `content` membuangnya diam-diam — dan di tag percontohan, 18 dari
        // 18 respons gagalnya berbentuk `$ref`. Penerap itu akan mencetak "N dibungkus" tanpa
        // menyebut bahwa NOL respons gagal dipindahkan. Migrasinya penukaran `$ref`, bukan
        // penulisan skema inline.
        const ref = String(res.get("$ref") ?? "");
        if (ref) {
          if (KOMPONEN_GAGAL_SUDAH_V2.test(ref)) {
            refDilewati++;
          } else if (KOMPONEN_VALIDASI_LAMA.test(ref)) {
            res.set("$ref", refRespValidasi);
            refDitukar++; berubah = true;
          } else if (KOMPONEN_GAGAL_LAMA.test(ref)) {
            res.set("$ref", refRespGagal);
            refDitukar++; berubah = true;
          } else {
            // Jangan menebak. Komponen di luar nama yang dikenal belum pernah diperiksa maknanya.
            refTakDikenal.push(
              `${aturan.label("contract", "01")} ${t("kontrak.penerap.ref_tak_dikenal", {
                berkas,
                operasi: label,
                ref,
              })}`,
            );
          }
          continue;
        }

        const content = res.get("content");
        if (!isMap(content)) continue;
        const json = content.get("application/json");
        const sukses = /^2/.test(kode);

        // Respons non-JSON tidak dibungkus sama sekali ([[C-01]]).
        if (!json) { if (sukses) nonJson++; continue; }
        if (!isMap(json)) continue;

        const schema = json.get("schema");
        if (sukses) {
          if (isMap(schema) && schema.has("allOf")) {
            sudahV2++;
            // Bersihkan `metaData: {}` warisan migrasi LAMA bahkan saat skema sudah v2 — itulah
            // yang membuat "jalankan ulang penerap" cukup untuk membereskan operasi yang dibungkus
            // versi sebelumnya, tanpa menyunting balik ke bentuk warisan dulu.
            const allOf = schema.get("allOf");
            if (isSeq(allOf)) {
              for (const bagian of allOf.items) {
                if (!isMap(bagian)) continue;
                const props = bagian.get("properties");
                if (!isMap(props)) continue;
                const md = props.get(BAWA_VERBATIM);
                if (isMap(md) && (md as YAMLMap).items.length === 0) {
                  (props as YAMLMap).delete(BAWA_VERBATIM);
                  const req = bagian.get("required");
                  if (isSeq(req)) {
                    const i = req.items.findIndex((n) => String(n) === BAWA_VERBATIM);
                    if (i >= 0) req.items.splice(i, 1);
                  }
                  pangkasMetaKosong++; berubah = true;
                }
              }
            }
            continue;
          }

          const props = isMap(schema) ? schema.get("properties") : undefined;
          const payload =
            isMap(props) && props.has("data") ? props.get("data") : doc.createNode({ type: "object" });

          const propsBaru: Record<string, unknown> = { data: payload };
          let adaTakDikenal = false;
          let metaDibawa = false;
          if (isMap(props)) {
            for (const propEntry of (props as YAMLMap).items) {
              const nama = String(propEntry.key);
              if (nama === "data") continue;
              if (nama === BAWA_VERBATIM) {
                // `metaData: {}` (objek TANPA properti) tidak dibawa: envelope sudah
                // mendeklarasikan `metaData` sendiri, jadi override kosong tidak menambah batasan
                // apa pun — cuma derau yang akan tersalin ke setiap tag berikutnya.
                if (isMap(propEntry.value) && (propEntry.value as YAMLMap).items.length === 0) {
                  buangMetaKosong++;
                } else {
                  propsBaru[nama] = propEntry.value;
                  metaDibawa = true;
                }
                continue;
              }
              if (BUANG_DIAM.has(nama)) {
                if (nama === "message") buangMessage++;
                else if (nama === "status") buangStatus++;
                else buangCode++;
                continue;
              }
              propTakDikenal.push(
                `${aturan.label("contract", "01")} ${t("kontrak.penerap.properti_tak_dikenal", {
                  berkas,
                  operasi: label,
                  properti: nama,
                })}`,
              );
              adaTakDikenal = true;
            }
          }
          if (adaTakDikenal) continue; // jangan tulis skema separuh-jalan untuk operasi ini

          // "Verbatim" mencakup WAJIB-tidaknya, bukan cuma bentuknya: kalau skema lama juga
          // mewajibkan `metaData`, kewajiban itu ikut. Kalau tidak, klien generated menghasilkan
          // field opsional untuk sesuatu yang kontraknya dulu MENJAMIN ada.
          const reqLama = isMap(schema) ? schema.get("required") : undefined;
          const namaReqLama = isSeq(reqLama) ? reqLama.items.map((n) => String(n)) : [];
          const reqBaru = metaDibawa && namaReqLama.includes(BAWA_VERBATIM) ? ["data", BAWA_VERBATIM] : ["data"];

          json.set(
            "schema",
            doc.createNode({
              allOf: [{ $ref: refSukses }, { type: "object", required: reqBaru, properties: propsBaru }],
            }),
          );
          dibungkus++; berubah = true;
        } else if (/^[45]/.test(kode) || kode === "default") {
          // `default` ikut — ia respons GAGAL, dan yang paling banyak dipakai.
          json.set("schema", doc.createNode({ $ref: refGagal }));
          inlineDitulisUlang++; berubah = true;
        }
      }
    }
  }
  if (berubah) tertunda.push({ jalur: jalurBerkas, isi: String(doc) });
}

// Nol operasi tercocok TIDAK memakai baris ringkas biasa: "0 dibungkus / 0 sudah v2 / …" tidak
// bisa dibedakan dari "tag ini sudah selesai bermigrasi".
if (operasiCocok === 0) {
  console.error(t("kontrak.penerap.nol_operasi", { tag }));
  process.exit(1);
}

console.log(
  t("kontrak.penerap.ringkas", {
    tag,
    dibungkus: String(dibungkus),
    sudahV2: String(sudahV2),
    nonJson: String(nonJson),
    refDitukar: String(refDitukar),
    inline: String(inlineDitulisUlang),
    refDilewati: String(refDilewati),
    buangMessage: String(buangMessage),
    buangStatus: String(buangStatus),
    buangCode: String(buangCode),
    buangMetaKosong: String(buangMetaKosong),
    pangkasMetaKosong: String(pangkasMetaKosong),
  }),
);

if (refTakDikenal.length) {
  console.error(t("kontrak.penerap.judul_ref_tak_dikenal", { jumlah: String(refTakDikenal.length) }));
  for (const u of refTakDikenal) console.error(`  ${u}`);
}
if (propTakDikenal.length) {
  console.error(t("kontrak.penerap.judul_properti_tak_dikenal", { jumlah: String(propTakDikenal.length) }));
  for (const u of propTakDikenal) console.error(`  ${u}`);
}
if (refTakDikenal.length || propTakDikenal.length) {
  // Lintasan tulis TIDAK pernah dijalankan. Pohon kerja identik dengan sebelum run ini, termasuk
  // untuk berkas yang pelanggarannya ada di OPERASI LAIN dalam berkas yang sama.
  console.error(t("kontrak.penerap.tidak_menulis"));
  console.error(aturan.footer("contract", "01"));
  process.exit(1);
}

const rencana = buatRencana(bendera.ada("apply"), t, (s) => console.log(s));
for (const w of tertunda) rencana.tambah(w.jalur, w.isi);
rencana.jalankan();
