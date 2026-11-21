# Emmu Web

Este submódulo contém o “casco” Rust do alvo web e, principalmente, a aplicação Vue/Vite em [`ui/`](ui/README.md). O workspace raiz o declara como membro, mas o crate `web` em si é mínimo: um placeholder gerado pelo Cargo com a função `add()` e seu teste.

## Árvore de arquivos

```text
platforms/web/
├── Cargo.toml        # package web 0.1.0, edition 2024, sem dependências
├── src/
│   └── lib.rs        # add(left, right) + teste it_works
└── ui/               # SPA Vue 3 + Vite 6 — a aplicação real
    ├── README.md
    ├── index.html
    ├── package.json
    ├── vite.config.js
    ├── public/
    └── src/
```

## O que é usado no Emmu

- **Aplicação real:** `ui/`, que contém a biblioteca, o player, os workers, os pacotes WASM gerados e o cliente Tauri.
- **Crate Rust `web`:** não participa da emulação. Serve apenas para manter o alvo no workspace e permitir `cargo test -p web`.

## Comandos

```sh
# Teste do placeholder Rust
cargo test -p web

# Desenvolvimento da interface
cd ui
npm install
npm run dev

# Produção
npm run build
npm run preview
```

Os comandos desktop e mobile também são expostos a partir de `ui/`:

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

Consulte [`ui/README.md`](ui/README.md) para detalhes de cores, IndexedDB, controles, save states, licenças e build WASM.

## Licença

O crate Rust `web` não declara `license` e não possui `LICENSE`. A aplicação em `ui/` também não possui licença própria declarada no `package.json`; licenças de dependências e cores são listadas em `ui/README.md`.
