package cfg

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"regexp"
	"sort"
	"strings"
)

// Katalog adalah katalog pesan datar yang sama persis dengan yang dibaca sisi TypeScript:
// Record<string,string> dengan templat `{nama}`. Dibaca langsung, bukan lewat Node — alat Go
// tidak boleh menuntut runtime JavaScript untuk bisa mencetak satu kalimat.
type Katalog map[string]string

const (
	// dirNamaPesan dan dirNamaPaket adalah letak katalog DI DALAM paket standar ini sendiri,
	// bukan layout proyek target. Tidak ada kunci config untuk keduanya: kalau ada, sebuah
	// proyek bisa mengarahkannya ke tempat lain lalu alat ini kehilangan katalognya sendiri.
	dirNamaPesan = "messages"
	dirNamaPaket = "tooling"

	// BootstrapKatalog adalah SATU-SATUNYA teks menghadap-pengguna di alat-alat ini yang tidak
	// datang dari katalog — ia melaporkan bahwa katalognya sendiri tak terpakai, jadi ia tak
	// bisa bersumber dari sana. Ditulis dwibahasa supaya tidak ada proyek yang menerima
	// kegagalan bootstrap dalam bahasa yang tidak ia pilih.
	BootstrapKatalog = "katalog pesan tidak bisa dipakai: %[1]v\nthe message catalogue is unusable: %[1]v"
)

// CariDirPesan menaiki direktori dari mulaiDari dan mengembalikan direktori katalog pertama
// yang benar-benar memuat <bahasa>.json. Dua kandidat per tingkat karena alat ini dijalankan
// dari tiga tempat: direktori paketnya sendiri (uji), direktori tooling (pembungkus CLI), dan
// akar proyek (pemanggilan tangan).
//
// Batasnya, dan ia sengaja tidak ditutup di sini: dari akar PROYEK TARGET tak satu pun kandidat
// pernah ada. Jalur yang didukung adalah pembungkus `standard gen ...` yang menjalankan alat
// dengan cwd di dalam `tooling/`; pemanggil lain wajib mengoper `-messages`.
func CariDirPesan(mulaiDari, bahasa string) (string, error) {
	dir, err := filepath.Abs(mulaiDari)
	if err != nil {
		return "", err
	}
	for {
		for _, kandidat := range []string{
			filepath.Join(dir, dirNamaPesan),
			filepath.Join(dir, dirNamaPaket, dirNamaPesan),
		} {
			if _, err := os.Stat(filepath.Join(kandidat, bahasa+".json")); err == nil {
				return kandidat, nil
			}
		}
		naik := filepath.Dir(dir)
		if naik == dir {
			return "", fmt.Errorf("%s/%s.json tidak ditemukan dari %s sampai akar / not found from %s up to the root",
				dirNamaPesan, bahasa, mulaiDari, mulaiDari)
		}
		dir = naik
	}
}

// MuatKatalog menolak bentuk yang bukan objek datar bernilai string — pemeriksaan yang sama
// dengan validasiPesan di sisi TypeScript. Diulang di sini dengan sengaja: pemeriksaan yang
// hanya hidup di sisi TypeScript tidak ikut berjalan saat proyek target memanggil biner Go.
func MuatKatalog(dirPesan, bahasa string) (Katalog, error) {
	jalur := filepath.Join(dirPesan, bahasa+".json")
	mentah, err := os.ReadFile(jalur)
	if err != nil {
		return nil, err
	}
	var kasar map[string]any
	if err := json.Unmarshal(mentah, &kasar); err != nil {
		return nil, fmt.Errorf("%s: %w", jalur, err)
	}
	k := Katalog{}
	for nama, nilai := range kasar {
		s, ok := nilai.(string)
		if !ok {
			return nil, fmt.Errorf("%s: kunci %q bernilai bukan string / value is not a string", jalur, nama)
		}
		k[nama] = s
	}
	return k, nil
}

// MuatKatalogUntuk memakai direktori dari bendera -messages bila diberi, kalau tidak mencarinya
// naik dari direktori kerja.
func MuatKatalogUntuk(dirBendera, bahasa string) (Katalog, error) {
	dir := dirBendera
	if dir == "" {
		wd, err := os.Getwd()
		if err != nil {
			return nil, err
		}
		dir, err = CariDirPesan(wd, bahasa)
		if err != nil {
			return nil, err
		}
	}
	return MuatKatalog(dir, bahasa)
}

var varPesan = regexp.MustCompile(`\{(\w+)\}`)

// T merender satu pesan. Kunci tak dikenal mengembalikan penanda yang terbaca, bukan string
// kosong: pesan yang hilang harus TERLIHAT di keluaran, bukan menguap. Yang menjaga agar itu
// tak pernah terjadi di jalur normal adalah Lengkap(), dipanggil sebelum kerja apa pun dimulai.
func (k Katalog) T(kunci string, vars map[string]string) string {
	templat, ok := k[kunci]
	if !ok {
		return "[" + kunci + "]"
	}
	return varPesan.ReplaceAllStringFunc(templat, func(utuh string) string {
		if v, ada := vars[utuh[1:len(utuh)-1]]; ada {
			return v
		}
		return utuh
	})
}

// Lengkap menuntut seluruh kunci yang akan dipakai alat ini benar-benar ada. Uji paritas di
// sisi TypeScript hanya membuktikan id.json dan en.json PUNYA kunci yang sama — ia tidak tahu
// kunci mana yang dipakai alat Go, jadi kunci yang lupa ditambahkan di KEDUA berkas lolos dari
// sana. Pemeriksaan ini berjalan di jalur yang dipakai proyek target, bukan hanya di uji.
func (k Katalog) Lengkap(kunci []string) error {
	var hilang []string
	for _, n := range kunci {
		if _, ok := k[n]; !ok {
			hilang = append(hilang, n)
		}
	}
	if len(hilang) == 0 {
		return nil
	}
	sort.Strings(hilang)
	return fmt.Errorf("kunci hilang / missing keys: %s", strings.Join(hilang, ", "))
}

// KomentarBlok mengubah prosa katalog menjadi blok komentar Go. Prosanya datang dari katalog
// justru karena ia ditulis KE DALAM kode proyek target: komentar berbahasa Indonesia yang
// mendarat di proyek berbahasa Inggris adalah cacat portabilitas, bukan sekadar selera.
//
// Di sini, bukan di tiap alat, karena kedua generator menulis komentar ke dalam berkas yang
// duduk di paket yang sama — dua ejaan blok komentar akan terlihat di berkas bersebelahan.
func KomentarBlok(teks string) string {
	var b strings.Builder
	for _, baris := range strings.Split(strings.TrimRight(teks, "\n"), "\n") {
		if baris == "" {
			b.WriteString("//\n")
			continue
		}
		b.WriteString("// " + baris + "\n")
	}
	return b.String()
}
