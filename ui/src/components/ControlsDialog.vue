<script setup>
import { computed } from "vue";
import { CONTROL_ACTIONS, formatControlKey } from "../composables/useControls.js";

const ANALOG_ACTION_IDS = new Set([
  "AnalogUp",
  "AnalogDown",
  "AnalogLeft",
  "AnalogRight",
]);

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

const systemLabel = computed(() => props.system.toUpperCase());
const isSinglePlayerSystem = computed(() =>
  ["GG", "WS", "NDS", "PSP"].includes(systemLabel.value),
);
const isN64 = computed(() => systemLabel.value === "N64");
const isPsp = computed(() => systemLabel.value === "PSP");
const activeBindings = computed(() => {
  if (isSinglePlayerSystem.value) return props.draft.p1;
  const key = `p${props.activePlayer}`;
  return props.draft[key] || props.draft.p1;
});
const visibleActionsForSystem = computed(() => {
  if (systemLabel.value === "WS") {
    // O WonderSwan tem dois direcionais de 4 vias, A/B e Start. O hardware não
    // tem Select; X/Y/L/R são apenas os nomes dos bindings do segundo pad.
    return CONTROL_ACTIONS.filter(({ id }) => id !== "Select").map((action) => {
      const secondPad = {
        X: "Segundo pad ↑",
        Y: "Segundo pad ↓",
        L: "Segundo pad ←",
        R: "Segundo pad →",
      }[action.id];
      return secondPad ? { ...action, label: secondPad } : action;
    });
  }
  if (systemLabel.value === "GG") {
    // O Game Gear tem apenas D-pad, dois botões (1/2) e Start. As ações A/B
    // continuam existindo nos bindings; apenas os rótulos mudam para 1/2.
    return CONTROL_ACTIONS.filter(
      ({ id }) => !["X", "Y", "L", "R", "Select"].includes(id),
    ).map((action) => {
      if (action.id === "A") return { ...action, label: "1" };
      if (action.id === "B") return { ...action, label: "2" };
      return action;
    });
  }
  if (["GBC", "GB"].includes(systemLabel.value)) {
    return CONTROL_ACTIONS.filter(
      ({ id }) => !["X", "Y", "L", "R", "Z", "CUp", "CDown", "CLeft", "CRight"].includes(id),
    );
  }
  if (systemLabel.value === "GBA") {
    return CONTROL_ACTIONS.filter(({ id }) => !["X", "Y", "Z", "CUp", "CDown", "CLeft", "CRight"].includes(id));
  }
  if (systemLabel.value === "N64") {
    return CONTROL_ACTIONS.filter(({ id }) => !["Select", "X", "Y"].includes(id));
  }
  if (isPsp.value) {
    // O PSP tem D-pad, analógico, quatro botões de face, L/R, Select e Start.
    // Z e C-buttons são exclusivos do N64.
    return CONTROL_ACTIONS.filter(
      ({ id }) => !["Z", "CUp", "CDown", "CLeft", "CRight"].includes(id),
    ).map((action) => {
      const labels = { A: "× (Cross)", B: "○ (Circle)", X: "□ (Square)", Y: "△ (Triangle)" };
      return labels[action.id] ? { ...action, label: labels[action.id] } : action;
    });
  }
  if (systemLabel.value === "PCE") {
    return CONTROL_ACTIONS.filter(({ id }) => !["X", "Y", "L", "R", "Z", "CUp", "CDown", "CLeft", "CRight"].includes(id));
  }
  if (systemLabel.value === "NES") {
    return CONTROL_ACTIONS.filter(({ id }) => !["X", "Y", "L", "R", "Z", "CUp", "CDown", "CLeft", "CRight"].includes(id));
  }
  if (systemLabel.value === "SMS") {
    return CONTROL_ACTIONS.filter(({ id }) => !["X", "Y", "L", "R", "Select", "Z", "CUp", "CDown", "CLeft", "CRight"].includes(id))
      .map((action) => {
        if (action.id === "A") return { ...action, label: "1" };
        if (action.id === "B") return { ...action, label: "2" };
        return action;
      });
  }
  return CONTROL_ACTIONS.filter(({ id }) => !["Z", "CUp", "CDown", "CLeft", "CRight"].includes(id));
});

// O analógico existe no controle de N64 e no PSP. Mantemos as ações no modelo
// de bindings (para não quebrar saves), mas só exibimos nesses consoles.
const visibleActions = computed(() => {
  if (isN64.value || isPsp.value) return visibleActionsForSystem.value;
  return visibleActionsForSystem.value.filter(
    ({ id }) => !ANALOG_ACTION_IDS.has(id),
  );
});
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
        <template v-if="isN64">
          <button v-for="n in 4" :key="n" type="button" role="tab" class="secondary-button" :aria-selected="activePlayer === n"
            @click="emit('select-player', n)">
            P{{ n }} · Jogador {{ n }}
          </button>
        </template>
        <template v-else>
          <button type="button" role="tab" class="secondary-button" :aria-selected="activePlayer === 1"
            @click="emit('select-player', 1)">
            P1 · Jogador 1
          </button>
          <template v-if="!isSinglePlayerSystem">
            <button type="button" role="tab" class="secondary-button" :aria-selected="activePlayer === 2"
              @click="emit('select-player', 2)">
              P2 · Jogador 2 {{ draft.p2Enabled ? "(Conectada)" : "(Inserir)" }}
            </button>
            <label class="p2-enable-toggle">
              <input type="checkbox" :checked="draft.p2Enabled" @change="emit('set-p2-enabled', $event.target.checked)" />
              Manete P2 habilitada
            </label>
          </template>
        </template>
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
