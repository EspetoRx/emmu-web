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

  function handlePlayerKeydown(event) {
    if (
      event?.target instanceof HTMLElement &&
      event.target.closest(
        "button, input, select, textarea, [contenteditable='true']",
      )
    ) {
      return;
    }
    const match = findActionByCode?.(event?.code);
    if (!match || !activeGame?.value) return;
    event?.preventDefault?.();
    if (!event?.repeat) setButton?.(match.button, true, match.player);
  }

  function handlePlayerKeyup(event) {
    const match = findActionByCode?.(event?.code);
    if (match) setButton?.(match.button, false, match.player);
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
  }

  function unbindShortcutListeners() {
    window.removeEventListener("keydown", handleGlobalKeydown);
    window.removeEventListener("keyup", handlePlayerKeyup);
    nativeEventUnsubscribers.forEach((unsubscribe) => unsubscribe());
    nativeEventUnsubscribers = [];
  }

  return {
    registerNativeMenuEvents,
    bindShortcutListeners,
    unbindShortcutListeners,
  };
}
