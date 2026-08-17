/**
 * # Gate yang dimainkan berkas ini
 *
 * - **`gate:backend-routes`** — tiap modul yang punya berkas pendaftaran benar-benar TERPASANG di titik
 *   masuk ([[B-01]]), dan buku besar modul beserta sumbu generasinya diperiksa terhadap
 *   kenyataan, dua arah ([[G-05]]).
 * - **`gate:contract-routes`** — satu nama parameter per posisi path ([[C-06]]) — pemeriksaan SISI
 *   KONTRAK murni, tidak menyentuh sumber server sama sekali. Ia dinamai terpisah justru karena
 *   itu: nama gate menjadi pesan gagal, dan gate bernama "backend" akan mengirim orang mencari
 *   cacatnya di server padahal letaknya di kontrak.
 *
 * Satu berkas boleh memainkan lebih dari satu gate, dan tiap gate yang ia mainkan disebutkan di
 * blok ini. Alasannya prosedural: [[G-01]] menyuruh pembaca meng-grep SUMBER GATE untuk ID
 * aturannya, jadi nama gate yang tak pernah muncul di sumber mana pun membuat prosedur itu
 * memulangkan nol hasil — dan nol hasil dibaca sebagai "aturannya tak bertuan", padahal
 * penegaknya ada.
 *
 * Empat pemeriksaan struktural, tidak satu pun membaca MAKNA kode.
 *
 *   (a) tiap direktori feature yang punya berkas pendaftaran benar-benar TERPASANG di titik masuk
 *       ([[B-01]]) — kalau tidak, ia RUTE HANTU: kontrak dituntut menyediakan operasi untuk
 *       endpoint yang tak pernah melayani trafik;
 *   (b) tiap POSISI path kontrak cuma dipakai SATU nama parameter — router panic kalau dua nama
 *       berbeda menempati posisi yang sama, sesuatu yang OpenAPI tidak melarang;
 *   (c) buku besar modul utuh dan JUJUR, dua arah ([[G-05]]);
 *   (d) sumbu generasi: klaim "tergenerate"/"handWired" == keadaan berkas di disk, dua arah.
 *
 * ## Kenapa (c) menggantikan perbandingan himpunan rute
 *
 * Gate ini dulu membandingkan himpunan rute kontrak terhadap rute yang dibaca dari sumber server
 * dengan regex. Perbandingan itu berhenti bermakna begitu sebuah modul memakai wiring generated:
 * rutenya tidak lagi tertulis tangan — ia lahir dari kontrak yang sama. Membandingkan kontrak
 * terhadap sesuatu yang di-generate dari kontrak hanya membuktikan generatornya jalan. Parsernya
 * DIHAPUS, bukan diperbaiki, dan diganti buku besar dua arah ([[G-05]]).
 *
 * Yang benar-benar perlu dibuktikan — "rute yang TERPASANG di router == spec kontrak" — hanya
 * bisa dilihat dari dalam server, dan di sanalah ia dibuktikan: uji per modul yang menuntut
 * kecocokan DUA ARAH terhadap router produksi sungguhan ([[B-01]]).
 *
 * (b) TIDAK menyitir ID aturan, dan itu disengaja: standar ini belum punya aturan untuk kelas
 * "bentuk kontrak yang sah tapi mustahil dipasang router". Lihat `lib/paramPositions.ts`.
 *
 * (a), (b), dan (d) TIDAK punya mekanisme pengecualian — ketiganya bug struktural yang diperbaiki
 * di kode, bukan didaftarkan sebagai utang.
 */
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { muatKonteks } from "./konteks.js";
import { buatPengumpul } from "./aturan.js";
import { adaLapisBackend } from "./paths.js";
import { listFeatureDirsWithRegister } from "./lib/routes.js";
import { checkModuleWiring } from "./lib/mainWiring.js";
import { checkParamPositionCollisions } from "./lib/paramPositions.js";
import {
  loadBukuBesar,
  pembacaGenerasi,
  pembacaRegister,
  periksaCakupanTag,
  periksaGenerasi,
  periksaKesesuaianMount,
  type BukuBesar,
} from "./lib/mountedModules.js";

const METODE = ["get", "post", "put", "delete", "patch"];

const { jalur, config, t, aturan } = await muatKonteks();

const berkasBukuBesar = jalur.ledger("mountedModules");
const berkasOptIn = jalur.ledger("envelopeOptIn");

/**
 * Skrip ini memainkan DUA gate sekaligus, dan cuma satu di antaranya menyentuh backend:
 * `gate:backend-routes` (modul terpasang di titik masuk) dan `gate:contract-routes` (tabrakan nama
 * parameter — murni sisi kontrak). Karena itu ia terdaftar di kedua lapis, dan karena itu pula ia
 * TIDAK boleh keluar 2 di proyek contract-only: `standard gate --lapis contract` akan berhenti bisa
 * hijau untuk mereka, padahal paruh kontraknya sepenuhnya berlaku.
 *
 * Jadi paruh backend DILEWATI — dan lewatannya DICETAK. Pemeriksaan yang diam-diam tidak berjalan
 * adalah kelas cacat yang paket ini ada untuk melawannya; pembaca yang melihat langkah ini lulus
 * harus tahu ia lulus SEPARUH, dan kenapa.
 */
const adaBackend = adaLapisBackend(config);
if (!adaBackend) {
  console.log(t("kontrak.rute.lewat_backend"));
}
const dirFeature = adaBackend ? jalur.goFeature() : null;
// Label dirakit di muka HANYA karena ia diteruskan ke fungsi lib sebagai prefix; yang MENCATAT
// aturannya adalah `pengumpul.label`, jadi keduanya sengaja dipanggil di titik pemakaiannya
// masing-masing di bawah, bukan sekali di sini.
const pengumpul = buatPengumpul(aturan);

const bundle = parse(readFileSync(jalur.bundle(), "utf8")) as {
  paths?: Record<string, Record<string, unknown>>;
};
const paths = bundle.paths ?? {};

const temuan: string[] = [];
const fiturBerRegister = dirFeature === null ? [] : listFeatureDirsWithRegister(dirFeature);

// — (a) tiap berkas pendaftaran wajib benar-benar terpasang di titik masuk.
//
// Titik masuk dan bentuk daftar modulnya datang dari config, dan keduanya WAJIB terisi begitu ada
// satu pun direktori feature. Config kosong + feature kosong = tidak ada yang perlu diperiksa dan
// gate lolos; config kosong + feature ADA = pemeriksaan ini tidak berjalan sama sekali, dan gate
// yang tidak menjalankan pemeriksaannya mencetak hijau yang sama persis dengan gate yang lulus
// ([[G-05]]: gagal pada semesta kosong, jangan diam).
const entrypoint = adaBackend ? jalur.goEntrypoint() : null;
const penanda = config.go?.registrarType;
if (!adaBackend) {
  // Sengaja kosong: tidak ada direktori feature untuk dipindai, jadi tidak ada yang bisa
  // dilanggar. Lewatannya sudah dicetak di atas — di sini tidak boleh ada temuan, karena
  // "tidak punya backend" bukan pelanggaran.
} else if (entrypoint === null || penanda === undefined || penanda.trim() === "") {
  if (fiturBerRegister.length > 0) {
    temuan.push(
      `${pengumpul.label("backend", "01")} ${t("kontrak.rute.entrypoint_tak_dikonfigurasi", {
        jumlah: String(fiturBerRegister.length),
        dir: dirFeature ?? "",
      })}`,
    );
  }
} else {
  temuan.push(
    ...checkModuleWiring(
      readFileSync(entrypoint, "utf8"),
      fiturBerRegister,
      { featureDir: config.go?.featureDir ?? "", penanda, namaBerkas: entrypoint },
      t,
      pengumpul.label("backend", "01"),
    ),
  );
}

// — (b) satu nama parameter per posisi path kontrak.
temuan.push(...checkParamPositionCollisions(paths, METODE, t, pengumpul.label("contract", "06")));

// — (c) buku besar wiring utuh dan jujur.
//
// `loadBukuBesar` melempar SAAT MEMUAT (bentuk berkas salah) supaya kegagalan konfigurasi terbaca
// sebagai kegagalan konfigurasi, bukan stack trace di tengah pemeriksaan.
let bukuBesar: BukuBesar;
try {
  bukuBesar = loadBukuBesar(readFileSync(berkasBukuBesar, "utf8"), berkasBukuBesar, t);
} catch (err) {
  const pesan = `${pengumpul.label("gate", "05")} ${t("kontrak.rute.buku_besar_rusak", { sebab: (err as Error).message })}`;
  console.error(pesan);
  console.error(pengumpul.kaki([pesan]));
  process.exit(1);
}

// Entri ber-`:` adalah opt-in per OPERASI, bukan per tag — buku besar ini berbutir tag, jadi
// entri operasi tunggal tidak punya baris di sini dan tidak boleh dituntut punya.
const tagOptIn = (
  (JSON.parse(readFileSync(berkasOptIn, "utf8")) as { tags?: unknown }).tags as string[] | undefined ?? []
).filter((tag) => !tag.includes(":"));

temuan.push(
  ...periksaCakupanTag(bukuBesar, tagOptIn, { bukuBesar: berkasBukuBesar, optIn: berkasOptIn }, t, pengumpul.label("gate", "05")),
);
if (dirFeature !== null) {
  temuan.push(
    ...periksaKesesuaianMount(bukuBesar, pembacaRegister(dirFeature), berkasBukuBesar, t, pengumpul.label("gate", "05")),
  );
}

// — (d) Sumbu generasi.
//
// Arah yang membuat ini berharga: direktori berkerangka generated yang TIDAK tercatat. Kerangka
// tergenerate belum punya implementasi akses datanya — ia boot, terdaftar di router, dan PANIC
// pada request pertama. Tanpa gate ini kegagalannya baru terlihat di produksi.
if (dirFeature !== null) {
  const pembaca = pembacaGenerasi(dirFeature, jalur.sufiksGen());
  temuan.push(
    ...periksaGenerasi(bukuBesar, pembaca.daftarDir, pembaca.bacaKeadaan, berkasBukuBesar, t, pengumpul.label("gate", "05")),
  );
}

if (temuan.length) {
  console.error(t("kontrak.rute.gagal", { jumlah: String(temuan.length) }));
  for (const e of temuan) console.error(`  ${e}`);
  console.error(pengumpul.kaki(temuan));
  process.exit(1);
}

console.log(
  t("kontrak.rute.ok", {
    fitur: String(fiturBerRegister.length),
    mount: String(Object.keys(bukuBesar.mount).length),
    menunggu: String(Object.keys(bukuBesar.optInBelumMount).length),
    belumOptIn: String(bukuBesar.belumOptIn.length),
  }),
);
