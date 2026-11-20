/** emmu/platforms/web/ui/src/composables/useControls.js */
import { ref } from "vue";
import {
  loadControlBindings,
  saveControlBindings,
} from "../stores/libraryStore.js";

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

export const DEFAULT_P2_CONTROL_BINDINGS = {
  Up: "KeyI",
  Down: "KeyK",
  Left: "KeyJ",
  Right: "KeyL",
  A: "KeyM",
  B: "KeyN",
  X: "KeyO",
  Y: "KeyU",
  L: "KeyY",
  R: "KeyP",
  Start: "NumpadEnter",
  Select: "ShiftRight",
};

export const RESERVED_CONTROL_CODES = new Set([
  "Escape",
  "Tab",
  "MetaLeft",
  "MetaRight",
  "ControlLeft",
  "ControlRight",
  "AltLeft",
  "AltRight",
]);

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

export function formatControlKey(code) {
  if (!code) return "Não definida";
  const labels = {
    ArrowUp: "↑",
    ArrowDown: "↓",
    ArrowLeft: "←",
    ArrowRight: "→",
    Enter: "Enter",
    NumpadEnter: "Num Enter",
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

function validateSinglePlayerBindings(bindings, playerLabel) {
  const validated = {};
  const assignedCodes = new Set();
  for (const { id, label } of CONTROL_ACTIONS) {
    const code = bindings?.[id];
    if (typeof code !== "string" || !code || RESERVED_CONTROL_CODES.has(code)) {
      throw new Error(
        `A tecla configurada para ${label} (${playerLabel}) é inválida.`,
      );
    }
    if (assignedCodes.has(code)) {
      throw new Error(
        `A tecla ${formatControlKey(code)} está atribuída a mais de um botão no ${playerLabel}.`,
      );
    }
    assignedCodes.add(code);
    validated[id] = code;
  }
  return validated;
}

export function validateControlBindings(raw) {
  const isLegacyMap =
    raw &&
    typeof raw === "object" &&
    !raw.p1 &&
    !raw.p2 &&
    typeof raw.Up === "string";

  const p1Raw = isLegacyMap ? raw : (raw?.p1 ?? DEFAULT_CONTROL_BINDINGS);
  const p2Enabled = Boolean(raw?.p2Enabled);
  const p2Raw = raw?.p2 ?? DEFAULT_P2_CONTROL_BINDINGS;

  const p1 = validateSinglePlayerBindings(p1Raw, "Jogador 1");
  const p2 = validateSinglePlayerBindings(p2Raw, "Jogador 2");

  if (p2Enabled) {
    const p1Codes = new Map(
      CONTROL_ACTIONS.map(({ id, label }) => [p1[id], label]),
    );
    for (const { id, label } of CONTROL_ACTIONS) {
      const code = p2[id];
      if (p1Codes.has(code)) {
        throw new Error(
          `A tecla ${formatControlKey(code)} já está em uso no Jogador 1 (${p1Codes.get(code)}).`,
        );
      }
      p2[id] = code;
    }
  }

  return { p1, p2, p2Enabled };
}

export function useControls({ onError, onBeforeOpen } = {}) {
  const controlBindings = ref({
    p1: { ...DEFAULT_CONTROL_BINDINGS },
    p2: { ...DEFAULT_P2_CONTROL_BINDINGS },
    p2Enabled: false,
  });
  const controlDraft = ref({
    p1: { ...DEFAULT_CONTROL_BINDINGS },
    p2: { ...DEFAULT_P2_CONTROL_BINDINGS },
    p2Enabled: false,
  });
  const activePlayer = ref(1);
  const waitingForControl = ref(null);
  const controlErrorMessage = ref("");
  const controlSaveStatus = ref("");
  const showControls = ref(false);

  function cloneState(state) {
    return {
      p1: { ...state.p1 },
      p2: { ...state.p2 },
      p2Enabled: Boolean(state.p2Enabled),
    };
  }

  async function restoreControls() {
    try {
      const savedBindings = await loadControlBindings();
      if (savedBindings) {
        const validated = validateControlBindings(savedBindings);
        controlBindings.value = cloneState(validated);
        controlDraft.value = cloneState(validated);
      }
    } catch (error) {
      onError?.(`Não foi possível carregar os controles: ${errorText(error)}`);
    }
  }

  function openControls(player = 1, { enableP2 = false } = {}) {
    onBeforeOpen?.();
    controlDraft.value = cloneState(controlBindings.value);
    if (player === 2 && enableP2) {
      controlDraft.value.p2Enabled = true;
    }
    activePlayer.value = player === 2 ? 2 : 1;
    waitingForControl.value = null;
    controlErrorMessage.value = "";
    controlSaveStatus.value = "";
    showControls.value = true;
  }

  function selectPlayerTab(player) {
    if (player === 2 && !controlDraft.value.p2Enabled) {
      controlDraft.value.p2Enabled = true;
    }
    activePlayer.value = player === 2 ? 2 : 1;
    waitingForControl.value = null;
    controlErrorMessage.value = "";
  }

  function setPlayerTwoEnabled(enabled) {
    const nextEnabled = Boolean(enabled);
    controlDraft.value.p2Enabled = nextEnabled;
    if (!nextEnabled && activePlayer.value === 2) {
      activePlayer.value = 1;
    }
    waitingForControl.value = null;
    controlErrorMessage.value = "";
    controlSaveStatus.value = "";
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
      controlErrorMessage.value =
        "Essa tecla é reservada pelo sistema. Escolha outra.";
      return;
    }

    const currentPlayerKey = activePlayer.value === 2 ? "p2" : "p1";
    const currentMap = controlDraft.value[currentPlayerKey];

    const samePlayerConflict = CONTROL_ACTIONS.find(
      ({ id }) =>
        id !== waitingForControl.value && currentMap[id] === event.code,
    );
    if (samePlayerConflict) {
      controlErrorMessage.value = `${formatControlKey(event.code)} já está atribuída a ${samePlayerConflict.label} no Jogador ${activePlayer.value}.`;
      return;
    }

    if (controlDraft.value.p2Enabled) {
      const otherPlayerKey = activePlayer.value === 2 ? "p1" : "p2";
      const otherPlayerNumber = activePlayer.value === 2 ? 1 : 2;
      const otherMap = controlDraft.value[otherPlayerKey];
      const crossPlayerConflict = CONTROL_ACTIONS.find(
        ({ id }) => otherMap[id] === event.code,
      );
      if (crossPlayerConflict) {
        controlErrorMessage.value = `${formatControlKey(event.code)} já está em uso no Jogador ${otherPlayerNumber} (${crossPlayerConflict.label}).`;
        return;
      }
    }

    currentMap[waitingForControl.value] = event.code;
    waitingForControl.value = null;
    controlErrorMessage.value = "";
  }

  function restoreDefaultControls() {
    if (activePlayer.value === 2) {
      controlDraft.value.p2 = { ...DEFAULT_P2_CONTROL_BINDINGS };
    } else {
      controlDraft.value.p1 = { ...DEFAULT_CONTROL_BINDINGS };
    }
    waitingForControl.value = null;
    controlErrorMessage.value = "";
    controlSaveStatus.value = "";
  }

  async function saveControls() {
    if (waitingForControl.value) {
      controlErrorMessage.value =
        "Finalize a captura da tecla antes de salvar.";
      return;
    }
    try {
      const validated = validateControlBindings(controlDraft.value);
      await saveControlBindings(validated);
      controlBindings.value = cloneState(validated);
      controlDraft.value = cloneState(validated);
      controlSaveStatus.value = "Controles salvos.";
      controlErrorMessage.value = "";
    } catch (error) {
      controlErrorMessage.value = `Não foi possível salvar os controles: ${errorText(error)}`;
    }
  }

  function findActionByCode(code) {
    const p1Action = CONTROL_ACTIONS.find(
      ({ id }) => controlBindings.value.p1[id] === code,
    );
    if (p1Action) {
      return { button: p1Action.id, player: 1 };
    }
    if (controlBindings.value.p2Enabled) {
      const p2Action = CONTROL_ACTIONS.find(
        ({ id }) => controlBindings.value.p2[id] === code,
      );
      if (p2Action) {
        const res = { button: p2Action.id, player: 2 };
        return res;
      }
    }
    return null;
  }

  return {
    controlBindings,
    controlDraft,
    activePlayer,
    waitingForControl,
    controlErrorMessage,
    controlSaveStatus,
    showControls,
    restoreControls,
    openControls,
    selectPlayerTab,
    setPlayerTwoEnabled,
    closeControls,
    beginControlCapture,
    captureControlKey,
    restoreDefaultControls,
    saveControls,
    findActionByCode,
  };
}
