<script setup>
defineProps({
  game: {
    type: Object,
    required: true,
  },
  selected: {
    type: Boolean,
    default: false,
  },
  isMobileDevice: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits([
  "select",
  "open",
  "continue",
  "open-history",
  "delete",
]);

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatSavedTime(timestamp) {
  if (!timestamp) return "";
  return new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(timestamp));
}
</script>

<template>
  <article class="game-card" :class="{ selected }">
    <button class="game-card-open"
      :aria-label="`${game.name}, ${game.format}. ${game.romUnavailable ? 'ROM indisponível. Reimporte o arquivo.' : game.state ? 'Continuar estado salvo.' : isMobileDevice ? 'Toque para abrir.' : 'Dê dois cliques para abrir.'}`"
      @click="emit('select', game)" @dblclick="emit('open', game)" @keydown.enter.prevent="emit('open', game)">
      <div class="cover-art" :class="{ 'has-preview': Boolean(game.previewUrl) }" :style="{ '--cover-hue': game.hue }"
        aria-hidden="true">
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
      <span class="game-meta">
        {{ game.format }} <span>·</span> {{ formatSize(game.size) }}
      </span>
      <span class="card-hint">
        {{
          game.romUnavailable
            ? "ROM indisponível · reimporte o arquivo"
            : game.state
              ? "Continuar estado salvo"
              : isMobileDevice
                ? "Toque para abrir"
                : "Dois cliques para abrir"
        }}
      </span>
    </button>
    <div class="game-card-actions">
      <span class="game-card-status" :class="{ unavailable: game.romUnavailable }">
        {{
          game.romUnavailable
            ? "ROM indisponível"
            : game.state
              ? `Estado salvo${game.stateSavedAt ? ` às ${formatSavedTime(game.stateSavedAt)}` : ""}`
              : "Sem estado salvo"
        }}
      </span>
      <div class="game-card-action-buttons">
        <button class="game-card-action-button"
          :aria-label="`Histórico de saves de ${game.name} (${game.saveHistory?.length ?? 0})`"
          :title="`Histórico de saves (${game.saveHistory?.length ?? 0})`" @click.stop="emit('open-history', game)">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" />
            <path d="M3 3v5h5m4-1v5l3 2" />
          </svg>
        </button>
        <button v-if="game.state" class="game-card-action-button continue" :aria-label="`Continuar ${game.name}`"
          title="Continuar" @click.stop="emit('continue', game)">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m8 5 12 7-12 7z" />
          </svg>
        </button>
        <button class="game-card-action-button delete" :aria-label="`Excluir ${game.name}`" title="Excluir"
          @click.stop="emit('delete', game)">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h16m-10 4v6m4-6v6M6 7l1 14h10l1-14M9 7V4h6v3" />
          </svg>
        </button>
      </div>
    </div>
  </article>
</template>
