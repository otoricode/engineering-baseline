import { describe, expect, it } from "vitest";
import { checkParamPositionCollisions } from "./paramPositions.js";
import { buatT } from "../pesan.js";
import { muatPesan } from "../../../src/messages/index.js";

const t = buatT(await muatPesan("id"));
const SITIR = "[C-06]";

const METHODS = ["get", "post", "put", "delete", "patch"];

describe("checkParamPositionCollisions", () => {
  it("tidak melapor apa pun kalau satu nama parameter konsisten di satu posisi", () => {
    const paths = {
      "/keluarga/{keluargaId}": { get: {}, put: {}, delete: {} },
      "/keluarga/{keluargaId}/anggota": { get: {}, post: {} },
      "/keluarga/{keluargaId}/split": { post: {} },
    };
    expect(checkParamPositionCollisions(paths, METHODS, t, SITIR)).toEqual([]);
  });

  it("melapor untuk kasus historis: {id}, {keluargaId}, {targetKeluargaId} di posisi yang sama", () => {
    const paths = {
      "/keluarga/{id}": { get: {} },
      "/keluarga/{keluargaId}/anggota": { get: {} },
      "/keluarga/{targetKeluargaId}/merge": { post: {} },
    };
    const errors = checkParamPositionCollisions(paths, METHODS, t, SITIR);
    // {id}+{keluargaId} berbagi posisi di bawah GET; {targetKeluargaId} sendirian di POST —
    // GET-nya harus tetap terlapor tabrakan biarpun method-nya beda per path.
    expect(errors.some((e) => e.includes('"id"') && e.includes('"keluargaId"'))).toBe(true);
  });

  it("dua path yang divergen SESUDAH parameter tetap dianggap satu posisi (kendala Gin sungguhan)", () => {
    // /a/{x}/split dan /a/{y}/merge berbeda total sesudah parameternya, tapi berbagi node
    // parameter yang SAMA di pohon Gin (satu posisi, satu segmen sebelum-nya "/a").
    const paths = {
      "/a/{x}/split": { post: {} },
      "/a/{y}/merge": { post: {} },
    };
    const errors = checkParamPositionCollisions(paths, METHODS, t, SITIR);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"x"');
    expect(errors[0]).toContain('"y"');
  });

  it("method BERBEDA di path yang sama TIDAK dianggap tabrakan (Gin punya satu tree per method)", () => {
    const paths = {
      "/a/{x}": { get: {} },
      "/a/{y}": { post: {} },
    };
    expect(checkParamPositionCollisions(paths, METHODS, t, SITIR)).toEqual([]);
  });

  it("mengabaikan kunci non-method pada path item (mis. 'parameters', 'summary')", () => {
    const paths = {
      "/a/{x}": { get: {}, parameters: [], summary: "desc" },
    };
    expect(checkParamPositionCollisions(paths, METHODS, t, SITIR)).toEqual([]);
  });

  it("pesan error menyebut posisi dan SEMUA nama yang bertabrakan", () => {
    const paths = {
      "/keluarga/{id}": { get: {} },
      "/keluarga/{keluargaId}": { get: {} },
      "/keluarga/{targetKeluargaId}": { get: {} },
    };
    const errors = checkParamPositionCollisions(paths, METHODS, t, SITIR);
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain('"id"');
    expect(errors[0]).toContain('"keluargaId"');
    expect(errors[0]).toContain('"targetKeluargaId"');
  });

  // Sebelum [[C-06]] ditulis, test ini memaku KETIADAAN sitiran — gate ini memancar tanpa ID
  // karena tidak ada aturan yang benar untuk disitir. Itu keadaan yang [[G-04]] larang, dan
  // pilihannya cuma dua: aturannya ada, atau gate-nya tidak boleh memancar. Aturannya ditulis,
  // jadi asersinya DIBALIK. Bentuk terbaliknya sama mengikatnya: sitiran yang hilang lagi — mis.
  // karena seseorang menyederhanakan pemanggilannya — memerahkan test ini, bukan lolos diam-diam.
  it("MENYITIR ID aturan yang menegakkannya", () => {
    const errors = checkParamPositionCollisions(
      { "/a/{x}": { get: {} }, "/a/{y}": { get: {} } },
      METHODS,
      t,
      SITIR,
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(SITIR);
  });

  // Sitirannya datang dari config, bukan dipaku: proyek yang menomori aturannya dengan prefix
  // sendiri harus melihat prefix ITU di keluaran gate, bukan prefix milik paket standar.
  it("memakai sitiran yang diberikan pemanggil, bukan prefix yang dipaku", () => {
    const errors = checkParamPositionCollisions(
      { "/a/{x}": { get: {} }, "/a/{y}": { get: {} } },
      METHODS,
      t,
      "[KTR-06]",
    );
    expect(errors[0]).toContain("[KTR-06]");
    expect(errors[0]).not.toContain("[C-06]");
  });
});
