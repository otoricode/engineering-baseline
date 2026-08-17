/**
 * # Gate yang dimainkan berkas ini
 *
 * - **`gate:contract-envelope`** — bentuk envelope tunggal untuk seluruh respons JSON ([[C-01]]);
 *   baseline hitungan operasi belum-diimplementasi ([[G-03]]); dan buku besar opt-in envelope
 *   diperiksa terhadap kenyataan, dua arah ([[G-05]]).
 *
 * Satu berkas boleh memainkan lebih dari satu gate, dan tiap gate yang ia mainkan disebutkan di
 * blok ini. Alasannya prosedural: [[G-01]] menyuruh pembaca meng-grep SUMBER GATE untuk ID
 * aturannya, jadi nama gate yang tak pernah muncul di sumber mana pun membuat prosedur itu
 * memulangkan nol hasil — dan nol hasil dibaca sebagai "aturannya tak bertuan", padahal
 * penegaknya ada.
 *
 * Satu bentuk sukses dan satu bentuk gagal untuk seluruh respons JSON, diperiksa HANYA untuk tag yang sudah opt-in di buku besar. Tag lain belum digarap
 * dan tidak diperiksa — itu allowlist [[G-02]], bukan pengampunan.
 *
 * Pengenalan envelope di sini STRUKTURAL, bukan berdasarkan nama, dan itu keputusan yang dibayar
 * mahal sekali. Versi berbasis nama mencocokkan substring nama skema, dan di bundel yang sama ADA
 * DUA skema berbeda yang sama-sama cocok: envelope warisan (kode opsional, punya `data`) dan
 * envelope v2 (kode wajib, tanpa `data`). Substringnya cocok dengan KEDUANYA, jadi envelope
 * warisan lolos sebagai kalau-kalau v2. Nama bersufiks angka juga bikinan bundler saat dua
 * definisi bertabrakan — bergantung padanya rapuh.
 *
 * Tiga cacat lain yang membuat versi pertama gate ini LOLOS pada hampir semua respons gagal,
 * ketiganya berarah "hijau padahal salah", dan semuanya diukur bukan diperkirakan:
 *
 *  (1) Respons berbentuk `$ref` DILEWATI. Kodenya membaca `res.content[...]`, tapi respons
 *      bersama ditulis sebagai `$ref` ke komponen respons — objek itu tidak punya `content`, jadi
 *      seluruh pemeriksaan dibuang. Sebaran nyata: 2234 dari 2383 respons gagal (94%) berbentuk
 *      `$ref`; untuk tag percontohannya, 18 dari 18. Gate mencetak OK setelah memeriksa NOL
 *      respons gagal.
 *  (2) `default` bukan 4xx maupun 5xx, jadi cabang mana pun tidak jalan — padahal `default`
 *      adalah respons gagal TERBANYAK (679 rujukan).
 *  (3) Predikat sukses yang cuma menuntut `status.enum === ["success"]` di salah satu bagian
 *      menyatakan 532 dari 675 respons yang BELUM bermigrasi sebagai "sudah v2"; nol dari 532
 *      itu memakai `allOf`. Karena itu bentuk teratas WAJIB `allOf` — itulah yang membedakan
 *      "sudah dibungkus penerap" dari "kebetulan punya field status bernilai success".
 *
 * `nullable` di badan permintaan TIDAK diperiksa di sini walau ia juga aturan lapis kontrak: ia
 * milik gate `contract-request-body`, dan pemisahannya bagian dari aturannya ([[C-04]]) — nama
 * gate menjadi pesan gagal, jadi gate bernama envelope akan mengirim orang membaca aturan
 * envelope untuk cacat yang letaknya di MASUKAN.
 */
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { muatKonteks } from "./konteks.js";
import { buatPengumpul, type Lapis } from "./aturan.js";
import {
  bacaBaseline,
  entriMentah,
  isEmpty,
  isOptedIn,
  parseOptIn,
  splitEntry,
} from "./lib/envelopeOptIn.js";

const METODE = ["get", "post", "put", "delete", "patch"];
const BATAS_TAMPIL = 100;

const { jalur, t, aturan } = await muatKonteks();

const berkasOptIn = jalur.ledger("envelopeOptIn");
const mentahOptIn = JSON.parse(readFileSync(berkasOptIn, "utf8")) as unknown;
const daftarEntri = entriMentah(mentahOptIn, berkasOptIn, t);
const optIn = parseOptIn(mentahOptIn, berkasOptIn, t);
const baseline = bacaBaseline(mentahOptIn);

// Daftar KOSONG itu SAH, dan gate tetap berjalan penuh. Yang tidak sah adalah DIAM soal itu:
// gate yang hijau karena tak punya pekerjaan tidak bisa dibedakan dari gate yang hijau karena
// semuanya benar, jadi kalimat penutupnya menyebut NOL secara eksplisit.
//
// Versi sebelumnya keluar lebih awal (`process.exit(0)`) saat daftar kosong. Itu bukan sekadar
// melewatkan pemeriksaan per-tag — ia mematikan pemeriksaan yang cakupannya sengaja LEBIH LUAS
// dari daftar itu, lalu menghidupkannya serentak nanti dan memuntahkan puluhan pelanggaran milik
// tag LAIN ke gelombang yang bukan pemiliknya.
const tanpaTagV2 = isEmpty(optIn);

const temuan: string[] = [];
// Aturan dicatat SAAT temuannya dibuat, bukan saat labelnya dirakit: gate ini bisa menyitir tiga
// aturan berbeda, dan kaki keluaran hanya boleh menunjuk yang benar-benar menyala. Merakit ketiga
// label di muka akan mencatat ketiganya walau cuma satu yang fired.
const pengumpul = buatPengumpul(aturan);
const gagal = (lapis: Lapis, nomor: string, pesan: string) =>
  temuan.push(`${pengumpul.label(lapis, nomor)} ${pesan}`);

const bundle = parse(readFileSync(jalur.bundle(), "utf8")) as {
  paths?: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, unknown>;
    responses?: Record<string, unknown>;
    parameters?: Record<string, unknown>;
  };
};

/**
 * Kelas KHUSUS untuk kegagalan resolusi `$ref` (menggantung/melingkar/di luar namespace) yang
 * MEMANG bermakna "kontrak salah".
 *
 * Sebelum kelas ini ada, `catch (e) { gagal(...) }` menangkap SEGALANYA termasuk bug pemrograman
 * sungguhan (`TypeError: Cannot read properties of undefined`) lalu melaporkannya sebagai
 * pelanggaran kontrak — gate yang rusak menyamar jadi kontrak yang salah. Catch di bawah hanya
 * menangkap kelas ini dan MELEMPAR ULANG apa pun yang lain.
 */
class RefError extends Error {}

type Simpul = Record<string, any>;

function ikutiRef(node: any, ruang: "responses" | "parameters" | "schemas"): any {
  const seen = new Set<string>();
  const peta = bundle.components?.[ruang] ?? {};
  while (node && typeof node.$ref === "string") {
    const m = new RegExp(`^#/components/${ruang}/(.+)$`).exec(node.$ref);
    if (!m) throw new RefError(`$ref di luar #/components/${ruang}: ${node.$ref}`);
    if (seen.has(m[1]!)) throw new RefError(`$ref melingkar: ${node.$ref}`);
    seen.add(m[1]!);
    const target = (peta as Record<string, unknown>)[m[1]!];
    if (!target) throw new RefError(`$ref menggantung: ${node.$ref}`);
    node = target;
  }
  return node;
}

const resolveResponse = (r: any) => ikutiRef(r, "responses");
const resolveParam = (p: any) => ikutiRef(p, "parameters");
const resolveSchema = (s: any) => ikutiRef(s, "schemas");

/**
 * Selesaikan SELURUH `$ref` di seluruh pohon (properti maupun item larik) — dipakai untuk
 * pemeriksaan yang menelusuri isi, bukan bentuk teratas.
 *
 * Kunjungan kedua ke nama yang sama berhenti dengan PENANDA, bukan `throw`: skema REKURSIF itu
 * SAH di OpenAPI dan lazim (pohon menu, hierarki wilayah). Melemparkannya berarti melaporkan
 * kontrak yang benar sebagai pelanggaran.
 */
function resolveDeep(node: any, visiting: ReadonlySet<string> = new Set()): any {
  if (node == null || typeof node !== "object") return node;
  if (typeof node.$ref === "string") {
    const m = /^#\/components\/schemas\/(.+)$/.exec(node.$ref);
    if (!m) throw new RefError(`skema memakai $ref di luar #/components/schemas: ${node.$ref}`);
    const nama = m[1]!;
    if (visiting.has(nama)) return { $recursiveRef: nama };
    const target = bundle.components?.schemas?.[nama];
    if (!target) throw new RefError(`$ref skema menggantung: ${node.$ref}`);
    return resolveDeep(target, new Set([...visiting, nama]));
  }
  if (Array.isArray(node)) return node.map((n) => resolveDeep(n, visiting));
  const out: Simpul = {};
  for (const [k, v] of Object.entries(node)) out[k] = resolveDeep(v, visiting);
  return out;
}

/**
 * Ratakan `allOf` REKURSIF, sesudah mengikuti `$ref`.
 *
 * Perataan satu tingkat tidak cukup: bagian yang isinya sendiri `{allOf: [...]}` gugur dari
 * pemeriksaan karena tidak punya `type`/`required` sendiri — FALSE POSITIVE untuk bentuk v2 yang
 * sah. Satu kebijakan `allOf` untuk seluruh berkas ini, bukan dua: versi yang meratakan satu
 * tingkat di satu tempat dan rekursif di tempat lain sudah mengulang cacat yang sama.
 */
function ratakanAllOf(schema: any): any[] {
  const s = resolveSchema(schema);
  if (!s?.allOf?.length) return [s];
  return s.allOf.flatMap((bagian: any) => ratakanAllOf(bagian));
}

/** Nilai `status.enum` sebuah skema objek, SESUDAH `$ref`-nya diikuti. */
function statusEnum(props: any): string {
  return (resolveSchema(props?.status)?.enum ?? []).join();
}

/** Bentuk gagal: `required ⊇ {status, code, message}`, `data` DILARANG. */
function bentukGagal(schema: any): boolean {
  const s = resolveSchema(schema);
  if (!s || s.type !== "object") return false;
  const req = new Set<string>(s.required ?? []);
  return (
    req.has("status") && req.has("code") && req.has("message") &&
    !("data" in (s.properties ?? {})) &&
    statusEnum(s.properties) === "failed"
  );
}

/** Bentuk sukses: teratas WAJIB `allOf`, salah satu bagiannya `required ⊇ {status,message,data}`. */
function bentukSukses(schema: any): boolean {
  const s = resolveSchema(schema);
  if (!s?.allOf?.length) return false; // tanpa allOf = bentuk warisan, bukan hasil penerap
  return ratakanAllOf(s).some((p: any) => {
    if (!p || p.type !== "object") return false;
    const req = new Set<string>(p.required ?? []);
    return req.has("status") && req.has("message") && req.has("data") && statusEnum(p.properties) === "success";
  });
}

// Dua predikat LONGGAR, terpisah dari yang ketat di atas. Yang ketat menjawab "sudah bermigrasi?";
// yang longgar menjawab "berbau envelope jenis apa, di mana pun setelah diratakan" — dipakai untuk
// "status HTTP wajib mencerminkan isi badan", yang harus tetap menangkap envelope salah-tempat
// walau bentuknya belum v2 penuh.
const berbauSukses = (schema: any) => ratakanAllOf(resolveSchema(schema)).some((p: any) => statusEnum(p?.properties) === "success");
const berbauGagal = (schema: any) => ratakanAllOf(resolveSchema(schema)).some((p: any) => statusEnum(p?.properties) === "failed");

let belumDiimplementasi = 0;
const tagTercocok = new Set<string>();
const opTercocok = new Set<string>();

for (const [urlPath, ops] of Object.entries(bundle.paths ?? {})) {
  for (const [method, opRaw] of Object.entries(ops as Record<string, any>)) {
    if (!METODE.includes(method)) continue;
    const op = opRaw as Simpul;
    const key = `${method.toUpperCase()} ${urlPath}`;

    if (op["x-not-implemented"] === true) belumDiimplementasi++;

    // Catat SETIAP entri opt-in yang sungguhan cocok operasi ini, terlepas dari `isOptedIn`
    // gabungan di bawah: satu operasi bisa cocok lewat tag ATAU operationId, dan satu daftar bisa
    // punya entri lain yang TIDAK pernah cocok apa pun — itu yang ditangkap sesudah loop.
    const opId = String(op["operationId"] ?? "");
    if (opId && optIn.ops.has(opId)) opTercocok.add(opId);
    for (const tag of (op["tags"] ?? []) as string[]) if (optIn.tags.has(tag)) tagTercocok.add(tag);

    if (!isOptedIn(op as { tags?: string[]; operationId?: string }, optIn)) continue;

    for (const [kode, resRaw] of Object.entries(op["responses"] ?? {}) as [string, any][]) {
      const kodeSukses = /^2/.test(kode);
      // `default` adalah respons GAGAL, dan yang paling banyak dipakai.
      const kodeGagal = /^[45]/.test(kode) || kode === "default";

      try {
        const res = resolveResponse(resRaw); // WAJIB — mayoritas respons gagal berbentuk $ref
        const json = res?.content?.["application/json"]?.schema;
        const bukanJson = res?.content && !res.content["application/json"];

        if (kodeSukses) {
          if (bukanJson) continue; // memang bukan JSON — patuh secara struktural
          if (!json) continue;

          const teratas = resolveSchema(json); // payload biner TELANJANG (tanpa envelope)
          const bagian = ratakanAllOf(json);
          const dataMentah = bagian.find((x: any) => x?.properties?.data)?.properties?.data;
          const dataDangkal = dataMentah ? resolveSchema(dataMentah) : dataMentah;
          if (dataDangkal?.format === "binary" || teratas?.format === "binary") {
            gagal("contract", "01", t("kontrak.envelope.biner_dibungkus", { operasi: key, kode }));
          }

          if (!bentukSukses(json)) {
            gagal("contract", "01", t("kontrak.envelope.sukses_bukan_v2", { operasi: key, kode }));
          }
          if (berbauGagal(json)) {
            gagal("contract", "01", t("kontrak.envelope.sukses_pakai_envelope_gagal", { operasi: key, kode }));
          }

          const dataDalam = dataMentah ? resolveDeep(dataMentah) : dataMentah;
          if (dataDalam && JSON.stringify(dataDalam).includes('"pagination"')) {
            gagal("contract", "01", t("kontrak.envelope.paginasi_di_data", { operasi: key, kode }));
          }

          // Penanda "operasi ini berpaginasi" MENGGABUNGKAN parameter level path-item (sah di
          // OpenAPI 3.0, berlaku untuk semua operasi di path itu) dan level operasi, dan
          // me-resolve `$ref` ke komponen parameter bersama. Tanpa keduanya, mengekstrak
          // parameter halaman jadi komponen bersama — kerapian yang wajar — mematikan aturan ini
          // diam-diam.
          const semuaParam = [
            ...(((ops as Simpul)["parameters"] ?? []) as any[]),
            ...((op["parameters"] ?? []) as any[]),
          ].map(resolveParam);
          const berpaginasi = semuaParam.some(
            (p: any) => p?.in === "query" && (p?.name === "page" || p?.name === "limit"),
          );
          if (berpaginasi) {
            // Predikatnya bukan "ADA metaData yang MENGIZINKAN paginasi" melainkan "ADA bagian
            // yang metaData-nya MEWAJIBKAN paginasi", dan rujukannya wajib `$ref` LITERAL ke
            // komponen paginasi bersama — diperiksa SEBELUM di-resolve. Kalau di-resolve dulu,
            // varian nyaris-sama (field lengkap tapi tipe berbeda, `required` tambahan) ikut
            // lolos, padahal justru varian itulah yang aturan ini ada untuk membunuhnya.
            const paginasiSah = bagian.some((part: any) => {
              const metaMentah = part?.properties?.metaData;
              if (!metaMentah) return false;
              return ratakanAllOf(metaMentah).some((mp: any) => {
                const req = new Set<string>(mp?.required ?? []);
                if (!req.has("pagination")) return false;
                return mp?.properties?.pagination?.$ref === "#/components/schemas/Pagination";
              });
            });
            if (!paginasiSah) {
              gagal("contract", "01", t("kontrak.envelope.paginasi_tak_terdeklarasi", { operasi: key, kode }));
            }
          }
        } else if (kodeGagal) {
          if (!json) {
            gagal("contract", "01", t("kontrak.envelope.gagal_tanpa_json", { operasi: key, kode }));
            continue;
          }
          if (!bentukGagal(json)) {
            // Sebutkan APA yang salah — "tidak memakai envelope gagal" tidak cukup saat ada dua
            // definisi berbeda dengan nama yang saling mengandung.
            const s = resolveSchema(json);
            gagal("contract", "01",
              t("kontrak.envelope.gagal_bukan_v2", {
                operasi: key,
                kode,
                required: (s?.required ?? []).join(","),
                data: "data" in (s?.properties ?? {}) ? "data" : "-",
              }),
            );
          }
          if (berbauSukses(json)) {
            gagal("contract", "01", t("kontrak.envelope.gagal_pakai_envelope_sukses", { operasi: key, kode }));
          }
        }
      } catch (e: unknown) {
        if (!(e instanceof RefError)) throw e;
        gagal("contract", "01", t("kontrak.envelope.ref_gagal", { operasi: key, kode, sebab: e.message }));
      }
    }
  }
}

// Entri opt-in yang tidak cocok satu operasi pun.
//
// Parser opt-in cuma memvalidasi SINTAKS entri (string tak-kosong, bentuk "tag:operationId"
// lengkap) — bukan KEBERADAANNYA. Tanpa pemeriksaan ini, daftar berisi satu tag salah ketik lolos
// EXIT 0 dengan kalimat yang menggemakan salah ketik itu seolah sah, nol operasi diperiksa: bukan
// daftar KOSONG, tapi daftar yang isinya sampah. Ini klaim-tanpa-kenyataan, arah pertama [[G-05]].
//
// Dicetak dan keluar TERPISAH dari temuan kontrak, karena yang salah bukan kontraknya melainkan
// KONFIGURASI gate ini — dan tiap entri sampah disebut satu per satu, supaya satu entri yang sah
// tidak menyembunyikan yang salah ketik di belakangnya.
if (!tanpaTagV2) {
  const tanpaPasangan = daftarEntri.filter((mentah) => {
    const parsed = splitEntry(mentah, berkasOptIn, t);
    return parsed.tag !== undefined ? !tagTercocok.has(parsed.tag) : !opTercocok.has(parsed.op);
  });
  if (tanpaPasangan.length) {
    console.error(
      `${pengumpul.label("gate", "05")} ${t("kontrak.envelope.opt_in_tak_cocok", {
        berkas: berkasOptIn,
        entri: tanpaPasangan.map((e) => `"${e}"`).join(", "),
      })}`,
    );
    console.error(aturan.footer("gate", "05"));
    process.exit(1);
  }
}

// Hitungan operasi belum-terimplementasi hanya boleh MENYUSUT ([[G-03]]).
if (belumDiimplementasi > baseline.belumDiimplementasi) {
  gagal(
    "gate",
    "03",
    t("kontrak.envelope.belum_diimplementasi_naik", {
      jumlah: String(belumDiimplementasi),
      baseline: String(baseline.belumDiimplementasi),
      berkas: berkasOptIn,
    }),
  );
}

if (temuan.length) {
  console.error(
    t("kontrak.envelope.gagal", {
      jumlah: String(temuan.length),
      tag: [...optIn.tags, ...optIn.ops].join(", ") || "-",
    }),
  );
  for (const e of temuan.slice(0, BATAS_TAMPIL)) console.error(`  ${e}`);
  if (temuan.length > BATAS_TAMPIL) {
    console.error(t("kontrak.envelope.dipotong", { jumlah: String(temuan.length - BATAS_TAMPIL) }));
  }
  console.error(pengumpul.kaki(temuan));
  process.exit(1);
}

console.log(
  tanpaTagV2
    ? t("kontrak.envelope.ok_kosong", {
        berkas: berkasOptIn,
        belumDiimplementasi: String(belumDiimplementasi),
        baseline: String(baseline.belumDiimplementasi),
      })
    : t("kontrak.envelope.ok", {
        tag: [...optIn.tags, ...optIn.ops].join(", "),
        belumDiimplementasi: String(belumDiimplementasi),
        baseline: String(baseline.belumDiimplementasi),
      }),
);
