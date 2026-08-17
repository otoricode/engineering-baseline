// Paket cfg memegang apa yang DUA alat Go standar ini pakai bersama: pembacaan
// standard.config.json, penurunan jalur/impor darinya, dan pembaca katalog pesan (pesan.go).
//
// Ia paket bersama sejak alat kedua lahir, bukan sesudah keduanya menyimpang: dua salinan
// pembaca config dan dua salinan pembaca katalog akan menyimpang begitu formatnya berubah, dan
// yang menyimpang diam-diam adalah salinan yang jarang dibaca.
package cfg

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// Config adalah bagian standard.config.json yang dipakai alat Go. Bidang yang tidak
// dipakai sengaja tidak dimodelkan — menambahkannya berarti dua tempat harus berubah
// bersamaan setiap kali skema tumbuh.
type Config struct {
	Layout struct {
		ContractDir string `json:"contractDir"`
		BackendDir  string `json:"backendDir"`
		FrontendDir string `json:"frontendDir"`
	} `json:"layout"`
	Go struct {
		ModulePath string `json:"modulePath"`
		GenDir     string `json:"genDir"`
		FeatureDir string `json:"featureDir"`
		DtoconvPkg string `json:"dtoconvPkg"`
		GenSuffix  string `json:"genSuffix"`
	} `json:"go"`
	Ledgers struct {
		MountedModules string `json:"mountedModules"`
	} `json:"ledgers"`
	Language string `json:"language"`
}

const namaConfig = "standard.config.json"

// errConfigTakAda menandai satu-satunya kegagalan muat yang PUNYA teks terjemahan di katalog
// (`config.tidak_ditemukan`). Tanpa sentinel, pemanggil harus mencocokkan teks galat untuk
// tahu ia boleh melokalkan pesannya — dan pencocokan teks itu putus begitu kalimatnya disunting.
//
// Ia sengaja TIDAK diekspor, dan nilainya adalah alasannya: "config-tidak-ditemukan" itu SLUG,
// bukan kalimat. Sentinel yang diekspor cepat atau lambat sampai ke sebuah `fmt.Fprintln(w, err)`
// di alat pemanggil, dan yang tercetak ke pengguna adalah slug itu. Yang diekspor sebagai
// gantinya adalah LaporGagalConfig, yang selalu mencetak kalimatnya.
var errConfigTakAda = errors.New("config-tidak-ditemukan")

// pesanConfigTakAda adalah CADANGAN untuk saat katalog pun tak terbaca — jalur yang benar-benar
// terjadi: dijalankan dari luar pohon paket ini, `standard.config.json` tak ketemu DAN
// `messages/` tak ketemu. Sampai perbaikan ini, cadangannya adalah teks Indonesia yang ditulis
// task ini sendiri, jadi proyek berbahasa Inggris menerima prosa Indonesia di jalur pertama
// yang ia sentuh. Dwibahasa dengan alasan yang sama seperti BootstrapKatalog.
//
// Kalimatnya KEMBAR dengan entri katalog `config.tidak_ditemukan`, satu baris per bahasa dan
// urutannya sama dengan BahasaKatalog. Kembar dengan sengaja, tapi kembar yang tak diikat akan
// menyimpang: TestCadanganConfigTakAdaSepadanDenganKatalog mengadu keduanya, dan
// TestGalatConfigTakAdaMemakaiEntriKatalog membuktikan entri katalognya memang yang dipakai saat
// katalog terbaca — tanpa uji kedua itu, cabang katalognya bisa dicabut tanpa mengubah satu byte
// pun keluaran.
const pesanConfigTakAda = namaConfig + " tidak ditemukan dari %[1]s sampai akar filesystem.\n" +
	namaConfig + " was not found from %[1]s up to the filesystem root."

// configTakAda membawa direktori awal pencariannya. Dulu pelapornya menurunkan ulang nilai itu
// dari bendera dan cwd — dua sumber yang bisa berbeda dari yang sungguh dipakai Muat.
type configTakAda struct{ dari string }

func (e configTakAda) Error() string { return fmt.Sprintf(pesanConfigTakAda, e.dari) }
func (e configTakAda) Unwrap() error { return errConfigTakAda }

// BahasaKatalog adalah seluruh bahasa yang katalog paket ini punya. Dipakai di dua tempat yang
// harus sepakat: pelaporan galat sebelum bahasa proyek diketahui, dan bantuan tanpa config.
var BahasaKatalog = []string{"id", "en"}

// Muat menaiki direktori dari mulaiDari sampai menemukan namaConfig.
func Muat(mulaiDari string) (Config, string, error) {
	dir, err := filepath.Abs(mulaiDari)
	if err != nil {
		return Config{}, "", err
	}
	for {
		mentah, err := os.ReadFile(filepath.Join(dir, namaConfig))
		if err == nil {
			var c Config
			// Netral dengan sengaja: jalur berkas plus galat pustaka, nol prosa. Galat ini bisa
			// muncul sebelum bahasa proyek diketahui, jadi ia tak boleh membawa kalimat berbahasa
			// apa pun yang ditulis paket ini.
			if err := json.Unmarshal(mentah, &c); err != nil {
				return Config{}, "", fmt.Errorf("%s: %w", filepath.Join(dir, namaConfig), err)
			}
			// Penjaga dipasang di KEDUA cabang pemuatan, bukan cuma di `MuatDari`: pembungkus
			// `standard` meneruskan `-config <direktori proyek>`, dan direktori berujung di sini.
			// Diukur sebelum penjaga ini ada di sini: `gen dto` mengeluh soal ".github/workflows"
			// dan `gen module` soal direktori bernama tag-nya — kode keluar 2 yang benar dengan
			// pesan yang menunjuk tempat yang sama sekali salah.
			if err := c.periksaLapisBackend(); err != nil {
				return Config{}, "", fmt.Errorf("%s: %w", filepath.Join(dir, namaConfig), err)
			}
			return c, dir, nil
		}
		if !os.IsNotExist(err) {
			return Config{}, "", err
		}
		naik := filepath.Dir(dir)
		if naik == dir {
			return Config{}, "", configTakAda{dari: mulaiDari}
		}
		dir = naik
	}
}

// MuatDari menerjemahkan nilai bendera -config: kosong berarti cari naik dari direktori
// kerja, sebuah direktori berarti cari naik dari situ, dan sebuah berkas dibaca langsung.
// Menerima ketiganya karena pemanggil manusia menunjuk berkas, sedangkan pemanggil skrip
// menunjuk direktori proyek.
func MuatDari(jalur string) (Config, string, error) {
	if jalur == "" {
		wd, err := os.Getwd()
		if err != nil {
			return Config{}, "", err
		}
		return Muat(wd)
	}
	st, err := os.Stat(jalur)
	if err != nil {
		return Config{}, "", err
	}
	if st.IsDir() {
		return Muat(jalur)
	}
	mentah, err := os.ReadFile(jalur)
	if err != nil {
		return Config{}, "", err
	}
	var c Config
	if err := json.Unmarshal(mentah, &c); err != nil {
		return Config{}, "", fmt.Errorf("%s: %w", jalur, err)
	}
	akar, err := filepath.Abs(filepath.Dir(jalur))
	if err != nil {
		return Config{}, "", err
	}
	if err := c.periksaLapisBackend(); err != nil {
		return Config{}, "", fmt.Errorf("%s: %w", jalur, err)
	}
	return c, akar, nil
}

// PesanTanpaLapisBackend adalah kalimat tunggal untuk "config ini tidak menyatakan lapis backend".
//
// Kedua alat Go di paket ini (genmodule, gendto) HANYA memancarkan kode Go — tidak ada paruh yang
// bisa dipancarkan tanpa lapis backend, jadi keduanya gagal seluruhnya, bukan sebagian. Yang harus
// benar adalah KALIMATNYA: tanpa penjaga ini keduanya tetap keluar 2, tapi dengan pesan yang
// menunjuk jalur karangan hasil menggabungkan direktori kosong — diukur, `gendto` mengeluh soal
// ".github/workflows" dan `genmodule` soal direktori bernama tag-nya. Kode keluarnya benar dan
// pesannya menyesatkan; yang kedua itu yang menghabiskan waktu orang.
const PesanTanpaLapisBackend = "config ini tidak menyatakan lapis backend: `layout.backendDir` " +
	"tidak diisi, jadi `go.*` tidak wajib dan tidak ada jalur backend yang bisa dirakit. Alat ini " +
	"hanya memancarkan kode Go, jadi ia tidak bisa berjalan di proyek contract-only. Isi " +
	"`layout.backendDir` beserta blok `go` kalau proyek ini memang punya backend Go."

// periksaLapisBackend menolak config yang tidak menyatakan lapis backend.
//
// Sinyalnya `layout.backendDir` yang KOSONG, sama dengan sisi TypeScript — dan sengaja bukan
// "direktorinya tidak ada di disk": kalau ketiadaan di disk yang jadi pemicu, satu salah ketik
// jalur berubah jadi tombol mati diam-diam. `go.modulePath` ikut dituntut karena skema JSON
// mewajibkannya begitu `backendDir` ada; config yang punya satu tanpa yang lain adalah config yang
// tidak lolos skema, dan alat ini tidak boleh menebak separuh yang hilang.
func (c Config) periksaLapisBackend() error {
	if strings.TrimSpace(c.Layout.BackendDir) == "" || strings.TrimSpace(c.Go.ModulePath) == "" {
		return errors.New(PesanTanpaLapisBackend)
	}
	return nil
}

// LaporGagalConfig melokalkan satu-satunya kegagalan muat config yang punya terjemahan. Bahasa
// belum diketahui saat ini — ia justru ada DI DALAM berkas yang tak ketemu — jadi pesannya
// dicetak dalam kedua bahasa katalog, bukan dalam salah satu yang ditebak. Kalau katalog pun
// tak terbaca, cadangannya dwibahasa juga: itu jalur yang ditempuh siapa pun yang menjalankan
// alat ini dari luar pohon paket standar.
//
// Ia hidup DI SINI, bukan disalin ke tiap alat, karena tiap salinan ikut menyalin keputusan
// "kapan boleh melokalkan" — dan salinan yang jarang dibaca adalah salinan yang menyimpang.
// Ia juga yang membuat errConfigTakAda tak perlu diekspor: pemanggil tidak pernah memegang
// sentinel telanjang, jadi tidak ada yang bisa mencetak slug-nya.
func LaporGagalConfig(galat io.Writer, dirPesan string, err error) {
	var takAda configTakAda
	if !errors.As(err, &takAda) {
		fmt.Fprintln(galat, err)
		return
	}
	dicetak := false
	for _, bahasa := range BahasaKatalog {
		kat, e := MuatKatalogUntuk(dirPesan, bahasa)
		if e != nil {
			continue
		}
		if _, ada := kat["config.tidak_ditemukan"]; !ada {
			continue
		}
		fmt.Fprintln(galat, kat.T("config.tidak_ditemukan", map[string]string{"dari": takAda.dari}))
		dicetak = true
	}
	if !dicetak {
		fmt.Fprintln(galat, takAda.Error())
	}
}

func (c Config) ImportGen(pkg string) string {
	return c.Go.ModulePath + "/" + filepath.ToSlash(filepath.Join(c.Go.GenDir, pkg))
}

func (c Config) ImportDtoconv() string {
	return c.Go.ModulePath + "/" + filepath.ToSlash(c.Go.DtoconvPkg)
}

// namaSubPkgUji: harness putar-balik hidup sebagai subpaket dari paket konversi. Namanya
// konvensi standar ini sendiri (gendto yang membangkitkan pemanggilnya), bukan layout proyek
// mana pun.
const namaSubPkgUji = "dtoconvtest"

func (c Config) ImportDtoconvTest() string {
	return c.ImportDtoconv() + "/" + namaSubPkgUji
}

// PkgDtoconv memberi nama IDENTIFIER paket konversi — elemen terakhir jalurnya. Kode yang
// dibangkitkan memanggil `<PkgDtoconv>.Slice(...)`, jadi menuliskannya harfiah akan patah
// begitu sebuah proyek menaruh pembantunya di paket bernama lain.
func (c Config) PkgDtoconv() string {
	return path.Base(filepath.ToSlash(c.Go.DtoconvPkg))
}

// Nama paket lapis PLATFORM yang kerangka modul sebut: pembaca konteks permintaan, dan pembawa
// angka paginasi yang BUKAN tipe generated (lihat B-01 — tipe kabel berhenti di handler).
// Keduanya konvensi standar ini sendiri, sama seperti namaSubPkgUji.
const (
	namaSubPkgAppcontext = "appcontext"
	namaSubPkgHttpx      = "httpx"
)

// DirPlatform adalah direktori lapis platform, diturunkan sebagai INDUK dari go.dtoconvPkg.
//
// Bukan kunci config sendiri, dengan alasan yang sama seperti SufiksUjiGen: dua kunci yang wajib
// konsisten satu sama lain adalah dua kunci yang cepat atau lambat tidak konsisten. Yang
// dinyatakan standar ini adalah bahwa lapis platform duduk di SATU direktori; go.dtoconvPkg
// sudah menyebut salah satu anggotanya, jadi direktorinya sudah diketahui.
//
// Batasnya, dan sebut ia saat mengutip ini: proyek yang menyebar pembantu platformnya ke
// beberapa direktori tidak mengikuti layout ini, dan impor yang dipancarkan kerangka akan salah
// alamat — terlihat sebagai galat kompilasi di berkas yang baru dibangkitkan, bukan sebagai
// kegagalan senyap.
func (c Config) DirPlatform() string {
	return path.Dir(filepath.ToSlash(c.Go.DtoconvPkg))
}

func (c Config) ImportPlatform(sub string) string {
	return c.Go.ModulePath + "/" + path.Join(c.DirPlatform(), sub)
}

func (c Config) ImportAppcontext() string { return c.ImportPlatform(namaSubPkgAppcontext) }

func (c Config) ImportHttpx() string { return c.ImportPlatform(namaSubPkgHttpx) }

// PkgAppcontext dan PkgHttpx memberi IDENTIFIER paketnya, dipakai kerangka saat menulis
// `appcontext.AppContext` dan `httpx.Pagination`.
func (c Config) PkgAppcontext() string { return namaSubPkgAppcontext }

func (c Config) PkgHttpx() string { return namaSubPkgHttpx }

func (c Config) DirGen(akar string) string {
	return filepath.Join(akar, c.Layout.BackendDir, c.Go.GenDir)
}

func (c Config) DirFeature(akar string) string {
	return filepath.Join(akar, c.Layout.BackendDir, c.Go.FeatureDir)
}

func (c Config) DirKontrak(akar string) string {
	return filepath.Join(akar, c.Layout.ContractDir)
}

// JalurLedgerModul: buku besar modul terpasang duduk di akar contractDir, sama seperti buku
// besar lain (lihat `jalur.ledger()` di sisi TypeScript).
func (c Config) JalurLedgerModul(akar string) string {
	return filepath.Join(c.DirKontrak(akar), c.Ledgers.MountedModules)
}

func (c Config) NamaBerkasGen(dasar string) string {
	return dasar + c.Go.GenSuffix
}

// SufiksUjiGen menurunkan sufiks berkas UJI generated dari sufiks berkas generated biasa:
// ".gen.go" -> ".gen_test.go". Diturunkan, bukan kunci config kedua — dua kunci yang wajib
// konsisten satu sama lain adalah dua kunci yang cepat atau lambat akan tidak konsisten.
func (c Config) SufiksUjiGen() string {
	return strings.TrimSuffix(c.Go.GenSuffix, ".go") + "_test.go"
}

func (c Config) NamaBerkasUjiGen(dasar string) string {
	return dasar + c.SufiksUjiGen()
}

// AliasGen memberi alias impor paket generated: `<pkg>gen`.
//
// Di sini, bukan di tiap alat, karena gendto dan genmodule menulis berkas yang duduk di paket
// fitur yang SAMA. Alias impor Go bersifat per-berkas, jadi dua ejaan tidak akan gagal
// kompilasi — mereka akan hidup berdampingan dan membuat pembaca berikutnya mengira keduanya
// paket yang berbeda.
//
// Sumber genmodule punya dua pengecualian harfiah (dua paket yang secara historis memakai alias
// pendek). Keduanya dibuang: pengecualian alias tidak punya alasan kompilasi apa pun, dan yang
// ia bawa ke tiap proyek yang memakai standar ini adalah nama tag proyek lain.
func AliasGen(pkg string) string { return pkg + "gen" }
