// Stamp a version into wails.json's info.productVersion so Wails templates it
// into the macOS Info.plist and the Windows installer / .exe metadata.
//
// Usage: node scripts/set-version.mjs 1.2.3
//
// Cross-platform (Node is available in every build job), so we avoid relying on
// jq/sed behaving identically across macOS, Linux and Windows runners.
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const version = process.argv[2];
if (!version) {
  console.error("usage: node scripts/set-version.mjs <version>");
  process.exit(1);
}

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const file = join(root, "wails.json");

const config = JSON.parse(readFileSync(file, "utf8"));
config.info = config.info || {};
config.info.productVersion = version;
writeFileSync(file, JSON.stringify(config, null, 2) + "\n");

console.log(`wails.json info.productVersion = ${version}`);
