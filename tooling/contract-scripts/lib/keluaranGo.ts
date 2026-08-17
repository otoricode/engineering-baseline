/**
 * Menambahkan satu keluaran Go ke rencana — atau MELAPORKAN bahwa ia dilewati.
 *
 * # Kenapa fungsi ini ada, alih-alih dua `if` yang disalin
 *
 * `gen common` adalah satu-satunya perintah generasi yang keluarannya BERCAMPUR: `gen-permissions`
 * dan `gen-error-codes` masing-masing menulis satu berkas Go DAN satu berkas TypeScript dari sumber
 * yang sama, dan `gen-shared-spec` tidak menyentuh Go sama sekali. Karena itu ia tidak boleh keluar
 * 2 di proyek contract-only seperti `gen wiring`/`gen module`/`gen dto`: katalog TypeScript dan
 * dokumen schema bersama justru satu-satunya hal yang bisa dipakai konsumen contract-only, dan
 * menolak memancarkannya mengubah "contract-only didukung" jadi "contract-only tidak bisa
 * menghasilkan apa pun".
 *
 * Aturannya karena itu: **perintah yang keluarannya SELURUHNYA backend keluar 2; perintah yang
 * keluarannya bercampur memancarkan paruh yang bisa dipancarkan.**
 *
 * # Yang dilewati WAJIB terlihat
 *
 * Pemeriksaan — atau di sini, keluaran — yang diam-diam tidak terjadi adalah kelas cacat yang paket
 * ini ada untuk melawannya. Jadi lewatannya DICETAK, dan kalimatnya menyebut **berkas Go apa yang
 * tidak ditulis**: orang yang kelak memindahkan proyeknya ke lapis backend harus tahu apa yang
 * belum pernah ada, dan ia tidak bisa menyimpulkannya dari direktori yang memang kosong.
 *
 * Dipusatkan di satu fungsi, bukan disalin ke kedua skrip: dua salinan pasti menyimpang, dan yang
 * menyimpang di sini adalah KALIMAT yang jadi satu-satunya jejak keluaran yang hilang.
 */
import type { Rencana } from "../argumen.js";
import type { Jalur } from "../paths.js";
import type { T } from "../pesan.js";
import type { StandardConfig } from "../../../src/config/schema.js";
import { adaLapisBackend } from "../paths.js";

export function tambahKeluaranGo(opsi: {
  rencana: Rencana;
  jalur: Jalur;
  config: StandardConfig;
  /** Nama berkas di bawah `go.genDir`, mis. `permissions.go`. */
  namaBerkas: string;
  isi: string;
  t: T;
  tulis: (s: string) => void;
  /** Dipanggil sesudah berkasnya ditulis, mis. `gofmt`. */
  sesudahTulis?: (jalur: string) => void;
}): void {
  const { rencana, jalur, config, namaBerkas, isi, t, tulis, sesudahTulis } = opsi;
  if (!adaLapisBackend(config)) {
    tulis(t("kontrak.lewat_keluaran_go", { berkas: namaBerkas }));
    return;
  }
  rencana.tambah(jalur.goGen(namaBerkas), isi, sesudahTulis);
}
