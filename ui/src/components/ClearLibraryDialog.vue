<template>
  <div
    v-if="visible"
    class="modal-backdrop"
    @click.self="emit('cancel')"
  >
    <section
      class="recovery-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="clear-library-title"
      aria-describedby="clear-library-description"
    >
      <p class="eyebrow">LIMPAR BIBLIOTECA</p>
      <h2 id="clear-library-title">Limpar toda a biblioteca?</h2>
      <p id="clear-library-description">
        Todos os {{ count }} {{ count === 1 ? "jogo" : "jogos" }} e seus estados salvos serão removidos permanentemente. Esta ação não pode ser desfeita.
      </p>
      <div class="controls-dialog-actions">
        <button
          class="secondary-button"
          :disabled="clearing"
          @click="emit('cancel')"
        >
          Cancelar
        </button>
        <span class="dialog-action-spacer"></span>
        <button
          class="primary-button delete-confirm-button"
          :disabled="clearing"
          @click="emit('confirm')"
        >
          {{ clearing ? "Limpando..." : "Limpar biblioteca" }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
defineProps(["visible", "count", "clearing"]);
defineEmits(["cancel", "confirm"]);
</script>