const DATABASE_NAME = "emmu-library";
const DATABASE_VERSION = 2;
const GAME_STORE = "games";
const SETTINGS_STORE = "settings";
const MAX_SAVE_HISTORY = 10;

function openDatabase() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);

    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(GAME_STORE)) {
        database.createObjectStore(GAME_STORE, { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains(SETTINGS_STORE)) {
        database.createObjectStore(SETTINGS_STORE, { keyPath: "key" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Falha ao abrir a biblioteca local."));
    request.onblocked = () =>
      reject(new Error("A biblioteca está sendo atualizada em outra janela."));
  });
}

function runTransaction(storeName, mode, operation) {
  return openDatabase().then(
    (database) =>
      new Promise((resolve, reject) => {
        const transaction = database.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        let result;
        let operationError;

        try {
          operation(
            store,
            (value) => {
              result = value;
            },
            (error) => {
              operationError = error;
              transaction.abort();
            },
          );
        } catch (error) {
          transaction.abort();
          reject(error);
        }

        transaction.oncomplete = () => {
          database.close();
          resolve(result);
        };
        transaction.onerror = (event) => {
          database.close();
          reject(
            event.target?.error ??
              transaction.error ??
              new Error("Falha ao acessar a biblioteca local."),
          );
        };
        transaction.onabort = () => {
          database.close();
          reject(
            operationError ??
              transaction.error ??
              new Error("A gravação da biblioteca foi cancelada."),
          );
        };
      }),
  );
}

function normalizeGameRecord(game) {
  let rom = game.rom;
  if (rom instanceof ArrayBuffer) {
    rom = new Blob([rom], { type: "application/octet-stream" });
  }
  let state = game.state;
  if (state instanceof ArrayBuffer) {
    state = new Blob([state], { type: "application/octet-stream" });
  }
  let preview = game.preview;
  if (preview instanceof ArrayBuffer) {
    preview = new Blob([preview], { type: "image/png" });
  }
  let saveHistory = Array.isArray(game.saveHistory)
    ? game.saveHistory.map((h) => {
        let s = h.state;
        if (s instanceof ArrayBuffer) {
          s = new Blob([s], { type: "application/octet-stream" });
        }
        return { ...h, state: s };
      })
    : [];
  return { ...game, rom, state, preview, saveHistory };
}

/// Carrega a biblioteca com progresso real: um cursor percorre os registros e
/// `onProgress(current, total)` é chamado a cada jogo normalizado.
export async function loadLibraryGames(onProgress) {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const records = [];
    const transaction = database.transaction(GAME_STORE, "readonly");
    const store = transaction.objectStore(GAME_STORE);

    const countRequest = store.count();
    countRequest.onsuccess = () => {
      const total = countRequest.result;
      onProgress?.(0, total);
      if (total === 0) return;

      const cursorRequest = store.openCursor();
      cursorRequest.onsuccess = (event) => {
        const cursor = event.target.result;
        if (!cursor) return;
        records.push(normalizeGameRecord(cursor.value));
        onProgress?.(records.length, total);
        cursor.continue();
      };
      cursorRequest.onerror = () => transaction.abort();
    };
    countRequest.onerror = () => transaction.abort();

    transaction.oncomplete = () => {
      database.close();
      resolve(records.sort((a, b) => b.addedAt - a.addedAt));
    };
    transaction.onerror = (event) => {
      database.close();
      reject(
        event.target?.error ??
          transaction.error ??
          new Error("Falha ao carregar a biblioteca local."),
      );
    };
    transaction.onabort = () => {
      database.close();
      reject(
        transaction.error ?? new Error("Falha ao carregar a biblioteca local."),
      );
    };
  });
}

export async function saveLibraryGame(game) {
  const { previewUrl, ...record } = game;

  // A ROM precisa continuar como Blob/File. O IndexedDB serializa ArrayBuffer
  // dentro do registro (limite de ~127 MiB no Chromium), mas armazena Blob por
  // referência, fora do valor serializado. Converter para ArrayBuffer aqui
  // fazia qualquer ROM maior que esse limite falhar na importação/autosave.
  // O mesmo vale para estados e miniaturas, que também podem crescer.
  const rom = record.rom;
  const state = record.state;
  const preview = record.preview;
  const saveHistory = Array.isArray(record.saveHistory)
    ? record.saveHistory.map(({ state: hState, savedAt }) => ({
        state: hState,
        savedAt,
      }))
    : [];

  const cleanRecord = { ...record, rom, state, preview, saveHistory };

  return runTransaction(GAME_STORE, "readwrite", (store) => {
    store.put(cleanRecord);
  });
}

export function deleteLibraryGame(id) {
  return runTransaction(GAME_STORE, "readwrite", (store) => {
    store.delete(id);
  });
}

export function clearLibraryGames() {
  return runTransaction(GAME_STORE, "readwrite", (store) => {
    store.clear();
  });
}

export function saveGameProgress(id, progress, { recordHistory = true } = {}) {
  const cleanProgress = {
    ...progress,
    ...(progress.state ? { state: progress.state } : {}),
    ...(progress.preview ? { preview: progress.preview } : {}),
  };

  return runTransaction(GAME_STORE, "readwrite", (store, setResult, fail) => {
    const request = store.get(id);
    request.onerror = () => {
      fail(request.error ?? new Error("Falha ao ler o progresso salvo."));
    };
    request.onsuccess = () => {
      const current = request.result;
      if (!current) {
        fail(new Error("O jogo não foi encontrado na biblioteca local."));
        return;
      }

      // Registros de versões antigas podem ter ROM/estado como ArrayBuffer.
      // Normaliza para Blob antes de regravar: mantém a ROM fora do valor
      // serializado e cura o registro antigo no próximo checkpoint.
      const normalized = {
        ...current,
        ...(current.rom instanceof ArrayBuffer
          ? {
              rom: new Blob([current.rom], {
                type: "application/octet-stream",
              }),
            }
          : {}),
        ...(current.state instanceof ArrayBuffer
          ? {
              state: new Blob([current.state], {
                type: "application/octet-stream",
              }),
            }
          : {}),
      };

      const saveHistory = Array.isArray(normalized.saveHistory)
        ? normalized.saveHistory.map((entry) => ({
            ...entry,
            ...(entry.state instanceof ArrayBuffer
              ? {
                  state: new Blob([entry.state], {
                    type: "application/octet-stream",
                  }),
                }
              : {}),
          }))
        : [];
      const history =
        recordHistory && normalized.state && normalized.stateSavedAt
          ? [
              { state: normalized.state, savedAt: normalized.stateSavedAt },
              ...saveHistory,
            ]
          : saveHistory;

      const updated = {
        ...normalized,
        ...cleanProgress,
        saveHistory: history.slice(0, MAX_SAVE_HISTORY),
      };

      const writeRequest = store.put(updated);
      writeRequest.onerror = () => {
        fail(
          writeRequest.error ?? new Error("Falha ao gravar o progresso do jogo."),
        );
      };

      setResult(updated);
    };
  });
}

export function loadControlBindings() {
  return runTransaction(SETTINGS_STORE, "readonly", (store, setResult) => {
    const request = store.get("controls");
    request.onsuccess = () => setResult(request.result?.value ?? null);
  });
}

export function saveControlBindings(bindings) {
  return runTransaction(SETTINGS_STORE, "readwrite", (store) => {
    store.put({ key: "controls", value: bindings });
  });
}
