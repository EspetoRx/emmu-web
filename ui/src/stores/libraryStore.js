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

export async function loadLibraryGames() {
  const records = await runTransaction(
    GAME_STORE,
    "readonly",
    (store, setResult) => {
      const request = store.getAll();
      request.onsuccess = () =>
        setResult(request.result.sort((a, b) => b.addedAt - a.addedAt));
    },
  );

  return records.map((game) => {
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
  });
}

export async function saveLibraryGame(game) {
  const { previewUrl, ...record } = game;

  let rom = record.rom;
  if (rom instanceof Blob || rom instanceof File) {
    rom = await rom.arrayBuffer();
  }
  let state = record.state;
  if (state instanceof Blob) {
    state = await state.arrayBuffer();
  }
  let preview = record.preview;
  if (preview instanceof Blob) {
    preview = await preview.arrayBuffer();
  }

  const saveHistory = Array.isArray(record.saveHistory)
    ? await Promise.all(
        record.saveHistory.map(async ({ state: hState, savedAt }) => {
          let hs = hState;
          if (hs instanceof Blob) hs = await hs.arrayBuffer();
          return { state: hs, savedAt };
        }),
      )
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

export async function saveGameProgress(
  id,
  progress,
  { recordHistory = true } = {},
) {
  let state = progress.state;
  if (state instanceof Blob) {
    state = await state.arrayBuffer();
  }
  let preview = progress.preview;
  if (preview instanceof Blob) {
    preview = await preview.arrayBuffer();
  }
  const cleanProgress = {
    ...progress,
    ...(state ? { state } : {}),
    ...(preview ? { preview } : {}),
  };

  return runTransaction(GAME_STORE, "readwrite", (store, setResult, fail) => {
    const request = store.get(id);
    request.onerror = () => {
      fail(request.error ?? new Error("Falha ao ler o progresso salvo."));
    };
    request.onsuccess = async () => {
      const current = request.result;
      if (!current) {
        fail(new Error("O jogo não foi encontrado na biblioteca local."));
        return;
      }

      let currentState = current.state;
      if (currentState instanceof Blob) {
        currentState = await currentState.arrayBuffer();
      }

      const saveHistory = Array.isArray(current.saveHistory)
        ? current.saveHistory
        : [];
      const history =
        recordHistory && currentState && current.stateSavedAt
          ? [{ state: currentState, savedAt: current.stateSavedAt }, ...saveHistory]
          : saveHistory;

      const updated = {
        ...current,
        ...cleanProgress,
        saveHistory: history.slice(0, MAX_SAVE_HISTORY),
      };

      const writeRequest = store.put(updated);
      writeRequest.onerror = () => {
        fail(
          writeRequest.error ?? new Error("Falha ao gravar o progresso do jogo."),
        );
      };

      let finalRom = updated.rom;
      if (finalRom instanceof ArrayBuffer) finalRom = new Blob([finalRom]);
      let finalState = updated.state;
      if (finalState instanceof ArrayBuffer) finalState = new Blob([finalState]);
      let finalPreview = updated.preview;
      if (finalPreview instanceof ArrayBuffer)
        finalPreview = new Blob([finalPreview]);
      let finalHistory = (updated.saveHistory || []).map((h) => {
        let s = h.state;
        if (s instanceof ArrayBuffer) s = new Blob([s]);
        return { ...h, state: s };
      });

      setResult({
        ...updated,
        rom: finalRom,
        state: finalState,
        preview: finalPreview,
        saveHistory: finalHistory,
      });
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
