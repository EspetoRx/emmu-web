import initializeWasm, { SnesEmulator } from "./../wasm/emmu_snes.js";
import initializeNesWasm, { NesEmulator } from "./../wasm/nes/emmu_nes.js";

let emulator = null;
let romData = null;
let gameSystem = null;

self.addEventListener("message", async ({ data }) => {
  const { id, type } = data;
  try {
    let result;
    let transfer = [];

    switch (type) {
      case "initialize":
        const system = data.system;
        const rom = new Uint8Array(data.rom);
        if (system === "NES") {
          await initializeNesWasm();
          emulator = new NesEmulator(rom);
        } else if (system === "SNES") {
          await initializeWasm();
          emulator = new SnesEmulator(rom);
        } else {
          throw new Error(`Sistema não suportado: ${system}`);
        }
        romData = rom;
        gameSystem = system;
        break;
      case "restart":
        if (!romData || !gameSystem) {
          throw new Error("Nenhum jogo está carregado para reiniciar.");
        }
        const restartedEmulator =
          gameSystem === "NES"
            ? new NesEmulator(romData)
            : new SnesEmulator(romData);
        emulator.free();
        emulator = restartedEmulator;
        break;
      case "runFrame": {
        const startTime = performance.now();
        const frame = emulator.runFrame(data.renderGraphics);
        const audioSamples = emulator.audioSamples();
        result = {
          frame,
          audioSamples,
          audioSampleRate: emulator.audioSampleRate(),
          audioChannels: emulator.audioChannels?.() ?? 2,
          processingTimeMs: performance.now() - startTime,
        };
        transfer = [frame.buffer, audioSamples.buffer];
        break;
      }
      case "setButton":
        emulator.setButton(data.button, data.pressed);
        break;
      case "saveState": {
        const state = emulator.saveState();
        result = state;
        transfer = [state.buffer];
        break;
      }
      case "loadState":
        emulator.loadState(new Uint8Array(data.state));
        break;
      default:
        throw new Error(`Solicitação de emulação desconhecida: ${type}`);
    }

    self.postMessage({ id, result }, transfer);
  } catch (error) {
    self.postMessage({
      id,
      error: error instanceof Error ? error.message : String(error),
    });
  }
});
