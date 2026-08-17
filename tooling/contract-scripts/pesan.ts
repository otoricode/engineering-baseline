/**
 * Katalog pesan untuk skrip kontrak, plus daftar kunci yang skrip-skrip ini pakai.
 *
 * Kenapa daftarnya ada di sini dan bukan cuma "panggil `msg()` dengan string apa saja":
 * `msg()` MELEMPAR untuk kunci tak dikenal — bagus, tapi ia melempar saat baris itu dieksekusi,
 * yaitu di tengah run, sesudah separuh keluaran tercetak. Untuk gate, itu berarti kegagalan
 * katalog menyamar jadi kegagalan gate. `KUNCI_KONTRAK` mengubahnya jadi dua penjaga yang
 * berjalan LEBIH DULU:
 *
 *   1. `t()` bertipe union dari daftar ini — kunci salah ketik gagal saat pemeriksaan tipe;
 *   2. `pesan.test.ts` menuntut tiap kunci di daftar ini ADA di `id.json` DAN `en.json`, dan
 *      tiap kunci `kontrak.*` di katalog ada di daftar ini (dua arah, [[G-05]]) — jadi kunci
 *      yang lupa ditambahkan ke salah satu bahasa merah di suite, bukan di CI orang lain.
 *
 * Gate paritas katalog yang sudah ada membandingkan KUNCI antar-bahasa; ia tidak tahu kunci mana
 * yang dipakai siapa, jadi kunci yang lupa ditambahkan ke KEDUA bahasa lolos dari sana. Daftar
 * ini yang menutupnya untuk direktori ini.
 */
import { msg, muatPesan, type Pesan } from "../../src/messages/index.js";

export const KUNCI_KONTRAK = [
  "kontrak.sitiran",
  "kontrak.sitiran_tanpa_prefix",
  "kontrak.footer_aturan",
  "kontrak.dry_run",
  "kontrak.ditulis",
  "kontrak.lewat_keluaran_go",
  "kontrak.bendera_tak_dikenal",
  "kontrak.publik.buku_besar_kosong",
  "kontrak.publik.tak_terdaftar",
  "kontrak.publik.entri_basi",
  "kontrak.publik.ok",
  "kontrak.permission.skema_keamanan_hilang",
  "kontrak.permission.di_luar_katalog",
  "kontrak.permission.tanpa_seed",
  "kontrak.permission.seed_tak_dikonfigurasi",
  "kontrak.permission.pola_nama",
  "kontrak.permission.warisan_asing",
  "kontrak.permission.publik_tapi_berizin",
  "kontrak.permission.respons_hilang",
  "kontrak.permission.respons_404_hilang",
  "kontrak.permission.gagal",
  "kontrak.permission.ok",
  "kontrak.envelope.sukses_bukan_v2",
  "kontrak.envelope.gagal_bukan_v2",
  "kontrak.envelope.gagal_tanpa_json",
  "kontrak.envelope.sukses_pakai_envelope_gagal",
  "kontrak.envelope.gagal_pakai_envelope_sukses",
  "kontrak.envelope.biner_dibungkus",
  "kontrak.envelope.paginasi_di_data",
  "kontrak.envelope.paginasi_tak_terdeklarasi",
  "kontrak.envelope.ref_gagal",
  "kontrak.envelope.opt_in_tak_cocok",
  "kontrak.envelope.belum_diimplementasi_naik",
  "kontrak.envelope.gagal",
  "kontrak.envelope.dipotong",
  "kontrak.envelope.ok_kosong",
  "kontrak.envelope.ok",
  "kontrak.badan.nullable_naik",
  "kontrak.badan.nullable_turun",
  "kontrak.badan.ok",
  "kontrak.rute.entrypoint_tak_dikonfigurasi",
  "kontrak.rute.lewat_backend",
  "kontrak.rute.fitur_tak_diimpor",
  "kontrak.rute.fitur_tak_terpasang",
  "kontrak.rute.tabrakan_posisi_param",
  "kontrak.rute.buku_besar_rusak",
  "kontrak.rute.gagal",
  "kontrak.rute.ok",
  "kontrak.bukubesar.bukan_json",
  "kontrak.bukubesar.bukan_objek",
  "kontrak.bukubesar.bagian_bukan_objek",
  "kontrak.bukubesar.nilai_bukan_direktori",
  "kontrak.bukubesar.belum_opt_in_bukan_array",
  "kontrak.bukubesar.tag_tak_tercatat",
  "kontrak.bukubesar.tag_bukan_opt_in",
  "kontrak.bukubesar.tanpa_register",
  "kontrak.bukubesar.klaim_mount_palsu",
  "kontrak.bukubesar.mount_tak_tercatat",
  "kontrak.bukubesar.belum_opt_in_tanpa_register",
  "kontrak.bukubesar.belum_opt_in_sudah_mount",
  "kontrak.generasi.dua_status",
  "kontrak.generasi.tanpa_kerangka",
  "kontrak.generasi.campuran",
  "kontrak.generasi.klaim_beda",
  "kontrak.generasi.tak_tercatat",
  "kontrak.optin.entri_bukan_string",
  "kontrak.optin.entri_tak_lengkap",
  "kontrak.optin.tags_bukan_array",
  "kontrak.penerap.pemakaian",
  "kontrak.penerap.nol_operasi",
  "kontrak.penerap.ref_tak_dikenal",
  "kontrak.penerap.properti_tak_dikenal",
  "kontrak.penerap.judul_ref_tak_dikenal",
  "kontrak.penerap.judul_properti_tak_dikenal",
  "kontrak.penerap.tidak_menulis",
  "kontrak.penerap.ringkas",
  "kontrak.gen.pemakaian_wiring",
  "kontrak.gen.tag_tanpa_operasi",
  "kontrak.gen.shared_kosong",
  "kontrak.gen.schema_hilang_di_bundel",
  "kontrak.gen.verba_tak_dikenal",
  "kontrak.gen.x_permission_kosong",
  "kontrak.gen.tanpa_operation_id",
  "kontrak.gen.gofmt_tak_stabil",
  "kontrak.gen.ringkas_wiring",
  "kontrak.gen.ringkas_permission",
  "kontrak.gen.ringkas_error_code",
  "kontrak.gen.ringkas_shared",
  "kontrak.komentar.banner",
  "kontrak.komentar.wiring_berkas",
  "kontrak.komentar.spec_by_operation",
  "kontrak.komentar.spec_by_route",
  "kontrak.komentar.public_routes",
  "kontrak.komentar.v2_paths",
  "kontrak.komentar.public_ops",
  "kontrak.komentar.guard_by_operation",
  "kontrak.komentar.content_by_operation",
  "kontrak.komentar.mount",
  "kontrak.komentar.shared_berkas",
  "kontrak.komentar.content_berkas",
  "kontrak.komentar.permission_tipe",
  "kontrak.komentar.permission_semua",
  "kontrak.komentar.permission_parse",
  "kontrak.komentar.error_code_tipe",
  "kontrak.komentar.error_code_semua",
  "kontrak.komentar.error_code_parse",
  "kontrak.komentar.shared_spec_deskripsi",
  "kontrak.komentar.katalog_permission",
  "kontrak.bootstrap.argumen_bukan_literal",
  "kontrak.bootstrap.argumen_tak_seimbang",
  "kontrak.bootstrap.argumen_jumlah",
  "kontrak.bootstrap.ringkas_permission",
  "kontrak.bootstrap.judul_kode",
  "kontrak.bootstrap.judul_domain_telanjang",
  "kontrak.bootstrap.judul_lintas_status",
  "kontrak.bootstrap.judul_hanya_test",
  "kontrak.bootstrap.judul_argumen_tertukar",
  "kontrak.sample.tanpa_operasi",
  "kontrak.sample.lulus",
  "kontrak.sample.gagal",
  "kontrak.sample.ringkas",
  "kontrak.sample.base_url_kosong",
  "kontrak.sample.daftar_hilang",
  "kontrak.sample.diambil",
  "kontrak.sample.dilewati",
  "kontrak.tenancy.dir_tak_ada",
  "kontrak.tenancy.checklist_di_modul_beku",
  "kontrak.tenancy.checklist_di_modul_campuran",
  "kontrak.tenancy.gagal",
  "kontrak.tenancy.ok",
  "kontrak.lint.badan_union",
  "kontrak.lint.ref_gagal",
  "kontrak.lint.gagal",
  "kontrak.lint.ok",
  "kontrak.deref.pemakaian",
  "kontrak.deref.identik",
  "kontrak.deref.identik_urutan_enum",
  "kontrak.deref.beda",
] as const;

export type KunciKontrak = (typeof KUNCI_KONTRAK)[number];

/** Perender pesan berbahasa-config. `vars` diteruskan apa adanya ke `msg`. */
export type T = (kunci: KunciKontrak, vars?: Record<string, string>) => string;

export function buatT(pesan: Pesan): T {
  return (kunci, vars = {}) => msg(pesan, kunci, vars);
}

export async function muatT(bahasa: "id" | "en"): Promise<T> {
  return buatT(await muatPesan(bahasa));
}
