import { CONTROL_ACTIONS } from "./useControls.js";

// Fallback para ambientes que disparam eventos de teclado sem `code`
// (por exemplo, browsers embutidos). Nesses casos o `key` ainda é confiável.
const FALLBACK_KEY_ACTIONS = {
  ArrowUp: "Up",
  ArrowDown: "Down",
  ArrowLeft: "Left",
  ArrowRight: "Right",
  Enter: "Start",
  Shift: "Select",
  x: "A",
  z: "B",
  s: "X",
  a: "Y",
  q: "L",
  w: "R",
};

export function useShortcuts({
  isNativeDesktop,
  showControls,
  waitingForControl,
  captureControlKey,
  closeControls,
  findActionByCode,
  activeGame,
  setButton,
  openFilePicker,
  returnToLibrary,
  generateThumbnails,
  openControls,
  onClosePopovers,
  onShowHelp,
  onRegisterError,
}) {
  let nativeEventUnsubscribers = [];

  function resolveAction(event) {
    const match = findActionByCode?.(event?.code);
    if (match) return match;
    // Não substitui um `code` válido que apenas não está associado a um botão.
    if (event?.code) return null;
    const key = typeof event?.key === "string" ? event.key : "";
    const button =
      FALLBACK_KEY_ACTIONS[key] ?? FALLBACK_KEY_ACTIONS[key.toLowerCase()];
    return button ? { button, player: 1 } : null;
  }

  function handlePlayerKeydown(event) {
    if (
      event?.target instanceof HTMLElement &&
      event.target.closest("input, select, textarea, [contenteditable='true']")
    ) {
      return;
    }
    const match = resolveAction(event);
    if (!match || !activeGame?.value) return;
    event?.preventDefault?.();
    if (!event?.repeat) setButton?.(match.button, true, match.player);
  }

  function handlePlayerKeyup(event) {
    const match = resolveAction(event);
    if (match) setButton?.(match.button, false, match.player);
  }

  // Se a janela perder o foco enquanto uma tecla está pressionada, o keyup não
  // chega e o botão fica preso no core (o jogo acaba "correndo" sozinho).
  function releaseAllButtons() {
    for (const { id } of CONTROL_ACTIONS) {
      setButton?.(id, false, 1);
      setButton?.(id, false, 2);
    }
  }

  function handleGlobalKeydown(event) {
    if (showControls?.value) {
      if (waitingForControl?.value) {
        captureControlKey?.(event);
      } else if (event?.code === "Escape") {
        event?.preventDefault?.();
        closeControls?.();
      }
      return;
    }

    handlePlayerKeydown(event);

    const key = typeof event?.key === "string" ? event.key : "";

    if ((event?.metaKey || event?.ctrlKey) && key.toLowerCase() === "o") {
      event?.preventDefault?.();
      openFilePicker?.();
    } else if ((event?.metaKey || event?.ctrlKey) && key === "1") {
      event?.preventDefault?.();
      void returnToLibrary?.();
    } else if (event?.metaKey && (key === "T" || key === "t")) {
      event?.preventDefault?.();
      void generateThumbnails?.();
    } else if (key === "Escape") {
      onClosePopovers?.();
    }
  }

  async function registerNativeMenuEvents() {
    if (!isNativeDesktop) return;

    try {
      const { listen } = await import("@tauri-apps/api/event");
      nativeEventUnsubscribers = await Promise.all([
        listen("open-rom-request", () => openFilePicker?.()),
        listen("return-to-library", () => void returnToLibrary?.()),
        listen("configure-controls", () => openControls?.(1)),
        listen("show-help", () => onShowHelp?.()),
      ]);
    } catch {
      onRegisterError?.("Não foi possível ativar os menus da janela.");
    }
  }

  function bindShortcutListeners() {
    window.addEventListener("keydown", handleGlobalKeydown);
    window.addEventListener("keyup", handlePlayerKeyup);
    window.addEventListener("blur", releaseAllButtons);
  }

  function unbindShortcutListeners() {
    window.removeEventListener("keydown", handleGlobalKeydown);
    window.removeEventListener("keyup", handlePlayerKeyup);
    window.removeEventListener("blur", releaseAllButtons);
    nativeEventUnsubscribers.forEach((unsubscribe) => unsubscribe());
    nativeEventUnsubscribers = [];
  }

  return {
    registerNativeMenuEvents,
    bindShortcutListeners,
    unbindShortcutListeners,
  };
}
