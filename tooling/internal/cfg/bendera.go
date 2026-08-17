package cfg

import "strings"

// PraPindai mengambil -config, -messages, dan permintaan bantuan SEBELUM parsing bendera
// sungguhan. Alasannya melingkar: teks bantuan tiap bendera datang dari katalog, katalog dipilih
// oleh bahasa di config, dan config ditunjuk oleh -config. Pindaian ini hanya memutus lingkaran
// itu — yang menentukan perilaku tetap parsing bendera di bawahnya.
//
// benderaBernilai menyebut bendera mana yang MEMAKAN argumen berikutnya, dan tiap alat punya
// daftarnya sendiri. Tanpa itu, `-only -h` atau `-pkg -h` akan terbaca sebagai permintaan
// bantuan alih-alih sebagai nilai bendera.
func PraPindai(argv []string, benderaBernilai map[string]bool) (config, messages string, bantuan bool) {
	lewat := false
	for i, a := range argv {
		if lewat {
			lewat = false
			continue
		}
		nama, nilai, punyaNilai := BelahBendera(a)
		if nama == "" {
			continue
		}
		if nama == "h" || nama == "help" {
			bantuan = true
			continue
		}
		if !benderaBernilai[nama] {
			continue
		}
		if !punyaNilai && i+1 < len(argv) {
			nilai, lewat = argv[i+1], true
		}
		switch nama {
		case "config":
			config = nilai
		case "messages":
			messages = nilai
		}
	}
	return config, messages, bantuan
}

// BelahBendera memecah satu argumen menjadi nama bendera dan nilainya, menerima bentuk `-nama`,
// `--nama`, `-nama=nilai`, dan `--nama=nilai`. Argumen yang bukan bendera menghasilkan nama "".
func BelahBendera(a string) (nama, nilai string, punyaNilai bool) {
	if !strings.HasPrefix(a, "-") || a == "-" || a == "--" {
		return "", "", false
	}
	sisa := strings.TrimPrefix(strings.TrimPrefix(a, "-"), "-")
	if i := strings.IndexByte(sisa, '='); i >= 0 {
		return sisa[:i], sisa[i+1:], true
	}
	return sisa, "", false
}
