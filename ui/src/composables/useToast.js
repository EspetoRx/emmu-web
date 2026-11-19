import { ref } from "vue";

const ERROR_TOAST_DURATION_MS = 3000;

export function useToast() {
  const errorToast = ref(null);
  let errorToastTimeoutId = 0;
  let errorToastExpiresAt = 0;
  let errorToastSequence = 0;

  function scheduleErrorToastExpiry(delay) {
    if (errorToastTimeoutId) clearTimeout(errorToastTimeoutId);
    errorToastTimeoutId = window.setTimeout(() => {
      errorToast.value = null;
      errorToastExpiresAt = 0;
      errorToastTimeoutId = 0;
    }, delay);
  }

  function showErrorToast(message, source) {
    errorToastExpiresAt = Date.now() + ERROR_TOAST_DURATION_MS;
    errorToast.value = { message, source, id: ++errorToastSequence };
    scheduleErrorToastExpiry(ERROR_TOAST_DURATION_MS);
  }

  function clearErrorToast(source) {
    if (source && errorToast.value?.source !== source) return;
    if (errorToastTimeoutId) clearTimeout(errorToastTimeoutId);
    errorToastTimeoutId = 0;
    errorToastExpiresAt = 0;
    errorToast.value = null;
  }

  function handleToastVisibilityChange() {
    if (document.visibilityState === "visible" && errorToast.value) {
      const remaining = errorToastExpiresAt - Date.now();
      if (remaining <= 0) clearErrorToast();
      else scheduleErrorToastExpiry(remaining);
    }
  }

  return {
    errorToast,
    showErrorToast,
    clearErrorToast,
    handleToastVisibilityChange,
  };
}
