/** emmu/platforms/web/ui/src/composables/snes.js */
import { createPspAdapter } from "../wasm/psp/adapter.js";

function isTauriDesktop() {
  return (
    typeof window !== "undefined" &&
    Boolean(window.__TAURI_INTERNALS__ || window.__TAURI__?.core?.invoke)
  );
}

async function tauriInvoke(cmd, args) {
  if (window.__TAURI_INTERNALS__?.invoke) {
    return window.__TAURI_INTERNALS__.invoke(cmd, args);
  }
  if (window.__TAURI__?.core?.invoke) {
    return window.__TAURI__.core.invoke(cmd, args);
  }
  throw new Error("API invoke do Tauri não disponível.");
}

class MesenTauriClient {
  constructor(romBytes, screenSize, console = "NES") {
    this.romBytes = romBytes;
    this.console = console;
    this.width = screenSize?.width || 256;
    this.height = screenSize?.height || 239;
    this.disposed = false;
    this.frameNonce = 0;
    this.frameImage = new Image();
  }

  async runFrame(renderGraphics = true) {
    if (this.disposed) {
      throw new Error("O emulador já foi encerrado.");
    }
    const start = performance.now();
    const info = await tauriInvoke("mesen_run_frame", { renderGraphics });
    if (!renderGraphics || !info.has_frame) {
      return {
        frame: new Uint8ClampedArray(0),
        width: info.width || this.width,
        height: info.height || this.height,
        processingTimeMs: performance.now() - start,
      };
    }
    // O frame vem como BMP por um protocolo customizado: o WebView decodifica
    // nativamente sem converter ~245 KB em array JSON (o que travava a imagem
    // no desktop enquanto o SDL continuava tocando áudio).
    const image = this.frameImage;
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("Falha ao carregar frame do Mesen."));
      image.src = `emmu-frame://localhost/frame?n=${++this.frameNonce}`;
    });
    return {
      frame: image,
      width: image.naturalWidth || info.width || this.width,
      height: image.naturalHeight || info.height || this.height,
      processingTimeMs: performance.now() - start,
    };
  }

  async restart() {
    if (this.disposed) {
      throw new Error("O emulador já foi encerrado.");
    }
    await tauriInvoke("mesen_init_rom", {
      romBytes: Array.from(this.romBytes),
      console: this.console,
    });
  }

  setButton(button, pressed, player = 1) {
    if (this.disposed) {
      return Promise.resolve();
    }
    const slot = player === 2 ? 2 : 1;
    return tauriInvoke("mesen_set_button", {
      button,
      pressed: Boolean(pressed),
      player: slot,
    }).catch(() => {});
  }

  async saveState() {
    const state = await tauriInvoke("mesen_save_state");
    return state instanceof Uint8Array ? state : new Uint8Array(state || []);
  }

  async capturePreview() {
    // O canvas do WebView fica "tainted" porque o frame vem de emmu-frame://.
    // O lado Rust codifica o último frame em PNG e devolve os bytes aqui.
    const bytes = await tauriInvoke("mesen_capture_preview");
    return bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes || []);
  }

  async loadState(state) {
    const bytes = state instanceof Uint8Array ? state : new Uint8Array(state);
    await tauriInvoke("mesen_load_state", { state: Array.from(bytes) });
  }

  setVolume(volume) {
    const percent = Math.round(Math.min(1, Math.max(0, volume)) * 100);
    return tauriInvoke("mesen_set_volume", { volume: percent }).catch(() => {});
  }

  setP2Enabled(enabled) {
    return tauriInvoke("mesen_set_p2_enabled", { enabled: Boolean(enabled) }).catch(
      () => {},
    );
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    void tauriInvoke("mesen_stop").catch(() => {});
  }
}

class EmulationWorkerClient {
  constructor() {
    // [debug-core] console.info("[emmu] worker:create");
    this.worker = new Worker(
      new URL("./../workers/snes.worker.js", import.meta.url),
      {
        type: "module",
      },
    );
    this.nextRequestId = 0;
    this.pendingRequests = new Map();
    this.system = null;
    this.disposed = false;
    // [debug-input] this._loggedSetButtons = new Set();
    this.worker.addEventListener("message", ({ data }) => {
      const request = this.pendingRequests.get(data.id);
      if (!request) return;
      this.pendingRequests.delete(data.id);
      if (data.error) {
        console.error("[emmu] worker:response-error", { id: data.id, error: data.error, stack: data.stack });
        request.reject(new Error(data.error));
      }
      else request.resolve(data.result);
    });
    this.worker.addEventListener("error", (event) => {
      console.error("[emmu] worker:error-event", { message: event.message, filename: event.filename, lineno: event.lineno, colno: event.colno, error: event.error });
      this.fail(new Error(event.message || "Falha no worker de emulação."));
    });
    this.worker.addEventListener("messageerror", (event) => {
      console.error("[emmu] worker:messageerror", event);
      this.fail(
        new Error("Não foi possível receber dados do worker de emulação."),
      );
    });
  }

  request(type, payload = {}, transfer = []) {
    if (this.disposed) {
      return Promise.reject(new Error("O emulador já foi encerrado."));
    }

    const id = ++this.nextRequestId;
    if (type === "initialize") this.system = payload.system;
    // [debug-core] Logs de request. Comentado após validação no web.
    // if (type === "initialize") {
    //   console.info("[emmu] worker:request", { id, type, system: payload.system ?? this.system });
    // } else if (type === "setButton") {
    //   const logKey = `${payload.player}:${payload.button}:${payload.pressed}`;
    //   if (!this._loggedSetButtons.has(logKey)) {
    //     this._loggedSetButtons.add(logKey);
    //     console.info("[emmu] worker:request", { id, type, system: payload.system ?? this.system, player: payload.player, button: payload.button, pressed: payload.pressed });
    //   }
    // }
    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
      try {
        this.worker.postMessage({ id, type, ...payload }, transfer);
      } catch (error) {
        this.pendingRequests.delete(id);
        reject(error);
      }
    });
  }

  fail(error) {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.terminate();
    this.rejectPending(error);
  }

  rejectPending(error) {
    for (const request of this.pendingRequests.values()) {
      request.reject(error);
    }
    this.pendingRequests.clear();
  }

  runFrame(renderGraphics = true) {
    return this.request("runFrame", { renderGraphics });
  }

  restart() {
    return this.request("restart");
  }

  setButton(button, pressed, player = 1) {
    // N64 tem 4 jogadores reais; NDS e os demais cores usam apenas P1/P2.
    const slot = this.system === "N64"
      ? Math.max(1, Math.min(4, player | 0 || 1))
      : this.system === "NDS"
        ? 1
        : (player === 2 ? 2 : 1);
    return this.request("setButton", { button, pressed, player: slot });
  }

  setTouch(x, y) {
    return this.request("setTouch", { x, y });
  }

  endTouch() {
    return this.request("endTouch");
  }

  setVolume(volume) {
    return this.request("setVolume", { volume });
  }

  saveState() {
    return this.request("saveState");
  }

  loadState(state) {
    return this.request("loadState", { state }, [state.buffer]);
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.worker.terminate();
    this.rejectPending(new Error("O emulador foi encerrado."));
  }
}

export async function createEmulator(romBytes, format, options = {}) {
  const system =
    format === "NES"
      ? "NES"
      : format === "GBA"
        ? "GBA"
        : format === "GBC"
          ? "GBC"
          : format === "GB"
            ? "GB"
            : format === "GG"
              ? "GG"
              : format === "SMS"
                ? "SMS"
                : format === "WS" || format === "WSC"
                ? "WS"
                : format === "PCE"
                ? "PCE"
                : format === "N64"
                  ? "N64"
                  : format === "NDS"
                    ? "NDS"
                    : format === "PSP"
                      ? "PSP"
                      : "SNES";

  if (system === "PSP") {
    // PPSSPP é uma aplicação Emscripten com DOM/WebGL2/pthreads: não roda no
    // snes.worker.js e o Mesen não implementa PSP. Vai na main thread, igual no
    // web e no desktop.
    // O PSP precisa do palco da UI para acoplar o canvas do core como overlay.
    const emulator = createPspAdapter(romBytes, options);
    try {
      await emulator.initialize();
      return emulator;
    } catch (error) {
      emulator.dispose();
      throw error;
    }
  }

  if (
    isTauriDesktop() &&
    system !== "N64" &&
    system !== "NDS" &&
    system !== "PSP"
  ) {
    // No desktop, a maioria dos consoles roda no Mesen, com SDL para áudio e
    // save states .mss. N64, NDS e PSP usam WASM no WebView (Mesen não suporta
    // nenhum dos três).
    const romCopy = new Uint8Array(romBytes);
    const screenSize = await tauriInvoke("mesen_init_rom", {
      romBytes: Array.from(romCopy),
      console: system,
    });
    return new MesenTauriClient(romCopy, screenSize, system);
  }

  const emulator = new EmulationWorkerClient();
  try {
    await emulator.request("initialize", { rom: romBytes, system }, [
      romBytes.buffer,
    ]);
    return emulator;
  } catch (error) {
    emulator.dispose();
    throw error;
  }
}
