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
      case "initialize": {
        const system = data.system;
        const rom = new Uint8Array(data.rom);
        console.log("[snes.worker] initialize:", {
          id,
          system,
          romLength: rom.length,
        });
        if (system === "NES") {
          await initializeNesWasm();
          emulator = new NesEmulator(rom);
        } else if (system === "SNES") {
          await initializeWasm();
          console.log(
            "[snes.worker] Wasm SNES inicializado, instanciando SnesEmulator...",
          );
          emulator = new SnesEmulator(rom);
          console.log("[snes.worker] SnesEmulator instanciado com sucesso.");
        } else {
          throw new Error(`Sistema não suportado: ${system}`);
        }
        romData = rom;
        gameSystem = system;
        break;
      }
      case "restart": {
        if (!romData || !gameSystem) {
          throw new Error("Nenhum jogo está carregado para reiniciar.");
        }
        console.log("[snes.worker] restart:", {
          gameSystem,
          romLength: romData.length,
        });
        const restartedEmulator =
          gameSystem === "NES"
            ? new NesEmulator(romData)
            : new SnesEmulator(romData);
        emulator.free();
        emulator = restartedEmulator;
        break;
      }
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
      case "setButton": {
        const player = data.player === 2 ? 2 : 1;
        console.log("[worker] setButton:", {
          button: data.button,
          pressed: data.pressed,
          player,
          hasSetButtonForPlayer: typeof emulator?.setButtonForPlayer,
        });
        if (typeof emulator.setButtonForPlayer === "function") {
          emulator.setButtonForPlayer(data.button, data.pressed, player);
        } else {
          emulator.setButton(data.button, data.pressed);
        }
        break;
      }
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
    const message = error instanceof Error ? error.message : String(error);
    console.error("[snes.worker] erro ao processar mensagem:", {
      id,
      type,
      message,
      error,
    });
    self.postMessage({ id, error: message });
  }
});
