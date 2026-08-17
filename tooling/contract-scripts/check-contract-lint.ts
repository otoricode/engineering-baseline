/**
 * # Gate yang dimainkan berkas ini
 *
 * - **`gate:contract-lint`** — badan permintaan dilarang berbentuk union ([[C-05]]).
 *
 * Satu berkas boleh memainkan lebih dari satu gate, dan tiap gate yang ia mainkan disebutkan di
 * blok ini. Alasannya prosedural: [[G-01]] menyuruh pembaca meng-grep SUMBER GATE untuk ID
 * aturannya, jadi nama gate yang tak pernah muncul di sumber mana pun membuat prosedur itu
 * memulangkan nol hasil — dan nol hasil dibaca sebagai "aturannya tak bertuan", padahal
 * penegaknya ada.
 *
 * # Kenapa ini ada DI SAMPING linter OpenAPI, bukan menggantikannya
 *
 * `gate:contract-lint` di workflow kontrak menjalankan DUA hal, dan pembagiannya bukan kerapian:
 *
 *   linter OpenAPI (`redocly lint`)  dokumennya SAH menurut spesifikasi — struktur, `$ref` hidup,
 *                                    operationId unik, dan sederet aturan gaya. Ia alat luar, dan
 *                                    itu sah: aturan boleh ditegakkan alat luar.
 *   berkas ini                       bentuk yang LOLOS linter tapi DITOLAK generator. Union di
 *                                    badan permintaan adalah OpenAPI yang sepenuhnya sah — tak
 *                                    satu pun linter menolaknya — dan justru itu definisi kelasnya.
 *
 * Karena itu langkah linter saja tidak pernah bisa membuat kolom penegak [[C-05]] jadi fakta:
 * linter yang meloloskan bentuk yang aturannya larang adalah kolom penegak yang berbohong, dan
 * kolom yang berbohong lebih buruk daripada kolom kosong — ia menghentikan orang membangun
 * penjaga yang sungguhan.
 *
 * Saudara-saudara bentuk union yang [[C-05]] sebut (`items` bentuk tuple, `allOf` bertipe
 * kontradiktif, dua properti yang menciut ke nama tipe yang sama, objek di badan multipart, graf
 * rujukan siklik) TIDAK diperiksa di sini, dan aturannya sendiri sudah menyebut penjaganya:
 * menjalankan codegen kedua sisi sebagai bagian gate, lalu menuntut diff kosong — itu langkah
 * `gate:generated-sync` di workflow backend. Sebut batas ini saat mengutip berkas ini; menuliskan
 * seolah ia menutup kelima saudaranya akan mengulang persis cacat yang [[G-01]] hukum.
 */
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { buatPengumpul } from "./aturan.js";
import { muatKonteks } from "./konteks.js";
import { periksaBadanUnion, type Bundel } from "./lib/requestUnion.js";

const METODE = ["get", "post", "put", "delete", "patch"];

const { jalur, t, aturan } = await muatKonteks();

const bundel = parse(readFileSync(jalur.bundle(), "utf8")) as Bundel;
const pengumpul = buatPengumpul(aturan);
const sitir = pengumpul.label("contract", "05");
const hasil = periksaBadanUnion(bundel, METODE);

const temuan = hasil.temuan.map((f) =>
  f.jenis === "union"
    ? `${sitir} ${t("kontrak.lint.badan_union", {
        operasi: f.operasi,
        media: f.media,
        lokasi: f.lokasi,
        kata: f.kata,
      })}`
    : `${sitir} ${t("kontrak.lint.ref_gagal", {
        operasi: f.operasi,
        media: f.media,
        lokasi: f.lokasi,
        sebab: f.sebab,
      })}`,
);

if (temuan.length) {
  console.error(t("kontrak.lint.gagal", { jumlah: String(temuan.length), berkas: jalur.bundle() }));
  for (const e of temuan) console.error(`  ${e}`);
  console.error(pengumpul.kaki(temuan));
  process.exit(1);
}

// NOL badan permintaan dibaca adalah keadaan yang wajib disebut, bukan hijau polos: bundel yang
// salah alamat, `paths` kosong, atau daftar metode yang menyusut semuanya menghasilkan gate yang
// memeriksa nol artefak — dan gate yang memeriksa nol artefak bukan hijau, ia buta ([[G-05]]).
console.log(
  t("kontrak.lint.ok", {
    operasi: String(hasil.operasi),
    badan: String(hasil.badan),
    berkas: jalur.bundle(),
  }),
);
