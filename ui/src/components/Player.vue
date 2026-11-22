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
const isGameBoy = computed(() => ["GBC", "GB"].includes(props.activeGame.format));
const isPce = computed(() => props.activeGame.format === "PCE");
const isGameGear = computed(() => props.activeGame.format === "GG");
const isMasterSystem = computed(() => props.activeGame.format === "SMS");
const isWonderSwan = computed(() => props.activeGame.format === "WS");
const isN64 = computed(() => props.activeGame.format === "N64");
const isHandheld = computed(() => isGameBoy.value || isGameGear.value);
// WonderSwan é portátil e não tem P2. N64 tem 4 jogadores, tratado separadamente.
const isSinglePlayer = computed(() => isHandheld.value || isWonderSwan.value);

// Os controles de toque são sempre do jogador 1. O quarto argumento carrega o
// PointerEvent para `preventDefault()` (evita scroll/zoom e foco preso no
// <button>, que bloquearia o teclado em dispositivos híbridos).
function pressButton(button, pressed, event, player = 1) {
  event?.preventDefault?.();
  // Sem isso, o <button> retém o foco e useShortcuts ignora o teclado
  // enquanto o alvo for um botão (dispositivos híbridos touch + teclado).
  if (pressed) event?.currentTarget?.blur?.();
  emit("set-button", button, pressed, player, event);
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

        <div v-if="isN64" class="n64-player-select">
          <label class="n64-player-label" for="n64-player">Jogador</label>
          <select id="n64-player" class="secondary-button n64-player-dropdown" @change="emit('open-p1-controls', Number($event.target.value)); $event.target.value='1'">
            <option value="1">P1</option>
            <option value="2">P2</option>
            <option value="3">P3</option>
            <option value="4">P4</option>
          </select>
        </div>

        <button v-if="!isGba && !isSinglePlayer && !isN64" type="button" class="secondary-button pad-button" :class="{ 'pad-connected': p2Enabled }"
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
        :class="{ 'nes-canvas': activeGame.format === 'NES' || isMasterSystem, 'gba-canvas': isGba, 'gbc-canvas': isHandheld, 'ws-canvas': isWonderSwan, 'pce-canvas': isPce, 'n64-canvas': isN64 }" :width="frameWidth"
        :height="frameHeight" aria-label="Tela do jogo" tabindex="0" @contextmenu.prevent></canvas>
      <button v-if="isFullscreen" class="fullscreen-exit-button" aria-label="Sair da tela cheia"
        @click="toggleFullscreen">
        Sair da tela cheia
      </button>
      <div v-if="isMobileDevice" class="touch-controls"
        :aria-label="`Controles ${activeGame.format === 'NES' ? 'NES' : isN64 ? 'Nintendo 64' : isGba ? 'GBA' : isGameGear ? 'Game Gear' : isMasterSystem ? 'Master System' : isWonderSwan ? 'WonderSwan' : isGameBoy ? activeGame.format : isPce ? 'PC Engine' : 'SNES'}`">
        <div class="touch-dpad">
          <button class="touch-button dpad-up" aria-label="Cima" @pointerdown="pressButton('Up', true, $event)"
            @pointerup="pressButton('Up', false, $event)"
            @pointercancel="pressButton('Up', false, $event)"
            @pointerleave="pressButton('Up', false, $event)">
            ↑
          </button>
          <button class="touch-button dpad-left" aria-label="Esquerda"
            @pointerdown="pressButton('Left', true, $event)"
            @pointerup="pressButton('Left', false, $event)"
            @pointercancel="pressButton('Left', false, $event)"
            @pointerleave="pressButton('Left', false, $event)">
            ←
          </button>
          <button class="touch-button dpad-down" aria-label="Baixo"
            @pointerdown="pressButton('Down', true, $event)"
            @pointerup="pressButton('Down', false, $event)"
            @pointercancel="pressButton('Down', false, $event)"
            @pointerleave="pressButton('Down', false, $event)">
            ↓
          </button>
          <button class="touch-button dpad-right" aria-label="Direita"
            @pointerdown="pressButton('Right', true, $event)"
            @pointerup="pressButton('Right', false, $event)"
            @pointercancel="pressButton('Right', false, $event)"
            @pointerleave="pressButton('Right', false, $event)">
            →
          </button>
        </div>
        <div v-if="isWonderSwan" class="touch-dpad ws-second-pad" aria-label="Segundo direcional do WonderSwan">
          <button class="touch-button dpad-up" aria-label="Segundo direcional: cima" @pointerdown="pressButton('U', true, $event)"
            @pointerup="pressButton('U', false, $event)"
            @pointercancel="pressButton('U', false, $event)"
            @pointerleave="pressButton('U', false, $event)">
            Y↑
          </button>
          <button class="touch-button dpad-left" aria-label="Segundo direcional: esquerda" @pointerdown="pressButton('L', true, $event)"
            @pointerup="pressButton('L', false, $event)"
            @pointercancel="pressButton('L', false, $event)"
            @pointerleave="pressButton('L', false, $event)">
            Y←
          </button>
          <button class="touch-button dpad-down" aria-label="Segundo direcional: baixo" @pointerdown="pressButton('D', true, $event)"
            @pointerup="pressButton('D', false, $event)"
            @pointercancel="pressButton('D', false, $event)"
            @pointerleave="pressButton('D', false, $event)">
            Y↓
          </button>
          <button class="touch-button dpad-right" aria-label="Segundo direcional: direita" @pointerdown="pressButton('R', true, $event)"
            @pointerup="pressButton('R', false, $event)"
            @pointercancel="pressButton('R', false, $event)"
            @pointerleave="pressButton('R', false, $event)">
            Y→
          </button>
        </div>
        <div v-if="isN64" class="touch-dpad n64-analog-pad" aria-label="Analógico do Nintendo 64">
          <button class="touch-button dpad-up" aria-label="Analógico: cima" @pointerdown="pressButton('AnalogUp', true, $event)"
            @pointerup="pressButton('AnalogUp', false, $event)"
            @pointercancel="pressButton('AnalogUp', false, $event)"
            @pointerleave="pressButton('AnalogUp', false, $event)">
            A↑
          </button>
          <button class="touch-button dpad-left" aria-label="Analógico: esquerda" @pointerdown="pressButton('AnalogLeft', true, $event)"
            @pointerup="pressButton('AnalogLeft', false, $event)"
            @pointercancel="pressButton('AnalogLeft', false, $event)"
            @pointerleave="pressButton('AnalogLeft', false, $event)">
            A←
          </button>
          <button class="touch-button dpad-down" aria-label="Analógico: baixo" @pointerdown="pressButton('AnalogDown', true, $event)"
            @pointerup="pressButton('AnalogDown', false, $event)"
            @pointercancel="pressButton('AnalogDown', false, $event)"
            @pointerleave="pressButton('AnalogDown', false, $event)">
            A↓
          </button>
          <button class="touch-button dpad-right" aria-label="Analógico: direita" @pointerdown="pressButton('AnalogRight', true, $event)"
            @pointerup="pressButton('AnalogRight', false, $event)"
            @pointercancel="pressButton('AnalogRight', false, $event)"
            @pointerleave="pressButton('AnalogRight', false, $event)">
            A→
          </button>
        </div>
        <div class="touch-action-pad" :class="{ 'gba-action-pad': isGba, 'gbc-action-pad': isHandheld, 'n64-action-pad': isN64 }">
          <button v-if="isN64" class="touch-button touch-shoulder" aria-label="L" @pointerdown="pressButton('L', true, $event)" @pointerup="pressButton('L', false, $event)" @pointercancel="pressButton('L', false, $event)" @pointerleave="pressButton('L', false, $event)">L</button>
          <button v-if="isN64" class="touch-button touch-shoulder" aria-label="R" @pointerdown="pressButton('R', true, $event)" @pointerup="pressButton('R', false, $event)" @pointercancel="pressButton('R', false, $event)" @pointerleave="pressButton('R', false, $event)">R</button>
          <button v-if="isN64" class="touch-button" aria-label="Z" @pointerdown="pressButton('Z', true, $event)" @pointerup="pressButton('Z', false, $event)" @pointercancel="pressButton('Z', false, $event)" @pointerleave="pressButton('Z', false, $event)">Z</button>
          <button v-if="isN64" class="touch-button" aria-label="C Up" @pointerdown="pressButton('CUp', true, $event)" @pointerup="pressButton('CUp', false, $event)" @pointercancel="pressButton('CUp', false, $event)" @pointerleave="pressButton('CUp', false, $event)">C↑</button>
          <button v-if="isN64" class="touch-button" aria-label="C Left" @pointerdown="pressButton('CLeft', true, $event)" @pointerup="pressButton('CLeft', false, $event)" @pointercancel="pressButton('CLeft', false, $event)" @pointerleave="pressButton('CLeft', false, $event)">C←</button>
          <button v-if="isN64" class="touch-button" aria-label="C Down" @pointerdown="pressButton('CDown', true, $event)" @pointerup="pressButton('CDown', false, $event)" @pointercancel="pressButton('CDown', false, $event)" @pointerleave="pressButton('CDown', false, $event)">C↓</button>
          <button v-if="isN64" class="touch-button" aria-label="C Right" @pointerdown="pressButton('CRight', true, $event)" @pointerup="pressButton('CRight', false, $event)" @pointercancel="pressButton('CRight', false, $event)" @pointerleave="pressButton('CRight', false, $event)">C→</button>
          <button v-if="!isGba && !isHandheld && !isPce && !isWonderSwan && !isMasterSystem && !isN64" class="touch-button" aria-label="Y" @pointerdown="pressButton('Y', true, $event)"
            @pointerup="pressButton('Y', false, $event)" @pointercancel="pressButton('Y', false, $event)"
            @pointerleave="pressButton('Y', false, $event)">
            Y
          </button>
          <button v-if="!isGba && !isHandheld && !isPce && !isWonderSwan && !isMasterSystem && !isN64" class="touch-button" aria-label="X" @pointerdown="pressButton('X', true, $event)"
            @pointerup="pressButton('X', false, $event)" @pointercancel="pressButton('X', false, $event)"
            @pointerleave="pressButton('X', false, $event)">
            X
          </button>
          <button v-if="isGba" class="touch-button touch-shoulder" aria-label="L" @pointerdown="pressButton('L', true, $event)"
            @pointerup="pressButton('L', false, $event)" @pointercancel="pressButton('L', false, $event)"
            @pointerleave="pressButton('L', false, $event)">
            L
          </button>
          <button v-if="isGba" class="touch-button touch-shoulder" aria-label="R" @pointerdown="pressButton('R', true, $event)"
            @pointerup="pressButton('R', false, $event)" @pointercancel="pressButton('R', false, $event)"
            @pointerleave="pressButton('R', false, $event)">
            R
          </button>
          <button class="touch-button" :aria-label="isGameGear || isMasterSystem ? 'Botão 2' : 'B'" @pointerdown="pressButton('B', true, $event)"
            @pointerup="pressButton('B', false, $event)" @pointercancel="pressButton('B', false, $event)"
            @pointerleave="pressButton('B', false, $event)">
            {{ isGameGear || isMasterSystem ? "2" : "B" }}
          </button>
          <button class="touch-button" :aria-label="isGameGear || isMasterSystem ? 'Botão 1' : 'A'" @pointerdown="pressButton('A', true, $event)"
            @pointerup="pressButton('A', false, $event)" @pointercancel="pressButton('A', false, $event)"
            @pointerleave="pressButton('A', false, $event)">
            {{ isGameGear || isMasterSystem ? "1" : "A" }}
          </button>
        </div>
        <div class="touch-system-pad">
          <button v-if="!isGameGear && !isWonderSwan && !isMasterSystem && !isN64" class="touch-button" aria-label="Select" @pointerdown="pressButton('Select', true, $event)"
            @pointerup="pressButton('Select', false, $event)"
            @pointercancel="pressButton('Select', false, $event)"
            @pointerleave="pressButton('Select', false, $event)">
            Select
          </button>
          <button class="touch-button" aria-label="Start" @pointerdown="pressButton('Start', true, $event)"
            @pointerup="pressButton('Start', false, $event)"
            @pointercancel="pressButton('Start', false, $event)"
            @pointerleave="pressButton('Start', false, $event)">
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

/* Segundo direcional do WonderSwan e analógico do N64: compactos para caber
   ao lado do direcional principal. */
.ws-second-pad,
.n64-analog-pad {
  grid-template: repeat(2, 30px) / repeat(3, 30px);
  gap: 2px;
  align-self: flex-end;
}

.ws-second-pad .touch-button,
.n64-analog-pad .touch-button {
  min-width: 28px;
  min-height: 28px;
  padding: 0 4px;
  border-color: rgba(74, 222, 128, 0.4);
  background: rgba(30, 60, 48, 0.82);
  font-size: 9px;
}

.ws-second-pad .dpad-up,
.n64-analog-pad .dpad-up {
  grid-area: 1 / 2;
}

.ws-second-pad .dpad-left,
.n64-analog-pad .dpad-left {
  grid-area: 2 / 1;
}

.ws-second-pad .dpad-down,
.n64-analog-pad .dpad-down {
  grid-area: 2 / 2;
}

.ws-second-pad .dpad-right,
.n64-analog-pad .dpad-right {
  grid-area: 2 / 3;
}
</style>
