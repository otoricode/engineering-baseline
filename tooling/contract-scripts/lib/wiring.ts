/**
 * Derivasi MURNI bundel OpenAPI -> daftar operasi satu tag, untuk generator wiring.
 *
 * Murni (tanpa IO) supaya bisa diuji tanpa berkas sungguhan; pembacaan berkasnya ada di
 * `gen-wiring.ts`.
 *
 * Ketiga kategori guard SUDAH tersedia di kontrak; tidak ada field baru yang diperkenalkan
 * berkas ini ([[C-03]]):
 *   - `security: []`      -> public   (override eksplisit atas `security` akar)
 *   - ada `x-permission`  -> protected
 *   - selain itu          -> authOnly (mewarisi `security` akar: cukup sesi)
 */
import type { T } from "../pesan.js";

const METODE = ["get", "post", "put", "delete", "patch"] as const;

export type Kategori = "public" | "authOnly" | "protected";

export interface Operasi {
  operationId: string;
  /** Verba HTTP huruf besar, mis. "GET". */
  method: string;
  /** Pola rute gaya router, mis. "/buku-tamu/:id". */
  ginPath: string;
  kategori: Kategori;
  /** Kosong kecuali kategori === "protected". Larik = OR. */
  permissions: string[];
  /** Nama metode wrapper yang generator server hasilkan, mis. "GetBukuTamuById". */
  goMethod: string;
}

/**
 * `/buku-tamu/{id}` -> `/buku-tamu/:id`.
 *
 * Konversi yang SAMA yang generator server lakukan saat menulis pendaftaran handler-nya. Karena
 * keduanya menurunkannya sendiri-sendiri, tiap feature wajib memanggil pembantu uji yang
 * membandingkan peta ini terhadap rute yang BENAR-BENAR terpasang — divergensi apa pun jadi test
 * merah, bukan guard yang gagal-tertutup diam-diam di produksi ([[B-01]]).
 */
export function toGinPath(openApiPath: string): string {
  return openApiPath.replace(/\{([^}]+)\}/g, ":$1");
}

/** `getBukuTamuById` -> `GetBukuTamuById`. */
export function goMethodName(operationId: string): string {
  if (!operationId) return "";
  return operationId[0]!.toUpperCase() + operationId.slice(1);
}

export function operasiUntukTag(bundle: unknown, tag: string, t: T): Operasi[] {
  const doc = bundle as { paths?: Record<string, Record<string, unknown>> };
  const out: Operasi[] = [];

  for (const [path, item] of Object.entries(doc.paths ?? {})) {
    if (!item || typeof item !== "object") continue;
    for (const m of METODE) {
      const op = item[m] as
        | { operationId?: string; tags?: string[]; security?: unknown[]; "x-permission"?: string | string[] }
        | undefined;
      if (!op || !(op.tags ?? []).includes(tag)) continue;

      if (!op.operationId) {
        throw new Error(t("kontrak.gen.tanpa_operation_id", { operasi: `${m.toUpperCase()} ${path}` }));
      }

      const xp = op["x-permission"];
      let kategori: Kategori;
      let permissions: string[] = [];

      // Urutan cabang ini menentukan: `x-permission` diperiksa LEBIH DULU daripada `security: []`.
      // Operasi yang punya keduanya tetap PROTECTED — satu baris `security: []` yang terselip
      // tidak boleh diam-diam mencopot permission-nya.
      if (xp !== undefined) {
        permissions = Array.isArray(xp) ? xp : [xp];
        if (permissions.length === 0) {
          throw new Error(t("kontrak.gen.x_permission_kosong", { operasi: op.operationId }));
        }
        kategori = "protected";
      } else if (Array.isArray(op.security) && op.security.length === 0) {
        kategori = "public";
      } else {
        kategori = "authOnly";
      }

      out.push({
        operationId: op.operationId,
        method: m.toUpperCase(),
        ginPath: toGinPath(path),
        kategori,
        permissions,
        goMethod: goMethodName(op.operationId),
      });
    }
  }

  // Urutan STABIL: keluaran generator masuk git, jadi regen yang mengocok urutan menghasilkan
  // diff palsu dan menumpulkan gate diff-kosong ([[B-03]]).
  return out.sort((a, b) => a.operationId.localeCompare(b.operationId));
}
