import { defineConfig } from 'vite';
import logseqDevPlugin from "vite-plugin-logseq";
import UnoCSS from 'unocss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    logseqDevPlugin(),
    UnoCSS(),
  ],
  // Makes HMR available for development
  build: {
    target: "esnext",
    minify: "esbuild",
  },
});
