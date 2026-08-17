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

// --- Tiga fungsi murni, sesuai brief -----------------------------------------------------

func contohConfig() cfg.Config {
	var c cfg.Config
	c.Layout.BackendDir = "apps/api"
	c.Go.ModulePath = "example.com/p/apps/api"
	c.Go.GenDir = "internal/gen"
	c.Go.FeatureDir = "internal/feature"
	c.Go.DtoconvPkg = "internal/platform/dtoconv"
	c.Go.GenSuffix = ".gen.go"
	c.Language = "id"
	return c
}

func TestHeaderMemakaiImportDariConfig(t *testing.T) {
	got := headerRegister(contohConfig(), katalogUji(t, "id"), "buku-tamu", "keluarga", "keluarga")
	if !strings.Contains(got, "example.com/p/apps/api/internal/gen/keluarga") {
		t.Errorf("import path tidak dari config:\n%s", got)
	}
	if strings.Contains(got, "desa"+"kita") || strings.Contains(got, "otori"+"code") {
		t.Errorf("nama proyek asal bocor ke keluaran:\n%s", got)
	}
	if !strings.Contains(got, penandaGenerated) {
		t.Errorf("penanda generated hilang dari header:\n%s", got)
	}
}

func TestNamaBerkasMemakaiGenSuffix(t *testing.T) {
	c := contohConfig()
	c.Go.GenSuffix = ".dibangkitkan.go"
	if got := namaBerkas(c, "register"); got != "register.dibangkitkan.go" {
		t.Errorf("namaBerkas = %q", got)
	}
}

func TestDeteksiBekuDariNamaBerkasBukanDaftar(t *testing.T) {
	// Modul dianggap beku bila ada berkas kerangka TANPA sufiks generated.
	if !sudahBeku([]string{"register.go", "handler.gen.go"}, contohConfig()) {
		t.Error("register.go tanpa sufiks seharusnya menandakan beku")
	}
	if sudahBeku([]string{"register.gen.go", "handler.gen.go"}, contohConfig()) {
		t.Error("semua bersufiks generated seharusnya belum beku")
	}
	// Berkas yang BUKAN berkas kerangka tidak boleh dihitung — kalau ia dihitung, tiap modul
	// yang punya satu berkas tulisan tangan apa pun akan terbaca beku.
	if sudahBeku([]string{"dto_keluarga.gen.go", "doc.go"}, contohConfig()) {
		t.Error("berkas di luar daftar kerangka tidak menandakan beku")
	}
}

// Sufiks yang membuat nama tergenerate dan nama beku identik mematikan seluruh mekanisme
// pembekuan. Ia dihentikan, bukan dilewati diam-diam.
func TestSufiksYangMenabrakNamaBekuDitolak(t *testing.T) {
	c := buatProyek(t, opsiProyek{suffix: ".go"})
	kode, _, galat := lari(t, "-config", c.akar, "-tag", "keluarga", "-pkg", "keluarga")
	if kode != 2 {
		t.Fatalf("kode = %d, mau 2; galat = %s", kode, galat)
	}
	mau := katalogUji(t, "id").T("genmodule.sufiks_menabrak_beku",
		map[string]string{"sufiks": ".go", "berkas": "register.go"})
	if !strings.Contains(galat, mau) {
		t.Errorf("galat bukan dari penjaga sufiks:\n%s", galat)
	}
}

// --- Proyek contoh ------------------------------------------------------------------------

// isiGenKeluarga adalah paket generated palsu: ia memuat persis bentuk-bentuk yang alat ini
// harus bedakan — metaData WAJIB vs OPSIONAL, rantai alias dua hop, respons 204 tanpa badan,
// dan tipe yang bercermin vs tidak.
const isiGenKeluarga = `package keluarga

import (
	"context"
	"time"
)

const SuccessStatusSuccess SuccessStatus = "success"

type SuccessStatus string

type Pagination struct {
	Page       int
	Limit      int
	Total      int
	TotalPages int
}

type SchemasMetaData struct {
	Pagination Pagination
}

type MetaData struct {
	Catatan *string
}

type Keluarga struct {
	Id     string
	Nama   string
	Dibuat time.Time
}

type KeluargaCreateRequest struct {
	Nama string
}

type PostKeluargaJSONBody = []KeluargaCreateRequest

type PostKeluargaJSONRequestBody = PostKeluargaJSONBody

type GetKeluargaParams struct {
	Page *int
}

type GetKeluargaRequestObject struct {
	Params GetKeluargaParams
}

type GetKeluarga200JSONResponse struct {
	Data     []Keluarga
	MetaData SchemasMetaData
	Status   SuccessStatus
	Message  string
}

type GetKeluargaResponseObject interface{ VisitGetKeluargaResponse() error }

type GetKeluargaByIdRequestObject struct {
	Id string
}

type GetKeluargaById200JSONResponse struct {
	Data     Keluarga
	MetaData *MetaData
	Status   SuccessStatus
	Message  string
}

type GetKeluargaByIdResponseObject interface{ VisitGetKeluargaByIdResponse() error }

type PostKeluargaRequestObject struct {
	Body *PostKeluargaJSONRequestBody
}

type PostKeluarga201JSONResponse struct {
	Data    Keluarga
	Status  SuccessStatus
	Message string
}

type PostKeluargaResponseObject interface{ VisitPostKeluargaResponse() error }

type GetKeluargaStatistikRequestObject struct{}

type GetKeluargaStatistik200JSONResponse struct {
	Data    Keluarga
	Status  SuccessStatus
	Message string
}

type GetKeluargaStatistikResponseObject interface {
	VisitGetKeluargaStatistikResponse() error
}

type DeleteKeluargaByIdRequestObject struct {
	Id string
}

type DeleteKeluargaById204Response struct{}

type DeleteKeluargaByIdResponseObject interface{ VisitDeleteKeluargaByIdResponse() error }

type StrictServerInterface interface {
	// (GET /keluarga)
	GetKeluarga(ctx context.Context, request GetKeluargaRequestObject) (GetKeluargaResponseObject, error)
	// (POST /keluarga)
	PostKeluarga(ctx context.Context, request PostKeluargaRequestObject) (PostKeluargaResponseObject, error)
	// (GET /keluarga/{id})
	GetKeluargaById(ctx context.Context, request GetKeluargaByIdRequestObject) (GetKeluargaByIdResponseObject, error)
	// (GET /keluarga/statistik)
	GetKeluargaStatistik(ctx context.Context, request GetKeluargaStatistikRequestObject) (GetKeluargaStatistikResponseObject, error)
	// (DELETE /keluarga/{id})
	DeleteKeluargaById(ctx context.Context, request DeleteKeluargaByIdRequestObject) (DeleteKeluargaByIdResponseObject, error)
}
`

// isiCermin meniru keluaran gendto: yang menentukan sebuah tipe punya cermin adalah adanya
// KONVERTERNYA, bukan adanya tipe dto-nya.
const isiCermin = `package keluarga

type dtoKeluarga struct{}

func dtoKeluargaFromWire(w keluargagen.Keluarga) dtoKeluarga { return dtoKeluarga{} }

type dtoKeluargaCreateRequest struct{}

func dtoKeluargaCreateRequestFromWire(w keluargagen.KeluargaCreateRequest) dtoKeluargaCreateRequest {
	return dtoKeluargaCreateRequest{}
}

type dtoGetKeluargaParams struct{}

func dtoGetKeluargaParamsFromWire(w keluargagen.GetKeluargaParams) dtoGetKeluargaParams {
	return dtoGetKeluargaParams{}
}
`

type opsiProyek struct {
	bahasa     string
	suffix     string
	backendDir string
	genDir     string
	fiturDir   string
	konvPkg    string
	modul      string
	fitur      string // direktori fitur yang dibuat; "" = "keluarga"
	tanpaFitur bool   // jangan buat direktori fitur sama sekali
	tanpaIface bool   // paket generated tanpa StrictServerInterface
	tanpaKonst bool   // paket generated tanpa konstanta status amplop
}

type contoh struct {
	akar    string
	dirGen  string
	dirFit  string
	dirKon  string
	dirFitK string // direktori fitur modul ini
}

func buatProyek(t *testing.T, o opsiProyek) contoh {
	t.Helper()
	isiOr := func(v, d string) string {
		if v == "" {
			return d
		}
		return v
	}
	bahasa := isiOr(o.bahasa, "id")
	suffix := isiOr(o.suffix, ".gen.go")
	backendDir := isiOr(o.backendDir, "apps/api")
	genDir := isiOr(o.genDir, "internal/gen")
	fiturDir := isiOr(o.fiturDir, "internal/feature")
	konvPkg := isiOr(o.konvPkg, "internal/platform/dtoconv")
	modul := isiOr(o.modul, "example.com/p/apps/api")
	fitur := isiOr(o.fitur, "keluarga")

	akar := t.TempDir()
	c := contoh{
		akar:   akar,
		dirGen: filepath.Join(akar, backendDir, genDir),
		dirFit: filepath.Join(akar, backendDir, fiturDir),
		dirKon: filepath.Join(akar, "packages/contract"),
	}
	c.dirFitK = filepath.Join(c.dirFit, fitur)

	isi := `{"layout":{"contractDir":"packages/contract","backendDir":"` + backendDir + `","frontendDir":"apps/web"},
"go":{"modulePath":"` + modul + `","genDir":"` + genDir + `","featureDir":"` + fiturDir + `",
"dtoconvPkg":"` + konvPkg + `","genSuffix":"` + suffix + `"},
"ledgers":{"mountedModules":"mounted-modules.json"},"language":"` + bahasa + `"}`
	tulis(t, filepath.Join(akar, "standard.config.json"), isi)

	gen := isiGenKeluarga
	if o.tanpaIface {
		gen = strings.Split(gen, "type StrictServerInterface interface {")[0]
	}
	if o.tanpaKonst {
		const konst = "const SuccessStatusSuccess SuccessStatus = \"success\"\n\n"
		if !strings.Contains(gen, konst) {
			t.Fatal("fixture tidak memuat konstanta status — opsi tanpaKonst tidak menguji apa pun")
		}
		gen = strings.Replace(gen, konst, "", 1)
	}
	tulis(t, filepath.Join(c.dirGen, "keluarga", "keluarga"+suffix), gen)

	if !o.tanpaFitur {
		mkdir(t, c.dirFitK)
		tulis(t, filepath.Join(c.dirFitK, "dto_keluarga"+suffix), isiCermin)
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

// kodeSaja membuang tiap baris komentar dari berkas hasil.
//
// Ia ada karena sebuah assertion POSITIF yang mengenai komentar adalah assertion yang lulus
// tanpa menyentuh kode. Yang membuktikannya: `appcontext.From(ctx)` dulu dicari di SELURUH
// berkas handler, dan yang memuaskannya adalah prosa katalog yang generator tulis sebagai
// komentar — jadi mencabut ekspresi itu dari SETIAP pemanggilan handler tetap hijau.
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

// badanFungsi memotong satu fungsi dari berkas hasil, dari baris `func`-nya sampai `}` di kolom
// nol. Assertion yang mengenai seluruh berkas tidak bisa membedakan "ada di fungsi ini" dari
// "ada di fungsi lain".
func badanFungsi(t *testing.T, isi, tandaTangan string) string {
	t.Helper()
	i := strings.Index(isi, tandaTangan)
	if i < 0 {
		t.Fatalf("fungsi %q tidak ada — uji ini tidak menguji apa pun:\n%s", tandaTangan, isi)
	}
	sisa := isi[i:]
	j := strings.Index(sisa, "\n}\n")
	if j < 0 {
		t.Fatalf("fungsi %q tidak berujung:\n%s", tandaTangan, sisa)
	}
	return sisa[:j]
}

func bacaBerkas(t *testing.T, jalur string) string {
	t.Helper()
	b, err := os.ReadFile(jalur)
	if err != nil {
		t.Fatalf("baca %s: %v", jalur, err)
	}
	return string(b)
}

func barisPertama(s string) string {
	if i := strings.IndexByte(s, '\n'); i >= 0 {
		return s[:i]
	}
	return s
}

// gen menjalankan alat untuk proyek contoh standar.
func gen(t *testing.T, c contoh, tambahan ...string) (int, string, string) {
	t.Helper()
	return lari(t, append([]string{"-config", c.akar, "-tag", "keluarga", "-pkg", "keluarga"}, tambahan...)...)
}

// --- Dry-run --------------------------------------------------------------------------------

func TestDryRunAdalahDefaultDanTidakMenulis(t *testing.T) {
	c := buatProyek(t, opsiProyek{})

	kode, keluar, galat := gen(t, c)
	if kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}
	isi, err := os.ReadDir(c.dirFitK)
	if err != nil {
		t.Fatal(err)
	}
	// Hanya cermin DTO yang disiapkan uji ini yang boleh ada.
	if len(isi) != 1 || isi[0].Name() != "dto_keluarga.gen.go" {
		var nama []string
		for _, e := range isi {
			nama = append(nama, e.Name())
		}
		t.Fatalf("dry-run menulis berkas: %v", nama)
	}
	if mau := katalogUji(t, "id").T("gen.dry_run", map[string]string{"jumlah": "5"}); !strings.Contains(keluar, mau) {
		t.Errorf("keluaran tidak melaporkan rencana %q:\n%s", mau, keluar)
	}
}

// -out yang belum ada tidak boleh DIBUAT saat dry-run. Sumber alat ini memanggil MkdirAll
// sebelum memeriksa -apply, jadi "hanya melaporkan" tetap menyentuh disk.
func TestDryRunDenganOutTidakMembuatDirektori(t *testing.T) {
	c := buatProyek(t, opsiProyek{})
	keluaran := filepath.Join(t.TempDir(), "belum-ada")

	if kode, _, galat := gen(t, c, "-out", keluaran); kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}
	if _, err := os.Stat(keluaran); err == nil {
		t.Error("dry-run membuat direktori -out")
	}
}

// --- Keluaran -------------------------------------------------------------------------------

func TestApplyMenulisKelimaBerkasDenganJalurDariConfig(t *testing.T) {
	c := buatProyek(t, opsiProyek{})
	if kode, _, galat := gen(t, c, "-apply"); kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}

	reg := kodeSaja(bacaBerkas(t, filepath.Join(c.dirFitK, "register.gen.go")))
	for _, mau := range []string{
		"package keluarga",
		`keluargagen "example.com/p/apps/api/internal/gen/keluarga"`,
		"func Register(public, protected *gin.RouterGroup, db *gorm.DB) {",
		"keluargagen.Mount(public, protected, &handler{svc: newService(nil)})",
	} {
		if !strings.Contains(reg, mau) {
			t.Errorf("register tidak memuat %q:\n%s", mau, reg)
		}
	}

	// Ekspresi PEMANGGILAN handler diuji terpisah di
	// TestPanggilanHandlerMeneruskanKonteksDanSeluruhArgumen: mencarinya di sini tidak sah,
	// karena komentar katalog di berkas ini menyebut ekspresi yang sama.
	han := kodeSaja(bacaBerkas(t, filepath.Join(c.dirFitK, "handler.gen.go")))
	for _, mau := range []string{
		`"example.com/p/apps/api/internal/platform/appcontext"`,
		`"example.com/p/apps/api/internal/platform/dtoconv"`,
		"var _ keluargagen.StrictServerInterface = (*handler)(nil)",
		"dtoconv.Slice(data, func(v dtoKeluarga) keluargagen.Keluarga { return v.toWire() })",
		"out.Status = keluargagen.SuccessStatusSuccess",
		// Respons sukses diambil dari AST: POST-nya 201, DELETE-nya 204 tanpa badan.
		"var out keluargagen.PostKeluarga201JSONResponse",
		"var out keluargagen.DeleteKeluargaById204Response",
	} {
		if !strings.Contains(han, mau) {
			t.Errorf("handler tidak memuat %q:\n%s", mau, han)
		}
	}
	// Respons 204 tidak punya field amplop; menulisinya adalah galat kompilasi.
	blokDelete := badanFungsi(t, han, "func (h *handler) DeleteKeluargaById(")
	for _, jangan := range []string{"out.Status", "out.Message"} {
		if strings.Contains(blokDelete, jangan) {
			t.Errorf("handler 204 mengisi %q padahal responsnya tanpa field itu:\n%s", jangan, blokDelete)
		}
	}

	rep := kodeSaja(bacaBerkas(t, filepath.Join(c.dirFitK, "repository.gen.go")))
	svc := kodeSaja(bacaBerkas(t, filepath.Join(c.dirFitK, "service.gen.go")))
	for _, mau := range []string{
		`"example.com/p/apps/api/internal/platform/appcontext"`,
		`"example.com/p/apps/api/internal/platform/httpx"`,
		"type store interface {",
		"GetKeluarga(ctx *appcontext.AppContext, params dtoGetKeluargaParams) ([]dtoKeluarga, httpx.Pagination, error)",
	} {
		if !strings.Contains(rep, mau) {
			t.Errorf("repository tidak memuat %q:\n%s", mau, rep)
		}
	}
	if !strings.Contains(svc, "func newService(store store) *service { return &service{store: store} }") {
		t.Errorf("service tidak memuat konstruktornya:\n%s", svc)
	}
}

// Petunjuk regen di header tiap berkas wajib menyebut tag DAN paketnya. Perintah regen yang
// kehilangan salah satunya adalah perintah yang gagal saat dijalankan pembacanya — dan header
// register dirakit lewat jalur sendiri, jadi field yang lupa diteruskan hilang tanpa suara.
func TestPetunjukRegenDiSetiapBerkasMenyebutTagDanPaket(t *testing.T) {
	c := buatProyek(t, opsiProyek{})
	kode, _, galat := lari(t, "-config", c.akar, "-tag", "buku-tamu", "-pkg", "keluarga", "-apply")
	if kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}
	mau := katalogUji(t, "id").T("genmodule.komentar.header", map[string]string{
		"tag": "buku-tamu", "pkg": "keluarga", "gen": "x", "beku": "y",
	})
	regen := barisPertama(mau)
	if !strings.Contains(regen, "buku-tamu") || !strings.Contains(regen, "keluarga") {
		t.Fatalf("baris regen katalog tidak memuat kedua nilai (%q) — uji ini tidak menguji apa pun", regen)
	}
	for _, dasar := range berkasKerangka {
		isi := bacaBerkas(t, filepath.Join(c.dirFitK, dasar+".gen.go"))
		if !strings.Contains(isi, regen) {
			t.Errorf("%s: petunjuk regen tidak lengkap; mau baris %q dalam:\n%s", dasar, regen,
				isi[:min(len(isi), 400)])
		}
	}
}

// Baris PEMANGGILAN di tiap handler — bukan kehadiran ekspresinya di berkas.
//
// Berkas inilah yang membawa konteks permintaan ke rantai service/store yang tanda tangannya
// dijaga TestSetiapMetodeStoreMembawaKonteksPermintaan. Tanda tangan yang benar tidak menolong
// kalau pemanggilnya tidak meneruskan apa-apa: dua cacat independen — konteks dicabut dari
// daftar argumen, dan seluruh argumen sisanya dicabut — sama-sama menghasilkan Go yang tidak
// kompilasi di proyek target, tapi keduanya lolos assertion yang hanya mencari
// `appcontext.From(ctx)` di seluruh berkas, karena komentar katalog di berkas ini menyebutnya.
//
// Karena itu: baris pemanggilan UTUH, dipotong dari BADAN fungsi handler yang bersangkutan,
// sesudah seluruh komentar dibuang.
func TestPanggilanHandlerMeneruskanKonteksDanSeluruhArgumen(t *testing.T) {
	c := buatProyek(t, opsiProyek{})
	if kode, _, galat := gen(t, c, "-apply"); kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}
	han := kodeSaja(bacaBerkas(t, filepath.Join(c.dirFitK, "handler.gen.go")))

	// Satu baris per BENTUK argumen yang alat ini bisa pancarkan: nol argumen, id telanjang,
	// params bercermin, dan badan request lewat rantai alias dua hop.
	mau := map[string]string{
		"GetKeluargaStatistik": "h.svc.GetKeluargaStatistik(appcontext.From(ctx))",
		"GetKeluargaById":      "h.svc.GetKeluargaById(appcontext.From(ctx), request.Id)",
		"DeleteKeluargaById":   "h.svc.DeleteKeluargaById(appcontext.From(ctx), request.Id)",
		"GetKeluarga":          "h.svc.GetKeluarga(appcontext.From(ctx), dtoGetKeluargaParamsFromWire(request.Params))",
		"PostKeluarga":         "h.svc.PostKeluarga(appcontext.From(ctx), dtoconv.Ptr(request.Body, ",
	}
	for op, panggilan := range mau {
		badan := badanFungsi(t, han, "func (h *handler) "+op+"(")
		if !strings.Contains(badan, panggilan) {
			t.Errorf("%s: baris pemanggilan tidak utuh.\nmau memuat: %s\nbadan:\n%s", op, panggilan, badan)
		}
	}
	// Kontrol positif: kelima operasi memang ada, jadi peta di atas tidak diam-diam menciut.
	if n := strings.Count(han, "func (h *handler) "); n != len(mau) {
		t.Errorf("handler punya %d metode, peta uji punya %d — uji ini tidak memeriksa yang ia kira",
			n, len(mau))
	}
}

// Lapis kueri adalah SATU-SATUNYA pemegang predikat penyewa (T-01), jadi alat ini tidak boleh
// memancarkannya — dan `Register` harus menyuntikkan nil supaya keadaan setengah jadi itu
// TERLIHAT, bukan diam.
func TestLapisKueriTidakDigenerateDanStoreDisuntikNil(t *testing.T) {
	c := buatProyek(t, opsiProyek{})
	if kode, _, galat := gen(t, c, "-apply"); kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}
	entri, err := os.ReadDir(c.dirFitK)
	if err != nil {
		t.Fatal(err)
	}
	mau := map[string]bool{
		"dto_keluarga.gen.go": true, "register.gen.go": true, "handler.gen.go": true,
		"service.gen.go": true, "repository.gen.go": true,
		"repository_tenancy_test.contoh.md": true,
	}
	for _, e := range entri {
		if !mau[e.Name()] {
			t.Errorf("berkas tak terduga dibangkitkan: %s", e.Name())
		}
		delete(mau, e.Name())
	}
	if len(mau) != 0 {
		t.Errorf("berkas yang diharapkan tidak ada: %v", mau)
	}
	reg := kodeSaja(bacaBerkas(t, filepath.Join(c.dirFitK, "register.gen.go")))
	if !strings.Contains(reg, "newService(nil)") {
		t.Errorf("store tidak disuntik nil — keadaan setengah jadi jadi tidak terlihat:\n%s", reg)
	}
}

// Setiap metode store membawa konteks permintaan, termasuk yang cuma menerima id telanjang.
// T-02 menuntut TANDA TANGANNYA yang benar: pemanggil yang lupa meneruskan konteks harus gagal
// KOMPILASI, bukan lolos ke pemeriksa pasca-muat yang bisa terlupa.
func TestSetiapMetodeStoreMembawaKonteksPermintaan(t *testing.T) {
	c := buatProyek(t, opsiProyek{})
	if kode, _, galat := gen(t, c, "-apply"); kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}
	rep := kodeSaja(bacaBerkas(t, filepath.Join(c.dirFitK, "repository.gen.go")))
	blok := rep[strings.Index(rep, "type store interface {"):]

	n := 0
	for _, baris := range strings.Split(blok, "\n") {
		baris = strings.TrimSpace(baris)
		if !strings.HasPrefix(baris, "Get") && !strings.HasPrefix(baris, "Post") &&
			!strings.HasPrefix(baris, "Delete") {
			continue
		}
		n++
		if !strings.Contains(baris, "(ctx *appcontext.AppContext") {
			t.Errorf("metode store tanpa konteks permintaan: %s", baris)
		}
	}
	if n != 5 {
		t.Fatalf("metode store terhitung %d, mau 5 — uji ini tidak memeriksa yang ia kira", n)
	}
}

// B-01: tipe kabel berhenti di handler. Lapis kueri dan lapis layanan yang mengimpor paket
// generated membalik rantai sumber kebenaran — dan bentuk itulah yang kerangka lama pancarkan.
func TestLapisKueriDanLayananTidakMenyebutTipeGenerated(t *testing.T) {
	c := buatProyek(t, opsiProyek{})
	if kode, _, galat := gen(t, c, "-apply"); kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}
	for _, nama := range []string{"repository.gen.go", "service.gen.go"} {
		isi := bacaBerkas(t, filepath.Join(c.dirFitK, nama))
		for _, jangan := range []string{"keluargagen", "internal/gen/keluarga", "SchemasMetaData"} {
			if strings.Contains(isi, jangan) {
				t.Errorf("%s menyebut tipe generated %q:\n%s", nama, jangan, isi)
			}
		}
		if !strings.Contains(isi, "httpx.Pagination") {
			t.Errorf("%s tidak memakai tipe paginasi platform", nama)
		}
	}
}

// metaData OPSIONAL (pointer) tidak ikut tanda tangan store: ia tidak diturunkan dari kueri, dan
// memaksanya masuk hanya menambah nilai balik mati. Bedanya terbaca dari POINTER-nya.
func TestMetaDataOpsionalTidakMasukTandaTanganStore(t *testing.T) {
	c := buatProyek(t, opsiProyek{})
	if kode, _, galat := gen(t, c, "-apply"); kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}
	rep := kodeSaja(bacaBerkas(t, filepath.Join(c.dirFitK, "repository.gen.go")))
	for _, baris := range strings.Split(rep, "\n") {
		if !strings.Contains(baris, "GetKeluargaById(") {
			continue
		}
		if strings.Contains(baris, "httpx.Pagination") {
			t.Errorf("metaData opsional ikut tanda tangan store: %s", baris)
		}
		return
	}
	t.Fatal("GetKeluargaById tidak ada di store — uji ini tidak menguji apa pun")
}

// Rantai alias DUA HOP: `Body *PostKeluargaJSONRequestBody` -> `PostKeluargaJSONBody` ->
// `[]KeluargaCreateRequest`. Versi satu-hop berhenti di nama tengah, yang tidak dicerminkan
// gendto, sehingga tipe WIRE bocor ke store — diam-diam, tanpa satu galat kompilasi pun.
func TestRantaiAliasDuaHopDiselesaikanSampaiTipeBercermin(t *testing.T) {
	c := buatProyek(t, opsiProyek{})
	if kode, _, galat := gen(t, c, "-apply"); kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}
	rep := kodeSaja(bacaBerkas(t, filepath.Join(c.dirFitK, "repository.gen.go")))
	if !strings.Contains(rep, "body *[]dtoKeluargaCreateRequest") {
		t.Errorf("badan request tidak diterjemahkan ke tipe cermin:\n%s", rep)
	}
	if strings.Contains(rep, "JSONRequestBody") || strings.Contains(rep, "JSONBody") {
		t.Errorf("nama plumbing bocor ke store:\n%s", rep)
	}
}

// Config yang memindahkan SELURUH layout harus memindahkan keluarannya juga. Kalau ada satu
// literal jalur yang tersisa di alat, uji ini menemukannya: tidak satu pun nilai default dipakai.
func TestSeluruhLayoutIkutBerpindahBersamaConfig(t *testing.T) {
	c := buatProyek(t, opsiProyek{
		backendDir: "servis",
		genDir:     "dalam/dibangkitkan",
		fiturDir:   "dalam/modul",
		konvPkg:    "dalam/alat/pemetaan",
		modul:      "contoh.test/acme/servis",
		suffix:     ".dibangkitkan.go",
	})
	if kode, _, galat := gen(t, c, "-apply"); kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}
	hanMentah := bacaBerkas(t, filepath.Join(c.dirFitK, "handler.dibangkitkan.go"))
	repMentah := bacaBerkas(t, filepath.Join(c.dirFitK, "repository.dibangkitkan.go"))
	han, rep := kodeSaja(hanMentah), kodeSaja(repMentah)
	bacaBerkas(t, filepath.Join(c.dirFitK, "register.dibangkitkan.go"))
	bacaBerkas(t, filepath.Join(c.dirFitK, "service.dibangkitkan.go"))

	for _, mau := range []string{
		`keluargagen "contoh.test/acme/servis/dalam/dibangkitkan/keluarga"`,
		`"contoh.test/acme/servis/dalam/alat/pemetaan"`,
		`"contoh.test/acme/servis/dalam/alat/appcontext"`,
		"pemetaan.Slice(",
	} {
		if !strings.Contains(han, mau) {
			t.Errorf("handler tidak memuat %q:\n%s", mau, han)
		}
	}
	if !strings.Contains(rep, `"contoh.test/acme/servis/dalam/alat/httpx"`) {
		t.Errorf("repository tidak memakai jalur platform dari config:\n%s", rep)
	}
	for _, jangan := range []string{"internal/gen", "internal/feature", "internal/platform",
		"dtoconv.", "apps/api"} {
		// Negatif mengenai SELURUH berkas, komentar termasuk: jalur terpaku yang bocor ke
		// komentar tetap bocor.
		for nama, isi := range map[string]string{"handler": hanMentah, "repository": repMentah} {
			if strings.Contains(isi, jangan) {
				t.Errorf("%s: jalur terpaku %q bocor ke keluaran:\n%s", nama, jangan, isi)
			}
		}
	}
}

// -feature memisahkan nama paket generated dari nama direktori fitur. Kalau ia diabaikan,
// keluarannya mendarat di paket yang salah — dan itu baru terlihat saat build.
func TestFeatureMemisahkanNamaPaketDariNamaDirektori(t *testing.T) {
	c := buatProyek(t, opsiProyek{fitur: "kk"})
	kode, _, galat := lari(t, "-config", c.akar, "-tag", "keluarga", "-pkg", "keluarga",
		"-feature", "kk", "-apply")
	if kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}
	reg := kodeSaja(bacaBerkas(t, filepath.Join(c.dirFit, "kk", "register.gen.go")))
	if !strings.Contains(reg, "package kk") {
		t.Errorf("keluaran tidak memakai nama paket fitur:\n%s", barisPertama(reg))
	}
	if !strings.Contains(reg, "internal/gen/keluarga") {
		t.Errorf("keluaran tidak mengimpor paket generated yang benar:\n%s", reg)
	}
}

// --- Bahasa ---------------------------------------------------------------------------------

// Komentar yang generator TULIS ke dalam kode proyek target adalah teks menghadap-pengguna.
// Kalau ia terpaku di alat, proyek berbahasa Inggris menerima komentar berbahasa Indonesia.
func TestKomentarHasilMengikutiBahasaDiConfig(t *testing.T) {
	berkasKunci := map[string]string{
		"register.gen.go":                   "genmodule.komentar.register",
		"handler.gen.go":                    "genmodule.komentar.handler",
		"service.gen.go":                    "genmodule.komentar.service",
		"repository.gen.go":                 "genmodule.komentar.store",
		"repository_tenancy_test.contoh.md": "genmodule.tenancy.checklist",
	}
	vars := map[string]string{
		"jumlah": "5", "tag": "keluarga", "alias": "keluargagen", "fitur": "keluarga",
		"ctx": "appcontext.AppContext", "router": "gin.RouterGroup", "db": "gorm.DB",
		"metode": "-",
	}
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
		c := buatProyek(t, opsiProyek{bahasa: bahasa})
		if kode, _, galat := gen(t, c, "-apply"); kode != 0 {
			t.Fatalf("bahasa %s: kode = %d, galat = %s", bahasa, kode, galat)
		}
		for nama, kunci := range berkasKunci {
			isi := bacaBerkas(t, filepath.Join(c.dirFitK, nama))
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
		pola := regexp.MustCompile(`(?m)^// Code generated .* DO NOT EDIT\.$`)
		if isi := bacaBerkas(t, filepath.Join(c.dirFitK, "handler.gen.go")); !pola.MatchString(isi) {
			t.Errorf("bahasa %s: penanda generated tidak cocok pola mesin:\n%s", bahasa, barisPertama(isi))
		}
	}
}

// --- Daftar periksa lintas-penyewa -----------------------------------------------------------

func TestChecklistTenancyMenyebutMetodeRawanBocor(t *testing.T) {
	c := buatProyek(t, opsiProyek{})
	if kode, _, galat := gen(t, c, "-apply"); kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}
	isi := bacaBerkas(t, filepath.Join(c.dirFitK, "repository_tenancy_test.contoh.md"))
	// Bentuk (ctx) dan (ctx, id string) — dan HANYA itu. PostKeluarga bermuatan, jadi ia tidak
	// bisa dijalankan tanpa penyiapan dan tidak masuk daftar.
	for _, mau := range []string{"`GetKeluargaStatistik` (ctx)", "`GetKeluargaById` (ctx, id string)",
		"`DeleteKeluargaById` (ctx, id string)"} {
		if !strings.Contains(isi, mau) {
			t.Errorf("checklist tidak menyebut %s:\n%s", mau, isi)
		}
	}
	// Metode bermuatan dan metode ber-params tidak bisa dijalankan tanpa penyiapan, jadi mereka
	// TIDAK didaftar — dan batasan itu ditulis di berkasnya, bukan didiamkan.
	for _, jangan := range []string{"`PostKeluarga`", "`GetKeluarga` "} {
		if strings.Contains(isi, jangan) {
			t.Errorf("checklist menyebut metode di luar dua bentuk itu (%s):\n%s", jangan, isi)
		}
	}
	if !strings.Contains(isi, "T-01") || !strings.Contains(isi, "T-02") {
		t.Errorf("checklist tidak menyitir ID aturannya:\n%s", isi)
	}
}

// Berkas kosong yang terlihat seperti "sudah ditangani" lebih buruk daripada tidak ada berkas.
func TestChecklistTidakDipancarkanSaatTakAdaKandidat(t *testing.T) {
	c := buatProyek(t, opsiProyek{})
	// Sisakan satu operasi saja, dan ia bermuatan.
	jalur := filepath.Join(c.dirGen, "keluarga", "keluarga.gen.go")
	isi := bacaBerkas(t, jalur)
	isi = strings.Replace(isi, `	// (GET /keluarga)
	GetKeluarga(ctx context.Context, request GetKeluargaRequestObject) (GetKeluargaResponseObject, error)
`, "", 1)
	isi = strings.Replace(isi, `	// (GET /keluarga/{id})
	GetKeluargaById(ctx context.Context, request GetKeluargaByIdRequestObject) (GetKeluargaByIdResponseObject, error)
`, "", 1)
	isi = strings.Replace(isi, `	// (DELETE /keluarga/{id})
	DeleteKeluargaById(ctx context.Context, request DeleteKeluargaByIdRequestObject) (DeleteKeluargaByIdResponseObject, error)
`, "", 1)
	isi = strings.Replace(isi, `	// (GET /keluarga/statistik)
	GetKeluargaStatistik(ctx context.Context, request GetKeluargaStatistikRequestObject) (GetKeluargaStatistikResponseObject, error)
`, "", 1)
	if strings.Contains(isi, "GetKeluargaStatistik(ctx") {
		t.Fatal("mutasi fixture tidak mendarat — uji ini tidak menguji apa pun")
	}
	tulis(t, jalur, isi)

	if kode, keluar, galat := gen(t, c, "-apply"); kode != 0 {
		t.Fatalf("kode = %d, keluar = %s, galat = %s", kode, keluar, galat)
	}
	if _, err := os.Stat(filepath.Join(c.dirFitK, "repository_tenancy_test.contoh.md")); err == nil {
		t.Error("checklist kosong tetap dipancarkan")
	}
}

// --- Penolakan modul yang sudah dikawinkan tangan --------------------------------------------

func TestModulKawinTanganDitolakTanpaForce(t *testing.T) {
	c := buatProyek(t, opsiProyek{})
	tulis(t, filepath.Join(c.dirFitK, "register.go"), "package keluarga\n")

	kode, _, galat := gen(t, c, "-apply")
	if kode != 2 {
		t.Fatalf("kode = %d, mau 2; galat = %s", kode, galat)
	}
	kat := katalogUji(t, "id")
	if mau := kat.T("gen.modul_beku", map[string]string{"pkg": "keluarga"}); !strings.Contains(galat, mau) {
		t.Errorf("galat bukan dari penjaga kawin-tangan:\n%s", galat)
	}
	if !strings.Contains(galat, "register.go") {
		t.Errorf("galat tidak menyebut berkas yang ditemukan:\n%s", galat)
	}
	if _, err := os.Stat(filepath.Join(c.dirFitK, "handler.gen.go")); err == nil {
		t.Error("alat tetap menulis meski modulnya sudah dikawinkan tangan")
	}
}

func TestForceMenembusPenolakanKawinTangan(t *testing.T) {
	c := buatProyek(t, opsiProyek{})
	tulis(t, filepath.Join(c.dirFitK, "register.go"), "package keluarga\n")

	if kode, _, galat := gen(t, c, "-apply", "-force"); kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}
	bacaBerkas(t, filepath.Join(c.dirFitK, "handler.gen.go"))
}

// --- Pembekuan --------------------------------------------------------------------------------

func TestFreezeMenggantiNamaDanMelucutiHeader(t *testing.T) {
	c := buatProyek(t, opsiProyek{})
	if kode, _, galat := gen(t, c, "-apply"); kode != 0 {
		t.Fatalf("gen: kode = %d, galat = %s", kode, galat)
	}

	kode, _, galat := lari(t, "-config", c.akar, "-pkg", "keluarga", "-freeze", "-apply")
	if kode != 0 {
		t.Fatalf("freeze: kode = %d, galat = %s", kode, galat)
	}
	for _, dasar := range berkasKerangka {
		if _, err := os.Stat(filepath.Join(c.dirFitK, dasar+".gen.go")); err == nil {
			t.Errorf("%s.gen.go masih ada sesudah pembekuan", dasar)
		}
		isi := bacaBerkas(t, filepath.Join(c.dirFitK, dasar+".go"))
		if strings.Contains(isi, penandaGenerated) {
			t.Errorf("%s.go masih membawa header DO NOT EDIT", dasar)
		}
		if !strings.HasPrefix(isi, "package keluarga") {
			t.Errorf("%s.go tidak dimulai dengan klausa package:\n%s", dasar, barisPertama(isi))
		}
	}
	// Sesudah beku, generator menolak menyentuh modulnya — keadaan dibaca dari nama berkas.
	if kode, _, _ := gen(t, c, "-apply"); kode != 2 {
		t.Errorf("generator tidak menolak modul beku: kode = %d", kode)
	}
}

func TestFreezeDryRunTidakMenggantiNama(t *testing.T) {
	c := buatProyek(t, opsiProyek{})
	if kode, _, galat := gen(t, c, "-apply"); kode != 0 {
		t.Fatalf("gen: kode = %d, galat = %s", kode, galat)
	}
	kode, keluar, galat := lari(t, "-config", c.akar, "-pkg", "keluarga", "-freeze")
	if kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}
	if !strings.Contains(keluar, "register.gen.go -> register.go") {
		t.Errorf("dry-run tidak melaporkan rencananya:\n%s", keluar)
	}
	bacaBerkas(t, filepath.Join(c.dirFitK, "register.gen.go"))
	if _, err := os.Stat(filepath.Join(c.dirFitK, "register.go")); err == nil {
		t.Error("dry-run tetap mengganti nama")
	}
}

func TestFreezeTanpaBerkasTergenerateGagal(t *testing.T) {
	c := buatProyek(t, opsiProyek{})
	kode, _, galat := lari(t, "-config", c.akar, "-pkg", "keluarga", "-freeze", "-apply")
	if kode != 2 {
		t.Fatalf("kode = %d, mau 2", kode)
	}
	mau := katalogUji(t, "id").T("genmodule.beku_tanpa_gen",
		map[string]string{"jalur": c.dirFitK, "sufiks": ".gen.go"})
	if !strings.Contains(galat, mau) {
		t.Errorf("galat bukan dari penjaga pembekuan:\n%s", galat)
	}
}

// Tabrakan diperiksa untuk SELURUH berkas sebelum satu pun disentuh: berhenti di tengah
// meninggalkan modul separuh beku, yang tidak terbaca sebagai keadaan mana pun.
func TestFreezeMenolakTabrakanSebelumMenyentuhApaPun(t *testing.T) {
	c := buatProyek(t, opsiProyek{})
	if kode, _, galat := gen(t, c, "-apply"); kode != 0 {
		t.Fatalf("gen: kode = %d, galat = %s", kode, galat)
	}
	// Tabrakan pada berkas TERAKHIR dalam urutan tulis: kalau penjaganya berjalan per-berkas,
	// tiga berkas pertama sudah terlanjur diganti nama saat ia menyala.
	tulis(t, filepath.Join(c.dirFitK, "repository.go"), "package keluarga\n")

	kode, _, galat := lari(t, "-config", c.akar, "-pkg", "keluarga", "-freeze", "-apply")
	if kode != 2 {
		t.Fatalf("kode = %d, mau 2; galat = %s", kode, galat)
	}
	for _, dasar := range []string{"register", "handler", "service"} {
		bacaBerkas(t, filepath.Join(c.dirFitK, dasar+".gen.go"))
		if _, err := os.Stat(filepath.Join(c.dirFitK, dasar+".go")); err == nil {
			t.Errorf("%s sudah diganti nama meski tabrakan terdeteksi", dasar)
		}
	}
}

// --- Bentuk yang tak terduga dihentikan, bukan ditebak ----------------------------------------

// Kehadiran konstanta status amplop DIPERIKSA, tidak diasumsikan. Tag yang belum opt-in amplop
// tunggal (C-01) tidak mendeklarasikannya, dan menulis `out.Status = <alias>.SuccessStatusSuccess`
// di sana adalah Go yang tidak kompilasi — di berkas yang baru saja dibangkitkan, jadi ia menabrak
// orang yang belum menyentuh apa pun.
//
// Fixture standar SELALU mendeklarasikan konstantanya, jadi cabang "tidak ada" hanya terjalankan
// lewat opsi ini. Tanpa uji ini, pemeriksaannya bisa diganti `= true` dan seluruh suite hijau.
func TestKonstantaStatusAmplopDiperiksaBukanDiasumsikan(t *testing.T) {
	c := buatProyek(t, opsiProyek{tanpaKonst: true})
	if kode, _, galat := gen(t, c, "-apply"); kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}
	han := kodeSaja(bacaBerkas(t, filepath.Join(c.dirFitK, "handler.gen.go")))
	if strings.Contains(han, "out.Status") {
		t.Errorf("handler mengisi out.Status padahal paket generated tak punya konstantanya:\n%s", han)
	}
	// Field amplop lain TIDAK ikut hilang — kalau ia hilang juga, uji ini akan lulus untuk alasan
	// yang salah (generator berhenti memancarkan amplop sama sekali).
	if !strings.Contains(han, `out.Message = "Success"`) {
		t.Errorf("out.Message ikut hilang — bukan itu yang diuji:\n%s", han)
	}

	// Kontrol positif: dengan fixture standar, out.Status MEMANG dipancarkan.
	std := buatProyek(t, opsiProyek{})
	if kode, _, galat := gen(t, std, "-apply"); kode != 0 {
		t.Fatalf("kontrol: kode = %d, galat = %s", kode, galat)
	}
	if !strings.Contains(kodeSaja(bacaBerkas(t, filepath.Join(std.dirFitK, "handler.gen.go"))), "out.Status") {
		t.Error("kontrol positif gagal: out.Status tidak dipancarkan walau konstantanya ada")
	}
}

func TestTanpaStrictServerGagalKeras(t *testing.T) {
	c := buatProyek(t, opsiProyek{tanpaIface: true})
	kode, _, galat := gen(t, c, "-apply")
	if kode != 2 {
		t.Fatalf("kode = %d, mau 2; galat = %s", kode, galat)
	}
	if !strings.Contains(galat, "StrictServerInterface") {
		t.Errorf("galat tidak menyebut antarmuka yang hilang:\n%s", galat)
	}
}

func TestPaketGeneratedTidakAdaDilaporkanDenganCaraMemperbaikinya(t *testing.T) {
	c := buatProyek(t, opsiProyek{})
	kode, _, galat := lari(t, "-config", c.akar, "-tag", "lain", "-pkg", "lain")
	if kode != 2 {
		t.Fatalf("kode = %d, mau 2", kode)
	}
	if !strings.Contains(galat, "lain") {
		t.Errorf("galat tidak menyebut paket yang dicari:\n%s", galat)
	}
}

func TestMetaDataWajibBerbentukLainDihentikan(t *testing.T) {
	c := buatProyek(t, opsiProyek{})
	jalur := filepath.Join(c.dirGen, "keluarga", "keluarga.gen.go")
	isi := strings.Replace(bacaBerkas(t, jalur),
		"type SchemasMetaData struct {\n\tPagination Pagination\n}",
		"type SchemasMetaData struct {\n\tPagination Pagination\n\tTambahan   int\n}", 1)
	if !strings.Contains(isi, "Tambahan") {
		t.Fatal("mutasi fixture tidak mendarat — uji ini tidak menguji apa pun")
	}
	tulis(t, jalur, isi)

	kode, _, galat := gen(t, c, "-apply")
	if kode != 2 {
		t.Fatalf("kode = %d, mau 2; galat = %s", kode, galat)
	}
	if !strings.Contains(galat, "SchemasMetaData") {
		t.Errorf("galat tidak menyebut tipe yang berubah bentuk:\n%s", galat)
	}
}

func TestOperasiTanpaResponsSuksesDihentikan(t *testing.T) {
	c := buatProyek(t, opsiProyek{})
	jalur := filepath.Join(c.dirGen, "keluarga", "keluarga.gen.go")
	isi := bacaBerkas(t, jalur)
	isi = strings.Replace(isi, "type DeleteKeluargaById204Response struct{}",
		"type DeleteKeluargaById404Response struct{}", 1)
	if strings.Contains(isi, "DeleteKeluargaById204Response") {
		t.Fatal("mutasi fixture tidak mendarat — uji ini tidak menguji apa pun")
	}
	tulis(t, jalur, isi)

	kode, _, galat := gen(t, c, "-apply")
	if kode != 2 {
		t.Fatalf("kode = %d, mau 2; galat = %s", kode, galat)
	}
	if !strings.Contains(galat, "DeleteKeluargaById") {
		t.Errorf("galat tidak menyebut operasinya:\n%s", galat)
	}
}

// --- Bendera wajib ---------------------------------------------------------------------------

func TestPkgDanTagWajib(t *testing.T) {
	c := buatProyek(t, opsiProyek{})
	if kode, _, galat := lari(t, "-config", c.akar); kode != 2 || !strings.Contains(galat, "-pkg") {
		t.Errorf("-pkg tidak diwajibkan: kode = %d, galat = %s", kode, galat)
	}
	if kode, _, galat := lari(t, "-config", c.akar, "-pkg", "keluarga"); kode != 2 ||
		!strings.Contains(galat, "-tag") {
		t.Errorf("-tag tidak diwajibkan: kode = %d, galat = %s", kode, galat)
	}
	// -freeze tidak menuntut -tag: ia tidak membaca kontrak sama sekali.
	if kode, _, galat := lari(t, "-config", c.akar, "-pkg", "keluarga", "-freeze"); kode != 2 ||
		strings.Contains(galat, "-tag") {
		t.Errorf("-freeze menuntut -tag: kode = %d, galat = %s", kode, galat)
	}
}

// --- Katalog dan config ------------------------------------------------------------------------

func TestSemuaKunciDipakaiAdaDiKeduaKatalog(t *testing.T) {
	for _, bahasa := range []string{"id", "en"} {
		if err := katalogUji(t, bahasa).Lengkap(kunciDipakai); err != nil {
			t.Errorf("%s.json: %v", bahasa, err)
		}
	}
}

// Memeriksa isi katalog di uji tidak membuktikan alat MENOLAK JALAN tanpa kunci: mekanismenya
// sendiri, kat.Lengkap di awal tiap lari, bisa dicabut dan seluruh suite tetap hijau.
func TestKunciKatalogHilangMembuatAlatMenolakJalan(t *testing.T) {
	const dibuang = "genmodule.komentar.store"

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

	c := buatProyek(t, opsiProyek{})
	kode, _, galat := gen(t, c, "-messages", dirPesan, "-apply")
	if kode != 2 {
		t.Fatalf("kode = %d, mau 2; galat = %s", kode, galat)
	}
	if !strings.Contains(galat, dibuang) {
		t.Errorf("galat tidak menyebut kunci yang hilang:\n%s", galat)
	}
	if _, err := os.Stat(filepath.Join(c.dirFitK, "register.gen.go")); err == nil {
		t.Error("alat tetap menulis berkas meski katalognya tak lengkap")
	}
}

func TestConfigTakDitemukanDilaporkanDwibahasa(t *testing.T) {
	kosong := t.TempDir()
	kode, _, galat := lari(t, "-config", kosong, "-tag", "x", "-pkg", "x")
	if kode != 2 {
		t.Fatalf("kode = %d, mau 2", kode)
	}
	for _, bahasa := range []string{"id", "en"} {
		mau := katalogUji(t, bahasa).T("config.tidak_ditemukan", map[string]string{"dari": kosong})
		if !strings.Contains(galat, mau) {
			t.Errorf("galat tidak memuat teks %s %q:\n%s", bahasa, mau, galat)
		}
	}
}

func TestKatalogHilangDilaporkanDwibahasa(t *testing.T) {
	c := buatProyek(t, opsiProyek{})
	kode, _, galat := gen(t, c, "-messages", filepath.Join(t.TempDir(), "kosong"))
	if kode != 2 {
		t.Fatalf("kode = %d, mau 2", kode)
	}
	if !strings.Contains(galat, "katalog pesan") || !strings.Contains(galat, "message catalogue") {
		t.Errorf("laporan bootstrap tidak dwibahasa: %s", galat)
	}
}

// --- Bantuan ------------------------------------------------------------------------------------

func TestBantuanDijawabTanpaConfig(t *testing.T) {
	luar := t.TempDir() // tak ada standard.config.json di sini maupun di atasnya

	kode, keluar, galat := lari(t, "-config", luar, "-h")
	if kode != 0 {
		t.Fatalf("kode = %d, galat = %s", kode, galat)
	}
	for _, bahasa := range []string{"id", "en"} {
		if mau := katalogUji(t, bahasa).T("genmodule.pemakaian", nil); !strings.Contains(keluar, mau) {
			t.Errorf("bantuan tidak memuat sinopsis %s:\n%s", bahasa, keluar)
		}
	}
	for _, bendera := range []string{"-apply", "-config", "-feature", "-force", "-freeze",
		"-messages", "-out", "-pkg", "-tag"} {
		if !strings.Contains(keluar, bendera) {
			t.Errorf("bantuan tidak menyebut bendera %s:\n%s", bendera, keluar)
		}
	}
	if strings.TrimSpace(galat) != "" {
		t.Errorf("bantuan menulis ke aliran galat: %s", galat)
	}
}

// `-pkg -h` menanyakan paket generated bernama "-h", bukan bantuan. Pindaian pra-bendera harus
// tahu bendera mana yang memakan argumen berikutnya — dan daftar itu milik alat INI.
func TestNilaiBenderaTidakSalahDibacaSebagaiBantuan(t *testing.T) {
	pindai := func(argv ...string) bool {
		_, _, bantuan := cfg.PraPindai(argv, benderaBernilai)
		return bantuan
	}
	for _, argv := range [][]string{{"-pkg", "-h"}, {"-tag", "-h"}, {"-feature", "-h"}, {"-out", "-h"}} {
		if pindai(argv...) {
			t.Errorf("nilai bendera %v terbaca sebagai permintaan bantuan", argv)
		}
	}
	if !pindai("-h") || !pindai("--help") {
		t.Error("pindaian tidak mengenali permintaan bantuan")
	}
}

// --- Portabilitas ---------------------------------------------------------------------------------

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
	if len(berkas) == 0 || len(pesan) == 0 {
		t.Fatal("tidak ada berkas yang dipindai — uji ini tidak menguji apa pun")
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
