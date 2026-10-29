import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import {defineConfig, type Plugin} from 'vite';

function copyBundledGalleryImages(): Plugin {
  return {
    name: 'copy-bundled-gallery-images',
    apply: 'build',
    closeBundle() {
      const srcDir = path.resolve(__dirname, 'src/assets/images');
      const outDir = path.resolve(__dirname, 'dist/src/assets/images');
      if (!fs.existsSync(srcDir)) return;
      fs.mkdirSync(outDir, {recursive: true});
      for (const entry of fs.readdirSync(srcDir, {withFileTypes: true})) {
        if (entry.isFile()) {
          fs.copyFileSync(path.join(srcDir, entry.name), path.join(outDir, entry.name));
        }
      }
    },
  };
}

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss(), copyBundledGalleryImages()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
