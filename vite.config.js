import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { sites } from '@openai/sites-vite-plugin';
import { copyFile, mkdir } from 'node:fs/promises';

const sitesWorkerEntry = () => ({
  name: 'sites-worker-entry',
  apply: 'build',
  async closeBundle() {
    await mkdir('dist/server', { recursive: true });
    await copyFile('server/index.js', 'dist/server/index.js');
  },
});

export default defineConfig(({ mode }) => ({
  base: mode === 'github-pages' ? '/yingxi-crane-bloom/' : '/',
  plugins: [react(), sites(), sitesWorkerEntry()],
}));
