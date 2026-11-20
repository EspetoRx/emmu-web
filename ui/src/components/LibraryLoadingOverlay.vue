<script setup>
import { computed } from "vue";

const props = defineProps({
  open: { type: Boolean, default: false },
  label: { type: String, default: "Carregando biblioteca" },
  current: { type: Number, default: 0 },
  total: { type: Number, default: 0 },
});

const percent = computed(() => {
  if (!props.total) return 0;
  return Math.min(
    100,
    Math.max(0, Math.round((props.current / props.total) * 100)),
  );
});

const detail = computed(() => {
  if (!props.total) return "Preparando os jogos...";
  const unity = props.total === 1 ? "jogo" : "jogos";
  return `${props.current} de ${props.total} ${unity}`;
});
</script>

<template>
  <div v-if="open" class="modal-backdrop loading-backdrop">
    <section class="loading-dialog library-loading-dialog" role="status"
      aria-live="polite" :aria-label="label">
      <div class="loading-spinner" aria-hidden="true"></div>
      <p class="eyebrow">Emmu</p>
      <h2 id="library-loading-title">{{ label }}</h2>
      <p class="library-loading-detail">{{ detail }}</p>
      <div class="library-progress" role="progressbar" :aria-valuenow="percent"
        aria-valuemin="0" aria-valuemax="100" :aria-label="`Progresso: ${percent}%`">
        <div class="library-progress-fill" :style="{ width: `${percent}%` }"></div>
      </div>
      <p class="library-loading-percent">{{ percent }}%</p>
    </section>
  </div>
</template>
