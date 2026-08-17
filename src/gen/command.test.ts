import { describe, expect, it } from "vitest";
import { rakitPerintahFreeze, rakitPerintahGen, rakitPerintahGenBanyak } from "./command.js";
import { dirTooling } from "../paket.js";

describe("rakitPerintahGen", () => {
  it("dry-run adalah default: tanpa --apply tidak ada -apply yang diteruskan", () => {
    const p = rakitPerintahGen(["module", "--tag", "keluarga", "--pkg", "keluarga"], "/proyek");
    expect(p.argumen).not.toContain("-apply");
    expect(p.argumen).toContain("-tag");
    expect(p.argumen).toContain("keluarga");
  });

  it("--apply meneruskan -apply ke alat di bawahnya", () => {
    const p = rakitPerintahGen(["module", "--tag", "t", "--pkg", "p", "--apply"], "/proyek");
    expect(p.argumen).toContain("-apply");
  });

  it("menolak module tanpa --tag", () => {
    expect(() => rakitPerintahGen(["module", "--pkg", "p"], "/proyek")).toThrow(/--tag/);
  });

  it("gen dto tidak menuntut --tag", () => {
    expect(() => rakitPerintahGen(["dto"], "/proyek")).not.toThrow();
  });
});

describe("rakitPerintahGen — letak config dan direktori kerja", () => {
  // Cacat yang paling mudah ditulis di pembungkus ini: menaruh akar proyek di `cwd` alih-alih di
  // `-config`. Keluarannya terlihat wajar sampai alat memungut config PAKET, bukan config proyek.
  it("akar proyek mendarat di -config, dan cwd adalah modul Go PAKET", () => {
    const p = rakitPerintahGen(["module", "--tag", "t", "--pkg", "p"], "/proyek");
    expect(p.argumen.slice(0, 2)).toEqual(["-config", "/proyek"]);
    expect(p.cwd).toBe(dirTooling());
    expect(p.cwd).not.toBe("/proyek");
  });

  /**
   * `go run` TIDAK meneruskan kode keluar programnya — ia keluar 1 apa pun kode aslinya (diukur:
   * biner langsung 2, `go run` 1). Seluruh lapis di atas memakai pemisahan 1-vs-2 untuk memutuskan
   * "ada pelanggaran" versus "alatnya gagal", jadi bentuk `go run` dilarang di sini: alat Go
   * DIBANGUN dulu, binernya yang dijalankan.
   */
  it("alat Go dibangun lalu dijalankan — tidak ada bentuk `go run`", () => {
    for (const p of [
      rakitPerintahGen(["module", "--tag", "t", "--pkg", "p"], "/proyek"),
      rakitPerintahGen(["dto"], "/proyek"),
      rakitPerintahFreeze(["--pkg", "p"], "/proyek"),
    ]) {
      expect(p.jenis).toBe("go");
      expect(p.argumen).not.toContain("run");
      expect(p.argumen[0]).toBe("-config");
    }
    expect(rakitPerintahGen(["module", "--tag", "t", "--pkg", "p"], "/proyek")).toMatchObject({
      jenis: "go",
      paket: "./genmodule",
    });
    expect(rakitPerintahGen(["dto"], "/proyek")).toMatchObject({ jenis: "go", paket: "./gendto" });
  });

  it("gen dto juga membawa -config", () => {
    expect(rakitPerintahGen(["dto"], "/proyek").argumen).toEqual(["-config", "/proyek"]);
  });

  it("freeze membawa -config, -pkg, dan -freeze; --apply tetap opt-in", () => {
    const kering = rakitPerintahFreeze(["--pkg", "p"], "/proyek");
    expect(kering.argumen).toEqual(["-config", "/proyek", "-pkg", "p", "-freeze"]);
    expect(rakitPerintahFreeze(["--pkg", "p", "--apply"], "/proyek").argumen).toContain("-apply");
  });

  it("freeze menolak tanpa --pkg", () => {
    expect(() => rakitPerintahFreeze([], "/proyek")).toThrow(/--pkg/);
  });

  // Pesan "butuh --tag/--pkg" pernah memaku contoh `standard gen module …` untuk SEMUA
  // pemanggilnya, termasuk `freeze` dan `gen wiring` — yaitu menyuruh orang menjalankan
  // subperintah yang salah untuk masalah yang sedang dilaporkan.
  it("contoh di pesan galat menyebut subperintah yang SEDANG dipakai", () => {
    expect(() => rakitPerintahFreeze([], "/proyek")).toThrow("standard freeze --pkg");
    expect(() => rakitPerintahGenBanyak(["wiring", "--pkg", "p"], "/proyek")).toThrow(
      "standard gen wiring",
    );
    expect(() => rakitPerintahGen(["module", "--pkg", "p"], "/proyek")).toThrow(
      "standard gen module",
    );
  });
});

describe("rakitPerintahGen — bagian tak dikenal dilaporkan, bukan dibuang", () => {
  it("bendera salah ketik ditolak alih-alih diabaikan diam-diam", () => {
    expect(() => rakitPerintahGen(["module", "--tag", "t", "--pkg", "p", "--aply"], "/proyek")).toThrow(
      /--aply/,
    );
  });

  it("argumen posisional ditolak", () => {
    expect(() => rakitPerintahGen(["module", "keluarga"], "/proyek")).toThrow(/keluarga/);
  });

  it("bendera bernilai yang nilainya bendera lain ditolak, bukan menelan --apply", () => {
    expect(() => rakitPerintahGen(["module", "--tag", "--apply", "--pkg", "p"], "/proyek")).toThrow(
      /--tag/,
    );
  });

  it("jenis tak dikenal menyebut jenis yang ada", () => {
    expect(() => rakitPerintahGen(["modul"], "/proyek")).toThrow(/module/);
  });

  it("tanpa jenis sama sekali ditolak", () => {
    expect(() => rakitPerintahGen([], "/proyek")).toThrow(/module/);
  });
});

describe("rakitPerintahGenBanyak — jenis yang mekar jadi beberapa perintah", () => {
  it("gen common menjalankan ketiga generator kontrak, cwd di akar PROYEK", () => {
    const semua = rakitPerintahGenBanyak(["common"], "/proyek");
    expect(semua).toHaveLength(3);
    for (const p of semua) {
      // Skrip kontrak tidak punya bendera -config sama sekali: ia membaca config dari cwd, jadi
      // cwd-nya WAJIB akar proyek — kebalikan persis dari alat Go.
      expect(p.cwd).toBe("/proyek");
      expect(p.argumen[0]).toContain("contract-scripts");
      expect(p.argumen).not.toContain("--apply");
    }
    expect(semua.map((p) => p.alat)).toEqual([
      "gen-permissions.ts",
      "gen-error-codes.ts",
      "gen-shared-spec.ts",
    ]);
  });

  it("gen common --apply meneruskan --apply ke tiap generator", () => {
    for (const p of rakitPerintahGenBanyak(["common", "--apply"], "/proyek")) {
      expect(p.argumen).toContain("--apply");
    }
  });

  it("gen wiring menuntut --tag dan --pkg", () => {
    expect(() => rakitPerintahGenBanyak(["wiring", "--pkg", "p"], "/proyek")).toThrow(/--tag/);
    const p = rakitPerintahGenBanyak(["wiring", "--tag", "t", "--pkg", "p"], "/proyek")[0]!;
    expect(p.argumen).toEqual([expect.stringContaining("gen-wiring.ts"), "--tag", "t", "--pkg", "p"]);
  });

  // Fasad tunggal tidak boleh diam-diam memulangkan perintah PERTAMA dari sebuah jenis yang
  // sebenarnya menghasilkan tiga — itu akan menjalankan sepertiga pekerjaan dan melapor sukses.
  it("fasad tunggal menolak jenis yang menghasilkan beberapa perintah, dengan pesannya sendiri", () => {
    expect(() => rakitPerintahGen(["common"], "/proyek")).toThrow(/common/);
    expect(() => rakitPerintahGen(["common"], "/proyek")).toThrow(/3/);
  });
});
