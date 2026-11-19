<script setup>
const props = defineProps({
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

function handleSelect() {
  if (props.game.launchBlocked) return;
  emit("select", props.game);
}

function handleOpen() {
  if (props.game.launchBlocked) return;
  emit("open", props.game);
}

function handleContinue() {
  if (props.game.launchBlocked) return;
  emit("continue", props.game);
}

function handleOpenHistory() {
  if (props.game.launchBlocked) return;
  emit("open-history", props.game);
}
</script>

<template>
  <article
    class="game-card"
    :class="{ selected: selected && !game.launchBlocked, 'is-blocked': game.launchBlocked }"
  >
    <button
      class="game-card-open"
      type="button"
      :disabled="game.launchBlocked"
      :aria-disabled="game.launchBlocked ? 'true' : undefined"
      :aria-label="
        game.launchBlocked
          ? `${game.name}, ${game.format}. Não foi possível iniciar a emulação.`
          : `${game.name}, ${game.format}. ${game.romUnavailable ? 'ROM indisponível. Reimporte o arquivo.' : game.state ? 'Continuar estado salvo.' : isMobileDevice ? 'Toque para abrir.' : 'Dê dois cliques para abrir.'}`
      "
      @click="handleSelect"
      @dblclick="handleOpen"
      @keydown.enter.prevent="handleOpen"
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
      <span class="game-meta">
        {{ game.format }} <span>·</span> {{ formatSize(game.size) }}
      </span>
      <span class="card-hint">
        {{
          game.launchBlocked
            ? "Falha ao iniciar emulação"
            : game.romUnavailable
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
      <span class="game-card-status" :class="{ unavailable: game.romUnavailable || game.launchBlocked }">
        {{
          game.launchBlocked
            ? "Não executável"
            : game.romUnavailable
              ? "ROM indisponível"
              : game.state
                ? `Estado salvo${game.stateSavedAt ? ` às ${formatSavedTime(game.stateSavedAt)}` : ""}`
                : "Sem estado salvo"
        }}
      </span>

      <div class="game-card-action-buttons">
        <button
          v-if="!game.launchBlocked"
          class="game-card-action-button"
          type="button"
          :aria-label="`Histórico de saves de ${game.name} (${game.saveHistory?.length ?? 0})`"
          :title="`Histórico de saves (${game.saveHistory?.length ?? 0})`"
          @click.stop="handleOpenHistory"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M3 12a9 9 0 1 0 2.64-6.36L3 8" />
            <path d="M3 3v5h5m4-1v5l3 2" />
          </svg>
        </button>

        <button
          v-if="!game.launchBlocked && game.state"
          class="game-card-action-button continue"
          type="button"
          :aria-label="`Continuar ${game.name}`"
          title="Continuar"
          @click.stop="handleContinue"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="m8 5 12 7-12 7z" />
          </svg>
        </button>

        <button
          class="game-card-action-button delete"
          type="button"
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
