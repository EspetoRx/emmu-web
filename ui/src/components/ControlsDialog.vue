<script setup>
import { computed } from "vue";
import { CONTROL_ACTIONS, formatControlKey } from "../composables/useControls.js";

const props = defineProps({
  system: {
    type: String,
    default: "SNES",
  },
  open: {
    type: Boolean,
    default: false,
  },
  draft: {
    type: Object,
    required: true,
  },
  activePlayer: {
    type: Number,
    default: 1,
  },
  waitingForControl: {
    type: String,
    default: null,
  },
  errorMessage: {
    type: String,
    default: "",
  },
  saveStatus: {
    type: String,
    default: "",
  },
});

const emit = defineEmits([
  "close",
  "select-player",
  "set-p2-enabled",
  "begin-capture",
  "restore-defaults",
  "save",
]);

const activeBindings = computed(() =>
  props.activePlayer === 2 ? props.draft.p2 : props.draft.p1,
);
const systemLabel = computed(() => props.system.toUpperCase());
const visibleActions = computed(() =>
  systemLabel.value === "GBA"
    ? CONTROL_ACTIONS.filter(({ id }) => id !== "X" && id !== "Y")
    : CONTROL_ACTIONS,
);
</script>

<template>
  <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
    <section class="controls-dialog" role="dialog" aria-modal="true" aria-labelledby="controls-title">
      <div class="controls-dialog-heading">
        <div>
          <p class="eyebrow">{{ systemLabel }} · JOGADOR {{ activePlayer }}</p>
          <h2 id="controls-title">Configurar controles</h2>
        </div>
        <button class="icon-button" aria-label="Fechar controles" @click="emit('close')">
          ✕
        </button>
      </div>

      <div class="player-tabs-row" role="tablist" aria-label="Selecionar manete">
        <button type="button" role="tab" class="secondary-button" :aria-selected="activePlayer === 1"
          @click="emit('select-player', 1)">
          P1 · Jogador 1
        </button>
        <button type="button" role="tab" class="secondary-button" :aria-selected="activePlayer === 2"
          @click="emit('select-player', 2)">
          P2 · Jogador 2 {{ draft.p2Enabled ? "(Conectada)" : "(Inserir)" }}
        </button>
        <label class="p2-enable-toggle">
          <input type="checkbox" :checked="draft.p2Enabled" @change="emit('set-p2-enabled', $event.target.checked)" />
          Manete P2 habilitada
        </label>
      </div>

      <p class="controls-instructions">
        Configurando <strong>Jogador {{ activePlayer }}</strong>. Selecione um botão e pressione a tecla desejada.
        Escape cancela a captura.
      </p>

      <div class="control-bindings">
        <div v-for="action in visibleActions" :key="action.id" class="control-binding">
          <span>{{ action.label }}</span>
          <button class="control-key-button" :class="{ listening: waitingForControl === action.id }"
            :aria-pressed="waitingForControl === action.id" @click="emit('begin-capture', action.id)">
            {{
              waitingForControl === action.id
                ? "Pressione uma tecla…"
                : formatControlKey(activeBindings[action.id])
            }}
          </button>
        </div>
      </div>

      <p v-if="errorMessage" class="error-message control-message" role="alert">
        {{ errorMessage }}
      </p>
      <p v-if="saveStatus" class="control-save-status" role="status">
        {{ saveStatus }}
      </p>

      <div class="controls-dialog-actions">
        <button class="secondary-button" @click="emit('restore-defaults')">
          Padrões P{{ activePlayer }}
        </button>
        <span class="dialog-action-spacer"></span>
        <button class="secondary-button" @click="emit('close')">Cancelar</button>
        <button class="primary-button" :disabled="Boolean(waitingForControl)" @click="emit('save')">
          Salvar
        </button>
      </div>
    </section>
  </div>
</template>

<style scoped>
.player-tabs-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  margin-bottom: 12px;
}

.player-tabs-row [aria-selected="true"] {
  border-color: var(--accent, #7c5cff);
  font-weight: 600;
}

.p2-enable-toggle {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 0.85rem;
  cursor: pointer;
}
</style>
