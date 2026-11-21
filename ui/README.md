# Emmu UI

Interface Vue 3 + Vite 6 compartilhada pelo navegador e pelo aplicativo Tauri (desktop, Android e iOS). Ela concentra biblioteca, player, controle de entrada, áudio, save states, diálogos e todo o estado persistido do usuário.

## Visão geral

| Responsabilidade | Arquivo(s) |
| --- | --- |
| Orquestração, atalhos, autosave e diálogos | `src/App.vue` |
| Biblioteca e filtros | `src/components/Library.vue`, `src/composables/useLibrary.js` |
| Player e controles touch | `src/components/Player.vue` |
| Backend de emulação | `src/composables/useEmulator.js`, `src/composables/snes.js` |
| Web Workers | `src/workers/snes.worker.js` |
| Áudio | `src/composables/useAudio.js`, `src/workers/audio-worklet.js` |
| Persistência | `src/stores/libraryStore.js` (IndexedDB) |
| Configuração de teclado | `src/composables/useControls.js`, `src/composables/useShortcuts.js` |
| Mensagens ao usuário | `src/composables/useToast.js`, `src/components/ErrorToast.vue` |

No navegador, `createEmulator()` cria um `EmulationWorkerClient` e carrega um dos seis cores WASM. Sob Tauri, cria `MesenTauriClient` e usa `invoke("mesen_*")` + o protocolo `emmu-frame://`.

## Cores e formatos

| Console | Extensões | Caminho web | Caminho desktop | Save state |
| --- | --- | --- | --- | --- |
| SNES | `.sfc`, `.smc`, `.fig` | `emmu_snes` → Super Sabicom | Mesen | bincode / `.mss` |
| NES | `.nes` | `emmu_nes` → TetaNES | Mesen | TetaNES / `.mss` |
| GBA | `.gba` | `emmu_gba` → Web-GBA/gbajs | Mesen | `EMMUSAVE1` / `.mss` |
| GBC | `.gbc` | `emmu_gbc` → oxGBC | Mesen | `EMMUGBC1` / `.mss` |
| GB | `.gb` | `emmu_gb` → oxGBC (DMG) | Mesen | `EMMUGMB1` / `.mss` |
| PCE | `.pce` | `emmu_pce` → JGenesis | Mesen | `EMMUPCE1` / `.mss` |

O seletor de arquivos aceita `.nes,.sfc,.smc,.fig,.gba,.gb,.gbc,.pce`. Nenhuma ROM é incluída no repositório.

## Recursos da interface

- **Biblioteca:** ROMs ficam como blobs duráveis no IndexedDB (`emmu-library`, versão 2, stores `games` e `settings`). A abertura aceita vários arquivos por seleção; se um blob antigo ficar inacessível, reimporte a ROM.
- **Loading real:** `LibraryLoadingOverlay.vue` mostra spinner, rótulo, `x de y jogos`, barra e porcentagem. `MIN_LIBRARY_LOADING_MS = 450` evita flashes.
- **Save states:** checkpoint a cada `CHECKPOINT_INTERVAL = 5000` ms, ao voltar à biblioteca, ao entrar em background e ao desmontar o player. **Salvar estado** cria histórico; **Continuar** retoma o último; **Histórico** guarda os 10 estados manuais anteriores.
- **Recuperação:** estado inválido oferece reinício limpo ou retorno à biblioteca para escolher um save anterior.
- **Filtros:** busca sem acento (`pt-BR`), ordenação e agrupamento por título similar, console, formato e presença de save. É um filtro da biblioteca, não um filtro de vídeo.
- **Controles:** bindings configuráveis em **Controles**, salvos localmente. Padrões: setas, Z/X/A/S, Q/W, Enter e Shift. `useShortcuts.js` usa fallback para `event.key` quando `code` está vazio, chama `preventDefault()` e libera todos os botões no `blur` da janela.
- **Toque:** `Player.vue` usa `pointerdown/up/cancel/leave`. X/Y aparecem apenas nos cores que têm esses botões; no PCE, X/Y e shoulder são escondidos porque o gamepad padrão é de 2 botões.
- **Áudio:** `AudioWorkletProcessor` `emmu-audio` com fila PCM limitada e fallback para `createBufferSource`. `AUDIO_BATCH_SECONDS = 0.03`, `MAX_SCHEDULED_AUDIO_SECONDS = 0.1`, volume padrão `0.7`. No desktop, o volume é enviado ao Mesen/SDL.
- **Frame pacing:** `FRAME_INTERVAL = 1000/60`, com `renderEveryFrames` adaptativo de 1 a 4. Frames WASM são RGBA8888 desenhados com `putImageData`; frames desktop vêm como BMP e são desenhados com `drawImage`.
- **Miniaturas:** no desktop, `capturePreview()` chama `mesen_capture_preview`, que devolve PNG gerado no Rust. No web, usa o canvas do player.
- **Diálogos:** ajuda, controles, histórico de saves, limpar biblioteca, excluir jogo, recuperação de blob e erros.

## Limitações conhecidas

- Jogos SNES com Super FX, SA-1 e outros chips de melhoria não funcionam no caminho Super Sabicom.
- A compatibilidade NES depende do mapper suportado pelo TetaNES; iNES 1.0, NES 2.0 e mapper 227 (1200-in-1) são suportados.
- PCE suporta apenas HuCard; CD-ROM e System Cards não são suportados.
- O core GB/GBC usa apenas o jogador 1; GBA também.
- Não há seletor de filtro de vídeo nesta UI.
- O diretório `public/` está vazio; `src/wasm/` é gerado e ignorado pelo git, embora `dist/` já contenha os binários em um build pronto.

## Árvore de arquivos

```text
platforms/web/ui/
├── index.html                 # lang pt-BR, viewport-fit=cover, tema #111116
├── package.json               # emmu-ui 0.1.0, scripts dev/build/wasm/desktop/mobile
├── package-lock.json
├── vite.config.js             # plugin-vue, porta 5173 com strictPort
├── public/                    # assets estáticos (vazio)
├── dist/                      # saída de produção (gerada)
└── src/
    ├── App.vue                # shell, diálogos, atalhos, autosave, geração de miniaturas
    ├── main.js
    ├── style.css
    ├── components/
    │   ├── AppHeader.vue
    │   ├── Library.vue
    │   ├── GameCard.vue
    │   ├── Player.vue
    │   ├── LibraryLoadingOverlay.vue
    │   ├── HelpDialog.vue
    │   ├── ControlsDialog.vue
    │   ├── SaveHistoryDialog.vue
    │   ├── ClearLibraryDialog.vue
    │   ├── DeleteDialog.vue
    │   ├── RecoveryDialog.vue
    │   ├── ErrorToast.vue
    │   └── StatusBar.vue
    ├── composables/
    │   ├── useEmulator.js     # facade do core/worker/Tauri + setButton + capturePreview
    │   ├── useLibrary.js      # import, filtros, progresso, save states e miniaturas
    │   ├── useControls.js     # bindings de teclado
    │   ├── useShortcuts.js    # keydown/keyup, fallback de key, blur
    │   ├── useAudio.js        # Web Audio + volume persistido
    │   ├── snes.js            # EmulationWorkerClient + MesenTauriClient + createEmulator
    │   └── useToast.js
    ├── stores/
    │   └── libraryStore.js    # IndexedDB emmu-library v2
    ├── workers/
    │   ├── snes.worker.js     # inicializa/run/setButton/saveState/loadState/restart
    │   └── audio-worklet.js   # AudioWorkletProcessor emmu-audio
    └── wasm/                  # gerado por wasm-pack (ignorado no git)
        ├── emmu_snes.js / .wasm
        ├── nes/
        ├── gba/
        ├── gbc/
        ├── gb/
        └── pce/
```

## Pré-requisitos

```sh
rustup target add wasm32-unknown-unknown
cargo install wasm-pack
```

Node.js LTS (18+) e npm. Para desktop, instale também os pré-requisitos do Tauri e prepare o runtime Mesen/SDL2 descrito na raiz do repositório.

## Comandos

```sh
npm install
npm run dev       # predev roda build:wasm; Vite em 127.0.0.1:5173
npm run build     # prebuild roda build:wasm; saída em dist/
npm run preview   # serve dist/
```

Reconstruir apenas os WASM:

```sh
npm run build:wasm
```

O script roda, em ordem:

```text
emmu-snes  → src/wasm
emmu-nes   → src/wasm/nes
emmu-gba   → node tools/build-bridge.mjs → src/wasm/gba
emmu-gbc   → src/wasm/gbc
emmu-gb    → src/wasm/gb
emmu-pce   → src/wasm/pce
```

Desktop e mobile:

```sh
npm run desktop:dev
npm run desktop:build

npm run mobile:android:init
npm run mobile:android:dev
npm run mobile:android:build

npm run mobile:ios:init
npm run mobile:ios:dev
npm run mobile:ios:build
```

## VS Code

A pasta `.vscode/` da raiz contém `Emmu: Web (Chrome)` e `Emmu: Desktop (Rust)`. O web usa Chrome for Testing do cache local do Playwright; se o cache mudar, ajuste `runtimeExecutable` em `.vscode/launch.json`.

## Licenças

A aplicação `emmu-ui` não declara campo `license` no `package.json` e não possui `LICENSE` próprio. Dependências e cores:

| Item | Licença | Observação |
| --- | --- | --- |
| Vue 3 | MIT | `Copyright (c) 2018-present, Evan You` |
| Vite | MIT | `Copyright (c) 2019-present, Evan You e colaboradores` |
| `@vitejs/plugin-vue` | MIT | time Vue |
| `@tauri-apps/api` | Apache-2.0 OR MIT | Tauri |
| `emmu-snes`, `emmu-nes`, `emmu-gba` | MIT | wrappers Emmu |
| `tetanes-core` | MIT OR Apache-2.0 | NES |
| Super Sabicom | MIT | SNES |
| Web-GBA / gbajs | BSD-2-Clause | `Copyright (c) 2012, Jeffrey Pfau` |
| `emmu-gb`, `emmu-gbc` | GPL-3.0-only | oxGBC |
| `emmu-pce` | GPL-3.0-only | JGenesis `pce-core` |

Arquivos de licença dos pacotes WASM gerados ficam em `src/wasm/*/LICENSE` e `src/wasm/gba/LICENSE-WEB-GBA-EMULATOR.txt`. Como o bundle contém código GPLv3, cumpra as obrigações de disponibilizar o código-fonte correspondente ao distribuir a aplicação.
