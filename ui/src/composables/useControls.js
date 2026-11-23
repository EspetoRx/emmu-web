/** emmu/platforms/web/ui/src/composables/useControls.js */
import { ref } from "vue";
import {
  loadControlBindings,
  loadPspControlBindings,
  saveControlBindings,
  savePspControlBindings,
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
  { id: "Z", label: "Z" },
  { id: "CUp", label: "C ↑" },
  { id: "CDown", label: "C ↓" },
  { id: "CLeft", label: "C ←" },
  { id: "CRight", label: "C →" },
  // N64 e PSP têm um analógico de quatro direções. No N64 o bridge converte
  // em axisX/axisY (_neil_send_mobile_controls); no PSP viram botões 16..19
  // do RetroArch via simulate_input.
  { id: "AnalogUp", label: "Analógico ↑" },
  { id: "AnalogDown", label: "Analógico ↓" },
  { id: "AnalogLeft", label: "Analógico ←" },
  { id: "AnalogRight", label: "Analógico →" },
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
  Z: "KeyE",
  CUp: "Numpad8",
  CDown: "Numpad2",
  CLeft: "Numpad4",
  CRight: "Numpad6",
  AnalogUp: "NumpadAdd",
  AnalogDown: "NumpadSubtract",
  AnalogLeft: "NumpadMultiply",
  AnalogRight: "NumpadDivide",
};

// No PSP o analógico é usado para dirigir: setas → analógico, numpad → D-pad.
// O perfil é persistido à parte (chave "psp-controls") para não alterar os
// outros consoles.
export const DEFAULT_PSP_CONTROL_BINDINGS = {
  ...DEFAULT_CONTROL_BINDINGS,
  Up: "Numpad8",
  Down: "Numpad2",
  Left: "Numpad4",
  Right: "Numpad6",
  AnalogUp: "ArrowUp",
  AnalogDown: "ArrowDown",
  AnalogLeft: "ArrowLeft",
  AnalogRight: "ArrowRight",
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
  Z: "KeyH",
  CUp: "Numpad7",
  CDown: "Numpad1",
  CLeft: "Numpad0",
  CRight: "Numpad9",
  AnalogUp: "BracketLeft",
  AnalogDown: "BracketRight",
  AnalogLeft: "Semicolon",
  AnalogRight: "Quote",
};

export const DEFAULT_P3_CONTROL_BINDINGS = {
  Up: "KeyT", Down: "KeyG", Left: "KeyF", Right: "Digit8",
  A: "KeyV", B: "KeyC", X: "KeyR", Y: "KeyD", L: "KeyB", R: "Digit0",
  Start: "Digit5", Select: "Digit6", Z: "Digit4",
  CUp: "Digit1", CDown: "Digit2", CLeft: "Digit3", CRight: "Digit7",
  AnalogUp: "Comma", AnalogDown: "Period", AnalogLeft: "Slash", AnalogRight: "Backslash",
};

export const DEFAULT_P4_CONTROL_BINDINGS = {
  Up: "Home", Down: "End", Left: "Delete", Right: "PageDown",
  A: "Insert", B: "PageUp", X: "F1", Y: "F2", L: "F3", R: "F4",
  Start: "F5", Select: "F6", Z: "F7",
  CUp: "F8", CDown: "F9", CLeft: "F10", CRight: "F11",
  AnalogUp: "Minus", AnalogDown: "Equal", AnalogLeft: "Space", AnalogRight: "Backspace",
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
    NumpadAdd: "Num +",
    NumpadSubtract: "Num −",
    NumpadMultiply: "Num ×",
    NumpadDivide: "Num ÷",
    BracketLeft: "[",
    BracketRight: "]",
    Semicolon: ";",
    Quote: "'",
    Comma: ",",
    Period: ".",
    Slash: "/",
    Backslash: "\\",
    Minus: "-",
    Equal: "=",
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

// Saves feitos antes das ações de N64 não têm Z/C*; saves antigos do P3 usam
// KeyH/KeyY, que conflitam com Z/L do P2. Preencher/migrar aqui evita o alerta
// de "tecla inválida" ao iniciar, sem descartar o resto da configuração.
function migrateLegacyBindings(raw) {
  if (!raw || typeof raw !== "object") return raw;
  // Mapa legado (sem p1/p2) é tratado separadamente em validateControlBindings.
  if (!raw.p1 && !raw.p2 && typeof raw.Up === "string") return raw;

  const defaults = {
    p1: DEFAULT_CONTROL_BINDINGS,
    p2: DEFAULT_P2_CONTROL_BINDINGS,
    p3: DEFAULT_P3_CONTROL_BINDINGS,
    p4: DEFAULT_P4_CONTROL_BINDINGS,
  };
  const migrated = { ...raw };
  let changed = false;

  for (const [key, fallback] of Object.entries(defaults)) {
    const saved = raw[key];
    if (!saved || typeof saved !== "object") {
      migrated[key] = { ...fallback };
      changed = true;
      continue;
    }
    const merged = { ...fallback, ...saved };
    const spares = {
      p1: ["NumpadAdd", "NumpadSubtract", "NumpadMultiply", "NumpadDivide", "Space", "Backspace"],
      p2: ["BracketLeft", "BracketRight", "Semicolon", "Quote", "NumpadAdd", "NumpadSubtract"],
      p3: ["Comma", "Period", "Slash", "Backslash", "Minus", "Equal"],
      p4: ["Minus", "Equal", "Space", "Backspace", "Comma", "Period"],
    }[key];
    for (const { id } of CONTROL_ACTIONS) {
      const code = merged[id];
      if (typeof code !== "string" || !code || RESERVED_CONTROL_CODES.has(code)) {
        const used = new Set(
          Object.values(merged).filter((value) => typeof value === "string"),
        );
        merged[id] = !used.has(fallback[id])
          ? fallback[id]
          : (spares.find((candidate) => !used.has(candidate)) ?? fallback[id]);
        changed = true;
      }
    }
    if (key === "p3") {
      if (merged.Right === "KeyH") { merged.Right = fallback.Right; changed = true; }
      if (merged.R === "KeyY") { merged.R = fallback.R; changed = true; }
    }
    migrated[key] = merged;
  }
  return changed ? migrated : raw;
}

export function validateControlBindings(raw) {
  const source = migrateLegacyBindings(raw);
  const isLegacyMap =
    source && typeof source === "object" && !source.p1 && !source.p2 && typeof source.Up === "string";

  const p1Raw = isLegacyMap
    ? { ...DEFAULT_CONTROL_BINDINGS, ...source }
    : (source?.p1 ?? DEFAULT_CONTROL_BINDINGS);
  const p2Enabled = Boolean(source?.p2Enabled);
  const p1 = validateSinglePlayerBindings(p1Raw, "Jogador 1");
  const p2 = validateSinglePlayerBindings(source?.p2 ?? DEFAULT_P2_CONTROL_BINDINGS, "Jogador 2");
  const p3 = validateSinglePlayerBindings(source?.p3 ?? DEFAULT_P3_CONTROL_BINDINGS, "Jogador 3");
  const p4 = validateSinglePlayerBindings(source?.p4 ?? DEFAULT_P4_CONTROL_BINDINGS, "Jogador 4");

  const active = [["P1", p1], ["P3", p3], ["P4", p4]];
  if (p2Enabled) active.splice(1, 0, ["P2", p2]);
  for (let i = 0; i < active.length; i++) {
    for (let j = i + 1; j < active.length; j++) {
      const [na, ma] = active[i];
      const [nb, mb] = active[j];
      for (const { id, label } of CONTROL_ACTIONS) {
        const code = ma[id];
        for (const { id: oid, label: olabel } of CONTROL_ACTIONS) {
          if (code === mb[oid]) {
            throw new Error(`A tecla ${formatControlKey(code)} está em conflito entre ${label} (${na}) e ${olabel} (${nb}).`);
          }
        }
      }
    }
  }

  return { p1, p2, p3, p4, p2Enabled };
}

export function useControls({ onError, onBeforeOpen } = {}) {
  const controlBindings = ref({
    p1: { ...DEFAULT_CONTROL_BINDINGS },
    p2: { ...DEFAULT_P2_CONTROL_BINDINGS },
    p3: { ...DEFAULT_P3_CONTROL_BINDINGS },
    p4: { ...DEFAULT_P4_CONTROL_BINDINGS },
    p2Enabled: false,
  });
  const controlDraft = ref({
    p1: { ...DEFAULT_CONTROL_BINDINGS },
    p2: { ...DEFAULT_P2_CONTROL_BINDINGS },
    p3: { ...DEFAULT_P3_CONTROL_BINDINGS },
    p4: { ...DEFAULT_P4_CONTROL_BINDINGS },
    p2Enabled: false,
  });
  const pspControlBindings = ref({
    p1: { ...DEFAULT_PSP_CONTROL_BINDINGS },
    p2: { ...DEFAULT_P2_CONTROL_BINDINGS },
    p3: { ...DEFAULT_P3_CONTROL_BINDINGS },
    p4: { ...DEFAULT_P4_CONTROL_BINDINGS },
    p2Enabled: false,
  });
  const activeControlProfile = ref("default");
  const activePlayer = ref(1);
  const waitingForControl = ref(null);
  const controlErrorMessage = ref("");
  const controlSaveStatus = ref("");
  const showControls = ref(false);

  function cloneState(state) {
    return {
      p1: { ...state.p1 },
      p2: { ...state.p2 },
      p3: { ...(state.p3 ?? DEFAULT_P3_CONTROL_BINDINGS) },
      p4: { ...(state.p4 ?? DEFAULT_P4_CONTROL_BINDINGS) },
      p2Enabled: Boolean(state.p2Enabled),
    };
  }

  async function restoreControls() {
    try {
      const [savedBindings, savedPsp] = await Promise.all([
        loadControlBindings(),
        loadPspControlBindings(),
      ]);
      if (savedBindings) {
        const validated = validateControlBindings(savedBindings);
        controlBindings.value = cloneState(validated);
        controlDraft.value = cloneState(validated);
      }
      if (savedPsp) {
        pspControlBindings.value = cloneState(
          validateControlBindings(savedPsp),
        );
      }
    } catch (error) {
      onError?.(`Não foi possível carregar os controles: ${errorText(error)}`);
    }
  }

  function openControls(player = 1, { enableP2 = false, format } = {}) {
    onBeforeOpen?.();
    activeControlProfile.value = format === "PSP" ? "psp" : "default";
    const source =
      activeControlProfile.value === "psp"
        ? pspControlBindings.value
        : controlBindings.value;
    controlDraft.value = cloneState(source);
    if (player === 2 && enableP2) controlDraft.value.p2Enabled = true;
    activePlayer.value = Math.max(1, Math.min(4, Number(player) || 1));
    waitingForControl.value = null;
    controlErrorMessage.value = "";
    controlSaveStatus.value = "";
    showControls.value = true;
  }

  function selectPlayerTab(player) {
    const n = Math.max(1, Math.min(4, Number(player) || 1));
    if (n === 2 && !controlDraft.value.p2Enabled) controlDraft.value.p2Enabled = true;
    activePlayer.value = n;
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

    const currentPlayerKey = `p${activePlayer.value}`;
    const currentMap = controlDraft.value[currentPlayerKey] || controlDraft.value.p1;

    const samePlayerConflict = CONTROL_ACTIONS.find(
      ({ id }) => id !== waitingForControl.value && currentMap[id] === event.code,
    );
    if (samePlayerConflict) {
      controlErrorMessage.value = `${formatControlKey(event.code)} já está atribuída a ${samePlayerConflict.label} no Jogador ${activePlayer.value}.`;
      return;
    }

    for (let n = 1; n <= 4; n++) {
      if (n === activePlayer.value) continue;
      if (n === 2 && !controlDraft.value.p2Enabled && activePlayer.value !== 2) continue;
      const other = controlDraft.value[`p${n}`];
      if (!other) continue;
      const conflict = CONTROL_ACTIONS.find(({ id }) => other[id] === event.code);
      if (conflict) {
        controlErrorMessage.value = `${formatControlKey(event.code)} já está em uso no Jogador ${n} (${conflict.label}).`;
        return;
      }
    }

    currentMap[waitingForControl.value] = event.code;
    waitingForControl.value = null;
    controlErrorMessage.value = "";
  }

  function restoreDefaultControls() {
    const defaults = {
      1:
        activeControlProfile.value === "psp"
          ? DEFAULT_PSP_CONTROL_BINDINGS
          : DEFAULT_CONTROL_BINDINGS,
      2: DEFAULT_P2_CONTROL_BINDINGS,
      3: DEFAULT_P3_CONTROL_BINDINGS,
      4: DEFAULT_P4_CONTROL_BINDINGS,
    };
    const key = `p${activePlayer.value}`;
    controlDraft.value[key] = { ...(defaults[activePlayer.value] || DEFAULT_CONTROL_BINDINGS) };
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
      if (activeControlProfile.value === "psp") {
        await savePspControlBindings(validated);
        pspControlBindings.value = cloneState(validated);
      } else {
        await saveControlBindings(validated);
        controlBindings.value = cloneState(validated);
      }
      controlDraft.value = cloneState(validated);
      controlSaveStatus.value = "Controles salvos.";
      controlErrorMessage.value = "";
    } catch (error) {
      controlErrorMessage.value = `Não foi possível salvar os controles: ${errorText(error)}`;
    }
  }

  function findActionByCode(code, format) {
    const bindings =
      format === "PSP" ? pspControlBindings.value : controlBindings.value;
    for (let n = 1; n <= 4; n++) {
      const map = bindings[`p${n}`];
      if (!map) continue;
      const action = CONTROL_ACTIONS.find(({ id }) => map[id] === code);
      if (action) return { button: action.id, player: n };
    }
    return null;
  }

  return {
    controlBindings,
    controlDraft,
    pspControlBindings,
    activeControlProfile,
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
