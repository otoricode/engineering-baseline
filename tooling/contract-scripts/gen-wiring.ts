/**
 * Tulis wiring generated satu tag: peta guard, daftar rute publik, dan satu fungsi pemasangan
 * tipis — semuanya DITURUNKAN dari kontrak, tak satu pun ditulis tangan.
 *
 * Pemakaian: `gen-wiring --tag <TAG> --pkg <PKG> [--apply]`
 *
 * Yang ditulis berkas ini hanya DATA plus satu fungsi pemasangan. SELURUH logika otorisasi hidup
 * di paket platform, ditulis tangan dan diuji SEKALI. Menyalin logikanya ke sini akan
 * menggandakannya sebanyak jumlah tag, dan salinan yang digenerate tetap salinan.
 *
 * Konsekuensi yang justru jadi tujuannya ([[B-01]]): karena pemasangan yang memutuskan rute mana
 * masuk grup mana, pendaftaran ganda dan operasi yang tak sengaja terbuka sama-sama menjadi tidak
 * bisa diekspresikan.
 *
 * Manifest validasi isi badan permintaan dipasang HANYA untuk tag yang sudah diaudit — allowlist
 * di buku besar opt-in ([[G-02]]). Tanpa daftar itu, menyentuh templat bersama di berkas ini akan
 * menyalakan validasi baru yang belum diaudit di SEMUA tag sekaligus begitu tag mana pun
 * diregenerasi, bukan cuma tag yang sedang dikerjakan — dan gate regenerasi meregenerasi semuanya.
 */
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { muatKonteks } from "./konteks.js";
import { bacaBendera, BENDERA_APPLY, buatRencana } from "./argumen.js";
import { operasiUntukTag, type Operasi } from "./lib/wiring.js";
import { contentManifestUntukTag, type ContentFieldSpec } from "./lib/content.js";
import { tagValidasiIsi } from "./lib/envelopeOptIn.js";
import { gofmtWrite } from "./lib/goFmt.js";
import { bannerGenerated, komentarGo } from "./lib/banner.js";

const { jalur, t, aturan } = await muatKonteks();
const bendera = bacaBendera(
  process.argv.slice(2),
  [BENDERA_APPLY, { nama: "tag", berNilai: true }, { nama: "pkg", berNilai: true }],
  t,
);

const tag = bendera.nilai("tag");
const pkg = bendera.nilai("pkg");
if (!tag || !pkg) {
  console.error(t("kontrak.gen.pemakaian_wiring"));
  process.exit(1);
}

const berkasBundle = jalur.bundle();
const berkasEnvelope = jalur.shared("envelope");

// Satu parse, dua konsumen (daftar operasi + manifest isi). Bundel adalah artefak kontrak yang
// di-commit; `$ref`-nya diselesaikan sendiri oleh `lib/content.ts` alih-alih bergantung pada
// bundel ter-dereference yang tidak di-commit.
const bundleDoc = parse(readFileSync(berkasBundle, "utf8"));

const ops = operasiUntukTag(bundleDoc, tag, t);
if (ops.length === 0) {
  console.error(t("kontrak.gen.tag_tanpa_operasi", { tag, bundel: berkasBundle }));
  process.exit(1);
}

const validasiIsiAktif = tagValidasiIsi(
  JSON.parse(readFileSync(jalur.ledger("envelopeOptIn"), "utf8")) as unknown,
).has(tag);
const manifestIsi = validasiIsiAktif ? contentManifestUntukTag(bundleDoc, tag) : {};

// Jalur impor Go, semuanya diturunkan dari `go.modulePath` + tata letak di config lewat
// `paths.ts`. Nama DAUN paket (`common`, `guard`, `httpx`) tetap literal di sini, dan itu bukan
// jalur yang lolos dari `paths.ts`: ia identifier yang dipakai di sekujur kode yang dipancarkan
// (`guard.Allow`, `httpx.RenderFailureV2`), jadi mengonfigurasi jalur impornya tanpa
// mengonfigurasi identifiernya cuma teater — kode hasilnya tetap tidak akan meng-compile.
const IMPOR_GEN = jalur.goImportGen();
const IMPOR_COMMON = jalur.goImportGen("common");
const IMPOR_GUARD = jalur.goPlatform("guard");
const IMPOR_HTTPX = jalur.goPlatform("httpx");

/** `BUKU_TAMU_READ` -> `gen.PermBukuTamuRead` (cermin penamaan di `gen-permissions.ts`). */
const konstPerm = (p: string) =>
  "gen.Perm" + p.split("_").map((s) => s[0]! + s.slice(1).toLowerCase()).join("");

const literalSpec = (o: Operasi) =>
  o.kategori === "authOnly"
    ? `{OperationID: ${JSON.stringify(o.operationId)}, AuthOnly: true}`
    : `{OperationID: ${JSON.stringify(o.operationId)}, Perms: []gen.Permission{${o.permissions.map(konstPerm).join(", ")}}}`;

/**
 * Nama metode router untuk sebuah verba HTTP. Verba di luar kelima yang dikenal ditolak NYARING,
 * supaya generator tidak menulis kode yang gagal kompilasi dengan pesan yang membingungkan.
 */
const VERBA = new Set(["GET", "POST", "PUT", "DELETE", "PATCH"]);
const verba = (m: string) => {
  if (!VERBA.has(m)) throw new Error(t("kontrak.gen.verba_tak_dikenal", { verba: m }));
  return m;
};

const publik = ops.filter((o) => o.kategori === "public");
const dijaga = ops.filter((o) => o.kategori !== "public");

// Impor paket konstanta HANYA dipakai literal permission milik operasi protected. Tag yang seluruh
// operasinya authOnly/public tidak menyebut satu pun, dan Go memperlakukan impor tak-terpakai
// sebagai GALAT kompilasi — jadi impornya kondisional.
const adaProtected = ops.some((o) => o.kategori === "protected");

const banner = bannerGenerated(berkasBundle, jalur.akar, t);
const sitirC03 = aturan.label("contract", "03");

// Lapis validasi isi adalah elemen PERTAMA slice middleware — tapi karena handler generated
// membungkus middleware SECARA ITERATIF (elemen TERAKHIR jadi pembungkus TERLUAR, jalan PERTAMA),
// posisi "pertama di slice" justru berarti ia dieksekusi SESUDAH guard: auth/izin lebih dulu, isi
// badan belakangan. Jangan tukar urutannya tanpa paham ini — tertukar berarti isi badan divalidasi
// SEBELUM sesi dan izin dicek.
const fungsiValidasiIsi = validasiIsiAktif
  ? `${komentarGo(t("kontrak.komentar.content_by_operation"))}
func contentByOperation(f StrictHandlerFunc, operationID string) StrictHandlerFunc {
\topID := guard.LowerFirst(operationID)
\tfields, ok := ContentByOperation[opID]
\tif !ok {
\t\treturn f
\t}
\treturn func(c *gin.Context, request any) (any, error) {
\t\tguard.RestoreBody(c)
\t\traw, _, parsed := httpx.ParseBodyObject(c)
\t\tif parsed {
\t\t\tif issues := httpx.ContentIssues(raw, fields); len(issues) > 0 {
\t\t\t\treturn nil, &httpx.FieldValidationError{Message: httpx.PesanValidasi, Fields: issues}
\t\t\t}
\t\t}
\t\treturn f(c, request)
\t}
}

`
  : "";
const middleware = validasiIsiAktif ? "contentByOperation, guardByOperation" : "guardByOperation";

const isiWiring = `${komentarGo(`${banner}\n\n${t("kontrak.komentar.wiring_berkas", {
  tag,
  pkg,
  operasi: String(ops.length),
  dijaga: String(dijaga.length),
  publik: String(publik.length),
})}`)}

package ${pkg}

import (
\t"github.com/gin-gonic/gin"
${adaProtected ? `\t${JSON.stringify(IMPOR_GEN)}\n` : ""}\t${JSON.stringify(IMPOR_GUARD)}
\t${JSON.stringify(IMPOR_HTTPX)}
)

${komentarGo(t("kontrak.komentar.spec_by_operation", { aturan: sitirC03 }))}
var SpecByOperation = map[string]guard.RouteSpec{
${dijaga.map((o) => `\t${JSON.stringify(o.operationId)}: ${literalSpec(o)},`).join("\n")}
}

${komentarGo(t("kontrak.komentar.spec_by_route"))}
var SpecByRoute = map[string]guard.RouteSpec{
${dijaga.map((o) => `\t${JSON.stringify(o.method + " " + o.ginPath)}: SpecByOperation[${JSON.stringify(o.operationId)}],`).join("\n")}
}

${komentarGo(t("kontrak.komentar.public_routes"))}
var PublicRoutes = []string{
${publik.map((o) => `\t${JSON.stringify(o.method + " " + o.ginPath)},`).join("\n")}
}

${komentarGo(t("kontrak.komentar.v2_paths"))}
func V2Paths(publicBase, protectedBase string) []string {
\treturn []string{
${publik.map((o) => `\t\tguard.JoinPath(publicBase, ${JSON.stringify(o.ginPath)}),`).join("\n")}
${dijaga.map((o) => `\t\tguard.JoinPath(protectedBase, ${JSON.stringify(o.ginPath)}),`).join("\n")}
\t}
}

${komentarGo(t("kontrak.komentar.public_ops"))}
var publicOps = map[string]bool{
${publik.map((o) => `\t${JSON.stringify(o.operationId)}: true,`).join("\n")}
}

${komentarGo(t("kontrak.komentar.guard_by_operation"))}
func guardByOperation(f StrictHandlerFunc, operationID string) StrictHandlerFunc {
\topID := guard.LowerFirst(operationID)
\treturn func(c *gin.Context, request any) (any, error) {
\t\tif publicOps[opID] {
\t\t\treturn f(c, request)
\t\t}
\t\tspec, found := SpecByOperation[opID]
\t\tif !guard.Allow(c, spec, found) {
\t\t\treturn nil, nil
\t\t}
\t\treturn f(c, request)
\t}
}

${fungsiValidasiIsi}${komentarGo(t("kontrak.komentar.mount"))}
func Mount(public, protected *gin.RouterGroup, impl StrictServerInterface) {
\tsi := NewStrictHandlerWithOptions(impl,
\t\t[]StrictMiddlewareFunc{${middleware}},
\t\tStrictGinServerOptions{
\t\t\tRequestErrorHandlerFunc:  httpx.RequestBindErrorV2,
\t\t\tHandlerErrorFunc:         httpx.RenderFailureV2,
\t\t\tResponseErrorHandlerFunc: httpx.ResponseSerializeErrorV2,
\t\t},
\t)
\twrapper := ServerInterfaceWrapper{Handler: si, ErrorHandler: httpx.ParamBindErrorV2}

\tprot := protected.Group("", guard.RequireSession, guard.RequirePermissionForRoute(protected.BasePath(), SpecByRoute), guard.BufferJSONBody)
${dijaga.map((o) => `\tprot.${verba(o.method)}(${JSON.stringify(o.ginPath)}, wrapper.${o.goMethod})`).join("\n")}
${publik.length ? `\n\tpub := public.Group("", guard.BufferJSONBody)\n` + publik.map((o) => `\tpub.${verba(o.method)}(${JSON.stringify(o.ginPath)}, wrapper.${o.goMethod})`).join("\n") + "\n" : ""}
\thttpx.RegisterV2Paths(V2Paths(public.BasePath(), protected.BasePath())...)
}
`;

// ── alias ke paket generated bersama ─────────────────────────────────────────
//
// Generator server dikonfigurasi untuk TIDAK menggenerate ulang schema bersama di tiap paket, tapi
// berkas server hasil generate tetap merujuk namanya telanjang. Alias di bawah yang menyambungkannya
// ke definisi tunggal di paket bersama.
//
// ALIAS (`=`), bukan definisi tipe baru: alias Go adalah tipe yang SAMA, jadi paginasi di dua paket
// sungguh-sungguh satu tipe. Ditulis tanpa `=`, tiap paket kembali punya tipe sendiri dan seluruh
// gunanya hilang.
const docEnvelope = parse(readFileSync(berkasEnvelope, "utf8")) as {
  components?: {
    schemas?: Record<string, { enum?: unknown[]; properties?: Record<string, { enum?: unknown[] }> }>;
  };
};
const namaBersama = Object.keys(docEnvelope.components?.schemas ?? {}).sort();
if (namaBersama.length === 0) {
  console.error(`${aturan.label("contract", "01")} ${t("kontrak.gen.shared_kosong", { berkas: berkasEnvelope })}`);
  process.exit(1);
}

// Tipe turunan enum: generator menamai enum di dalam sebuah schema `<Schema><Field>`. DITURUNKAN,
// bukan dihardcode, supaya schema bersama yang punya enum menyusul ikut terbawa.
const namaAlias: string[] = [];
for (const n of namaBersama) {
  namaAlias.push(n);
  for (const [field, spec] of Object.entries(docEnvelope.components?.schemas?.[n]?.properties ?? {})) {
    if (Array.isArray(spec?.enum)) namaAlias.push(n + field[0]!.toUpperCase() + field.slice(1));
  }
}

// Konstanta enum, dan kenapa ia TIDAK cukup dialias sebagai tipe: alias tipe menyambungkan
// TIPE-nya, tapi tidak membawa serta konstanta yang generator deklarasikan bersamanya. Tanpa baris
// konstanta di bawah, satu-satunya cara handler menyebut nilainya adalah mengimpor paket bersama
// langsung — yang membocorkan paket bersama ke setiap feature, persis yang alias ini ada untuk
// dihindari.
const pascal = (v: string) =>
  v.split(/[^A-Za-z0-9]+/).filter(Boolean).map((s) => s[0]!.toUpperCase() + s.slice(1).toLowerCase()).join("");

const konstanta: string[] = [];
for (const n of namaBersama) {
  const nilai = docEnvelope.components?.schemas?.[n]?.enum;
  if (!Array.isArray(nilai)) continue;
  for (const v of nilai) konstanta.push(`${n}${pascal(String(v))} = common.${n}${pascal(String(v))}`);
}

const isiShared = `${komentarGo(`${bannerGenerated(berkasEnvelope, jalur.akar, t)}\n\n${t("kontrak.komentar.shared_berkas")}`)}

package ${pkg}

import ${JSON.stringify(IMPOR_COMMON)}

type (
${namaAlias.map((n) => `\t${n} = common.${n}`).join("\n")}
)
${konstanta.length === 0 ? "" : `\nconst (\n${konstanta.map((c) => `\t${c}`).join("\n")}\n)\n`}`;

// ── manifest constraint badan permintaan ─────────────────────────────────────
const konstKind = (k: ContentFieldSpec["kind"]) => "httpx.Kind" + k[0]!.toUpperCase() + k.slice(1);

// Literal pecahan SELALU bertitik desimal supaya `new(x)` default ke float64: konstanta tak-bertipe
// memakai tipe DEFAULT-nya, bukan tipe yang disimpulkan dari konteks penugasan, jadi `new(0)`
// menghasilkan *int dan tidak cocok field *float64.
const literalFloat = (n: number) => (Number.isInteger(n) ? `${n}.0` : String(n));

const literalField = (f: ContentFieldSpec): string => {
  const bagian: string[] = [`Name: ${JSON.stringify(f.name)}`];
  if (f.required) bagian.push("Required: true");
  if (f.nullable) bagian.push("Nullable: true");
  bagian.push(`Kind: ${konstKind(f.kind)}`);
  if (f.minLength !== undefined) bagian.push(`MinLength: new(${f.minLength})`);
  if (f.maxLength !== undefined) bagian.push(`MaxLength: new(${f.maxLength})`);
  if (f.pattern !== undefined) bagian.push(`Pattern: regexp.MustCompile(${JSON.stringify(f.pattern)})`);
  if (f.minimum !== undefined) bagian.push(`Minimum: new(${literalFloat(f.minimum)})`);
  if (f.maximum !== undefined) bagian.push(`Maximum: new(${literalFloat(f.maximum)})`);
  if (f.exclusiveMinimum) bagian.push("ExclusiveMinimum: true");
  if (f.exclusiveMaximum) bagian.push("ExclusiveMaximum: true");
  if (f.enum?.length) bagian.push(`Enum: []string{${f.enum.map((v) => JSON.stringify(v)).join(", ")}}`);
  if (f.format) bagian.push(`Format: ${JSON.stringify(f.format)}`);
  if (f.minItems !== undefined) bagian.push(`MinItems: new(${f.minItems})`);
  if (f.maxItems !== undefined) bagian.push(`MaxItems: new(${f.maxItems})`);
  if (f.children?.length) bagian.push(`Children: []httpx.ContentField{${f.children.map(literalField).join(", ")}}`);
  if (f.items) bagian.push(`Items: &httpx.ContentField${literalField(f.items)}`);
  return `{${bagian.join(", ")}}`;
};

// Penelusuran rekursif dipakai untuk impor bersyarat: tag tanpa satu field ber-pola pun TIDAK
// BOLEH mengimpor paket regexp — Go menolak impor tak-terpakai sebagai galat kompilasi.
const adaPola = (fields: ContentFieldSpec[]): boolean =>
  fields.some((f) => f.pattern !== undefined || (f.children && adaPola(f.children)) || (f.items && adaPola([f.items])));
const perluRegexp = Object.values(manifestIsi).some(adaPola);

const opIdIsi = Object.keys(manifestIsi).sort();
const isiContent = `${komentarGo(`${banner}\n\n${t("kontrak.komentar.content_berkas", { tag, pkg })}`)}

package ${pkg}

import (
${perluRegexp ? '\t"regexp"\n\n' : ""}\t${JSON.stringify(IMPOR_HTTPX)}
)

var ContentByOperation = map[string][]httpx.ContentField{
${opIdIsi.map((id) => `\t${JSON.stringify(id)}: {${manifestIsi[id]!.map(literalField).join(", ")}},`).join("\n")}
}
`;

const sufiks = jalur.sufiksGen();
const rencana = buatRencana(bendera.ada("apply"), t, (s) => console.log(s));
rencana.tambah(jalur.goGen(pkg, `wiring${sufiks}`), isiWiring, (p) => gofmtWrite(p, t));
rencana.tambah(jalur.goGen(pkg, `shared${sufiks}`), isiShared, (p) => gofmtWrite(p, t));
// Manifest ditulis HANYA untuk tag yang sudah diaudit — tag lain nol berkas ini sama sekali (bukan
// berkas kosong), dan wiring-nya juga nol merujuk manifest, jadi keduanya konsisten.
if (validasiIsiAktif) {
  rencana.tambah(jalur.goGen(pkg, `content${sufiks}`), isiContent, (p) => gofmtWrite(p, t));
}
rencana.jalankan();

console.log(
  t("kontrak.gen.ringkas_wiring", {
    tag,
    pkg,
    operasi: String(ops.length),
    publik: String(publik.length),
    alias: String(namaAlias.length),
    manifest: String(opIdIsi.length),
  }),
);
