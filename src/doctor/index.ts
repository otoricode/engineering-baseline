import { constants } from "node:fs";
import { access, readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { NAMESPACE_BELUM_DIISI, type StandardConfig } from "../config/schema.js";
import { msg, muatPesan, type Pesan } from "../messages/index.js";

export type HasilDoctor = { temuan: string[]; jumlahPemeriksaan: number };

/**
 * Alat toolchain Go yang lapis Go tuntut ada.
 *
 * Diperiksa TERPISAH, bukan `gofmt` diandaikan ikut `go`: diukur di mesin steril, `gofmt` gagal
 * SENDIRIAN (`spawnSync gofmt ENOENT`) di jalur skrip kontrak sementara `go` ada. Toolchain Go yang
 * terpasang sebagian bukan hipotesis, dan andaian "kalau `go` ada, `gofmt` pasti ada" akan membuat
 * separuh kegagalannya lolos.
 */
const ALAT_GO = ["go", "gofmt"] as const;

/**
 * Apakah sebuah alat bisa DIRESOLUSI di PATH — bukan apakah ia berjalan benar.
 *
 * Resolusi PATH, bukan `spawnSync`: yang `doctor` tanyakan adalah "apakah pemasangannya lengkap",
 * dan menjalankan alat asing untuk menjawabnya menukar satu pertanyaan dengan pertanyaan lain —
 * alat yang ADA tapi menggantung akan membuat `doctor` ikut menggantung, dan `doctor` adalah
 * perintah pertama yang orang jalankan.
 *
 * Bit eksekusi ikut dituntut (`X_OK`), bukan cuma keberadaan berkas: berkas bernama `go` yang tidak
 * bisa dieksekusi memenuhi "ada" tapi tidak memenuhi "bisa dijalankan", dan yang kedua itu yang
 * menentukan apakah `gen module` akan bekerja.
 *
 * `daftarPath` diteruskan sebagai ARGUMEN alih-alih dibaca dari `process.env` di sini: uji
 * memalsukan PATH lewat subproses (pola `buatGoPalsu`), dan fungsi yang membaca lingkungan global
 * sendiri hanya bisa diuji dengan mengubah lingkungan proses ujinya — yang bocor ke berkas uji lain
 * di worker yang sama.
 */
async function bisaDiresolusi(nama: string, daftarPath: string): Promise<boolean> {
  for (const dir of daftarPath.split(path.delimiter)) {
    if (dir === "") continue;
    try {
      await access(path.join(dir, nama), constants.X_OK);
      return true;
    } catch {
      continue;
    }
  }
  return false;
}

export const DIR_WORKFLOW = path.join(".github", "workflows");

/**
 * Workflow yang paket ini kirim, dan kunci `layout.*` yang blok `paths:`-nya WAJIB liputi.
 *
 * Dikunci pada `name:` di dalam berkasnya, bukan pada nama berkasnya: pemasang menyalin
 * `contract-gate.yml.template` jadi nama apa pun, tapi `name:` ikut tersalin apa adanya.
 */
const WORKFLOW_PAKET: Record<string, (keyof StandardConfig["layout"])[]> = {
  "contract-gate": ["contractDir"],
  "backend-gate": ["backendDir", "contractDir"],
  "frontend-gate": ["frontendDir", "contractDir"],
};

/** Bagian HARFIAH sebuah pola `paths:` — potongan sebelum wildcard pertama. */
function prefiksHarfiah(pola: string): string {
  const bersih = pola.replace(/^!/, "");
  const potong = bersih.search(/[*?[\]]/);
  return (potong === -1 ? bersih : bersih.slice(0, potong)).replace(/\/+$/, "");
}

/**
 * `paths:` workflow terpasang vs `layout.*`.
 *
 * # Kenapa ini pemeriksaan `doctor`, bukan pemeriksaan template
 *
 * Template CI sudah memindai placeholder yang TERTINGGAL, dan pemindaian itu berjalan di CI. Yang
 * tidak bisa dilihatnya adalah placeholder yang TERISI SALAH: `{{BACKEND_DIR}}` diisi `app/api`
 * padahal direktorinya `apps/api`. Mode gagalnya identik dengan yang tertinggal — workflow tidak
 * pernah terpicu, dan workflow yang tidak pernah terpicu tidak bisa dibedakan dari yang selalu
 * hijau — tapi pemindai placeholder lolos, karena memang tidak ada placeholder tersisa. Salah ketik
 * satu direktori jauh lebih mungkin daripada lupa mengisi enam placeholder sekaligus.
 *
 * Tiga hal diperiksa, dan ketiganya atas berkas yang benar-benar TERPASANG di proyek:
 *
 *   a. placeholder `{{...}}` yang masih tersisa di dalam `paths:`;
 *   b. tiap pola `paths:` menunjuk jalur yang benar-benar ada (bagian harfiahnya, sebelum
 *      wildcard) — ini yang menangkap salah ketik;
 *   c. untuk workflow yang paket ini kirim: kunci `layout.*` yang lapisnya butuh benar-benar
 *      DILIPUT. Sebuah `paths:` yang sah semua jalurnya tapi kehilangan `backendDir` adalah
 *      backend-gate yang tidak pernah berjalan untuk perubahan backend.
 *
 * Direktori `.github/workflows/` yang TIDAK ADA bukan temuan: langkah 1 `INSTALL.md` (isi config,
 * `doctor` sampai hijau) mendahului langkah 3 (pasang CI), jadi proyek yang belum sampai ke sana
 * memang belum punya apa-apa untuk diperiksa. Yang tidak dilakukan adalah menyembunyikannya:
 * jumlah berkas workflow yang diperiksa ikut masuk `jumlahPemeriksaan`, jadi "nol pemeriksaan
 * workflow" terbaca dari angka yang `doctor` cetak.
 */
async function periksaWorkflow(
  config: StandardConfig,
  akar: string,
  pesan: Pesan,
  temuan: string[],
): Promise<number> {
  const dir = path.join(akar, DIR_WORKFLOW);
  let entri: string[];
  try {
    entri = await readdir(dir);
  } catch {
    return 0;
  }

  let jumlah = 0;
  for (const nama of entri.filter((n) => /\.ya?ml$/.test(n)).sort()) {
    const relatif = path.join(DIR_WORKFLOW, nama);
    jumlah += 1;
    let isi: string;
    try {
      isi = await readFile(path.join(dir, nama), "utf8");
    } catch (e) {
      temuan.push(
        msg(pesan, "doctor.path_tak_terbaca", {
          kunci: "workflow",
          jalur: relatif,
          sebab: (e as NodeJS.ErrnoException).code ?? String(e),
        }),
      );
      continue;
    }

    let doc: { name?: unknown; on?: { pull_request?: { paths?: unknown } } };
    try {
      doc = parse(isi) as typeof doc;
    } catch (e) {
      temuan.push(msg(pesan, "doctor.workflow_tak_terurai", { jalur: relatif, sebab: (e as Error).message }));
      continue;
    }

    const namaWorkflow = typeof doc?.name === "string" ? doc.name : "";
    const wajib = WORKFLOW_PAKET[namaWorkflow];
    const pola = doc?.on?.pull_request?.paths;
    // Workflow yang BUKAN milik paket ini dan tidak punya `paths:` tidak diperiksa — `paths:` yang
    // absen berarti workflow itu berjalan untuk setiap PR, yang tidak bisa salah alamat.
    if (!Array.isArray(pola)) {
      if (wajib !== undefined) {
        temuan.push(msg(pesan, "doctor.workflow_tanpa_paths", { jalur: relatif, nama: namaWorkflow }));
      }
      continue;
    }

    const daftar = pola.filter((p): p is string => typeof p === "string");
    for (const p of daftar) {
      if (/\{\{[A-Z_]+\}\}/.test(p)) {
        temuan.push(msg(pesan, "doctor.workflow_placeholder", { jalur: relatif, pola: p }));
        continue;
      }
      const prefiks = prefiksHarfiah(p);
      if (prefiks === "") continue;
      try {
        await stat(path.join(akar, prefiks));
      } catch {
        temuan.push(msg(pesan, "doctor.workflow_paths_hilang", { jalur: relatif, pola: p, prefiks }));
      }
    }

    if (wajib === undefined) continue;
    const prefiksSah = daftar.filter((p) => !p.startsWith("!")).map(prefiksHarfiah);
    for (const kunci of wajib) {
      // Kunci layout yang tidak dinyatakan tidak bisa dituntut diliput `paths:` — proyek
      // contract-only memang tidak punya `backendDir` untuk diliput siapa pun.
      const nilaiLayout = config.layout[kunci];
      if (nilaiLayout === undefined) continue;
      const dirLayout = nilaiLayout.replace(/\/+$/, "");
      const diliput = prefiksSah.some(
        (p) => p !== "" && (p === dirLayout || dirLayout.startsWith(`${p}/`)),
      );
      if (!diliput) {
        temuan.push(
          msg(pesan, "doctor.workflow_paths_kurang", {
            jalur: relatif,
            nama: namaWorkflow,
            kunci: `layout.${kunci}`,
            dir: dirLayout,
            paths: daftar.join(", "),
          }),
        );
      }
    }
  }
  return jumlah;
}

export async function jalankanDoctor(
  config: StandardConfig,
  akar: string,
): Promise<HasilDoctor> {
  const pesan = await muatPesan(config.language);
  const temuan: string[] = [];
  let jumlahPemeriksaan = 0;

  // "Ada" bukan cuma "stat()/readFile() tidak melempar" — config yang menaruh BERKAS pada
  // kunci yang seharusnya DIREKTORI (atau sebaliknya) harus tertangkap, bukan lolos sebagai
  // sehat. Dan galat selain ENOENT (mis. EACCES) tidak boleh dilabeli "tidak ada" — labelnya
  // akan berbohong walau temuannya sendiri tetap muncul.
  const adaPath = async (
    kunci: string,
    relatif: string,
    jenis: "dir" | "file",
  ): Promise<boolean> => {
    jumlahPemeriksaan += 1;
    let info;
    try {
      info = await stat(path.join(akar, relatif));
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code === "ENOENT") {
        temuan.push(msg(pesan, "doctor.path_hilang", { kunci, jalur: relatif }));
      } else {
        temuan.push(
          msg(pesan, "doctor.path_tak_terbaca", {
            kunci,
            jalur: relatif,
            sebab: (e as NodeJS.ErrnoException).code ?? String(e),
          }),
        );
      }
      return false;
    }
    const cocok = jenis === "dir" ? info.isDirectory() : info.isFile();
    if (!cocok) {
      temuan.push(
        msg(pesan, jenis === "dir" ? "doctor.path_bukan_direktori" : "doctor.path_bukan_berkas", {
          kunci,
          jalur: relatif,
        }),
      );
      return false;
    }
    return true;
  };

  await adaPath("layout.contractDir", config.layout.contractDir, "dir");
  await adaPath("layout.frontendDir", config.layout.frontendDir, "dir");

  for (const [nama, berkas] of Object.entries(config.contract.shared)) {
    await adaPath(
      `contract.shared.${nama}`,
      path.join(config.layout.contractDir, config.contract.sharedDir, berkas),
      "file",
    );
  }
  for (const [nama, berkas] of Object.entries(config.ledgers)) {
    await adaPath(`ledgers.${nama}`, path.join(config.layout.contractDir, berkas), "file");
  }

  /**
   * SELURUH lapis backend — direktorinya, `go.mod`-nya, dan toolchain-nya — dilewati kalau config
   * tidak menyatakannya.
   *
   * Sinyalnya `layout.backendDir` DITULIS di config, bukan direktorinya ada di disk, dan bedanya
   * menentukan: kalau ketiadaan DI DISK yang jadi pemicu, satu salah ketik pada jalurnya berubah
   * jadi tombol mati diam-diam — `doctor` hijau, ketiga pemeriksaan berhenti berjalan, dan tidak
   * ada yang tahu. Dengan sinyal eksplisit, `backendDir` yang ADA tapi salah ketik tetap MERAH
   * lewat `adaPath` persis seperti sebelumnya.
   *
   * `go` ikut dituntut ada: skema JSON menuntutnya lewat `if`/`then`, tapi `jalankanDoctor` juga
   * dipanggil dari uji dengan config yang dirakit tangan. Yang menyempitkan tipenya di sini adalah
   * pemeriksaan runtime yang sungguhan, bukan `!`.
   *
   * Yang dilewati TERBACA, bukan cuma tidak terjadi: `jumlahPemeriksaan` ikut mengecil, dan baris
   * ringkasan `doctor.sehat` mencetak angkanya. Proyek contract-only melaporkan angka yang lebih
   * kecil daripada proyek berlapis backend, dan selisih itulah tandanya.
   */
  const backendDir = config.layout.backendDir;
  const go = config.go;
  if (backendDir !== undefined && go !== undefined) {
    await adaPath("layout.backendDir", backendDir, "dir");

    // Pemeriksaan keberadaan+jenis go.mod dipakai ulang dari `adaPath` (bukan duplikat logikanya)
    // supaya ENOENT vs EACCES vs "itu direktori bukan berkas" dilabeli konsisten dengan
    // pemeriksaan path lain. Kalau itu lolos, baru dibaca isinya untuk dicocokkan modulePath-nya.
    const jalurGoMod = path.join(backendDir, "go.mod");
    if (await adaPath("layout.backendDir/go.mod", jalurGoMod, "file")) {
      jumlahPemeriksaan += 1;
      try {
        const goMod = await readFile(path.join(akar, jalurGoMod), "utf8");
        const baris = /^module\s+(\S+)/m.exec(goMod);
        if (baris === null || baris[1] !== go.modulePath) {
          temuan.push(
            msg(pesan, "doctor.module_beda", {
              config: go.modulePath,
              nyata: baris?.[1] ?? "(tidak ada direktif module)",
            }),
          );
        }
      } catch (e) {
        temuan.push(
          msg(pesan, "doctor.path_tak_terbaca", {
            kunci: "layout.backendDir/go.mod",
            jalur: jalurGoMod,
            sebab: (e as NodeJS.ErrnoException).code ?? String(e),
          }),
        );
      }

      /**
       * Toolchain Go, dan pemicunya `go.mod` YANG BARUSAN DITEMUKAN — di dalam cabang yang sama
       * dengan pemeriksaan lapis backend di atasnya, bukan diturunkan kedua kalinya.
       *
       * Cacat yang melahirkannya, diukur di mesin dengan lingkungan disterilkan (`env -i`, PATH
       * tanpa direktori Go): `standard doctor` keluar 0 dan mencetak "config sehat", `standard
       * gate` keluar 0 juga, dan `standard verify` baru keluar 2 dengan `spawn go ENOENT`.
       * `INSTALL.md` §10 menamai `doctor` sebagai cara membuktikan pemasangan benar — jadi
       * pemakainya dapat hijau, mempercayainya, lalu meledak di `make gen-go` pertama. Yang salah
       * bukan kegagalan `verify` (ia justru benar: keluar 2, menyebut alatnya, menolak berpura-pura
       * memeriksa), melainkan `doctor` yang menyatakan sehat atas pemasangan yang tidak bisa
       * menjalankan separuh perintahnya.
       */
      const daftarPath = process.env["PATH"] ?? "";
      for (const alat of ALAT_GO) {
        jumlahPemeriksaan += 1;
        if (!(await bisaDiresolusi(alat, daftarPath))) {
          temuan.push(msg(pesan, "doctor.toolchain_go_hilang", { alat, jalur: jalurGoMod }));
        }
      }
    }
  }

  jumlahPemeriksaan += 1;
  if (config.idempotency.uuidNamespace === NAMESPACE_BELUM_DIISI) {
    temuan.push(msg(pesan, "doctor.namespace_contoh"));
  }

  jumlahPemeriksaan += await periksaWorkflow(config, akar, pesan, temuan);

  return { temuan, jumlahPemeriksaan };
}
