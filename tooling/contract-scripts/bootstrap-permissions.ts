/**
 * SEKALI JALAN saat mengadopsi standar ini: bangun katalog permission dari data seed yang sudah
 * ada.
 *
 * Pemakaian: `bootstrap-permissions [--apply]`
 *
 * Arahnya SEED -> katalog, dan itu tidak boleh dibalik. Kalau katalog dibangun dari guard di
 * server, guard yang menunjuk permission tak-ter-seed justru LOLOS gate — cacat yang gate itu ada
 * untuk menangkapnya ([[C-03]]): nol baris di basis data berarti nol role bisa memegangnya, jadi
 * izinnya efektif mati sejak ditulis.
 *
 * Ekstraksinya field-spesifik (`readSeederPermissionCodes`) dan dipakai BERSAMA gate permission —
 * satu parser, bukan dua yang bisa berbeda pendapat. Versi regex-superset (setiap string huruf
 * besar di berkas) menangkap 210 kandidat dan menuntut kurasi tangan; versi field-spesifik
 * menghasilkan 192 dengan NOL kurasi.
 *
 * Sesudah dijalankan sekali, berkas hasilnya MILIK TANGAN. Jangan jalankan ulang tanpa keputusan
 * eksplisit; menambah permission baru dilakukan dengan mengedit YAML-nya.
 */
import { muatKonteks } from "./konteks.js";
import { bacaBendera, BENDERA_APPLY, buatRencana } from "./argumen.js";
import { isCanonicalPermissionName, readSeederPermissionCodes } from "./lib/catalog.js";

const { jalur, t, aturan } = await muatKonteks();
const bendera = bacaBendera(process.argv.slice(2), [BENDERA_APPLY], t);

const berkasSeed = jalur.permissionSeeds();
if (berkasSeed.length === 0) {
  console.error(
    `${aturan.label("contract", "03")} ${t("kontrak.permission.seed_tak_dikonfigurasi", {
      berkas: jalur.shared("permissions"),
      jumlah: "0",
    })}`,
  );
  console.error(aturan.footer("contract", "03"));
  process.exit(1);
}

const ditemukan = [...readSeederPermissionCodes(berkasSeed)].sort();
const warisan = ditemukan.filter((p) => !isCanonicalPermissionName(p));

const yaml = `${t("kontrak.komentar.katalog_permission", { aturan: aturan.label("contract", "03") })
  .split("\n")
  .map((baris) => (baris === "" ? "#" : `# ${baris}`))
  .join("\n")}

permissions:
${ditemukan.map((p) => `  - ${p}`).join("\n")}

legacyNames:
${warisan.map((p) => `  - ${p}`).join("\n")}
`;

const rencana = buatRencana(bendera.ada("apply"), t, (s) => console.log(s));
rencana.tambah(jalur.shared("permissions"), yaml);
rencana.jalankan();

console.log(
  t("kontrak.bootstrap.ringkas_permission", {
    jumlah: String(ditemukan.length),
    warisan: String(warisan.length),
    seed: berkasSeed.join(", "),
  }),
);
