import { readdir, readFile, stat } from "node:fs/promises";
import path from "node:path";
import { parse } from "yaml";
import { NAMESPACE_BELUM_DIISI, type StandardConfig } from "../config/schema.js";
import { msg, muatPesan, type Pesan } from "../messages/index.js";

export type HasilDoctor = { temuan: string[]; jumlahPemeriksaan: number };

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
      const dirLayout = config.layout[kunci].replace(/\/+$/, "");
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
  await adaPath("layout.backendDir", config.layout.backendDir, "dir");
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

  // Pemeriksaan keberadaan+jenis go.mod dipakai ulang dari `adaPath` (bukan duplikat logikanya)
  // supaya ENOENT vs EACCES vs "itu direktori bukan berkas" dilabeli konsisten dengan
  // pemeriksaan path lain. Kalau itu lolos, baru dibaca isinya untuk dicocokkan modulePath-nya.
  const jalurGoMod = path.join(config.layout.backendDir, "go.mod");
  if (await adaPath("layout.backendDir/go.mod", jalurGoMod, "file")) {
    jumlahPemeriksaan += 1;
    try {
      const goMod = await readFile(path.join(akar, jalurGoMod), "utf8");
      const baris = /^module\s+(\S+)/m.exec(goMod);
      if (baris === null || baris[1] !== config.go.modulePath) {
        temuan.push(
          msg(pesan, "doctor.module_beda", {
            config: config.go.modulePath,
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
  }

  jumlahPemeriksaan += 1;
  if (config.idempotency.uuidNamespace === NAMESPACE_BELUM_DIISI) {
    temuan.push(msg(pesan, "doctor.namespace_contoh"));
  }

  jumlahPemeriksaan += await periksaWorkflow(config, akar, pesan, temuan);

  return { temuan, jumlahPemeriksaan };
}
