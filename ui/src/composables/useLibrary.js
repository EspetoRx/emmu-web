import { computed, ref, watch } from "vue";
import { unzipSync } from "fflate";
import {
  clearLibraryGames,
  deleteLibraryGame,
  loadLibraryGames,
  saveLibraryGame,
} from "../stores/libraryStore.js";

const LIBRARY_FILTERS_STORAGE_KEY = "emmu.library.filters";
// Mesmo quando a leitura do IndexedDB é instantânea, mantém o progresso visível
// por tempo suficiente para o usuário perceber que a biblioteca foi carregada.
const MIN_LIBRARY_LOADING_MS = 450;

function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}

// `.wsc` (WonderSwan Color) usa o mesmo core e o mesmo formato lógico `.ws`.
function formatForExtension(extension) {
  if (extension === "wsc") return "WS";
  if (extension === "z64" || extension === "n64" || extension === "v64") return "N64";
  return extension.toUpperCase();
}

const SUPPORTED_ROM_EXTENSIONS = [
  "nes",
  "sfc",
  "smc",
  "fig",
  "gba",
  "gb",
  "gbc",
  "gg",
  "sms",
  "ws",
  "wsc",
  "pce",
  "z64",
  "n64",
  "v64",
];
const SUPPORTED_ROM_LABEL =
  ".nes, .sfc, .smc, .fig, .gba, .gb, .gbc, .gg, .sms, .ws, .wsc, .pce, .z64, .n64 e .v64";
// O limite evita ZIP bombs (nenhum cartucho portátil desta geração chega perto).
const MAX_EXTRACTED_ROM_BYTES = 8 * 1024 * 1024;

/**
 * Aceita ROMs soltas e arquivos .zip (o formato mais comum de distribuição de
 * ROMs). Cada entry de ROM portátil (`.gg`, `.sms`, `.ws`, `.wsc`) dentro do
 * ZIP vira um File independente, para que o restante do fluxo continue o mesmo.
 */
async function expandRomFile(file) {
  if (!file.name.toLowerCase().endsWith(".zip")) return [file];

  let entries;
  try {
    entries = unzipSync(new Uint8Array(await file.arrayBuffer()));
  } catch (error) {
    throw new Error(`ZIP inválido: ${errorText(error)}`);
  }

  const roms = Object.entries(entries)
    .filter(([path, bytes]) =>
      /\.(gg|sms|ws|wsc|z64|n64|v64)$/i.test(path) && bytes.length > 0,
    )
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR", { numeric: true }));

  if (!roms.length) {
    throw new Error(
      "nenhum arquivo .gg, .sms, .ws, .wsc, .z64, .n64 ou .v64 foi encontrado dentro do ZIP",
    );
  }

  return roms.map(([path, bytes]) => {
    const ext = (path.split(".").pop() || "").toLowerCase();
    const limit = ext === "z64" || ext === "n64" || ext === "v64"
      ? 64 * 1024 * 1024
      : MAX_EXTRACTED_ROM_BYTES;
    if (bytes.length > limit) {
      throw new Error(`ROM ${path} é grande demais para importar`);
    }
    const name = path.split(/[\\/]/).pop() || "rom.bin";
    return new File([bytes], name, { type: "application/octet-stream" });
  });
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
  const isLibraryLoading = ref(false);
  const libraryLoadingLabel = ref("");
  const libraryLoadingProgress = ref({ current: 0, total: 0 });
  let libraryLoadingRequests = 0;
  let libraryLoadingStartedAt = 0;
  let libraryLoadingTimer = null;

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
            : libraryFormat.value === "gba"
              ? game.format === "GBA"
              : libraryFormat.value === "gb"
                ? game.format === "GB"
                : libraryFormat.value === "gbc"
                  ? game.format === "GBC"
                  : libraryFormat.value === "gg"
                    ? game.format === "GG"
                    : libraryFormat.value === "sms"
                      ? game.format === "SMS"
                      : libraryFormat.value === "ws"
                        ? game.format === "WS"
                        : libraryFormat.value === "pce"
                          ? game.format === "PCE"
                          : libraryFormat.value === "n64"
                            ? game.format === "N64"
                            : ["SFC", "SMC", "SNES", "FIG"].includes(game.format));
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
          key =
            game.format === "NES"
              ? "NES"
              : game.format === "GBA"
                ? "GBA"
                : game.format === "GB" || game.format === "GBC"
                  ? game.format
                  : game.format === "PCE"
                    ? "PCE"
                    : game.format === "GG"
                      ? "GG"
                      : game.format === "SMS"
                        ? "SMS"
                        : game.format === "WS"
                          ? "WS"
                          : game.format === "N64"
                            ? "N64"
                            : "SNES";
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
      if (
        ["all", "nes", "snes", "gba", "gb", "gbc", "gg", "sms", "ws", "pce", "n64"].includes(
          saved.format,
        )
      )
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

  function beginLibraryLoading(label) {
    if (libraryLoadingTimer) {
      clearTimeout(libraryLoadingTimer);
      libraryLoadingTimer = null;
    }
    libraryLoadingRequests += 1;
    libraryLoadingStartedAt = performance.now();
    libraryLoadingLabel.value = label;
    libraryLoadingProgress.value = { current: 0, total: 0 };
    isLibraryLoading.value = true;
  }

  function endLibraryLoading() {
    libraryLoadingRequests = Math.max(0, libraryLoadingRequests - 1);
    if (libraryLoadingRequests > 0) return;
    const remaining = Math.max(
      0,
      MIN_LIBRARY_LOADING_MS - (performance.now() - libraryLoadingStartedAt),
    );
    libraryLoadingTimer = setTimeout(() => {
      libraryLoadingTimer = null;
      isLibraryLoading.value = false;
      libraryLoadingLabel.value = "";
      libraryLoadingProgress.value = { current: 0, total: 0 };
    }, remaining);
  }

  async function restoreLibrary() {
    beginLibraryLoading("Carregando biblioteca");
    try {
      const records = await loadLibraryGames((current, total) => {
        libraryLoadingProgress.value = { current, total };
      });
      games.value = records.map((game) => ({
        ...game,
        previewUrl: game.preview ? URL.createObjectURL(game.preview) : null,
      }));
    } catch (error) {
      onError?.(`Não foi possível carregar a biblioteca: ${errorText(error)}`);
    } finally {
      endLibraryLoading();
    }
  }

  async function addRomFile(file) {
    const extension = file.name.split(".").pop()?.toLowerCase();
    if (!SUPPORTED_ROM_EXTENSIONS.includes(extension)) {
      throw new Error(
        `Formato não suportado. Selecione arquivos ${SUPPORTED_ROM_LABEL}.`,
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
        format: formatForExtension(extension),
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
      format: formatForExtension(extension),
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

    // Expande ZIPs antes de calcular o progresso: um arquivo pode conter
    // várias ROMs portáteis (Game Gear / WonderSwan).
    const expanded = [];
    for (const file of files) {
      try {
        const roms = await expandRomFile(file);
        for (const rom of roms) expanded.push({ file: rom, sourceName: file.name });
      } catch (error) {
        failures.push(`${file.name}: ${errorText(error)}`);
      }
    }

    beginLibraryLoading("Importando jogos");
    libraryLoadingProgress.value = { current: 0, total: expanded.length };

    try {
      for (let index = 0; index < expanded.length; index += 1) {
        const { file, sourceName } = expanded[index];
        try {
          await addRomFile(file);
        } catch (error) {
          failures.push(
            `${sourceName === file.name ? file.name : `${sourceName} → ${file.name}`}: ${errorText(error)}`,
          );
        } finally {
          libraryLoadingProgress.value = {
            current: index + 1,
            total: expanded.length,
          };
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
    } finally {
      endLibraryLoading();
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
    isLibraryLoading,
    libraryLoadingLabel,
    libraryLoadingProgress,
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
