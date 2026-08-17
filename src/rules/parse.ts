import type { Temuan } from "./lint.js";

export type Rule = {
  id: string;
  judul: string;
  ditegakkanOleh: string;
  usang: string | null;
  berkas: string;
  baris: number;
  rujukan: string[];
};

const JUDUL = /^##\s+([A-Z]-\d{2,3})\s+·\s+(.+?)\s*$/;
const HEADING_KASAR = /^##\s+/;
const PENEGAK = /^\*\*Ditegakkan oleh:\*\*\s+`?([^`\n]+?)`?\s*$/;
const STATUS = /^\*\*Status:\*\*\s+USANG\s+—\s+(.+?)\s*$/;
const RUJUKAN = /\[\[([A-Z]-\d{2,3})\]\]/g;
/** Nama penegak sebagaimana ditulis di prosa: `gate:xxx` atau `standard xxx`. */
const PENEGAK_TOKEN = /`(gate:[a-z0-9-]+|standard [a-z-]+)`/g;
/**
 * Penanda keadaan KETIGA kolom penegak: gate yang namanya nyata dan mengikat, tapi yang
 * **pelaksananya bukan paket ini** — konsumen yang wajib menyediakannya.
 *
 * Sebelum penanda ini ada, kolom penegak cuma punya dua keadaan (nama gate, atau
 * `manual-review-only`), dan sembilan nama gate menempati keadaan pertama tanpa satu baris sumber
 * pun di paket ini: `gate:tenancy-byid`, `gate:golden-ids`, `gate:allowlist-monotonic`,
 * `gate:message-cites-rule`, `gate:archive-freeze`, `gate:backend-no-raw-write`, dan ketiga
 * `gate:frontend-*`. Akibatnya bukan kosmetik — `AGENTS.md` mengarahkan agen yang menghadapi gate
 * merah ke tabel penegak, jadi agen yang patuh diberi tahu `gate:tenancy-byid` (BATAS PENYEWA)
 * menegakkan `T-02`, gate yang tidak ada di mana pun.
 *
 * Penandanya sendiri ber-gate dua arah, lihat `lintGateTerkirim`: nama yang mengaku dikirim
 * padahal tidak = MERAH, penanda yang basi (gate-nya kini benar-benar dikirim) = MERAH juga.
 */
export const PENANDA_KONSUMEN = "(konsumen)";

/**
 * Bentuk nama penegak yang sah, dipakai memecah kolom penegak BER-GATE-BANYAK.
 *
 * Sufiks `(konsumen)` opsional dan HANYA untuk `gate:`; `standard <subperintah>` selalu perintah
 * paket ini sendiri, jadi menandainya milik konsumen akan selalu bohong.
 */
const NAMA_PENEGAK = /^(gate:[a-z0-9-]+(\s+\(konsumen\))?|standard [a-z-]+)$/;
const MANUAL = "manual-review-only";

export type PenegakTerurai = {
  /**
   * Nama gate yang bisa dicocokkan terhadap prosa aturan, sufiks `(konsumen)` SUDAH dibuang.
   *
   * Yang ditandai konsumen tetap masuk daftar ini, bukan dipisah ke larik sendiri: pemeriksaan
   * "badan aturan menyebut penegaknya sendiri" berlaku sama untuk gate yang dikirim konsumen —
   * memisahnya akan mematikan pemeriksaan itu untuk sembilan gate sekaligus, yaitu persis kelas
   * "pengecualian tanpa penjaga" yang paket ini sudah lima kali hukum.
   */
  gate: string[];
  /** Bagian dari `gate` yang ditandai `(konsumen)` — pelaksananya bukan paket ini. */
  konsumen: string[];
  /** `true` kalau kolomnya bentuk `manual-review-only` yang sah (bukan campuran). */
  manual: boolean;
  /** Potongan yang TIDAK dikenali sebagai nama penegak — DILAPORKAN, tidak dibuang. */
  salah: string[];
};

/**
 * Apakah kolomnya bentuk `manual-review-only` yang sah: kata kuncinya sendiri, atau kata kunci
 * plus alasan.
 *
 * Alasannya sengaja TIDAK dipecah lebih lanjut — ia kalimat bebas dan boleh memuat karakter apa
 * pun, termasuk `+`. Yang membatalkan bentuk ini cuma satu: `+` sebagai karakter pertama sesudah
 * kata kunci, karena di situ `+` adalah PEMISAH DAFTAR, bukan bagian kalimat. `manual-review-only
 * + gate:x` karena itu BUKAN bentuk manual — ia kolom CAMPURAN, dan campuran adalah cacat yang
 * harus dilaporkan, bukan dibaca diam-diam sebagai salah satunya.
 *
 * Diukur sebelum ditulis: ke-16 kolom manual yang ada memakai pemisah em-dash dan tak satu pun
 * memuat `+`, jadi predikat ini tidak memerahkan satu pun bentuk yang hidup hari ini. Ia juga
 * sengaja TIDAK menuntut em-dash — menuntutnya akan memerahkan salinan paket ini di proyek yang
 * menulis alasannya dengan pemisah lain, yaitu gate yang memerah pada masukan yang benar.
 */
function bentukManual(nilai: string): boolean {
  if (!nilai.startsWith(MANUAL)) return false;
  const sisa = nilai.slice(MANUAL.length);
  if (sisa.trim() === "") return true;
  if (!/^\s/.test(sisa)) return false; // `manual-review-onlyX` bukan kata kunci ini
  return !sisa.trimStart().startsWith("+");
}

/**
 * Uraikan kolom `**Ditegakkan oleh:**` jadi tiga golongan: nama gate, penanda manual, dan potongan
 * yang TIDAK DIKENALI.
 *
 * Satu aturan boleh ditegakkan lebih dari satu gate, dan itu keadaan biasa: baseline shrink-only
 * ditegakkan di dalam SETIAP gate yang punya baseline, buku besar dua arah di dalam setiap gate
 * yang membacanya. Memaksa satu nama membuat kolomnya berbohong ke salah satu arah — entah
 * menyebut gate yang tidak memeriksanya, entah menyembunyikan gate yang memeriksanya.
 *
 * Pemisahnya `+` dan BUKAN koma: nama gate tidak pernah memuat `+`, sementara koma lazim di dalam
 * kalimat alasan dan akan memecahnya jadi potongan yang tak bermakna.
 *
 * **Golongan `salah` ada karena versi pertama fungsi ini MEMBUANG potongan tak dikenal, dan
 * pembuangan itu mematikan pemeriksaan tanpa suara.** Dua bentuk terukur: kolom campuran
 * `manual-review-only + gate:x` memulangkan larik kosong (kata kuncinya men-short-circuit sebelum
 * pemecahan), dan nama salah bentuk seperti `Gate:A` tersaring habis. Pada KEDUANYA, pemeriksaan
 * "badan menyebut penegaknya sendiri" berhenti berjalan, dan aturan yang prosanya menyebut gate
 * yang sama sekali lain lolos HIJAU. Yang kedua bahkan PELEMAHAN dibanding bentuk sebelum fungsi
 * ini ada: perbandingan string mentah tetap menyala di sana.
 *
 * Ini kelas yang paket ini sendiri sudah hukum tiga kali — heading tak cocok pola yang tertelan
 * jadi badan aturan sebelumnya, direktori nol-aturan yang melapor hijau, dan `README.md` yang
 * dikecualikan tanpa penjaga. Obatnya selalu sama: yang tak dikenali jadi TEMUAN, bukan jadi diam.
 */
export function uraikanPenegak(ditegakkanOleh: string): PenegakTerurai {
  if (bentukManual(ditegakkanOleh)) return { gate: [], konsumen: [], manual: true, salah: [] };

  const gate: string[] = [];
  const konsumen: string[] = [];
  const salah: string[] = [];
  for (const bagian of ditegakkanOleh.split("+").map((s) => s.trim())) {
    if (!NAMA_PENEGAK.test(bagian)) {
      salah.push(bagian);
      continue;
    }
    const ditandai = bagian.endsWith(PENANDA_KONSUMEN);
    const nama = ditandai ? bagian.slice(0, -PENANDA_KONSUMEN.length).trim() : bagian;
    gate.push(nama);
    if (ditandai) konsumen.push(nama);
  }
  return { gate, konsumen, manual: false, salah };
}
/** Bagian prosa yang wajib ada tepat sekali di tiap aturan yang masih berlaku. */
const BAGIAN_PROSA = ["**Aturan.**", "**Mengapa.**", "**Cara memverifikasi.**"] as const;
const FENCE = /^\s*(```|~~~)/;

/**
 * Ganti isi blok kode ber-fence (``` atau ~~~, fence pembuka dan penutup ikut)
 * dengan baris kosong. Baris TIDAK dihapus — nomor baris tetap akurat untuk
 * pelaporan temuan. Dipakai sebelum deteksi heading dan sebelum mengumpulkan
 * rujukan [[ID]], supaya contoh markdown di dalam badan aturan (mis. dokumentasi
 * yang menunjukkan format `## ID · judul` sebagai teks) tidak dibaca sebagai
 * heading atau rujukan sungguhan.
 *
 * Diekspor karena pemeriksa di luar berkas ini perlu menghitung di atas teks yang
 * SAMA. Menghitung heading atas teks mentah membuat baris "## " di dalam blok kode
 * ikut terhitung sebagai aturan — merah palsu yang mengajari orang mengubah contoh
 * di dokumentasinya, bukan aturannya.
 */
export function bersihkanFence(baris: string[]): string[] {
  const hasil = [...baris];
  let diDalamFence = false;
  for (let i = 0; i < hasil.length; i++) {
    const cocokFence = FENCE.test(hasil[i]!);
    if (diDalamFence) {
      hasil[i] = "";
      if (cocokFence) diDalamFence = false;
      continue;
    }
    if (cocokFence) {
      hasil[i] = "";
      diDalamFence = true;
    }
  }
  return hasil;
}

export function parseRules(isi: string, berkas: string): Rule[] {
  const baris = bersihkanFence(isi.split("\n"));
  const hasil: Rule[] = [];
  let aktif: Rule | null = null;
  let badan: string[] = [];

  const tutup = () => {
    if (aktif === null) return;
    aktif.rujukan = [...badan.join("\n").matchAll(RUJUKAN)].map((m) => m[1]!);
    hasil.push(aktif);
    aktif = null;
    badan = [];
  };

  baris.forEach((teks, i) => {
    const judul = JUDUL.exec(teks);
    if (judul !== null) {
      tutup();
      aktif = {
        id: judul[1]!,
        judul: judul[2]!,
        ditegakkanOleh: "",
        usang: null,
        berkas,
        baris: i + 1,
        rujukan: [],
      };
      return;
    }
    if (aktif === null) return;
    badan.push(teks);

    const penegak = PENEGAK.exec(teks);
    if (penegak !== null && aktif.ditegakkanOleh === "") {
      aktif.ditegakkanOleh = penegak[1]!.trim();
      return;
    }
    const status = STATUS.exec(teks);
    if (status !== null) aktif.usang = status[1]!.trim();
  });

  tutup();
  return hasil;
}

/**
 * Pemeriksaan untuk berkas yang SENGAJA DIKECUALIKAN dari pemindaian aturan —
 * `README.md` di folder aturan. Pengecualiannya perlu (README memuat contoh format
 * ber-fence) tapi tanpa penjaga ia lubang: aturan yang ditaruh di sana **lenyap dari
 * `rules-lint` tanpa satu pun sinyal**, jadi tidak ada yang memeriksa ID-nya,
 * penegaknya, maupun kelengkapan prosanya.
 *
 * Di paket ini bahayanya tertutup secara KEBETULAN oleh daftar ID di
 * `inventaris.test.ts`; proyek target yang menyalin paket ini tidak punya
 * padanannya, jadi di sana lubangnya terbuka penuh. Kelas yang sama persis dengan
 * pemeriksaan kelengkapan prosa yang dulu hanya hidup di suite.
 *
 * Yang dilaporkan: judul aturan **di luar** blok ber-fence. Contoh format di DALAM
 * fence tetap sah dan tidak boleh memerahkan apa pun — `rules/README.md` paket ini
 * sendiri memuat dua di antaranya dan jadi kontrol positif pemeriksaan ini.
 */
export function lintBerkasDikecualikan(isi: string, berkas: string): Temuan[] {
  const baris = bersihkanFence(isi.split("\n"));
  const temuan: Temuan[] = [];

  baris.forEach((teks, i) => {
    const judul = JUDUL.exec(teks);
    if (judul === null) return;
    temuan.push({
      berkas,
      baris: i + 1,
      pesan: `${berkas} dikecualikan dari pemindaian aturan, tapi memuat judul aturan "${judul[1]}" di luar blok kode. Aturan di berkas ini TIDAK diperiksa apa pun — tidak ID-nya, tidak penegaknya, tidak kelengkapan prosanya. Pindahkan ke berkas aturan berprefix lapisnya, atau bungkus contohnya dalam blok ber-fence.`,
    });
  });

  return temuan;
}

/**
 * Pemeriksaan FORMAT mentah pada teks berkas aturan, terpisah dari `parseRules`
 * (tanda tangannya dikunci — Task 3/4 sudah menulis pemanggilnya). Menangkap dua
 * kelas cacat yang sebelumnya lolos diam-diam lewat `parseRules`:
 *
 * 1. Baris "## " yang tidak cocok pola judul aturan (`## <ID> · <judul>`).
 *    `parseRules` menelan baris begitu jadi badan aturan SEBELUMNYA — aturan yang
 *    dimaksud hilang total dari hasil parsing, dan `[[ID]]` apa pun di baris itu
 *    salah alamat jadi rujukan milik aturan sebelumnya.
 * 2. "**Ditegakkan oleh:**" yang muncul lebih dari sekali dalam satu aturan.
 *    `parseRules` hanya memakai kemunculan pertama dan membuang sisanya diam-diam.
 * 3. Badan aturan yang menyebut nama penegak, tapi TIDAK satu pun di antaranya nama
 *    penegak yang aturan itu deklarasikan sendiri. Bentuk khasnya: kolom penegak
 *    dipindah ke gate lain sementara prosa verifikasinya tertinggal menyebut yang
 *    lama. Pembaca yang menjalankan pemeriksaan "grep sumber gate itu untuk ID
 *    aturannya" lalu meng-grep gate yang SALAH, dapat nol hasil, dan menyimpulkan
 *    aturannya tidak ditegakkan siapa pun.
 *
 * Memakai teks yang sudah dibersihkan fence-nya (`bersihkanFence`), jadi contoh
 * markdown di dalam blok kode tidak ikut dilaporkan sebagai cacat format.
 */
export function lintFormat(isi: string, berkas: string): Temuan[] {
  const baris = bersihkanFence(isi.split("\n"));
  const temuan: Temuan[] = [];

  let idAktif: string | null = null;
  let barisAktif = 0;
  let penegak: string | null = null;
  let usang = false;
  let tokenBadan = new Set<string>();
  let jumlahBagian = new Map<string, number>();

  /**
   * Cacat #3 hanya dilaporkan kalau badan menyebut SETIDAKNYA satu nama penegak.
   * Badan yang tidak menyebut satu pun bukan cacat — mengulang nama gate di prosa
   * tidak wajib. Dan badan yang menyebut penegaknya sendiri PLUS penegak lain juga
   * bukan cacat: "gate X menjaga aturan lain, bukan aturan ini" adalah kalimat yang
   * sah dan berguna. Yang tidak sah hanya menyebut gate lain SAMBIL tidak pernah
   * menyebut gate sendiri.
   */
  const tutupAturan = () => {
    // Reset TANPA SYARAT — hanya PELAPORANNYA yang bersyarat `idAktif !== null`.
    // Versi bersyarat (`if (idAktif === null) return;` di baris pertama) adalah
    // regresi terhadap kode sebelum pemeriksaan #3 ada: satu baris
    // "**Ditegakkan oleh:**" di PREAMBLE berkas, sebelum heading pertama, tidak
    // pernah dibersihkan dan bocor jadi milik aturan pertama — menghasilkan temuan
    // "penegak ganda" palsu SEKALIGUS membuang penegak yang sesungguhnya, sehingga
    // pemeriksaan #3 lalu berjalan atas nilai yang salah dan bisa MELEWATKAN
    // ketidakcocokan nyata. Masukan cacat adalah domain fungsi ini; jalur galatnya
    // sendiri tidak boleh jadi sumber galat baru.
    // Kolom penegak boleh menyebut LEBIH DARI SATU gate (`gate:a + gate:b`), jadi yang dituntut
    // adalah IRISAN tak-kosong: badan wajib menyebut SEKURANG-KURANGNYA satu penegaknya sendiri.
    // Membandingkan seluruh kolom sebagai satu string — bentuk sebelumnya — membuat setiap aturan
    // ber-gate-banyak memerah walau prosanya menyebut kedua gate-nya dengan benar, yaitu gate
    // yang memerah pada masukan yang BENAR ([[G-06]]).
    const terurai =
      idAktif !== null && penegak !== null
        ? uraikanPenegak(penegak)
        : { gate: [], manual: false, salah: [] };

    // Cacat #5 — potongan kolom penegak yang TIDAK dikenali. Dilaporkan satu per satu, mengutip
    // pelanggarnya, karena membuangnya diam-diam mematikan pemeriksaan #3 di atas: kolom yang
    // seluruh isinya tak dikenali menghasilkan nol nama gate, dan nol nama gate membuat #3
    // melewati aturan itu sepenuhnya. Bentuk khasnya dua — kolom CAMPURAN
    // (`manual-review-only + gate:x`, yang bukan keduanya) dan nama SALAH BENTUK (`Gate:A`,
    // huruf besar/spasi/tanda baca yang tidak pernah dipakai nama gate mana pun).
    for (const bagian of terurai.salah) {
      temuan.push({
        berkas,
        baris: barisAktif,
        pesan: `${idAktif} menyatakan penegaknya "${penegak}", tapi potongan ${JSON.stringify(bagian)} bukan nama penegak yang dikenali. Bentuk yang sah: "gate:<nama-huruf-kecil>", "standard <subperintah>", beberapa di antaranya dipisah " + ", atau "manual-review-only — <alasan>" berdiri sendiri (tidak dicampur dengan nama gate). Potongan yang tidak dikenali TIDAK diabaikan: kalau tak satu pun potongan bisa dibaca, pemeriksaan "badan menyebut penegaknya sendiri" berhenti berjalan untuk aturan ini.`,
      });
    }

    const milikSendiri = terurai.gate;
    if (milikSendiri.length > 0 && tokenBadan.size > 0 && !milikSendiri.some((n) => tokenBadan.has(n))) {
      const disebut = [...tokenBadan].map((t) => `"${t}"`).join(", ");
      temuan.push({
        berkas,
        baris: barisAktif,
        pesan: `${idAktif} menyatakan penegaknya "${penegak}", tapi badan aturannya hanya menyebut ${disebut}. Samakan keduanya: pembaca yang meng-grep sumber penegak untuk ID aturan ini akan memeriksa yang salah lalu menyimpulkan aturannya tak bertuan.`,
      });
    }
    // Cacat #4 — kelengkapan prosa. Aturan yang DICABUT dikecualikan: template
    // pencabutan di rules/README.md memang hanya Status + penegak. Pembebasan itu
    // tidak bisa dipakai membungkam aturan hidup karena `lintRules` menuntut aturan
    // ber-USANG memakai bentuk penegak pencabutan yang eksplisit.
    if (idAktif !== null && !usang) {
      for (const bagian of BAGIAN_PROSA) {
        const n = jumlahBagian.get(bagian) ?? 0;
        if (n === 1) continue;
        temuan.push({
          berkas,
          baris: barisAktif,
          pesan:
            n === 0
              ? `${idAktif} tidak punya bagian "${bagian}". Tiap aturan wajib memuat keempat bagiannya; "**Mengapa.**" khususnya wajib menyebut kegagalan konkret, bukan prinsip abstrak.`
              : `${idAktif} memuat bagian "${bagian}" sebanyak ${n} kali, harus tepat sekali.`,
        });
      }
    }

    idAktif = null;
    penegak = null;
    usang = false;
    tokenBadan = new Set<string>();
    jumlahBagian = new Map<string, number>();
  };

  baris.forEach((teks, i) => {
    if (HEADING_KASAR.test(teks)) {
      const judul = JUDUL.exec(teks);
      if (judul === null) {
        temuan.push({
          berkas,
          baris: i + 1,
          pesan: `baris "${teks.trim()}" dimulai dengan "## " tapi tidak cocok pola judul aturan yang diharapkan ("## <ID> · <judul>", mis. "## C-01 · Envelope tunggal"); tanpa perbaikan, baris ini tertelan diam-diam jadi badan aturan sebelumnya dan aturan yang dimaksud hilang dari hasil parsing.`,
        });
      } else {
        tutupAturan();
        idAktif = judul[1]!;
        barisAktif = i + 1;
      }
      return;
    }
    if (PENEGAK.test(teks)) {
      if (penegak !== null) {
        temuan.push({
          berkas,
          baris: i + 1,
          pesan: `"**Ditegakkan oleh:**" muncul lebih dari sekali dalam aturan ini; hanya kemunculan pertama yang dipakai, sisanya dibuang diam-diam.`,
        });
      } else {
        penegak = PENEGAK.exec(teks)![1]!.trim();
      }
      // Baris penegak sendiri TIDAK dihitung sebagai sebutan di badan; kalau ikut
      // dihitung, cacat #3 tidak akan pernah bisa menyala.
      return;
    }
    if (idAktif === null) return;
    if (STATUS.test(teks)) usang = true;
    for (const bagian of BAGIAN_PROSA) {
      if (teks.startsWith(bagian)) jumlahBagian.set(bagian, (jumlahBagian.get(bagian) ?? 0) + 1);
    }
    for (const m of teks.matchAll(PENEGAK_TOKEN)) tokenBadan.add(m[1]!);
  });

  tutupAturan();
  return temuan;
}
