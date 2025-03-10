import { defineConfig } from 'vite';
import logseqPlugin from "vite-plugin-logseq";
import UnoCSS from 'unocss/vite';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    // @ts-ignore
    logseqPlugin.default(),
    UnoCSS(),
  ],
  // Makes HMR available for development
  build: {
    target: "esnext",
    minify: "esbuild",
  },
});
