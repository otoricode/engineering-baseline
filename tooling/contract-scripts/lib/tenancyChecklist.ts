/**
 * Daftar periksa lintas-penyewa yang `genmodule` pancarkan sebagai berkas KELIMA sebuah modul —
 * dan satu-satunya kewajiban di seluruh keluaran generator yang teksnya sendiri menyuruh
 * MENGHAPUS berkasnya.
 *
 * # Kenapa ia butuh gate
 *
 * Berkas itu prosa (`.md`), bukan kode. Ia tidak dikompilasi, tidak dijalankan uji mana pun, dan
 * tidak muncul di satu pun pemeriksaan yang sudah ada — jadi kewajiban yang ia bawa tidak punya
 * penegak sama sekali. Diukur, bukan dibayangkan: sebuah `-freeze -apply` sungguhan dijalankan
 * atas modul contoh, dan berkas daftar periksa itu **bertahan di modul yang sudah beku** tanpa
 * satu pun peringatan — keadaan yang teks berkas itu sendiri larang.
 *
 * Pembekuan adalah titik yang tepat untuk menagihnya, dan itu bukan pilihan sembarang: selama
 * modulnya masih tergenerate, daftar periksa itu memang BELUM waktunya dikonsumsi — lapis kueri
 * belum ditulis, jadi belum ada yang bisa diuji. `-freeze` menandai transisi "kerangka ini sudah
 * dikawinkan dengan tangan"; sejak saat itu lapis kueri ADA, dan daftar periksanya wajib sudah
 * berubah jadi uji sungguhan lalu dihapus.
 *
 * # Kenapa "campuran" ikut ditagih
 *
 * `campuran` (sebagian berkas beku, sebagian belum) bukan keadaan yang sah dan sudah ditagih gate
 * lain. Ia tetap ditagih DI SINI juga karena pembekuannya sudah dimulai: melewatkannya berarti
 * modul yang macet setengah beku memperoleh pengecualian diam dari kewajiban ini — dan
 * pengecualian tanpa penjaga adalah jalur di mana pemeriksaan berhenti berjalan tanpa suara.
 */
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { keadaanGenerasi, type KeadaanGenerasi } from "./mountedModules.js";
import type { T } from "../pesan.js";

/**
 * Nama berkasnya dipaku di DUA bahasa — di sini dan sebagai `namaChecklistTenancy` di
 * `tooling/genmodule/main.go`. Ia bukan kunci config karena ia bukan pilihan proyek: ia nama yang
 * generator ini sendiri tulis. Yang menahan kedua salinan tetap sama adalah uji paritas yang
 * membaca konstanta Go itu langsung (`tenancyChecklist.test.ts`) — tanpanya, mengganti namanya di
 * satu sisi membuat gate ini memeriksa berkas yang tidak pernah ada lagi, dan gate yang mencari
 * berkas yang salah selalu hijau.
 */
export const NAMA_CHECKLIST_TENANCY = "repository_tenancy_test.contoh.md";

export type FiturChecklist = {
  dir: string;
  keadaan: KeadaanGenerasi;
  adaChecklist: boolean;
};

/** Pembacaan disk, dipisah dari pemeriksaannya supaya pemeriksaannya bisa diuji tanpa disk. */
export function bacaFitur(featureRoot: string, sufiksGen: string): FiturChecklist[] {
  return readdirSync(featureRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => ({
      dir: e.name,
      keadaan: keadaanGenerasi(featureRoot, e.name, sufiksGen),
      adaChecklist: existsSync(join(featureRoot, e.name, NAMA_CHECKLIST_TENANCY)),
    }));
}

export type HasilChecklist = {
  temuan: string[];
  /** Modul yang pembekuannya sudah dimulai — semesta yang gate ini periksa. */
  beku: number;
  /** Modul yang masih tergenerate DAN masih membawa daftar periksanya: sah, dan disebut. */
  tergenerateDenganChecklist: number;
};

/**
 * Dua nilai `KeadaanGenerasi` yang bukan kunci buku besar (`campuran`, `kosong`) adalah kata
 * Indonesia, jadi tak satu pun boleh mengalir ke pesan sebagai variabel — ia akan mencetak kata
 * Indonesia di tengah kalimat Inggris, kelas yang lolos paritas kunci MAUPUN paritas nama variabel
 * dan hanya terlihat kalau gate-nya dijalankan dalam bahasa kedua. Karena itu kedua keadaan punya
 * KUNCI PESANNYA SENDIRI di bawah, bukan satu pesan bervariabel keadaan.
 */
export function periksaChecklistTenancy(
  fitur: readonly FiturChecklist[],
  t: T,
  sitir: string,
): HasilChecklist {
  const temuan: string[] = [];
  let beku = 0;
  let tergenerateDenganChecklist = 0;

  for (const f of fitur) {
    if (f.keadaan === "handWired" || f.keadaan === "campuran") {
      beku += 1;
      if (!f.adaChecklist) continue;
      const kunci =
        f.keadaan === "handWired"
          ? "kontrak.tenancy.checklist_di_modul_beku"
          : "kontrak.tenancy.checklist_di_modul_campuran";
      temuan.push(`${sitir} ${t(kunci, { dir: f.dir, berkas: NAMA_CHECKLIST_TENANCY })}`);
      continue;
    }
    if (f.keadaan === "tergenerate" && f.adaChecklist) tergenerateDenganChecklist += 1;
  }

  return { temuan, beku, tergenerateDenganChecklist };
}
