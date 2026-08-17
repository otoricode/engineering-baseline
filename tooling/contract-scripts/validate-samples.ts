/**
 * Validasi contoh respons yang direkam dari server sungguhan terhadap skema 200 operasinya di
 * bundel ter-dereference.
 *
 * Ini pemeriksaan yang berbeda golongan dari gate lain di direktori ini, dan itu justru gunanya:
 * gate lain memeriksa apa yang kontrak NYATAKAN, yang ini memeriksa apa yang server benar-benar
 * PANCARKAN. Selisih di antara keduanya persis kelas cacat yang tidak terlihat dari mana pun.
 *
 * Nama berkas contoh: `METODE_segmen_segmen….json` — dipetakan balik ke path kontrak.
 */
import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import Ajv from "ajv";
import { muatKonteks } from "./konteks.js";

const { jalur, t } = await muatKonteks();

const spec = JSON.parse(readFileSync(jalur.deref(), "utf8")) as { paths: Record<string, any> };
const dirSamples = jalur.samples();

/**
 * `nullable` OpenAPI 3.0 -> union tipe JSON Schema, supaya validatornya paham.
 *
 * Ini penyesuaian DIALEK, bukan pelonggaran: OpenAPI 3.0 memakai `nullable: true`, JSON Schema
 * memakai `"type": [..., "null"]`. Tanpa terjemahan ini setiap field nullable yang bernilai null
 * dilaporkan sebagai pelanggaran — ratusan temuan palsu yang membuat alat ini dibuang orang.
 */
function tanpaNullable(n: any): any {
  if (Array.isArray(n)) return n.map(tanpaNullable);
  if (!n || typeof n !== "object") return n;
  const out: any = {};
  for (const [k, v] of Object.entries(n)) out[k] = tanpaNullable(v);
  if (out.nullable === true) {
    delete out.nullable;
    if (typeof out.type === "string") out.type = [out.type, "null"];
    else if (out.anyOf) out.anyOf = [...out.anyOf, { type: "null" }];
    else if (out.enum) out.enum = [...out.enum, null];
    else return { anyOf: [out, { type: "null" }] };
  }
  return out;
}

const ajv = new Ajv({ strict: false, allErrors: true, validateFormats: false });
let lulus = 0;
let gagal = 0;
let takKetemu = 0;

for (const berkas of readdirSync(dirSamples).filter((f) => f.endsWith(".json"))) {
  const [method, ...seg] = berkas.replace(/\.json$/, "").split("_").filter(Boolean);
  const dicari = "/" + seg.join("/").split("?")[0];
  const pathItem = Object.entries<any>(spec.paths).find(
    ([p]) => p.replace(/\{[^}]+\}/g, "X") === dicari || p === dicari,
  );
  const op = pathItem?.[1]?.[String(method).toLowerCase()];
  const schema = op?.responses?.["200"]?.content?.["application/json"]?.schema;
  if (!schema) {
    takKetemu++;
    console.log(t("kontrak.sample.tanpa_operasi", { berkas, path: dicari }));
    continue;
  }
  const body = JSON.parse(readFileSync(resolve(dirSamples, berkas), "utf8"));
  const periksa = ajv.compile(tanpaNullable(schema));
  if (periksa(body)) {
    lulus++;
    console.log(t("kontrak.sample.lulus", { operasi: `${method} ${dicari}` }));
  } else {
    gagal++;
    console.log(t("kontrak.sample.gagal", { operasi: `${method} ${dicari}` }));
    for (const e of (periksa.errors ?? []).slice(0, 6)) console.log(`    ${e.instancePath} ${e.message}`);
  }
}

// Contoh yang operasinya TIDAK ketemu ikut dihitung dan disebut. Tanpa itu, direktori contoh yang
// seluruhnya salah nama terbaca sebagai "0 gagal" — gate yang memeriksa nol berkas bukan hijau,
// ia buta ([[G-05]]).
console.log(
  t("kontrak.sample.ringkas", {
    lulus: String(lulus),
    gagal: String(gagal),
    takKetemu: String(takKetemu),
  }),
);
process.exit(gagal > 0 || (lulus === 0 && takKetemu > 0) ? 1 : 0);
