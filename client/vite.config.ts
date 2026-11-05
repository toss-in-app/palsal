import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

import aitDevtools from '@apps-in-toss/devtools/unplugin';
import pkg from './package.json';

export default defineConfig({
  // 테스트(vitest)에서는 브릿지 mock 만 쓰고 플로팅 패널은 넣지 않아요.
  plugins: [aitDevtools.vite({ panel: !process.env.VITEST }), react()],
  define: {
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    css: false,
  },
});
