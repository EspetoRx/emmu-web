<template>
  <div
    v-if="visible"
    class="modal-backdrop"
    @click.self="emit('close')"
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
        <button class="icon-button" aria-label="Fechar controles" @click="emit('close')">
          ✕
        </button>
      </div>
      <p class="controls-instructions">
        Selecione um botão e pressione a tecla desejada. Escape cancela a captura.
      </p>
      <div class="control-bindings">
        <div
          v-for="action in CONTROL_ACTIONS"
          :key="action.id"
          class="control-binding"
        >
          <span>{{ action.label }}</span>
          <button
            class="control-key-button"
            :class="{ listening: waitingFor === action.id }"
            :aria-pressed="waitingFor === action.id"
            @click="emit('capture', action.id)"
          >
            {{ waitingFor === action.id ? "Pressione uma tecla…" : formatKey(bindings[action.id]) }}
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
        <button class="secondary-button" @click="emit('defaults')">
          Padrões
        </button>
        <span class="dialog-action-spacer"></span>
        <button class="secondary-button" @click="emit('close')">Cancelar</button>
        <button
          class="primary-button"
          :disabled="Boolean(waitingFor)"
          @click="emit('save', draftBindings)"
        >
          Salvar
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps(["visible", "bindings", "draftBindings", "waitingFor", "errorMessage", "saveStatus"]);
const emit = defineEmits(["close", "capture", "defaults", "save"]);

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

const formatKey = (code) => {
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
};
</script>