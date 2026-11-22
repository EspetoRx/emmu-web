import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

export default defineConfig({
  plugins: [vue()],
  // O launch.json do VSCode aponta para 5173; se a porta estiver ocupada,
  // falhar alto é melhor que subir silenciosamente em 5174.
  server: {
    port: 5173,
    strictPort: true,
    // PSP (PPSSPP/Emscripten) usa pthreads + SharedArrayBuffer.
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
  preview: {
    headers: {
      "Cross-Origin-Opener-Policy": "same-origin",
      "Cross-Origin-Embedder-Policy": "require-corp",
    },
  },
});
