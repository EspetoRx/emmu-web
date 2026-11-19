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
      console.error("[snes.js] worker error event:", event);
      this.fail(new Error(event.message || "Falha no worker de emulação."));
    });
    this.worker.addEventListener("messageerror", (event) => {
      console.error("[snes.js] worker messageerror event:", event);
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
    console.log("[snes.js] setButton:", { button, pressed, player, slot });
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
  const system = format === "NES" ? "NES" : "SNES";
  console.log("[snes.js] createEmulator:", {
    format,
    system,
    byteLength: romBytes?.byteLength,
    bufferByteLength: romBytes?.buffer?.byteLength,
    byteOffset: romBytes?.byteOffset,
  });
  const emulator = new EmulationWorkerClient();
  try {
    await emulator.request("initialize", { rom: romBytes, system }, [
      romBytes.buffer,
    ]);
    console.log("[snes.js] createEmulator inicializado com sucesso:", { system });
    return emulator;
  } catch (error) {
    console.error("[snes.js] createEmulator falhou:", {
      system,
      message: error instanceof Error ? error.message : String(error),
      error,
    });
    emulator.dispose();
    throw error;
  }
}
