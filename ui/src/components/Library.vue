<template>
  <section ref="libraryRef" v-if="!activeGame" class="library-page">
    <div class="library-heading">
      <div>
        <p class="eyebrow">SUA COLEÇÃO</p>
        <h1>Biblioteca de jogos</h1>
        <p class="subtitle">Seus clássicos, reunidos em um só lugar.</p>
      </div>
      <div class="library-heading-actions">
        <button
          v-if="games.length"
          class="secondary-button clear-library-button"
          @click="emit('clear-library')"
        >
          Limpar biblioteca
        </button>
        <button class="primary-button" @click="emit('add-rom')">
          <span class="plus-icon">＋</span>
          Abrir arquivos
        </button>
      </div>
    </div>

    <div v-if="games.length" class="library-toolbar">
      <div class="library-filter-wrapper">
        <button
          class="library-filter-toggle"
          :aria-expanded="openMenu === 'filters'"
          :aria-label="`Filtros da biblioteca (${activeFilterCount} ativos)`"
          @click="toggleMenu('filters')"
        >
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <path d="M4 7h6m4 0h6M4 17h2m4 0h10" />
            <path d="M10 4v6M6 14v6" />
          </svg>
          <span>Filtros</span>
          <span v-if="activeFilterCount" class="filter-count">{{ activeFilterCount }}</span>
        </button>
        <div v-if="openMenu === 'filters'" class="library-filter-panel">
          <label for="library-search">Buscar por texto</label>
          <input
            id="library-search"
            v-model="librarySearch"
            type="search"
            placeholder="Nome, arquivo ou formato"
            autocomplete="off"
          />
          <label for="library-format">Console</label>
          <select id="library-format" v-model="libraryFormat">
            <option value="all">Todos</option>
            <option value="nes">NES</option>
            <option value="snes">SNES (SFC/SMC)</option>
          </select>
          <label for="library-sort">Organizar por</label>
          <select id="library-sort" v-model="librarySort">
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
          <select id="library-group" v-model="libraryGroup">
            <option value="none">Sem agrupamento</option>
            <option value="similar-titles">Títulos parecidos</option>
            <option value="console">Console</option>
            <option value="format">Formato do arquivo</option>
            <option value="save">Estado do save</option>
          </select>
          <button
            v-if="activeFilterCount"
            class="clear-library-filters"
            @click="clearFilters"
          >
            Limpar filtros
          </button>
        </div>
      </div>
      <span class="library-result-count" role="status">
        {{ filteredGames.length }} de {{ games.length }} jogos
      </span>
    </div>

    <div v-if="filteredGames.length" class="library-game-groups">
      <section
        v-for="group in groupedGames"
        :key="group.key"
        class="library-game-group"
      >
        <h2 v-if="libraryGroup !== 'none'" class="library-group-heading">
          {{ group.label }}
          <span>{{ group.games.length }}</span>
        </h2>
        <div class="game-grid">
          <GameCard
            v-for="game in group.games"
            :key="game.id"
            :game="game"
            :is-selected="selectedGameId === game.id"
            :is-mobile="isMobile"
            :has-state="Boolean(game.state)"
            @dblclick="emit('dblclick', game)"
            @continue="emit('continue', game)"
            @history="emit('history', game)"
            @delete="emit('delete', game)"
          />
        </div>
      </section>
    </div>

    <div v-else-if="games.length" class="empty-state filtered-empty-state">
      <h2>Nenhum jogo encontrado</h2>
      <p>Experimente outro texto ou ajuste os filtros.</p>
      <button class="secondary-button" @click="clearFilters">Limpar filtros</button>
    </div>

    <div v-else class="empty-state">
      <div class="empty-illustration" aria-hidden="true">
        <div class="empty-card card-back"></div>
        <div class="empty-card card-front"><span class="empty-plus">＋</span></div>
      </div>
      <h2>Sua próxima aventura começa aqui</h2>
      <p>Abra arquivos de jogos para criar suas capas na biblioteca.</p>
      <button class="secondary-button" @click="emit('add-rom')">Escolher arquivos</button>
      <span class="supported-formats">Compatível com .nes, .sfc, .smc e .fig</span>
    </div>
  </section>
</template>

<script setup>
import { computed, nextTick, ref, watch, onMounted } from "vue";
import GameCard from "./GameCard.vue";

const props = defineProps([
  "games",
  "librarySearch",
  "libraryFormat",
  "librarySort",
  "libraryGroup",
  "selectedGameId",
  "isMobile",
  "activeGame",
]);
const emit = defineEmits([
  "update:librarySearch",
  "update:libraryFormat",
  "update:librarySort",
  "update:libraryGroup",
  "dblclick",
  "continue",
  "history",
  "delete",
  "add-rom",
  "clear-library",
]);

const libraryRef = ref(null);
const openMenu = ref(null);

const LIBRARY_FILTERS_STORAGE_KEY = "emmu.library.filters";

const normalizeSearchText = (value) => {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-Br");
};

const formatSize = (bytes) => {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

const coverHue = (name) => {
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.charCodeAt(0)) % 360;
  }
  return hash;
};

const filteredGames = computed(() => {
  const query = normalizeSearchText(props.librarySearch.trim());
  return props.games
    .filter((game) => {
      const matchesSearch =
        !query ||
        [game.name, game.fileName, game.format].some((value) =>
          normalizeSearchText(value ?? "").includes(query),
        );
      const matchesFormat =
        props.libraryFormat === "all" ||
        (props.libraryFormat === "nes"
          ? game.format === "NES"
          : ["SFC", "SMC", "SNES"].includes(game.format));
      return matchesSearch && matchesFormat;
    })
    .sort((first, second) => {
      const nameOrder = first.name.localeCompare(second.name, "pt-BR", {
        numeric: true,
        sensitivity: "base",
      });
      const addedAtOrder = (second.addedAt ?? 0) - (first.addedAt ?? 0);
      switch (props.librarySort) {
        case "name-asc": return nameOrder;
        case "name-desc": return -nameOrder;
        case "size-asc": return (first.size ?? 0) - (second.size ?? 0) || nameOrder;
        case "size-desc": return (second.size ?? 0) - (first.size ?? 0) || nameOrder;
        case "format": return first.format.localeCompare(second.format, "pt-BR") || nameOrder;
        case "oldest": return (first.addedAt ?? 0) - (second.addedAt ?? 0) || nameOrder;
        case "saved":
          return (
            Number(Boolean(second.state || second.saveHistory?.length)) -
            Number(Boolean(first.state || first.saveHistory?.length)) ||
            addedAtOrder
          );
        default: return addedAtOrder || nameOrder;
      }
    });
});

const groupedGames = computed(() => {
  if (props.libraryGroup === "none") {
    return [{ key: "all", label: "", games: filteredGames.value }];
  }
  const groups = new Map();
  for (const game of filteredGames.value) {
    let key, label;
    switch (props.libraryGroup) {
      case "similar-titles": {
        const title = game.name.replace(/\([^)]*\)|\[[^\]]*\]/g, "").trim();
        const words = normalizeSearchText(title)
          .replace(/[.,:;!?'"`-]/g, "")
          .split(/\s+/)
          .filter(Boolean);
        if (words.length > 1 && /^\d+$/.test(words[words.length - 1])) words.pop();
        const titleKey =
          words.slice(0, 2).join(" ") || normalizeSearchText(title) || `untitled:${game.id}`;
        const labelWords = title.split(/\s+/).filter(Boolean).slice(0, 2);
        key = `title:${titleKey}`;
        label = `${labelWords.join(" ") || "Outros"}${words.length > 2 ? "…" : ""}`;
        break;
      }
      case "console":
        key = game.format === "NES" ? "NES" : "SNES";
        label = key;
        break;
      case "format":
        key = game.format || "other";
        label = game.format || "Outro formato";
        break;
      case "save": {
        const hasSave = Boolean(game.state || game.saveHistory?.length);
        key = hasSave ? "saved" : "no-save";
        label = hasSave ? "Com estado salvo" : "Sem estado salvo";
        break;
      }
    }
    if (!groups.has(key)) groups.set(key, { key, label, games: [] });
    groups.get(key).games.push(game);
  }
  return [...groups.values()];
});

const activeFilterCount = computed(
  () =>
    Number(Boolean(props.librarySearch.trim())) +
    Number(props.libraryFormat !== "all") +
    Number(props.librarySort !== "recent") +
    Number(props.libraryGroup !== "none"),
);

const toggleMenu = (menu) => {
  openMenu.value = openMenu.value === menu ? null : menu;
};

const clearFilters = () => {
  emit("update:librarySearch", "");
  emit("update:libraryFormat", "all");
  emit("update:librarySort", "recent");
  emit("update:libraryGroup", "none");
};

const saveFilters = () => {
  try {
    window.localStorage.setItem(
      LIBRARY_FILTERS_STORAGE_KEY,
      JSON.stringify({
        search: props.librarySearch,
        format: props.libraryFormat,
        sort: props.librarySort,
        group: props.libraryGroup,
      }),
    );
  } catch (error) {
    console.error("Could not save library filters:", error);
  }
};

const loadFilters = () => {
  try {
    const raw = window.localStorage.getItem(LIBRARY_FILTERS_STORAGE_KEY);
    if (!raw) return;
    const saved = JSON.parse(raw);
    if (typeof saved.search === "string") emit("update:librarySearch", saved.search);
    if (["all", "nes", "snes"].includes(saved.format)) emit("update:libraryFormat", saved.format);
    if (
      ["recent", "oldest", "name-asc", "name-desc", "size-asc", "size-desc", "format", "saved"].includes(
        saved.sort,
      )
    ) {
      emit("update:librarySort", saved.sort);
    }
    if (["none", "similar-titles", "console", "format", "save"].includes(saved.group)) {
      emit("update:libraryGroup", saved.group);
    }
  } catch (error) {
    console.error("Could not load saved library filters:", error);
  }
};

watch(
  [props.librarySearch, props.libraryFormat, props.librarySort, props.libraryGroup],
  () => saveFilters(),
  { deep: false },
);

onMounted(() => loadFilters());

const libraryScrollPosition = ref({ y: 0, container: 0 });

function saveLibraryScrollPosition() {
  libraryScrollPosition.value = {
    y: window.scrollY,
    container: libraryRef.value ? libraryRef.value.scrollTop : 0,
  };
}

function restoreLibraryScrollPosition() {
  const { y, container } = libraryScrollPosition.value;
  if (libraryRef.value) {
    libraryRef.value.scrollTop = container;
  }
  window.scrollTo(0, y);
}

watch(
  () => props.activeGame,
  (newGame, oldGame) => {
    if (oldGame === null && newGame !== null) {
      saveLibraryScrollPosition();
    } else if (oldGame !== null && newGame === null) {
      nextTick(() => restoreLibraryScrollPosition());
    }
  },
);
</script>