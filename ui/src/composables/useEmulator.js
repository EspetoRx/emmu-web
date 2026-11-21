import { computed, nextTick, ref } from "vue";
import { saveGameProgress, saveLibraryGame } from "../stores/libraryStore.js";
import { createEmulator } from "./snes.js";

const SNES_FRAME_WIDTH = 256;
const NES_FRAME_WIDTH = 256;
const GBA_FRAME_WIDTH = 240;
const GBC_FRAME_WIDTH = 160;
const SNES_FRAME_HEIGHT = 224;
const NES_FRAME_HEIGHT = 240;
const GBA_FRAME_HEIGHT = 160;
const GBC_FRAME_HEIGHT = 144;
const PCE_FRAME_WIDTH = 282;
const PCE_FRAME_HEIGHT = 242;
const SMS_FRAME_WIDTH = 256;
const SMS_FRAME_HEIGHT = 224;
const WS_FRAME_WIDTH = 224;
const WS_FRAME_HEIGHT = 144;
const FRAME_INTERVAL = 1000 / 60;
const CHECKPOINT_INTERVAL = 5000;

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
    return window.__TAURI__?.core.invoke(cmd, args);
  }
  throw new Error("API invoke do Tauri não disponível.");
}

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function isGameBoyFormat(format) {
  return format === "GBC" || format === "GB";
}

// Game Gear tem a mesma resolução LCD do Game Boy, mas usa um core e um
// controle próprios (dois botões + Start, sem Select).
function isGameGearFormat(format) {
  return format === "GG";
}

// WonderSwan usa tela Landscape 224x144 e dois direcionais de 4 vias.
function isWonderSwanFormat(format) {
  return format === "WS";
}

// O player expõe X/Y/L/R como botões de face/shoulder. No WonderSwan eles
// controlam o segundo direcional (Y-pad); os nomes U/D/L/R são os mesmos usados
// pela ABI do Mesen, então web e desktop recebem o mesmo evento.
const WS_SECOND_PAD_BUTTONS = {
  X: "U",
  Y: "D",
  L: "L",
  R: "R",
};

function coreButtonForFormat(format, button) {
  return isWonderSwanFormat(format) ? (WS_SECOND_PAD_BUTTONS[button] ?? button) : button;
}

function formatClockTime(date = new Date()) {
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function useEmulator({
  activeGame,
  selectedGameId,
  awaitingRomRecovery,
  openMenu,
  openFilePicker,
  onBeforeOpenGame,
  onAfterReturnToLibrary,
  onReturnToLibraryCleanup,
  onSetAppError,
  onClearAppError,
  onSetPlayerError,
  onClearPlayerError,
  onAudioInitialize,
  onAudioReportError,
  onAudioClearError,
  onAudioQueueFrame,
  onAudioStopPlayback,
  onAudioHideControls,
  getAudioVolume,
}) {
  const canvasRef = ref(null);
  let snesCore = null;
  const hasCore = ref(false);
  const stateSaveStatus = ref("");
  const isPlaying = ref(false);
  const isSavingState = ref(false);
  const isRestarting = ref(false);
  const recoveryPrompt = ref(null);
  const historyGame = ref(null);
  const isRestoringSave = ref(false);
  const resumedFromSave = ref(false);

  let emulationTimerId = 0;
  let nextEmulationFrameAt = 0;
  let lastCheckpointAt = 0;
  let checkpointPromise = null;
  let checkpointRecordsHistory = false;
  let emulationGeneration = 0;
  let gameLoadGeneration = 0;
  let restartGeneration = 0;
  let renderedFrameTime = 0;
  let skippedFrameTime = 0;
  let renderEveryFrames = 1;
  let emulatedFrameNumber = 0;
  let frameImageData = null;
  const pressedButtons = new Set();

  function setCore(core) {
    snesCore = core;
    hasCore.value = Boolean(core);
  }
  const frameWidth = computed(() => {
    const format = activeGame.value?.format;
    if (format === "NES") return NES_FRAME_WIDTH;
    if (format === "GBA") return GBA_FRAME_WIDTH;
    if (format === "SMS") return SMS_FRAME_WIDTH;
    if (isGameBoyFormat(format) || isGameGearFormat(format)) return GBC_FRAME_WIDTH;
    if (isWonderSwanFormat(format)) return WS_FRAME_WIDTH;
    if (format === "PCE") return PCE_FRAME_WIDTH;
    return SNES_FRAME_WIDTH;
  });
  const frameHeight = computed(() => {
    const format = activeGame.value?.format;
    if (format === "NES") return NES_FRAME_HEIGHT;
    if (format === "GBA") return GBA_FRAME_HEIGHT;
    if (format === "SMS") return SMS_FRAME_HEIGHT;
    if (isGameBoyFormat(format) || isGameGearFormat(format)) return GBC_FRAME_HEIGHT;
    if (isWonderSwanFormat(format)) return WS_FRAME_HEIGHT;
    if (format === "PCE") return PCE_FRAME_HEIGHT;
    return SNES_FRAME_HEIGHT;
  });

  function setCanvasElement(el) {
    canvasRef.value = el;
  }

  function stopEmulationLoop() {
    emulationGeneration += 1;
    if (emulationTimerId) {
      clearTimeout(emulationTimerId);
      emulationTimerId = 0;
    }
    nextEmulationFrameAt = 0;
  }

  function drawFrame(frame, frameInfo = {}) {
    const canvas = canvasRef.value;
    const context = canvas?.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("Não foi possível preparar a tela do jogo.");
    }

    // No desktop o Mesen serve cada frame como imagem BMP via protocolo
    // customizado. O drawImage é feito pelo compositor do navegador, sem
    // trazer os pixels para o JavaScript.
    if (frame && typeof frame !== "string" && "naturalWidth" in frame) {
      const width = frameInfo.width || frame.naturalWidth;
      const height = frameInfo.height || frame.naturalHeight;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      context.drawImage(frame, 0, 0);
      return;
    }

    // Cores WASM: o frame é RGBA8888 cru e as dimensões vêm do formato.
    const width = frameInfo.width || frameWidth.value;
    const expectedHeight = frameInfo.height || frameHeight.value;
    const expectedLen = width * expectedHeight * 4;
    const height =
      frame?.length === expectedLen
        ? expectedHeight
        : Math.max(1, Math.floor((frame?.length ?? 0) / (width * 4)));
    if (
      !frameImageData ||
      frameImageData.width !== width ||
      frameImageData.height !== height ||
      canvas.width !== width ||
      canvas.height !== height
    ) {
      canvas.width = width;
      canvas.height = height;
      frameImageData = new ImageData(width, height);
    }
    frameImageData.data.set(
      frame?.subarray(0, frameImageData.data.length) ?? [],
    );
    context.putImageData(frameImageData, 0, 0);
  }

  async function capturePreview() {
    // No desktop o frame exibido vem de um protocolo customizado, o que deixa o
    // canvas marcado como "tainted" e faz toBlob() falhar. O core native
    // codifica o último frame diretamente em PNG.
    if (isTauriDesktop() && typeof snesCore?.capturePreview === "function") {
      const bytes = await snesCore.capturePreview();
      if (!bytes?.length) {
        throw new Error("Não foi possível capturar a prévia do jogo.");
      }
      return new Blob([bytes], { type: "image/png" });
    }

    const canvas = canvasRef.value;
    if (!canvas) {
      return Promise.reject(
        new Error("A tela do jogo não está disponível para captura."),
      );
    }
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Não foi possível criar a prévia do jogo."));
      }, "image/png");
    });
  }

  function handleCheckpointError(error) {
    onSetPlayerError?.(
      `Não foi possível salvar o progresso: ${errorText(error)}`,
    );
  }

  async function saveCurrentProgress({
    recordHistory = false,
    showStatus = false,
  } = {}) {
    const game = activeGame.value;
    const core = snesCore;
    if (!core || !game) return;
    if (checkpointPromise) {
      const pendingCheckpoint = checkpointPromise;
      const pendingRecordsHistory = checkpointRecordsHistory;
      await pendingCheckpoint;
      if (!recordHistory || pendingRecordsHistory) return;
      if (snesCore !== core || activeGame.value !== game) return;
    }

    const gameId = game.id;
    const progressPromise = (async () => {
      const state = new Blob([await core.saveState()], {
        type: "application/octet-stream",
      });
      let preview = game.preview ?? null;
      let refreshedPreview = null;
      if (canvasRef.value) {
        try {
          refreshedPreview = await capturePreview();
          preview = refreshedPreview;
        } catch {}
      }
      const stateSavedAt = Date.now();
      const progress = { state, stateSavedAt };
      if (preview) progress.preview = preview;
      const savedGame = await saveGameProgress(gameId, progress, {
        recordHistory,
      });

      if (refreshedPreview) {
        if (game.previewUrl) URL.revokeObjectURL(game.previewUrl);
        game.preview = refreshedPreview;
        game.previewUrl = URL.createObjectURL(refreshedPreview);
      }
      game.state = state;
      game.stateSavedAt = stateSavedAt;
      game.saveHistory = savedGame.saveHistory;

      if (showStatus && snesCore === core && activeGame.value?.id === gameId) {
        const savedTime = formatClockTime(new Date(stateSavedAt));
        stateSaveStatus.value = recordHistory
          ? `Salvo manualmente às ${savedTime}`
          : `Autosave às ${savedTime}`;
      }
    })();

    checkpointPromise = progressPromise;
    checkpointRecordsHistory = recordHistory;
    try {
      await progressPromise;
    } finally {
      if (checkpointPromise === progressPromise) {
        checkpointPromise = null;
        checkpointRecordsHistory = false;
      }
    }
  }

  async function saveGameState() {
    if (!snesCore || !activeGame.value) return;
    isSavingState.value = true;
    stateSaveStatus.value = "Salvando estado...";
    try {
      await saveCurrentProgress({ recordHistory: true, showStatus: true });
    } catch (error) {
      handleCheckpointError(error);
      stateSaveStatus.value = "";
    } finally {
      isSavingState.value = false;
    }
  }

  function openSaveHistory(game) {
    historyGame.value = game;
  }

  async function restoreHistoricalSave(game, save) {
    if (isRestoringSave.value) return;
    isRestoringSave.value = true;
    try {
      onBeforeOpenGame?.();
      const savedGame = await saveGameProgress(
        game.id,
        {
          state: save.state,
          stateSavedAt: save.savedAt,
        },
        { recordHistory: true },
      );
      game.state = savedGame.state;
      game.stateSavedAt = savedGame.stateSavedAt;
      game.saveHistory = savedGame.saveHistory;
      historyGame.value = null;
      await openGame(game, { skipScrollCapture: true });
    } catch (error) {
      onSetAppError?.(
        `Não foi possível restaurar esse save: ${errorText(error)}`,
      );
      historyGame.value = null;
    } finally {
      isRestoringSave.value = false;
    }
  }

  function scheduleEmulationFrame(
    generation,
    targetTime = performance.now() + FRAME_INTERVAL,
  ) {
    nextEmulationFrameAt = targetTime;
    const delay = Math.max(0, targetTime - performance.now());
    emulationTimerId = window.setTimeout(
      () => emulationTick(generation),
      delay,
    );
  }

  function shouldRenderFrame() {
    emulatedFrameNumber += 1;
    return (
      renderEveryFrames === 1 || emulatedFrameNumber % renderEveryFrames === 0
    );
  }

  function updateFramePacing(rendered, processingTimeMs, elapsedFrameMs) {
    const current = rendered ? renderedFrameTime : skippedFrameTime;
    const frameTime = Math.max(processingTimeMs, elapsedFrameMs);
    const average = current ? current * 0.8 + frameTime * 0.2 : frameTime;
    if (rendered) renderedFrameTime = average;
    else skippedFrameTime = average;

    const frameBudget = FRAME_INTERVAL * 0.95;
    if (renderedFrameTime <= frameBudget) {
      renderEveryFrames = 1;
      return;
    }

    const estimatedSkipTime = skippedFrameTime || renderedFrameTime * 0.6;
    if (estimatedSkipTime >= frameBudget) {
      renderEveryFrames = 2;
      return;
    }
    renderEveryFrames = Math.min(
      4,
      Math.max(
        2,
        Math.ceil(
          (renderedFrameTime - estimatedSkipTime) /
            (frameBudget - estimatedSkipTime),
        ),
      ),
    );
  }

  function emulationTick(generation) {
    if (generation !== emulationGeneration || !snesCore || !activeGame.value)
      return;

    const core = snesCore;
    const renderGraphics = shouldRenderFrame();
    const frameStartedAt = performance.now();
    void core
      .runFrame(renderGraphics)
      .then((frame) => {
        if (
          generation !== emulationGeneration ||
          core !== snesCore ||
          !activeGame.value
        )
          return;
        if (frame.frame instanceof Image || frame.frame?.length) {
          drawFrame(frame.frame, frame);
        }
        try {
          onAudioQueueFrame?.(frame);
        } catch (error) {
          onAudioReportError?.(error);
        }
        updateFramePacing(
          renderGraphics,
          frame.processingTimeMs,
          performance.now() - frameStartedAt,
        );
        if (frameStartedAt - lastCheckpointAt >= CHECKPOINT_INTERVAL) {
          lastCheckpointAt = frameStartedAt;
          void saveCurrentProgress({ showStatus: true }).catch(
            handleCheckpointError,
          );
        }
      })
      .catch((error) => {
        if (generation !== emulationGeneration || core !== snesCore) return;
        onSetPlayerError?.(`A emulação foi interrompida: ${errorText(error)}`);
        stopEmulationLoop();
        core.dispose();
        snesCore = null;
        isPlaying.value = false;
      })
      .finally(() => {
        if (
          generation === emulationGeneration &&
          core === snesCore &&
          activeGame.value
        ) {
          scheduleEmulationFrame(
            generation,
            nextEmulationFrameAt + FRAME_INTERVAL,
          );
        }
      });
  }

  function setButton(button, pressed, player = 1, event = null) {
    // Compatibilidade com chamadores antigos que passavam o PointerEvent como
    // terceiro argumento (o Player.vue fazia isso antes do helper pressButton).
    if (player && typeof player === "object") {
      event = player;
      player = 1;
    }
    event?.preventDefault?.();
    if (!snesCore) return;
    const core = snesCore;
    const slot = player === 2 ? 2 : 1;
    const key = `${slot}:${button}`;
    if (pressed) pressedButtons.add(key);
    else pressedButtons.delete(key);
    const coreButton = coreButtonForFormat(activeGame.value?.format, button);
    const call =
      typeof core.setButton === "function"
        ? core.setButton(coreButton, pressed, slot)
        : core.setButton(coreButton, pressed);
    void Promise.resolve(call).catch((error) => {
      onSetPlayerError?.(
        `Não foi possível atualizar o controle: ${errorText(error)}`,
      );
    });
  }

  function setEmulatorVolume(volume) {
    if (typeof snesCore?.setVolume !== "function") return;
    void Promise.resolve(snesCore.setVolume(volume)).catch(() => {});
  }

  function setEmulatorP2Enabled(enabled) {
    if (typeof snesCore?.setP2Enabled !== "function") return;
    void Promise.resolve(snesCore.setP2Enabled(enabled)).catch(() => {});
  }

  function releaseAllButtons() {
    for (const key of pressedButtons) {
      const [slotStr, button] = key.split(":");
      setButton(button, false, Number(slotStr) || 1, null);
    }
    pressedButtons.clear();
  }

  function clearPressedButtonsOnly() {
    pressedButtons.clear();
  }

  async function restartGame() {
    if (!snesCore || !activeGame.value || isRestarting.value) return;

    const core = snesCore;
    const gameId = activeGame.value.id;
    const requestGeneration = ++restartGeneration;
    isRestarting.value = true;
    isPlaying.value = false;
    onClearPlayerError?.();
    stateSaveStatus.value = "Reiniciando jogo...";
    stopEmulationLoop();
    releaseAllButtons();
    onAudioStopPlayback?.();

    try {
      if (checkpointPromise) {
        try {
          await checkpointPromise;
        } catch (error) {
          handleCheckpointError(error);
        }
      }
      if (
        requestGeneration !== restartGeneration ||
        core !== snesCore ||
        activeGame.value?.id !== gameId
      ) {
        return;
      }

      await core.restart();
      if (
        requestGeneration !== restartGeneration ||
        core !== snesCore ||
        activeGame.value?.id !== gameId
      ) {
        return;
      }

      const firstFrame = await core.runFrame();
      if (
        requestGeneration !== restartGeneration ||
        core !== snesCore ||
        activeGame.value?.id !== gameId
      ) {
        return;
      }
      drawFrame(firstFrame.frame, firstFrame);
      try {
        onAudioQueueFrame?.(firstFrame);
      } catch (error) {
        onAudioReportError?.(error);
      }

      resumedFromSave.value = false;
      recoveryPrompt.value = null;
      stateSaveStatus.value = "Jogo reiniciado.";
      isPlaying.value = true;
      lastCheckpointAt = performance.now();
      renderedFrameTime = 0;
      skippedFrameTime = 0;
      renderEveryFrames = 1;
      emulatedFrameNumber = 0;
      void saveCurrentProgress().catch(handleCheckpointError);
      scheduleEmulationFrame(emulationGeneration);
    } catch (error) {
      if (
        requestGeneration !== restartGeneration ||
        core !== snesCore ||
        activeGame.value?.id !== gameId
      ) {
        return;
      }
      stateSaveStatus.value = "";
      onSetPlayerError?.(
        `Não foi possível reiniciar o jogo: ${errorText(error)}`,
      );
    } finally {
      if (requestGeneration === restartGeneration) isRestarting.value = false;
    }
  }

  async function openGame(game, { skipScrollCapture = false } = {}) {
    if (game.launchBlocked) {
      return;
    }
    if (game.romUnavailable) {
      awaitingRomRecovery.value = game;
      openFilePicker?.();
      return;
    }
    if (!skipScrollCapture && !activeGame.value) {
      onBeforeOpenGame?.();
    }
    if (game.romUnavailable) {
      awaitingRomRecovery.value = game;
      openFilePicker?.();
      return;
    }

    const loadGeneration = ++gameLoadGeneration;
    restartGeneration += 1;
    isRestarting.value = false;
    onAudioHideControls?.();
    onAudioClearError?.();

    let audioReady = Promise.resolve();
    try {
      audioReady = (onAudioInitialize?.() ?? Promise.resolve()).catch(
        (error) => {
          onAudioReportError?.(error);
        },
      );
    } catch (error) {
      onAudioReportError?.(error);
    }

    releaseAllButtons();
    stopEmulationLoop();
    const previousCore = snesCore;
    if (previousCore) {
      try {
        if (activeGame.value) await saveCurrentProgress();
      } catch (error) {
        handleCheckpointError(error);
      } finally {
        previousCore.dispose();
      }
    }
    if (loadGeneration !== gameLoadGeneration) return;
    onAudioStopPlayback?.();
    setCore(null);
    isPlaying.value = false;
    activeGame.value = game;
    selectedGameId.value = game.id;
    onClearPlayerError?.();
    resumedFromSave.value = false;
    stateSaveStatus.value = "";
    onClearAppError?.();
    openMenu.value = null;

    let core = null;
    try {
      await nextTick();
      const romBytes = new Uint8Array(await game.rom.arrayBuffer());
      if (game.rom instanceof File) {
        const durableRom = new Blob([romBytes], {
          type: "application/octet-stream",
        });
        await saveLibraryGame({
          ...game,
          rom: durableRom,
          romUnavailable: false,
        });
        Object.assign(game, { rom: durableRom, romUnavailable: false });
      }
      core = await createEmulator(romBytes, game.format);
      await audioReady;
      if (
        loadGeneration !== gameLoadGeneration ||
        activeGame.value?.id !== game.id
      ) {
        core.dispose();
        return;
      }
      // O Mesen toca o som via SDL (fora do WebAudio), então o volume precisa
      // ser enviado também para o core.
      if (typeof core.setVolume === "function") {
        void Promise.resolve(core.setVolume(getAudioVolume?.() ?? 1)).catch(
          () => {},
        );
      }
      if (game.state) {
        try {
          await core.loadState(new Uint8Array(await game.state.arrayBuffer()));
        } catch (error) {
          if (
            loadGeneration !== gameLoadGeneration ||
            activeGame.value?.id !== game.id
          ) {
            core.dispose();
            return;
          }
          setCore(core);
          onSetPlayerError?.("Não foi possível carregar o estado salvo.");
          recoveryPrompt.value = { gameId: game.id, reason: errorText(error) };
          return;
        }
      }
      if (
        loadGeneration !== gameLoadGeneration ||
        activeGame.value?.id !== game.id
      ) {
        core.dispose();
        return;
      }

      setCore(core);
      resumedFromSave.value = Boolean(game.state);
      const firstFrame = await core.runFrame();
      if (loadGeneration !== gameLoadGeneration || snesCore !== core) {
        if (snesCore !== core) core.dispose();
        return;
      }
      drawFrame(firstFrame.frame, firstFrame);
      try {
        onAudioQueueFrame?.(firstFrame);
      } catch (error) {
        onAudioReportError?.(error);
      }
      isPlaying.value = true;
      lastCheckpointAt = performance.now();
      renderedFrameTime = 0;
      skippedFrameTime = 0;
      renderEveryFrames = 1;
      emulatedFrameNumber = 0;
      void saveCurrentProgress().catch(handleCheckpointError);
      scheduleEmulationFrame(emulationGeneration);
    } catch (error) {
      if (loadGeneration !== gameLoadGeneration) {
        if (core && snesCore !== core) core.dispose();
        return;
      }
      core?.dispose();
      if (snesCore === core) setCore(null);
      isPlaying.value = false;
      activeGame.value = null;
      if (error?.name === "NotFoundError") {
        const unavailableGame = {
          ...game,
          rom: new Blob(),
          romUnavailable: true,
        };
        Object.assign(game, unavailableGame);
        try {
          await saveLibraryGame(unavailableGame);
        } catch (persistError) {
        }
        onSetAppError?.(
          `A ROM "${game.fileName}" não está mais acessível. Reimporte o arquivo para continuar.`,
        );
      } else {
        const blockedGame = {
          ...game,
          launchBlocked: true,
        };
        Object.assign(game, blockedGame);
        try {
          await saveLibraryGame(blockedGame);
        } catch (persistError) {
        }
        onSetAppError?.(`Não foi possível iniciar o jogo: ${errorText(error)}`);
      }
    }
  }

  async function returnToLibrary() {
    const returnGeneration = ++gameLoadGeneration;
    restartGeneration += 1;
    isRestarting.value = false;
    onAudioHideControls?.();
    releaseAllButtons();
    stopEmulationLoop();
    const core = snesCore;
    if (core && activeGame.value) {
      try {
        await saveCurrentProgress();
      } catch (error) {
        handleCheckpointError(error);
      }
    }
    if (returnGeneration !== gameLoadGeneration) return;
    core?.dispose();
    onAudioStopPlayback?.();
    setCore(null);
    isPlaying.value = false;
    activeGame.value = null;
    resumedFromSave.value = false;
    stateSaveStatus.value = "";
    onClearPlayerError?.();
    openMenu.value = null;
    onReturnToLibraryCleanup?.();
    await onAfterReturnToLibrary?.();
  }

  function dismissRecoveryPrompt() {
    recoveryPrompt.value = null;
    gameLoadGeneration += 1;
    restartGeneration += 1;
    isRestarting.value = false;
    stopEmulationLoop();
    clearPressedButtonsOnly();
    snesCore?.dispose();
    setCore(null);
    onAudioStopPlayback?.();
    isPlaying.value = false;
    activeGame.value = null;
    resumedFromSave.value = false;
    stateSaveStatus.value = "";
    onClearPlayerError?.();
  }

  function handleBackgroundSave() {
    if (snesCore) {
      releaseAllButtons();
      void saveCurrentProgress().catch(handleCheckpointError);
    }
  }

  function disposeEmulator() {
    releaseAllButtons();
    stopEmulationLoop();
    const core = snesCore;
    if (core) {
      void saveCurrentProgress()
        .catch(handleCheckpointError)
        .finally(() => core.dispose());
    }
    // Libera recursos do MesenCore antes de fechar, evitando crash em
    // VideoRenderer::IsRecording() ao encerrar a aplicação desktop.
    if (isTauriDesktop()) {
      void tauriInvoke("mesen_release", {}).catch(() => {});
    }
  }

  return {
    canvasRef,
    hasCore,
    frameWidth,
    frameHeight,
    stateSaveStatus,
    isPlaying,
    isSavingState,
    isRestarting,
    recoveryPrompt,
    historyGame,
    isRestoringSave,
    resumedFromSave,
    setCanvasElement,
    capturePreview,
    saveGameState,
    setEmulatorVolume,
    setEmulatorP2Enabled,
    openSaveHistory,
    restoreHistoricalSave,
    setButton,
    releaseAllButtons,
    restartGame,
    openGame,
    returnToLibrary,
    dismissRecoveryPrompt,
    handleBackgroundSave,
    disposeEmulator,
  };
}
