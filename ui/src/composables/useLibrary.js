import { computed, ref, watch } from "vue";
import {
  clearLibraryGames,
  deleteLibraryGame,
  loadLibraryGames,
  saveLibraryGame,
} from "../stores/libraryStore.js";

const LIBRARY_FILTERS_STORAGE_KEY = "emmu.library.filters";

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

export function normalizeSearchText(value) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("pt-BR");
}

function coverHue(name) {
  let hash = 0;
  for (const character of name) {
    hash = (hash * 31 + character.charCodeAt(0)) % 360;
  }
  return hash;
}

export function useLibrary({ onError, onClearError, onRomRecovered } = {}) {
  const games = ref([]);
  const selectedGameId = ref(null);
  const librarySearch = ref("");
  const libraryFormat = ref("all");
  const librarySort = ref("recent");
  const libraryGroup = ref("none");
  const awaitingRomRecovery = ref(null);
  const deletePrompt = ref(null);
  const clearLibraryPrompt = ref(false);
  const isDeletingGame = ref(false);
  const isClearingLibrary = ref(false);

  const filteredGames = computed(() => {
    const query = normalizeSearchText(librarySearch.value.trim());

    return games.value
      .filter((game) => {
        const matchesSearch =
          !query ||
          [game.name, game.fileName, game.format].some((value) =>
            normalizeSearchText(value ?? "").includes(query),
          );
        const matchesFormat =
          libraryFormat.value === "all" ||
          (libraryFormat.value === "nes"
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

        switch (librarySort.value) {
          case "name-asc":
            return nameOrder;
          case "name-desc":
            return -nameOrder;
          case "size-asc":
            return (first.size ?? 0) - (second.size ?? 0) || nameOrder;
          case "size-desc":
            return (second.size ?? 0) - (first.size ?? 0) || nameOrder;
          case "format":
            return (
              first.format.localeCompare(second.format, "pt-BR") || nameOrder
            );
          case "oldest":
            return (first.addedAt ?? 0) - (second.addedAt ?? 0) || nameOrder;
          case "saved":
            return (
              Number(Boolean(second.state || second.saveHistory?.length)) -
                Number(Boolean(first.state || first.saveHistory?.length)) ||
              addedAtOrder
            );
          default:
            return addedAtOrder || nameOrder;
        }
      });
  });

  const groupedGames = computed(() => {
    if (libraryGroup.value === "none") {
      return [{ key: "all", label: "", games: filteredGames.value }];
    }

    const groups = new Map();
    for (const game of filteredGames.value) {
      let key;
      let label;
      switch (libraryGroup.value) {
        case "similar-titles": {
          const title = game.name.replace(/\([^)]*\)|\[[^\]]*\]/g, "").trim();
          const words = normalizeSearchText(title)
            .replace(/[.,:;!?'"`-]/g, "")
            .split(/\s+/)
            .filter(Boolean);
          if (words.length > 1 && /^\d+$/.test(words[words.length - 1])) {
            words.pop();
          }
          const titleKey =
            words.slice(0, 2).join(" ") ||
            normalizeSearchText(title) ||
            `untitled:${game.id}`;
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

  const activeLibraryFilterCount = computed(
    () =>
      Number(Boolean(librarySearch.value.trim())) +
      Number(libraryFormat.value !== "all") +
      Number(librarySort.value !== "recent") +
      Number(libraryGroup.value !== "none"),
  );

  function loadLibraryFilters() {
    try {
      const raw = window.localStorage.getItem(LIBRARY_FILTERS_STORAGE_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw);
      if (typeof saved.search === "string") librarySearch.value = saved.search;
      if (["all", "nes", "snes"].includes(saved.format))
        libraryFormat.value = saved.format;
      if (
        [
          "recent",
          "oldest",
          "name-asc",
          "name-desc",
          "size-asc",
          "size-desc",
          "format",
          "saved",
        ].includes(saved.sort)
      ) {
        librarySort.value = saved.sort;
      }
      if (
        ["none", "similar-titles", "console", "format", "save"].includes(
          saved.group,
        )
      ) {
        libraryGroup.value = saved.group;
      }
    } catch {}
  }

  function saveLibraryFilters() {
    try {
      window.localStorage.setItem(
        LIBRARY_FILTERS_STORAGE_KEY,
        JSON.stringify({
          search: librarySearch.value,
          format: libraryFormat.value,
          sort: librarySort.value,
          group: libraryGroup.value,
        }),
      );
    } catch {}
  }

  watch(
    [librarySearch, libraryFormat, librarySort, libraryGroup],
    () => {
      saveLibraryFilters();
    },
    { deep: false },
  );

  function clearLibraryFilters() {
    librarySearch.value = "";
    libraryFormat.value = "all";
    librarySort.value = "recent";
    libraryGroup.value = "none";
  }

  async function restoreLibrary() {
    try {
      const records = await loadLibraryGames();
      games.value = records.map((game) => ({
        ...game,
        previewUrl: game.preview ? URL.createObjectURL(game.preview) : null,
      }));
    } catch (error) {
      onError?.(`Não foi possível carregar a biblioteca: ${errorText(error)}`);
    }
  }

  async function addRomFile(file) {
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!["nes", "sfc", "smc", "fig"].includes(extension)) {
      throw new Error(
        "Formato não suportado. Selecione arquivos .nes, .sfc, .smc ou .fig.",
      );
    }

    const contents = await file.arrayBuffer();
    const digest = await crypto.subtle.digest("SHA-256", contents);
    const id = Array.from(new Uint8Array(digest), (byte) =>
      byte.toString(16).padStart(2, "0"),
    ).join("");
    const rom = new Blob([contents], { type: "application/octet-stream" });
    const existingGame = games.value.find((game) => game.id === id);

    if (existingGame) {
      const updatedGame = {
        ...existingGame,
        fileName: file.name,
        format: extension.toUpperCase(),
        size: file.size,
        rom,
        romUnavailable: false,
        launchBlocked: false,
      };
      await saveLibraryGame(updatedGame);
      Object.assign(existingGame, updatedGame);
      selectedGameId.value = existingGame.id;

      if (awaitingRomRecovery.value?.id === existingGame.id) {
        awaitingRomRecovery.value = null;
        await onRomRecovered?.(existingGame);
      }
      return;
    }

    const name = file.name.replace(/\.[^.]+$/, "");
    const game = {
      id,
      name,
      fileName: file.name,
      size: file.size,
      format: extension.toUpperCase(),
      rom,
      preview: null,
      previewUrl: null,
      state: null,
      romUnavailable: false,
      hue: coverHue(name),
      addedAt: Date.now(),
    };
    await saveLibraryGame(game);
    games.value.unshift(game);
    selectedGameId.value = game.id;
  }

  async function importRomFiles(files) {
    if (!files.length) return;
    const failures = [];
    for (const file of files) {
      try {
        await addRomFile(file);
      } catch (error) {
        failures.push(`${file.name}: ${errorText(error)}`);
      }
    }

    if (failures.length) {
      const message =
        failures.length === 1
          ? `Não foi possível importar: ${failures[0]}`
          : `Alguns arquivos não puderam ser importados: ${failures.join(" · ")}`;
      onError?.(message);
    } else {
      onClearError?.();
    }
  }

  function requestDeleteGame(game) {
    deletePrompt.value = game;
  }

  function requestClearLibrary() {
    clearLibraryPrompt.value = true;
  }

  async function confirmClearLibrary() {
    if (isClearingLibrary.value) return;
    isClearingLibrary.value = true;
    try {
      await clearLibraryGames();
      for (const game of games.value) {
        if (game.previewUrl) URL.revokeObjectURL(game.previewUrl);
      }
      games.value = [];
      selectedGameId.value = null;
      clearLibraryPrompt.value = false;
    } catch (error) {
      clearLibraryPrompt.value = false;
      onError?.(`Não foi possível limpar a biblioteca: ${errorText(error)}`);
    } finally {
      isClearingLibrary.value = false;
    }
  }

  async function confirmDeleteGame() {
    const game = deletePrompt.value;
    if (!game || isDeletingGame.value) return;
    isDeletingGame.value = true;
    try {
      await deleteLibraryGame(game.id);
      games.value = games.value.filter((candidate) => candidate.id !== game.id);
      if (game.previewUrl) URL.revokeObjectURL(game.previewUrl);
      if (selectedGameId.value === game.id) selectedGameId.value = null;
      deletePrompt.value = null;
    } catch (error) {
      deletePrompt.value = null;
      onError?.(`Não foi possível excluir o jogo: ${errorText(error)}`);
    } finally {
      isDeletingGame.value = false;
    }
  }

  function revokeAllPreviews() {
    games.value.forEach((game) => {
      if (game.previewUrl) URL.revokeObjectURL(game.previewUrl);
    });
  }

  return {
    games,
    selectedGameId,
    librarySearch,
    libraryFormat,
    librarySort,
    libraryGroup,
    filteredGames,
    groupedGames,
    activeLibraryFilterCount,
    awaitingRomRecovery,
    deletePrompt,
    clearLibraryPrompt,
    isDeletingGame,
    isClearingLibrary,
    loadLibraryFilters,
    clearLibraryFilters,
    restoreLibrary,
    importRomFiles,
    requestDeleteGame,
    requestClearLibrary,
    confirmClearLibrary,
    confirmDeleteGame,
    revokeAllPreviews,
  };
}
