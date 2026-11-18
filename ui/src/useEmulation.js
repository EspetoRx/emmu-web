import {
  clearLibraryGames,
  loadControlBindings,
  loadLibraryGames,
  deleteLibraryGame,
  saveControlBindings,
  saveGameProgress,
  saveLibraryGame,
} from "./libraryStore.js";
import { createEmulator } from "./snes.js";

export const FRAME_WIDTH = 256;
export const SNES_FRAME_HEIGHT = 224;
export const NES_FRAME_HEIGHT = 240;
export const FRAME_INTERVAL = 1000 / 60;
export const AUDIO_BATCH_SECONDS = 0.03;
export const MAX_SCHEDULED_AUDIO_SECONDS = 0.1;
export const CHECKPOINT_INTERVAL = 5000;
export const ERROR_TOAST_DURATION_MS = 3000;

export const CONTROL_ACTIONS = [
  { id: "Up", label: "Cima" },
  { id: "Down", label: "Baixo" },
  { id: "Left", label: "Esquerda" },
  { id: "Right", label: "Direita" },
  { id: "A", label: "A" },
  { id: "B", label: "B" },
  { id: "X", label: "X" },
  { id: "Y", label: "Y" },
  { id: "L", label: "L" },
  { id: "R", label: "R" },
  { id: "Start", label: "Start" },
  { id: "Select", label: "Select" },
];

export const DEFAULT_CONTROL_BINDINGS = {
  Up: "ArrowUp",
  Down: "ArrowDown",
  Left: "ArrowLeft",
  Right: "ArrowRight",
  A: "KeyX",
  B: "KeyZ",
  X: "KeyS",
  Y: "KeyA",
  L: "KeyQ",
  R: "KeyW",
  Start: "Enter",
  Select: "ShiftLeft",
};

export const RESERVED_CONTROL_CODES = new Set([
  "Escape", "Tab", "MetaLeft", "MetaRight",
  "ControlLeft", "ControlRight", "AltLeft", "AltRight",
]);
export function useEmulation() {
  let snesCore = null;
  let audioContext = null;
  let audioGainNode = null;
  let audioWorkletNode = null;
  let audioWorkletReady = null;
  let audioWorkletUnavailable = false;
  let nextAudioTime = null;
  let pendingAudioChunks = [];
  let pendingAudioFrames = 0;
  let pendingAudioSampleRate = 0;
  let pendingAudioChannels = 0;
  const scheduledAudioSources = new Set();
  const pressedButtons = new Set();
  let emulationTimerId = 0;
  let nextEmulationFrameAt = 0;
  let lastFrameAt = 0;
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
  let errorToastTimeoutId = 0;
  let errorToastExpiresAt = 0;
  let errorToastSequence = 0;
  let nativeEventUnsubscribers = [];

  let canvasRefLocal = null;
  let gameStageRefLocal = null;

  function setRefs(canvas, stage) {
    canvasRefLocal = canvas;
    gameStageRefLocal = stage;
  }

  const isPlaying = { value: false };
  const isSavingState = { value: false };
  const isRestarting = { value: false };
  const isFullscreen = { value: false };
  const showAudioControls = { value: false };
  const resumedFromSave = { value: false };
  const audioVolume = { value: 0.7 };
  const audioErrorMessage = { value: "" };

  const errorToast = { value: null };
  const controlErrorMessage = { value: "" };
  const controlSaveStatus = { value: "" };
  const stateSaveStatus = { value: "" };
  const recoveryPrompt = { value: null };
  const historyGame = { value: null };
  const deletePrompt = { value: null };
  const clearLibraryPrompt = { value: false };
  const isRestoringSave = { value: false };
  const isDeletingGame = { value: false };
  const isClearingLibrary = { value: false };

  const activeGame = { value: null };
  const selectedGameId = { value: null };
  const openMenu = { value: null };
  const showControls = { value: false };
  const showHelp = { value: false };

  function errorText(error) {
    return error instanceof Error ? error.message : String(error);
  }

  function initializeAudio() {
    if (!audioContext) {
      const AudioContextConstructor = window.AudioContext || window.webkitAudioContext;
      if (!AudioContextConstructor) {
        throw new Error("Este navegador não oferece suporte à reprodução de áudio.");
      }
      audioContext = new AudioContextConstructor();
      audioGainNode = audioContext.createGain();
      audioGainNode.gain.value = audioVolume.value;
      audioGainNode.connect(audioContext.destination);
  function flushAudioBatch() {
    const sampleCount = pendingAudioFrames;
    if (!sampleCount) return;
    const channels = pendingAudioChannels;
    const audioSamples = new Float32Array(sampleCount * channels);
    let offset = 0;
    for (const chunk of pendingAudioChunks) {
      audioSamples.set(chunk.samples, offset);
      offset += chunk.samples.length;
    }
    const sampleRate = pendingAudioSampleRate;
    pendingAudioChunks = [];
    pendingAudioFrames = 0;
    pendingAudioSampleRate = 0;
    pendingAudioChannels = 0;
    if (!audioContext || !audioGainNode) return;
    if (audioContext.state !== "running") {
      if (!audioErrorMessage.value) {
        setAudioError("O áudio foi pausado pelo navegador. Ajuste o volume para reativá-lo.");
      }
      return;
    }
    const buffer = audioContext.createBuffer(channels, sampleCount, sampleRate);
    for (let channel = 0; channel < channels; channel += 1) {
      const output = buffer.getChannelData(channel);
      for (let index = 0; index < sampleCount; index += 1) {
        output[index] = audioSamples[index * channels + channel];
      }
    }
    const source = audioContext.createBufferSource();
    source.buffer = buffer;
    source.connect(audioGainNode);
    source.onended = () => {
      scheduledAudioSources.delete(source);
      source.disconnect();
    };
    if (
      nextAudioTime !== null &&
      nextAudioTime - audioContext.currentTime > MAX_SCHEDULED_AUDIO_SECONDS
    ) {
      for (const scheduledSource of scheduledAudioSources) {
        scheduledSource.stop();
        scheduledSource.disconnect();
      }
      scheduledAudioSources.clear();
      nextAudioTime = null;
    }
    const startAt = Math.max(
      nextAudioTime ?? audioContext.currentTime + 0.02,
      audioContext.currentTime,
    );
    source.start(startAt);
    nextAudioTime = startAt + buffer.duration;
    scheduledAudioSources.add(source);
  }

  function queueAudioFrame({ audioSamples, audioSampleRate, audioChannels = 2 }) {
    if (!audioSamples?.length) return;
    if (
      !audioSampleRate ||
      !audioChannels ||
      audioChannels > 2 ||
      audioSamples.length % audioChannels !== 0
    ) {
      throw new Error("O núcleo retornou um bloco de áudio inválido.");
    }
    if (!audioContext || !audioGainNode) return;
    if (audioContext.state !== "running") {
      if (!audioErrorMessage.value) {
        setAudioError("O áudio foi pausado pelo navegador. Ajuste o volume para reativá-lo.");
      }
      return;
    }
    let samples = audioSamples;
    if (!(samples instanceof Float32Array)) {
      samples = new Float32Array(audioSamples.length);
      for (let index = 0; index < audioSamples.length; index += 1) {
        samples[index] =
          audioSamples instanceof Int16Array
            ? audioSamples[index] / 32768
            : audioSamples[index];
      }
    }
    if (audioWorkletNode) {
      audioWorkletNode.port.postMessage(
        { samples, sampleRate: audioSampleRate, channels: audioChannels },
        [samples.buffer],
      );
      return;
    }
    if (
      pendingAudioChunks.length &&
      (pendingAudioSampleRate !== audioSampleRate ||
        pendingAudioChannels !== audioChannels)
    ) {
      flushAudioBatch();
    }
    pendingAudioSampleRate = audioSampleRate;
    pendingAudioChannels = audioChannels;
    pendingAudioChunks.push({ samples });
    pendingAudioFrames += samples.length / audioChannels;
    if (pendingAudioFrames >= audioSampleRate * AUDIO_BATCH_SECONDS) {
      flushAudioBatch();
    }
  }

  function stopAudioPlayback() {
    for (const source of scheduledAudioSources) {
      source.stop();
      source.disconnect();
    }
    scheduledAudioSources.clear();
    nextAudioTime = null;
    pendingAudioChunks = [];
    pendingAudioFrames = 0;
    pendingAudioSampleRate = 0;
    pendingAudioChannels = 0;
    audioWorkletNode?.port.postMessage({ type: "reset" });
  }

  function scheduleErrorToastExpiry(delay) {
    if (errorToastTimeoutId) clearTimeout(errorToastTimeoutId);
    errorToastTimeoutId = window.setTimeout(() => {
      errorToast.value = null;
      errorToastExpiresAt = 0;
      errorToastTimeoutId = 0;
    }, delay);
  }

  function showErrorToast(message, source) {
    errorToastExpiresAt = Date.now() + ERROR_TOAST_DURATION_MS;
    errorToast.value = { message, source, id: ++errorToastSequence };
    scheduleErrorToastExpiry(ERROR_TOAST_DURATION_MS);
  }

  function clearErrorToast(source) {
    if (source && errorToast.value?.source !== source) return;
    if (errorToastTimeoutId) clearTimeout(errorToastTimeoutId);
    errorToastTimeoutId = 0;
    errorToastExpiresAt = 0;
    errorToast.value = null;
  }

  function setAppError(message) { showErrorToast(message, "app"); }
  function clearAppError() { clearErrorToast("app"); }
  function setPlayerError(message) { showErrorToast(message, "player"); }
  function clearPlayerError() { clearErrorToast("player"); }

  async function restoreLibrary() {
    try {
      const records = await loadLibraryGames();
      return records.map((game) => ({
        ...game,
        previewUrl: game.preview ? URL.createObjectURL(game.preview) : null,
      }));
    } catch (error) {
      console.error("Could not restore the game library:", error);
      setAppError(`Não foi possível carregar a biblioteca: ${errorText(error)}`);
      return [];
    }
  }

  async function restoreControls() {
    try {
      const savedBindings = await loadControlBindings();
      if (savedBindings) {
        return { bindings: validateControlBindings(savedBindings), draft: { ...savedBindings } };
      }
    } catch (error) {
      console.error("Could not restore the controller bindings:", error);
      setAppError(`Não foi possível carregar os controles: ${errorText(error)}`);
    }
    return null;
  }

  function validateControlBindings(bindings) {
    const validated = {};
    const assignedCodes = new Set();
    for (const { id } of CONTROL_ACTIONS) {
      const code = bindings?.[id];
      if (typeof code !== "string" || !code || RESERVED_CONTROL_CODES.has(code)) {
        throw new Error(`A tecla configurada para ${id} é inválida.`);
      }
      if (assignedCodes.has(code)) {
        throw new Error(`A tecla ${formatControlKey(code)} está atribuída a mais de um botão.`);
      }
      assignedCodes.add(code);
      validated[id] = code;
    }
    return validated;
  }

  function formatControlKey(code) {
    const labels = {
      ArrowUp: "↑", ArrowDown: "↓", ArrowLeft: "←", ArrowRight: "→",
      Enter: "Enter", ShiftLeft: "Shift esquerdo", ShiftRight: "Shift direito",
      Space: "Espaço", Backspace: "Backspace", Delete: "Delete",
    };
    if (labels[code]) return labels[code];
    if (code.startsWith("Key")) return code.slice(3);
    if (code.startsWith("Digit")) return code.slice(5);
    if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
    return code;
  }

  function stopEmulationLoop() {
    emulationGeneration += 1;
    if (emulationTimerId) {
      clearTimeout(emulationTimerId);
      emulationTimerId = 0;
    }
    nextEmulationFrameAt = 0;
  }

  function scheduleEmulationFrame(generation, targetTime = performance.now() + FRAME_INTERVAL) {
    nextEmulationFrameAt = targetTime;
    const delay = Math.max(0, targetTime - performance.now());
    emulationTimerId = window.setTimeout(() => emulationTick(generation), delay);
  }

  function shouldRenderFrame() {
    emulatedFrameNumber += 1;
    return renderEveryFrames === 1 || emulatedFrameNumber % renderEveryFrames === 0;
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
      Math.max(2, Math.ceil((renderedFrameTime - estimatedSkipTime) / (frameBudget - estimatedSkipTime))),
    );
  }

  function emulationTick(generation) {
    if (generation !== emulationGeneration || !snesCore || !activeGame.value) return;
    const core = snesCore;
    const renderGraphics = shouldRenderFrame();
    const frameStartedAt = performance.now();
    lastFrameAt = frameStartedAt;
    void core.runFrame(renderGraphics).then((frame) => {
      if (generation !== emulationGeneration || core !== snesCore || !activeGame.value) return;
      if (frame.frame.length) drawFrame(frame.frame);
      try { queueAudioFrame(frame); } catch (error) { reportAudioError(error); }
      updateFramePacing(renderGraphics, frame.processingTimeMs, performance.now() - frameStartedAt);
      if (frameStartedAt - lastCheckpointAt >= CHECKPOINT_INTERVAL) {
        lastCheckpointAt = frameStartedAt;
        void saveCurrentProgress().catch(handleCheckpointError);
      }
    }).catch((error) => {
      if (generation !== emulationGeneration || core !== snesCore) return;
      console.error("Game emulation stopped:", error);
      setPlayerError(`A emulação foi interrompida: ${errorText(error)}`);
      stopEmulationLoop();
      core.dispose();
      snesCore = null;
      isPlaying.value = false;
    }).finally(() => {
      if (generation === emulationGeneration && core === snesCore && activeGame.value) {
        scheduleEmulationFrame(generation, nextEmulationFrameAt + FRAME_INTERVAL);
      }
    });
  }

  function drawFrame(frame) {
    const canvas = canvasRefLocal;
    const context = canvas?.getContext("2d", { alpha: false });
    if (!context) {
      throw new Error("Não foi possível preparar a tela do jogo.");
    }
    const frameHeight = activeGame.value?.format === "NES" ? NES_FRAME_HEIGHT : SNES_FRAME_HEIGHT;
    if (!frameImageData || frameImageData.height !== frameHeight) {
      frameImageData = new ImageData(FRAME_WIDTH, frameHeight);
    }
    frameImageData.data.set(frame);
    context.putImageData(frameImageData, 0, 0);
  }

  function capturePreview() {
    const canvas = canvasRefLocal;
    if (!canvas) {
      return Promise.reject(new Error("A tela do jogo não está disponível para captura."));
    }
    return new Promise((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(new Error("Não foi possível criar a prévia do jogo."));
      }, "image/png");
    });
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
      const state = new Blob([await core.saveState()], { type: "application/octet-stream" });
      let preview = game.preview ?? null;
      let refreshedPreview = null;
      if (canvasRefLocal) {
        try {
          refreshedPreview = await capturePreview();
          preview = refreshedPreview;
        } catch (error) {
          console.warn("Could not refresh the game preview while saving progress:", error);
        }
      }
      const stateSavedAt = Date.now();
      const progress = { state, stateSavedAt };
      if (preview) progress.preview = preview;
      const savedGame = await saveGameProgress(gameId, progress, { recordHistory });
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
    try { await progressPromise; }
    finally {
      if (checkpointPromise === progressPromise) {
        checkpointPromise = null;
        checkpointRecordsHistory = false;
      }
    }
  }

  function handleCheckpointError(error) {
    console.error("Could not save the game checkpoint:", error);
    setPlayerError(`Não foi possível salvar o progresso: ${errorText(error)}`);
  }

  async function saveGameState() {
    if (!snesCore || !activeGame.value) return;
    isSavingState.value = true;
    stateSaveStatus.value = "Salvando estado...";
    try {
      await saveCurrentProgress({ recordHistory: true });
      const savedTime = new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit", minute: "2-digit", second: "2-digit",
      }).format(new Date());
      stateSaveStatus.value = `Estado salvo às ${savedTime}.`;
    } catch (error) {
      handleCheckpointError(error);
      stateSaveStatus.value = "";
    } finally {
      isSavingState.value = false;
    }
  }

  function formatSavedTime(timestamp) {
    if (!timestamp) return "";
    return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
  }

  function formatSaveHistoryTime(timestamp) {
    return new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeStyle: "short" }).format(new Date(timestamp));
  }

  async function openGame(game) {
    if (game.romUnavailable) {
      return { romUnavailable: true, game };
    }
    const loadGeneration = ++gameLoadGeneration;
    restartGeneration += 1;
    isRestarting.value = false;
    showAudioControls.value = false;
    clearAudioError();
    let audioReady = Promise.resolve();
    try {
      audioReady = initializeAudio().catch((error) => { reportAudioError(error); });
    } catch (error) { reportAudioError(error); }
    releaseAllButtons();
    stopEmulationLoop();
    const previousCore = snesCore;
    if (previousCore) {
      try { if (activeGame.value) await saveCurrentProgress(); }
      catch (error) { handleCheckpointError(error); }
      finally { previousCore.dispose(); }
    }
    if (loadGeneration !== gameLoadGeneration) return { cancelled: true };
    stopAudioPlayback();
    snesCore = null;
    isPlaying.value = false;
    activeGame.value = game;
    selectedGameId.value = game.id;
    clearPlayerError();
    resumedFromSave.value = false;
    stateSaveStatus.value = "";
    clearAppError();
    openMenu.value = null;
    await nextTick();
    const romBytes = new Uint8Array(await game.rom.arrayBuffer());
    if (game.rom instanceof File) {
      const durableRom = new Blob([romBytes], { type: "application/octet-stream" });
      await saveLibraryGame({ ...game, rom: durableRom, romUnavailable: false });
      Object.assign(game, { rom: durableRom, romUnavailable: false });
    }
    let core = null;
    try {
      core = await createEmulator(romBytes, game.format);
      await audioReady;
      if (loadGeneration !== gameLoadGeneration || activeGame.value?.id !== game.id) {
        core.dispose();
        return { cancelled: true };
      }
      if (game.state) {
        try {
          await core.loadState(new Uint8Array(await game.state.arrayBuffer()));
        } catch (error) {
          if (loadGeneration !== gameLoadGeneration || activeGame.value?.id !== game.id) {
            core.dispose();
            return { cancelled: true };
          }
          snesCore = core;
      resumedFromSave.value = Boolean(game.state);
      const firstFrame = await core.runFrame();
      if (loadGeneration !== gameLoadGeneration || snesCore !== core) {
        if (snesCore !== core) core.dispose();
        return { cancelled: true };
      }
      drawFrame(firstFrame.frame);
      try { queueAudioFrame(firstFrame); } catch (error) { reportAudioError(error); }
      isPlaying.value = true;
      lastFrameAt = performance.now();
      lastCheckpointAt = lastFrameAt;
      renderedFrameTime = 0;
      skippedFrameTime = 0;
      renderEveryFrames = 1;
      emulatedFrameNumber = 0;
      void saveCurrentProgress().catch(handleCheckpointError);
      scheduleEmulationFrame(emulationGeneration);
      return { started: true };
    } catch (error) {
      if (loadGeneration !== gameLoadGeneration) {
        if (core && snesCore !== core) core.dispose();
        return { cancelled: true };
      }
      core?.dispose();
      if (snesCore === core) snesCore = null;
      isPlaying.value = false;
      console.error("Could not start the game:", error);
      activeGame.value = null;
      if (error?.name === "NotFoundError") {
        const unavailableGame = { ...game, rom: new Blob(), romUnavailable: true };
        Object.assign(game, unavailableGame);
        try { await saveLibraryGame(unavailableGame); } catch (persistError) {
          console.error("Could not mark the unavailable ROM in the library:", persistError);
        }
        setAppError(`A ROM "${game.fileName}" não está mais acessível. Reimporte o arquivo para continuar.`);
      } else {
        setAppError(`Não foi possível iniciar o jogo: ${errorText(error)}`);
      }
      return { error: true };
    }
  }

  async function returnToLibrary() {
    const returnGeneration = ++gameLoadGeneration;
    restartGeneration += 1;
    isRestarting.value = false;
    showAudioControls.value = false;
    releaseAllButtons();
    stopEmulationLoop();
    const core = snesCore;
    if (core && activeGame.value) {
      try { await saveCurrentProgress(); } catch (error) { handleCheckpointError(error); }
    }
    if (returnGeneration !== gameLoadGeneration) return;
    core?.dispose();
    stopAudioPlayback();
    snesCore = null;
    isPlaying.value = false;
    activeGame.value = null;
    resumedFromSave.value = false;
    clearPlayerError();
    openMenu.value = null;
  }

  async function restartGame() {
    if (!snesCore || !activeGame.value || isRestarting.value) return;
    const core = snesCore;
    const gameId = activeGame.value.id;
    const requestGeneration = ++restartGeneration;
    isRestarting.value = true;
    isPlaying.value = false;
    clearPlayerError();
    stateSaveStatus.value = "Reiniciando jogo...";
    stopEmulationLoop();
    releaseAllButtons();
    stopAudioPlayback();
    try {
      if (checkpointPromise) {
        try { await checkpointPromise; } catch (error) { handleCheckpointError(error); }
      }
      if (requestGeneration !== restartGeneration || core !== snesCore || activeGame.value?.id !== gameId) return;
      await core.restart();
      if (requestGeneration !== restartGeneration || core !== snesCore || activeGame.value?.id !== gameId) return;
      const firstFrame = await core.runFrame();
      if (requestGeneration !== restartGeneration || core !== snesCore || activeGame.value?.id !== gameId) return;
      drawFrame(firstFrame.frame);
      try { queueAudioFrame(firstFrame); } catch (error) { reportAudioError(error); }
      resumedFromSave.value = false;
      recoveryPrompt.value = null;
      stateSaveStatus.value = "Jogo reiniciado.";
      isPlaying.value = true;
      lastFrameAt = performance.now();
      lastCheckpointAt = lastFrameAt;
      renderedFrameTime = 0;
      skippedFrameTime = 0;
      renderEveryFrames = 1;
      emulatedFrameNumber = 0;
      void saveCurrentProgress().catch(handleCheckpointError);
      scheduleEmulationFrame(emulationGeneration);
    } catch (error) {
      if (requestGeneration !== restartGeneration || core !== snesCore || activeGame.value?.id !== gameId) return;
      console.error("Could not restart the game:", error);
      stateSaveStatus.value = "";
      setPlayerError(`Não foi possível reiniciar o jogo: ${errorText(error)}`);
    } finally {
      if (requestGeneration === restartGeneration) isRestarting.value = false;
    }
  }

  function setButton(button, pressed, event) {
    event?.preventDefault();
    if (!snesCore) return;
    const core = snesCore;
    if (pressed) pressedButtons.add(button);
    else pressedButtons.delete(button);
    void core.setButton(button, pressed).catch((error) => {
      console.error("Could not update the game controller:", error);
      setPlayerError(`Não foi possível atualizar o controle: ${errorText(error)}`);
    });
  }

  function releaseAllButtons() {
    for (const button of pressedButtons) setButton(button, false);
  }

  function handlePlayerKeydown(event) {
    if (
      event.target instanceof HTMLElement &&
      event.target.closest("button, input, select, textarea, [contenteditable='true']")
    ) {
      return;
    }
    const button = CONTROL_ACTIONS.find(({ id }) => controlBindings?.value?.[id] === event.code)?.id;
    if (!button || !activeGame.value) return;
    event.preventDefault();
    if (!event.repeat) setButton(button, true);
  }

  function handlePlayerKeyup(event) {
    const button = CONTROL_ACTIONS.find(({ id }) => controlBindings?.value?.[id] === event.code)?.id;
    if (button) setButton(button, false);
  }

  async function confirmClearLibrary(games) {
    if (isClearingLibrary.value) return;
    isClearingLibrary.value = true;
    try {
      await clearLibraryGames();
      for (const game of games) {
        if (game.previewUrl) URL.revokeObjectURL(game.previewUrl);
      }
      return true;
    } catch (error) {
      console.error("Could not clear the game library:", error);
      setAppError(`Não foi possível limpar a biblioteca: ${errorText(error)}`);
      return false;
    } finally {
      isClearingLibrary.value = false;
    }
  }

  async function confirmDeleteGame(gameId, games) {
    const game = deletePrompt.value;
    if (!game || isDeletingGame.value) return false;
    isDeletingGame.value = true;
    try {
      await deleteLibraryGame(gameId);
      return true;
    } catch (error) {
      console.error("Could not delete the game from the library:", error);
      deletePrompt.value = null;
      setAppError(`Não foi possível excluir o jogo: ${errorText(error)}`);
      return false;
    } finally {
      isDeletingGame.value = false;
    }
  }

  function handleFullscreenChange() {
    isFullscreen.value = document.fullscreenElement === gameStageRefLocal;
  }

  async function toggleFullscreen() {
    const stage = gameStageRefLocal;
    if (!stage) return;
    try {
      if (document.fullscreenElement === stage) {
        await document.exitFullscreen();
        return;
      }
      if (!stage.requestFullscreen) {
        setPlayerError("Tela cheia não é suportada neste ambiente.");
        return;
      }
      await stage.requestFullscreen();
    } catch (error) {
      console.error("Could not toggle fullscreen:", error);
      setPlayerError(`Não foi possível alternar para tela cheia: ${errorText(error)}`);
    }
  }

  const controlBindings = { value: { ...DEFAULT_CONTROL_BINDINGS } };
  const controlDraft = { value: { ...DEFAULT_CONTROL_BINDINGS } };

  return {
    FRAME_WIDTH, SNES_FRAME_HEIGHT, NES_FRAME_HEIGHT, FRAME_INTERVAL,
    AUDIO_BATCH_SECONDS, MAX_SCHEDULED_AUDIO_SECONDS, CHECKPOINT_INTERVAL,
    CONTROL_ACTIONS, DEFAULT_CONTROL_BINDINGS, RESERVED_CONTROL_CODES,
    activeGame, selectedGameId, openMenu, showControls, showHelp,
    isPlaying, isSavingState, isRestarting, isFullscreen, showAudioControls,
    resumedFromSave, audioVolume, audioErrorMessage,
    errorToast, controlErrorMessage, controlSaveStatus, stateSaveStatus,
    controlBindings, controlDraft,
    recoveryPrompt, historyGame, deletePrompt, clearLibraryPrompt,
    isRestoringSave, isDeletingGame, isClearingLibrary,
    setRefs,
    initializeAudio, setAudioVolume, clearAudioError, setAudioError,
    restoreLibrary, restoreControls, validateControlBindings, formatControlKey,
    openGame, returnToLibrary, restartGame, saveGameState,
    setButton, releaseAllButtons, handlePlayerKeydown, handlePlayerKeyup,
    confirmClearLibrary, confirmDeleteGame,
    toggleFullscreen, handleFullscreenChange,
    formatSavedTime, formatSaveHistoryTime,
    errorText,
  };
}
