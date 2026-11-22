import initializeWasm, { SnesEmulator } from "./../wasm/emmu_snes.js";
import initializeNesWasm, { NesEmulator } from "./../wasm/nes/emmu_nes.js";
import initializeGbaWasm, { GbaEmulator } from "./../wasm/gba/emmu_gba.js";
import initializeGbcWasm, { GbcEmulator } from "./../wasm/gbc/emmu_gbc.js";
import initializeGbWasm, { GbEmulator } from "./../wasm/gb/emmu_gb.js";
import initializeGgWasm, { GgEmulator } from "./../wasm/gg/emmu_gg.js";
import initializeSmsWasm, { SmsEmulator } from "./../wasm/sms/emmu_sms.js";
import initializeWsWasm, { WsEmulator } from "./../wasm/ws/emmu_ws.js";
import initializePceWasm, { PceEmulator } from "./../wasm/pce/emmu_pce.js";
import initializeN64Wasm, { N64Emulator } from "./../wasm/n64/emmu_n64.js";
import { initializeNdsWasm, NdsCoreAdapter } from "./../wasm/nds/adapter.js";

let emulator = null;
let romData = null;
let gameSystem = null;
// [debug-input] const loggedSetButtons = new Set();

self.addEventListener("message", async ({ data }) => {
  const { id, type } = data;
  try {
    let result;
    let transfer = [];
    // [debug-input] Log de chegada dos eventos no worker. Comentado após
    // validação no web; reative se precisar rastrear input de outro emulador.
    // if (type === "setButton") {
    //   const logKey = `${data.player}:${data.button}:${data.pressed}`;
    //   if (!loggedSetButtons.has(logKey)) {
    //     loggedSetButtons.add(logKey);
    //     console.info("[emmu-worker] recv", {
    //       system: data.system ?? gameSystem,
    //       button: data.button,
    //       pressed: data.pressed,
    //       player: data.player,
    //     });
    //   }
    // }

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
        } else if (system === "SMS") {
          await initializeSmsWasm();
          emulator = new SmsEmulator(rom);
        } else if (system === "WS") {
          await initializeWsWasm();
          emulator = new WsEmulator(rom);
        } else if (system === "PCE") {
          await initializePceWasm();
          emulator = new PceEmulator(rom);
        } else if (system === "N64") {
          await initializeN64Wasm();
          emulator = new N64Emulator(rom);
          if (typeof emulator.initialize === "function") {
            await emulator.initialize();
          }
        } else if (system === "NDS") {
          await initializeNdsWasm();
          emulator = new NdsCoreAdapter(rom);
          if (typeof emulator.initialize === "function") {
            await emulator.initialize();
          }
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
        // N64: recriar o módulo Emscripten troca o canvas WebGL e deixa o jogo
        // desenhado em apenas um quadrante. O bridge usa _neil_reset() no mesmo
        // módulo, preservando canvas, áudio e dimensões do frame.
        // NDS: o adapter reconstrói o dust sem recriar o módulo WASM, mantendo
        // renderers, ROM e save RAM do cartucho.
        if ((gameSystem === "N64" || gameSystem === "NDS") && emulator) {
          await emulator.restart();
          break;
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
        } else if (gameSystem === "SMS") {
          restartedEmulator = new SmsEmulator(romData);
        } else if (gameSystem === "WS") {
          restartedEmulator = new WsEmulator(romData);
        } else if (gameSystem === "PCE") {
          restartedEmulator = new PceEmulator(romData);
        } else if (gameSystem === "N64") {
          restartedEmulator = new N64Emulator(romData);
          if (typeof restartedEmulator.initialize === "function") {
            await restartedEmulator.initialize();
          }
        } else {
          restartedEmulator = new SnesEmulator(romData);
        }
        emulator.free();
        emulator = restartedEmulator;
        break;
      }
      case "runFrame": {
        const startTime = performance.now();
        const output = await emulator.runFrame(data.renderGraphics);
        const isObjectOutput = output && typeof output === "object" && output.frame;
        const frame = isObjectOutput ? output.frame : output;
        const audioSamples = isObjectOutput
          ? output.audioSamples
          : emulator.audioSamples();
        result = {
          frame,
          width: isObjectOutput ? output.width : undefined,
          height: isObjectOutput ? output.height : undefined,
          audioSamples,
          audioSampleRate: isObjectOutput
            ? output.audioSampleRate
            : emulator.audioSampleRate(),
          audioChannels: isObjectOutput
            ? output.audioChannels
            : (emulator.audioChannels?.() ?? 2),
          processingTimeMs: performance.now() - startTime,
        };
        if (frame?.buffer) transfer.push(frame.buffer);
        if (audioSamples?.buffer) transfer.push(audioSamples.buffer);
        break;
      }
      case "setButton": {
        const player = Math.max(1, Math.min(4, data.player | 0 || 1));
        if (typeof emulator.setButtonForPlayer === "function") {
          emulator.setButtonForPlayer(data.button, data.pressed, player);
        } else {
          emulator.setButton(data.button, data.pressed, player);
        }
        break;
      }
      case "setTouch": {
        if (typeof emulator.setTouch === "function") {
          emulator.setTouch(data.x, data.y);
        }
        break;
      }
      case "endTouch": {
        if (typeof emulator.endTouch === "function") {
          emulator.endTouch();
        }
        break;
      }
      case "setVolume": {
        if (typeof emulator.setVolume === "function") {
          emulator.setVolume(data.volume);
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
        await emulator.loadState(new Uint8Array(data.state));
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
