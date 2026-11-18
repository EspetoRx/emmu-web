# Emmu UI

The Vue interface is shared by the browser and the Tauri desktop, iOS, and
Android apps.

## Emulator cores

The SNES and NES cores are compiled to WebAssembly and run in the shared UI.
Install the WASM target and `wasm-pack` once before starting Vite or building
the app:

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

`.sfc` and `.smc` games use the SNES core; `.nes` games use the TetaNES core.
Both run with keyboard or touchscreen controls. The library, game previews, and
automatic save states are stored in IndexedDB. Progress is checkpointed every
five seconds, when returning to the library, and when the app is backgrounded.
Use **Salvar estado** for a manual checkpoint and **Continuar** on a saved game
card to resume it. The library keeps the ten most recent previous saves for
each game under **Histórico**; a save that cannot be loaded offers a clean
restart or a return to the library to choose an earlier save. Double-clicking
a saved card also resumes its last state. Card icons open save history, continue
an available save, or permanently delete the game and its saves after confirmation.
Keyboard bindings are configurable in **Controles** and saved locally; defaults
are arrows, Z/X/A/S, Q/W, Enter, and Shift.
ROMs are stored as durable local blobs in IndexedDB. If an older library entry
refers to a file that is no longer accessible, re-import the same ROM to repair
it. **Abrir arquivos** accepts multiple ROMs in one selection.
The **Filtros** panel searches and sorts the library and can group games by
similar title prefixes, console, ROM format, or save-state availability.

Audio is played through Web Audio using an AudioWorklet and a bounded PCM queue;
the Web Audio buffer is also used as a fallback where AudioWorklet is
unavailable. Use the speaker button in the player toolbar to adjust the volume.
The NES core generates audio at 48 kHz. SNES enhancement-chip
games such as Super FX or SA-1 are not supported. TetaNES supports iNES 1.0 and
NES 2.0, including mapper 227 multicarts such as 1200-in-1, with other
compatibility depending on the ROM mapper. ROM files are not included.

## Web

```sh
npm install
npm run dev
```

## Desktop

Install the Rust toolchain and Tauri prerequisites for your operating system,
then run these commands from this directory:

```sh
npm run desktop:dev
npm run desktop:build
```

## Android

Install a JDK, Android Studio/SDK, and the Android NDK, then initialize the
native project once and launch it:

```sh
npm run mobile:android:init
npm run mobile:android:dev
```

Use `npm run mobile:android:build` to create a release build.

## iOS

On macOS, install Xcode and CocoaPods. Initialize the native project once,
install an iOS Simulator runtime from Xcode Settings > Platforms, then launch it
in a simulator:

```sh
npm run mobile:ios:init
npm run mobile:ios:dev
```

Use `npm run mobile:ios:build` for a release build. Device/App Store builds also
require an Apple development team and signing credentials.

## VS Code

Open the workspace root, install the recommended Rust extensions, then choose
`Emmu: Web (Chrome)` or `Emmu: Desktop (Rust)` in **Run and Debug**. The desktop
configuration builds the Vue assets and Rust app before launching under
CodeLLDB; the web configuration starts Vite and opens Chrome for Testing from
the local Playwright browser cache. If that cache changes, update
`runtimeExecutable` in `.vscode/launch.json`.
