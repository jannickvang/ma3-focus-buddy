#!/usr/bin/env node
/* Embeds the app icon (public/icon.svg) into a pkg-produced executable.
 * Called by the pkg postBuild hook with the executable path as argument.
 *
 * - Windows (.exe): replaces the icon resource via resedit (pure JS).
 * - macOS: injects an .icns as the __NODE_SEA_ICON section via postject
 *   (Finder shows it for the bare executable), then re-signs ad-hoc.
 * - Linux: skipped (executables carry no icon; desktop entries do).
 */
'use strict';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const SVG = path.join(ROOT, 'public', 'icon.svg');
const SIZES = [16, 32, 48, 64, 128, 256, 512, 1024];
const ICO_SIZES = [16, 32, 48, 64, 128, 256];
// Same sentinel fuse @yao-pkg/pkg uses for its SEA blob injection.
const SEA_SENTINEL_FUSE = 'NODE_SEA' + '_FUSE_fce680ab2cc467b6e072b8b5df1996b2';

function renderPngs(dir) {
  const { Resvg } = require('@resvg/resvg-js');
  const svg = fs.readFileSync(SVG, 'utf8');
  const pngs = {};
  for (const size of SIZES) {
    const file = path.join(dir, `icon_${size}.png`);
    fs.writeFileSync(file, new Resvg(svg, { fitTo: { mode: 'width', value: size } }).render().asPng());
    pngs[size] = file;
  }
  return pngs;
}

function buildIcns(dir, pngs) {
  const iconset = path.join(dir, 'icon.iconset');
  fs.mkdirSync(iconset);
  const entries = [
    ['icon_16x16.png', 16], ['icon_16x16@2x.png', 32],
    ['icon_32x32.png', 32], ['icon_32x32@2x.png', 64],
    ['icon_128x128.png', 128], ['icon_128x128@2x.png', 256],
    ['icon_256x256.png', 256], ['icon_256x256@2x.png', 512],
    ['icon_512x512.png', 512], ['icon_512x512@2x.png', 1024]
  ];
  for (const [name, size] of entries) fs.copyFileSync(pngs[size], path.join(iconset, name));
  const icns = path.join(dir, 'icon.icns');
  execFileSync('iconutil', ['-c', 'icns', iconset, '-o', icns], { stdio: 'inherit' });
  return icns;
}

function embedWindows(exe, dir, pngs) {
  const { NtExecutable, NtExecutableResource, Resource, Data } = require('resedit');
  const icons = ICO_SIZES.map((size) => {
    const png = fs.readFileSync(pngs[size]);
    const bin = png.buffer.slice(png.byteOffset, png.byteOffset + png.byteLength);
    return Data.RawIconItem.from(bin, size, size, 32);
  });

  const exeData = fs.readFileSync(exe);
  const nt = NtExecutable.from(exeData.buffer.slice(exeData.byteOffset, exeData.byteOffset + exeData.byteLength));
  const res = NtExecutableResource.from(nt);
  Resource.IconGroupEntry.replaceIconsForResource(res.entries, 1, 0, icons);
  res.outputResource(nt);
  fs.writeFileSync(exe, Buffer.from(nt.generate()));
  console.log(`[icon] Embedded icon into ${path.basename(exe)}`);
}

async function embedMacos(exe, dir, pngs) {
  const { inject } = require('postject');
  const icns = buildIcns(dir, pngs);
  await inject(exe, 'NODE_SEA_ICON', fs.readFileSync(icns), {
    machoSegmentName: 'NODE_SEA',
    sentinelFuse: SEA_SENTINEL_FUSE
  });
  // Injection invalidates the signature; re-sign ad-hoc (arm64 refuses to run otherwise).
  execFileSync('codesign', ['-f', '--sign', '-', exe], { stdio: 'inherit' });
  console.log(`[icon] Embedded ${path.basename(icns)} into ${path.basename(exe)}`);
}

async function main() {
  const exe = process.argv[2];
  if (!exe || !fs.existsSync(exe)) {
    console.error('[icon] Usage: node scripts/embed-icon.js <executable>');
    process.exit(1);
  }
  const isWindows = exe.endsWith('.exe');
  const isMacosTarget = !isWindows && !exe.endsWith('-linux-x64') && !exe.endsWith('-linux-arm64');
  // macOS icon injection needs iconutil/codesign, so it only runs on a Mac.
  if (isMacosTarget && process.platform !== 'darwin') {
    console.log(`[icon] Skipped ${path.basename(exe)} (macOS icons require a macOS build host)`);
    return;
  }
  if (!isWindows && !isMacosTarget) {
    console.log(`[icon] Skipped ${path.basename(exe)} (Linux executables carry no icon)`);
    return;
  }

  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'ma3-icon-'));
  try {
    const pngs = renderPngs(tmp);
    if (isWindows) embedWindows(exe, tmp, pngs);
    else await embedMacos(exe, tmp, pngs);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
}

main().catch((err) => {
  console.error(`[icon] Failed: ${err.message}`);
  process.exit(1);
});
