// Generate the Sparkle/WinSparkle appcast for one release.
//
// The feed carries a single version — the release it ships with — as two
// <item>s, one per platform. Sparkle on macOS matches the enclosure with
// sparkle:os="macos"; WinSparkle matches "windows-x64". Both compare
// sparkle:version against what the installed app reports, which is the NUMERIC
// X.Y.Z (CFBundleVersion on macOS, update.Numeric(version) registered with
// WinSparkle) because neither bundle format accepts a -prerelease suffix.
// Known consequence: an installed 1.2.3-rc.1 reports 1.2.3 and will not be
// offered the final 1.2.3 — prerelease distribution is manual anyway, and
// /releases/latest (which serves this feed) never points at a prerelease.
//
// Usage:
//   node scripts/appcast.mjs \
//     --version 1.2.3 --numeric-version 1.2.3 --tag v1.2.3 \
//     --dmg build/bin/o3-1.2.3-universal.dmg --dmg-sig <base64> \
//     --setup build/bin/o3-1.2.3-windows-amd64-setup.exe --setup-sig <base64> \
//     [--repo AngelMsger/o3] [--base-url https://host/dir] [--out appcast.xml]
//
// --dmg-sig / --setup-sig are the raw EdDSA signatures from Sparkle's
//   sign_update --ed-key-file <key> -p <file>
// --base-url overrides the enclosure URL prefix for local end-to-end testing
//   (production URLs are the deterministic releases/download/<tag>/ form, valid
//   the moment the draft release is published).
import { statSync, writeFileSync } from "node:fs";
import { basename } from "node:path";

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 2) {
    const key = argv[i];
    if (!key.startsWith("--") || argv[i + 1] === undefined) {
      console.error(`unexpected argument: ${key}`);
      process.exit(1);
    }
    args[key.slice(2)] = argv[i + 1];
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));
const required = ["version", "numeric-version", "tag", "dmg", "dmg-sig", "setup", "setup-sig"];
const missing = required.filter((k) => !args[k]);
if (missing.length) {
  console.error(`missing required arguments: ${missing.map((k) => `--${k}`).join(", ")}`);
  process.exit(1);
}

const repo = args.repo ?? "AngelMsger/o3";
const baseURL = (args["base-url"] ?? `https://github.com/${repo}/releases/download/${args.tag}`).replace(/\/$/, "");
const notesURL = `https://github.com/${repo}/releases/tag/${args.tag}`;

const esc = (s) =>
  s.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

// One <item> per platform. sparkle:os is the discriminator; everything else is
// symmetric. minimumSystemVersion mirrors LSMinimumSystemVersion in
// build/darwin/Info.plist. installerArguments makes WinSparkle run the NSIS
// installer silently (/S) after the app quits.
function item({ file, sig, os, extra = "" }) {
  const size = statSync(file).size;
  const url = `${baseURL}/${basename(file)}`;
  return `    <item>
      <title>${esc(args.version)}</title>
      <pubDate>${new Date().toUTCString()}</pubDate>
      <sparkle:version>${esc(args["numeric-version"])}</sparkle:version>
      <sparkle:shortVersionString>${esc(args.version)}</sparkle:shortVersionString>
      <sparkle:releaseNotesLink>${esc(notesURL)}</sparkle:releaseNotesLink>
${extra}      <enclosure
        url="${esc(url)}"
        sparkle:os="${os}"
        sparkle:edSignature="${esc(sig)}"
        length="${size}"
        type="application/octet-stream" />
    </item>`;
}

const xml = `<?xml version="1.0" encoding="utf-8"?>
<rss version="2.0" xmlns:sparkle="http://www.andymatuschak.org/xml-namespaces/sparkle">
  <channel>
    <title>o3</title>
    <description>o3 release feed for Sparkle/WinSparkle</description>
    <language>en</language>
${item({
  file: args.dmg,
  sig: args["dmg-sig"],
  os: "macos",
  extra: "      <sparkle:minimumSystemVersion>11.0.0</sparkle:minimumSystemVersion>\n",
})}
${item({
  file: args.setup,
  sig: args["setup-sig"],
  os: "windows-x64",
  extra: "      <sparkle:installerArguments>/S</sparkle:installerArguments>\n",
})}
  </channel>
</rss>
`;

if (args.out) {
  writeFileSync(args.out, xml);
  console.error(`wrote ${args.out}`);
} else {
  process.stdout.write(xml);
}
