/**
 * Derivasi MURNI skema `requestBody` (dari BUNDEL, bukan dari bundel ter-dereference) ->
 * manifest constraint per operasi, untuk generator manifest validasi isi.
 *
 * Bundel dipakai karena ia satu-satunya artefak kontrak yang di-commit; bundel ter-dereference
 * adalah artefak antara yang tidak. Bundel masih membawa `$ref` — tapi SEMUANYA lokal satu
 * dokumen (`#/components/schemas/...`), karena bundling menggabung multi-berkas jadi satu
 * dokumen sambil MEMPERTAHANKAN `$ref` (beda dari mode dereference yang meng-inline semuanya).
 * `resolveSchema` di bawah menyelesaikan pointer lokal itu sendiri — resolver JSON-pointer
 * sederhana, bukan resolver `$ref` umum (tidak perlu menangani berkas eksternal, kontrak ini
 * sudah satu dokumen).
 *
 * Murni (tanpa IO), sama pola dengan `wiring.ts` — pembacaan berkasnya ada di `gen-wiring.ts`.
 *
 * Cakupan SENGAJA terbatas ke `requestBody.content['application/json'].schema` bertipe
 * `object` di root — operasi yang badannya array di akar TIDAK dapat entri manifest di sini,
 * karena pembaca badan di sisi server menolak akar non-objek. Query/path param juga di luar
 * cakupan; berkas ini murni soal badan permintaan.
 */

const METODE = ["get", "post", "put", "delete", "patch"] as const;

export type Kind = "string" | "integer" | "number" | "boolean" | "array" | "object" | "any";

export interface ContentFieldSpec {
  name: string;
  required: boolean;
  nullable: boolean;
  kind: Kind;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: boolean;
  exclusiveMaximum?: boolean;
  enum?: string[];
  format?: string;
  minItems?: number;
  maxItems?: number;
  children?: ContentFieldSpec[];
  items?: ContentFieldSpec;
}

interface JSONSchema {
  $ref?: string;
  type?: string;
  properties?: Record<string, JSONSchema>;
  required?: string[];
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  minimum?: number;
  maximum?: number;
  exclusiveMinimum?: boolean | number;
  exclusiveMaximum?: boolean | number;
  enum?: unknown[];
  format?: string;
  nullable?: boolean;
  minItems?: number;
  maxItems?: number;
  items?: JSONSchema;
}

/**
 * resolveSchema mengikuti `$ref` lokal (`#/a/b/c`) sampai node non-$ref, dengan penjaga
 * siklus (skema requestBody tidak pernah rekursif dalam praktik, tapi gagal nyaring lebih
 * baik daripada rekursi tak berhingga kalau suatu hari ada).
 */
function resolveSchema(doc: unknown, schema: JSONSchema, seen: Set<string> = new Set()): JSONSchema {
  if (!schema.$ref) return schema;
  const ref = schema.$ref;
  if (seen.has(ref)) return {};
  if (!ref.startsWith("#/")) {
    throw new Error(`content.ts: $ref non-lokal tidak didukung: ${ref}`);
  }
  let node: unknown = doc;
  for (const seg of ref.slice(2).split("/")) {
    node = (node as Record<string, unknown> | undefined)?.[seg];
  }
  if (!node || typeof node !== "object") {
    throw new Error(`content.ts: $ref tidak ditemukan di bundel: ${ref}`);
  }
  return resolveSchema(doc, node as JSONSchema, new Set(seen).add(ref));
}

// kindOf HARUS membedakan "type: string" eksplisit dari `type` yang absen sama sekali
// (skema bebas-bentuk, `{}` — kolom JSON di skema data, `any` di sisi server). Sebelum perbedaan
// ini ada, keduanya jatuh ke cabang `default` yang sama dan skema bebas-bentuk salah
// diklasifikasi "string" — manifest lalu menolak nilai objek/array nyata sebagai
// INVALID_TYPE pada operasi yang justru TIDAK punya pemeriksaan tangan sama sekali untuk
// menutupinya. Ditemukan lewat audit per tag, bukan lewat kegagalan runtime — cacatnya menolak
// permintaan yang SAH, jadi ia terbaca sebagai "klien mengirim data salah".
function kindOf(schema: JSONSchema): Kind {
  switch (schema.type) {
    case "integer":
      return "integer";
    case "number":
      return "number";
    case "boolean":
      return "boolean";
    case "array":
      return "array";
    case "object":
      return "object";
    case "string":
      return "string";
    default:
      return "any";
  }
}

/**
 * `exclusiveMinimum`/`exclusiveMaximum` OpenAPI 3.0 bertipe BOOLEAN (bendera atas
 * `minimum`/`maximum`), beda dari JSON Schema draft terbaru (angka berdiri sendiri). Kontrak
 * ini OpenAPI 3.0 (lihat project.yaml: `exclusiveMinimum: true, minimum: 0`) — cuma bentuk
 * boolean yang perlu didukung.
 */
function isExclusive(v: boolean | number | undefined): boolean {
  return v === true;
}

function fieldFromProp(doc: unknown, name: string, rawProp: JSONSchema, required: boolean): ContentFieldSpec {
  const prop = resolveSchema(doc, rawProp);
  const kind = kindOf(prop);
  const field: ContentFieldSpec = { name, required, nullable: !!prop.nullable, kind };
  if (prop.minLength !== undefined) field.minLength = prop.minLength;
  if (prop.maxLength !== undefined) field.maxLength = prop.maxLength;
  if (prop.pattern !== undefined) field.pattern = prop.pattern;
  if (prop.minimum !== undefined) field.minimum = prop.minimum;
  if (prop.maximum !== undefined) field.maximum = prop.maximum;
  if (isExclusive(prop.exclusiveMinimum)) field.exclusiveMinimum = true;
  if (isExclusive(prop.exclusiveMaximum)) field.exclusiveMaximum = true;
  if (Array.isArray(prop.enum)) field.enum = prop.enum.map(String);
  if (prop.format === "uuid") field.format = "uuid";
  if (prop.minItems !== undefined) field.minItems = prop.minItems;
  if (prop.maxItems !== undefined) field.maxItems = prop.maxItems;
  if (kind === "object" && prop.properties) field.children = fieldsFromSchema(doc, prop);
  if (kind === "array" && prop.items) {
    const item0 = resolveSchema(doc, prop.items);
    const itemKind = kindOf(item0);
    // Elemen enforced hari ini: string (+format uuid) dan object. Array angka/array-array
    // belum dipakai satu pun operasi ter-migrasi — ditambah begitu ada kasus nyata.
    if (itemKind === "string" || itemKind === "object") {
      const item = fieldFromProp(doc, "", item0, true);
      if (itemKind === "object" && item0.properties) item.children = fieldsFromSchema(doc, item0);
      field.items = item;
    }
  }
  return field;
}

function fieldsFromSchema(doc: unknown, schema: JSONSchema): ContentFieldSpec[] {
  const requiredSet = new Set(schema.required ?? []);
  const props = schema.properties ?? {};
  // `props[name]` selalu terisi (namanya baru saja dibaca dari `props`), tapi pemeriksa tipe tidak
  // tahu itu — dan mendiamkannya dengan `!` menyembunyikan kasus yang SUNGGUHAN mungkin:
  // `properties: { foo: null }` di kontrak yang cacat. Objek kosong = skema bebas-bentuk, yang
  // justru penanganan yang benar untuk properti tanpa skema.
  return Object.keys(props).map((name) =>
    fieldFromProp(doc, name, props[name] ?? {}, requiredSet.has(name)),
  );
}

/**
 * contentManifestUntukTag menerima dokumen bundel YANG SAMA yang `wiring.ts` pakai
 * (`operasiUntukTag`) — satu parse, dua konsumen — dan menyelesaikan `$ref` requestBody-nya
 * sendiri lewat `resolveSchema` di atas.
 */
export function contentManifestUntukTag(
  bundleDoc: unknown,
  tag: string,
): Record<string, ContentFieldSpec[]> {
  const doc = bundleDoc as { paths?: Record<string, Record<string, unknown>> };
  const manifest: Record<string, ContentFieldSpec[]> = {};

  for (const item of Object.values(doc.paths ?? {})) {
    if (!item || typeof item !== "object") continue;
    for (const m of METODE) {
      const op = item[m] as
        | {
            operationId?: string;
            tags?: string[];
            requestBody?: { content?: Record<string, { schema?: JSONSchema }> };
          }
        | undefined;
      if (!op || !(op.tags ?? []).includes(tag) || !op.operationId) continue;

      const rawSchema = op.requestBody?.content?.["application/json"]?.schema;
      if (!rawSchema) continue;
      const schema = resolveSchema(bundleDoc, rawSchema);
      if (schema.type !== "object") continue;

      manifest[op.operationId] = fieldsFromSchema(bundleDoc, schema);
    }
  }

  return manifest;
}
