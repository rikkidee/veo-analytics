// Generates the extension icons and the store promo tile.
// Run with: npm run extension:assets
//
// sharp comes with Next.js, so this needs no dependency of its own.
import { mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const GREEN = "#047857";
const WHITE = "#ffffff";

// A football above three rising bars, drawn on a 128-unit grid.
function mark({ x = 0, y = 0, scale = 1 } = {}) {
  // Seams run from the centre panel's corners toward the dark patches on the edge.
  const seams = [
    [44, 43, 44, 37],
    [48.76, 46.45, 54.46, 44.6],
    [46.94, 52.05, 50.47, 56.9],
    [41.06, 52.05, 37.53, 56.9],
    [39.24, 46.45, 33.54, 44.6],
  ];
  const patches = [
    [44, 34],
    [57.3, 43.7],
    [52.2, 59.3],
    [35.8, 59.3],
    [30.7, 43.7],
  ];
  return `
    <g transform="translate(${x} ${y}) scale(${scale})">
      <rect x="34" y="76" width="15" height="20" rx="3" fill="${WHITE}"/>
      <rect x="57" y="64" width="15" height="32" rx="3" fill="${WHITE}"/>
      <rect x="80" y="36" width="15" height="60" rx="3" fill="${WHITE}"/>
      <circle cx="44" cy="48" r="15" fill="${WHITE}"/>
      <clipPath id="ball"><circle cx="44" cy="48" r="15"/></clipPath>
      <g clip-path="url(#ball)" fill="${GREEN}">
        ${patches.map(([cx, cy]) => `<circle cx="${cx}" cy="${cy}" r="4.2"/>`).join("")}
      </g>
      <polygon points="44,43 48.76,46.45 46.94,52.05 41.06,52.05 39.24,46.45" fill="${GREEN}"/>
      ${seams
        .map(
          ([x1, y1, x2, y2]) =>
            `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${GREEN}" stroke-width="1.5"/>`,
        )
        .join("")}
    </g>`;
}

// Chrome's guidance: 96x96 of artwork with 16px of transparent padding.
const icon128 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 128 128">
  <rect x="16" y="16" width="96" height="96" rx="22" fill="${GREEN}"/>
  ${mark()}
</svg>`;

// Tighter crop, so the artwork isn't lost in the management page.
const icon48 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="12 12 104 104">
  <rect x="16" y="16" width="96" height="96" rx="22" fill="${GREEN}"/>
  ${mark()}
</svg>`;

// Drawn separately: the ball's panels can't survive at this size.
const icon16 = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16">
  <rect width="16" height="16" rx="3" fill="${GREEN}"/>
  <rect x="3" y="10" width="2" height="3" fill="${WHITE}"/>
  <rect x="7" y="9" width="2" height="4" fill="${WHITE}"/>
  <rect x="11" y="3" width="2" height="10" fill="${WHITE}"/>
  <circle cx="5" cy="5" r="3" fill="${WHITE}"/>
</svg>`;

const promoBars = [60, 96, 78, 132, 176]
  .map(
    (height, index) =>
      `<rect x="${268 + index * 32}" y="${280 - height}" width="22" height="${height}" rx="4" fill="${WHITE}" fill-opacity="${0.12 + index * 0.05}"/>`,
  )
  .join("");

const promo = `<svg xmlns="http://www.w3.org/2000/svg" width="440" height="280" viewBox="0 0 440 280">
  <rect width="440" height="280" fill="${GREEN}"/>
  ${promoBars}
  ${mark({ x: 8, y: 22, scale: 0.86 })}
  <text x="32" y="158" font-family="Helvetica, Arial, sans-serif" font-size="36" font-weight="700" fill="${WHITE}">Veo Analytics</text>
  <text x="32" y="192" font-family="Helvetica, Arial, sans-serif" font-size="18" fill="${WHITE}">Match reports to team stats</text>
</svg>`;

const OUTPUTS = [
  { svg: icon128, size: [128, 128], path: "chrome-extension/icons/icon-128.png" },
  { svg: icon48, size: [48, 48], path: "chrome-extension/icons/icon-48.png" },
  { svg: icon16, size: [16, 16], path: "chrome-extension/icons/icon-16.png" },
  // Google asks for store images without an alpha channel.
  { svg: promo, size: [440, 280], path: "store-listing/promo-small-440x280.png", flatten: true },
];

for (const { svg, size, path, flatten } of OUTPUTS) {
  const output = join(ROOT, path);
  await mkdir(dirname(output), { recursive: true });
  let image = sharp(Buffer.from(svg), { density: 384 }).resize(size[0], size[1]);
  if (flatten) image = image.flatten({ background: GREEN }).removeAlpha();
  await image.png().toFile(output);
  console.log(`${path} (${size.join("x")})`);
}
