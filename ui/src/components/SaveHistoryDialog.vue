<template>
  <div
    v-if="game"
    class="modal-backdrop"
    @click.self="emit('close')"
  >
    <section
      class="save-history-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="save-history-title"
    >
      <div class="controls-dialog-heading">
        <div>
          <p class="eyebrow">{{ game.format }} · {{ game.name }}</p>
          <h2 id="save-history-title">Histórico de saves</h2>
        </div>
        <button class="icon-button" aria-label="Fechar histórico" @click="emit('close')">
          ✕
        </button>
      </div>
      <p class="controls-instructions">
        Escolha uma versão anterior para continuar o jogo a partir dela.
      </p>
      <div v-if="game.saveHistory?.length" class="save-history-list">
        <div
          v-for="(save, index) in game.saveHistory"
          :key="`${save.savedAt}-${index}`"
          class="save-history-entry"
        >
          <span>{{ formatSaveHistoryTime(save.savedAt) }}</span>
          <button
            class="continue-game-button"
            :disabled="restoring"
            @click="emit('load', game, save)"
          >
            {{ restoring ? "Carregando..." : "Carregar" }}
          </button>
        </div>
      </div>
      <p v-else class="save-history-empty">
        Ainda não há saves anteriores. Novos checkpoints serão guardados aqui.
      </p>
    </section>
  </div>
</template>

<script setup>
import { computed } from "vue";

const props = defineProps(["game", "restoring"]);
const emit = defineEmits(["close", "load"]);

const formatSaveHistoryTime = (timestamp) => {
  return new Intl.DateTimeFormat("pt-BR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(timestamp));
};
</script>