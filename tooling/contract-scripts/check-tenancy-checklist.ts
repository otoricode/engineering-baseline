/**
 * # Gate yang dimainkan berkas ini
 *
 * - **`gate:tenancy-checklist`** — daftar periksa lintas-penyewa yang digenerate wajib sudah
 *   dikonsumsi (jadi uji sungguhan, lalu dihapus) sebelum modulnya dibekukan ([[T-07]]).
 *
 * Satu berkas boleh memainkan lebih dari satu gate, dan tiap gate yang ia mainkan disebutkan di
 * blok ini. Alasannya prosedural: [[G-01]] menyuruh pembaca meng-grep SUMBER GATE untuk ID
 * aturannya, jadi nama gate yang tak pernah muncul di sumber mana pun membuat prosedur itu
 * memulangkan nol hasil — dan nol hasil dibaca sebagai "aturannya tak bertuan", padahal
 * penegaknya ada.
 *
 * Yang gate ini TIDAK lakukan, dan sebutkan batas ini saat mengutipnya: ia tidak membaca satu pun
 * predikat kueri. Ia tidak bisa — batas penyewa hidup di predikat, dan itu persis yang tidak bisa
 * diturunkan dari artefak mana pun ([[T-01]], `manual-review-only`). Yang ia periksa adalah
 * KEWAJIBANNYA: bahwa daftar periksa yang generator tulis benar-benar dikerjakan, bukan dibekukan
 * bersama modulnya lalu dilupakan. Modul yang lulus gate ini belum terbukti aman; modul yang GAGAL
 * gate ini terbukti belum pernah menjawab pertanyaannya.
 *
 * Direktori feature yang tidak ada sama sekali adalah kegagalan ALAT (kode 2), bukan hijau: gate
 * yang memindai nol artefak tidak bisa dibedakan dari gate yang lulus ([[G-05]]).
 */
import { existsSync } from "node:fs";
import { buatPengumpul } from "./aturan.js";
import { KELUAR_ALAT_GAGAL, muatKonteks } from "./konteks.js";
import { bacaFitur, periksaChecklistTenancy } from "./lib/tenancyChecklist.js";

const { jalur, t, aturan } = await muatKonteks();

const dirFeature = jalur.goFeature();
if (!existsSync(dirFeature)) {
  console.error(t("kontrak.tenancy.dir_tak_ada", { jalur: dirFeature }));
  process.exit(KELUAR_ALAT_GAGAL);
}

const pengumpul = buatPengumpul(aturan);
const fitur = bacaFitur(dirFeature, jalur.sufiksGen());
const hasil = periksaChecklistTenancy(fitur, t, pengumpul.label("tenancy", "07"));

if (hasil.temuan.length) {
  console.error(t("kontrak.tenancy.gagal", { jumlah: String(hasil.temuan.length) }));
  for (const e of hasil.temuan) console.error(`  ${e}`);
  console.error(pengumpul.kaki(hasil.temuan));
  process.exit(1);
}

// Ketiga angka disebut SELALU, bukan cuma saat ada temuan. Gate yang hijau karena tidak punya
// pekerjaan (nol modul beku) tidak boleh terbaca sama dengan gate yang hijau karena setiap modul
// beku sudah bersih.
console.log(
  t("kontrak.tenancy.ok", {
    dipindai: String(fitur.length),
    beku: String(hasil.beku),
    menunggu: String(hasil.tergenerateDenganChecklist),
  }),
);
