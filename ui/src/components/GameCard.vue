<template>
  <article
    :class="['game-card', { selected: isSelected }]"
  >
    <button
      class="game-card-open"
      :aria-label="ariaLabel"
      @click="emit('click', game)"
      @dblclick="emit('dblclick', game)"
      @keydown.enter.prevent="emit('dblclick', game)"
    >
      <div
        class="cover-art"
        :class="{ 'has-preview': Boolean(game.previewUrl) }"
        :style="{ '--cover-hue': game.hue }"
        aria-hidden="true"
      >
        <img v-if="game.previewUrl" class="cover-preview" :src="game.previewUrl" alt="" />
        <template v-else>
          <div class="cover-sun"></div>
          <div class="cover-mountain mountain-back"></div>
          <div class="cover-mountain mountain-front"></div>
          <span class="cover-format">{{ game.format }}</span>
          <span class="cover-title">{{ game.name }}</span>
          <span class="cover-brand">EMMU COLLECTION</span>
        </template>
      </div>
      <span class="game-name">{{ game.name }}</span>
      <span class="game-meta">{{ game.format }} <span>·</span> {{ formatSize(game.size) }}</span>
      <span class="card-hint">{{ hint }}</span>
    </button>

    <div class="game-card-actions">
      <span class="game-card-status" :class="{ unavailable: game.romUnavailable }">
        {{ statusText }}
      </span>
      <div class="game-card-action-buttons">
        <button
          class="game-card-action-button"
          :aria-label="`Histórico de saves de ${game.name} (${game.saveHistory?.length ?? 0})`"
          :title="`Histórico de saves (${game.saveHistory?.length ?? 0})`"
          @click.stop="emit('history', game)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" />
            <path d="M3 3v5h5m4-1v5l3 2" />
          </svg>
        </button>
        <button
          v-if="game.state"
          class="game-card-action-button continue"
          :aria-label="`Continuar ${game.name}`"
          title="Continuar"
          @click.stop="emit('continue', game)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m8 5 12 7-12 7z" />
          </svg>
        </button>
        <button
          class="game-card-action-button delete"
          :aria-label="`Excluir ${game.name}`"
          title="Excluir"
          @click.stop="emit('delete', game)"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16m-10 4v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" />
          </svg>
        </button>
      </div>
    </div>
  </article>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps(["game", "isSelected", "isMobile", "hasState"]);
const emit = defineEmits(["click", "dblclick", "continue", "history", "delete"]);

const hint = computed(() => {
  if (props.game.romUnavailable) return "ROM indisponível · reimporte o arquivo";
  if (props.game.state) return "Continuar estado salvo";
  if (props.isMobile) return "Toque para abrir";
  return "Dois cliques para abrir";
});

const statusText = computed(() => {
  if (props.game.romUnavailable) return "ROM indisponível";
  if (props.game.state) {
    if (props.game.stateSavedAt) {
      const time = new Intl.DateTimeFormat("pt-BR", {
        hour: "2-digit",
        minute: "2-digit",
      }).format(new Date(props.game.stateSavedAt));
      return `Estado salvo às ${time}.`;
    }
    return "Estado salvo.";
  }
  return "Sem estado salvo";
});

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const ariaLabel = computed(() => {
  const formatText = props.game.romUnavailable
    ? "ROM indisponível. Reimporte o arquivo."
    : props.game.state
      ? "Continuar estado salvo."
      : props.isMobile
        ? "Toque para abrir."
        : "Dê dois cliques para abrir.";
  return `${props.game.name}, ${props.game.format}. ${formatText}`;
});
</script>