// Titik masuk fixture — bukan server sungguhan, cuma cukup untuk melatih gate:backend-routes
// (B-01: "tiap modul yang punya berkas pendaftaran benar-benar TERPASANG di titik masuk").
//
// gate:backend-routes membaca berkas ini secara TEKS (bukan mengompilasinya) lewat dua sitiran
// dari standard.config.json: `go.entrypoint` (jalur berkas ini) dan `go.registrarType`
// (`[]server.FeatureRegistrar{`, dicari literal lalu kurawal penutupnya dihitung). Paket
// `internal/server` yang diimpor di bawah TIDAK ikut dibangun di fixture ini — lihat catatan
// "keluaran generator tidak kompilasi" di laporan Task 13: itu keputusan terpisah (stub platform
// vs Task 14) yang belum diambil, dan berkas ini tidak menunggu keputusan itu untuk melatih gate
// yang murni tekstual.
package main

import (
	"example.test/fixture/apps/api/internal/feature/contoh"
	"example.test/fixture/apps/api/internal/server"
)

// modul adalah SATU-SATUNYA daftar modul yang wiring generated harus ikut serta di dalamnya.
var modul = []server.FeatureRegistrar{
	contoh.Register,
}

func main() {
	server.Run(modul)
}
