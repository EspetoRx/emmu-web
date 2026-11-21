<script setup>
import { nextTick, onMounted, ref } from "vue";
import GameCard from "./GameCard.vue";

const props = defineProps({
  games: {
    type: Array,
    required: true,
  },
  filteredGames: {
    type: Array,
    required: true,
  },
  groupedGames: {
    type: Array,
    required: true,
  },
  libraryGroup: {
    type: String,
    required: true,
  },
  activeLibraryFilterCount: {
    type: Number,
    required: true,
  },
  selectedGameId: {
    type: String,
    default: null,
  },
  isMobileDevice: {
    type: Boolean,
    default: false,
  },
  openMenu: {
    type: String,
    default: null,
  },
  isActive: {
    type: Boolean,
    default: true,
  },
  savedScrollY: {
    type: Number,
    default: 0,
  },
});

const search = defineModel("search", { type: String, default: "" });
const format = defineModel("format", { type: String, default: "all" });
const sort = defineModel("sort", { type: String, default: "recent" });
const group = defineModel("group", { type: String, default: "none" });

const emit = defineEmits([
  "open-file-picker",
  "request-clear-library",
  "toggle-menu",
  "clear-filters",
  "select-game",
  "open-game",
  "continue-game",
  "open-history",
  "delete-game",
]);

const libraryRef = ref(null);

async function applySavedScroll() {
  if (typeof window === "undefined" || props.savedScrollY <= 0) return;
  await nextTick();
  await new Promise((resolve) => requestAnimationFrame(resolve));
  window.scrollTo({
    top: props.savedScrollY,
    left: 0,
    behavior: "instant",
  });
}

onMounted(() => {
  void applySavedScroll();
});
</script>

<template>
  <section ref="libraryRef" class="library-page">
    <div class="library-heading">
      <div>
        <p class="eyebrow">SUA COLEÇÃO</p>
        <h1>Biblioteca de jogos</h1>
        <p class="subtitle">Seus clássicos, reunidos em um só lugar.</p>
      </div>
      <div class="library-heading-actions">
        <button v-if="games.length" class="secondary-button clear-library-button"
          @click="emit('request-clear-library')">
          Limpar biblioteca
        </button>
        <button class="primary-button" @click="emit('open-file-picker')">
          <span class="plus-icon">＋</span>
          Abrir arquivos
        </button>
      </div>
    </div>

    <div v-if="games.length" class="library-toolbar">
      <div class="library-filter-wrapper">
        <button class="library-filter-toggle" :aria-expanded="openMenu === 'filters'"
          :aria-label="`Filtros da biblioteca (${activeLibraryFilterCount} ativos)`"
          @click="emit('toggle-menu', 'filters')">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h6m4 0h6M4 17h2m4 0h10" />
            <path d="M10 4v6M6 14v6" />
          </svg>
          <span>Filtros</span>
          <span v-if="activeLibraryFilterCount" class="filter-count">
            {{ activeLibraryFilterCount }}
          </span>
        </button>
        <div v-if="openMenu === 'filters'" class="library-filter-panel">
          <label for="library-search">Buscar por texto</label>
          <input id="library-search" v-model="search" type="search" placeholder="Nome, arquivo ou formato"
            autocomplete="off" />
          <label for="library-format">Console</label>
          <select id="library-format" v-model="format">
            <option value="all">Todos</option>
            <option value="nes">NES</option>
            <option value="snes">SNES (SFC/SMC)</option>
            <option value="gba">GBA</option>
            <option value="gb">GB (DMG)</option>
            <option value="gbc">GBC</option>
            <option value="gg">Game Gear</option>
            <option value="sms">Master System</option>
            <option value="ws">WonderSwan</option>
            <option value="pce">PC Engine</option>
          </select>
          <label for="library-sort">Organizar por</label>
          <select id="library-sort" v-model="sort">
            <option value="recent">Adicionados recentemente</option>
            <option value="oldest">Adicionados há mais tempo</option>
            <option value="name-asc">Nome: A a Z</option>
            <option value="name-desc">Nome: Z a A</option>
            <option value="size-asc">Tamanho: menor primeiro</option>
            <option value="size-desc">Tamanho: maior primeiro</option>
            <option value="format">Formato</option>
            <option value="saved">Com save primeiro</option>
          </select>
          <label for="library-group">Agrupar por</label>
          <select id="library-group" v-model="group">
            <option value="none">Sem agrupamento</option>
            <option value="similar-titles">Títulos parecidos</option>
            <option value="console">Console</option>
            <option value="format">Formato do arquivo</option>
            <option value="save">Estado do save</option>
          </select>
          <button v-if="activeLibraryFilterCount" class="clear-library-filters" @click="emit('clear-filters')">
            Limpar filtros
          </button>
        </div>
      </div>
      <span class="library-result-count" role="status">
        {{ filteredGames.length }} de {{ games.length }} jogos
      </span>
    </div>

    <div v-if="filteredGames.length" class="library-game-groups">
      <section v-for="groupSection in groupedGames" :key="groupSection.key" class="library-game-group">
        <h2 v-if="libraryGroup !== 'none'" class="library-group-heading">
          {{ groupSection.label }}
          <span>{{ groupSection.games.length }}</span>
        </h2>
        <div class="game-grid">
          <GameCard v-for="game in groupSection.games" :key="game.id" :game="game"
            :selected="selectedGameId === game.id" :is-mobile-device="isMobileDevice"
            @select="emit('select-game', $event)" @open="emit('open-game', $event)"
            @continue="emit('continue-game', $event)" @open-history="emit('open-history', $event)"
            @delete="emit('delete-game', $event)" />
        </div>
      </section>
    </div>

    <div v-else-if="games.length" class="empty-state filtered-empty-state">
      <h2>Nenhum jogo encontrado</h2>
      <p>Experimente outro texto ou ajuste os filtros.</p>
      <button class="secondary-button" @click="emit('clear-filters')">
        Limpar filtros
      </button>
    </div>

    <div v-else class="empty-state">
      <div class="empty-illustration" aria-hidden="true">
        <div class="empty-card card-back"></div>
        <div class="empty-card card-front">
          <span class="empty-plus">＋</span>
        </div>
      </div>
      <h2>Sua próxima aventura começa aqui</h2>
      <p>Abra arquivos de jogos para criar suas capas na biblioteca.</p>
      <button class="secondary-button" @click="emit('open-file-picker')">
        Escolher arquivos
      </button>
      <span class="supported-formats">Compatível com .nes, .sfc, .smc, .fig, .gba, .gb, .gbc, .gg, .sms, .ws, .wsc, .pce e ZIPs de ROM</span>
    </div>
  </section>
</template>
