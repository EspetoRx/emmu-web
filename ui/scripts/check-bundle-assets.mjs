// Valida que o dist/ contém todos os cores WASM (incluindo N64 e NDS no
// WebView desktop) e os assets de runtime do N64.
// Roda como `postbuild`: se faltar alguma dependência, o bundle desktop (que
// embute frontendDist) e o deploy web falham com mensagem clara.
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const uiDir = process.cwd();
const dist = join(uiDir, "dist");
const missing = [];

const cores = [
  "emmu_snes",
  "emmu_nes",
  "emmu_gba",
  "emmu_gbc",
  "emmu_gb",
  "emmu_gg",
  "emmu_sms",
  "emmu_ws",
  "emmu_pce",
  "emmu_n64",
  "emmu_nds",
];

if (!existsSync(join(dist, "index.html"))) missing.push("dist/index.html");

const assetsDir = join(dist, "assets");
const assets = existsSync(assetsDir) ? readdirSync(assetsDir) : [];
for (const core of cores) {
  const found = assets.some(
    (name) => name.startsWith(`${core}_bg-`) && name.endsWith(".wasm"),
  );
  if (!found) missing.push(`dist/assets/${core}_bg-*.wasm`);
}

for (const file of ["n64wasm.js", "n64wasm.wasm", "assets.zip"]) {
  if (!existsSync(join(dist, "wasm", "n64", file))) {
    missing.push(`dist/wasm/n64/${file}`);
  }
}

if (missing.length) {
  console.error("[check-bundle-assets] Faltam dependências no dist/:");
  for (const item of missing) console.error(`  - ${item}`);
  console.error("Rode `npm run build:wasm` antes de `npm run build`.");
  process.exit(1);
}

console.log(
  `[check-bundle-assets] OK: ${cores.length} cores WASM + assets N64Wasm presentes no dist/.`,
);
