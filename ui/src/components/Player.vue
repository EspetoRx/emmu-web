<script setup>
import { computed, onBeforeUnmount, onMounted, ref } from "vue";

const props = defineProps({
  activeGame: {
    type: Object,
    required: true,
  },
  frameWidth: {
    type: Number,
    default: 256,
  },
  frameHeight: {
    type: Number,
    required: true,
  },
  hasCore: {
    type: Boolean,
    default: false,
  },
  isPlaying: {
    type: Boolean,
    default: false,
  },
  isSavingState: {
    type: Boolean,
    default: false,
  },
  isRestarting: {
    type: Boolean,
    default: false,
  },
  isMobileDevice: {
    type: Boolean,
    default: false,
  },
  audioVolume: {
    type: Number,
    required: true,
  },
  showAudioControls: {
    type: Boolean,
    default: false,
  },
  p2Enabled: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  "return-to-library",
  "restart",
  "open-p1-controls",
  "open-p2-controls",
  "toggle-audio-controls",
  "set-audio-volume",
  "save-state",
  "set-button",
  "register-stage",
  "register-canvas",
]);

const gameStageRef = ref(null);
const canvasRef = ref(null);
const isFullscreen = ref(false);
const isGba = computed(() => props.activeGame.format === "GBA");
const isGameBoy = computed(() =>
  ["GBC", "GB"].includes(props.activeGame.format),
);
const isPce = computed(() => props.activeGame.format === "PCE");

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
      return;
    }
    await stage.requestFullscreen();
  } catch {}
}

onMounted(() => {
  emit("register-stage", gameStageRef.value);
  emit("register-canvas", canvasRef.value);
  document.addEventListener("fullscreenchange", handleFullscreenChange);
});

onBeforeUnmount(() => {
  document.removeEventListener("fullscreenchange", handleFullscreenChange);
  emit("register-stage", null);
  emit("register-canvas", null);
});
</script>

<template>
  <section class="player-page">
    <div class="player-toolbar">
      <button class="back-button" @click="emit('return-to-library')">
        <span aria-hidden="true">←</span>
        Biblioteca
      </button>
      <div class="player-game-title">
        <span class="playing-indicator"></span>
        <strong>{{ activeGame.name }}</strong>
        <span class="game-meta">{{ activeGame.format }}</span>
      </div>
      <div class="player-toolbar-actions">
        <button class="secondary-button" :disabled="!hasCore || !isPlaying || isRestarting" @click="emit('restart')">
          {{ isRestarting ? "Reiniciando..." : "Reiniciar" }}
        </button>

        <button type="button" class="secondary-button pad-button" aria-label="Configurar manete do Jogador 1"
          title="Configurar controles do Jogador 1" @click="emit('open-p1-controls')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="2" y="6" width="20" height="12" rx="6" />
            <path d="M8 10v4M6 12h4" />
            <circle cx="15.5" cy="11" r="1" fill="currentColor" stroke="none" />
            <circle cx="17.5" cy="13" r="1" fill="currentColor" stroke="none" />
          </svg>
          <span>P1</span>
        </button>

        <button v-if="!isGba && !isGameBoy" type="button" class="secondary-button pad-button" :class="{ 'pad-connected': p2Enabled }"
          :aria-pressed="p2Enabled" :aria-label="p2Enabled
              ? 'Configurar manete do Jogador 2'
              : 'Inserir e configurar manete do Jogador 2'
            " :title="p2Enabled
              ? 'Manete P2 conectada — clique para configurar'
              : 'Clique para inserir e configurar a manete P2'
            " @click="emit('open-p2-controls')">
          <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8"
            stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect x="2" y="6" width="20" height="12" rx="6" />
            <path d="M8 10v4M6 12h4" />
            <circle cx="15.5" cy="11" r="1" fill="currentColor" stroke="none" />
            <circle cx="17.5" cy="13" r="1" fill="currentColor" stroke="none" />
          </svg>
          <span>P2</span>
        </button>

        <div class="player-audio-controls">
          <button class="audio-toggle-button" type="button" :aria-label="showAudioControls
              ? 'Fechar controles de áudio'
              : 'Abrir controles de áudio'
            " :aria-expanded="showAudioControls" aria-controls="audio-volume-controls"
            @click="emit('toggle-audio-controls')">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"
              stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
              <path d="M11 5 6 9H3v6h3l5 4V5Z" />
              <path v-if="audioVolume > 0" d="M15.5 8.5a5 5 0 0 1 0 7" />
              <path v-if="audioVolume > 0" d="M18.5 5.5a9 9 0 0 1 0 13" />
              <path v-else d="m16 9 5 6m0-6-5 6" />
            </svg>
          </button>
          <div v-if="showAudioControls" id="audio-volume-controls" class="audio-volume-popover" role="group"
            aria-label="Volume do jogo">
            <input class="stage-volume" type="range" min="0" max="100" :value="Math.round(audioVolume * 100)"
              aria-label="Volume do jogo" @input="
                emit('set-audio-volume', Number($event.target.value) / 100)
                " />
            <output class="stage-volume-value">{{ Math.round(audioVolume * 100) }}%</output>
          </div>
        </div>

        <button class="secondary-button fullscreen-button" :aria-label="isFullscreen ? 'Sair da tela cheia' : 'Colocar jogo em tela cheia'
          " :aria-pressed="isFullscreen" @click="toggleFullscreen">
          {{ isFullscreen ? "Sair da tela cheia" : "Tela cheia" }}
        </button>

        <button class="primary-button save-state-button" :disabled="!isPlaying || isSavingState"
          @click="emit('save-state')">
          {{ isSavingState ? "Salvando..." : "Salvar estado" }}
        </button>
      </div>
      <button class="icon-button" aria-label="Voltar à biblioteca" @click="emit('return-to-library')">
        ✕
      </button>
    </div>

    <div ref="gameStageRef" class="game-stage">
      <canvas ref="canvasRef" class="game-canvas"
        :class="{ 'nes-canvas': activeGame.format === 'NES', 'gba-canvas': isGba, 'gbc-canvas': isGameBoy, 'pce-canvas': isPce }" :width="frameWidth"
        :height="frameHeight" aria-label="Tela do jogo" tabindex="0" @contextmenu.prevent></canvas>
      <button v-if="isFullscreen" class="fullscreen-exit-button" aria-label="Sair da tela cheia"
        @click="toggleFullscreen">
        Sair da tela cheia
      </button>
      <div v-if="isMobileDevice" class="touch-controls"
        :aria-label="`Controles ${activeGame.format === 'NES' ? 'NES' : isGba ? 'GBA' : isGameBoy ? activeGame.format : isPce ? 'PC Engine' : 'SNES'}`">
        <div class="touch-dpad">
          <button class="touch-button dpad-up" aria-label="Cima" @pointerdown="emit('set-button', 'Up', true, $event)"
            @pointerup="emit('set-button', 'Up', false, $event)"
            @pointercancel="emit('set-button', 'Up', false, $event)"
            @pointerleave="emit('set-button', 'Up', false, $event)">
            ↑
          </button>
          <button class="touch-button dpad-left" aria-label="Esquerda"
            @pointerdown="emit('set-button', 'Left', true, $event)"
            @pointerup="emit('set-button', 'Left', false, $event)"
            @pointercancel="emit('set-button', 'Left', false, $event)"
            @pointerleave="emit('set-button', 'Left', false, $event)">
            ←
          </button>
          <button class="touch-button dpad-down" aria-label="Baixo"
            @pointerdown="emit('set-button', 'Down', true, $event)"
            @pointerup="emit('set-button', 'Down', false, $event)"
            @pointercancel="emit('set-button', 'Down', false, $event)"
            @pointerleave="emit('set-button', 'Down', false, $event)">
            ↓
          </button>
          <button class="touch-button dpad-right" aria-label="Direita"
            @pointerdown="emit('set-button', 'Right', true, $event)"
            @pointerup="emit('set-button', 'Right', false, $event)"
            @pointercancel="emit('set-button', 'Right', false, $event)"
            @pointerleave="emit('set-button', 'Right', false, $event)">
            →
          </button>
        </div>
        <div class="touch-action-pad" :class="{ 'gba-action-pad': isGba, 'gbc-action-pad': isGameBoy }">
          <button v-if="!isGba && !isGameBoy" class="touch-button" aria-label="Y" @pointerdown="emit('set-button', 'Y', true, $event)"
            @pointerup="emit('set-button', 'Y', false, $event)" @pointercancel="emit('set-button', 'Y', false, $event)"
            @pointerleave="emit('set-button', 'Y', false, $event)">
            Y
          </button>
          <button v-if="!isGba && !isGameBoy" class="touch-button" aria-label="X" @pointerdown="emit('set-button', 'X', true, $event)"
            @pointerup="emit('set-button', 'X', false, $event)" @pointercancel="emit('set-button', 'X', false, $event)"
            @pointerleave="emit('set-button', 'X', false, $event)">
            X
          </button>
          <button v-if="isGba" class="touch-button touch-shoulder" aria-label="L" @pointerdown="emit('set-button', 'L', true, $event)"
            @pointerup="emit('set-button', 'L', false, $event)" @pointercancel="emit('set-button', 'L', false, $event)"
            @pointerleave="emit('set-button', 'L', false, $event)">
            L
          </button>
          <button v-if="isGba" class="touch-button touch-shoulder" aria-label="R" @pointerdown="emit('set-button', 'R', true, $event)"
            @pointerup="emit('set-button', 'R', false, $event)" @pointercancel="emit('set-button', 'R', false, $event)"
            @pointerleave="emit('set-button', 'R', false, $event)">
            R
          </button>
          <button class="touch-button" aria-label="B" @pointerdown="emit('set-button', 'B', true, $event)"
            @pointerup="emit('set-button', 'B', false, $event)" @pointercancel="emit('set-button', 'B', false, $event)"
            @pointerleave="emit('set-button', 'B', false, $event)">
            B
          </button>
          <button class="touch-button" aria-label="A" @pointerdown="emit('set-button', 'A', true, $event)"
            @pointerup="emit('set-button', 'A', false, $event)" @pointercancel="emit('set-button', 'A', false, $event)"
            @pointerleave="emit('set-button', 'A', false, $event)">
            A
          </button>
        </div>
        <div class="touch-system-pad">
          <button class="touch-button" aria-label="Select" @pointerdown="emit('set-button', 'Select', true, $event)"
            @pointerup="emit('set-button', 'Select', false, $event)"
            @pointercancel="emit('set-button', 'Select', false, $event)"
            @pointerleave="emit('set-button', 'Select', false, $event)">
            Select
          </button>
          <button class="touch-button" aria-label="Start" @pointerdown="emit('set-button', 'Start', true, $event)"
            @pointerup="emit('set-button', 'Start', false, $event)"
            @pointercancel="emit('set-button', 'Start', false, $event)"
            @pointerleave="emit('set-button', 'Start', false, $event)">
            Start
          </button>
        </div>
      </div>
      <div class="stage-footer">
        <span>EMMU · MULTI-EMULADOR</span>
        <span>{{ isPlaying ? "EMULAÇÃO ATIVA" : activeGame.format }}</span>
      </div>
    </div>
  </section>
</template>

<style scoped>
.pad-button {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.pad-connected {
  border-color: #4ade80;
  color: #4ade80;
}
</style>
