import { computed, nextTick, ref } from "vue";
import { saveGameProgress, saveLibraryGame } from "../stores/libraryStore.js";
import { createEmulator } from "./snes.js";

const FRAME_WIDTH = 256;
const SNES_FRAME_HEIGHT = 224;
const NES_FRAME_HEIGHT = 240;
const FRAME_INTERVAL = 1000 / 60;
const CHECKPOINT_INTERVAL = 5000;

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

export function useEmulator({
  activeGame,
  selectedGameId,
  awaitingRomRecovery,
  openMenu,
  openFilePicker,
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
  const frameHeight = computed(() =>
    activeGame.value?.format === "NES" ? NES_FRAME_HEIGHT : SNES_FRAME_HEIGHT,
  );

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

  function drawFrame(frame) {
    const canvas = canvasRef.value;
    const context = canvas?.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("Não foi possível preparar a tela do jogo.");
    }
    if (!frameImageData || frameImageData.height !== frameHeight.value) {
      frameImageData = new ImageData(FRAME_WIDTH, frameHeight.value);
    }
    frameImageData.data.set(frame);
    context.putImageData(frameImageData, 0, 0);
  }

  function capturePreview() {
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
    console.error("Could not save the game checkpoint:", error);
    onSetPlayerError?.(
      `Não foi possível salvar o progresso: ${errorText(error)}`,
    );
  }

  async function saveCurrentProgress({ recordHistory = false } = {}) {
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
        } catch (error) {
          console.warn(
            "Could not refresh the game preview while saving progress:",
            error,
          );
        }
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
      await saveCurrentProgress({ recordHistory: true });
      const savedTime = new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      }).format(new Date());
      stateSaveStatus.value = `Estado salvo às ${savedTime}.`;
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
      await openGame(game);
    } catch (error) {
      console.error("Could not restore a saved game history entry:", error);
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
    if (
      generation !== emulationGeneration ||
      !snesCore ||
      !activeGame.value
    )
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
        if (frame.frame.length) drawFrame(frame.frame);
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
          void saveCurrentProgress().catch(handleCheckpointError);
        }
      })
      .catch((error) => {
        if (generation !== emulationGeneration || core !== snesCore)
          return;
        console.error("Game emulation stopped:", error);
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

  function setButton(button, pressed, event) {
    event?.preventDefault();
    if (!snesCore) return;
    const core = snesCore;
    if (pressed) pressedButtons.add(button);
    else pressedButtons.delete(button);
    void core.setButton(button, pressed).catch((error) => {
      console.error("Could not update the game controller:", error);
      onSetPlayerError?.(
        `Não foi possível atualizar o controle: ${errorText(error)}`,
      );
    });
  }

  function releaseAllButtons() {
    for (const button of pressedButtons) {
      setButton(button, false);
    }
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
      drawFrame(firstFrame.frame);
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
      console.error("Could not restart the game:", error);
      stateSaveStatus.value = "";
      onSetPlayerError?.(
        `Não foi possível reiniciar o jogo: ${errorText(error)}`,
      );
    } finally {
      if (requestGeneration === restartGeneration) isRestarting.value = false;
    }
  }

  async function openGame(game) {
    console.log("[openGame] início:", game.name, game.format);
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
          console.error("[openGame] erro no audioReady:", error);
          onAudioReportError?.(error);
        },
      );
    } catch (error) {
      console.error("[openGame] erro ao iniciar áudio:", error);
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
      console.log(
        "[openGame] nextTick concluído, canvas:",
        Boolean(canvasRef.value),
      );
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
      console.log("[openGame] criando emulador...");
      core = await createEmulator(romBytes, game.format);
      console.log("[openGame] emulador criado, aguardando áudio...");
      await audioReady;
      console.log("[openGame] áudio pronto");
      if (
        loadGeneration !== gameLoadGeneration ||
        activeGame.value?.id !== game.id
      ) {
        core.dispose();
        return;
      }
      if (game.state) {
        try {
          console.log("[openGame] carregando estado salvo...");
          await core.loadState(new Uint8Array(await game.state.arrayBuffer()));
          console.log("[openGame] estado carregado");
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
      console.log("[openGame] rodando primeiro frame...");
      const firstFrame = await core.runFrame();
      console.log(
        "[openGame] primeiro frame recebido:",
        firstFrame?.frame?.length,
      );
      if (loadGeneration !== gameLoadGeneration || snesCore !== core) {
        console.warn("[openGame] abortado após runFrame:", {
          loadGeneration,
          gameLoadGeneration,
          sameCore: snesCore === core,
        });
        if (snesCore !== core) core.dispose();
        return;
      }
      console.log("[openGame] após guardas:", {
        loadGeneration,
        gameLoadGeneration,
        hasCoreAfter: Boolean(snesCore),
        sameCore: snesCore === core,
      });
      drawFrame(firstFrame.frame);
      try {
        onAudioQueueFrame?.(firstFrame);
      } catch (error) {
        onAudioReportError?.(error);
      }
      isPlaying.value = true;
      console.log(
        "[openGame] emulação ativa! hasCore:",
        hasCore.value,
        "isPlaying:",
        isPlaying.value,
      );
      lastCheckpointAt = performance.now();
      renderedFrameTime = 0;
      skippedFrameTime = 0;
      renderEveryFrames = 1;
      emulatedFrameNumber = 0;
      void saveCurrentProgress().catch(handleCheckpointError);
      scheduleEmulationFrame(emulationGeneration);
    } catch (error) {
      console.error("[openGame] falhou no catch:", error);
      if (loadGeneration !== gameLoadGeneration) {
        if (core && snesCore !== core) core.dispose();
        return;
      }
      core?.dispose();
      if (snesCore === core) setCore(null);
      isPlaying.value = false;
      console.error("Could not start the game:", error);
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
          console.error(
            "Could not mark the unavailable ROM in the library:",
            persistError,
          );
        }
        onSetAppError?.(
          `A ROM "${game.fileName}" não está mais acessível. Reimporte o arquivo para continuar.`,
        );
      } else {
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
    onClearPlayerError?.();
    openMenu.value = null;
    onReturnToLibraryCleanup?.();
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
  }

  return {
    canvasRef,
    hasCore,
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
