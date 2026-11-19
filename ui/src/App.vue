<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { saveLibraryGame } from "./stores/libraryStore.js";
import { useToast } from "./composables/useToast.js";
import { useControls } from "./composables/useControls.js";
import { useAudio } from "./composables/useAudio.js";
import { useLibrary } from "./composables/useLibrary.js";
import { useEmulator } from "./composables/useEmulator.js";
import { useShortcuts } from "./composables/useShortcuts.js";
import ErrorToast from "./components/ErrorToast.vue";
import AppHeader from "./components/AppHeader.vue";
import Library from "./components/Library.vue";
import Player from "./components/Player.vue";
import HelpDialog from "./components/HelpDialog.vue";
import ControlsDialog from "./components/ControlsDialog.vue";
import SaveHistoryDialog from "./components/SaveHistoryDialog.vue";
import ClearLibraryDialog from "./components/ClearLibraryDialog.vue";
import DeleteDialog from "./components/DeleteDialog.vue";
import RecoveryDialog from "./components/RecoveryDialog.vue";
import StatusBar from "./components/StatusBar.vue";

const romInput = ref(null);
const gameStageRef = ref(null);
const activeGame = ref(null);
const openMenu = ref(null);
const showHelp = ref(false);

const isNativeApp = "__TAURI_INTERNALS__" in window;
const isMobileDevice =
  /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
  (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
const isNativeDesktop = isNativeApp && !isMobileDevice;

const {
  errorToast,
  showErrorToast,
  clearErrorToast,
  handleToastVisibilityChange,
} = useToast();

const setAppError = (message) => showErrorToast(message, "app");
const clearAppError = () => clearErrorToast("app");
const setPlayerError = (message) => showErrorToast(message, "player");
const clearPlayerError = () => clearErrorToast("player");
const setAudioErrorToast = (message) => showErrorToast(message, "audio");
const clearAudioErrorToast = () => clearErrorToast("audio");

function openFilePicker() {
  openMenu.value = null;
  clearAppError();
  romInput.value?.click();
}

const {
  controlDraft,
  waitingForControl,
  controlErrorMessage,
  controlSaveStatus,
  showControls,
  restoreControls,
  openControls,
  closeControls,
  beginControlCapture,
  captureControlKey,
  restoreDefaultControls,
  saveControls,
  findActionByCode,
} = useControls({
  onError: setAppError,
  onBeforeOpen: () => {
    releaseAllButtons();
    openMenu.value = null;
  },
});

const {
  audioVolume,
  showAudioControls,
  initializeAudio,
  reportAudioError,
  clearAudioError,
  setAudioVolume,
  queueAudioFrame,
  stopAudioPlayback,
  closeAudioContext,
} = useAudio({
  onAudioError: setAudioErrorToast,
  onClearAudioError: clearAudioErrorToast,
});

const {
  games,
  selectedGameId,
  librarySearch,
  libraryFormat,
  librarySort,
  libraryGroup,
  filteredGames,
  groupedGames,
  activeLibraryFilterCount,
  awaitingRomRecovery,
  deletePrompt,
  clearLibraryPrompt,
  isDeletingGame,
  isClearingLibrary,
  loadLibraryFilters,
  clearLibraryFilters,
  restoreLibrary,
  importRomFiles,
  requestDeleteGame,
  requestClearLibrary,
  confirmClearLibrary,
  confirmDeleteGame,
  revokeAllPreviews,
} = useLibrary({
  onError: setAppError,
  onClearError: clearAppError,
  onRomRecovered: (game) => openGame(game),
});

const {
  canvasRef,
  hasCore,
  frameHeight,
  isPlaying,
  isSavingState,
  isRestarting,
  recoveryPrompt,
  historyGame,
  isRestoringSave,
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
} = useEmulator({
  activeGame,
  selectedGameId,
  awaitingRomRecovery,
  openMenu,
  openFilePicker,
  onReturnToLibraryCleanup: () => {
    showHelp.value = false;
  },
  onSetAppError: setAppError,
  onClearAppError: clearAppError,
  onSetPlayerError: setPlayerError,
  onClearPlayerError: clearPlayerError,
  onAudioInitialize: initializeAudio,
  onAudioReportError: reportAudioError,
  onAudioClearError: clearAudioError,
  onAudioQueueFrame: queueAudioFrame,
  onAudioStopPlayback: stopAudioPlayback,
  onAudioHideControls: () => {
    showAudioControls.value = false;
  },
});

const pageTitle = computed(() => (activeGame.value ? activeGame.value.name : "Biblioteca"));

async function addRom(event) {
  const files = Array.from(event.target.files ?? []);
  event.target.value = "";
  await importRomFiles(files);
}

function handleGameCardClick(game) {
  if (isMobileDevice) {
    openGame(game);
  } else {
    selectedGameId.value = game.id;
  }
}

function toggleMenu(menu) {
  openMenu.value = openMenu.value === menu ? null : menu;
}

async function generateThumbnails() {
  if (games.value.length === 0) {
    setAppError("Nenhum jogo na biblioteca.");
    return;
  }

  const total = games.value.length;
  let completed = 0;

  for (const game of [...games.value]) {
    try {
      await openGame(game);
      if (game.romUnavailable) {
        completed++;
        continue;
      }

      await new Promise((resolve) => setTimeout(resolve, 1500));

      if (canvasRef.value) {
        try {
          const preview = await capturePreview();
          const previewUrl = URL.createObjectURL(preview);
          await saveLibraryGame({ ...game, preview, previewUrl });
          if (game.previewUrl) URL.revokeObjectURL(game.previewUrl);
          game.preview = preview;
          game.previewUrl = previewUrl;
        } catch (error) {
          console.error("Could not capture thumbnail for", game.name, error);
        }
      }
    } catch (error) {
      console.error("Error generating thumbnail for", game.name, error);
    } finally {
      await returnToLibrary();
      completed++;
    }
  }

  setAppError(`Miniaturas geradas: ${completed} de ${total} jogos`);
}

const {
  registerNativeMenuEvents,
  bindShortcutListeners,
  unbindShortcutListeners,
} = useShortcuts({
  isNativeDesktop,
  showControls,
  waitingForControl,
  captureControlKey,
  closeControls,
  findActionByCode,
  activeGame,
  setButton,
  openFilePicker,
  returnToLibrary,
  generateThumbnails,
  openControls,
  onClosePopovers: () => {
    openMenu.value = null;
    showHelp.value = false;
    showAudioControls.value = false;
  },
  onShowHelp: () => {
    openMenu.value = null;
    showHelp.value = true;
  },
  onRegisterError: setAppError,
});

function handleVisibilityChange() {
  handleToastVisibilityChange();
  if (document.visibilityState === "hidden") {
    handleBackgroundSave();
  }
}

function handleWindowBlur() {
  releaseAllButtons();
}

onMounted(() => {
  loadLibraryFilters();
  bindShortcutListeners();
  window.addEventListener("blur", handleWindowBlur);
  window.addEventListener("pagehide", handleBackgroundSave);
  document.addEventListener("visibilitychange", handleVisibilityChange);
  void restoreLibrary();
  void restoreControls();
  void registerNativeMenuEvents();
});

onBeforeUnmount(() => {
  clearErrorToast();
  unbindShortcutListeners();
  window.removeEventListener("blur", handleWindowBlur);
  window.removeEventListener("pagehide", handleBackgroundSave);
  document.removeEventListener("visibilitychange", handleVisibilityChange);
  disposeEmulator();
  closeAudioContext();
  revokeAllPreviews();
});
</script>

<template>
  <main class="app-window" @keydown.esc="openMenu = null">
    <ErrorToast :toast="errorToast" />

    <AppHeader :is-native-desktop="isNativeDesktop" :is-mobile-device="isMobileDevice" :page-title="pageTitle"
      :open-menu="openMenu" :has-active-game="Boolean(activeGame)" :games-count="games.length" @toggle-menu="toggleMenu"
      @close-menu="openMenu = null" @open-file-picker="openFilePicker" @return-to-library="returnToLibrary"
      @request-clear-library="requestClearLibrary" @open-controls="openControls" />

    <input ref="romInput" class="visually-hidden" type="file" multiple accept=".nes,.sfc,.smc,.fig"
      aria-label="Abrir arquivos de jogos" tabindex="-1" @change="addRom" />

    <Library v-if="!activeGame" v-model:search="librarySearch" v-model:format="libraryFormat" v-model:sort="librarySort"
      v-model:group="libraryGroup" :games="games" :filtered-games="filteredGames" :grouped-games="groupedGames"
      :library-group="libraryGroup" :active-library-filter-count="activeLibraryFilterCount"
      :selected-game-id="selectedGameId" :is-mobile-device="isMobileDevice" :open-menu="openMenu"
      :is-active="!activeGame" @open-file-picker="openFilePicker" @request-clear-library="requestClearLibrary"
      @toggle-menu="toggleMenu" @clear-filters="clearLibraryFilters" @select-game="handleGameCardClick"
      @open-game="openGame" @continue-game="openGame" @open-history="openSaveHistory"
      @delete-game="requestDeleteGame" />

    <Player v-else :active-game="activeGame" :frame-height="frameHeight" :has-core="hasCore" :is-playing="isPlaying"
      :is-saving-state="isSavingState" :is-restarting="isRestarting" :is-mobile-device="isMobileDevice"
      :audio-volume="audioVolume" :show-audio-controls="showAudioControls" @return-to-library="returnToLibrary"
      @restart="restartGame" @open-controls="openControls"
      @toggle-audio-controls="showAudioControls = !showAudioControls" @set-audio-volume="setAudioVolume"
      @save-state="saveGameState" @set-button="setButton" @register-stage="gameStageRef = $event"
      @register-canvas="setCanvasElement" />

    <HelpDialog :open="showHelp" :is-mobile-device="isMobileDevice" @close="showHelp = false" />

    <ControlsDialog :open="showControls" :draft="controlDraft" :waiting-for-control="waitingForControl"
      :error-message="controlErrorMessage" :save-status="controlSaveStatus" @close="closeControls"
      @begin-capture="beginControlCapture" @restore-defaults="restoreDefaultControls" @save="saveControls" />

    <SaveHistoryDialog :game="historyGame" :is-restoring="isRestoringSave" @close="historyGame = null"
      @restore="restoreHistoricalSave" />

    <ClearLibraryDialog :open="clearLibraryPrompt" :game-count="games.length" :is-clearing="isClearingLibrary"
      @cancel="clearLibraryPrompt = false" @confirm="confirmClearLibrary" />

    <DeleteDialog :game="deletePrompt" :is-deleting="isDeletingGame" @cancel="deletePrompt = null"
      @confirm="confirmDeleteGame" />

    <RecoveryDialog :prompt="recoveryPrompt" :is-restarting="isRestarting" @dismiss="dismissRecoveryPrompt"
      @restart="restartGame" />

    <StatusBar :active-game="activeGame" />
  </main>
</template>
