import { defineConfig } from 'vite';

export default defineConfig({
  build: {
    outDir: 'public/build/spa',
    emptyOutDir: true,
    rollupOptions: {
      input: 'resources/spa/main.js',
      output: {
        entryFileNames: 'app.js',
        chunkFileNames: 'chunk-[name]-[hash].js',
        assetFileNames: (info) => info.name === 'style.css' ? 'app.css' : '[name].[ext]',
        // Pisah modul halaman admin yang besar ke chunk tersendiri agar tiap file
        // bundle tetap kecil (juga memperbaiki caching: chunk admin jarang berubah).
        manualChunks(id) {
          if (/[/\\](settings|admin|laporan)\.js$/.test(id)) return 'admin-pages';
        },
      },
    },
    cssCodeSplit: false,
  },
  publicDir: false,
});
