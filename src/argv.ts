/**
 * Pembaca argumen untuk SUBPERINTAH `standard` — ketat, dan ketatnya yang jadi isinya.
 *
 * Bendera di luar daftar `dikenal` adalah GALAT, bukan diabaikan. Bendera yang diabaikan diam-diam
 * adalah cara `--aply` (salah ketik) dibaca sebagai dry-run oleh alat yang pemakainya yakin sudah
 * menulis — dan kelas "bagian tak dikenali dibuang alih-alih dilaporkan" adalah kelas yang paket
 * ini sudah hukum tiga kali di tempat lain (heading tak cocok pola, direktori nol aturan, potongan
 * kolom penegak). Argumen POSISIONAL diperlakukan sama: dikembalikan apa adanya supaya pemanggil
 * bisa menolaknya, bukan ditelan di sini.
 *
 * # Kenapa ini bukan `tooling/contract-scripts/argumen.ts`
 *
 * Berkas itu pembaca bendera untuk SKRIP KONTRAK: pesannya hidup di namespace kunci `kontrak.*`,
 * dan ia juga memiliki `Rencana` (disiplin dry-run untuk skrip yang menulis berkas). Subperintah
 * CLI punya namespace kunci sendiri (`gen.*`, `gate.*`) dan tidak menulis berkas sendiri — ia
 * menyuruh alat di bawahnya yang menulis. Menyatukan keduanya berarti salah satu lapis mengimpor
 * namespace pesan lapis lain; yang dibagi di sini justru BENTUKNYA, dan bentuk itu dijaga uji di
 * kedua sisi.
 */
export type SpesifikasiBendera = { nama: string; berNilai: boolean };

export type Bendera = {
  /** `true` untuk bendera tanpa nilai maupun bendera bernilai yang muncul. */
  ada(nama: string): boolean;
  nilai(nama: string): string | undefined;
  /** Argumen non-bendera, urut. Pemanggil yang tidak menerimanya WAJIB menolaknya. */
  posisi: string[];
};

/**
 * Pesan galat disuplai pemanggil sebagai teks yang SUDAH dirender dari katalognya sendiri, bukan
 * sebagai kunci: berkas ini tidak boleh memilih namespace kunci untuk pemanggilnya (lihat di atas),
 * dan literal berbahasa Indonesia di sini akan menembus katalog dwibahasa ke pemakai berbahasa
 * Inggris — kelas yang paling sulit dilihat karena ia hanya muncul di bahasa yang paling jarang
 * diuji.
 */
export type PesanArgv = {
  takDikenal(bendera: string, dikenal: string): string;
  tanpaNilai(bendera: string, dikenal: string): string;
};

export function bacaArgv(
  argv: string[],
  dikenal: SpesifikasiBendera[],
  pesan: PesanArgv,
): Bendera {
  const peta = new Map(dikenal.map((d) => [d.nama, d.berNilai]));
  const daftar = dikenal.map((d) => `--${d.nama}`).join(", ");
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
    if (berNilai === undefined) throw new Error(pesan.takDikenal(a, daftar));
    if (!berNilai) {
      isi.set(nama, true);
      continue;
    }
    const v = argv[i + 1];
    // Nilai yang hilang TIDAK boleh menelan bendera berikutnya: `--pkg --apply` harus gagal, bukan
    // menetapkan paket bernama "--apply" lalu diam-diam kehilangan `--apply` — yaitu perintah yang
    // dry-run padahal pemakainya yakin ia menulis.
    if (v === undefined || v.startsWith("--")) throw new Error(pesan.tanpaNilai(a, daftar));
    isi.set(nama, v);
    i++;
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
