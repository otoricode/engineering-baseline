/**
 * Bandingkan `paths` dua bundel ter-dereference dan buktikan sebuah refaktor kontrak TIDAK
 * mengubah makna.
 *
 * Pemakaian: `verify-deref-equal <sebelum.json> <sesudah.json>`
 *
 * Dipakai saat mengangkat skema jadi komponen bersama, memecah operasi berbadan union, atau
 * penyapuan mekanis lain atas kontrak: pertanyaannya bukan "apakah berkasnya berubah" (pasti) tapi
 * "apakah yang DIJANJIKAN ke klien berubah". `components` sengaja diabaikan — pengangkatan skema
 * memang MENAMBAH komponen bernama di sana. Yang harus identik adalah `paths`.
 *
 * Beda yang HANYA urutan nilai enum dilaporkan terpisah dan tidak menggagalkan: himpunan nilainya
 * sama, jadi tidak ada janji yang berubah.
 */
import { readFileSync } from "node:fs";
import { muatKonteks } from "./konteks.js";

const BATAS = 40;

const { t } = await muatKonteks();

const [berkasA, berkasB] = process.argv.slice(2);
if (!berkasA || !berkasB) {
  console.error(t("kontrak.deref.pemakaian"));
  process.exit(1);
}

const a = JSON.parse(readFileSync(berkasA, "utf8")) as { paths?: unknown };
const b = JSON.parse(readFileSync(berkasB, "utf8")) as { paths?: unknown };

const beda: string[] = [];
const urutanEnum: string[] = [];

function telusuri(x: unknown, y: unknown, path: string, kunci?: string): void {
  if (beda.length > BATAS) return;
  if (x === y) return;
  if (kunci === "enum" && Array.isArray(x) && Array.isArray(y)) {
    const sx = [...x].map(String).sort();
    const sy = [...y].map(String).sort();
    if (JSON.stringify(sx) === JSON.stringify(sy)) {
      if (JSON.stringify(x) !== JSON.stringify(y)) urutanEnum.push(path);
      return;
    }
  }
  const xo = typeof x === "object" && x !== null;
  const yo = typeof y === "object" && y !== null;
  if (!xo || !yo) {
    if (x !== y) beda.push(`${path}: ${JSON.stringify(x)} -> ${JSON.stringify(y)}`);
    return;
  }
  if (Array.isArray(x) !== Array.isArray(y)) return void beda.push(`${path}: bentuk larik berbeda`);
  if (Array.isArray(x) && Array.isArray(y)) {
    if (x.length !== y.length) return void beda.push(`${path}: panjang ${x.length} -> ${y.length}`);
    x.forEach((v, i) => telusuri(v, y[i], `${path}[${i}]`));
    return;
  }
  const xk = Object.keys(x).sort();
  const yk = Object.keys(y).sort();
  const hilang = xk.filter((k) => !yk.includes(k));
  const baru = yk.filter((k) => !xk.includes(k));
  if (hilang.length) beda.push(`${path}: kunci hilang [${hilang.join(", ")}]`);
  if (baru.length) beda.push(`${path}: kunci baru [${baru.join(", ")}]`);
  for (const k of xk) {
    if (yk.includes(k)) telusuri((x as never)[k], (y as never)[k], `${path}/${k}`, k);
  }
}

telusuri(a.paths, b.paths, "paths");

if (beda.length === 0) {
  console.log(
    urutanEnum.length === 0
      ? t("kontrak.deref.identik")
      : t("kontrak.deref.identik_urutan_enum", { jumlah: String(urutanEnum.length) }),
  );
  for (const p of urutanEnum.slice(0, 5)) console.log(`  ${p}`);
} else {
  console.log(t("kontrak.deref.beda", { jumlah: `${beda.length}${beda.length > BATAS ? "+" : ""}` }));
  for (const d of beda) console.log(`  ${d}`);
  process.exit(1);
}
