// Code generated from packages/contract/openapi/_shared/errors.yaml. DO NOT EDIT.
//
// Diturunkan dari packages/contract/openapi/_shared/errors.yaml. Perubahan yang ditulis tangan di sini akan hilang pada regenerasi berikutnya, dan gate regenerasi akan memerah lebih dulu.

package gen

// ErrorCode adalah kode error yang diakui katalog kontrak ([C-02]).
//
// Hati-hati membaca ini sebagai "dijaga kompilator": konstanta TAK BERTIPE tetap diterima di sini —
// hanya VARIABEL bertipe string yang ditolak. Yang benar-benar menutup katalognya adalah gate yang
// mem-parse sumber, bukan tipe ini.
type ErrorCode string

const (
	ErrConflict           ErrorCode = "CONFLICT"
	ErrContohNamaDuplikat ErrorCode = "CONTOH_NAMA_DUPLIKAT"
	ErrForbidden          ErrorCode = "FORBIDDEN"
	ErrUnauthenticated    ErrorCode = "UNAUTHENTICATED"
	ErrValidationError    ErrorCode = "VALIDATION_ERROR"
)

// AllErrorCodes memuat seluruh katalog, dipakai gate dan uji.
var AllErrorCodes = []ErrorCode{
	ErrConflict,
	ErrContohNamaDuplikat,
	ErrForbidden,
	ErrUnauthenticated,
	ErrValidationError,
}

// ParseErrorCode mengubah string jadi ErrorCode bila ia ada di katalog.
func ParseErrorCode(s string) (ErrorCode, bool) {
	for _, c := range AllErrorCodes {
		if string(c) == s {
			return c, true
		}
	}
	return "", false
}
