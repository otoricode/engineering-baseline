// Code generated from packages/contract/dist/openapi.bundled.yaml. DO NOT EDIT.
//
// Diturunkan dari packages/contract/dist/openapi.bundled.yaml. Perubahan yang ditulis tangan di sini akan hilang pada regenerasi berikutnya, dan gate regenerasi akan memerah lebih dulu.
//
// Tag kontrak: contoh (paket contoh)
// Operasi: 3 — 3 dijaga, 0 publik.
//
// Berkas ini hanya memuat DATA yang diturunkan dari kontrak plus satu fungsi pemasangan tipis.
// Seluruh keputusan otorisasi hidup di paket platform — jangan menyalin logikanya ke sini.

package contoh

import (
	"example.test/fixture/apps/api/internal/gen"
	"example.test/fixture/apps/api/internal/platform/guard"
	"example.test/fixture/apps/api/internal/platform/httpx"
	"github.com/gin-gonic/gin"
)

// SpecByOperation memetakan operationId kontrak -> kategori guard-nya ([C-03]).
//
// Operasi ber-`security: []` SENGAJA TIDAK ADA di sini: ia tidak punya kategori guard, dan itulah
// gunanya daftar operasi publik. Memasukkannya akan menulis entri "tanpa permission tapi bukan
// auth-only" — bentuk yang pemeriksa izin perlakukan sebagai peta RUSAK. Entri semacam itu tak
// pernah dibaca hari ini, tapi ia jebakan yang menunggu pembaca berikutnya.
var SpecByOperation = map[string]guard.RouteSpec{
	"getContoh":     {OperationID: "getContoh", Perms: []gen.Permission{gen.PermContohRead}},
	"getContohById": {OperationID: "getContohById", Perms: []gen.Permission{gen.PermContohRead}},
	"postContoh":    {OperationID: "postContoh", Perms: []gen.Permission{gen.PermContohCreate}},
}

// SpecByRoute memetakan "METODE /pola" -> kategori guard, untuk middleware level GRUP yang jalan
// SEBELUM lapisan generated mengikat parameter atau badan. Hanya memuat operasi yang dipasang ke
// grup terlindungi; operasi publik tidak dijaga.
var SpecByRoute = map[string]guard.RouteSpec{
	"GET /contoh":           SpecByOperation["getContoh"],
	"GET /contoh/:contohId": SpecByOperation["getContohById"],
	"POST /contoh":          SpecByOperation["postContoh"],
}

// PublicRoutes adalah "METODE /pola" operasi ber-`security: []` tag ini — rute yang MEMANG
// terpasang tapi SENGAJA tidak ada di SpecByRoute karena tidak dijaga.
//
// Ia ada untuk uji, dan alasannya sempit: pembantu uji menuntut kecocokan DUA ARAH antara rute
// terpasang dan kunci spec, jadi tanpa daftar ini setiap modul ber-operasi publik gagal dua arah
// sekaligus. Sebelum daftar ini dibangkitkan, satu-satunya jalan adalah menulis ulang daftarnya
// DENGAN TANGAN di uji tiap modul: salinan kedua dari kontrak, tanpa gate, yang akan menyimpang
// diam-diam.
//
// Ia BUKAN peta guard dan tidak boleh dipakai sebagai peta guard — rute di sini justru yang tidak
// punya kategori guard sama sekali.
var PublicRoutes = []string{}

// V2Paths adalah pola rute yang kegagalannya wajib memakai envelope tunggal walau lahir di
// middleware level grup — sebelum request ini pernah menyentuh kode feature sama sekali.
func V2Paths(publicBase, protectedBase string) []string {
	return []string{

		guard.JoinPath(protectedBase, "/contoh"),
		guard.JoinPath(protectedBase, "/contoh/:contohId"),
		guard.JoinPath(protectedBase, "/contoh"),
	}
}

// publicOps adalah operasi tag ini yang kontraknya menyatakan `security: []`.
var publicOps = map[string]bool{}

// guardByOperation adalah lapis guard yang tahu operationId dari lapisan generated SENDIRI, bukan
// dari pencocokan rute — jadi ia tetap gagal-tertutup seandainya peta per-rute meleset.
//
// Handler generated meneruskan nama METODE bahasa server (PascalCase), bukan operationId kontrak
// (camelCase); petanya tetap berkunci operationId KONTRAK.
func guardByOperation(f StrictHandlerFunc, operationID string) StrictHandlerFunc {
	opID := guard.LowerFirst(operationID)
	return func(c *gin.Context, request any) (any, error) {
		if publicOps[opID] {
			return f(c, request)
		}
		spec, found := SpecByOperation[opID]
		if !guard.Allow(c, spec, found) {
			return nil, nil
		}
		return f(c, request)
	}
}

// Mount memasang seluruh operasi tag ini. Implementor hanya menyediakan implementasinya; peta
// permission, rantai guard, hook galat, dan daftar path envelope semuanya berasal dari kontrak.
//
// Tiap operasi dipasang ke grup yang BENAR menurut kontraknya — publik ke grup publik tanpa guard
// sesi, sisanya ke grup terlindungi di belakang guard. Karena Mount yang memutuskan, pendaftaran
// ganda dan operasi yang tak sengaja terbuka sama-sama mustahil.
func Mount(public, protected *gin.RouterGroup, impl StrictServerInterface) {
	si := NewStrictHandlerWithOptions(impl,
		[]StrictMiddlewareFunc{guardByOperation},
		StrictGinServerOptions{
			RequestErrorHandlerFunc:  httpx.RequestBindErrorV2,
			HandlerErrorFunc:         httpx.RenderFailureV2,
			ResponseErrorHandlerFunc: httpx.ResponseSerializeErrorV2,
		},
	)
	wrapper := ServerInterfaceWrapper{Handler: si, ErrorHandler: httpx.ParamBindErrorV2}

	prot := protected.Group("", guard.RequireSession, guard.RequirePermissionForRoute(protected.BasePath(), SpecByRoute), guard.BufferJSONBody)
	prot.GET("/contoh", wrapper.GetContoh)
	prot.GET("/contoh/:contohId", wrapper.GetContohById)
	prot.POST("/contoh", wrapper.PostContoh)

	httpx.RegisterV2Paths(V2Paths(public.BasePath(), protected.BasePath())...)
}
