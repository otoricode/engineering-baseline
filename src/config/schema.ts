export const NAMESPACE_BELUM_DIISI = "REPLACE-ME";

export type StandardConfig = {
  layout: { contractDir: string; backendDir: string; frontendDir: string };
  go: {
    modulePath: string; genDir: string; featureDir: string; dtoconvPkg: string; genSuffix: string;
    // Ketiganya OPSIONAL dan dipakai HANYA oleh gate rute (tooling/contract-scripts/check-routes.ts).
    // Bukan basa-basi bahwa mereka opsional: gate itu memeriksa "tiap direktori feature benar-benar
    // terpasang di titik masuk", dan pemeriksaan itu mustahil tanpa tahu DI MANA titik masuknya dan
    // seperti apa bentuk daftar modulnya. Kalau salah satunya kosong sementara direktori feature
    // TIDAK kosong, gate MERAH — bukan lewat diam-diam. Proyek yang belum punya feature sama sekali
    // lolos, karena di sana tidak ada apa pun untuk diperiksa.
    entrypoint?: string;
    registrarType?: string;
  };
  contract: {
    bundle: string; sharedDir: string;
    shared: { envelope: string; permissions: string; errors: string; publicOps: string };
    // Berkas sumber tempat baris permission DIBUAT (seeder/migrasi/fixture), relatif akar proyek.
    // Dipakai gate permission untuk membuktikan tiap entri katalog benar-benar bisa dipegang role.
    // Kosong + katalog tidak kosong = MERAH; katalog kosong = tidak ada yang perlu dibuktikan.
    permissionSeeds?: string[];
  };
  ledgers: { envelopeOptIn: string; mountedModules: string; routes: string; coverage: string };
  emit: { permissions: string; errorCodes: string };
  idempotency: { uuidNamespace: string };
  rules: { docBase: string; prefix: Record<string, string> };
  language: "id" | "en";
};
