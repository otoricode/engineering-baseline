/**
 * Tulis dokumen OpenAPI minimal berisi HANYA schema bersama.
 *
 * Dokumen ini masukan untuk paket generated bersama — satu-satunya tempat schema envelope
 * didefinisikan sebagai tipe. Paket per-tag mengalias ke sana alih-alih menyalin strukturnya, dan
 * itulah yang membuat envelope benar-benar TUNGGAL ([[C-01]]) dan bukan sekadar bentuk yang mirip
 * di sebelas tempat.
 *
 * Daftar "apa yang bersama" DITURUNKAN dari kunci `components.schemas` di berkas envelope — bukan
 * ditulis tangan di sini. Menambah schema ke berkas itu otomatis membuatnya bersama.
 *
 * Isinya diambil dari BUNDEL, bukan dari berkas envelope langsung: bundel adalah dokumen yang
 * sama persis yang dibaca generasi per-tag, jadi mustahil paket bersama dan paket per-tag melihat
 * bentuk yang berbeda.
 *
 * Keluarannya artefak ANTARA dan sengaja tidak di-commit; yang di-commit adalah kode hasilnya.
 */
import { readFileSync } from "node:fs";
import { parse, stringify } from "yaml";
import { muatKonteks } from "./konteks.js";
import { bacaBendera, BENDERA_APPLY, buatRencana } from "./argumen.js";

const { jalur, t, aturan } = await muatKonteks();
const bendera = bacaBendera(process.argv.slice(2), [BENDERA_APPLY], t);

const berkasEnvelope = jalur.shared("envelope");
const berkasBundle = jalur.bundle();

const sumber = parse(readFileSync(berkasEnvelope, "utf8")) as {
  components?: { schemas?: Record<string, unknown> };
};
const nama = Object.keys(sumber.components?.schemas ?? {});
if (nama.length === 0) {
  console.error(`${aturan.label("contract", "01")} ${t("kontrak.gen.shared_kosong", { berkas: berkasEnvelope })}`);
  console.error(aturan.footer("contract", "01"));
  process.exit(1);
}

const bundle = parse(readFileSync(berkasBundle, "utf8")) as {
  openapi?: string;
  components?: { schemas?: Record<string, unknown> };
};

const schemas: Record<string, unknown> = {};
for (const n of nama) {
  const s = bundle.components?.schemas?.[n];
  if (s === undefined) {
    console.error(
      `${aturan.label("contract", "01")} ${t("kontrak.gen.schema_hilang_di_bundel", {
        schema: n,
        sumber: berkasEnvelope,
        bundel: berkasBundle,
      })}`,
    );
    console.error(aturan.footer("contract", "01"));
    process.exit(1);
  }
  schemas[n] = s;
}

// `paths: {}` — dokumen ini memang tidak punya operasi. Konfigurasi generator paket bersama wajib
// mematikan pemangkasan komponen tak-terpakai, justru karena itu: tanpa itu, generator memangkas
// SELURUH schema di sini karena tak satu pun dirujuk operasi.
const rencana = buatRencana(bendera.ada("apply"), t, (s) => console.log(s));
rencana.tambah(
  jalur.sharedSpec(),
  stringify({
    // Versi OpenAPI diwarisi dari bundel, bukan dipaku: memaku versi berbeda dari bundel akan
    // membuat generator paket bersama dan generator per-tag membaca dialek yang berbeda.
    openapi: bundle.openapi ?? "3.0.3",
    info: {
      title: "shared components",
      version: "1.0.0",
      description: t("kontrak.komentar.shared_spec_deskripsi"),
    },
    paths: {},
    components: { schemas },
  }),
);
rencana.jalankan();

console.log(t("kontrak.gen.ringkas_shared", { jumlah: String(nama.length), nama: nama.join(", ") }));
