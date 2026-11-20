<script setup>
defineProps({
  isNativeDesktop: {
    type: Boolean,
    default: false,
  },
  isMobileDevice: {
    type: Boolean,
    default: false,
  },
  pageTitle: {
    type: String,
    required: true,
  },
  openMenu: {
    type: String,
    default: null,
  },
  hasActiveGame: {
    type: Boolean,
    default: false,
  },
  gamesCount: {
    type: Number,
    required: true,
  },
});

const emit = defineEmits([
  "toggle-menu",
  "close-menu",
  "open-file-picker",
  "return-to-library",
  "request-clear-library",
  "open-controls",
]);
</script>

<template>
  <header v-if="!isNativeDesktop" class="titlebar">
    <div v-if="!isMobileDevice" class="window-controls" aria-hidden="true">
      <span class="window-control close"></span>
      <span class="window-control minimize"></span>
      <span class="window-control maximize"></span>
    </div>
    <div class="brand">
      <span class="brand-mark">e</span>
      <span>emmu</span>
    </div>
    <span class="window-title">{{ pageTitle }}</span>
    <div class="titlebar-spacer"></div>
  </header>

  <nav v-if="!isNativeDesktop" class="menubar" aria-label="Menu principal">
    <div class="menu-group">
      <div class="menu-wrapper">
        <button
          class="menu-trigger"
          :aria-expanded="openMenu === 'arquivo'"
          @click="emit('toggle-menu', 'arquivo')"
        >
          Arquivo
        </button>
        <div v-if="openMenu === 'arquivo'" class="menu-popover">
          <button class="menu-item" @click="emit('open-file-picker')">
            <span>Abrir arquivos…</span>
            <kbd>⌘ O</kbd>
          </button>
          <button
            class="menu-item"
            :disabled="!hasActiveGame"
            @click="emit('return-to-library')"
          >
            <span>Voltar à biblioteca</span>
          </button>
        </div>
      </div>

      <div class="menu-wrapper">
        <button
          class="menu-trigger"
          :aria-expanded="openMenu === 'biblioteca'"
          @click="emit('toggle-menu', 'biblioteca')"
        >
          Biblioteca
        </button>
        <div v-if="openMenu === 'biblioteca'" class="menu-popover">
          <button class="menu-item" @click="emit('return-to-library')">
            <span>Ver jogos</span>
            <kbd>⌘ 1</kbd>
          </button>
          <button class="menu-item" @click="emit('open-file-picker')">
            <span>Adicionar jogos…</span>
            <kbd>⌘ O</kbd>
          </button>
          <button
            v-if="gamesCount"
            class="menu-item"
            @click="emit('close-menu'); emit('request-clear-library')"
          >
            <span>Limpar biblioteca…</span>
          </button>
        </div>
      </div>

      <button class="menu-trigger" @click="emit('open-controls')">Controles</button>

      <div class="menu-wrapper">
        <button
          class="menu-trigger"
          :aria-expanded="openMenu === 'ajuda'"
          @click="emit('toggle-menu', 'ajuda')"
        >
          Ajuda
        </button>
        <div v-if="openMenu === 'ajuda'" class="menu-popover help-popover">
          <p>Adicione uma ou mais ROMs e dê dois cliques no cartão para abrir o jogo.</p>
          <p>Formatos reconhecidos: NES, SNES, FIG, GBA, GB e GBC.</p>
        </div>
      </div>
    </div>

    <div class="menubar-status">
      <span class="status-dot"></span>
      {{ gamesCount }} {{ gamesCount === 1 ? "jogo" : "jogos" }}
    </div>
  </nav>
</template>
