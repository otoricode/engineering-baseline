import { describe, expect, it } from "vitest";
import { toGinPath, goMethodName, operasiUntukTag } from "./wiring.js";
import { buatT } from "../pesan.js";
import { muatPesan } from "../../../src/messages/index.js";

const t = buatT(await muatPesan("id"));

describe("toGinPath", () => {
  it("mengubah parameter OpenAPI jadi parameter gin", () => {
    expect(toGinPath("/buku-tamu/{id}")).toBe("/buku-tamu/:id");
  });

  it("menangani lebih dari satu parameter", () => {
    expect(toGinPath("/a/{x}/b/{yId}")).toBe("/a/:x/b/:yId");
  });

  it("membiarkan path tanpa parameter apa adanya", () => {
    expect(toGinPath("/buku-tamu/statistik")).toBe("/buku-tamu/statistik");
  });
});

describe("goMethodName", () => {
  it("PascalCase-kan operationId", () => {
    expect(goMethodName("getBukuTamuById")).toBe("GetBukuTamuById");
  });

  it("string kosong tetap kosong", () => {
    expect(goMethodName("")).toBe("");
  });
});

const bundelUji = {
  paths: {
    "/buku-tamu": {
      get: { operationId: "getBukuTamu", tags: ["buku-tamu"], "x-permission": "BUKU_TAMU_READ" },
      post: { operationId: "postBukuTamu", tags: ["buku-tamu"], "x-permission": ["BUKU_TAMU_CREATE", "DESA_ADMIN"] },
    },
    "/buku-tamu/{id}": {
      get: { operationId: "getBukuTamuById", tags: ["buku-tamu"], "x-permission": "BUKU_TAMU_READ" },
    },
    "/buku-tamu/profil": {
      get: { operationId: "getBukuTamuProfil", tags: ["buku-tamu"] },
    },
    "/public/buku-tamu": {
      post: { operationId: "postPublicBukuTamu", tags: ["buku-tamu"], security: [] },
    },
    "/lain": {
      get: { operationId: "getLain", tags: ["tag-lain"], "x-permission": "X" },
    },
  },
};

describe("operasiUntukTag", () => {
  const ops = operasiUntukTag(bundelUji, "buku-tamu", t);

  it("hanya mengambil operasi bertag itu", () => {
    expect(ops.map((o) => o.operationId).sort()).toEqual([
      "getBukuTamu",
      "getBukuTamuById",
      "getBukuTamuProfil",
      "postBukuTamu",
      "postPublicBukuTamu",
    ]);
  });

  it("ada x-permission -> protected, skalar dinormalkan jadi larik", () => {
    const o = ops.find((x) => x.operationId === "getBukuTamu")!;
    expect(o.kategori).toBe("protected");
    expect(o.permissions).toEqual(["BUKU_TAMU_READ"]);
  });

  it("x-permission larik dipertahankan urutannya (OR)", () => {
    const o = ops.find((x) => x.operationId === "postBukuTamu")!;
    expect(o.permissions).toEqual(["BUKU_TAMU_CREATE", "DESA_ADMIN"]);
  });

  it("tanpa x-permission dan tanpa security -> authOnly", () => {
    const o = ops.find((x) => x.operationId === "getBukuTamuProfil")!;
    expect(o.kategori).toBe("authOnly");
    expect(o.permissions).toEqual([]);
  });

  it("security: [] -> public", () => {
    const o = ops.find((x) => x.operationId === "postPublicBukuTamu")!;
    expect(o.kategori).toBe("public");
    expect(o.permissions).toEqual([]);
  });

  it("path dan nama metode Go diturunkan", () => {
    const o = ops.find((x) => x.operationId === "getBukuTamuById")!;
    expect(o.ginPath).toBe("/buku-tamu/:id");
    expect(o.goMethod).toBe("GetBukuTamuById");
  });

  // `security` yang TIDAK kosong (mis. hanya cookieAuth) adalah penyempitan, bukan
  // pembukaan. Ia tidak boleh dibaca sebagai publik.
  it("security TIDAK kosong tetap dijaga, bukan public", () => {
    const doc = {
      paths: { "/z": { get: { operationId: "getZ", tags: ["t"], security: [{ cookieAuth: [] }] } } },
    };
    expect(operasiUntukTag(doc, "t", t)[0]!.kategori).toBe("authOnly");
  });

  // x-permission MENANG atas security: []. Kalau tidak, satu baris `security: []` yang
  // terselip diam-diam mencopot permission-nya.
  it("x-permission menang atas security: [] — tidak diam-diam jadi publik", () => {
    const doc = {
      paths: { "/z": { get: { operationId: "getZ", tags: ["t"], security: [], "x-permission": "X" } } },
    };
    const o = operasiUntukTag(doc, "t", t)[0]!;
    expect(o.kategori).toBe("protected");
    expect(o.permissions).toEqual(["X"]);
  });

  it("menolak x-permission larik KOSONG — nyaring, bukan diam-diam jadi authOnly", () => {
    const rusak = { paths: { "/z": { get: { operationId: "getZ", tags: ["t"], "x-permission": [] } } } };
    expect(() => operasiUntukTag(rusak, "t", t)).toThrow(/x-permission kosong/);
  });

  it("menolak operasi tanpa operationId", () => {
    const rusak = { paths: { "/z": { get: { tags: ["t"], "x-permission": "X" } } } };
    expect(() => operasiUntukTag(rusak, "t", t)).toThrow(/operationId/);
  });

  it("keluarannya STABIL urutannya — regen tidak boleh mengocok diff", () => {
    const a = operasiUntukTag(bundelUji, "buku-tamu", t).map((o) => o.operationId);
    const b = operasiUntukTag(bundelUji, "buku-tamu", t).map((o) => o.operationId);
    expect(a).toEqual(b);
    expect(a).toEqual([...a].sort());
  });
});
