// Builds the zip to upload to the Chrome Web Store Developer Dashboard.
// Run with: npm run extension:package
//
// chrome-extension/ stays usable for local development. The packaged copy drops
// localhost, which store users don't need and reviewers would have to question.
import { execFileSync } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE = join(ROOT, "chrome-extension");
const LOCALHOST = "http://localhost:3000";
const SUMMARY_LIMIT = 132;

const stage = await mkdtemp(join(tmpdir(), "veo-extension-"));
try {
  await cp(SOURCE, stage, {
    recursive: true,
    filter: (path) => !path.slice(SOURCE.length).split("/").some((part) => part.startsWith(".")),
  });

  const manifestPath = join(stage, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  const withoutLocalhost = (patterns) => patterns.filter((pattern) => !pattern.startsWith(LOCALHOST));
  manifest.host_permissions = withoutLocalhost(manifest.host_permissions);
  for (const script of manifest.content_scripts) script.matches = withoutLocalhost(script.matches);
  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const backgroundPath = join(stage, "background.js");
  const background = await readFile(backgroundPath, "utf8");
  const localList = `const APP_URLS = ["${LOCALHOST}", "https://veo-analytics.vercel.app"];`;
  if (!background.includes(localList)) {
    throw new Error("APP_URLS in background.js has changed; update this script to match.");
  }
  await writeFile(
    backgroundPath,
    background.replace(localList, 'const APP_URLS = ["https://veo-analytics.vercel.app"];'),
  );

  // Checks that would otherwise only fail after uploading.
  if (manifest.description.length > SUMMARY_LIMIT) {
    throw new Error(`The manifest description is over ${SUMMARY_LIMIT} characters.`);
  }
  for (const [size, path] of Object.entries(manifest.icons)) {
    const { width, height } = await sharp(join(stage, path)).metadata();
    if (width !== Number(size) || height !== Number(size)) {
      throw new Error(`${path} is ${width}x${height}, expected ${size}x${size}.`);
    }
  }
  for (const file of ["manifest.json", "background.js", "bridge.js", "content.js", "popup.js", "popup.html"]) {
    if ((await readFile(join(stage, file), "utf8")).includes("localhost")) {
      throw new Error(`${file} still mentions localhost.`);
    }
  }

  const output = join(ROOT, "store-listing", `veo-analytics-extension-${manifest.version}.zip`);
  await rm(output, { force: true });
  // manifest.json has to sit at the zip's root, so zip from inside the folder.
  execFileSync("zip", ["-X", "-q", "-r", output, "."], { cwd: stage });
  console.log(`store-listing/veo-analytics-extension-${manifest.version}.zip`);
} finally {
  await rm(stage, { recursive: true, force: true });
}
