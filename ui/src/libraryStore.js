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
    request.onerror = () => reject(request.error ?? new Error("Falha ao abrir a biblioteca local."));
    request.onblocked = () => reject(new Error("A biblioteca está sendo atualizada em outra janela."));
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
          operation(store, (value) => {
            result = value;
          }, (error) => {
            operationError = error;
            transaction.abort();
          });
        } catch (error) {
          transaction.abort();
          reject(error);
        }

        transaction.oncomplete = () => {
          database.close();
          resolve(result);
        };
        transaction.onerror = () => {
          database.close();
          reject(transaction.error ?? new Error("Falha ao acessar a biblioteca local."));
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
  return runTransaction(GAME_STORE, "readonly", (store, setResult) => {
    const request = store.getAll();
    request.onsuccess = () => setResult(request.result.sort((a, b) => b.addedAt - a.addedAt));
  });
}

export function saveLibraryGame(game) {
  const { previewUrl, ...record } = game;
  const saveHistory = Array.isArray(record.saveHistory)
    ? record.saveHistory.map(({ state, savedAt }) => ({ state, savedAt }))
    : [];
  return runTransaction(GAME_STORE, "readwrite", (store) => {
    store.put({ ...record, saveHistory });
  });
}

export function deleteLibraryGame(id) {
  return runTransaction(GAME_STORE, "readwrite", (store) => {
    store.delete(id);
  });
}

export function saveGameProgress(id, progress) {
  return runTransaction(GAME_STORE, "readwrite", (store, setResult, fail) => {
    const request = store.get(id);
    request.onsuccess = () => {
      const current = request.result;
      if (!current) {
        fail(new Error("O jogo não foi encontrado na biblioteca local."));
        return;
      }

      const saveHistory = Array.isArray(current.saveHistory)
        ? current.saveHistory
        : [];
      const history = current.state && current.stateSavedAt
        ? [{ state: current.state, savedAt: current.stateSavedAt }, ...saveHistory]
        : saveHistory;
      const updated = {
        ...current,
        ...progress,
        saveHistory: history.slice(0, MAX_SAVE_HISTORY),
      };
      store.put(updated);
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
