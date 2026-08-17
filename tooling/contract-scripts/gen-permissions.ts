/**
 * Emit konstanta permission untuk KEDUA sisi (server dan frontend) dari SATU katalog.
 *
 * Satu skrip yang menulis kedua bahasa disengaja: ia menghindari menambah dependensi toolchain
 * server pada paket kontrak, dan menjamin kedua keluaran berasal dari parsing yang sama persis.
 * Dua generator terpisah yang membaca berkas yang sama adalah dua parser yang akan menyimpang.
 *
 * Keluarannya artefak generated: jangan diedit tangan, dan regenerasi wajib menghasilkan berkas
 * yang identik byte-per-byte ([[B-03]]). `gofmt` dijalankan sesudah menulis justru karena itu —
 * lihat `lib/goFmt.ts` untuk angka yang menjelaskan kenapa melewatinya menumpulkan gate.
 */
import { muatKonteks } from "./konteks.js";
import { bacaBendera, BENDERA_APPLY, buatRencana } from "./argumen.js";
import { loadPermissionCatalog } from "./lib/catalog.js";
import { gofmtWrite } from "./lib/goFmt.js";
import { bannerGenerated, komentarGo, komentarTs } from "./lib/banner.js";

const { jalur, t, aturan } = await muatKonteks();
const bendera = bacaBendera(process.argv.slice(2), [BENDERA_APPLY], t);

const berkasKatalog = jalur.shared("permissions");
const { permissions } = loadPermissionCatalog(berkasKatalog);

/** `BUKU_TAMU_READ` -> `PermBukuTamuRead`. */
const namaGo = (p: string) =>
  "Perm" + p.split("_").map((s) => s[0]! + s.slice(1).toLowerCase()).join("");

const banner = bannerGenerated(berkasKatalog, jalur.akar, t);
const sitirC03 = aturan.label("contract", "03");

const isiGo = `${komentarGo(banner)}

package gen

${komentarGo(t("kontrak.komentar.permission_tipe", { aturan: sitirC03 }))}
type Permission string

const (
${permissions.map((p) => `\t${namaGo(p)} Permission = ${JSON.stringify(p)}`).join("\n")}
)

${komentarGo(t("kontrak.komentar.permission_semua"))}
var AllPermissions = []Permission{
${permissions.map((p) => `\t${namaGo(p)},`).join("\n")}
}

${komentarGo(t("kontrak.komentar.permission_parse"))}
func ParsePermission(s string) (Permission, bool) {
\tfor _, p := range AllPermissions {
\t\tif string(p) == s {
\t\t\treturn p, true
\t\t}
\t}
\treturn "", false
}
`;

const isiTs = `${komentarTs(banner)}

export type Permission =
${permissions.map((p) => `  | ${JSON.stringify(p)}`).join("\n")};

export const PERMISSIONS: readonly Permission[] = [
${permissions.map((p) => `  ${JSON.stringify(p)},`).join("\n")}
] as const;
`;

const rencana = buatRencana(bendera.ada("apply"), t, (s) => console.log(s));
rencana.tambah(jalur.goGen("permissions.go"), isiGo, (p) => gofmtWrite(p, t));
rencana.tambah(jalur.emit("permissions"), isiTs);
rencana.jalankan();

console.log(t("kontrak.gen.ringkas_permission", { jumlah: String(permissions.length) }));
