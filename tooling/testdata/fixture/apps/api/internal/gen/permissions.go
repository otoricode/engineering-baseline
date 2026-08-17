// Code generated from packages/contract/openapi/_shared/permissions.yaml. DO NOT EDIT.
//
// Diturunkan dari packages/contract/openapi/_shared/permissions.yaml. Perubahan yang ditulis tangan di sini akan hilang pada regenerasi berikutnya, dan gate regenerasi akan memerah lebih dulu.

package gen

// Permission adalah nama permission yang diakui katalog kontrak ([C-03]). Tipe ini membuat
// pemeriksa izin berhenti menerima string bebas — nama yang tidak ada di katalog gagal compile,
// bukan gagal diam-diam saat runtime.
type Permission string

const (
	PermContohCreate Permission = "CONTOH_CREATE"
	PermContohRead   Permission = "CONTOH_READ"
)

// AllPermissions memuat seluruh katalog, dipakai gate dan uji.
var AllPermissions = []Permission{
	PermContohCreate,
	PermContohRead,
}

// ParsePermission mengubah string jadi Permission bila ia ada di katalog.
func ParsePermission(s string) (Permission, bool) {
	for _, p := range AllPermissions {
		if string(p) == s {
			return p, true
		}
	}
	return "", false
}
