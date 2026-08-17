// Code generated from packages/contract/openapi/_shared/envelope.yaml. DO NOT EDIT.
//
// Diturunkan dari packages/contract/openapi/_shared/envelope.yaml. Perubahan yang ditulis tangan di sini akan hilang pada regenerasi berikutnya, dan gate regenerasi akan memerah lebih dulu.
//
// Schema bersama didefinisikan SEKALI di paket generated bersama; berkas ini hanya menyambungkan
// nama-nama yang berkas server hasil generate rujuk ke sana.
//
// Ini ALIAS (`=`), jadi tipenya SAMA lintas paket — bukan sekadar bentuk yang mirip. Ditulis tanpa
// `=`, tiap paket kembali punya tipe sendiri dan seluruh gunanya hilang.

package contoh

import "example.test/fixture/apps/api/internal/gen/common"

type (
	EnvelopeError       = common.EnvelopeError
	EnvelopeErrorStatus = common.EnvelopeErrorStatus
	EnvelopeMeta        = common.EnvelopeMeta
	EnvelopeStatus      = common.EnvelopeStatus
	EnvelopeSuccess     = common.EnvelopeSuccess
	Pagination          = common.Pagination
)

const (
	EnvelopeErrorStatusFailed = common.EnvelopeErrorStatusFailed
	EnvelopeStatusSuccess     = common.EnvelopeStatusSuccess
)
