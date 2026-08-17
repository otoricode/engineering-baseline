#!/usr/bin/env bash
# Menjalankan alur "tambah endpoint" satu langkah pada satu waktu. Berhenti di langkah
# merah pertama — melanjutkan sesudah gate merah berarti membangun di atas basis yang
# sudah diketahui salah.
#
# Kode keluar tiap langkah `standard` (doctor/gen/scaffold/freeze/gate) mengikuti kontrak paket
# (lihat src/gen/command.ts, jalankanAlat):
#   0 = lulus.
#   1 = pemeriksaannya BERJALAN dan menemukan pelanggaran — perbaiki KONTRAK/kode, lalu ulangi.
#   2 = ALATNYA sendiri gagal (config tak ditemukan, katalog tak terbaca, go/toolchain tak
#       terpasang, build alat gagal) — pemeriksaannya TIDAK berjalan sama sekali. Perbaiki
#       PEMASANGANMU (config, toolchain, path), bukan kontrakmu.
# Driver ini pemanggil PERTAMA yang mengambil keputusan dari pemisahan itu: dua keadaan ini
# menuntut tindakan berbeda dari pembacanya, jadi pesannya WAJIB berbeda juga — bukan cuma
# meneruskan kode keluar mentah tanpa penjelasan.
set -euo pipefail

AKAR=$(CDPATH= cd -- "$(dirname -- "$0")/../.." && pwd -P)
STANDARD="$AKAR/bin/standard"

# Perintah bundel kontrak: milik PROYEK TARGET, bukan alat paket ini. `standard` tidak (dan
# sengaja tidak) membungkusnya — bundling dijalankan alat luar (mis. redocly) lewat skrip proyek,
# persis pola `PERINTAH_BUNDLE` di ci/contract-gate.yml.template dan `OAPI_CONFIG`/`gen-go` di
# tooling/Makefile.template: config codegen-nya milik proyek, bukan `standard.config.json`.
# Override lewat env kalau nama skripnya beda, sama seperti variabel `?=` di Makefile.template.
PERINTAH_BUNDLE="${PERINTAH_BUNDLE:-pnpm run contract:bundle}"

bantuan() {
  cat <<'TEKS'
driver.sh <langkah> [-- opsi standard]

  bundle    bundel kontrak lewat $PERINTAH_BUNDLE (perintah milik proyek); gagal kalau bundel
            ter-commit basi
  wiring    generate peta guard + fungsi pemasangan Mount ke DALAM paket generated
            (standard gen wiring --tag <TAG> --pkg <PKG>; dry-run bawaan, --apply untuk menulis)
  gen       generate cermin DTO dari kontrak (standard gen dto)
  scaffold  bangkitkan kerangka modul (standard gen module; dry-run bawaan, tambahkan --apply
            untuk menulis)
  freeze    tandai modul selesai dikawinkan tangan (standard freeze)
  gate      jalankan seluruh gate (standard gate)
  semua     bundle -> wiring -> scaffold -> gen -> gate  (freeze TIDAK ikut: ia keputusan manusia)

Generate kode SERVER (go tool oapi-codegen, per tag) dan menulis lapisan query tangan bukan
bagian driver ini — lihat SKILL.md.

Kode keluar: 0 lulus. 1 = langkah MERAH, pemeriksaan berjalan dan menemukan pelanggaran (bundel
basi termasuk kelas ini). 2 = ALAT gagal, pemeriksaan tidak berjalan sama sekali.
TEKS
}

# Membungkus SATU pemanggilan `standard`, membaca kode keluarnya, dan mencetak SATU kalimat
# penutup yang berbeda untuk 1 (pelanggaran) vs bukan-0 lain (alat gagal) — lihat header berkas
# ini. `standard` sendiri sudah mencetak rincian (ID aturan, jalur yang hilang, dst) ke
# stdout/stderr sebelum keluar; baris ini menambah penunjuk arah, bukan menggantikan keluaran itu.
jalankan_standard() {
  local nama="$1"
  shift
  set +e
  "$@"
  local kode=$?
  set -e
  case "$kode" in
    0) return 0 ;;
    1)
      echo "[$nama] MERAH: pemeriksaan berjalan dan menemukan pelanggaran. Baca ID aturan di pesan di atas, buka rules/, perbaiki, lalu ulangi." >&2
      exit 1
      ;;
    *)
      echo "[$nama] GAGAL: alatnya sendiri tidak jalan (kode $kode) — pemeriksaan TIDAK berjalan sama sekali. Perbaiki pemasanganmu (config/toolchain/path), bukan kontrakmu." >&2
      exit "$kode"
      ;;
  esac
}

# Langkah "bundle" BUKAN pemanggilan `standard` (lihat komentar PERINTAH_BUNDLE di atas), jadi
# kode keluarnya diberi makna sendiri di sini, bukan lewat `jalankan_standard`: 2 kalau perintah
# bundel proyeknya sendiri gagal dijalankan (alat gagal), 1 kalau ia jalan tapi hasilnya beda dari
# yang ter-commit (bundel basi — pelanggaran, sama maknanya dengan gate:generated-sync/[[B-03]]).
#
# Fix round 1, Important 1: `git diff --exit-code` sendiri bisa GAGAL JALAN (bukan direktori git,
# git tak terpasang, index rusak — kode 129/127/128, dst), dan itu bukan "bundel basi", itu ALAT
# yang tidak jalan. Draf sebelumnya menyamakan "git diff --exit-code apa pun selain 0" dengan
# MERAH, jadi git yang gagal jalan ikut dilaporkan sebagai bundel basi dengan saran "commit ulang"
# — persis konflasi 1-vs-2 yang driver ini ada untuk mencegah, terjadi di langkah yang justru
# mengimplementasikannya dengan tangan. Kode keluar `git`-nya sendiri DITANGKAP dan dicabangkan:
# HANYA 1 (diff ditemukan) berarti bundel basi; selainnya berarti git-nya sendiri gagal.
jalankan_bundle() {
  if ! $PERINTAH_BUNDLE; then
    echo "[bundle] GAGAL: PERINTAH_BUNDLE ('$PERINTAH_BUNDLE') tidak jalan — pemeriksaan TIDAK berjalan sama sekali. Perbaiki perintah bundel proyekmu, atau set env PERINTAH_BUNDLE ke yang benar." >&2
    exit 2
  fi
  set +e
  git diff --exit-code >/dev/null
  local kode=$?
  set -e
  case "$kode" in
    0) return 0 ;;
    1)
      echo "[bundle] MERAH: bundel ter-commit BASI — regenerasi menghasilkan diff. Commit ulang bundelnya sebelum melanjutkan." >&2
      git diff --stat >&2 || true
      exit 1
      ;;
    *)
      echo "[bundle] GAGAL: 'git diff' sendiri tidak jalan (kode $kode) — bukan bandingan yang ketemu selisih, tapi git yang gagal (bukan direktori git, git tak terpasang, index rusak). Perbaiki pemasanganmu, bukan kontrakmu." >&2
      exit 2
      ;;
  esac
}

case "${1:-}" in
  --help|-h|"") bantuan; [ -z "${1:-}" ] && exit 2 || exit 0 ;;
  bundle)   jalankan_bundle ;;
  wiring)   jalankan_standard wiring "$STANDARD" gen wiring "${@:2}" ;;
  gen)      jalankan_standard gen "$STANDARD" gen dto "${@:2}" ;;
  scaffold) jalankan_standard scaffold "$STANDARD" gen module "${@:2}" ;;
  freeze)   jalankan_standard freeze "$STANDARD" freeze "${@:2}" ;;
  gate)     jalankan_standard gate "$STANDARD" gate ;;
  semua)
    # "gen dto" dan "gen module"/"gen wiring" menerima himpunan bendera yang BERBEDA (lihat
    # BENDERA_DTO vs BENDERA_MODULE/BENDERA_WIRING di src/gen/command.ts) — meneruskan "${@:2}"
    # (yang berisi --tag/--pkg untuk "gen module"/"gen wiring") apa adanya ke "gen dto" akan
    # ditolak sebagai bendera tak dikenal. Hanya --apply yang berlaku untuk KETIGANYA, jadi hanya
    # itu yang diteruskan ke "gen dto". "gen module" dan "gen wiring" menerima bendera yang SAMA
    # (--tag/--pkg/--apply), jadi "${@:2}" apa adanya cocok untuk keduanya.
    APPLY=()
    for a in "${@:2}"; do
      [ "$a" = "--apply" ] && APPLY=(--apply)
    done
    jalankan_standard doctor "$STANDARD" doctor
    jalankan_bundle
    # wiring SEBELUM scaffold — ia menulis KE DALAM paket generated (Mount, peta guard), jadi
    # secara konseptual ia bagian dari "siapkan paket generated" bersama gen-go (3a), bukan
    # bagian dari "bangkitkan kerangka modul feature" (3c). Task 13 fix round 4 (`impl-t13`):
    # ditemukan nol kemunculan "gen wiring" di seluruh skills/ sebelum ini — subperintahnya ADA
    # (`standard gen wiring`) dan targetnya ADA (`tooling/Makefile.template:102-106`), tapi
    # tidak pernah masuk urutan resmi. Register.gen.go SUDAH memanggil `<pkg>gen.Mount(...)`
    # sejak fix round 3 — tanpa langkah ini, panggilan itu menunjuk fungsi yang tidak pernah ada.
    jalankan_standard wiring "$STANDARD" gen wiring "${@:2}"
    # scaffold SEBELUM "gen dto", dan urutan ini terbalik dari draf sebelumnya — bukan selera.
    # "gen dto" memetakan tag -> paket generated ke DIREKTORI FITUR lewat buku besar modul, lalu
    # menuntut direktori fitur itu SUDAH ADA begitu paket generated-nya ada. Untuk tag BARU,
    # satu-satunya yang membuat direktori fitur itu ada adalah scaffold ("gen module") — jadi
    # menjalankan "gen dto" dulu, atas tag yang direktori fiturnya belum ada, keluar 2
    # (gendto.ledger_fitur_hilang: ALAT gagal, bukan pelanggaran), dan `driver.sh semua` patah
    # untuk SETIAP tag baru. Diukur, Task 13 fix round 3 (`impl-t13`) — lihat SKILL.md bagian
    # "3c sebelum 3d" untuk detail pengukurannya.
    jalankan_standard scaffold "$STANDARD" gen module "${@:2}"
    jalankan_standard gen "$STANDARD" gen dto "${APPLY[@]}"
    jalankan_standard gate "$STANDARD" gate
    ;;
  *) echo "langkah tak dikenal: $1" >&2; bantuan >&2; exit 2 ;;
esac
