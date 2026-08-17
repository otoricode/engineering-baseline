// Package seed — data seed permission untuk tag contoh.
//
// Dibaca gate:contract-permissions (C-03 sisi 3, "tiap entri katalog ada di data seed") lewat
// pemindaian TEKS field `Code:` literal — lihat tooling/contract-scripts/lib/catalog.ts,
// extractPermissionCodesFromSource. Berkas ini bukan seeder sungguhan (tidak menulis basis
// data); ia representasi minimal yang cukup untuk melatih gate itu di fixture ini.
package seed

// PermissionRow adalah satu baris permission — bentuknya sengaja mendekati baris migrasi/seeder
// sungguhan (kode + deskripsi untuk manusia), bukan enum.
type PermissionRow struct {
	Code      string
	Deskripsi string
}

// Permissions adalah katalog permission tag contoh, dipegang role lewat penugasan terpisah.
var Permissions = []PermissionRow{
	{Code: "CONTOH_READ", Deskripsi: "Lihat daftar contoh dan satu contoh lewat ID"},
	{Code: "CONTOH_CREATE", Deskripsi: "Buat contoh baru"},
}
