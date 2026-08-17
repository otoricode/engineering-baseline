/**
 * Banner "berkas ini hasil generate" plus pembungkus komentar per bahasa.
 *
 * ## Satu-satunya string di direktori ini yang SENGAJA tidak dwibahasa
 *
 * Baris `// Code generated ... DO NOT EDIT.` bukan kalimat untuk manusia — ia PENANDA YANG DIBACA
 * MESIN. Toolchain Go mengenalinya lewat pola tetap (`^// Code generated .* DO NOT EDIT\.$`) dan
 * memakainya untuk mengecualikan berkas dari sejumlah pemeriksaan; menerjemahkannya membuat
 * penanda itu berhenti cocok, diam-diam, di setiap proyek yang memilih bahasa lain. Jadi barisnya
 * ditulis literal di sini, dan penjelasan untuk manusianya — baris di bawahnya — datang dari
 * katalog seperti string lain.
 *
 * Sumber banner ditulis RELATIF terhadap akar proyek, bukan absolut: keluaran generator masuk git,
 * dan jalur absolut membuat berkas hasil generate berbeda antar mesin — yang memerahkan gate
 * diff-kosong karena alasan yang tidak ada hubungannya dengan perubahan siapa pun ([[B-03]]).
 */
import path from "node:path";
import type { T } from "../pesan.js";

const PENANDA_MESIN = "Code generated from {sumber}. DO NOT EDIT.";

/** Isi banner (belum dibungkus komentar): penanda mesin + satu baris penjelasan dari katalog. */
export function bannerGenerated(sumberAbsolut: string, akar: string, t: T): string {
  const rel = path.relative(akar, sumberAbsolut).split(path.sep).join("/");
  return `${PENANDA_MESIN.replace("{sumber}", rel)}\n\n${t("kontrak.komentar.banner", { sumber: rel })}`;
}

/** Bungkus teks multi-baris jadi komentar `//` gaya Go. Baris kosong tetap `//` tanpa spasi ekor. */
export function komentarGo(teks: string): string {
  return teks
    .split("\n")
    .map((baris) => (baris === "" ? "//" : `// ${baris}`))
    .join("\n");
}

/** Bungkus teks multi-baris jadi komentar blok gaya TypeScript. */
export function komentarTs(teks: string): string {
  const isi = teks
    .split("\n")
    .map((baris) => (baris === "" ? " *" : ` * ${baris}`))
    .join("\n");
  return `/**\n${isi}\n */`;
}
