/**
 * Uji pembungkus `gen`/`freeze` atas paket TERPASANG, bukan atas checkout repo ini.
 *
 * # Kenapa perbedaan itu yang jadi isi berkas ini
 *
 * Pembungkus wajib meneruskan `-config <akar proyek target>` secara eksplisit, karena alat Go
 * berjalan dengan cwd di `tooling/` PAKET dan bawaan `-config` adalah cwd — jadi tanpa bendera itu
 * alat memungut config PAKET, bukan config proyek. Itu bisa diuji dari checkout. Yang TIDAK bisa
 * diuji dari checkout adalah lapisan di bawahnya: kalau `tooling/messages/**`, `tooling/**`, atau
 * `bin/standard` ternyata tidak ikut terkirim saat paket DIPASANG, uji atas checkout tetap HIJAU
 * sementara pemakainya gagal di perintah pertama. "Hijau dan buta terlihat sama" — di lapisan
 * distribusi.
 *
 * # Apa yang dianggap "terpasang" di sini
 *
 * `INSTALL.md` memasang paket ini dengan MENYALIN foldernya ke proyek target. Salinan itu dibangun
 * di sini dari `git ls-files --cached --others --exclude-standard` — berkas terlacak PLUS berkas
 * baru yang belum di-commit, MINUS yang diabaikan `.gitignore`. Dua sifatnya yang menentukan:
 * berkas yang belum di-commit IKUT (jadi uji ini menguji pohon kerja, bukan HEAD yang basi), dan
 * berkas yang diabaikan TIDAK ikut (jadi menaruh sesuatu yang dibutuhkan runtime di jalur
 * ter-gitignore akan MERAH di sini, bukan di mesin pemakai).
 *
 * `node_modules` di-symlink, bukan disalin, dan itu bukan kelonggaran: dependensi dipasang DI
 * TUJUAN (`pnpm install` di dalam salinan paket, syarat yang `bin/standard` sudah punya sejak
 * ditulis), jadi ia bukan ISI paket. Yang diuji di sini adalah isinya.
 *
 * # Kenapa `go` palsu
 *
 * Yang harus dibuktikan adalah ARGUMEN yang pembungkus rakit dan CWD yang ia pakai, bukan bahwa
 * genmodule bekerja (itu punya uji Go sendiri). `go` palsu di PATH merekam keduanya, jalannya
 * seperseratus detik, dan tidak menuntut proyek target punya pohon Go yang lengkap.
 */
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { execFile } from "node:child_process";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { LANGKAH } from "../gate/command.js";
import { akarPaket } from "../paket.js";

const jalankan = promisify(execFile);

const asal = akarPaket();
let paket = "";
let proyek = "";
let dirGoPalsu = "";
let rekaman = "";

/**
 * Direktori sementara yang berkas ini buat, supaya `afterAll` bisa menghapusnya SEMUA.
 *
 * Diukur, bukan kehati-hatian abstrak: versi sebelumnya tidak membersihkan apa pun dan
 * meninggalkan 18 direktori / 16 MB di mesin pengulas — di disk yang 94% penuh. Uji yang tumbuh
 * di disk orang lain akan dimatikan orang itu.
 */
const dirSementara: string[] = [];

function tmpBaru(awalan: string): string {
  const dir = mkdtempSync(path.join(tmpdir(), awalan));
  dirSementara.push(dir);
  return dir;
}

/**
 * Berkas yang terkirim saat paket ini disalin ke proyek target: **SELURUHNYA**, tanpa saringan.
 *
 * Dulu ada daftar pengecualian di sini, dan alasannya satu: kedua dokumen proses adalah
 * satu-satunya berkas yang memuat nama proyek asal. Alasan itu habis begitu keduanya dihapus, dan
 * daftar yang alasannya habis lalu tetap diadu tiga tempat adalah pemeriksaan yang tidak bisa merah
 * lagi. Jadi mesinnya dicabut seluruhnya, bukan dikosongkan: konstanta, blok inventaris
 * `INSTALL.md`, dan pemeriksaan paritasnya sekaligus.
 *
 * Sekarang tidak ada yang perlu disaring: setiap berkas yang tersisa di folder ini memang untuk
 * dibawa.
 */
function daftarBerkasTerkirim(): string[] {
  const keluaran = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard"], {
    cwd: asal,
    encoding: "utf8",
  });
  return keluaran.split("\n").filter((s) => s !== "");
}

function pasangPaket(berkas: string[]): string {
  const tujuan = tmpBaru("eb-paket-");
  for (const b of berkas) {
    const sumber = path.join(asal, b);
    const salin = path.join(tujuan, b);
    mkdirSync(path.dirname(salin), { recursive: true });
    copyFileSync(sumber, salin); // copyFileSync mempertahankan mode, termasuk bit eksekusi bin/standard
  }
  symlinkSync(path.join(asal, "node_modules"), path.join(tujuan, "node_modules"));
  return tujuan;
}

function buatProyek(): string {
  const dir = tmpBaru("eb-proyek-");
  copyFileSync(path.join(asal, "tooling/config.example.json"), path.join(dir, "standard.config.json"));
  return dir;
}

/**
 * `go` palsu: merekam argumen dan direktori kerjanya.
 *
 * Ia harus meniru `go build -o <jalur> <paket>` juga, bukan cuma mencatatnya: pembungkus
 * MEMBANGUN alat Go lalu menjalankan binernya (lihat `jalankanAlat` — `go run` meratakan kode
 * keluar). Jadi `go` palsu menulis biner palsu di `<jalur>` yang ikut merekam argumennya dan
 * keluar dengan `$KODE_ALAT` — itulah yang membuat pass-through kode keluar bisa diuji tanpa
 * kompilasi Go sungguhan.
 */
function buatGoPalsu(): { dir: string; rekaman: string } {
  const dir = tmpBaru("eb-go-");
  const rekaman = path.join(dir, "rekaman.txt");
  const skrip = path.join(dir, "go");
  writeFileSync(
    skrip,
    [
      "#!/bin/sh",
      `printf 'cwd=%s\\n' "$(pwd -P)" >> ${rekaman}`,
      `printf 'argv=%s\\n' "$*" >> ${rekaman}`,
      'if [ "$1" = "build" ] && [ "$2" = "-o" ]; then',
      '  cat > "$3" <<BINER',
      "#!/bin/sh",
      `printf 'cwd=%s\\n' "\\$(pwd -P)" >> ${rekaman}`,
      `printf 'argv=%s\\n' "\\$*" >> ${rekaman}`,
      "exit ${KODE_ALAT:-0}",
      "BINER",
      '  chmod +x "$3"',
      "fi",
      "exit ${KODE_BUILD:-0}",
      "",
    ].join("\n"),
    { mode: 0o755 },
  );
  return { dir, rekaman };
}

async function standard(
  argv: string[],
  opsi: { cwd?: string; env?: Record<string, string>; paketLain?: string } = {},
): Promise<{ kode: number; keluaran: string }> {
  try {
    const { stdout, stderr } = await jalankan(path.join(opsi.paketLain ?? paket, "bin/standard"), argv, {
      cwd: opsi.cwd ?? proyek,
      env: {
        ...process.env,
        ...opsi.env,
        PATH: `${dirGoPalsu}${path.delimiter}${process.env["PATH"] ?? ""}`,
      },
    });
    return { kode: 0, keluaran: stdout + stderr };
  } catch (e) {
    const err = e as { code?: number; stdout?: string; stderr?: string };
    return { kode: err.code ?? -1, keluaran: (err.stdout ?? "") + (err.stderr ?? "") };
  }
}

function bacaRekaman(): string {
  return readFileSync(rekaman, "utf8");
}

beforeAll(() => {
  paket = pasangPaket(daftarBerkasTerkirim());
  proyek = buatProyek();
  const palsu = buatGoPalsu();
  dirGoPalsu = palsu.dir;
  rekaman = palsu.rekaman;
});

afterAll(() => {
  for (const d of dirSementara) rmSync(d, { recursive: true, force: true });
});

describe("isi paket yang terkirim", () => {
  // Kegagalan yang uji ini ada untuk menangkapnya, dinamai eksplisit: katalog pesan yang tidak
  // ikut terkirim. Tanpanya setiap jalur galat DAN setiap baris laporan melempar "kunci pesan
  // tidak dikenal" di mesin pemakai, sementara di sini semuanya hijau.
  it("katalog pesan kedua bahasa ikut terkirim", () => {
    for (const bahasa of ["id", "en"]) {
      const jalur = path.join(paket, "tooling/messages", `${bahasa}.json`);
      expect(() => readFileSync(jalur, "utf8"), jalur).not.toThrow();
    }
  });

  it("skema config, shim, dan kedua alat Go ikut terkirim", () => {
    for (const b of [
      "tooling/config.schema.json",
      "bin/standard",
      "tooling/go.mod",
      "tooling/genmodule/main.go",
      "tooling/gendto/main.go",
    ]) {
      expect(() => readFileSync(path.join(paket, b), "utf8"), b).not.toThrow();
    }
  });

  // Daftar langkah `gate` menunjuk berkas skrip per nama. Skrip yang tidak ikut terkirim membuat
  // `standard gate` keluar 2 di mesin pemakai; uji atas checkout tidak bisa melihatnya, karena di
  // checkout berkasnya selalu ada.
  it("tiap skrip gate ikut terkirim", () => {
    for (const l of LANGKAH) {
      const jalur = path.join(paket, "tooling/contract-scripts", l.skrip);
      expect(() => readFileSync(jalur, "utf8"), l.nama).not.toThrow();
    }
  });

  it("template Makefile dan ketiga template CI ikut terkirim", () => {
    for (const b of [
      "tooling/Makefile.template",
      "ci/contract-gate.yml.template",
      "ci/backend-gate.yml.template",
      "ci/frontend-gate.yml.template",
    ]) {
      expect(() => readFileSync(path.join(paket, b), "utf8"), b).not.toThrow();
    }
  });

  /**
   * Kedua dokumen yang menghadap pemakai wajib MENDARAT.
   *
   * `INSTALL.md`: paket terpasang tanpanya adalah paket yang orang pertamanya harus tebak — enam
   * placeholder, empat paket platform yang harus ia tulis sendiri, dan tiga modul yang terpaku, tak
   * satu pun bisa disimpulkan dari kodenya. `README.md`: peta paketnya.
   *
   * Kasus ini juga KONTROL POSITIF untuk kasus berikutnya, yang berbentuk ketiadaan. Ketiadaan yang
   * di-assert tanpa pasangan kehadiran membuktikan nol: ia sama hijaunya kalau `pasangPaket`
   * ternyata tidak menyalin apa pun.
   */
  it("dokumen yang menghadap pemakai ikut terkirim", () => {
    for (const b of ["INSTALL.md", "README.md"]) {
      expect(() => readFileSync(path.join(paket, b), "utf8"), b).not.toThrow();
    }
  });

  /**
   * Invariannya kini: **tidak ada dokumen proses yang tersisa.**
   *
   * Berkas ini pernah menegaskan tiga hal berturut-turut, dan ketiganya benar pada zamannya: dulu
   * keduanya tidak ikut terkirim (karena keduanya satu-satunya berkas yang memuat nama proyek
   * asal); lalu satu dihapus dan yang lain ikut terkirim (alasan pertama habis); sekarang keduanya
   * TIDAK ADA. Dokumen tentang bagaimana paket ini DIBENTUK bukan bagian dari paketnya — yang
   * dikirim hanyalah yang dibutuhkan untuk MEMAKAI dan MEMELIHARANYA.
   *
   * Yang dijaga bukan nama berkasnya melainkan bentuk kegagalannya: dokumen proses yang dihidupkan
   * lagi diam-diam, di asal maupun di paket terpasang. Diperiksa di KEDUA tempat karena keduanya
   * bisa menyimpang sendiri-sendiri — berkas yang lahir kembali di asal akan ikut tersalin, dan
   * berkas yang hanya muncul di salinan berarti `pasangPaket` mengarang isi.
   *
   * Ketiadaan yang di-assert butuh pasangan kehadiran, dan pasangannya kasus tepat di atas ini.
   */
  it("tak ada dokumen proses tersisa, di asal maupun di paket terpasang", () => {
    for (const b of ["SPEC.md", "PLAN.md"]) {
      expect(existsSync(path.join(asal, b)), `${b} sudah dihapus dari paket`).toBe(false);
      expect(existsSync(path.join(paket, b)), `${b} tidak boleh ikut terkirim`).toBe(false);
    }
  });

  /**
   * Model "yang terkirim" di berkas ini (`git ls-files`) sama dengan kenyataan hanya karena
   * `package.json` TIDAK punya field `files` dan tidak ada `.npmignore`. Hari salah satunya
   * ditambahkan, paket sungguhan menciut sementara uji ini tetap hijau — persis mode gagal yang
   * seluruh berkas ini ada untuk mencegahnya, satu tingkat di atasnya. Jadi ketiadaan keduanya
   * ikut di-assert, bukan diandaikan.
   */
  it("tidak ada mekanisme lain yang menyaring isi paket (files / .npmignore)", () => {
    const pkg = JSON.parse(readFileSync(path.join(asal, "package.json"), "utf8")) as Record<string, unknown>;
    expect(
      "files" in pkg,
      "package.json punya field `files`: daftar terkirim di uji ini tidak lagi mewakili paket sungguhan",
    ).toBe(false);
    expect(
      existsSync(path.join(asal, ".npmignore")),
      ".npmignore ada: daftar terkirim di uji ini tidak lagi mewakili paket sungguhan",
    ).toBe(false);
  });
});

/**
 * `config.schema.json` yang HILANG tidak boleh tertukar dengan "config tidak ada di direktori ini".
 *
 * # Kenapa kasus ini pindah ke sini dari `src/config/load.test.ts`
 *
 * Versi sebelumnya me-RENAME berkas skema NYATA paket lalu memulihkannya lewat `finally`, dan
 * alasan yang membenarkannya ("pulih dalam hitungan detik, `git status` langsung menunjukkannya")
 * mengandaikan working tree git yang justru TIDAK ADA di tempat yang penting: paket ini
 * didistribusikan dengan DISALIN, dan orang menjalankan `pnpm test` di dalam salinannya. Di sana
 * tidak ada git, tidak ada `git status`, dan tidak ada cara memulihkan berkas yang hilang. Ctrl-C
 * di jendela sempit itu meninggalkan paket TERKIRIM dalam keadaan rusak, dan kegagalan
 * lanjutannya menunjuk ke ketiadaan berkas — bukan ke sebabnya.
 *
 * Berkas ini sudah membangun salinan paket di tmpdir untuk alasannya sendiri, jadi di sini
 * skemanya boleh benar-benar DIHAPUS: yang rusak adalah salinan sementara, dan tidak ada yang
 * perlu dipulihkan.
 *
 * # Yang dijaga tetap sama
 *
 * Regresi aslinya: `try/catch` di `loadConfig` sempat membungkus `validasi()` juga, jadi ENOENT
 * dari `config.schema.json` — berkas TERPISAH dari `standard.config.json` — tertelan seolah-olah
 * config di direktori itu tidak ada, penelusuran diam-diam naik ke induk, dan pesan akhirnya
 * berbunyi "standard.config.json tidak ditemukan" PADAHAL config-nya nyata-nyata ada.
 */
describe("paket terpasang yang skemanya hilang", () => {
  it("menyebut config.schema.json, BUKAN 'tidak ditemukan'", async () => {
    const rusak = pasangPaket(daftarBerkasTerkirim());
    const jalurSkema = path.join(rusak, "tooling/config.schema.json");
    // Dibuktikan ADA sebelum dihapus: tanpa baris ini, hijau di bawah juga yang kau dapat dari
    // salinan yang memang tidak pernah punya berkasnya.
    expect(existsSync(jalurSkema)).toBe(true);
    rmSync(jalurSkema);
    expect(existsSync(jalurSkema)).toBe(false);
    expect(existsSync(path.join(asal, "tooling/config.schema.json")), "berkas ASAL wajib utuh").toBe(
      true,
    );

    const { kode, keluaran } = await standard(["doctor"], { paketLain: rusak });
    expect(kode, keluaran).not.toBe(0);
    expect(keluaran).toContain("config.schema.json");
    expect(keluaran).not.toMatch(/tidak ditemukan/);
  });
});

describe("standard gen (paket terpasang)", () => {
  it("meneruskan -config <akar proyek> dan berjalan di tooling PAKET", async () => {
    const { kode, keluaran } = await standard(["gen", "module", "--tag", "buku-tamu", "--pkg", "bukutamu"]);
    expect(kode, keluaran).toBe(0);

    const jejak = bacaRekaman();
    // Akar proyek: yang ada di `-config`. Bukan cwd alat — cwd alat adalah modul Go PAKET.
    expect(jejak).toContain(`-config ${realpathSync(proyek)}`);
    expect(jejak).toContain(`cwd=${realpathSync(path.join(paket, "tooling"))}`);
    expect(jejak).toContain("-tag buku-tamu");
    expect(jejak).toContain("-pkg bukutamu");
    // Baris laporan ini dirender dari katalog: kalau `tooling/messages/**` tidak ikut terkirim,
    // perintahnya gagal di sini, bukan hijau.
    expect(keluaran).toContain(realpathSync(proyek));
  });

  it("dry-run adalah default: tanpa --apply tidak ada -apply yang sampai ke alat", async () => {
    await standard(["gen", "module", "--tag", "t", "--pkg", "p"]);
    expect(bacaRekaman()).not.toContain("-apply");
  });

  it("--apply sampai ke alat", async () => {
    await standard(["gen", "module", "--tag", "t", "--pkg", "p", "--apply"]);
    expect(bacaRekaman()).toContain("-apply");
  });

  it("gen dto juga membawa -config", async () => {
    const { kode, keluaran } = await standard(["gen", "dto"]);
    expect(kode, keluaran).toBe(0);
    expect(bacaRekaman()).toContain(`-config ${realpathSync(proyek)}`);
  });

  it("freeze membawa -config dan -freeze", async () => {
    const { kode, keluaran } = await standard(["freeze", "--pkg", "bukutamu"]);
    expect(kode, keluaran).toBe(0);
    const jejak = bacaRekaman();
    expect(jejak).toContain(`-config ${realpathSync(proyek)}`);
    expect(jejak).toContain("-freeze");
  });

  it("bendera salah ketik keluar 2 dan menyebut bendera yang dikenal, tanpa memanggil alat", async () => {
    const sebelum = bacaRekaman();
    const { kode, keluaran } = await standard(["gen", "module", "--tag", "t", "--pkg", "p", "--aply"]);
    expect(kode).toBe(2);
    expect(keluaran).toContain("--aply");
    expect(keluaran).toContain("--apply");
    expect(bacaRekaman()).toBe(sebelum);
  });

  it("jenis tak dikenal keluar 2 dan menyebut jenis yang ada", async () => {
    const { kode, keluaran } = await standard(["gen", "modul"]);
    expect(kode).toBe(2);
    expect(keluaran).toContain("modul");
    expect(keluaran).toContain("module");
  });

  /**
   * Kode keluar alat Go LOLOS UTUH.
   *
   * `go` palsu di sini membangun biner palsu yang keluar dengan `$KODE_ALAT`, jadi yang diuji
   * adalah rantai penyalurannya — bukan perilaku genmodule. Kalau pembungkusnya kembali ke
   * `go run`, kode 2 di bawah tiba sebagai 1 dan uji ini merah. Pasangan sungguhannya (genmodule
   * asli, kompilasi Go asli) ada di `kode-keluar.test.ts`.
   */
  it("kode keluar alat Go diteruskan apa adanya: 2 tetap 2, bukan diratakan jadi 1", async () => {
    const { kode } = await standard(["gen", "module", "--tag", "t", "--pkg", "p"], {
      env: { KODE_ALAT: "2" },
    });
    expect(kode).toBe(2);
  });

  it("kode keluar 1 dari alat Go juga lolos apa adanya", async () => {
    const { kode } = await standard(["gen", "module", "--tag", "t", "--pkg", "p"], {
      env: { KODE_ALAT: "1" },
    });
    expect(kode).toBe(1);
  });

  // Alat yang tidak bisa DIBANGUN adalah kegagalan ALAT, bukan pelanggaran: 2, bukan kode
  // compiler-nya dan bukan 1.
  it("kegagalan build dipetakan ke 2", async () => {
    const { kode } = await standard(["gen", "module", "--tag", "t", "--pkg", "p"], {
      env: { KODE_BUILD: "1" },
    });
    expect(kode).toBe(2);
  });
});

/**
 * Bantuan dijawab SEBELUM config dimuat — diuji dari direktori yang memang TIDAK punya config,
 * karena orang pertama yang menjalankannya adalah orang yang baru menyalin paket ini dan belum
 * mengisi apa pun. Dwibahasa, karena alat yang belum dikonfigurasi tidak tahu bahasa siapa yang
 * benar.
 */
describe("bantuan subperintah tanpa config", () => {
  it("gen --help keluar 0, mencantumkan jenis, dan dwibahasa", async () => {
    const kosong = tmpBaru("eb-tanpa-config-");
    const { kode, keluaran } = await standard(["gen", "--help"], { cwd: kosong });
    expect(kode, keluaran).toBe(0);
    for (const jenis of ["common", "module", "dto", "wiring"]) expect(keluaran).toContain(jenis);
    expect(keluaran).toContain("jenis:"); // id
    expect(keluaran).toContain("kind:"); // en
    // Dry-run adalah default, dan bantuannya mengatakannya — bukan cuma kodenya.
    expect(keluaran).toContain("--apply");
  });

  it("gate --help mencantumkan tiap langkah beserta nama gate yang ia mainkan", async () => {
    const kosong = tmpBaru("eb-tanpa-config-");
    const { kode, keluaran } = await standard(["gate", "--help"], { cwd: kosong });
    expect(kode, keluaran).toBe(0);
    for (const l of LANGKAH) {
      expect(keluaran, l.nama).toContain(l.nama);
      for (const g of l.gate) expect(keluaran, g).toContain(g);
    }
  });

  it("freeze --help menyebut kewajiban daftar periksa penyewa sebelum membekukan", async () => {
    const kosong = tmpBaru("eb-tanpa-config-");
    const { kode, keluaran } = await standard(["freeze", "--help"], { cwd: kosong });
    expect(kode, keluaran).toBe(0);
    expect(keluaran).toContain("gate:tenancy-checklist");
  });
});
