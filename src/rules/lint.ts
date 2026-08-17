import { bersihkanFence, PENANDA_KONSUMEN, uraikanPenegak, type Rule } from "./parse.js";

export type Temuan = { berkas: string; baris: number; pesan: string };

/**
 * Kolom penegak vs gate yang paket ini BENAR-BENAR kirim.
 *
 * # Cacat yang melahirkannya
 *
 * Diukur: dari 23 aturan ber-gate, hanya 12 yang gate-nya benar-benar terkirim dan berjalan.
 * Sembilan nama gate — termasuk `gate:tenancy-byid` (batas penyewa) dan `gate:allowlist-monotonic`
 * (fondasi langkah 3–4 `INSTALL.md`) — punya NOL sumber pelaksana di paket ini. Kolomnya menyebut
 * mereka dengan bentuk yang sama persis dengan gate yang sungguhan, jadi tidak ada cara
 * membedakan keduanya selain meng-grep sumbernya satu per satu.
 *
 * Itu melanggar khotbah paket ini sendiri tiga kali: `rules/README.md` menyuruh penulis aturan
 * menulis `manual-review-only` selama gate-nya belum ada; `STANDARD.md` menutup tabelnya dengan
 * kalimat yang mengundang pembacaan bahwa sisanya tertutup; dan `AGENTS.md` mengarahkan agen yang
 * menghadapi gate merah ke tabel itu persis.
 *
 * # Kenapa BUKAN dengan menulis kesembilan gate itu
 *
 * Tiga dari sembilan (`gate:frontend-*`) menjalankan perintah PROYEK — `pnpm typecheck`,
 * `pnpm run generate:client` — dan tak satu pun bisa dikirim oleh paket yang tidak tahu bentuk
 * proyek pemakainya. Yang salah bukan ketiadaan gate-nya; yang salah adalah kolom yang tidak bisa
 * membedakan "dikirim paket ini" dari "wajib kau sediakan sendiri". Keadaan ketiga itulah yang
 * ditambahkan, dan ia ber-gate DUA ARAH supaya ia tidak jadi kolom ketiga yang ikut berbohong.
 *
 * # Inventarisnya bukan daftar tangan
 *
 * `terkirim` datang dari `LANGKAH[].gate` (daftar yang `standard gate` benar-benar jalankan) plus
 * nama gate yang muncul di template CI yang paket ini kirim. Keduanya sudah ada sebelum
 * pemeriksaan ini; yang tidak ada adalah persilangannya — kembar-tanpa-pengikat, kelas yang paket
 * ini sudah empat kali perangi dan menang.
 *
 * Aturan USANG dilewati: ia sudah dibebaskan dari kelengkapan prosa oleh `lintRules`, dan gate
 * yang ikut dicabut bersamanya memang tidak lagi dikirim siapa pun.
 */
export function lintGateTerkirim(rules: Rule[], terkirim: ReadonlySet<string>): Temuan[] {
  const temuan: Temuan[] = [];
  for (const r of rules) {
    if (r.usang !== null) continue;
    const terurai = uraikanPenegak(r.ditegakkanOleh);
    const ditandai = new Set(terurai.konsumen);
    for (const nama of terurai.gate) {
      if (!nama.startsWith("gate:")) continue; // `standard <subperintah>` selalu milik paket ini
      const dikirim = terkirim.has(nama);
      if (!dikirim && !ditandai.has(nama)) {
        temuan.push({
          berkas: r.berkas,
          baris: r.baris,
          pesan: `${r.id} menyatakan ditegakkan ${nama}, tapi paket ini tidak mengirim pelaksana bernama itu — tidak di daftar langkah \`standard gate\`, tidak di template CI mana pun. Kolom penegak yang menyebut gate yang tidak ada lebih buruk daripada kolom kosong: ia menghentikan orang membangun penjaga yang sungguhan, dan agen yang diarahkan ke tabel penegak akan diberi tahu aturan ini terjaga. Tulis "${nama} ${PENANDA_KONSUMEN}" kalau memang konsumen yang wajib menyediakannya, atau kirim pelaksananya.`,
        });
        continue;
      }
      if (dikirim && ditandai.has(nama)) {
        temuan.push({
          berkas: r.berkas,
          baris: r.baris,
          pesan: `${r.id} menandai ${nama} sebagai ${PENANDA_KONSUMEN}, tapi paket ini SENDIRI mengirim pelaksananya. Penanda yang basi menyuruh pemakai membangun gate yang sudah ia punya.`,
        });
      }
    }
  }
  return temuan;
}

/**
 * Bentuk penegak untuk aturan yang DICABUT, sesuai template pencabutan di
 * `rules/README.md`. Predikatnya sengaja mencocokkan kalimat penuh ini, bukan
 * sekadar awalan "manual-review-only": 15 dari 37 aturan berpenegak
 * "manual-review-only — <alasan mesin tak bisa memeriksanya>" dan MASIH HIDUP.
 * Awalan longgar sudah terpenuhi oleh mereka, jadi penanda USANG bisa membungkam
 * pemeriksaan kelengkapan prosa mereka TANPA perubahan kedua apa pun — justru pada
 * aturan yang seluruh isinya prosa, karena tak satu pun punya gate. Dengan kalimat
 * penuh, mencabut sebuah aturan tetap mungkin tapi selalu menuntut perubahan yang
 * TERLIHAT, dan itu berlaku untuk ke-37 aturan, bukan cuma 22 yang ber-gate.
 */
const PENEGAK_PENCABUTAN = "manual-review-only — sudah tidak ditegakkan";

export function lintRules(rules: Rule[]): Temuan[] {
  const temuan: Temuan[] = [];
  const terlihat = new Map<string, Rule>();

  for (const r of rules) {
    const sebelumnya = terlihat.get(r.id);
    if (sebelumnya !== undefined) {
      temuan.push({
        berkas: r.berkas,
        baris: r.baris,
        pesan: `ID ${r.id} dipakai dua kali (pertama di ${sebelumnya.berkas}:${sebelumnya.baris}). ID tidak pernah dipakai ulang.`,
      });
      continue;
    }
    terlihat.set(r.id, r);
  }

  for (const r of rules) {
    if (r.ditegakkanOleh === "") {
      temuan.push({
        berkas: r.berkas,
        baris: r.baris,
        pesan: `${r.id} tidak punya "**Ditegakkan oleh:**". Sebut nama gate, atau tulis manual-review-only beserta alasannya.`,
      });
    } else if (r.usang !== null && !r.ditegakkanOleh.startsWith(PENEGAK_PENCABUTAN)) {
      // "**Status:** USANG" membebaskan sebuah aturan dari tuntutan kelengkapan
      // prosa. Tanpa pemeriksaan ini, pembebasan itu jadi TOMBOL BISU: satu baris
      // teks membungkam pemeriksaan atas aturan yang masih hidup dan masih wajib
      // ada — termasuk aturan yang menanggung beban keamanan. Aturan yang dicabut
      // wajib memakai bentuk penegak pencabutan yang eksplisit, sehingga
      // membisukan sebuah aturan selalu menuntut perubahan KEDUA yang terlihat.
      temuan.push({
        berkas: r.berkas,
        baris: r.baris,
        pesan: `${r.id} ditandai "**Status:** USANG" tapi penegaknya "${r.ditegakkanOleh}". Aturan yang dicabut wajib berpenegak "${PENEGAK_PENCABUTAN} …" — kalau ia belum dinyatakan berhenti ditegakkan, ia belum dicabut, dan penanda USANG-nya membebaskannya dari pemeriksaan kelengkapan tanpa dasar.`,
      });
    }
    for (const tujuan of r.rujukan) {
      if (!terlihat.has(tujuan)) {
        temuan.push({
          berkas: r.berkas,
          baris: r.baris,
          pesan: `${r.id} merujuk [[${tujuan}]] yang tidak ada.`,
        });
      }
    }
  }

  return temuan;
}

const RUJUKAN_DOK = /\[\[([A-Z]-\d{2,3})\]\]/g;

/**
 * Pemeriksaan untuk keempat pintu masuk dokumen — `STANDARD.md` (manusia),
 * `AGENTS.md` (agen), `README.md` (peta paket), dan `INSTALL.md` (prosedur
 * pemasangan). Keempatnya boleh HANYA
 * menunjuk ID `[[ID]]`, tidak pernah menyatakan ulang isi aturan: salinan kedua
 * pasti menyimpang dari yang pertama, dan itu kelas cacat yang `rules/README.md`
 * sendiri larang berlaku juga untuk paket ini.
 *
 * Fungsi ini hanya memeriksa satu sisi dari larangan itu — bahwa tiap rujukan
 * menunjuk ID yang HIDUP di `rules/`. Ia tidak (dan tidak bisa) memeriksa bahwa
 * dokumen tidak menyatakan ulang isi aturan; itu pemeriksaan prosa, tetap
 * `manual-review-only`.
 *
 * Dipanggil dari `rules-lint`, bukan hanya dari suite paket ini — proyek target
 * yang menyalin `STANDARD.md`/`AGENTS.md`/`README.md`/`INSTALL.md` ikut terjaga
 * saat mengedit rujukannya, bukan cuma paket asal (lihat tabel cakupan di
 * `rules/README.md`).
 *
 * Dibersihkan lewat `bersihkanFence` sebelum dipindai, konsisten dengan keempat
 * pemeriksa lain di `parse.ts` (heading, penegak, rujukan silang aturan, badan
 * dikecualikan). Fix round 1: draf pertama TIDAK melakukan ini, jadi dokumen yang
 * MENCONTOHKAN sintaks `[[ID]]` di dalam blok ber-fence — bentuk yang justru
 * paling mungkin muncul di keempat pintu masuk ini, karena `rules/README.md`
 * sendiri sudah melakukannya untuk contoh heading aturan — dilaporkan sebagai
 * rujukan mati sungguhan. Itu false positive persis kelas yang `G-06` larang:
 * gate yang memerahkan bentuk yang BENAR akan dibuang orang.
 */
export function lintRujukanDokumen(
  dokumen: { berkas: string; isi: string }[],
  rules: Rule[],
): Temuan[] {
  const hidup = new Set(rules.map((r) => r.id));
  const temuan: Temuan[] = [];
  for (const d of dokumen) {
    bersihkanFence(d.isi.split("\n")).forEach((baris, i) => {
      for (const m of baris.matchAll(RUJUKAN_DOK)) {
        if (!hidup.has(m[1]!)) {
          temuan.push({
            berkas: d.berkas,
            baris: i + 1,
            pesan: `merujuk [[${m[1]}]] yang tidak ada di rules/.`,
          });
        }
      }
    });
  }
  return temuan;
}

/**
 * Urutan pilar naratif yang STANDARD.md pakai untuk bagiannya (S -> C -> B -> W
 * -> T -> I -> G -> O), dipertahankan di tabel penutupnya juga supaya urutan
 * baris tabel cocok dengan urutan bagian di atasnya. INI BUKAN urutan file di
 * disk — `namaBerkas.sort()` di `command.ts` membaca berkas menurut abjad nama
 * berkasnya (B, C, G, I, O, S, T, W), jadi generator tabel ini mengurutkan
 * ULANG berdasarkan ID, bukan berasumsi `rules` sudah datang dalam urutan ini.
 */
const URUTAN_PILAR = ["S", "C", "B", "W", "T", "I", "G", "O"];

function bandingkanId(a: string, b: string): number {
  const [prefixA, angkaA] = a.split("-");
  const [prefixB, angkaB] = b.split("-");
  const posisiA = URUTAN_PILAR.indexOf(prefixA!);
  const posisiB = URUTAN_PILAR.indexOf(prefixB!);
  return posisiA !== posisiB ? posisiA - posisiB : Number(angkaA) - Number(angkaB);
}

/**
 * `manual-review-only — <alasan>` ditampilkan di tabel sebagai kata kuncinya saja, tanpa alasan
 * (alasannya ada di aturannya; tabel cuma peta); nama gate dibungkus backtick, meniru cara
 * `**Ditegakkan oleh:**` ditulis di `rules/`.
 *
 * Predikat "apakah ini bentuk manual" datang dari `uraikanPenegak`, BUKAN dari `startsWith` kedua
 * di berkas ini. Salinan kedua sebuah predikat pasti menyimpang dari yang pertama — dan
 * penyimpangannya di sini punya bentuk konkret: kolom CAMPURAN (`manual-review-only + gate:x`)
 * lolos `startsWith` dan akan dirender sebagai "manual-review-only" belaka, menyembunyikan gate
 * yang ada di kolomnya justru di tabel yang orang baca untuk mencari gate.
 */
function formatPenegakTabel(ditegakkanOleh: string): string {
  return uraikanPenegak(ditegakkanOleh).manual ? "manual-review-only" : `\`${ditegakkanOleh}\``;
}

export type BarisTabelPenegak = { id: string; judul: string; penegak: string };

export function bangkitkanBarisTabelPenegak(rules: Rule[]): BarisTabelPenegak[] {
  return [...rules]
    .sort((a, b) => bandingkanId(a.id, b.id))
    .map((r) => ({ id: r.id, judul: r.judul, penegak: formatPenegakTabel(r.ditegakkanOleh) }));
}

function renderBarisTabelPenegak(b: BarisTabelPenegak): string {
  return `| [[${b.id}]] | ${b.judul} | ${b.penegak} |`;
}

/** Dipakai untuk membangkitkan tabel dari nol (mis. saat mengarang ulang
 * STANDARD.md); `lintTabelPenegak` di bawah memverifikasi tabel yang SUDAH ADA,
 * bukan menuliskannya, jadi dua fungsi ini sengaja terpisah. */
export function renderTabelPenegak(rules: Rule[]): string {
  const baris = bangkitkanBarisTabelPenegak(rules).map(renderBarisTabelPenegak);
  return [TABEL_HEADER, TABEL_PEMISAH_KANONIK, ...baris].join("\n");
}

export const TABEL_PENEGAK_MULAI = "<!-- rules-lint:tabel-penegak:mulai -->";
export const TABEL_PENEGAK_SELESAI = "<!-- rules-lint:tabel-penegak:selesai -->";

/** Sel header kanonik, satu sumber untuk render (`TABEL_HEADER`, gabungan
 * literalnya) maupun untuk pengenalan (`isHeaderTabel`, per-sel sesudah trim). */
const TABEL_HEADER_SEL = ["ID", "Judul", "Ditegakkan oleh"];
const TABEL_HEADER = `| ${TABEL_HEADER_SEL.join(" | ")} |`;
const TABEL_PEMISAH_KANONIK = "|---|---|---|";
const TABEL_BARIS = /^\|\s*\[\[([A-Z]-\d{2,3})\]\]\s*\|\s*(.*?)\s*\|\s*(.*?)\s*\|\s*$/;

/** Sel-sel sebuah baris tabel markdown, dipangkas whitespace-nya. Baris
 * standar diapit `|` di kedua ujung, jadi elemen pertama & terakhir hasil
 * `split("|")` kosong — dibuang, sisanya sel sungguhan. */
function selTabel(baris: string): string[] {
  const bagian = baris.split("|");
  if (bagian.length >= 2 && bagian[0]!.trim() === "" && bagian[bagian.length - 1]!.trim() === "") {
    bagian.shift();
    bagian.pop();
  }
  return bagian.map((s) => s.trim());
}

/**
 * Fix round 3, M1: versi sebelumnya mencocokkan baris header/pemisah lawan
 * STRING PERSIS (`"| ID | Judul | Ditegakkan oleh |"`, `"|---|---|---|"`).
 * Baris DATA selamat dari kekakuan itu (`TABEL_BARIS` sudah pakai `\s*`), tapi
 * header dan pemisah tidak — dan itu justru bentuk yang paling sering muncul,
 * karena keduanya adalah bentuk BAKU yang `prettier`/`markdownlint --fix`
 * hasilkan begitu markdown-nya diformat:
 *
 * ```
 * | ID       | Judul   | Ditegakkan oleh |   <- header berspasi rata kolom
 * | -------- | ------- | --------------- |   <- pemisah panjang
 * |:---|:---:|---:|                          <- pemisah dengan alignment
 * ```
 *
 * Ketiganya dulu jatuh ke cabang "sampah" (M1 LAHIR dari fix N2: sebelum N2,
 * baris tak-cocok dibuang diam-diam, jadi keluaran formatter lolos tanpa
 * disadari; N2 menukar lolos-diam itu dengan false positive). Gate yang
 * memerah pada masukan BENAR di hari pertama pemasangan — persis saat sebuah
 * tim menjalankan formatter markdown-nya — mengajari orang mematikannya, dan
 * itu kelas yang [[G-06]] larang.
 *
 * Header sekarang dicocokkan PER-SEL sesudah trim (`isHeaderTabel`); pemisah
 * dicocokkan sebagai baris yang isinya cuma `|`, spasi, `:`, dan `-`
 * (`isPemisahTabel`) — mencakup ketiga bentuk di atas sekaligus.
 */
function isHeaderTabel(baris: string): boolean {
  const sel = selTabel(baris);
  return sel.length === TABEL_HEADER_SEL.length && sel.every((s, i) => s === TABEL_HEADER_SEL[i]);
}

const TABEL_PEMISAH_RE = /^[|\s:-]+$/;

function isPemisahTabel(baris: string): boolean {
  const t = baris.trim();
  return t.includes("-") && TABEL_PEMISAH_RE.test(t);
}

/**
 * Fix round 2, N2: versi sebelumnya cuma memakai `Map` (last-wins) untuk
 * mengumpulkan baris, jadi dua cacat lolos HIJAU tanpa jejak — **baris
 * duplikat** untuk ID yang sama (tertelan diam-diam oleh last-wins) dan
 * **baris sampah** yang tidak berbentuk `| [[ID]] | judul | penegak |` sama
 * sekali (`TABEL_BARIS` gagal cocok, jadi baris itu lenyap dari `aktual` tanpa
 * satu pun sinyal). Keduanya sekarang dikumpulkan terpisah dan dilaporkan
 * sebagai temuannya sendiri di `lintTabelPenegak`, bukan cuma dibuang.
 */
function analisaBlokTabel(blok: string): {
  baris: BarisTabelPenegak[];
  duplikat: string[];
  sampah: string[];
} {
  const baris: BarisTabelPenegak[] = [];
  const sampah: string[] = [];
  const kemunculan = new Map<string, number>();
  for (const teks of blok.split("\n")) {
    const dipangkas = teks.trim();
    if (dipangkas === "" || isHeaderTabel(dipangkas) || isPemisahTabel(dipangkas)) continue;
    const m = TABEL_BARIS.exec(teks);
    if (m === null) {
      sampah.push(dipangkas);
      continue;
    }
    const id = m[1]!;
    kemunculan.set(id, (kemunculan.get(id) ?? 0) + 1);
    baris.push({ id, judul: m[2]!, penegak: m[3]! });
  }
  const duplikat = [...kemunculan.entries()].filter(([, n]) => n > 1).map(([id]) => id);
  return { baris, duplikat, sampah };
}

/**
 * Tabel "aturan mana ditegakkan gate mana" di `STANDARD.md` adalah ARTEFAK
 * GENERATED — sama kelas dengan pohon yang [[B-03]] atur, hanya beda level
 * (markdown, bukan kode) — dibangkitkan dari kolom **Ditegakkan oleh** di
 * `rules/`, bukan diketik tangan. Fix round 1: draf pertama menyalinnya tangan
 * dan mengungkapkannya sendiri sebagai risiko basi tanpa gate; ini penutupnya.
 *
 * Dua arah, per [[G-05]]:
 * - **Aturan tanpa baris** (hilang dari tabel) -> MERAH, menyitir ID-nya.
 * - **Baris untuk ID yang tidak ada di `rules/`** (rujukan mati) TIDAK diulang
 *   di sini — tiap sel ID tabel memuat `[[ID]]` biasa, jadi arah ini SUDAH
 *   tertutup oleh `lintRujukanDokumen` di atas. Melapor dua kali untuk cacat
 *   yang sama membuat pembaca bingung gate mana yang sebenarnya menegakkannya.
 * - **Baris yang ID-nya cocok tapi judul/penegaknya BASI** -> MERAH, isi
 *   ekspektasi vs isi sungguhan disebut di pesannya (syarat [[G-04]]:
 *   pesan gagal menyitir artefak spesifik, bukan vonis generik).
 * - **Urutan baris** yang tertukar posisi (relatif terhadap urutan pilar
 *   naratif di atas tabel) juga MERAH, tapi hanya diperiksa kalau isi tiap
 *   barisnya sendiri sudah cocok — dua kelas cacat sekaligus di baris yang
 *   sama akan membingungkan, bukan membantu.
 *
 * Kalau markernya (`TABEL_PENEGAK_MULAI`/`_SELESAI`) tidak ada sama sekali,
 * itu sendiri MERAH: tanpa marker, fungsi ini tidak tahu di mana tabelnya
 * berada dan tidak bisa memverifikasi apa pun — diam dalam keadaan itu akan
 * terlihat hijau padahal nol pemeriksaan berjalan, kelas yang sama dengan
 * direktori nol-aturan.
 *
 * Fix round 2, N3: pencarian marker dilakukan atas teks yang sudah dibersihkan
 * `bersihkanFence`, BUKAN teks mentah. Sebelumnya `indexOf` atas teks mentah
 * berarti marker yang dicontohkan di dalam blok ber-fence (mis. penjelasan
 * "begini bentuk markernya") ikut cocok, membuat fungsi ini mengambil wilayah
 * blok yang SALAH — gagal-keras jadi bukan lubang cakupan, tapi 37 temuan
 * menyesatkan sekaligus (semua aturan "hilang" dari tabel yang sebenarnya
 * tidak pernah diperiksa). Marker yang hanya muncul di dalam fence sekarang
 * dianggap TIDAK ADA (baris di dalam fence dikosongkan sebelum dicari), sama
 * perlakuannya dengan `lintRujukanDokumen` di atas.
 */
/**
 * Kalimat hitungan di BAWAH tabel penegak ("N dari M ber-`manual-review-only`").
 *
 * Ia diturunkan dari sumber yang persis sama dengan tabel di atasnya — kolom **Ditegakkan oleh**
 * di `rules/` — tapi sampai fungsi ini ada, tabelnya ber-gate dan kalimatnya TIDAK. Itu bentuk
 * yang paling mudah basi dari keduanya: menambah satu aturan `manual-review-only` menuntut satu
 * baris tabel (merah kalau lupa, lewat `lintTabelPenegak`) DAN satu angka di kalimat ini (dulu:
 * tidak merah sama sekali). Angka yang salah di kalimat itu justru dibaca sebagai ukuran seberapa
 * besar bagian standar ini yang belum bisa dimesinkan — angka yang orang pakai untuk memutuskan
 * apa yang dibangun berikutnya.
 *
 * Kalimat yang HILANG dilaporkan, bukan dilewati. Ini pilihan yang sama dengan yang sudah dipegang
 * `lintTabelPenegak` untuk markernya: "tidak ada yang diperiksa" tidak boleh terbaca sama dengan
 * "lulus". Konsekuensinya jujur — salinan `STANDARD.md` yang membuang kalimat ini akan merah, dan
 * cara memulihkannya adalah menulis kalimatnya kembali dengan angka yang benar.
 *
 * Diletakkan di `rules-lint`, BUKAN di `standard verify`, dan itu bukan selera: `verify` adalah
 * self-test paket asal, sementara `rules-lint` adalah yang dijalankan proyek yang MENYALIN
 * `STANDARD.md` ke dalam repo mereka sendiri. Pemeriksaan yang hanya hidup di `verify` tidak ikut
 * terbawa ke sana.
 */
const POLA_HITUNGAN_MANUAL = /(\d+)\s+dari\s+(\d+)\s+ber-`manual-review-only`/;

export function lintHitunganManual(
  rules: Rule[],
  dokumen: { berkas: string; isi: string } | undefined,
): Temuan[] {
  if (dokumen === undefined) return [];

  const barisBersih = bersihkanFence(dokumen.isi.split("\n"));
  const indeks = barisBersih.findIndex((b) => POLA_HITUNGAN_MANUAL.test(b));
  const manual = rules.filter((r) => uraikanPenegak(r.ditegakkanOleh).manual).length;

  if (indeks === -1) {
    return [
      {
        berkas: dokumen.berkas,
        baris: 0,
        pesan: `tidak memuat kalimat hitungan "<N> dari <M> ber-\`manual-review-only\`" (di luar blok ber-fence) — tanpa kalimat itu tidak ada yang memeriksa bahwa angkanya masih benar. Yang benar sekarang: ${manual} dari ${rules.length}.`,
      },
    ];
  }

  const m = POLA_HITUNGAN_MANUAL.exec(barisBersih[indeks]!)!;
  const tertulisManual = Number(m[1]);
  const tertulisTotal = Number(m[2]);
  if (tertulisManual === manual && tertulisTotal === rules.length) return [];
  return [
    {
      berkas: dokumen.berkas,
      baris: indeks + 1,
      pesan: `kalimat hitungan basi — tertulis "${tertulisManual} dari ${tertulisTotal} ber-\`manual-review-only\`", sebenarnya ${manual} dari ${rules.length}.`,
    },
  ];
}

export function lintTabelPenegak(
  rules: Rule[],
  dokumen: { berkas: string; isi: string } | undefined,
): Temuan[] {
  if (dokumen === undefined) return [];

  const barisAsli = dokumen.isi.split("\n");
  const barisBersih = bersihkanFence(barisAsli);
  const mulaiIdx = barisBersih.findIndex((b) => b.trim() === TABEL_PENEGAK_MULAI);
  const selesaiIdx = barisBersih.findIndex((b) => b.trim() === TABEL_PENEGAK_SELESAI);
  if (mulaiIdx === -1 || selesaiIdx === -1 || selesaiIdx <= mulaiIdx) {
    return [
      {
        berkas: dokumen.berkas,
        baris: 0,
        pesan: `tidak memuat marker "${TABEL_PENEGAK_MULAI}" / "${TABEL_PENEGAK_SELESAI}" di sekeliling tabel penegak (di luar blok ber-fence) — rules-lint tidak bisa memverifikasi tabel ini basi atau tidak.`,
      },
    ];
  }

  const temuan: Temuan[] = [];
  const barisMarker = mulaiIdx + 1;
  const blok = barisAsli.slice(mulaiIdx + 1, selesaiIdx).join("\n");
  const { baris: aktual, duplikat, sampah } = analisaBlokTabel(blok);
  const ekspektasi = bangkitkanBarisTabelPenegak(rules);
  const aktualMap = new Map(aktual.map((b) => [b.id, b]));

  for (const id of duplikat) {
    temuan.push({
      berkas: dokumen.berkas,
      baris: barisMarker,
      pesan: `tabel penegak punya baris duplikat untuk ${id} — hapus salah satu.`,
    });
  }
  for (const teks of sampah) {
    temuan.push({
      berkas: dokumen.berkas,
      baris: barisMarker,
      pesan: `baris tak dikenal di blok tabel penegak: "${teks}" — tiap baris (selain header/pemisah) wajib berbentuk "| [[ID]] | judul | penegak |".`,
    });
  }

  for (const e of ekspektasi) {
    const a = aktualMap.get(e.id);
    if (a === undefined) {
      temuan.push({
        berkas: dokumen.berkas,
        baris: barisMarker,
        pesan: `tabel penegak tidak punya baris untuk ${e.id} — tambahkan "${renderBarisTabelPenegak(e)}".`,
      });
    } else if (a.judul !== e.judul || a.penegak !== e.penegak) {
      temuan.push({
        berkas: dokumen.berkas,
        baris: barisMarker,
        pesan: `baris tabel penegak untuk ${e.id} basi — ekspektasi "${renderBarisTabelPenegak(e)}", aktual "${renderBarisTabelPenegak(a)}".`,
      });
    }
  }

  if (temuan.length === 0 && aktual.length === ekspektasi.length) {
    const urutanAktual = aktual.map((b) => b.id).join(",");
    const urutanEkspektasi = ekspektasi.map((b) => b.id).join(",");
    if (urutanAktual !== urutanEkspektasi) {
      temuan.push({
        berkas: dokumen.berkas,
        baris: barisMarker,
        pesan: `urutan baris tabel penegak tidak cocok dengan urutan pilar naratif (S,C,B,W,T,I,G,O). Ekspektasi: ${urutanEkspektasi}.`,
      });
    }
  }

  return temuan;
}
