'use strict';

/**
 * Universal CommonJS Startup File for cPanel ("Setup Node.js App" / Phusion Passenger) & PM2.
 *
 * Why this file exists:
 * - cPanel's Phusion Passenger loader (lsnode.js) loads the startup file via CommonJS `require()`.
 * - Because package.json uses `"type": "module"`, this `.cjs` entrypoint bridges Passenger cleanly
 *   into the compiled ESM production server (`./server.js`).
 * - If `./dist/index.html` or `./server.js` has not been built yet (e.g. after extracting a ZIP on
 *   cPanel and clicking "Run NPM Install" + "Restart"), it automatically runs `npm run build` once
 *   before booting the server.
 */

const fs = require('node:fs');
const path = require('node:path');
const { execSync } = require('node:child_process');
const { pathToFileURL } = require('node:url');

process.env.NODE_ENV = process.env.NODE_ENV || 'production';

const rootDir = __dirname;
const clientEntry = path.join(rootDir, 'dist', 'index.html');
const serverEntry = path.join(rootDir, 'server.js');

if (!fs.existsSync(clientEntry) || !fs.existsSync(serverEntry)) {
  console.log('[boot] Production build artifacts missing. Running `npm run build` automatically...');
  try {
    execSync('npm run build', {
      cwd: rootDir,
      stdio: 'inherit',
      env: { ...process.env },
    });
  } catch (buildErr) {
    console.error('[boot] Automatic `npm run build` failed:', buildErr);
    process.exit(1);
  }
}

import(pathToFileURL(serverEntry).href).catch((err) => {
  console.error('[boot] Failed to start Nocturne Cinema Vault production server:', err);
  process.exit(1);
});
