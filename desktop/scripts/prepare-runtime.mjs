// Stages the backend sources + compose file into src-tauri/resources/runtime
// so they are bundled into Kontakte-Akte.app. Optionally includes a prebuilt
// Docker image archive (see scripts/build-backend-image.sh) for offline install.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const desktop = resolve(here, "..");
const repo = resolve(desktop, "..");
const target = join(desktop, "src-tauri", "resources", "runtime");
const version = JSON.parse(readFileSync(join(desktop, "src-tauri", "tauri.conf.json"), "utf8")).version;

const skip = (src) => !/__pycache__|\.pyc$|\.pytest_cache|\.ruff_cache|dev-autogen\.db/.test(src);

rmSync(target, { recursive: true, force: true });
mkdirSync(join(target, "backend"), { recursive: true });
for (const item of ["app", "migrations", "requirements.txt", "Dockerfile", ".dockerignore"]) {
  cpSync(join(repo, "backend", item), join(target, "backend", item), { recursive: true, filter: skip });
}
cpSync(join(repo, "infrastructure", "docker-compose.yml"), join(target, "docker-compose.yml"));
writeFileSync(join(target, "VERSION"), `${version}\n`);

const image = join(repo, "build", "kontakte-akte-backend-image.tar.gz");
if (existsSync(image)) {
  cpSync(image, join(target, "kontakte-akte-backend-image.tar.gz"));
  console.log("prepare-runtime: bundled prebuilt backend image");
}
console.log(`prepare-runtime: staged backend runtime ${version} → ${target}`);
