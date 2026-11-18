<template>
  <section v-if="activeGame" class="player-page">
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
        <button
          class="secondary-button"
          :disabled="!snesCore || !isPlaying || isRestarting"
          @click="emit('restart')"
        >
          {{ isRestarting ? "Reiniciando..." : "Reiniciar" }}
        </button>
        <button class="secondary-button" @click="emit('open-controls')">Controles</button>
        <div class="player-audio-controls">
          <button
            class="audio-toggle-button"
            type="button"
            :aria-label="showAudioControls ? 'Fechar controles de áudio' : 'Abrir controles de áudio'"
            :aria-expanded="showAudioControls"
            aria-controls="audio-volume-controls"
            @click="emit('toggle-audio')"
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
              @input="emit('volume-change', Number($event.target.value) / 100)"
            />
            <output class="stage-volume-value">{{ Math.round(audioVolume * 100) }}%</output>
          </div>
        </div>
        <button
          class="secondary-button fullscreen-button"
          :aria-label="isFullscreen ? 'Sair da tela cheia' : 'Colocar jogo em tela cheia'"
          :aria-pressed="isFullscreen"
          @click="emit('toggle-fullscreen')"
        >
          {{ isFullscreen ? "Sair da tela cheia" : "Tela cheia" }}
        </button>
        <button
          class="primary-button save-state-button"
          :disabled="!isPlaying || isSavingState"
          @click="emit('save-state')"
        >
          {{ isSavingState ? "Salvando..." : "Salvar estado" }}
        </button>
      </div>
      <button class="icon-button" aria-label="Voltar à biblioteca" @click="emit('return-to-library')">
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
        @keydown="onKeyDown"
        @keyup="onKeyUp"
      ></canvas>
      <button
        v-if="isFullscreen"
        class="fullscreen-exit-button"
        aria-label="Sair da tela cheia"
        @click="emit('toggle-fullscreen')"
      >
        Sair da tela cheia
      </button>
      <div
        v-if="isMobile"
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
</template>

<script setup>
import { computed } from "vue";

const props = defineProps([
  "activeGame",
  "isPlaying",
  "isRestarting",
  "isSavingState",
  "isFullscreen",
  "showAudioControls",
  "audioVolume",
  "snesCore",
  "isMobile",
  "canvasRef",
  "gameStageRef",
]);
const emit = defineEmits([
  "return-to-library",
  "restart",
  "open-controls",
  "toggle-audio",
  "toggle-fullscreen",
  "save-state",
  "volume-change",
  "keydown",
  "keyup",
  "set-button",
]);

const frameHeight = computed(() =>
  props.activeGame?.format === "NES" ? 240 : 224,
);

function onKeyDown(event) { emit("keydown", event); }
function onKeyUp(event) { emit("keyup", event); }
function setButton(button, pressed, event) { emit("set-button", button, pressed, event); }

const formatSavedTime = (timestamp) => {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("pt-BR", { hour: "2-digit", minute: "2-digit" }).format(new Date(timestamp));
};
</script>