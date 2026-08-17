package main

import (
	"bytes"
	"encoding/json"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"testing"

	"engineering-baseline/tooling/internal/cfg"
)

func TestPkgGenDiturunkanDariNamaTag(t *testing.T) {
	for tag, mau := range map[string]string{
		"keluarga":   "keluarga",
		"buku-tamu":  "bukutamu",
		"Surat_Umum": "suratumum",
		"v2-modul":   "v2modul",
	} {
		if got := pkgGenDariTag(tag); got != mau {
			t.Errorf("pkgGenDariTag(%q) = %q, mau %q", tag, got, mau)
		}
	}
}

// --- Proyek contoh ---------------------------------------------------------------------

type contoh struct {
	akar    string
	bahasa  string
	suffix  string
	dirGen  string
	dirFit  string
	dirKon  string
	dirKerj string
}

const isiGenFoo = `package foo

import (
	"encoding/json"
	"time"

	openapi_types "github.com/oapi-codegen/runtime/types"
)

type Status string

type Anak struct {
	Nama string
	Umur *int
}

type Induk struct {
	Id      openapi_types.UUID
	Dibuat  time.Time
	Status  Status
	Anak    []Anak
	Catatan *string
	Peta    map[string]Anak
	Meta    MetaData
}

type Kegagalan = Failure

type Gabungan struct {
	union json.RawMessage
}

type GetFooRequestObject struct {
	Params any
}

type GetFoo200JSONResponse struct {
	Data Induk
}
`

const isiGenShared = `package foo

type Failure struct {
	Pesan string
}

type MetaData struct {
	Total int
}
`

// buatProyek menyusun pohon proyek palsu yang bentuknya ditentukan config, bukan oleh
// konvensi apa pun yang terpaku di alat.
func buatProyek(t *testing.T, bahasa, suffix, ledger string, pkgGen ...string) contoh {
	t.Helper()
	if suffix == "" {
		suffix = ".gen.go"
	}
	if bahasa == "" {
		bahasa = "id"
	}
	if len(pkgGen) == 0 {
		pkgGen = []string{"foo"}
	}
	akar := t.TempDir()
	c := contoh{
		akar:   akar,
		bahasa: bahasa,
		suffix: suffix,
		dirGen: filepath.Join(akar, "apps/api/internal/gen"),
		dirFit: filepath.Join(akar, "apps/api/internal/feature"),
		dirKon: filepath.Join(akar, "packages/contract"),
	}

	isi := `{"layout":{"contractDir":"packages/contract","backendDir":"apps/api","frontendDir":"apps/web"},
"go":{"modulePath":"example.com/p/apps/api","genDir":"internal/gen","featureDir":"internal/feature",
"dtoconvPkg":"internal/platform/dtoconv","genSuffix":"` + suffix + `"},
"contract":{"bundle":"dist/openapi.bundled.yaml","sharedDir":"openapi/_shared",
"shared":{"envelope":"e.yaml","permissions":"p.yaml","errors":"r.yaml","publicOps":"o.yaml"}},
"ledgers":{"envelopeOptIn":"a.json","mountedModules":"mounted-modules.json","routes":"t.json","coverage":"c.json"},
"emit":{"permissions":"x.ts","errorCodes":"y.ts"},
"idempotency":{"uuidNamespace":"9f1c2b7e-0000-4000-8000-000000000001"},
"rules":{"docBase":"docs/rules","prefix":{"contract":"C"}},"language":"` + bahasa + `"}`
	tulis(t, filepath.Join(akar, "standard.config.json"), isi)

	for _, pkg := range pkgGen {
		tulis(t, filepath.Join(c.dirGen, pkg, "foo"+suffix), isiGenFoo)
		tulis(t, filepath.Join(c.dirGen, pkg, "shared"+suffix), isiGenShared)
	}
	if ledger != "" {
		tulis(t, filepath.Join(c.dirKon, "mounted-modules.json"), ledger)
	}
	return c
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

func mkdir(t *testing.T, jalur string) {
	t.Helper()
	if err := os.MkdirAll(jalur, 0o755); err != nil {
		t.Fatal(err)
	}
}

func lari(t *testing.T, argv ...string) (kode int, keluar, galat string) {
	t.Helper()
	var o, e bytes.Buffer
	kode = jalankan(argv, &o, &e)
	return kode, o.String(), e.String()
}

func katalogUji(t *testing.T, bahasa string) cfg.Katalog {
	t.Helper()
	k, err := cfg.MuatKatalog(filepath.Join("..", "messages"), bahasa)
	if err != nil {
		t.Fatal(err)
	}
	return k
}

func barisPertama(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}

// --- Perilaku alat ---------------------------------------------------------------------

func TestDryRunAdalahDefaultDanTidakMenulis(t *testing.T) {
	c := buatProyek(t, "id", "", "")
	mkdir(t, filepath.Join(c.dirFit, "foo"))

	kode, keluar, galat := lari(t, "-config", c.akar)
	if kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}
	isi, err := os.ReadDir(filepath.Join(c.dirFit, "foo"))
	if err != nil {
		t.Fatal(err)
	}
	if len(isi) != 0 {
		t.Fatalf("dry-run menulis %d berkas ke paket fitur", len(isi))
	}
	kat := katalogUji(t, "id")
	if mau := kat.T("gen.dry_run", map[string]string{"jumlah": "2"}); !strings.Contains(keluar, mau) {
		t.Errorf("keluaran tidak melaporkan rencana %q:\n%s", mau, keluar)
	}
}

func TestApplyMenulisDenganJalurDariConfig(t *testing.T) {
	c := buatProyek(t, "id", "", "")
	mkdir(t, filepath.Join(c.dirFit, "foo"))

	if kode, _, galat := lari(t, "-config", c.akar, "-apply"); kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}

	cermin := kodeSaja(bacaBerkas(t, filepath.Join(c.dirFit, "foo", "dto_foo.gen.go")))
	for _, mau := range []string{
		"package foo",
		`foogen "example.com/p/apps/api/internal/gen/foo"`,
		`"example.com/p/apps/api/internal/platform/dtoconv"`,
		"dtoconv.Slice(",
		"dtoconv.Map(",
		"type dtoInduk struct",
		"foogen.MetaData",
	} {
		if !strings.Contains(cermin, mau) {
			t.Errorf("cermin tidak memuat %q:\n%s", mau, cermin)
		}
	}
	// Tipe plumbing, union, dan nama dari berkas shared tidak boleh ikut tercermin.
	for _, jangan := range []string{"dtoGetFooRequestObject", "dtoGabungan", "dtoMetaData", "dtoKegagalan"} {
		if strings.Contains(cermin, jangan) {
			t.Errorf("cermin memuat %q, yang seharusnya dilewati", jangan)
		}
	}

	uji := kodeSaja(bacaBerkas(t, filepath.Join(c.dirFit, "foo", "dto_foo_roundtrip.gen_test.go")))
	for _, mau := range []string{
		`"example.com/p/apps/api/internal/platform/dtoconv/dtoconvtest"`,
		"func TestDtoRoundTrip_Foo(",
		"dtoconvtest.RoundTrip(t, dtoIndukFromWire, dtoInduk.toWire)",
	} {
		if !strings.Contains(uji, mau) {
			t.Errorf("berkas uji tidak memuat %q:\n%s", mau, uji)
		}
	}
}

// Config yang memindahkan SELURUH layout harus memindahkan keluarannya juga. Kalau ada satu
// literal jalur yang tersisa di alat, uji ini menemukannya: tidak satu pun nilai default
// dipakai di sini.
func TestSeluruhLayoutIkutBerpindahBersamaConfig(t *testing.T) {
	akar := t.TempDir()
	isi := `{"layout":{"contractDir":"kontrak","backendDir":"servis","frontendDir":"web"},
"go":{"modulePath":"contoh.test/lain/servis","genDir":"dalam/dibangkitkan","featureDir":"dalam/modul",
"dtoconvPkg":"dalam/alat/pemetaan","genSuffix":".dibangkitkan.go"},
"ledgers":{"mountedModules":"modul-terpasang.json"},"language":"id"}`
	tulis(t, filepath.Join(akar, "standard.config.json"), isi)
	dirGen := filepath.Join(akar, "servis/dalam/dibangkitkan/foo")
	tulis(t, filepath.Join(dirGen, "foo.dibangkitkan.go"), isiGenFoo)
	tulis(t, filepath.Join(dirGen, "shared.dibangkitkan.go"), isiGenShared)
	dirFit := filepath.Join(akar, "servis/dalam/modul/foo")
	mkdir(t, dirFit)

	if kode, _, galat := lari(t, "-config", akar, "-apply"); kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}

	mentah := bacaBerkas(t, filepath.Join(dirFit, "dto_foo.dibangkitkan.go"))
	bacaBerkas(t, filepath.Join(dirFit, "dto_foo_roundtrip.dibangkitkan_test.go"))
	cermin := kodeSaja(mentah)
	for _, mau := range []string{
		`foogen "contoh.test/lain/servis/dalam/dibangkitkan/foo"`,
		`"contoh.test/lain/servis/dalam/alat/pemetaan"`,
		"pemetaan.Slice(",
	} {
		if !strings.Contains(cermin, mau) {
			t.Errorf("cermin tidak memuat %q:\n%s", mau, cermin)
		}
	}
	// Negatif mengenai SELURUH berkas, komentar termasuk: jalur terpaku yang bocor ke komentar
	// tetap bocor.
	for _, jangan := range []string{"internal/gen", "internal/feature", "dtoconv.", "apps/api"} {
		if strings.Contains(mentah, jangan) {
			t.Errorf("jalur terpaku %q bocor ke keluaran:\n%s", jangan, mentah)
		}
	}
}

// Komentar yang generator TULIS ke dalam kode proyek target adalah teks menghadap-pengguna.
// Kalau ia terpaku di alat, proyek berbahasa Inggris menerima komentar berbahasa Indonesia.
func TestKomentarHasilMengikutiBahasaDiConfig(t *testing.T) {
	// Tiap berkas hasil membawa kunci komentarnya sendiri; keduanya harus ikut bahasa config.
	berkasKunci := map[string]string{
		"dto_foo.gen.go":                "gendto.komentar.berkas",
		"dto_foo_roundtrip.gen_test.go": "gendto.komentar.uji",
	}
	vars := map[string]string{"gen": "internal/gen/foo", "alias": "foogen"}
	awal := func(bahasa, kunci string) string {
		return barisPertama(katalogUji(t, bahasa).T(kunci, vars))
	}
	for _, kunci := range berkasKunci {
		if awal("id", kunci) == awal("en", kunci) {
			t.Fatalf("%s: kalimat pembuka id dan en sama — uji ini tidak bisa membedakan bahasa", kunci)
		}
	}

	for _, bahasa := range []string{"id", "en"} {
		lain := map[string]string{"id": "en", "en": "id"}[bahasa]
		c := buatProyek(t, bahasa, "", "")
		mkdir(t, filepath.Join(c.dirFit, "foo"))
		if kode, _, galat := lari(t, "-config", c.akar, "-apply"); kode != 0 {
			t.Fatalf("bahasa %s: kode = %d, galat = %s", bahasa, kode, galat)
		}
		for nama, kunci := range berkasKunci {
			isi := bacaBerkas(t, filepath.Join(c.dirFit, "foo", nama))
			if ada := awal(bahasa, kunci); !strings.Contains(isi, ada) {
				t.Errorf("bahasa %s: %s tidak memuat komentar katalog %q", bahasa, nama, ada)
			}
			if jangan := awal(lain, kunci); strings.Contains(isi, jangan) {
				t.Errorf("bahasa %s: %s memuat komentar bahasa lain %q", bahasa, nama, jangan)
			}
		}
		// Penanda generated adalah pola MESIN, bukan prosa: ia tetap sama di kedua bahasa.
		//
		// Polanya ditulis HARFIAH di sini, bukan diambil dari konstanta yang diuji: kalau ia
		// diambil dari sana, menerjemahkan konstantanya akan ikut menerjemahkan nilai harapan
		// dan uji ini tak akan pernah bisa merah. Yang dipakai adalah pola yang gofmt, linter,
		// dan penghitung diff kenali.
		polaGenerated := regexp.MustCompile(`(?m)^// Code generated .* DO NOT EDIT\.$`)
		for _, nama := range []string{"dto_foo.gen.go", "dto_foo_roundtrip.gen_test.go"} {
			isi := bacaBerkas(t, filepath.Join(c.dirFit, "foo", nama))
			if !polaGenerated.MatchString(isi) {
				t.Errorf("bahasa %s: %s: penanda generated tidak cocok pola mesin:\n%s",
					bahasa, nama, barisPertama(isi))
			}
		}
	}
}

// Paket generated tanpa direktori fitur senama dulu dilewati DIAM-DIAM. Salah ketik nama
// direktori terbaca persis sama dari sana, jadi lewatannya harus terlihat di keluaran.
func TestPaketTanpaFiturDilaporkanBukanDilewatiDiamDiam(t *testing.T) {
	c := buatProyek(t, "id", "", "", "foo", "common")
	mkdir(t, filepath.Join(c.dirFit, "foo"))

	kode, keluar, galat := lari(t, "-config", c.akar)
	if kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}
	kat := katalogUji(t, "id")
	judul := kat.T("gendto.judul_tanpa_fitur", map[string]string{"gen": c.dirGen, "fitur": c.dirFit})
	if !strings.Contains(keluar, judul) {
		t.Errorf("keluaran tidak memuat judul lewatan:\n%s", keluar)
	}
	if !strings.Contains(keluar, "\n  common\n") {
		t.Errorf("keluaran tidak menyebut paket yang dilewati:\n%s", keluar)
	}
}

func TestOnlyTakCocokGagal(t *testing.T) {
	c := buatProyek(t, "id", "", "")
	mkdir(t, filepath.Join(c.dirFit, "foo"))

	kode, _, galat := lari(t, "-config", c.akar, "-only", "fooo")
	if kode == 0 {
		t.Fatal("mau kode bukan-nol untuk -only yang salah ketik")
	}
	if !strings.Contains(galat, "fooo") {
		t.Errorf("galat tidak menyebut nama yang salah ketik: %s", galat)
	}
}

func TestOnlyTanpaFiturGagalAlihAlihDiam(t *testing.T) {
	c := buatProyek(t, "id", "", "", "foo", "common")
	mkdir(t, filepath.Join(c.dirFit, "foo"))

	kode, _, galat := lari(t, "-config", c.akar, "-only", "common")
	if kode == 0 {
		t.Fatalf("mau kode bukan-nol; galat = %q", galat)
	}
}

// --- Buku besar modul ------------------------------------------------------------------

func TestLedgerMemetakanPaketGeneratedKeFiturBernamaLain(t *testing.T) {
	// Bentuk buku besar yang sesungguhnya: ada prosa `_comment` berupa array dan beberapa peta
	// lain di sampingnya. Pembaca di sini hanya boleh menuntut `mount`, bukan seluruh berkas.
	ledger := `{"_comment":["baris satu","baris dua"],
"mount":{"buku-tamu":"tamu"},"optInBelumMount":{},"belumOptIn":[],"handWired":{"buku-tamu":"tamu"}}`
	c := buatProyek(t, "id", "", ledger, "bukutamu")
	mkdir(t, filepath.Join(c.dirFit, "tamu"))

	if kode, _, galat := lari(t, "-config", c.akar, "-apply"); kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}
	cermin := bacaBerkas(t, filepath.Join(c.dirFit, "tamu", "dto_bukutamu.gen.go"))
	if !strings.Contains(cermin, "package tamu") {
		t.Errorf("cermin tidak memakai nama paket fitur dari buku besar:\n%s", barisPertama(cermin))
	}
	if !strings.Contains(cermin, "example.com/p/apps/api/internal/gen/bukutamu") {
		t.Errorf("cermin tidak mengimpor paket generated yang benar:\n%s", cermin)
	}
}

func TestLedgerMenunjukFiturHilangGagalKeras(t *testing.T) {
	c := buatProyek(t, "id", "", `{"mount":{"foo":"tidak-ada"}}`)
	mkdir(t, filepath.Join(c.dirFit, "foo"))

	// Sengaja TANPA -apply: penjaganya harus menahan sebelum satu berkas pun ditulis. Kalau
	// diuji dengan -apply, kegagalan tulis ke direktori yang tak ada akan menghasilkan kode
	// bukan-nol yang sama dan uji ini lulus meski penjaganya dicabut.
	kode, _, galat := lari(t, "-config", c.akar)
	if kode == 0 {
		t.Fatal("mau kode bukan-nol saat buku besar menunjuk fitur yang tidak ada")
	}
	mau := katalogUji(t, "id").T("gendto.ledger_fitur_hilang", map[string]string{
		"pkg":   "foo",
		"fitur": "tidak-ada",
		"jalur": filepath.Join(c.dirFit, "tidak-ada"),
	})
	if !strings.Contains(galat, mau) {
		t.Errorf("galat bukan dari penjaga buku besar.\nmau: %s\ndapat: %s", mau, galat)
	}
}

func TestLedgerTanpaMountGagalKerasBukanDiturunkanDiamDiam(t *testing.T) {
	c := buatProyek(t, "id", "", `{"modules":{"foo":"foo"}}`)
	mkdir(t, filepath.Join(c.dirFit, "foo"))

	kode, _, galat := lari(t, "-config", c.akar, "-apply")
	if kode == 0 {
		t.Fatal("mau kode bukan-nol untuk buku besar yang bentuknya tak dikenali")
	}
	if strings.TrimSpace(galat) == "" {
		t.Error("galat kosong")
	}
}

func TestLedgerTidakAdaDilaporkanLaluDiturunkanDariNamaDirektori(t *testing.T) {
	c := buatProyek(t, "id", "", "")
	mkdir(t, filepath.Join(c.dirFit, "foo"))

	kode, keluar, galat := lari(t, "-config", c.akar, "-apply")
	if kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}
	kat := katalogUji(t, "id")
	mau := kat.T("gendto.ledger_tidak_ada",
		map[string]string{"jalur": filepath.Join(c.dirKon, "mounted-modules.json")})
	if !strings.Contains(keluar, mau) {
		t.Errorf("ketiadaan buku besar tidak dilaporkan:\n%s", keluar)
	}
	bacaBerkas(t, filepath.Join(c.dirFit, "foo", "dto_foo.gen.go"))
}

// --- Katalog ---------------------------------------------------------------------------

// Uji paritas di sisi TypeScript hanya membandingkan id.json dengan en.json. Ia tidak tahu
// kunci mana yang dipakai alat Go, jadi kunci yang lupa ditambahkan di KEDUA berkas lolos.
func TestSemuaKunciDipakaiAdaDiKeduaKatalog(t *testing.T) {
	for _, bahasa := range []string{"id", "en"} {
		kat := katalogUji(t, bahasa)
		if err := kat.Lengkap(kunciDipakai); err != nil {
			t.Errorf("%s.json: %v", bahasa, err)
		}
	}
}

func TestKatalogHilangDilaporkanDwibahasa(t *testing.T) {
	c := buatProyek(t, "id", "", "")
	mkdir(t, filepath.Join(c.dirFit, "foo"))

	kode, _, galat := lari(t, "-config", c.akar, "-messages", filepath.Join(t.TempDir(), "kosong"))
	if kode == 0 {
		t.Fatal("mau kode bukan-nol saat katalog tak terbaca")
	}
	if !strings.Contains(galat, "katalog pesan") || !strings.Contains(galat, "message catalogue") {
		t.Errorf("laporan bootstrap tidak dwibahasa: %s", galat)
	}
}

func TestConfigTakDitemukanDilaporkanDwibahasa(t *testing.T) {
	kosong := t.TempDir()
	kode, _, galat := lari(t, "-config", kosong)
	if kode == 0 {
		t.Fatal("mau kode bukan-nol saat config tak ditemukan")
	}
	for _, bahasa := range []string{"id", "en"} {
		mau := katalogUji(t, bahasa).T("config.tidak_ditemukan", map[string]string{"dari": kosong})
		if !strings.Contains(galat, mau) {
			t.Errorf("galat tidak memuat teks %s %q:\n%s", bahasa, mau, galat)
		}
	}
}

// Katalog TAK TERBACA adalah jalur yang sungguh ditempuh: siapa pun yang menjalankan alat ini
// dari luar pohon paket standar tidak punya `messages/` di atasnya. Sampai perbaikan ini,
// cadangannya prosa Indonesia — dan uji dwibahasa yang ada lulus hanya karena cwd uji kebetulan
// berada DI DALAM pohon paket, sehingga katalognya selalu ketemu.
//
// Frasa penanda ditulis harfiah di uji, bukan diambil dari konstanta yang diuji: kalau ia
// diambil dari sana, mengubah konstanta jadi satu bahasa akan ikut mengubah nilai harapan dan
// uji ini tak pernah bisa merah.
func TestConfigTakDitemukanTetapDwibahasaSaatKatalogTakTerbaca(t *testing.T) {
	wajibAda := func(t *testing.T, galat, dari string) {
		t.Helper()
		for _, mau := range []string{"tidak ditemukan", "was not found", dari} {
			if !strings.Contains(galat, mau) {
				t.Errorf("galat tidak memuat %q:\n%s", mau, galat)
			}
		}
	}

	t.Run("dijalankan dari luar pohon paket", func(t *testing.T) {
		luar := t.TempDir()
		if dir, err := cfg.CariDirPesan(luar, "id"); err == nil {
			t.Skipf("katalog terjangkau dari %s (%s) — jalur cadangan tak bisa diuji di mesin ini", luar, dir)
		}
		t.Chdir(luar)
		kode, _, galat := lari(t)
		if kode != 2 {
			t.Fatalf("kode = %d, galat = %s", kode, galat)
		}
		wajibAda(t, galat, luar)
	})

	t.Run("katalog ditunjuk ke direktori kosong", func(t *testing.T) {
		luar, kosong := t.TempDir(), t.TempDir()
		kode, _, galat := lari(t, "-config", luar, "-messages", kosong)
		if kode != 2 {
			t.Fatalf("kode = %d, galat = %s", kode, galat)
		}
		wajibAda(t, galat, luar)
	})
}

// Penjaga tabrakan: dua tag yang menormalisasi ke nama paket generated yang sama tapi menunjuk
// fitur berbeda. Tanpa uji ini, penjaganya bisa dicabut seluruhnya tanpa satu pun uji memerah.
func TestLedgerTabrakanNamaPaketGagalKeras(t *testing.T) {
	c := buatProyek(t, "id", "", `{"mount":{"buku-tamu":"tamu","bukutamu":"lain"}}`, "bukutamu")
	mkdir(t, filepath.Join(c.dirFit, "tamu"))
	mkdir(t, filepath.Join(c.dirFit, "lain"))

	kode, _, galat := lari(t, "-config", c.akar)
	if kode == 0 {
		t.Fatal("mau kode bukan-nol saat dua tag menghasilkan paket generated yang sama")
	}
	// Urutan iterasi map Go acak, jadi mana yang tercatat lebih dulu tidak ditentukan.
	kat := katalogUji(t, "id")
	jalur := filepath.Join(c.dirKon, "mounted-modules.json")
	var cocok bool
	for _, p := range [][2]string{{"tamu", "lain"}, {"lain", "tamu"}} {
		mau := kat.T("gendto.ledger_tabrakan", map[string]string{
			"pkg": "bukutamu", "fitur": p[0], "lain": p[1], "jalur": jalur,
		})
		cocok = cocok || strings.Contains(galat, mau)
	}
	if !cocok {
		t.Errorf("galat bukan dari penjaga tabrakan:\n%s", galat)
	}
}

// Katalog yang kehilangan kunci harus membuat alat MENOLAK JALAN. Memeriksa isi katalog di uji
// (TestSemuaKunciDipakai...) tidak membuktikan itu: mekanismenya sendiri, `kat.Lengkap` di awal
// tiap lari, bisa dicabut dan seluruh suite tetap hijau.
func TestKunciKatalogHilangMembuatAlatMenolakJalan(t *testing.T) {
	const dibuang = "gendto.komentar.uji"

	var kasar map[string]any
	if err := json.Unmarshal([]byte(bacaBerkas(t, filepath.Join("..", "messages", "id.json"))), &kasar); err != nil {
		t.Fatal(err)
	}
	// Kontrol positif: kalau kuncinya memang tak ada di katalog, uji ini tidak menguji apa pun.
	if _, ada := kasar[dibuang]; !ada {
		t.Fatalf("kunci %q tidak ada di katalog — uji ini tidak menguji apa pun", dibuang)
	}
	delete(kasar, dibuang)
	rusak, err := json.Marshal(kasar)
	if err != nil {
		t.Fatal(err)
	}
	dirPesan := t.TempDir()
	tulis(t, filepath.Join(dirPesan, "id.json"), string(rusak))

	c := buatProyek(t, "id", "", "")
	mkdir(t, filepath.Join(c.dirFit, "foo"))

	kode, _, galat := lari(t, "-config", c.akar, "-messages", dirPesan, "-apply")
	if kode != 2 {
		t.Fatalf("kode = %d, mau 2; galat = %s", kode, galat)
	}
	if !strings.Contains(galat, dibuang) {
		t.Errorf("galat tidak menyebut kunci yang hilang:\n%s", galat)
	}
	if _, err := os.Stat(filepath.Join(c.dirFit, "foo", "dto_foo.gen.go")); err == nil {
		t.Error("alat tetap menulis berkas meski katalognya tak lengkap")
	}
}

// --- Bantuan ---------------------------------------------------------------------------

func TestBantuanDijawabTanpaConfig(t *testing.T) {
	luar := t.TempDir() // tak ada standard.config.json di sini maupun di atasnya

	kode, keluar, galat := lari(t, "-config", luar, "-h")
	if kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}
	// Bahasa proyek belum diketahui, jadi bantuan muncul dalam seluruh bahasa katalog.
	for _, bahasa := range []string{"id", "en"} {
		if mau := katalogUji(t, bahasa).T("gendto.pemakaian", nil); !strings.Contains(keluar, mau) {
			t.Errorf("bantuan tidak memuat sinopsis %s %q:\n%s", bahasa, mau, keluar)
		}
	}
	for _, bendera := range []string{"-apply", "-config", "-messages", "-only"} {
		if !strings.Contains(keluar, bendera) {
			t.Errorf("bantuan tidak menyebut bendera %s:\n%s", bendera, keluar)
		}
	}
	if strings.TrimSpace(galat) != "" {
		t.Errorf("bantuan menulis ke aliran galat: %s", galat)
	}
}

// Bantuan pun butuh katalog — teks tiap bendera ada di sana. Kalau katalognya tak terjangkau,
// yang dilaporkan harus sebabnya, bukan bendera yang diminta.
func TestBantuanTanpaKatalogMelaporkanSebabnya(t *testing.T) {
	kosong := t.TempDir()

	kode, _, galat := lari(t, "-h", "-messages", kosong)
	if kode != 2 {
		t.Fatalf("kode = %d, mau 2", kode)
	}
	if !strings.Contains(galat, "katalog pesan") || !strings.Contains(galat, "message catalogue") {
		t.Errorf("laporan bootstrap tidak dwibahasa: %s", galat)
	}
	if !strings.Contains(galat, "id.json") {
		t.Errorf("galat tidak menyebut katalog mana yang tak terbaca: %s", galat)
	}
}

func TestBantuanMemakaiSatuBahasaSaatConfigKetemu(t *testing.T) {
	c := buatProyek(t, "en", "", "")

	kode, keluar, galat := lari(t, "-config", c.akar, "-h")
	if kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}
	if mau := katalogUji(t, "en").T("gendto.pemakaian", nil); !strings.Contains(keluar, mau) {
		t.Errorf("bantuan tidak dalam bahasa config:\n%s", keluar)
	}
	if jangan := katalogUji(t, "id").T("gendto.pemakaian", nil); strings.Contains(keluar, jangan) {
		t.Errorf("bantuan memuat bahasa lain padahal config menyebut satu:\n%s", keluar)
	}
}

// `-only -h` menanyakan paket generated bernama "-h", bukan bantuan. Pindaian pra-bendera harus
// tahu bendera mana yang memakan argumen berikutnya.
func TestNilaiBenderaTidakSalahDibacaSebagaiBantuan(t *testing.T) {
	pindai := func(argv ...string) (string, string, bool) {
		// Daftar bendera-bernilai milik gendto SENDIRI, bukan daftar buatan uji: yang harus
		// dibuktikan adalah bahwa alat ini mendaftarkan `only` di sana.
		return cfg.PraPindai(argv, benderaBernilai)
	}
	if _, _, bantuan := pindai("-only", "-h"); bantuan {
		t.Error("pindaian membaca nilai -only sebagai permintaan bantuan")
	}
	if _, _, bantuan := pindai("-h"); !bantuan {
		t.Error("pindaian tidak mengenali -h")
	}
	if _, _, bantuan := pindai("--help"); !bantuan {
		t.Error("pindaian tidak mengenali --help")
	}
	if konf, pesan, _ := pindai("-config=/a", "--messages", "/b"); konf != "/a" || pesan != "/b" {
		t.Errorf("pindaian = %q, %q", konf, pesan)
	}
}

// --- Portabilitas ----------------------------------------------------------------------

// Nama proyek asal disusun saat jalan, bukan ditulis harfiah — kalau ditulis harfiah, uji ini
// akan menemukan dirinya sendiri dan selalu merah.
func TestTidakAdaNamaProyekAsalDiBerkasAlatIni(t *testing.T) {
	jarum := []string{"desa" + "kita", "otori" + "code"}
	berkas, err := filepath.Glob("*.go")
	if err != nil {
		t.Fatal(err)
	}
	pesan, err := filepath.Glob(filepath.Join("..", "messages", "*.json"))
	if err != nil {
		t.Fatal(err)
	}
	for _, f := range append(berkas, pesan...) {
		isi := bacaBerkas(t, f)
		for _, j := range jarum {
			if strings.Contains(isi, j) {
				t.Errorf("%s memuat nama proyek asal %q", f, j)
			}
		}
	}
}

// kodeSaja membuang tiap baris komentar dari berkas hasil.
//
// Ia ada karena sebuah assertion POSITIF yang mengenai komentar adalah assertion yang lulus
// tanpa menyentuh kode: prosa katalog yang generator tulis ke dalam keluaran kebetulan memuat
// ekspresi yang sama dengan kode di bawahnya, dan uji yang mencarinya di seluruh berkas akan
// hijau walau kodenya dicabut seluruhnya.
func kodeSaja(isi string) string {
	var b strings.Builder
	for _, baris := range strings.Split(isi, "\n") {
		if strings.HasPrefix(strings.TrimSpace(baris), "//") {
			continue
		}
		b.WriteString(baris)
		b.WriteString("\n")
	}
	return b.String()
}

func bacaBerkas(t *testing.T, jalur string) string {
	t.Helper()
	b, err := os.ReadFile(jalur)
	if err != nil {
		t.Fatalf("baca %s: %v", jalur, err)
	}
	return string(b)
}
