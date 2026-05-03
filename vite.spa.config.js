import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'public/build/spa',
    emptyOutDir: true,
    rollupOptions: {
      input: 'resources/spa/main.js',
      output: {
        entryFileNames: 'app.js',
        assetFileNames: (info) => info.name === 'style.css' ? 'app.css' : '[name].[ext]',
      },
    },
    cssCodeSplit: false,
  },
  publicDir: false,
});
