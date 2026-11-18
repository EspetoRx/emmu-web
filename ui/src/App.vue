<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
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

const FRAME_WIDTH = 256;
const SNES_FRAME_HEIGHT = 224;
const NES_FRAME_HEIGHT = 240;
const FRAME_INTERVAL = 1000 / 60;
const AUDIO_BATCH_SECONDS = 0.03;
const MAX_SCHEDULED_AUDIO_SECONDS = 0.1;
const CHECKPOINT_INTERVAL = 5000;
const ERROR_TOAST_DURATION_MS = 3000;
const CONTROL_ACTIONS = [
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
const DEFAULT_CONTROL_BINDINGS = {
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
const RESERVED_CONTROL_CODES = new Set([
  "Escape",
  "Tab",
  "MetaLeft",
  "MetaRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
]);
const romInput = ref(null);
const canvasRef = ref(null);
const gameStageRef = ref(null);
const libraryRef = ref(null);
const libraryScrollPosition = ref({ y: 0, container: 0 });
const awaitingRomRecovery = ref(null);
const games = ref([]);
const activeGame = ref(null);
const selectedGameId = ref(null);
const openMenu = ref(null);
const librarySearch = ref("");
const libraryFormat = ref("all");
const librarySort = ref("recent");
const libraryGroup = ref("none");

const LIBRARY_FILTERS_STORAGE_KEY = "emmu.library.filters";

function loadLibraryFilters() {
  try {
    const raw = window.localStorage.getItem(LIBRARY_FILTERS_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (typeof saved.search === "string") librarySearch.value = saved.search;
    if (["all", "nes", "snes"].includes(saved.format)) libraryFormat.value = saved.format;
    if (
      ["recent", "oldest", "name-asc", "name-desc", "size-asc", "size-desc", "format", "saved"].includes(
        saved.sort,
      )
    ) {
      librarySort.value = saved.sort;
    }
    if (["none", "similar-titles", "console", "format", "save"].includes(saved.group)) {
      libraryGroup.value = saved.group;
    }
  } catch (error) {
    console.error("Could not load saved library filters:", error);
  }
}

function saveLibraryFilters() {
  try {
    window.localStorage.setItem(
      LIBRARY_FILTERS_STORAGE_KEY,
      JSON.stringify({
        search: librarySearch.value,
        format: libraryFormat.value,
        sort: librarySort.value,
        group: libraryGroup.value,
      }),
    );
  } catch (error) {
    console.error("Could not save library filters:", error);
  }
}
const errorToast = ref(null);
const controlErrorMessage = ref("");
const controlSaveStatus = ref("");
const stateSaveStatus = ref("");
const controlBindings = ref({ ...DEFAULT_CONTROL_BINDINGS });
const controlDraft = ref({ ...DEFAULT_CONTROL_BINDINGS });
const waitingForControl = ref(null);
const isPlaying = ref(false);
const isSavingState = ref(false);
const isRestarting = ref(false);
const isFullscreen = ref(false);
const showControls = ref(false);
const showHelp = ref(false);
const recoveryPrompt = ref(null);
const historyGame = ref(null);
const deletePrompt = ref(null);
const clearLibraryPrompt = ref(false);
const isRestoringSave = ref(false);
const isDeletingGame = ref(false);
const isClearingLibrary = ref(false);
const audioVolume = ref(0.7);
const showAudioControls = ref(false);
const audioErrorMessage = ref("");
const isNativeApp = "__TAURI_INTERNALS__" in window;
const isMobileDevice =
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isNativeDesktop = isNativeApp && !isMobileDevice;
let nativeEventUnsubscribers = [];
let snesCore = null;
let errorToastTimeoutId = 0;
let errorToastExpiresAt = 0;
let errorToastSequence = 0;
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
const resumedFromSave = ref(false);

const pageTitle = computed(() =>
  activeGame.value ? activeGame.value.name : "Biblioteca",
);
const frameHeight = computed(() =>
  activeGame.value?.format === "NES" ? NES_FRAME_HEIGHT : SNES_FRAME_HEIGHT,
);
const filteredGames = computed(() => {
  const query = normalizeSearchText(librarySearch.value.trim());

  return games.value
    .filter((game) => {
      const matchesSearch =
        !query ||
        [game.name, game.fileName, game.format].some((value) =>
          normalizeSearchText(value ?? "").includes(query),
        );
      const matchesFormat =
        libraryFormat.value === "all" ||
        (libraryFormat.value === "nes"
          ? game.format === "NES"
          : ["SFC", "SMC", "SNES"].includes(game.format));
      return matchesSearch && matchesFormat;
    })
    .sort((first, second) => {
      const nameOrder = first.name.localeCompare(second.name, "pt-BR", {
        numeric: true,
        sensitivity: "base",
      });
      const addedAtOrder = (second.addedAt ?? 0) - (first.addedAt ?? 0);

      switch (librarySort.value) {
        case "name-asc":
          return nameOrder;
        case "name-desc":
          return -nameOrder;
        case "size-asc":
          return (first.size ?? 0) - (second.size ?? 0) || nameOrder;
        case "size-desc":
          return (second.size ?? 0) - (first.size ?? 0) || nameOrder;
        case "format":
          return first.format.localeCompare(second.format, "pt-BR") || nameOrder;
        case "oldest":
          return (first.addedAt ?? 0) - (second.addedAt ?? 0) || nameOrder;
        case "saved":
          return (
            Number(Boolean(second.state || second.saveHistory?.length)) -
              Number(Boolean(first.state || first.saveHistory?.length)) ||
            addedAtOrder
          );
        default:
          return addedAtOrder || nameOrder;
      }
    });
});
const groupedGames = computed(() => {
  if (libraryGroup.value === "none") {
    return [{ key: "all", label: "", games: filteredGames.value }];
  }

  const groups = new Map();
  for (const game of filteredGames.value) {
    let key;
    let label;
    switch (libraryGroup.value) {
      case "similar-titles": {
        const title = game.name.replace(/\([^)]*\)|\[[^\]]*\]/g, "").trim();
        const words = normalizeSearchText(title)
          .replace(/[.,:;!?'"`-]/g, "")
          .split(/\s+/)
          .filter(Boolean);
        if (words.length > 1 && /^\d+$/.test(words[words.length - 1])) {
          words.pop();
        }
        const titleKey =
          words.slice(0, 2).join(" ") ||
          normalizeSearchText(title) ||
          `untitled:${game.id}`;
        const labelWords = title.split(/\s+/).filter(Boolean).slice(0, 2);
        key = `title:${titleKey}`;
        label = `${labelWords.join(" ") || "Outros"}${words.length > 2 ? "…" : ""}`;
        break;
      }
      case "console":
        key = game.format === "NES" ? "NES" : "SNES";
        label = key;
        break;
      case "format":
        key = game.format || "other";
        label = game.format || "Outro formato";
        break;
      case "save": {
        const hasSave = Boolean(game.state || game.saveHistory?.length);
        key = hasSave ? "saved" : "no-save";
        label = hasSave ? "Com estado salvo" : "Sem estado salvo";
        break;
      }
    }

    if (!groups.has(key)) groups.set(key, { key, label, games: [] });
    groups.get(key).games.push(game);
  }
  return [...groups.values()];
});
const activeLibraryFilterCount = computed(
  () =>
    Number(Boolean(librarySearch.value.trim())) +
    Number(libraryFormat.value !== "all") +
    Number(librarySort.value !== "recent") +
    Number(libraryGroup.value !== "none"),
);

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

function normalizeSearchText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function clearLibraryFilters() {
  librarySearch.value = "";
  libraryFormat.value = "all";
  librarySort.value = "recent";
  libraryGroup.value = "none";
}

async function generateThumbnails() {
  if (games.length === 0) {
    setAppError("Nenhum jogo na biblioteca.");
    return;
  }

  const total = games.length;
  let completed = 0;

  for (const game of games.value) {
    try {
      // Abre o jogo
      await openGame(game);
      if (game.romUnavailable) {
        completed++;
        continue;
      }

      // Aguarda um pouco para a tela estabilizar
      await new Promise((resolve) => setTimeout(resolve, 1500));

      // Tenta capturar a preview da canvas
      if (canvasRef.value) {
        try {
          canvasRef.value.toBlob((blob) => {
            if (blob) {
              // Cria um object URL e atribui ao jogo
              const previewUrl = URL.createObjectURL(blob);
              // Atualiza o jogo na biblioteca
              saveLibraryGame({ ...game, preview, previewUrl });
            }
          }, "image/png");
        } catch (error) {
          console.error("Could not capture thumbnail for", game.name, error);
        }
      }
    } catch (error) {
      console.error("Error generating thumbnail for", game.name, error);
    } finally {
      // Volta à biblioteca
      returnToLibrary();
      completed++;
    }
  }

  setAppError(`Miniaturas geradas: ${completed} de ${total} jogos`);
}

function saveLibraryScrollPosition() {
  libraryScrollPosition.value = {
    y: window.scrollY,
    container: libraryRef.value ? libraryRef.value.scrollTop : 0,
  };
}

function restoreLibraryScrollPosition() {
  const { y, container } = libraryScrollPosition.value;
  if (libraryRef.value) {
    libraryRef.value.scrollTop = container;
  }
  window.scrollTo(0, y);
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

function setAppError(message) {
  showErrorToast(message, "app");
}

function clearAppError() {
  clearErrorToast("app");
}

function setPlayerError(message) {
  showErrorToast(message, "player");
}

function clearPlayerError() {
  clearErrorToast("player");
}

function clearAudioError() {
  audioErrorMessage.value = "";
  clearErrorToast("audio");
}

function setAudioError(message) {
  audioErrorMessage.value = message;
  showErrorToast(message, "audio");
}

async function restoreLibrary() {
  try {
    const records = await loadLibraryGames();
    games.value = records.map((game) => ({
      ...game,
      previewUrl: game.preview ? URL.createObjectURL(game.preview) : null,
    }));
  } catch (error) {
    console.error("Could not restore the game library:", error);
    setAppError(`Não foi possível carregar a biblioteca: ${errorText(error)}`);
  }
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

async function restoreControls() {
  try {
    const savedBindings = await loadControlBindings();
    if (savedBindings) {
      controlBindings.value = validateControlBindings(savedBindings);
      controlDraft.value = { ...controlBindings.value };
    }
  } catch (error) {
    console.error("Could not restore the controller bindings:", error);
    setAppError(`Não foi possível carregar os controles: ${errorText(error)}`);
  }
}

function openControls() {
  releaseAllButtons();
  controlDraft.value = { ...controlBindings.value };
  waitingForControl.value = null;
  controlErrorMessage.value = "";
  controlSaveStatus.value = "";
  openMenu.value = null;
  showControls.value = true;
}

function closeControls() {
  showControls.value = false;
  waitingForControl.value = null;
  controlErrorMessage.value = "";
}

function beginControlCapture(action) {
  waitingForControl.value = action;
  controlErrorMessage.value = "";
  controlSaveStatus.value = "";
}

function captureControlKey(event) {
  event.preventDefault();
  event.stopPropagation();
  if (event.code === "Escape") {
    waitingForControl.value = null;
    controlErrorMessage.value = "";
    return;
  }
  if (!event.code || RESERVED_CONTROL_CODES.has(event.code)) {
    controlErrorMessage.value = "Essa tecla é reservada pelo sistema. Escolha outra.";
    return;
  }

  const conflict = CONTROL_ACTIONS.find(
    ({ id }) => id !== waitingForControl.value && controlDraft.value[id] === event.code,
  );
  if (conflict) {
    controlErrorMessage.value = `${formatControlKey(event.code)} já está atribuída a ${conflict.label}.`;
    return;
  }

  controlDraft.value[waitingForControl.value] = event.code;
  waitingForControl.value = null;
  controlErrorMessage.value = "";
}

function formatControlKey(code) {
  const labels = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Enter: "Enter",
    ShiftLeft: "Shift esquerdo",
    ShiftRight: "Shift direito",
    Space: "Espaço",
    Backspace: "Backspace",
    Delete: "Delete",
  };
  if (labels[code]) return labels[code];
  if (code.startsWith("Key")) return code.slice(3);
  if (code.startsWith("Digit")) return code.slice(5);
  if (code.startsWith("Numpad")) return `Num ${code.slice(6)}`;
  return code;
}

function restoreDefaultControls() {
  controlDraft.value = { ...DEFAULT_CONTROL_BINDINGS };
  waitingForControl.value = null;
  controlErrorMessage.value = "";
  controlSaveStatus.value = "";
}

async function saveControls() {
  if (waitingForControl.value) {
    controlErrorMessage.value = "Finalize a captura da tecla antes de salvar.";
    return;
  }
  try {
    const bindings = validateControlBindings(controlDraft.value);
    await saveControlBindings(bindings);
    controlBindings.value = bindings;
    controlSaveStatus.value = "Controles salvos.";
    controlErrorMessage.value = "";
  } catch (error) {
    console.error("Could not save the controller bindings:", error);
    controlErrorMessage.value = `Não foi possível salvar os controles: ${errorText(error)}`;
  }
}

function openFilePicker() {
  openMenu.value = null;
  clearAppError();
  romInput.value?.click();
}

function coverHue(name) {
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.charCodeAt(0)) % 360;
  }
  return hash;
}

async function addRomFile(file) {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!["nes", "sfc", "smc", "fig"].includes(extension)) {
    throw new Error("Formato não suportado. Selecione arquivos .nes, .sfc, .smc ou .fig.");
  }

  const contents = await file.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", contents);
  const id = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
  const rom = new Blob([contents], { type: "application/octet-stream" });
  const existingGame = games.value.find((game) => game.id === id);
  if (existingGame) {
    const updatedGame = {
      ...existingGame,
      fileName: file.name,
      format: extension.toUpperCase(),
      size: file.size,
      rom,
      romUnavailable: false,
    };
    await saveLibraryGame(updatedGame);
    Object.assign(existingGame, updatedGame);
    selectedGameId.value = existingGame.id;

    if (awaitingRomRecovery.value?.id === existingGame.id) {
      awaitingRomRecovery.value = null;
      await openGame(existingGame);
    }
    return;
  }

  const name = file.name.replace(/\.[^.]+$/, "");
  const game = {
    id,
    name,
    fileName: file.name,
    size: file.size,
    format: extension.toUpperCase(),
    rom,
    preview: null,
    previewUrl: null,
    state: null,
    romUnavailable: false,
    hue: coverHue(name),
    addedAt: Date.now(),
  };
  await saveLibraryGame(game);
  games.value.unshift(game);
  selectedGameId.value = game.id;
}

async function addRom(event) {
  const files = Array.from(event.target.files ?? []);
  event.target.value = "";
  if (!files.length) return;

  const failures = [];
  for (const file of files) {
    try {
      await addRomFile(file);
    } catch (error) {
      console.error(`Could not add ROM "${file.name}" to the game library:`, error);
      failures.push(`${file.name}: ${errorText(error)}`);
    }
  }

  if (failures.length) {
    const message = failures.length === 1
      ? `Não foi possível importar: ${failures[0]}`
      : `Alguns arquivos não puderam ser importados: ${failures.join(" · ")}`;
    setAppError(message);
  } else {
    clearAppError();
  }
}

function stopEmulationLoop() {
  emulationGeneration += 1;
  if (emulationTimerId) {
    clearTimeout(emulationTimerId);
    emulationTimerId = 0;
  }
  nextEmulationFrameAt = 0;
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
  }
  return (async () => {
    if (audioContext.state !== "running" && audioContext.state !== "closed") {
      await audioContext.resume();
    }
    if (
      !audioWorkletNode &&
      !audioWorkletUnavailable &&
      audioContext.audioWorklet &&
      typeof AudioWorkletNode === "function"
    ) {
      try {
        audioWorkletReady ??= audioContext.audioWorklet.addModule(
          new URL("./audio-worklet.js", import.meta.url),
        );
        await audioWorkletReady;
        if (!audioWorkletNode) {
          audioWorkletNode = new AudioWorkletNode(audioContext, "emmu-audio", {
            numberOfInputs: 0,
            numberOfOutputs: 1,
            outputChannelCount: [2],
            channelCount: 2,
            channelCountMode: "explicit",
          });
          audioWorkletNode.connect(audioGainNode);
          audioWorkletNode.addEventListener("processorerror", () => {
            reportAudioError(new Error("O processador de áudio foi interrompido."));
          });
        }
      } catch (error) {
        audioWorkletUnavailable = true;
        audioWorkletReady = null;
        console.error("Could not initialize AudioWorklet; using Web Audio fallback:", error);
      }
    }
  })();
}

function reportAudioError(error) {
  console.error("Could not start game audio:", error);
  setAudioError(`Áudio indisponível: ${errorText(error)}`);
}

function updateAudioGain() {
  if (!audioGainNode || !audioContext) return;
  audioGainNode.gain.setTargetAtTime(
    audioVolume.value,
    audioContext.currentTime,
    0.015,
  );
}

function activateAudio() {
  clearAudioError();
  try {
    void initializeAudio().catch(reportAudioError);
  } catch (error) {
    reportAudioError(error);
  }
}

function setAudioVolume(volume) {
  audioVolume.value = Math.min(1, Math.max(0, volume));
  updateAudioGain();
  activateAudio();
}

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

function queueAudioFrame({
  audioSamples,
  audioSampleRate,
  audioChannels = 2,
}) {
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

function drawFrame(frame) {
  const canvas = canvasRef.value;
  const context = canvas?.getContext("2d", { alpha: false });
  if (!context) {
    throw new Error("Não foi possível preparar a tela do jogo.");
  }
  if (
    !frameImageData ||
    frameImageData.height !== frameHeight.value
  ) {
    frameImageData = new ImageData(FRAME_WIDTH, frameHeight.value);
  }
  frameImageData.data.set(frame);
  context.putImageData(frameImageData, 0, 0);
}

function capturePreview() {
  const canvas = canvasRef.value;
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
    if (canvasRef.value) {
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
    const savedGame = await saveGameProgress(
      gameId,
      progress,
      { recordHistory },
    );

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

function formatSavedTime(timestamp) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}

function formatSaveHistoryTime(timestamp) {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(timestamp));
}

function openSaveHistory(game) {
  historyGame.value = game;
}

async function restoreHistoricalSave(game, save) {
  if (isRestoringSave.value) return;
  isRestoringSave.value = true;
  try {
    const savedGame = await saveGameProgress(game.id, {
      state: save.state,
      stateSavedAt: save.savedAt,
    }, { recordHistory: true });
    game.state = savedGame.state;
    game.stateSavedAt = savedGame.stateSavedAt;
    game.saveHistory = savedGame.saveHistory;
    historyGame.value = null;
    await openGame(game);
  } catch (error) {
    console.error("Could not restore a saved game history entry:", error);
    setAppError(`Não foi possível restaurar esse save: ${errorText(error)}`);
    historyGame.value = null;
  } finally {
    isRestoringSave.value = false;
  }
}

function dismissRecoveryPrompt() {
  recoveryPrompt.value = null;
  gameLoadGeneration += 1;
  restartGeneration += 1;
  isRestarting.value = false;
  stopEmulationLoop();
  pressedButtons.clear();
  snesCore?.dispose();
  snesCore = null;
  stopAudioPlayback();
  isPlaying.value = false;
  activeGame.value = null;
  resumedFromSave.value = false;
  clearPlayerError();
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
      queueAudioFrame(firstFrame);
    } catch (error) {
      reportAudioError(error);
    }

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
    if (
      requestGeneration !== restartGeneration ||
      core !== snesCore ||
      activeGame.value?.id !== gameId
    ) {
      return;
    }
    console.error("Could not restart the game:", error);
    stateSaveStatus.value = "";
    setPlayerError(`Não foi possível reiniciar o jogo: ${errorText(error)}`);
  } finally {
    if (requestGeneration === restartGeneration) isRestarting.value = false;
  }
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
    Math.max(
      2,
      Math.ceil((renderedFrameTime - estimatedSkipTime) / (frameBudget - estimatedSkipTime)),
    ),
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
    try {
      queueAudioFrame(frame);
    } catch (error) {
      reportAudioError(error);
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

async function openGame(game) {
  if (game.romUnavailable) {
    awaitingRomRecovery.value = game;
    openFilePicker();
    return;
  }

  const loadGeneration = ++gameLoadGeneration;
  restartGeneration += 1;
  isRestarting.value = false;
  showAudioControls.value = false;
  clearAudioError();
  let audioReady = Promise.resolve();
  try {
    audioReady = initializeAudio().catch((error) => {
      reportAudioError(error);
    });
  } catch (error) {
    reportAudioError(error);
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

  let core = null;
  try {
    await nextTick();
    const romBytes = new Uint8Array(await game.rom.arrayBuffer());
    if (game.rom instanceof File) {
      const durableRom = new Blob([romBytes], { type: "application/octet-stream" });
      await saveLibraryGame({ ...game, rom: durableRom, romUnavailable: false });
      Object.assign(game, { rom: durableRom, romUnavailable: false });
    }
    core = await createEmulator(romBytes, game.format);
    await audioReady;
    if (loadGeneration !== gameLoadGeneration || activeGame.value?.id !== game.id) {
      core.dispose();
      return;
    }
    if (game.state) {
      try {
        await core.loadState(new Uint8Array(await game.state.arrayBuffer()));
      } catch (error) {
        if (loadGeneration !== gameLoadGeneration || activeGame.value?.id !== game.id) {
          core.dispose();
          return;
        }
        snesCore = core;
        setPlayerError("Não foi possível carregar o estado salvo.");
        recoveryPrompt.value = { gameId: game.id, reason: errorText(error) };
        return;
      }
    }
    if (loadGeneration !== gameLoadGeneration || activeGame.value?.id !== game.id) {
      core.dispose();
      return;
    }

    snesCore = core;
    resumedFromSave.value = Boolean(game.state);
    const firstFrame = await core.runFrame();
    if (loadGeneration !== gameLoadGeneration || snesCore !== core) {
      if (snesCore !== core) core.dispose();
      return;
    }
    drawFrame(firstFrame.frame);
    try {
      queueAudioFrame(firstFrame);
    } catch (error) {
      reportAudioError(error);
    }
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
    if (loadGeneration !== gameLoadGeneration) {
      if (core && snesCore !== core) core.dispose();
      return;
    }
    core?.dispose();
    if (snesCore === core) snesCore = null;
    isPlaying.value = false;
    console.error("Could not start the game:", error);
    activeGame.value = null;
    if (error?.name === "NotFoundError") {
      const unavailableGame = { ...game, rom: new Blob(), romUnavailable: true };
      Object.assign(game, unavailableGame);
      try {
        await saveLibraryGame(unavailableGame);
      } catch (persistError) {
        console.error("Could not mark the unavailable ROM in the library:", persistError);
      }
      setAppError(`A ROM "${game.fileName}" não está mais acessível. Reimporte o arquivo para continuar.`);
    } else {
      setAppError(`Não foi possível iniciar o jogo: ${errorText(error)}`);
    }
  }
}

function continueSavedGame(game) {
  return openGame(game);
}

function requestDeleteGame(game) {
  deletePrompt.value = game;
}

function requestClearLibrary() {
  clearLibraryPrompt.value = true;
}

async function confirmClearLibrary() {
  if (isClearingLibrary.value) return;

  isClearingLibrary.value = true;
  try {
    await clearLibraryGames();
    for (const game of games.value) {
      if (game.previewUrl) URL.revokeObjectURL(game.previewUrl);
    }
    games.value = [];
    selectedGameId.value = null;
    clearLibraryPrompt.value = false;
  } catch (error) {
    console.error("Could not clear the game library:", error);
    clearLibraryPrompt.value = false;
    setAppError(`Não foi possível limpar a biblioteca: ${errorText(error)}`);
  } finally {
    isClearingLibrary.value = false;
  }
}

async function confirmDeleteGame() {
  const game = deletePrompt.value;
  if (!game || isDeletingGame.value) return;

  isDeletingGame.value = true;
  try {
    await deleteLibraryGame(game.id);
    games.value = games.value.filter((candidate) => candidate.id !== game.id);
    if (game.previewUrl) URL.revokeObjectURL(game.previewUrl);
    if (selectedGameId.value === game.id) selectedGameId.value = null;
    deletePrompt.value = null;
  } catch (error) {
    console.error("Could not delete the game from the library:", error);
    deletePrompt.value = null;
    setAppError(`Não foi possível excluir o jogo: ${errorText(error)}`);
  } finally {
    isDeletingGame.value = false;
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
  for (const button of pressedButtons) {
    setButton(button, false);
  }
}

function handlePlayerKeydown(event) {
  if (
    event.target instanceof HTMLElement &&
    event.target.closest("button, input, select, textarea, [contenteditable='true']")
  ) {
    return;
  }
  const button = CONTROL_ACTIONS.find(
    ({ id }) => controlBindings.value[id] === event.code,
  )?.id;
  if (!button || !activeGame.value) return;
  event.preventDefault();
  if (!event.repeat) setButton(button, true);
}

function handlePlayerKeyup(event) {
  const button = CONTROL_ACTIONS.find(
    ({ id }) => controlBindings.value[id] === event.code,
  )?.id;
  if (button) setButton(button, false);
}

function handleGameCardClick(game) {
  if (isMobileDevice) {
    openGame(game);
  } else {
    selectedGameId.value = game.id;
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
    try {
      await saveCurrentProgress();
    } catch (error) {
      handleCheckpointError(error);
    }
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

function toggleMenu(menu) {
  openMenu.value = openMenu.value === menu ? null : menu;
}

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function handleGlobalKeydown(event) {
  if (showControls.value) {
    if (waitingForControl.value) {
      captureControlKey(event);
    } else if (event.code === "Escape") {
      event.preventDefault();
      closeControls();
    }
    return;
  }

  handlePlayerKeydown(event);
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "o") {
    event.preventDefault();
    openFilePicker();
  } else if ((event.metaKey || event.ctrlKey) && event.key === "1") {
    event.preventDefault();
    returnToLibrary();
  } else if (event.metaKey && (event.key === "T" || event.key === "t")) {
    event.preventDefault();
    generateThumbnails();
  } else if (event.key === "Escape") {
    openMenu.value = null;
    showHelp.value = false;
    showAudioControls.value = false;
  }
}

async function registerNativeMenuEvents() {
  if (!isNativeDesktop) return;

  try {
    const { listen } = await import("@tauri-apps/api/event");
    nativeEventUnsubscribers = await Promise.all([
      listen("open-rom-request", openFilePicker),
      listen("return-to-library", returnToLibrary),
      listen("configure-controls", openControls),
      listen("show-help", () => {
        openMenu.value = null;
        showHelp.value = true;
      }),
    ]);
  } catch (error) {
    console.error("Could not register native menu events:", error);
    setAppError("Não foi possível ativar os menus da janela.");
  }
}

function handleVisibilityChange() {
  if (document.visibilityState === "visible" && errorToast.value) {
    const remaining = errorToastExpiresAt - Date.now();
    if (remaining <= 0) clearErrorToast();
    else scheduleErrorToastExpiry(remaining);
  }

  if (document.visibilityState === "hidden" && snesCore) {
    releaseAllButtons();
    void saveCurrentProgress().catch(handleCheckpointError);
  }
}

function handlePageHide() {
  if (snesCore) {
    releaseAllButtons();
    void saveCurrentProgress().catch(handleCheckpointError);
  }
}

function handleWindowBlur() {
  releaseAllButtons();
}

function handleFullscreenChange() {
  isFullscreen.value = document.fullscreenElement === gameStageRef.value;
}

async function toggleFullscreen() {
  const stage = gameStageRef.value;
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

watch(activeGame, (newGame, oldGame) => {
  if (oldGame === null && newGame !== null) {
    // Saiu da biblioteca para abrir um jogo: lembra onde o usuário estava.
    saveLibraryScrollPosition();
  } else if (oldGame !== null && newGame === null) {
    // Voltou à biblioteca: restaura a posição depois de remontar a seção.
    nextTick(() => restoreLibraryScrollPosition());
  }
});

watch(
  [librarySearch, libraryFormat, librarySort, libraryGroup],
  () => {
    saveLibraryFilters();
  },
  { deep: false },
);

onMounted(() => {
  loadLibraryFilters();
  window.addEventListener("keydown", handleGlobalKeydown);
  window.addEventListener("keyup", handlePlayerKeyup);
  window.addEventListener("blur", handleWindowBlur);
  window.addEventListener("pagehide", handlePageHide);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  document.addEventListener("fullscreenchange", handleFullscreenChange);
  void restoreLibrary();
  void restoreControls();
  void registerNativeMenuEvents();
});
onBeforeUnmount(() => {
  clearErrorToast();
  window.removeEventListener("keydown", handleGlobalKeydown);
  window.removeEventListener("keyup", handlePlayerKeyup);
  window.removeEventListener("blur", handleWindowBlur);
  window.removeEventListener("pagehide", handlePageHide);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  releaseAllButtons();
  stopEmulationLoop();
  const core = snesCore;
  if (core) {
    void saveCurrentProgress()
      .catch(handleCheckpointError)
      .finally(() => core.dispose());
  }
  stopAudioPlayback();
  if (audioContext && audioContext.state !== "closed") {
    void audioContext.close();
  }
  nativeEventUnsubscribers.forEach((unsubscribe) => unsubscribe());
  games.value.forEach((game) => {
    if (game.previewUrl) URL.revokeObjectURL(game.previewUrl);
  });
});
</script>

<template>
  <main class="app-window" @keydown.esc="openMenu = null">
    <div
      v-if="errorToast"
      :key="errorToast.id"
      class="error-toast"
      role="alert"
      aria-live="assertive"
    >
      {{ errorToast.message }}
    </div>

    <header v-if="!isNativeDesktop" class="titlebar">
      <div v-if="!isMobileDevice" class="window-controls" aria-hidden="true">
        <span class="window-control close"></span>
        <span class="window-control minimize"></span>
        <span class="window-control maximize"></span>
      </div>
      <div class="brand">
        <span class="brand-mark">e</span>
        <span>emmu</span>
      </div>
      <span class="window-title">{{ pageTitle }}</span>
      <div class="titlebar-spacer"></div>
    </header>

    <nav v-if="!isNativeDesktop" class="menubar" aria-label="Menu principal">
      <div class="menu-group">
        <div class="menu-wrapper">
          <button
            class="menu-trigger"
            :aria-expanded="openMenu === 'arquivo'"
            @click="toggleMenu('arquivo')"
          >
            Arquivo
          </button>
          <div v-if="openMenu === 'arquivo'" class="menu-popover">
            <button class="menu-item" @click="openFilePicker">
              <span>Abrir arquivos…</span>
              <kbd>⌘ O</kbd>
            </button>
            <button
              class="menu-item"
              :disabled="!activeGame"
              @click="returnToLibrary"
            >
              <span>Voltar à biblioteca</span>
            </button>
          </div>
        </div>

        <div class="menu-wrapper">
          <button
            class="menu-trigger"
            :aria-expanded="openMenu === 'biblioteca'"
            @click="toggleMenu('biblioteca')"
          >
            Biblioteca
          </button>
          <div v-if="openMenu === 'biblioteca'" class="menu-popover">
            <button class="menu-item" @click="returnToLibrary">
              <span>Ver jogos</span>
              <kbd>⌘ 1</kbd>
            </button>
            <button class="menu-item" @click="openFilePicker">
              <span>Adicionar jogos…</span>
              <kbd>⌘ O</kbd>
            </button>
            <button
              v-if="games.length"
              class="menu-item"
              @click="openMenu = null; requestClearLibrary()"
            >
              <span>Limpar biblioteca…</span>
            </button>
          </div>
        </div>

        <button class="menu-trigger" @click="openControls">Controles</button>

        <div class="menu-wrapper">
          <button
            class="menu-trigger"
            :aria-expanded="openMenu === 'ajuda'"
            @click="toggleMenu('ajuda')"
          >
            Ajuda
          </button>
          <div v-if="openMenu === 'ajuda'" class="menu-popover help-popover">
            <p>Adicione uma ou mais ROMs e dê dois cliques no cartão para abrir o jogo.</p>
            <p>Formatos reconhecidos: NES, SNES, FIG.</p>
          </div>
        </div>
      </div>

      <div class="menubar-status">
        <span class="status-dot"></span>
        {{ games.length }} {{ games.length === 1 ? "jogo" : "jogos" }}
      </div>
    </nav>

    <input
      ref="romInput"
      class="visually-hidden"
      type="file"
      multiple
      accept=".nes,.sfc,.smc,.fig"
      aria-label="Abrir arquivos de jogos"
      tabindex="-1"
      @change="addRom"
    />

    <section
      ref="libraryRef"
      v-if="!activeGame"
      class="library-page"
    >
      <div class="library-heading">
        <div>
          <p class="eyebrow">SUA COLEÇÃO</p>
          <h1>Biblioteca de jogos</h1>
          <p class="subtitle">Seus clássicos, reunidos em um só lugar.</p>
        </div>
        <div class="library-heading-actions">
          <button
            v-if="games.length"
            class="secondary-button clear-library-button"
            @click="requestClearLibrary"
          >
            Limpar biblioteca
          </button>
          <button class="primary-button" @click="openFilePicker">
            <span class="plus-icon">＋</span>
            Abrir arquivos
          </button>
        </div>
      </div>

      <div v-if="games.length" class="library-toolbar">
        <div class="library-filter-wrapper">
          <button
            class="library-filter-toggle"
            :aria-expanded="openMenu === 'filters'"
            :aria-label="`Filtros da biblioteca (${activeLibraryFilterCount} ativos)`"
            @click="toggleMenu('filters')"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true">
              <path d="M4 7h6m4 0h6M4 17h2m4 0h10" />
              <path d="M10 4v6M6 14v6" />
            </svg>
            <span>Filtros</span>
            <span v-if="activeLibraryFilterCount" class="filter-count">
              {{ activeLibraryFilterCount }}
            </span>
          </button>
          <div v-if="openMenu === 'filters'" class="library-filter-panel">
            <label for="library-search">Buscar por texto</label>
            <input
              id="library-search"
              v-model="librarySearch"
              type="search"
              placeholder="Nome, arquivo ou formato"
              autocomplete="off"
            />
            <label for="library-format">Console</label>
            <select id="library-format" v-model="libraryFormat">
              <option value="all">Todos</option>
              <option value="nes">NES</option>
              <option value="snes">SNES (SFC/SMC)</option>
            </select>
            <label for="library-sort">Organizar por</label>
            <select id="library-sort" v-model="librarySort">
              <option value="recent">Adicionados recentemente</option>
              <option value="oldest">Adicionados há mais tempo</option>
              <option value="name-asc">Nome: A a Z</option>
              <option value="name-desc">Nome: Z a A</option>
              <option value="size-asc">Tamanho: menor primeiro</option>
              <option value="size-desc">Tamanho: maior primeiro</option>
              <option value="format">Formato</option>
              <option value="saved">Com save primeiro</option>
            </select>
            <label for="library-group">Agrupar por</label>
            <select id="library-group" v-model="libraryGroup">
              <option value="none">Sem agrupamento</option>
              <option value="similar-titles">Títulos parecidos</option>
              <option value="console">Console</option>
              <option value="format">Formato do arquivo</option>
              <option value="save">Estado do save</option>
            </select>
            <button
              v-if="activeLibraryFilterCount"
              class="clear-library-filters"
              @click="clearLibraryFilters"
            >
              Limpar filtros
            </button>
          </div>
        </div>
        <span class="library-result-count" role="status">
          {{ filteredGames.length }} de {{ games.length }} jogos
        </span>
      </div>

      <div v-if="filteredGames.length" class="library-game-groups">
        <section
          v-for="group in groupedGames"
          :key="group.key"
          class="library-game-group"
        >
          <h2 v-if="libraryGroup !== 'none'" class="library-group-heading">
            {{ group.label }}
            <span>{{ group.games.length }}</span>
          </h2>
          <div class="game-grid">
            <article
              v-for="game in group.games"
              :key="game.id"
              class="game-card"
              :class="{ selected: selectedGameId === game.id }"
            >
              <button
                class="game-card-open"
                :aria-label="`${game.name}, ${game.format}. ${game.romUnavailable ? 'ROM indisponível. Reimporte o arquivo.' : game.state ? 'Continuar estado salvo.' : isMobileDevice ? 'Toque para abrir.' : 'Dê dois cliques para abrir.'}`"
                @click="handleGameCardClick(game)"
                @dblclick="openGame(game)"
                @keydown.enter.prevent="openGame(game)"
              >
                <div
                  class="cover-art"
                  :class="{ 'has-preview': Boolean(game.previewUrl) }"
                  :style="{ '--cover-hue': game.hue }"
                  aria-hidden="true"
                >
                  <img v-if="game.previewUrl" class="cover-preview" :src="game.previewUrl" alt="" />
                  <template v-else>
                    <div class="cover-sun"></div>
                    <div class="cover-mountain mountain-back"></div>
                    <div class="cover-mountain mountain-front"></div>
                    <span class="cover-format">{{ game.format }}</span>
                    <span class="cover-title">{{ game.name }}</span>
                    <span class="cover-brand">EMMU COLLECTION</span>
                  </template>
                </div>
                <span class="game-name">{{ game.name }}</span>
                <span class="game-meta">{{ game.format }} <span>·</span> {{ formatSize(game.size) }}</span>
                <span class="card-hint">{{ game.romUnavailable ? "ROM indisponível · reimporte o arquivo" : game.state ? "Continuar estado salvo" : isMobileDevice ? "Toque para abrir" : "Dois cliques para abrir" }}</span>
              </button>
              <div class="game-card-actions">
                <span class="game-card-status" :class="{ unavailable: game.romUnavailable }">
                  {{ game.romUnavailable
                    ? "ROM indisponível"
                    : game.state
                      ? `Estado salvo${game.stateSavedAt ? ` às ${formatSavedTime(game.stateSavedAt)}` : ""}`
                      : "Sem estado salvo" }}
                </span>
                <div class="game-card-action-buttons">
                  <button
                    class="game-card-action-button"
                    :aria-label="`Histórico de saves de ${game.name} (${game.saveHistory?.length ?? 0})`"
                    :title="`Histórico de saves (${game.saveHistory?.length ?? 0})`"
                    @click.stop="openSaveHistory(game)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" />
                      <path d="M3 3v5h5m4-1v5l3 2" />
                    </svg>
                  </button>
                  <button
                    v-if="game.state"
                    class="game-card-action-button continue"
                    :aria-label="`Continuar ${game.name}`"
                    title="Continuar"
                    @click.stop="continueSavedGame(game)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="m8 5 12 7-12 7z" />
                    </svg>
                  </button>
                  <button
                    class="game-card-action-button delete"
                    :aria-label="`Excluir ${game.name}`"
                    title="Excluir"
                    @click.stop="requestDeleteGame(game)"
                  >
                    <svg viewBox="0 0 24 24" aria-hidden="true">
                      <path d="M4 7h16m-10 4v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" />
                    </svg>
                  </button>
                </div>
              </div>
            </article>
          </div>
        </section>
      </div>

      <div v-else-if="games.length" class="empty-state filtered-empty-state">
        <h2>Nenhum jogo encontrado</h2>
        <p>Experimente outro texto ou ajuste os filtros.</p>
        <button class="secondary-button" @click="clearLibraryFilters">
          Limpar filtros
        </button>
      </div>

      <div v-else class="empty-state">
        <div class="empty-illustration" aria-hidden="true">
          <div class="empty-card card-back"></div>
          <div class="empty-card card-front">
            <span class="empty-plus">＋</span>
          </div>
        </div>
        <h2>Sua próxima aventura começa aqui</h2>
        <p>Abra arquivos de jogos para criar suas capas na biblioteca.</p>
        <button class="secondary-button" @click="openFilePicker">
          Escolher arquivos
        </button>
        <span class="supported-formats">Compatível com .nes, .sfc, .smc e .fig</span>
      </div>
    </section>

    <section v-else class="player-page">
      <div class="player-toolbar">
        <button class="back-button" @click="returnToLibrary">
          <span aria-hidden="true">←</span>
          Biblioteca
        </button>
        <div class="player-game-title">
          <span class="playing-indicator"></span>
          <strong>{{ activeGame.name }}</strong>
          <span class="game-meta">{{ activeGame.format }}</span>
        </div>
        <div class="player-toolbar-actions">
          <button
            class="secondary-button"
            :disabled="!snesCore || !isPlaying || isRestarting"
            @click="restartGame"
          >
            {{ isRestarting ? "Reiniciando..." : "Reiniciar" }}
          </button>
          <button class="secondary-button" @click="openControls">Controles</button>
          <div class="player-audio-controls">
            <button
              class="audio-toggle-button"
              type="button"
              :aria-label="showAudioControls ? 'Fechar controles de áudio' : 'Abrir controles de áudio'"
              :aria-expanded="showAudioControls"
              aria-controls="audio-volume-controls"
              @click="showAudioControls = !showAudioControls"
            >
              <svg
                viewBox="0 0 24 24"
                width="18"
                height="18"
                fill="none"
                stroke="currentColor"
                stroke-width="1.8"
                stroke-linecap="round"
                stroke-linejoin="round"
                aria-hidden="true"
              >
                <path d="M11 5 6 9H3v6h3l5 4V5Z" />
                <path v-if="audioVolume > 0" d="M15.5 8.5a5 5 0 0 1 0 7" />
                <path v-if="audioVolume > 0" d="M18.5 5.5a9 9 0 0 1 0 13" />
                <path v-else d="m16 9 5 6m0-6-5 6" />
              </svg>
            </button>
            <div
              v-if="showAudioControls"
              id="audio-volume-controls"
              class="audio-volume-popover"
              role="group"
              aria-label="Volume do jogo"
            >
              <input
                class="stage-volume"
                type="range"
                min="0"
                max="100"
                :value="Math.round(audioVolume * 100)"
                aria-label="Volume do jogo"
                @input="setAudioVolume(Number($event.target.value) / 100)"
              />
              <output class="stage-volume-value">{{ Math.round(audioVolume * 100) }}%</output>
            </div>
          </div>
          <button
            class="secondary-button fullscreen-button"
            :aria-label="isFullscreen ? 'Sair da tela cheia' : 'Colocar jogo em tela cheia'"
            :aria-pressed="isFullscreen"
            @click="toggleFullscreen"
          >
            {{ isFullscreen ? "Sair da tela cheia" : "Tela cheia" }}
          </button>
          <button
            class="primary-button save-state-button"
            :disabled="!isPlaying || isSavingState"
            @click="saveGameState"
          >
            {{ isSavingState ? "Salvando..." : "Salvar estado" }}
          </button>
        </div>
        <button class="icon-button" aria-label="Voltar à biblioteca" @click="returnToLibrary">
          ✕
        </button>
      </div>
      <p v-if="resumedFromSave || stateSaveStatus" class="player-state-status" role="status">
        {{ stateSaveStatus || `Continuando estado salvo${activeGame.stateSavedAt ? ` de ${formatSavedTime(activeGame.stateSavedAt)}` : ""}.` }}
      </p>

      <div ref="gameStageRef" class="game-stage">
        <canvas
          ref="canvasRef"
          class="game-canvas"
          :class="{ 'nes-canvas': activeGame.format === 'NES' }"
          width="256"
          :height="frameHeight"
          aria-label="Tela do jogo"
          tabindex="0"
          @contextmenu.prevent
        ></canvas>
        <button
          v-if="isFullscreen"
          class="fullscreen-exit-button"
          aria-label="Sair da tela cheia"
          @click="toggleFullscreen"
        >
          Sair da tela cheia
        </button>
        <div
          v-if="isMobileDevice"
          class="touch-controls"
          :aria-label="`Controles ${activeGame.format === 'NES' ? 'NES' : 'SNES'}`"
        >
          <div class="touch-dpad">
            <button
              class="touch-button dpad-up"
              aria-label="Cima"
              @pointerdown="setButton('Up', true, $event)"
              @pointerup="setButton('Up', false, $event)"
              @pointercancel="setButton('Up', false, $event)"
              @pointerleave="setButton('Up', false, $event)"
            >↑</button>
            <button
              class="touch-button dpad-left"
              aria-label="Esquerda"
              @pointerdown="setButton('Left', true, $event)"
              @pointerup="setButton('Left', false, $event)"
              @pointercancel="setButton('Left', false, $event)"
              @pointerleave="setButton('Left', false, $event)"
            >←</button>
            <button
              class="touch-button dpad-down"
              aria-label="Baixo"
              @pointerdown="setButton('Down', true, $event)"
              @pointerup="setButton('Down', false, $event)"
              @pointercancel="setButton('Down', false, $event)"
              @pointerleave="setButton('Down', false, $event)"
            >↓</button>
            <button
              class="touch-button dpad-right"
              aria-label="Direita"
              @pointerdown="setButton('Right', true, $event)"
              @pointerup="setButton('Right', false, $event)"
              @pointercancel="setButton('Right', false, $event)"
              @pointerleave="setButton('Right', false, $event)"
            >→</button>
          </div>
          <div class="touch-action-pad">
            <button
              class="touch-button"
              aria-label="Y"
              @pointerdown="setButton('Y', true, $event)"
              @pointerup="setButton('Y', false, $event)"
              @pointercancel="setButton('Y', false, $event)"
              @pointerleave="setButton('Y', false, $event)"
            >Y</button>
            <button
              class="touch-button"
              aria-label="X"
              @pointerdown="setButton('X', true, $event)"
              @pointerup="setButton('X', false, $event)"
              @pointercancel="setButton('X', false, $event)"
              @pointerleave="setButton('X', false, $event)"
            >X</button>
            <button
              class="touch-button"
              aria-label="B"
              @pointerdown="setButton('B', true, $event)"
              @pointerup="setButton('B', false, $event)"
              @pointercancel="setButton('B', false, $event)"
              @pointerleave="setButton('B', false, $event)"
            >B</button>
            <button
              class="touch-button"
              aria-label="A"
              @pointerdown="setButton('A', true, $event)"
              @pointerup="setButton('A', false, $event)"
              @pointercancel="setButton('A', false, $event)"
              @pointerleave="setButton('A', false, $event)"
            >A</button>
          </div>
          <div class="touch-system-pad">
            <button
              class="touch-button"
              aria-label="Select"
              @pointerdown="setButton('Select', true, $event)"
              @pointerup="setButton('Select', false, $event)"
              @pointercancel="setButton('Select', false, $event)"
              @pointerleave="setButton('Select', false, $event)"
            >Select</button>
            <button
              class="touch-button"
              aria-label="Start"
              @pointerdown="setButton('Start', true, $event)"
              @pointerup="setButton('Start', false, $event)"
              @pointercancel="setButton('Start', false, $event)"
              @pointerleave="setButton('Start', false, $event)"
            >Start</button>
          </div>
        </div>
        <div class="stage-footer">
          <span>EMMU · MULTI-EMULADOR</span>
          <span>{{ isPlaying ? "EMULAÇÃO ATIVA" : activeGame.format }}</span>
        </div>
      </div>
    </section>

    <div
      v-if="showHelp"
      class="modal-backdrop"
      @click.self="showHelp = false"
    >
      <section
        class="help-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="help-title"
      >
        <p class="eyebrow">EMMU</p>
        <h2 id="help-title">Como usar</h2>
        <p>Use Arquivo → Abrir arquivos para adicionar ROMs à biblioteca.</p>
        <p>{{ isMobileDevice ? "Toque em um cartão para abrir o jogo." : "Dê dois cliques em um cartão para abrir o jogo." }}</p>
        <p>Controles: setas, Z/X/A/S, Q/W, Enter e Shift. No celular, use os botões na tela.</p>
        <p class="supported-formats">Formatos aceitos pela interface: .nes, .sfc, .smc e .fig.</p>
        <button class="secondary-button" @click="showHelp = false">Fechar</button>
      </section>
    </div>

    <div
      v-if="showControls"
      class="modal-backdrop"
      @click.self="closeControls"
    >
      <section
        class="controls-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="controls-title"
      >
        <div class="controls-dialog-heading">
          <div>
            <p class="eyebrow">SNES</p>
            <h2 id="controls-title">Configurar controles</h2>
          </div>
          <button class="icon-button" aria-label="Fechar controles" @click="closeControls">
            ✕
          </button>
        </div>
        <p class="controls-instructions">
          Selecione um botão e pressione a tecla desejada. Escape cancela a captura.
        </p>
        <div class="control-bindings">
          <div v-for="action in CONTROL_ACTIONS" :key="action.id" class="control-binding">
            <span>{{ action.label }}</span>
            <button
              class="control-key-button"
              :class="{ listening: waitingForControl === action.id }"
              :aria-pressed="waitingForControl === action.id"
              @click="beginControlCapture(action.id)"
            >
              {{ waitingForControl === action.id ? "Pressione uma tecla…" : formatControlKey(controlDraft[action.id]) }}
            </button>
          </div>
        </div>
        <p v-if="controlErrorMessage" class="error-message control-message" role="alert">
          {{ controlErrorMessage }}
        </p>
        <p v-if="controlSaveStatus" class="control-save-status" role="status">
          {{ controlSaveStatus }}
        </p>
        <div class="controls-dialog-actions">
          <button class="secondary-button" @click="restoreDefaultControls">
            Padrões
          </button>
          <span class="dialog-action-spacer"></span>
          <button class="secondary-button" @click="closeControls">Cancelar</button>
          <button
            class="primary-button"
            :disabled="Boolean(waitingForControl)"
            @click="saveControls"
          >
            Salvar
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="historyGame"
      class="modal-backdrop"
      @click.self="historyGame = null"
    >
      <section
        class="save-history-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby="save-history-title"
      >
        <div class="controls-dialog-heading">
          <div>
            <p class="eyebrow">{{ historyGame.format }} · {{ historyGame.name }}</p>
            <h2 id="save-history-title">Histórico de saves</h2>
          </div>
          <button class="icon-button" aria-label="Fechar histórico" @click="historyGame = null">
            ✕
          </button>
        </div>
        <p class="controls-instructions">
          Escolha uma versão anterior para continuar o jogo a partir dela.
        </p>
        <div v-if="historyGame.saveHistory?.length" class="save-history-list">
          <div
            v-for="(save, index) in historyGame.saveHistory"
            :key="`${save.savedAt}-${index}`"
            class="save-history-entry"
          >
            <span>{{ formatSaveHistoryTime(save.savedAt) }}</span>
            <button
              class="continue-game-button"
              :disabled="isRestoringSave"
              @click="restoreHistoricalSave(historyGame, save)"
            >
              {{ isRestoringSave ? "Carregando..." : "Carregar" }}
            </button>
          </div>
        </div>
        <p v-else class="save-history-empty">
          Ainda não há saves anteriores. Novos checkpoints serão guardados aqui.
        </p>
      </section>
    </div>

    <div
      v-if="clearLibraryPrompt"
      class="modal-backdrop"
      @click.self="clearLibraryPrompt = false"
    >
      <section
        class="recovery-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="clear-library-title"
        aria-describedby="clear-library-description"
      >
        <p class="eyebrow">LIMPAR BIBLIOTECA</p>
        <h2 id="clear-library-title">Limpar toda a biblioteca?</h2>
        <p id="clear-library-description">
          Todos os {{ games.length }} {{ games.length === 1 ? 'jogo' : 'jogos' }} e seus estados salvos serão removidos permanentemente. Esta ação não pode ser desfeita.
        </p>
        <div class="controls-dialog-actions">
          <button
            class="secondary-button"
            :disabled="isClearingLibrary"
            @click="clearLibraryPrompt = false"
          >
            Cancelar
          </button>
          <span class="dialog-action-spacer"></span>
          <button
            class="primary-button delete-confirm-button"
            :disabled="isClearingLibrary"
            @click="confirmClearLibrary"
          >
            {{ isClearingLibrary ? "Limpando..." : "Limpar biblioteca" }}
          </button>
        </div>
      </section>
    </div>

    <div
      v-if="deletePrompt"
      class="modal-backdrop"
      @click.self="deletePrompt = null"
    >
      <section
        class="recovery-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="delete-game-title"
        aria-describedby="delete-game-description"
      >
        <p class="eyebrow">EXCLUIR JOGO</p>
        <h2 id="delete-game-title">Remover da biblioteca?</h2>
        <p id="delete-game-description">
          O jogo “{{ deletePrompt.name }}” e todos os seus saves serão excluídos. Esta ação não pode ser desfeita.
        </p>
        <div class="controls-dialog-actions">
          <button
            class="secondary-button"
            :disabled="isDeletingGame"
            @click="deletePrompt = null"
          >
            Cancelar
          </button>
          <span class="dialog-action-spacer"></span>
          <button
            class="primary-button delete-confirm-button"
            :disabled="isDeletingGame"
            @click="confirmDeleteGame"
          >
            {{ isDeletingGame ? "Excluindo..." : "Excluir jogo" }}
          </button>
        </div>
      </section>
    </div>

    <div v-if="recoveryPrompt" class="modal-backdrop">
      <section
        class="recovery-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="recovery-title"
        aria-describedby="recovery-description"
      >
        <p class="eyebrow">RECUPERAÇÃO</p>
        <h2 id="recovery-title">Não foi possível carregar a aplicação</h2>
        <p id="recovery-description">
          O estado salvo deste arquivo não pode ser carregado. Deseja reiniciar o jogo sem esse estado?
        </p>
        <p v-if="recoveryPrompt.reason" class="recovery-detail">
          {{ recoveryPrompt.reason }}
        </p>
        <div class="controls-dialog-actions">
          <button
            class="secondary-button"
            :disabled="isRestarting"
            @click="dismissRecoveryPrompt"
          >
            Voltar à biblioteca
          </button>
          <span class="dialog-action-spacer"></span>
          <button
            class="primary-button"
            :disabled="isRestarting"
            @click="restartGame"
          >
            {{ isRestarting ? "Reiniciando..." : "Reiniciar jogo" }}
          </button>
        </div>
      </section>
    </div>

    <footer class="statusbar">
      <span><span class="status-dot"></span> Emmu</span>
      <span>{{ activeGame ? activeGame.fileName : "Biblioteca local" }}</span>
    </footer>
  </main>
</template>
