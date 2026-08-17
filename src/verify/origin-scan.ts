/**
 * Pemindai portabilitas: apa yang paket ini bawa dari tempat asalnya, dan apa yang ia ANDAIKAN
 * ada di proyek yang memasangnya.
 *
 * # Tiga kelas, satu berkas, dan alasan ketiganya duduk bersama
 *
 * Ketiganya menjawab pertanyaan yang sama dari sisi yang berbeda — "apa yang tidak ikut pindah
 * kalau folder ini disalin ke proyek lain?" — dan ketiganya dibaca oleh tahap `verify` yang sama.
 *
 *   1. NAMA PROYEK ASAL (`pindaiNamaAsal`). Nol kemunculan di seluruh folder, **tanpa satu pun
 *      pengecualian berkas**. Ini pelanggaran: kemunculannya berarti paket ini masih menyebut repo
 *      yang bukan milik pemakainya.
 *   2. PRASYARAT TERPAKU (`pindaiPrasyaratModul`). Jalur modul pihak ketiga yang generator tulis
 *      HARFIAH ke dalam kode hasil — `github.com/gin-gonic/gin`, `gorm.io/gorm`. Ini BUKAN
 *      pelanggaran: keputusannya sudah diambil, keduanya tetap terpaku. Yang jadi pelanggaran
 *      adalah prasyarat yang tidak TERBACA — asumsi portabilitas terbesar paket ini tidak boleh
 *      hanya bisa disimpulkan dari gate yang hijau.
 *   3. KONTRAK PAKET PLATFORM (`pindaiSimbolPlatform`). Simbol `appcontext.*`, `dtoconv.*`,
 *      `httpx.*`, dan `guard.*` yang muncul di kode yang generator pancarkan. Konsumen WAJIB
 *      menyediakan keempat paket itu; kode hasil tidak akan meng-compile tanpanya. Sama seperti
 *      (2), ia hanya berguna kalau tertulis.
 *
 * Kelas 2 dan 3 dijawab dengan MENGADU temuan pemindai ke daftar yang `INSTALL.md` nyatakan
 * (`periksaInventarisInstall`). Dua arah, dan kedua arah penting: prasyarat yang terpaku tapi tak
 * terdaftar adalah kejutan di mesin pemakai, dan prasyarat yang terdaftar tapi tak lagi terpaku
 * adalah dokumen yang berbohong — kelas yang paket ini sudah dua kali perangi.
 *
 * # Tiap pengecualian membawa penjaganya
 *
 * Pemindai ini penuh pengecualian, dan tiap jalur "lewati kasus ini" adalah jalur di mana
 * pemeriksaannya TIDAK berjalan. Karena itu `pindaiNamaAsalRinci` memulangkan berapa kali TIAP
 * pengecualian benar-benar dipakai: pengecualian yang tidak pernah dipakai adalah pengecualian
 * yang salah alamat (atau sisa dari struktur folder yang sudah berubah), dan tahap verify
 * melaporkannya alih-alih membiarkannya membusuk.
 *
 * Kelas 1 punya **nol pengecualian berkas**. Yang tersisa cuma tiga direktori yang memang bukan
 * milik paket ini (`node_modules`, `.git`, `dist`). Tidak ada berkas yang kebal — termasuk berkas
 * ini sendiri, dan termasuk setiap dokumen yang kelak ditambahkan.
 */
import { readFile, readdir } from "node:fs/promises";
import path from "node:path";

const ABAIKAN_DIR = new Set(["node_modules", ".git", "dist"]);

/**
 * Nama proyek dan organisasi asal yang dipindai — **satu-satunya salinannya**.
 *
 * Dirakit lewat penyambungan supaya berkas ini sendiri tidak memuat satu pun utuh: sejak
 * pengecualian berkas dicabut, pemindai ini memindai DIRINYA SENDIRI, dan pemindai yang memerahkan
 * dirinya sendiri adalah pemindai yang orang matikan. Bentuk yang sama sudah dipakai
 * `tooling/genmodule/main_test.go` dan `tooling/gendto/main_test.go` sejak Task 11.
 *
 * Dua istilah terakhir dijaga meski hari ini NOL kemunculan: istilah yang dijaga sebelum ia muncul
 * lebih murah daripada yang dijaga sesudahnya.
 *
 * Yang keempat adalah nama pengguna/organisasi mesin tempat paket ini dibangun, dan ia masuk daftar
 * karena alasan KEDUA yang lebih kuat daripada sekadar menyinggung: satu-satunya bentuk ia pernah
 * muncul adalah JALUR ABSOLUT mesin itu, dan jalur absolut mesin pembangun BERBOHONG begitu
 * foldernya pindah — bukan sekadar menyebut nama. Bentuk yang benar untuk menyatakan letak adalah
 * SIFAT ("satu folder di luar semua repo"), bukan jalur: pernyataan yang tetap benar di mana pun
 * paket ini mendarat. Istilah ini yang menahan jalur semacam itu lahir kembali.
 */
export const NAMA_PROYEK_ASAL = ["desa" + "kita", "otori" + "code", "tata" + "desa", "otori" + "tech"];

export type Kemunculan = { berkas: string; baris: number; teks: string };

/** Berapa kali tiap pengecualian pemindai benar-benar dipakai. Nol = pengecualian mati. */
export type JejakPengecualian = Record<string, number>;

/**
 * Nama pengecualian yang dilacak, supaya tahap verify tidak menebak ejaannya.
 *
 * Ketiganya direktori, dan tak satu pun berkas: itu keadaan yang disengaja, dan ia hasil akhir dari
 * mencabut seluruh mesin "dokumen proses". Ketiga direktori ini bukan milik paket (dependensi,
 * riwayat git, keluaran build); SETIAP berkas paket dipindai tanpa kecuali.
 *
 * Yang ikut mati bersamanya, dan alasannya satu: kedua dokumen proses — yang mencatat dari mana
 * paket ini diturunkan dan bagaimana ia dibangun — DIHAPUS, jadi daftar "berkas yang boleh memuat
 * nama asal" jadi KOSONG. Daftar kosong yang tetap diadu tiga tempat adalah pemeriksaan yang tidak
 * bisa merah lagi, kelas cacat yang paket ini sendiri perangi; jadi konstantanya, blok inventarisnya
 * di `INSTALL.md`, dan pemeriksaan paritasnya dicabut seluruhnya alih-alih dikosongkan. Yang
 * tersisa di folder ini semuanya untuk dibawa, dan semuanya dipindai.
 */
export const PENGECUALIAN = [...ABAIKAN_DIR].sort();

type Berkas = { relatif: string; isi: string };

/**
 * Menelusuri satu akar dan memulangkan isi tiap berkas, sambil MENCATAT tiap kali sebuah
 * pengecualian dipakai. Simpul yang tak terbaca (izin, berkas biner yang hilang di tengah jalan)
 * dilewati — itu bukan pengecualian kebijakan, itu I/O.
 */
async function telusuri(
  akar: string,
  mulai: string,
  jejak: JejakPengecualian,
): Promise<Berkas[]> {
  const hasil: Berkas[] = [];
  const antre = async (dir: string): Promise<void> => {
    let entri;
    try {
      entri = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entri) {
      if (e.isDirectory()) {
        if (ABAIKAN_DIR.has(e.name)) {
          jejak[e.name] = (jejak[e.name] ?? 0) + 1;
          continue;
        }
        await antre(path.join(dir, e.name));
        continue;
      }
      const jalur = path.join(dir, e.name);
      try {
        hasil.push({ relatif: path.relative(akar, jalur), isi: await readFile(jalur, "utf8") });
      } catch {
        continue;
      }
    }
  };
  await antre(mulai);
  return hasil;
}

/**
 * Kelas 1 — kemunculan nama proyek asal, `berkas:baris` apa adanya.
 *
 * Tanda tangan ini dipakai langsung oleh uji dan oleh tahap verify; `pindaiNamaAsalRinci` adalah
 * bentuk yang sama plus jejak pengecualiannya.
 */
export async function pindaiNamaAsal(akar: string, pola: string[]): Promise<Kemunculan[]> {
  return (await pindaiNamaAsalRinci(akar, pola)).temuan;
}

export async function pindaiNamaAsalRinci(
  akar: string,
  pola: string[],
): Promise<{ temuan: Kemunculan[]; jejak: JejakPengecualian }> {
  const jejak: JejakPengecualian = {};
  const rendah = pola.map((p) => p.toLowerCase());
  const temuan: Kemunculan[] = [];
  for (const b of await telusuri(akar, akar, jejak)) {
    b.isi.split("\n").forEach((teks, i) => {
      const t = teks.toLowerCase();
      if (rendah.some((p) => t.includes(p))) {
        temuan.push({ berkas: b.relatif, baris: i + 1, teks: teks.trim() });
      }
    });
  }
  return { temuan, jejak };
}

/**
 * Akar yang dianggap SUMBER ALAT untuk kelas 2 dan 3.
 *
 * Bukan seluruh folder, dan tiap yang tidak ikut punya alasannya sendiri:
 *
 *   - `tooling/testdata/fixture/**` — itu proyek TARGET mini, lengkap dengan `go.sum` berisi 150+
 *     modul. Dependensi di sana milik fixture, bukan asumsi paket ini; memindainya akan mengubur
 *     ketiga prasyarat sungguhan di bawah ratusan baris kebisingan. `tooling/testdata/golden/**`
 *     JUSTRU ikut: itu keluaran generator kita sendiri, dan di sanalah prasyarat terpaku terlihat
 *     sebagai kode yang benar-benar dipancarkan.
 *   - `INSTALL.md` — itu DEKLARASInya. Kalau ia ikut dipindai, tiap entri yang ia daftarkan akan
 *     ikut ditemukan sebagai "bukti" bagi dirinya sendiri, dan arah pemeriksaan yang menangkap
 *     deklarasi BASI berhenti bisa merah selamanya. Ia tidak ikut karena tidak ada di daftar akar
 *     ini; `origin-scan.test.ts` mengikat sifat itu supaya ia tidak bisa hilang diam-diam.
 *   - berkas pemindai ini SENDIRI — alasan yang sama persis, dan bukan hipotesis: komentar di atas
 *     menyebut `gin`, `gorm`, dan dua simbol platform sebagai contoh, dan tanpa pengecualian ini
 *     prosa itu menjadi "bukti" bahwa generatornya masih memakukan keduanya. Hari generatornya
 *     berhenti memakukan `gorm`, deklarasi basi di `INSTALL.md` tidak akan pernah merah.
 *   - `rules/`, `STANDARD.md`, `AGENTS.md`, `README.md` — prosa. Menyebut `gorm.io/gorm` di sana
 *     adalah dokumentasi, bukan pemakuan.
 */
export const AKAR_SUMBER_ALAT = ["bin", "ci", "skills", "src", "tooling"] as const;

const ABAIKAN_SUMBER_ALAT = [
  path.join("tooling", "testdata", "fixture"),
  path.join("src", "verify", "origin-scan.ts"),
  path.join("src", "verify", "origin-scan.test.ts"),
];

/**
 * Jalur modul Go: host ber-titik diikuti setidaknya satu segmen. Lookbehind-nya menolak potongan
 * di tengah jalur yang lebih panjang, supaya `example.com/p/apps/api` tidak juga terbaca sebagai
 * modul `p/apps` yang tak pernah ada.
 */
const POLA_MODUL = /(?<![A-Za-z0-9._/@-])([a-z0-9][a-z0-9-]*(?:\.[a-z0-9-]+)+\/[A-Za-z0-9._~/-]+)/g;

/**
 * Namespace yang dicadangkan untuk contoh dan uji — RFC 2606 (`example.com/org/net`) dan RFC 6761
 * (`.test`, `.example`, `.invalid`, `.localhost`).
 *
 * Ini pengecualian yang menjawab satu keluhan konkret: `tooling/config.example.json`,
 * `src/config/load.test.ts`, `src/doctor/index.test.ts`, dan `tooling/gendto/main_test.go`
 * memuat `example.com/p/apps/api` sebagai NILAI config — `go.modulePath` proyek contoh — bukan
 * sebagai dependensi yang dipaku. Pemindai yang meng-grep buta akan memerahkan keempatnya.
 *
 * Dinyatakan sebagai ATURAN NAMESPACE, bukan sebagai daftar keempat berkas itu: daftar berkas
 * membusuk pada berkas kelima, dan namespace yang dicadangkan sudah menurut definisinya bukan
 * modul sungguhan.
 */
export function namespaceContoh(modul: string): boolean {
  const host = modul.split("/")[0]!;
  // Subdomain ikut: RFC 2606 mencadangkan `example.com` BESERTA turunannya, dan `gorm.example.org`
  // jelas-jelas contoh yang sama seperti `example.org`.
  const contoh = ["example.com", "example.org", "example.net"];
  return (
    contoh.some((c) => host === c || host.endsWith(`.${c}`)) ||
    /\.(test|example|invalid|localhost)$/.test(host)
  );
}

async function berkasSumberAlat(akar: string): Promise<Berkas[]> {
  const jejak: JejakPengecualian = {};
  const semua: Berkas[] = [];
  for (const sub of AKAR_SUMBER_ALAT) {
    // `telusuri` sudah memulangkan jalur relatif terhadap `akar`, jadi `b.relatif` di sini sudah
    // berbentuk `src/verify/index.ts` — bukan relatif terhadap `sub`.
    for (const b of await telusuri(akar, path.join(akar, sub), jejak)) {
      if (
        ABAIKAN_SUMBER_ALAT.some((a) => b.relatif === a || b.relatif.startsWith(`${a}${path.sep}`))
      ) {
        continue;
      }
      semua.push(b);
    }
  }
  return semua;
}

/** Kelas 2 — jalur modul pihak ketiga yang terpaku di sumber alat, beserta tiap situsnya. */
export async function pindaiPrasyaratModul(akar: string): Promise<Map<string, Kemunculan[]>> {
  const hasil = new Map<string, Kemunculan[]>();
  for (const b of await berkasSumberAlat(akar)) {
    b.isi.split("\n").forEach((teks, i) => {
      for (const m of teks.matchAll(POLA_MODUL)) {
        const modul = m[1]!;
        if (namespaceContoh(modul)) continue;
        const situs = hasil.get(modul) ?? [];
        situs.push({ berkas: b.relatif, baris: i + 1, teks: teks.trim() });
        hasil.set(modul, situs);
      }
    });
  }
  return hasil;
}

/** Keempat paket platform yang konsumen wajib sediakan. Nama daunnya literal — lihat gen-wiring. */
export const PAKET_PLATFORM = ["appcontext", "dtoconv", "guard", "httpx"] as const;

const POLA_SIMBOL = new RegExp(`(${PAKET_PLATFORM.join("|")})\\.([A-Z][A-Za-z0-9_]*)`, "g");

/**
 * Kelas 3 — simbol paket platform yang dipancarkan generator, dikunci `paket.Simbol`.
 *
 * Sengaja TANPA `\b` di depan: gen-wiring menulis kode hasil di dalam templat literal, jadi
 * simbolnya benar-benar muncul sebagai `\tguard.JoinPath(...)` dengan `\t` HARFIAH — dan `\b`
 * gagal di sana karena `t` dan `g` sama-sama karakter kata. Dua simbol (`guard.JoinPath`,
 * `httpx.RegisterV2Paths`) hilang dari pengukuran pertama justru karena itu.
 */
export async function pindaiSimbolPlatform(akar: string): Promise<Map<string, Kemunculan[]>> {
  const hasil = new Map<string, Kemunculan[]>();
  for (const b of await berkasSumberAlat(akar)) {
    b.isi.split("\n").forEach((teks, i) => {
      for (const m of teks.matchAll(POLA_SIMBOL)) {
        const kunci = `${m[1]!}.${m[2]!}`;
        const situs = hasil.get(kunci) ?? [];
        situs.push({ berkas: b.relatif, baris: i + 1, teks: teks.trim() });
        hasil.set(kunci, situs);
      }
    });
  }
  return hasil;
}

// ── inventaris INSTALL.md ────────────────────────────────────────────────────

/**
 * Blok inventaris di `INSTALL.md`, dibatasi penanda komentar HTML:
 *
 *     <!-- inventaris: prasyarat-modul -->
 *     | Modul | ... |
 *     |---|---|
 *     | `github.com/gin-gonic/gin` | ... |
 *     <!-- /inventaris -->
 *
 * Penanda, bukan judul bagian: judul disunting orang, penanda tidak. Entri sebuah baris adalah
 * token ber-backtick PERTAMA di kolom pertamanya.
 */
const AWAL_BLOK = /<!--\s*inventaris:\s*([a-z0-9:-]+)\s*-->/;
const AKHIR_BLOK = /<!--\s*\/inventaris\s*-->/;

export type Inventaris = {
  entri: string[];
  /**
   * Baris di dalam blok yang bukan header, bukan pemisah, dan bukan baris entri yang sah.
   *
   * DILAPORKAN, bukan dibuang. Baris yang tidak dikenali di dalam sebuah blok inventaris adalah
   * satu dari dua hal: entri yang salah tulis (jadi ia TIDAK ikut diadu dengan hasil pemindai,
   * dan pemeriksaannya diam-diam menciut), atau format yang sudah berubah tanpa parser ini ikut
   * berubah. Keduanya harus berbunyi.
   */
  takDikenali: { baris: number; teks: string }[];
  /**
   * Entri yang salah satu kolom keterangannya KOSONG.
   *
   * Kolom keterangan membawa satu-satunya hal yang tidak bisa diturunkan dari nama entrinya. Untuk
   * kontrak paket platform itu **kewajiban** simbolnya — termasuk kalimat paling menanggung-beban
   * di seluruh paket ini, `found == false` WAJIB menolak. Prosanya sendiri tidak bisa diverifikasi
   * mesin, dan `INSTALL.md` §6 menyatakan batas itu terang-terangan alih-alih membiarkan pembaca
   * mengira ia terjaga. Yang BISA dimesinkan adalah kehadirannya: entri yang masuk tabel tanpa
   * kewajiban tertulis adalah entri yang pembacanya tidak tahu harus berbuat apa dengannya.
   */
  tanpaKeterangan: string[];
};

export type InventarisInstall = {
  blok: Map<string, Inventaris>;
  /** Blok yang dibuka tapi tidak pernah ditutup — bukan blok kosong, tapi berkas yang rusak. */
  takTertutup: string[];
};

export function uraiInventaris(isi: string): InventarisInstall {
  const blok = new Map<string, Inventaris>();
  const takTertutup: string[] = [];
  const baris = isi.split("\n");

  let nama: string | null = null;
  let kini: Inventaris | null = null;

  for (const [i, teks] of baris.entries()) {
    const mulai = AWAL_BLOK.exec(teks);
    if (mulai !== null) {
      if (nama !== null) takTertutup.push(nama);
      nama = mulai[1]!;
      kini = { entri: [], takDikenali: [], tanpaKeterangan: [] };
      blok.set(nama, kini);
      continue;
    }
    if (kini === null) continue;
    if (AKHIR_BLOK.test(teks)) {
      nama = null;
      kini = null;
      continue;
    }
    const t = teks.trim();
    if (t === "") continue;
    // Header tabel dan barisan pemisahnya: keduanya bagian dari bentuk tabel, bukan entri.
    if (/^\|(\s*:?-+:?\s*\|)+$/.test(t)) continue;
    if (t.startsWith("|")) {
      const kolom = t.split("|").slice(1, -1);
      const backtick = /`([^`]+)`/.exec(kolom[0] ?? "");
      if (backtick !== null) {
        kini.entri.push(backtick[1]!);
        // Kolom keterangan kosong: entri yang tidak memberitahu pembacanya apa pun. Satu kolom
        // saja sudah cukup — baris berkolom satu adalah entri telanjang.
        if (kolom.length < 2 || kolom.slice(1).some((s) => s.trim() === "")) {
          kini.tanpaKeterangan.push(backtick[1]!);
        }
        continue;
      }
      // Baris tabel tanpa token ber-backtick di kolom pertama: header (`| Modul | ... |`) kalau
      // baris SESUDAHNYA pemisah, dan kalau bukan — sesuatu yang parser ini tidak mengerti.
      const berikut = (baris[i + 1] ?? "").trim();
      if (/^\|(\s*:?-+:?\s*\|)+$/.test(berikut)) continue;
    }
    kini.takDikenali.push({ baris: i + 1, teks: t });
  }
  if (nama !== null) takTertutup.push(nama);
  return { blok, takTertutup };
}

export const BERKAS_INSTALL = "INSTALL.md";

export async function bacaInventarisInstall(akar: string): Promise<InventarisInstall | null> {
  try {
    return uraiInventaris(await readFile(path.join(akar, BERKAS_INSTALL), "utf8"));
  } catch {
    return null;
  }
}

/**
 * Temuan terstruktur — kalimatnya dirender tahap verify dari katalog pesan, bukan di sini.
 *
 * `kunci` adalah kunci katalog; `vars` variabelnya. Bentuk ini yang membuat berkas ini bisa diuji
 * tanpa memuat katalog sama sekali, sekaligus membuat kalimatnya tetap dwibahasa.
 */
export type TemuanPemindai = { kunci: string; vars: Record<string, string> };

const NAMA_BLOK_PRASYARAT = "prasyarat-modul";
const NAMA_BLOK_PLACEHOLDER = "placeholder";
const namaBlokPlatform = (pkg: string): string => `platform:${pkg}`;

/** Semua nama blok yang WAJIB ada di `INSTALL.md`. */
export const BLOK_WAJIB = [
  NAMA_BLOK_PRASYARAT,
  ...PAKET_PLATFORM.map(namaBlokPlatform),
  NAMA_BLOK_PLACEHOLDER,
];

const situsRingkas = (situs: Kemunculan[]): string =>
  situs
    .slice(0, 3)
    .map((s) => `${s.berkas}:${s.baris}`)
    .join(", ") + (situs.length > 3 ? ` (+${situs.length - 3})` : "");

function beda(
  ditemukan: Map<string, Kemunculan[]>,
  didaftarkan: Set<string>,
  kunciTakTerdaftar: string,
  kunciBasi: string,
  namaBlok: string,
): TemuanPemindai[] {
  const temuan: TemuanPemindai[] = [];
  for (const [entri, situs] of [...ditemukan].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (!didaftarkan.has(entri)) {
      temuan.push({ kunci: kunciTakTerdaftar, vars: { entri, situs: situsRingkas(situs), blok: namaBlok } });
    }
  }
  for (const entri of [...didaftarkan].sort()) {
    if (!ditemukan.has(entri)) temuan.push({ kunci: kunciBasi, vars: { entri, blok: namaBlok } });
  }
  return temuan;
}

/** Placeholder `{{NAMA}}` yang benar-benar dipakai template yang paket ini kirim. */
export async function placeholderTerpakai(akar: string): Promise<Set<string>> {
  const hasil = new Set<string>();
  const berkas = [
    path.join("ci", "contract-gate.yml.template"),
    path.join("ci", "backend-gate.yml.template"),
    path.join("ci", "frontend-gate.yml.template"),
    path.join("tooling", "Makefile.template"),
  ];
  for (const b of berkas) {
    let isi: string;
    try {
      isi = await readFile(path.join(akar, b), "utf8");
    } catch {
      continue;
    }
    for (const m of isi.matchAll(/\{\{([A-Z_]+)\}\}/g)) hasil.add(m[1]!);
  }
  return hasil;
}

/**
 * Mengadu ketiga inventaris `INSTALL.md` dengan kenyataan yang dipindai dari sumber alat.
 *
 * Memulangkan temuan terstruktur; pemanggil yang merender kalimatnya.
 */
export async function periksaInventarisInstall(akar: string): Promise<TemuanPemindai[]> {
  const inv = await bacaInventarisInstall(akar);
  if (inv === null) return [{ kunci: "verify.install_hilang", vars: { berkas: BERKAS_INSTALL } }];

  const temuan: TemuanPemindai[] = [];
  for (const nama of inv.takTertutup) {
    temuan.push({ kunci: "verify.install_blok_terbuka", vars: { blok: nama } });
  }
  for (const nama of BLOK_WAJIB) {
    if (!inv.blok.has(nama)) temuan.push({ kunci: "verify.install_blok_hilang", vars: { blok: nama } });
  }
  for (const [nama, isi] of inv.blok) {
    for (const b of isi.takDikenali) {
      temuan.push({
        kunci: "verify.install_tak_dikenali",
        vars: { blok: nama, baris: String(b.baris), teks: b.teks },
      });
    }
    for (const entri of isi.tanpaKeterangan) {
      temuan.push({ kunci: "verify.install_tanpa_keterangan", vars: { blok: nama, entri } });
    }
  }

  const entri = (nama: string): Set<string> => new Set(inv.blok.get(nama)?.entri ?? []);

  temuan.push(
    ...beda(
      await pindaiPrasyaratModul(akar),
      entri(NAMA_BLOK_PRASYARAT),
      "verify.prasyarat_tak_terdaftar",
      "verify.prasyarat_basi",
      NAMA_BLOK_PRASYARAT,
    ),
  );

  const simbol = await pindaiSimbolPlatform(akar);
  for (const pkg of PAKET_PLATFORM) {
    const nama = namaBlokPlatform(pkg);
    const milikPkg = new Map(
      [...simbol].filter(([k]) => k.startsWith(`${pkg}.`)).map(([k, v]) => [k.slice(pkg.length + 1), v]),
    );
    temuan.push(
      ...beda(milikPkg, entri(nama), "verify.simbol_tak_terdaftar", "verify.simbol_basi", nama),
    );
  }

  const placeholder = new Map(
    [...(await placeholderTerpakai(akar))].map((p) => [p, [] as Kemunculan[]]),
  );
  temuan.push(
    ...beda(
      placeholder,
      entri(NAMA_BLOK_PLACEHOLDER),
      "verify.placeholder_tak_terdaftar",
      "verify.placeholder_basi",
      NAMA_BLOK_PLACEHOLDER,
    ),
  );

  return temuan;
}
