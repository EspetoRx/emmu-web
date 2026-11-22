<script setup>
import { ERROR_TOAST_DURATION_MS } from "../composables/useToast.js";

defineProps({
  toasts: {
    type: Array,
    default: () => [],
  },
});

const emit = defineEmits(["dismiss", "hover-change"]);
</script>

<template>
  <div v-if="toasts.length" class="error-toast-stack">
    <div
      v-for="toast in toasts"
      :key="toast.id"
      class="error-toast"
      role="alert"
      aria-live="assertive"
      @mouseenter="emit('hover-change', toast.id, true)"
      @mouseleave="emit('hover-change', toast.id, false)"
    >
      <span class="error-toast-message">{{ toast.message }}</span>
      <button
        type="button"
        class="error-toast-close"
        aria-label="Fechar aviso"
        @click.stop="emit('dismiss', toast.id)"
      >
        ×
      </button>
      <div class="error-toast-progress" aria-hidden="true">
        <div
          class="error-toast-progress-fill"
          :class="{ 'is-paused': toast.paused }"
          :style="{ animationDuration: `${ERROR_TOAST_DURATION_MS}ms` }"
        />
      </div>
    </div>
  </div>
</template>
