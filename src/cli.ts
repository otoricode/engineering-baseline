import { doctor } from "./doctor/command.js";
import { freeze, gen } from "./gen/command.js";
import { gate } from "./gate/command.js";
import { rulesLint } from "./rules/command.js";
import { verify } from "./verify/command.js";

export type Tulis = (baris: string) => void;
export type Subperintah = (argv: string[], tulis: Tulis) => Promise<number>;

/**
 * Subperintah didaftarkan di sini oleh task-task berikutnya. Nilai `null` berarti
 * namanya sudah dipesan dan muncul di --help, tapi implementasinya belum ada:
 * memanggilnya keluar 3, bukan 0. Perintah yang belum jadi tidak boleh diam-diam
 * dianggap sukses oleh pemanggil otomatis.
 *
 * Keenam slot kini terisi, tapi perilaku `null` tetap diikat uji: `cli.test.ts`
 * mendaftarkan KUNCI SINTETIS-nya sendiri untuk itu, bukan bersandar pada slot
 * kosong yang kebetulan masih ada — jadi slot berikutnya yang dipesan tetap
 * keluar 3, bukan diam-diam dianggap sukses.
 */
export const SUBCOMMANDS: Record<string, Subperintah | null> = {
  doctor,
  "rules-lint": rulesLint,
  verify,
  gen,
  freeze,
  gate,
};

export async function runCli(argv: string[], tulis: Tulis = console.log): Promise<number> {
  const [pertama, ...sisa] = argv;

  if (pertama === undefined) {
    cetakBantuan(tulis);
    return 2;
  }
  if (pertama === "--help" || pertama === "-h" || pertama === "help") {
    cetakBantuan(tulis);
    return 0;
  }
  if (!(pertama in SUBCOMMANDS)) {
    tulis(`subperintah tak dikenal: ${pertama}`);
    cetakBantuan(tulis);
    return 2;
  }

  const jalan = SUBCOMMANDS[pertama];
  if (jalan === null || jalan === undefined) {
    tulis(`subperintah ${pertama} belum diimplementasikan`);
    return 3;
  }
  return jalan(sisa, tulis);
}

function cetakBantuan(tulis: Tulis): void {
  tulis("standard <subperintah> [opsi]");
  tulis("");
  for (const nama of Object.keys(SUBCOMMANDS).sort()) {
    tulis(`  ${nama}`);
  }
}
