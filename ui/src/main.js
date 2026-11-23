import { createApp } from "vue";
import App from "./App.vue";
import "./style.css";

// O diagnóstico do PPSSPP é opt-in (evita poluir o console na partida normal).
// Três formas de ligar, todas usadas pelas configurações de F5 "PSP verbose":
//  1. VITE_EMMU_PSP_VERBOSE=1 no dev server (cobre o WebView do desktop, que
//     carrega http://127.0.0.1:5173 sem query string);
//  2. ?pspDebug=1 na URL (web);
//  3. localStorage emmu.psp.verbose = "1" (persistente, para o desktop).
function verboseFromStorage() {
  try {
    return window.localStorage?.getItem("emmu.psp.verbose") === "1";
  } catch {
    return false;
  }
}

if (
  import.meta.env.VITE_EMMU_PSP_VERBOSE === "1" ||
  new URLSearchParams(window.location.search).has("pspDebug") ||
  verboseFromStorage()
) {
  globalThis.__emmuPspVerboseLogs = true;
  console.log("[emmu] logs verbose do PSP habilitados");
}

createApp(App).mount("#app");
