/**
 * Ambil respons NYATA dari sebuah lingkungan berjalan, untuk divalidasi `validate-samples.ts`.
 *
 * Pemakaian: `fetch-samples --base <URL> [--daftar <berkas>] [--cookie <nilai>] [--apply]`
 *
 * Di proyek asal ini skrip bash dengan URL staging dan sebelas endpoint yang dipaku di dalamnya.
 * Ditulis ulang sebagai TypeScript bukan demi selera: jalur berkasnya harus datang dari
 * `paths.ts`, dan skrip bash tidak bisa memanggilnya — jadi jalur yang dipaku itu tidak akan
 * pernah hilang selama ia bash.
 *
 * Daftar endpoint hidup di BERKAS, bukan di dalam skrip: endpoint mana yang layak direkam adalah
 * keputusan proyek, dan keputusan proyek yang ditulis di dalam alat adalah keputusan yang tidak
 * bisa diubah tanpa mem-fork alatnya.
 */
import { readFileSync, existsSync } from "node:fs";
import { muatKonteks } from "./konteks.js";
import { bacaBendera, BENDERA_APPLY, buatRencana } from "./argumen.js";

const { jalur, t } = await muatKonteks();
const bendera = bacaBendera(
  process.argv.slice(2),
  [
    BENDERA_APPLY,
    { nama: "base", berNilai: true },
    { nama: "daftar", berNilai: true },
    { nama: "cookie", berNilai: true },
  ],
  t,
);

// Tidak ada default untuk `--base`, dan itu disengaja: nilai default apa pun di sini adalah URL
// milik SATU proyek, dan alat yang diam-diam menembak host proyek lain lebih buruk daripada alat
// yang menolak jalan.
const base = bendera.nilai("base") ?? process.env["BASE_URL"];
if (!base) {
  console.error(t("kontrak.sample.base_url_kosong"));
  process.exit(1);
}

const berkasDaftar = bendera.nilai("daftar") ?? jalur.samples("endpoints.txt");
if (!existsSync(berkasDaftar)) {
  console.error(t("kontrak.sample.daftar_hilang", { berkas: berkasDaftar }));
  process.exit(1);
}

// Format daftar: satu `METODE /path` per baris; baris kosong dan baris berawalan `#` diabaikan.
const endpoints = readFileSync(berkasDaftar, "utf8")
  .split("\n")
  .map((b) => b.trim())
  .filter((b) => b !== "" && !b.startsWith("#"));

const cookie = bendera.nilai("cookie") ?? process.env["COOKIE"];
const rencana = buatRencana(bendera.ada("apply"), t, (s) => console.log(s));

for (const baris of endpoints) {
  const spasi = baris.indexOf(" ");
  const metode = (spasi === -1 ? "GET" : baris.slice(0, spasi)).toUpperCase();
  const path = spasi === -1 ? baris : baris.slice(spasi + 1).trim();
  const nama = `${metode} ${path}`.replace(/[/?&=]/g, "_").replace(/ /g, "_") + ".json";

  let res: Response;
  try {
    res = await fetch(`${base}${path}`, {
      method: metode,
      headers: { Accept: "application/json", ...(cookie ? { Cookie: cookie } : {}) },
    });
  } catch (e) {
    console.error(t("kontrak.sample.dilewati", { operasi: nama, sebab: String(e) }));
    continue;
  }
  if (!res.ok) {
    console.error(t("kontrak.sample.dilewati", { operasi: nama, sebab: `HTTP ${res.status}` }));
    continue;
  }
  rencana.tambah(jalur.samples(nama), await res.text());
  console.log(t("kontrak.sample.diambil", { operasi: nama }));
}

rencana.jalankan();
