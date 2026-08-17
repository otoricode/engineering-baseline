/**
 * Bentuk union (`anyOf`/`oneOf`) DI BAWAH badan permintaan, dicari di bundel kontrak.
 *
 * Pemeriksaan ini terpisah dari skripnya supaya bisa diuji atas objek literal — tanpa bundel, tanpa
 * disk, tanpa config — dan supaya pesannya tidak bercampur dengan pencariannya: fungsi ini
 * memulangkan TEMUAN BERSTRUKTUR, skripnya yang merendernya lewat katalog.
 *
 * # Kenapa seluruh pohon, bukan cuma bentuk teratas
 *
 * Aturannya melarang badan permintaan yang bentuknya BERCABANG, bukan cuma yang cabangnya ada di
 * simpul akar. Union yang bersembunyi satu tingkat di dalam (`properties.x.oneOf`) memancarkan
 * kelas tipe yang sama persis di generator, dan justru lebih sulit dilihat pembaca kontrak.
 *
 * # Yang TIDAK ditelusuri, dan kenapa
 *
 * `example`, `examples`, `default`, dan `enum` memuat DATA, bukan skema. Data pengguna boleh punya
 * properti bernama `oneOf`, dan menelusurinya akan memerahkan kontrak yang benar — gate yang
 * memerah pada masukan yang benar akan dibuang orang, lalu merah berikutnya diabaikan juga.
 *
 * Skema REKURSIF (pohon menu, hierarki wilayah) itu SAH dan lazim: kunjungan kedua ke nama skema
 * yang sama berhenti tanpa temuan, bukan melempar.
 */
export type Simpul = Record<string, any>;

export type Bundel = {
  paths?: Record<string, Record<string, unknown>>;
  components?: {
    schemas?: Record<string, unknown>;
    requestBodies?: Record<string, unknown>;
  };
};

export type TemuanUnion =
  | { jenis: "union"; operasi: string; media: string; lokasi: string; kata: "anyOf" | "oneOf" }
  | { jenis: "ref"; operasi: string; media: string; lokasi: string; sebab: string };

export type HasilUnion = {
  temuan: TemuanUnion[];
  /** Operasi yang dipindai — semesta gate ini. */
  operasi: number;
  /** Badan permintaan yang benar-benar dibaca; NOL adalah kabar yang wajib disebut, bukan hijau. */
  badan: number;
};

const KATA_UNION = ["anyOf", "oneOf"] as const;
/** Kunci yang isinya DATA contoh, bukan skema — lihat catatan di atas. */
const BUKAN_SKEMA = new Set(["example", "examples", "default", "enum"]);

class GalatRef extends Error {}

function ikutiRef(node: any, ruang: "schemas" | "requestBodies", bundel: Bundel): any {
  const dilihat = new Set<string>();
  while (node !== null && typeof node === "object" && typeof node.$ref === "string") {
    const cocok = new RegExp(`^#/components/${ruang}/(.+)$`).exec(node.$ref);
    if (cocok === null) throw new GalatRef(`$ref di luar #/components/${ruang}: ${node.$ref}`);
    const nama = cocok[1]!;
    if (dilihat.has(nama)) throw new GalatRef(`$ref melingkar: ${node.$ref}`);
    dilihat.add(nama);
    const tujuan = (bundel.components?.[ruang] ?? {})[nama];
    if (tujuan === undefined) throw new GalatRef(`$ref menggantung: ${node.$ref}`);
    node = tujuan;
  }
  return node;
}

function telusuri(
  node: any,
  bundel: Bundel,
  lokasi: string,
  sedangDikunjungi: ReadonlySet<string>,
  keluar: { lokasi: string; kata: "anyOf" | "oneOf" }[],
): void {
  if (node === null || typeof node !== "object") return;

  if (typeof node.$ref === "string") {
    const cocok = /^#\/components\/schemas\/(.+)$/.exec(node.$ref);
    if (cocok === null) throw new GalatRef(`skema memakai $ref di luar #/components/schemas: ${node.$ref}`);
    const nama = cocok[1]!;
    if (sedangDikunjungi.has(nama)) return;
    const tujuan = bundel.components?.schemas?.[nama];
    if (tujuan === undefined) throw new GalatRef(`$ref skema menggantung: ${node.$ref}`);
    telusuri(tujuan, bundel, lokasi, new Set([...sedangDikunjungi, nama]), keluar);
    return;
  }

  if (Array.isArray(node)) {
    node.forEach((n, i) => telusuri(n, bundel, `${lokasi}/${i}`, sedangDikunjungi, keluar));
    return;
  }

  for (const [kunci, nilai] of Object.entries(node)) {
    if (BUKAN_SKEMA.has(kunci)) continue;
    if ((KATA_UNION as readonly string[]).includes(kunci) && Array.isArray(nilai)) {
      keluar.push({ lokasi: `${lokasi}/${kunci}`, kata: kunci as "anyOf" | "oneOf" });
    }
    telusuri(nilai, bundel, `${lokasi}/${kunci}`, sedangDikunjungi, keluar);
  }
}

export function periksaBadanUnion(bundel: Bundel, metode: readonly string[]): HasilUnion {
  const temuan: TemuanUnion[] = [];
  let operasi = 0;
  let badan = 0;

  for (const [urlPath, ops] of Object.entries(bundel.paths ?? {})) {
    for (const [method, opMentah] of Object.entries(ops as Record<string, unknown>)) {
      if (!metode.includes(method)) continue;
      operasi += 1;
      const op = opMentah as Simpul;
      const kunciOperasi = `${method.toUpperCase()} ${urlPath}`;
      if (op["requestBody"] === undefined) continue;

      let rb: any;
      try {
        rb = ikutiRef(op["requestBody"], "requestBodies", bundel);
      } catch (e) {
        if (!(e instanceof GalatRef)) throw e;
        temuan.push({ jenis: "ref", operasi: kunciOperasi, media: "-", lokasi: "requestBody", sebab: e.message });
        continue;
      }

      for (const [media, isi] of Object.entries((rb?.content ?? {}) as Record<string, any>)) {
        const skema = (isi as Simpul)?.["schema"];
        if (skema === undefined) continue;
        badan += 1;
        const keluar: { lokasi: string; kata: "anyOf" | "oneOf" }[] = [];
        try {
          telusuri(skema, bundel, "#", new Set(), keluar);
        } catch (e) {
          if (!(e instanceof GalatRef)) throw e;
          temuan.push({ jenis: "ref", operasi: kunciOperasi, media, lokasi: "#", sebab: e.message });
          continue;
        }
        for (const k of keluar) {
          temuan.push({ jenis: "union", operasi: kunciOperasi, media, lokasi: k.lokasi, kata: k.kata });
        }
      }
    }
  }

  return { temuan, operasi, badan };
}
