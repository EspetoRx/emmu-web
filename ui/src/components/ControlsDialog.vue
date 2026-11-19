<script setup>
import { CONTROL_ACTIONS, formatControlKey } from "../composables/useControls.js";

defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  draft: {
    type: Object,
    required: true,
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
  "begin-capture",
  "restore-defaults",
  "save",
]);
</script>

<template>
  <div v-if="open" class="modal-backdrop" @click.self="emit('close')">
    <section class="controls-dialog" role="dialog" aria-modal="true" aria-labelledby="controls-title">
      <div class="controls-dialog-heading">
        <div>
          <p class="eyebrow">SNES</p>
          <h2 id="controls-title">Configurar controles</h2>
        </div>
        <button class="icon-button" aria-label="Fechar controles" @click="emit('close')">
          ✕
        </button>
      </div>
      <p class="controls-instructions">
        Selecione um botão e pressione a tecla desejada. Escape cancela a captura.
      </p>
      <div class="control-bindings">
        <div v-for="action in CONTROL_ACTIONS" :key="action.id" class="control-binding">
          <span>{{ action.label }}</span>
          <button class="control-key-button" :class="{ listening: waitingForControl === action.id }"
            :aria-pressed="waitingForControl === action.id" @click="emit('begin-capture', action.id)">
            {{
              waitingForControl === action.id
                ? "Pressione uma tecla…"
                : formatControlKey(draft[action.id])
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
          Padrões
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
