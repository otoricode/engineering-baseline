package cfg

import (
	"bytes"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

// dirKatalog: katalog paket ini duduk dua tingkat di atas paket cfg (tooling/messages), bukan
// satu seperti saat berkas ini masih hidup di tooling/gendto.
func dirKatalog() string { return filepath.Join("..", "..", "messages") }

func katalogUji(t *testing.T, bahasa string) Katalog {
	t.Helper()
	k, err := MuatKatalog(dirKatalog(), bahasa)
	if err != nil {
		t.Fatal(err)
	}
	return k
}

func tulis(t *testing.T, jalur, isi string) {
	t.Helper()
	if err := os.MkdirAll(filepath.Dir(jalur), 0o755); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(jalur, []byte(isi), 0o644); err != nil {
		t.Fatal(err)
	}
}

func tulisConfig(t *testing.T, dir string) {
	t.Helper()
	isi := `{"layout":{"contractDir":"packages/contract","backendDir":"apps/api","frontendDir":"apps/web"},
"go":{"modulePath":"example.com/p/apps/api","genDir":"internal/gen","featureDir":"internal/feature",
"dtoconvPkg":"internal/platform/dtoconv","genSuffix":".gen.go"},
"contract":{"bundle":"dist/openapi.bundled.yaml","sharedDir":"openapi/_shared",
"shared":{"envelope":"e.yaml","permissions":"p.yaml","errors":"r.yaml","publicOps":"o.yaml"}},
"ledgers":{"envelopeOptIn":"a.json","mountedModules":"m.json","routes":"t.json","coverage":"c.json"},
"emit":{"permissions":"x.ts","errorCodes":"y.ts"},
"idempotency":{"uuidNamespace":"9f1c2b7e-0000-4000-8000-000000000001"},
"rules":{"docBase":"docs/rules","prefix":{"contract":"C"}},"language":"id"}`
	tulis(t, filepath.Join(dir, "standard.config.json"), isi)
}

// --- Pemuatan config ---------------------------------------------------------------------

func TestMuatConfigNaikDirektori(t *testing.T) {
	akar := t.TempDir()
	tulisConfig(t, akar)
	dalam := filepath.Join(akar, "a", "b")
	if err := os.MkdirAll(dalam, 0o755); err != nil {
		t.Fatal(err)
	}
	c, ketemu, err := Muat(dalam)
	if err != nil {
		t.Fatalf("Muat: %v", err)
	}
	if ketemu != akar {
		t.Errorf("akar = %q, mau %q", ketemu, akar)
	}
	if c.Go.ModulePath != "example.com/p/apps/api" {
		t.Errorf("modulePath = %q", c.Go.ModulePath)
	}
}

func TestMuatConfigTakAda(t *testing.T) {
	if _, _, err := Muat(t.TempDir()); err == nil {
		t.Fatal("mau error, dapat nil")
	}
}

// --- Jalur dan impor yang diturunkan dari config -------------------------------------------

func TestImportPathDibangunDariConfig(t *testing.T) {
	var c Config
	c.Go.ModulePath = "example.com/p/apps/api"
	c.Go.GenDir = "internal/gen"
	c.Go.DtoconvPkg = "internal/platform/dtoconv"

	if got, mau := c.ImportGen("keluarga"), "example.com/p/apps/api/internal/gen/keluarga"; got != mau {
		t.Errorf("ImportGen = %q, mau %q", got, mau)
	}
	if got, mau := c.ImportDtoconv(), "example.com/p/apps/api/internal/platform/dtoconv"; got != mau {
		t.Errorf("ImportDtoconv = %q, mau %q", got, mau)
	}
}

func TestSufiksUjiDiturunkanDariGenSuffix(t *testing.T) {
	for _, kasus := range []struct{ gen, mau string }{
		{".gen.go", ".gen_test.go"},
		{".dibangkitkan.go", ".dibangkitkan_test.go"},
		{"_gen.go", "_gen_test.go"},
	} {
		var c Config
		c.Go.GenSuffix = kasus.gen
		if got := c.SufiksUjiGen(); got != kasus.mau {
			t.Errorf("SufiksUjiGen(%q) = %q, mau %q", kasus.gen, got, kasus.mau)
		}
	}
}

func TestPkgDtoconvAdalahElemenTerakhirJalur(t *testing.T) {
	var c Config
	c.Go.DtoconvPkg = "internal/platform/pemetaan"
	if got := c.PkgDtoconv(); got != "pemetaan" {
		t.Errorf("PkgDtoconv = %q, mau %q", got, "pemetaan")
	}
}

// Lapis platform diturunkan sebagai SAUDARA dari dtoconvPkg. Kalau ia terpaku, config yang
// memindahkan dtoconv tetap memancarkan impor lama — dan itu justru kelas cacat yang seluruh
// pengangkatan ini ada untuk membunuhnya.
func TestImporPlatformIkutPindahBersamaDtoconv(t *testing.T) {
	var c Config
	c.Go.ModulePath = "contoh.test/acme/servis"
	c.Go.DtoconvPkg = "dalam/alat/pemetaan"

	for _, kasus := range []struct{ got, mau string }{
		{c.DirPlatform(), "dalam/alat"},
		{c.ImportAppcontext(), "contoh.test/acme/servis/dalam/alat/appcontext"},
		{c.ImportHttpx(), "contoh.test/acme/servis/dalam/alat/httpx"},
		{c.ImportPlatform("apa pun"), "contoh.test/acme/servis/dalam/alat/apa pun"},
	} {
		if kasus.got != kasus.mau {
			t.Errorf("= %q, mau %q", kasus.got, kasus.mau)
		}
	}
}

func TestAliasGenTanpaPengecualianHarfiah(t *testing.T) {
	for pkg, mau := range map[string]string{
		"keluarga":       "keluargagen",
		"bukutamu":       "bukutamugen",
		"pemerintahdesa": "pemerintahdesagen",
	} {
		if got := AliasGen(pkg); got != mau {
			t.Errorf("AliasGen(%q) = %q, mau %q", pkg, got, mau)
		}
	}
}

// --- Katalog ------------------------------------------------------------------------------

func TestKatalogMenolakNilaiBukanString(t *testing.T) {
	dir := t.TempDir()
	tulis(t, filepath.Join(dir, "id.json"), `{"a":"ok","b":{"c":"oops"}}`)
	if _, err := MuatKatalog(dir, "id"); err == nil {
		t.Fatal("mau error untuk nilai bersarang, dapat nil")
	}
}

func TestKomentarBlokMenulisBarisKosongSebagaiKomentar(t *testing.T) {
	got := KomentarBlok("satu\n\ndua\n")
	if mau := "// satu\n//\n// dua\n"; got != mau {
		t.Errorf("KomentarBlok = %q, mau %q", got, mau)
	}
}

// --- Kekembaran cadangan config-tak-ada ----------------------------------------------------
//
// Kedua uji di bawah pindah ke sini BERSAMA pesanConfigTakAda. Konstanta itu byte-identik
// dengan entri katalog `config.tidak_ditemukan` dengan sengaja, dan tanpa keduanya kekembaran
// itu bebas menyimpang — pemindah berkas berikutnya adalah orang yang paling tak mungkin
// menyadarinya, karena ia sedang memindahkan berkas, bukan membacanya.

// Mengadu KEDUA sumber satu sama lain — bukan menurunkan harapan dari salah satunya — supaya
// menyunting yang satu tanpa yang lain memerah.
func TestCadanganConfigTakAdaSepadanDenganKatalog(t *testing.T) {
	const dari = "/contoh/direktori-awal"
	baris := strings.Split(fmt.Sprintf(pesanConfigTakAda, dari), "\n")

	if len(baris) != len(BahasaKatalog) {
		t.Fatalf("cadangan punya %d baris, mau %d — satu per bahasa katalog", len(baris), len(BahasaKatalog))
	}
	for i, b := range BahasaKatalog {
		mau := katalogUji(t, b).T("config.tidak_ditemukan", map[string]string{"dari": dari})
		if baris[i] != mau {
			t.Errorf("baris %s menyimpang antara cadangan dan katalog:\n cadangan: %q\n katalog : %q",
				b, baris[i], mau)
		}
	}
}

// Kesepadanan saja tidak cukup: justru KARENA keduanya byte-identik, cabang katalog di
// LaporGagalConfig bisa dicabut tanpa mengubah satu byte pun keluaran, dan tak ada uji yang
// memerah. Di sini katalognya sengaja diberi teks penanda yang BEDA, sehingga keluarannya
// membuktikan sumber mana yang sungguh dipakai.
func TestGalatConfigTakAdaMemakaiEntriKatalog(t *testing.T) {
	dirPesan := t.TempDir()
	tulis(t, filepath.Join(dirPesan, "id.json"), `{"config.tidak_ditemukan":"PENANDA-ID {dari}"}`)
	tulis(t, filepath.Join(dirPesan, "en.json"), `{"config.tidak_ditemukan":"PENANDA-EN {dari}"}`)
	luar := t.TempDir()

	_, _, err := Muat(luar)
	if err == nil {
		t.Fatal("mau galat config-tak-ada")
	}
	var b bytes.Buffer
	LaporGagalConfig(&b, dirPesan, err)

	for _, mau := range []string{"PENANDA-ID " + luar, "PENANDA-EN " + luar} {
		if !strings.Contains(b.String(), mau) {
			t.Errorf("galat tidak memuat %q — entri katalog tidak dipakai:\n%s", mau, b.String())
		}
	}
	if jangan := fmt.Sprintf(pesanConfigTakAda, luar); strings.Contains(b.String(), jangan) {
		t.Errorf("cadangan konstanta ikut tercetak padahal katalog terbaca:\n%s", b.String())
	}
}

// Cadangan dipakai HANYA saat katalognya tak terbaca — dan saat itu ia tetap dwibahasa. Frasa
// penandanya ditulis harfiah di sini, BUKAN diambil dari konstanta yang diuji: kalau diambil
// dari sana, memutar konstanta jadi satu bahasa akan ikut memutar nilai harapannya dan uji ini
// tak akan pernah bisa merah.
func TestCadanganDipakaiSaatKatalogTakTerbaca(t *testing.T) {
	luar, kosong := t.TempDir(), t.TempDir()
	_, _, err := Muat(luar)
	if err == nil {
		t.Fatal("mau galat config-tak-ada")
	}
	var b bytes.Buffer
	LaporGagalConfig(&b, kosong, err)
	for _, mau := range []string{"tidak ditemukan", "was not found", luar} {
		if !strings.Contains(b.String(), mau) {
			t.Errorf("galat tidak memuat %q:\n%s", mau, b.String())
		}
	}
}

// Galat muat SELAIN "tidak ditemukan" tidak punya terjemahan, jadi ia dicetak apa adanya.
// Tanpa uji ini, cabang errors.As bisa dibalik dan setiap galat pustaka akan dilaporkan sebagai
// "config tidak ditemukan".
func TestGalatLainDicetakApaAdanya(t *testing.T) {
	akar := t.TempDir()
	tulis(t, filepath.Join(akar, "standard.config.json"), "{bukan json")
	_, _, err := Muat(akar)
	if err == nil {
		t.Fatal("mau galat urai")
	}
	var b bytes.Buffer
	LaporGagalConfig(&b, dirKatalog(), err)
	if !strings.Contains(b.String(), "standard.config.json") {
		t.Errorf("galat tidak menyebut berkasnya:\n%s", b.String())
	}
	if strings.Contains(b.String(), "sampai akar filesystem") {
		t.Errorf("galat urai dilaporkan sebagai config-tak-ada:\n%s", b.String())
	}
}

// --- Portabilitas ---------------------------------------------------------------------------

// Nama proyek asal disusun saat jalan, bukan ditulis harfiah — kalau ditulis harfiah, uji ini
// akan menemukan dirinya sendiri dan selalu merah.
func TestTidakAdaNamaProyekAsalDiPaketCfg(t *testing.T) {
	jarum := []string{"desa" + "kita", "otori" + "code"}
	berkas, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range berkas {
		mentah, err := os.ReadFile(f)
		if err != nil {
			t.Fatal(err)
		}
		for _, j := range jarum {
			if strings.Contains(string(mentah), j) {
				t.Errorf("%s memuat nama proyek asal %q", f, j)
			}
		}
	}
}
