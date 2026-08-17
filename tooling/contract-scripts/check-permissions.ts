/**
 * # Gate yang dimainkan berkas ini
 *
 * - **`gate:contract-permissions`** — auth dan permission dinyatakan DI KONTRAK ([[C-03]]), plus
 *   klausa SISI KONTRAK dari [[T-05]] (operasi ber-parameter ID di path wajib mendeklarasikan 404).
 *
 * Satu berkas boleh memainkan lebih dari satu gate, dan tiap gate yang ia mainkan disebutkan di
 * blok ini. Alasannya prosedural, bukan kerapian: [[G-01]] menyuruh pembaca meng-grep SUMBER GATE
 * untuk ID aturannya, jadi nama gate yang tak pernah muncul di sumber mana pun membuat prosedur
 * itu memulangkan nol hasil — dan nol hasil dibaca sebagai "aturannya tak bertuan", padahal
 * penegaknya ada.
 *
 * Enam sisi, semuanya harus cocok:
 *   1. skema keamanan dideklarasikan global;
 *   2. tiap `x-permission` di kontrak ada di katalog tertutup, dan operasi publik tidak punya
 *      permission sama sekali (kalau punya, salah satunya bohong);
 *   3. tiap entri katalog ada di data seed — kalau tidak, guard menunjuk permission yang tak bisa
 *      dipegang role mana pun, jadi izinnya mati sejak ditulis;
 *   4. tiap entri BARU mengikuti pola `<DOMAIN>_<AKSI>`; nama warisan dikecualikan lewat daftar
 *      terpisah, karena menggantinya adalah migrasi data plus penugasan ulang role;
 *   5. operasi ber-security mendeklarasikan 401 dan 403;
 *   6. operasi ber-parameter ID di path mendeklarasikan 404 juga ([[T-05]]).
 *
 * Sisi ketujuh — operasi publik terdaftar dua arah di buku besar — hidup di
 * `check-public-allowlist.ts`, gate yang sama, berkas berbeda.
 *
 * **Batas yang gate ini TIDAK tutup, dan sebutkan saat mengutipnya:** ia memeriksa apa yang
 * DIDEKLARASIKAN, bukan apa yang DIPANCARKAN. Bahwa 404 tertulis di kontrak tidak membuktikan
 * server benar-benar menjawab 404 untuk baris penyewa lain — separuh runtime itu milik [[T-05]]
 * dan dijaga uji per modul, bukan gate ini. Perbandingan terhadap guard yang ditulis tangan di
 * server juga sudah DIHAPUS, bukan dipertahankan: sejak guard diturunkan dari `x-permission` yang
 * sama lewat wiring generated, membandingkan keduanya cuma membuktikan generatornya jalan
 * ([[G-05]]).
 */
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { muatKonteks } from "./konteks.js";
import { buatPengumpul } from "./aturan.js";
import {
  isCanonicalPermissionName,
  loadPermissionCatalog,
  readSeederPermissionCodes,
} from "./lib/catalog.js";

const METODE = ["get", "post", "put", "delete", "patch"];
const BATAS_TAMPIL = 100;

const { jalur, t, aturan } = await muatKonteks();

const berkasKatalog = jalur.shared("permissions");
// Label diambil lewat pengumpul supaya kaki keluaran hanya menunjuk aturan yang BENAR-BENAR
// disitir run ini — bukan daftar tetap yang mengirim pembaca ke paragraf yang tidak menyala.
const pengumpul = buatPengumpul(aturan);
// Sitiran BERBEDA untuk sisi 404, dan itu bukan detail: pembaca yang membuka C-03 untuk temuan
// 404 akan menemukan aturan tentang katalog permission, bukan tentang existence oracle. Aturan
// yang benar untuk temuan itu adalah T-05, dan penegaknya memang gate ini.

const temuan: string[] = [];
// `pengumpul.label` dipanggil DI SINI, bukan sekali di atas: yang dicatat harus aturan yang
// temuannya sungguh terjadi, bukan aturan yang labelnya kebetulan sudah dirakit.
const gagal = (pesan: string) => temuan.push(`${pengumpul.label("contract", "03")} ${pesan}`);
const gagal404 = (pesan: string) => temuan.push(`${pengumpul.label("tenancy", "05")} ${pesan}`);

const katalog = loadPermissionCatalog(berkasKatalog);
const dikenal = new Set(katalog.permissions);
const warisan = new Set(katalog.legacyNames);

// — Sisi 3: katalog ⊆ data seed.
//
// Semesta kosong diperlakukan sebagai KEGAGALAN, bukan sebagai "tidak ada yang perlu diperiksa"
// ([[G-05]]): katalog yang berisi permission sementara `contract.permissionSeeds` kosong berarti
// pemeriksaan ini tidak berjalan sama sekali, dan gate yang tidak menjalankan pemeriksaannya
// mencetak hijau yang sama persis dengan gate yang lulus. Proyek yang memang belum punya satu
// permission pun lolos — di sana tidak ada klaim untuk dibuktikan.
const berkasSeed = jalur.permissionSeeds();
if (berkasSeed.length === 0) {
  if (katalog.permissions.length > 0) {
    gagal(
      t("kontrak.permission.seed_tak_dikonfigurasi", {
        berkas: berkasKatalog,
        jumlah: String(katalog.permissions.length),
      }),
    );
  }
} else {
  const kodeSeed = readSeederPermissionCodes(berkasSeed);
  for (const p of katalog.permissions) {
    if (!kodeSeed.has(p)) {
      gagal(
        t("kontrak.permission.tanpa_seed", {
          permission: p,
          berkas: berkasKatalog,
          seed: berkasSeed.join(", "),
        }),
      );
    }
  }
}

// — Sisi 4: pola nama, hanya untuk entri di luar daftar warisan.
for (const p of katalog.permissions) {
  if (warisan.has(p)) continue;
  if (!isCanonicalPermissionName(p)) gagal(t("kontrak.permission.pola_nama", { permission: p }));
}
for (const p of katalog.legacyNames) {
  if (!dikenal.has(p)) gagal(t("kontrak.permission.warisan_asing", { permission: p }));
}

const bundle = parse(readFileSync(jalur.bundle(), "utf8")) as {
  components?: { securitySchemes?: Record<string, unknown> };
  paths?: Record<string, Record<string, Record<string, unknown>>>;
};

// — Sisi 1: skema keamanan dideklarasikan global. Nol skema berarti setiap `security` di operasi
// menunjuk sesuatu yang tidak ada, dan validator OpenAPI tidak selalu memerahkan itu.
const skema = bundle.components?.securitySchemes ?? {};
if (Object.keys(skema).length === 0) {
  gagal(t("kontrak.permission.skema_keamanan_hilang"));
}

// — Sisi 2: `x-permission` per operasi.
let diperiksa = 0;
let diimplementasi = 0;
for (const [urlPath, ops] of Object.entries(bundle.paths ?? {})) {
  for (const [method, op] of Object.entries(ops)) {
    if (!METODE.includes(method)) continue;
    const key = `${method.toUpperCase()} ${urlPath}`;
    diperiksa++;

    const publik = Array.isArray(op["security"]) && (op["security"] as unknown[]).length === 0;
    // `x-permission` boleh SKALAR (satu permission) atau LARIK (rute berpermission ganda).
    // String berkoma TIDAK sah dan tidak pernah dinormalkan jadi larik di sini: pembaca kontrak
    // mana pun akan membacanya sebagai SATU nama permission, jadi memperlakukannya sebagai dua
    // hanya di gate ini akan membuat gate dan server berbeda pendapat.
    const mentah = op["x-permission"] ?? null;
    const permissions: string[] =
      mentah === null ? [] : Array.isArray(mentah) ? (mentah as string[]) : [String(mentah)];

    // Divalidasi PER ELEMEN — larik yang salah satu elemennya di luar katalog harus gagal, bukan
    // lolos karena bentuk gabungannya tidak dikenali. Berlaku untuk SELURUH operasi tanpa
    // penyempitan apa pun, termasuk yang ditandai belum diimplementasi: `x-permission` salah
    // ketik harus tertangkap sejak ditulis.
    for (const p of permissions) {
      if (!dikenal.has(p)) {
        gagal(t("kontrak.permission.di_luar_katalog", { operasi: key, permission: p, berkas: berkasKatalog }));
      }
    }
    if (publik && permissions.length > 0) {
      gagal(t("kontrak.permission.publik_tapi_berizin", { operasi: key, permission: permissions.join(", ") }));
    }

    // Operasi yang kontraknya sendiri nyatakan belum diimplementasi belum pernah melewati proses
    // yang menulis 401/403 — menuntutnya di sini memerahkan gate pada keadaan yang sudah
    // diumumkan jujur di kontrak. Penanda ini adalah pengecualian yang dinyatakan DI KONTRAK,
    // terlihat dan ikut direview — bukan disimpulkan dari teks sumber server ([[G-03]] butir 2).
    if (op["x-not-implemented"] === true) continue;
    diimplementasi++;

    const responses = (op["responses"] ?? {}) as Record<string, unknown>;
    if (!publik) {
      for (const kode of ["401", "403"]) {
        if (!(kode in responses)) {
          gagal(t("kontrak.permission.respons_hilang", { operasi: key, kode }));
        }
      }
    }

    // — Sisi 6: operasi ber-parameter ID di path wajib mendeklarasikan 404 ([[T-05]]).
    //
    // Ini bukan kerapian dokumentasi. Batas penyewa TIDAK dijawab 403: baris milik penyewa lain
    // dijawab 404, karena dari sudut pandang penyewa yang meminta ia memang tidak ada — dan 403 di
    // situ MENGONFIRMASI keberadaannya, yaitu existence oracle yang [[T-05]] ada untuk menutupnya.
    // Operasi yang tidak mendeklarasikan 404 membuat klien generated tak punya tipe untuk jawaban
    // yang paling sering diterimanya saat menebak ID.
    //
    // Berlaku untuk operasi PUBLIK juga: sebuah operasi publik ber-parameter ID tetap bisa
    // membocorkan keberadaan baris. Yang dikecualikan hanya operasi yang kontraknya sendiri
    // nyatakan belum diimplementasi (di atas), sama seperti sisi 5.
    if (/\{[^}]+\}/.test(urlPath) && !("404" in responses)) {
      gagal404(t("kontrak.permission.respons_404_hilang", { operasi: key }));
    }
  }
}

if (temuan.length) {
  console.error(t("kontrak.permission.gagal", { jumlah: String(temuan.length) }));
  for (const e of temuan.slice(0, BATAS_TAMPIL)) console.error(`  ${e}`);
  // Batas tampilan harus MENGATAKAN dirinya: daftar yang berhenti diam-diam di 100 terbaca
  // seperti "hanya segitu".
  if (temuan.length > BATAS_TAMPIL) {
    console.error(t("kontrak.envelope.dipotong", { jumlah: String(temuan.length - BATAS_TAMPIL) }));
  }
  console.error(pengumpul.kaki(temuan));
  process.exit(1);
}

console.log(
  t("kontrak.permission.ok", {
    operasi: String(diperiksa),
    diimplementasi: String(diimplementasi),
    permission: String(katalog.permissions.length),
    warisan: String(katalog.legacyNames.length),
  }),
);
