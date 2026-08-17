/**
 * Router berbasis pohon-radix **panic** kalau dua nama parameter berbeda menempati posisi path
 * yang sama di bawah prefix statis yang sama, dalam pohon rute METODE yang sama (satu pohon per
 * metode: GET dan POST tidak saling bentrok). Kontrak OpenAPI tidak punya batasan itu — tiap path
 * item berdiri sendiri — jadi kontrak bisa melahirkan sesuatu yang mustahil dijalankan router
 * sungguhan. Sudah terjadi: `/keluarga/{id}`, `/keluarga/{keluargaId}/...`, dan
 * `/keluarga/{targetKeluargaId}/merge` hidup berdampingan di satu kontrak.
 *
 * Deteksi: satu trie PER METODE dari segmen path (statis vs `{param}`); di tiap simpul, cabang
 * parameter cuma boleh dituju SATU nama. Ini menormalkan "posisi" sebagai prefix statis menuju ke
 * sana — persis kendala router-nya — bukan sekadar "path berbentuk sama", karena dua path yang
 * divergen SESUDAH parameter (`/keluarga/{x}/split` vs `/keluarga/{y}/merge`) tetap berbagi
 * simpul parameter yang sama.
 *
 * Ini penegak [[C-06]], dan aturan itu lahir DARI gate ini. Selama gate-nya sudah memancar
 * sementara aturannya belum ditulis, pesannya tidak punya ID yang benar untuk disitir — keadaan
 * yang [[G-04]] larang, karena gate yang memancar tanpa menyitir aturan menyuruh orang menebak.
 * Pilihannya hanya dua: aturannya ada, atau gate-nya tidak boleh memancar. Gate yang SUDAH
 * bekerja adalah alasan terkuat yang mungkin bagi sebuah aturan untuk ada.
 */
import type { T } from "../pesan.js";

type ParamBranch = {
  node: TrieNode;
  /** nama parameter -> satu contoh "METODE /path" yang memakainya di posisi ini */
  examples: Map<string, string>;
};

type TrieNode = {
  static: Map<string, TrieNode>;
  param?: ParamBranch;
};

function newNode(): TrieNode {
  return { static: new Map() };
}

const PARAM_SEGMENT_RE = /^\{([^}]+)\}$/;

/**
 * `bundle.paths` -> daftar pesan galat, satu per posisi yang bertabrakan. Kosong = tidak ada
 * tabrakan. `methods` menyaring kunci metode HTTP dari tiap path item (dokumen OpenAPI juga punya
 * kunci lain di level itu, mis. `parameters`, `summary`).
 */
export function checkParamPositionCollisions(
  paths: Record<string, Record<string, unknown>>,
  methods: readonly string[],
  t: T,
  sitir: string,
): string[] {
  const roots = new Map<string, TrieNode>(); // per metode HTTP

  for (const [urlPath, ops] of Object.entries(paths ?? {})) {
    for (const method of Object.keys(ops)) {
      if (!methods.includes(method)) continue;
      let node = roots.get(method);
      if (!node) {
        node = newNode();
        roots.set(method, node);
      }

      const key = `${method.toUpperCase()} ${urlPath}`;
      const segments = urlPath.split("/").filter((s) => s.length > 0);
      for (const seg of segments) {
        const paramMatch = PARAM_SEGMENT_RE.exec(seg);
        if (paramMatch) {
          const name = paramMatch[1]!;
          if (!node.param) node.param = { node: newNode(), examples: new Map() };
          if (!node.param.examples.has(name)) node.param.examples.set(name, key);
          node = node.param.node;
        } else {
          let child = node.static.get(seg);
          if (!child) {
            child = newNode();
            node.static.set(seg, child);
          }
          node = child;
        }
      }
    }
  }

  const errors: string[] = [];
  for (const [method, root] of roots) walk(root, method.toUpperCase(), errors, t, sitir);
  return errors;
}

function walk(node: TrieNode, positionLabel: string, errors: string[], t: T, sitir: string): void {
  if (node.param && node.param.examples.size > 1) {
    // SELURUH nama yang bertabrakan disebut, bukan cuma dua yang pertama: tabrakan tiga-arah yang
    // dilaporkan sebagai dua-arah menuntut dua putaran perbaikan, dan putaran kedua terlihat
    // seperti regresi dari perbaikan pertama.
    const parts = [...node.param.examples.entries()].map(([name, example]) => `"${name}" (${example})`);
    errors.push(`${sitir} ${t("kontrak.rute.tabrakan_posisi_param", { posisi: positionLabel, nama: parts.join(" vs ") })}`);
  }
  for (const [seg, child] of node.static) walk(child, `${positionLabel}/${seg}`, errors, t, sitir);
  if (node.param) walk(node.param.node, `${positionLabel}/{...}`, errors, t, sitir);
}
