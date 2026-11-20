/** emmu/platforms/web/ui/src/composables/snes.js */
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
  }

  async runFrame(renderGraphics = true) {
    if (this.disposed) {
      throw new Error("O emulador já foi encerrado.");
    }
    const res = await tauriInvoke("mesen_run_frame", { renderGraphics });
    return {
      frame: new Uint8ClampedArray(res.frame || []),
      width: res.width || this.width,
      height: res.height || this.height,
      processingTimeMs: res.processingTimeMs ?? 0,
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
    this.worker = new Worker(
      new URL("./../workers/snes.worker.js", import.meta.url),
      {
        type: "module",
      },
    );
    this.nextRequestId = 0;
    this.pendingRequests = new Map();
    this.disposed = false;
    this.worker.addEventListener("message", ({ data }) => {
      const request = this.pendingRequests.get(data.id);
      if (!request) return;
      this.pendingRequests.delete(data.id);
      if (data.error) request.reject(new Error(data.error));
      else request.resolve(data.result);
    });
    this.worker.addEventListener("error", (event) => {
      this.fail(new Error(event.message || "Falha no worker de emulação."));
    });
    this.worker.addEventListener("messageerror", (event) => {
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
    const slot = player === 2 ? 2 : 1;
    return this.request("setButton", { button, pressed, player: slot });
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

export async function createEmulator(romBytes, format) {
  const system =
    format === "NES"
      ? "NES"
      : format === "GBA"
        ? "GBA"
        : format === "GBC" || format === "GB"
          ? "GBC"
          : "SNES";

  if (isTauriDesktop()) {
    // No desktop, NES, SNES, GBA e GBC rodam no Mesen (com SDL para áudio e
    // save states). No navegador, NES/SNES/GBC usam WASM e o GBA usa o core
    // Web-GBA.
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
