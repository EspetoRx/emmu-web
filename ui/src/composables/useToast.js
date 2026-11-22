import { ref } from "vue";

export const ERROR_TOAST_DURATION_MS = 10000;

export function useToast() {
  const errorToasts = ref([]);
  let errorToastSequence = 0;
  // id -> { timeoutId, remaining, startedAt }
  const toastTimers = new Map();

  function findToast(id) {
    return errorToasts.value.find((toast) => toast.id === id);
  }

  function clearToastTimer(id) {
    const state = toastTimers.get(id);
    if (state?.timeoutId) {
      window.clearTimeout(state.timeoutId);
      state.timeoutId = 0;
    }
  }

  function dismissErrorToast(id) {
    clearToastTimer(id);
    toastTimers.delete(id);
    errorToasts.value = errorToasts.value.filter((toast) => toast.id !== id);
  }

  function scheduleToastExpiry(toast) {
    clearToastTimer(toast.id);
    if (toast.paused) return;
    const state = toastTimers.get(toast.id);
    if (!state) return;
    state.startedAt = Date.now();
    state.timeoutId = window.setTimeout(() => {
      dismissErrorToast(toast.id);
    }, state.remaining);
  }

  function showErrorToast(message, source) {
    // Autosave falha a cada 5s: sem dedupe isso enche a fila de avisos idênticos.
    const duplicate = errorToasts.value.find(
      (toast) => toast.message === message && toast.source === source,
    );
    if (duplicate) {
      const state = toastTimers.get(duplicate.id);
      if (state) {
        state.remaining = ERROR_TOAST_DURATION_MS;
        scheduleToastExpiry(duplicate);
      }
      return;
    }
    const id = ++errorToastSequence;
    const toast = {
      id,
      message,
      source,
      paused: false,
      hovered: false,
    };
    toastTimers.set(id, {
      timeoutId: 0,
      remaining: ERROR_TOAST_DURATION_MS,
      startedAt: Date.now(),
    });
    errorToasts.value = [...errorToasts.value, toast];
    scheduleToastExpiry(toast);
  }

  function pauseErrorToast(id) {
    const toast = findToast(id);
    const state = toastTimers.get(id);
    if (!toast || !state || toast.paused) return;
    state.remaining = Math.max(0, state.remaining - (Date.now() - state.startedAt));
    clearToastTimer(id);
    toast.paused = true;
  }

  function resumeErrorToast(id) {
    const toast = findToast(id);
    if (!toast || !toast.paused) return;
    if (toast.hovered || document.visibilityState === "hidden") return;
    toast.paused = false;
    scheduleToastExpiry(toast);
  }

  function setToastHovered(id, hovered) {
    const toast = findToast(id);
    if (!toast) return;
    toast.hovered = hovered;
    if (hovered) pauseErrorToast(id);
    else resumeErrorToast(id);
  }

  function clearErrorToast(source) {
    const targets = source
      ? errorToasts.value.filter((toast) => toast.source === source)
      : [...errorToasts.value];
    for (const toast of targets) dismissErrorToast(toast.id);
  }

  function handleToastVisibilityChange() {
    if (document.visibilityState === "hidden") {
      for (const toast of [...errorToasts.value]) pauseErrorToast(toast.id);
      return;
    }
    for (const toast of [...errorToasts.value]) resumeErrorToast(toast.id);
  }

  return {
    errorToasts,
    showErrorToast,
    clearErrorToast,
    dismissErrorToast,
    pauseErrorToast,
    resumeErrorToast,
    setToastHovered,
    handleToastVisibilityChange,
  };
}
