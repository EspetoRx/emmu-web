import initializeWasm, { SnesEmulator } from "./../wasm/emmu_snes.js";
import initializeNesWasm, { NesEmulator } from "./../wasm/nes/emmu_nes.js";
import initializeGbaWasm, { GbaEmulator } from "./../wasm/gba/emmu_gba.js";
import initializeGbcWasm, { GbcEmulator } from "./../wasm/gbc/emmu_gbc.js";
import initializeGbWasm, { GbEmulator } from "./../wasm/gb/emmu_gb.js";
import initializeGgWasm, { GgEmulator } from "./../wasm/gg/emmu_gg.js";
import initializePceWasm, { PceEmulator } from "./../wasm/pce/emmu_pce.js";

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
        if (system === "NES") {
          await initializeNesWasm();
          emulator = new NesEmulator(rom);
        } else if (system === "SNES") {
          await initializeWasm();
          emulator = new SnesEmulator(rom);
        } else if (system === "GBA") {
          await initializeGbaWasm();
          emulator = new GbaEmulator(rom);
        } else if (system === "GBC") {
          await initializeGbcWasm();
          emulator = new GbcEmulator(rom);
        } else if (system === "GB") {
          await initializeGbWasm();
          emulator = new GbEmulator(rom);
        } else if (system === "GG") {
          await initializeGgWasm();
          emulator = new GgEmulator(rom);
        } else if (system === "PCE") {
          await initializePceWasm();
          emulator = new PceEmulator(rom);
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
        let restartedEmulator;
        if (gameSystem === "NES") {
          restartedEmulator = new NesEmulator(romData);
        } else if (gameSystem === "GBA") {
          restartedEmulator = new GbaEmulator(romData);
        } else if (gameSystem === "GBC") {
          restartedEmulator = new GbcEmulator(romData);
        } else if (gameSystem === "GB") {
          restartedEmulator = new GbEmulator(romData);
        } else if (gameSystem === "GG") {
          restartedEmulator = new GgEmulator(romData);
        } else if (gameSystem === "PCE") {
          restartedEmulator = new PceEmulator(romData);
        } else {
          restartedEmulator = new SnesEmulator(romData);
        }
        emulator.free();
        emulator = restartedEmulator;
        break;
      }
      case "runFrame": {
        const startTime = performance.now();
        const output = emulator.runFrame(data.renderGraphics);
        const isGba = gameSystem === "GBA";
        const frame = isGba ? output.frame : output;
        const audioSamples = isGba ? output.audioSamples : emulator.audioSamples();
        result = {
          frame,
          audioSamples,
          audioSampleRate: isGba
            ? output.audioSampleRate
            : emulator.audioSampleRate(),
          audioChannels: isGba
            ? output.audioChannels
            : (emulator.audioChannels?.() ?? 2),
          processingTimeMs: performance.now() - startTime,
        };
        transfer = [frame.buffer, audioSamples.buffer];
        break;
      }
      case "setButton": {
        const player = data.player === 2 ? 2 : 1;
        if (typeof emulator.setButtonForPlayer === "function") {
          emulator.setButtonForPlayer(data.button, data.pressed, player);
        } else {
          emulator.setButton(data.button, data.pressed, player);
        }
        break;
      }
      case "saveState": {
        const state = await emulator.saveState();
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
    self.postMessage({ id, error: message });
  }
});
