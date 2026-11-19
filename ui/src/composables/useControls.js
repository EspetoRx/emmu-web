import { ref } from "vue";
import { loadControlBindings, saveControlBindings } from "../stores/libraryStore.js";

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

export function validateControlBindings(bindings) {
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

export function useControls({ onError, onBeforeOpen } = {}) {
  const controlBindings = ref({ ...DEFAULT_CONTROL_BINDINGS });
  const controlDraft = ref({ ...DEFAULT_CONTROL_BINDINGS });
  const waitingForControl = ref(null);
  const controlErrorMessage = ref("");
  const controlSaveStatus = ref("");
  const showControls = ref(false);

  async function restoreControls() {
    try {
      const savedBindings = await loadControlBindings();
      if (savedBindings) {
        controlBindings.value = validateControlBindings(savedBindings);
        controlDraft.value = { ...controlBindings.value };
      }
    } catch (error) {
      console.error("Could not restore the controller bindings:", error);
      onError?.(`Não foi possível carregar os controles: ${errorText(error)}`);
    }
  }

  function openControls() {
    onBeforeOpen?.();
    controlDraft.value = { ...controlBindings.value };
    waitingForControl.value = null;
    controlErrorMessage.value = "";
    controlSaveStatus.value = "";
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

  function findActionByCode(code) {
    return CONTROL_ACTIONS.find(({ id }) => controlBindings.value[id] === code)?.id;
  }

  return {
    controlBindings,
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
  };
}
