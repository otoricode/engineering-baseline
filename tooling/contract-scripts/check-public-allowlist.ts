/**
 * # Gate yang dimainkan berkas ini
 *
 * - **`gate:contract-permissions`** — operasi publik dinyatakan di kontrak DAN terdaftar di buku
 *   besar, dua arah ([[C-03]] butir 1); plus penjaga semesta-kosong atas buku besar itu ([[G-05]]).
 *
 * Satu berkas boleh memainkan lebih dari satu gate, dan tiap gate yang ia mainkan disebutkan di
 * blok ini. Alasannya prosedural: [[G-01]] menyuruh pembaca meng-grep SUMBER GATE untuk ID
 * aturannya, jadi nama gate yang tak pernah muncul di sumber mana pun membuat prosedur itu
 * memulangkan nol hasil — dan nol hasil dibaca sebagai "aturannya tak bertuan", padahal
 * penegaknya ada.
 *
 * Himpunan operasi ber-`security: []` HARUS sama persis dengan buku besar operasi publik.
 *
 * Dua arah, keduanya penting ([[C-03]] butir 1, mekanismenya [[G-05]]):
 *   - publik tapi tidak terdaftar -> endpoint terbuka yang lolos tanpa ditinjau;
 *   - terdaftar tapi tidak publik -> buku besar basi, dan buku besar basi adalah buku besar yang
 *     berhenti dipercaya orang.
 *
 * Arah ketiga yang gampang terlupa dan justru paling merusak: SEMESTA KOSONG. Buku besar yang
 * tidak menghasilkan satu operationId pun sementara kontrak memuat operasi publik berarti
 * berkasnya hilang, kuncinya salah tulis, atau isinya terpotong — dan tanpa pemeriksaan itu gate
 * tetap "berjalan", lalu melaporkan setiap operasi satu per satu: puluhan baris galat yang
 * mengubur satu diagnosis sesungguhnya ([[G-05]]).
 */
import { readFileSync } from "node:fs";
import { parse } from "yaml";
import { muatKonteks } from "./konteks.js";

const METODE = ["get", "post", "put", "delete", "patch"] as const;

const { jalur, t, aturan } = await muatKonteks();

const bundle = jalur.bundle();
const daftarPublik = jalur.shared("publicOps");

const doc = parse(readFileSync(bundle, "utf8")) as {
  paths?: Record<string, Record<string, { security?: unknown[]; operationId?: string }>>;
};
const daftar = parse(readFileSync(daftarPublik, "utf8")) as { publicOperations?: string[] };
const diizinkan = new Set(daftar.publicOperations ?? []);

const publik = new Set<string>();
for (const item of Object.values(doc.paths ?? {})) {
  for (const m of METODE) {
    const op = item?.[m];
    if (op && Array.isArray(op.security) && op.security.length === 0 && op.operationId) {
      publik.add(op.operationId);
    }
  }
}

if (diizinkan.size === 0 && publik.size > 0) {
  console.error(
    `${aturan.label("gate", "05")} ${t("kontrak.publik.buku_besar_kosong", {
      berkas: daftarPublik,
      jumlah: String(publik.size),
    })}`,
  );
  console.error(aturan.footer("gate", "05"));
  process.exit(1);
}

const temuan: string[] = [];
for (const id of publik) {
  if (!diizinkan.has(id)) {
    temuan.push(
      `${aturan.label("contract", "03")} ${t("kontrak.publik.tak_terdaftar", { operationId: id, berkas: daftarPublik })}`,
    );
  }
}
for (const id of diizinkan) {
  if (!publik.has(id)) {
    temuan.push(
      `${aturan.label("contract", "03")} ${t("kontrak.publik.entri_basi", { operationId: id, berkas: daftarPublik })}`,
    );
  }
}

if (temuan.length) {
  for (const e of temuan) console.error(`  ${e}`);
  console.error(aturan.footer("contract", "03"));
  process.exit(1);
}
console.log(t("kontrak.publik.ok", { jumlah: String(publik.size) }));
