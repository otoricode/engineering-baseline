/**
 * Emit konstanta kode error untuk KEDUA sisi dari SATU katalog tertutup ([[C-02]]).
 *
 * Pola dan alasannya sama persis dengan `gen-permissions.ts`: satu skrip, satu parsing, dua
 * keluaran — dua generator terpisah yang membaca berkas yang sama akan menyimpang.
 *
 * Satu jebakan yang membuat katalog ini butuh gate sungguhan dan bukan sekadar tipe: dalam bahasa
 * bertipe statis yang memakai *defined type* di atas string, KONSTANTA TAK BERTIPE tetap
 * diterima — `var _ ErrorCode = "KODE_KARANGAN"` meng-compile tanpa keluhan; hanya VARIABEL
 * bertipe string yang ditolak. Selama bertahun-tahun aturan ini diklaim "dijaga kompilator" atas
 * dasar itu, dan klaimnya salah. Di bahasa dengan union literal klaim yang sama justru benar —
 * jadi "bertipe = gagal compile" adalah kalimat yang menyesatkan begitu dipakai lintas lapis.
 */
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { muatKonteks } from "./konteks.js";
import { bacaBendera, BENDERA_APPLY, buatRencana } from "./argumen.js";
import { gofmtWrite } from "./lib/goFmt.js";
import { bannerGenerated, komentarGo, komentarTs } from "./lib/banner.js";

const { jalur, t, aturan } = await muatKonteks();
const bendera = bacaBendera(process.argv.slice(2), [BENDERA_APPLY], t);

const berkasKatalog = jalur.shared("errors");
const doc = parse(readFileSync(berkasKatalog, "utf8")) as { generic?: string[]; domain?: string[] };
const semua = [...(doc.generic ?? []), ...(doc.domain ?? [])].sort();

/** `NOT_FOUND` -> `ErrNotFound`. */
const namaGo = (c: string) =>
  "Err" + c.split("_").map((s) => s[0]! + s.slice(1).toLowerCase()).join("");

const banner = bannerGenerated(berkasKatalog, jalur.akar, t);
const sitirC02 = aturan.label("contract", "02");

const isiGo = `${komentarGo(banner)}

package gen

${komentarGo(t("kontrak.komentar.error_code_tipe", { aturan: sitirC02 }))}
type ErrorCode string

const (
${semua.map((c) => `\t${namaGo(c)} ErrorCode = ${JSON.stringify(c)}`).join("\n")}
)

${komentarGo(t("kontrak.komentar.error_code_semua"))}
var AllErrorCodes = []ErrorCode{
${semua.map((c) => `\t${namaGo(c)},`).join("\n")}
}

${komentarGo(t("kontrak.komentar.error_code_parse"))}
func ParseErrorCode(s string) (ErrorCode, bool) {
\tfor _, c := range AllErrorCodes {
\t\tif string(c) == s {
\t\t\treturn c, true
\t\t}
\t}
\treturn "", false
}
`;

const isiTs = `${komentarTs(banner)}

export type ErrorCode =
${semua.map((c) => `  | ${JSON.stringify(c)}`).join("\n")};

export const ERROR_CODES: readonly ErrorCode[] = [
${semua.map((c) => `  ${JSON.stringify(c)},`).join("\n")}
] as const;
`;

const rencana = buatRencana(bendera.ada("apply"), t, (s) => console.log(s));
rencana.tambah(jalur.goGen("errorcodes.go"), isiGo, (p) => gofmtWrite(p, t));
rencana.tambah(jalur.emit("errorCodes"), isiTs);
rencana.jalankan();

console.log(t("kontrak.gen.ringkas_error_code", { jumlah: String(semua.length) }));
