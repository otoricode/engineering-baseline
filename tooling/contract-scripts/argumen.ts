/**
 * Bendera CLI dan disiplin dry-run.
 *
 * Batasan global paket ini: **dry-run adalah default untuk tiap perintah yang menulis berkas.**
 * Tanpa `--apply`, laporkan rencananya, keluar 0, jangan sentuh satu berkas pun. `Rencana` di
 * bawah adalah satu-satunya jalan menulis di direktori ini — bukan karena elegan, tapi karena
 * `writeFileSync` yang tersebar di sepuluh skrip berarti sepuluh tempat yang masing-masing bisa
 * lupa memeriksa bendera, dan yang lupa tidak gagal nyaring: ia menulis.
 *
 * Sifat kedua yang ikut didapat, dan yang lebih penting daripada bendera itu sendiri: penulisan
 * dikumpulkan dulu, dijalankan belakangan. Skrip yang menulis di tengah loop lalu memutuskan
 * untuk gagal di iterasi berikutnya meninggalkan pohon kerja SETENGAH termigrasi — keadaan yang
 * lebih buruk daripada tidak menulis apa pun, karena run berikutnya berangkat dari campuran dua
 * bentuk. Dengan `Rencana`, "gagal" berarti `jalankan()` tidak pernah dipanggil.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import type { T } from "./pesan.js";

export type Bendera = {
  /** `true` untuk bendera tanpa nilai, string untuk `--nama nilai`. */
  ada(nama: string): boolean;
  nilai(nama: string): string | undefined;
  /** Argumen posisional, urut. */
  posisi: string[];
};

/**
 * Pengurai bendera yang sengaja KETAT: bendera di luar `dikenal` adalah galat, bukan diabaikan.
 * Bendera yang diam-diam diabaikan adalah cara `--aply` (salah ketik) dibaca sebagai dry-run
 * padahal pemakainya yakin ia sudah menulis.
 */
export function bacaBendera(
  argv: string[],
  dikenal: { nama: string; berNilai: boolean }[],
  t: T,
): Bendera {
  const peta = new Map(dikenal.map((d) => [d.nama, d.berNilai]));
  const isi = new Map<string, string | true>();
  const posisi: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (!a.startsWith("--")) {
      posisi.push(a);
      continue;
    }
    const nama = a.slice(2);
    const berNilai = peta.get(nama);
    if (berNilai === undefined) {
      throw new Error(
        t("kontrak.bendera_tak_dikenal", {
          bendera: a,
          dikenal: dikenal.map((d) => `--${d.nama}`).join(", "),
        }),
      );
    }
    if (berNilai) {
      const v = argv[i + 1];
      // Nilai yang hilang TIDAK boleh menelan bendera berikutnya: `--tag --apply` harus gagal,
      // bukan menetapkan tag bernama "--apply" lalu diam-diam kehilangan `--apply`.
      if (v === undefined || v.startsWith("--")) {
        throw new Error(t("kontrak.bendera_tak_dikenal", { bendera: `${a} <nilai>`, dikenal: a }));
      }
      isi.set(nama, v);
      i++;
    } else {
      isi.set(nama, true);
    }
  }

  return {
    ada: (nama) => isi.has(nama),
    nilai: (nama) => {
      const v = isi.get(nama);
      return typeof v === "string" ? v : undefined;
    },
    posisi,
  };
}

export const BENDERA_APPLY = { nama: "apply", berNilai: false } as const;

export type Rencana = {
  /** Catat satu berkas yang AKAN ditulis. Tidak menyentuh disk. */
  tambah(jalur: string, isi: string, sesudahTulis?: (jalur: string) => void): void;
  /** Berapa berkas yang tercatat — dipakai laporan ringkas skrip. */
  jumlah(): number;
  /**
   * Jalankan rencananya. Tanpa `--apply`: cetak rencananya dan JANGAN menulis. Mengembalikan
   * berkas yang ditulis (kosong pada dry-run) supaya pemanggil bisa melaporkannya.
   */
  jalankan(): string[];
};

export function buatRencana(apply: boolean, t: T, tulis: (s: string) => void): Rencana {
  const antre: { jalur: string; isi: string; sesudahTulis?: (jalur: string) => void }[] = [];
  return {
    tambah: (jalur, isi, sesudahTulis) => antre.push({ jalur, isi, sesudahTulis }),
    jumlah: () => antre.length,
    jalankan: () => {
      if (!apply) {
        tulis(t("kontrak.dry_run", { jumlah: String(antre.length) }));
        for (const a of antre) tulis(`  ${a.jalur}`);
        return [];
      }
      const ditulis: string[] = [];
      for (const a of antre) {
        mkdirSync(path.dirname(a.jalur), { recursive: true });
        writeFileSync(a.jalur, a.isi);
        // `sesudahTulis` (mis. gofmt) sengaja dipanggil DI SINI, bukan di `tambah`: pada
        // dry-run berkasnya tidak ada, jadi memformatnya akan gagal untuk alasan yang tidak
        // ada hubungannya dengan apa pun yang sedang diperiksa.
        a.sesudahTulis?.(a.jalur);
        ditulis.push(a.jalur);
      }
      tulis(t("kontrak.ditulis", { jumlah: String(ditulis.length) }));
      return ditulis;
    },
  };
}
