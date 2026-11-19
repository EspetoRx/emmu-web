<script setup>
defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  gameCount: {
    type: Number,
    default: 0,
  },
  isClearing: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["cancel", "confirm"]);
</script>

<template>
  <div v-if="open" class="modal-backdrop" @click.self="emit('cancel')">
    <section class="recovery-dialog" role="alertdialog" aria-modal="true" aria-labelledby="clear-library-title"
      aria-describedby="clear-library-description">
      <p class="eyebrow">LIMPAR BIBLIOTECA</p>
      <h2 id="clear-library-title">Limpar toda a biblioteca?</h2>
      <p id="clear-library-description">
        Todos os {{ gameCount }} {{ gameCount === 1 ? "jogo" : "jogos" }} e seus estados salvos serão removidos
        permanentemente. Esta ação não pode ser desfeita.
      </p>
      <div class="controls-dialog-actions">
        <button class="secondary-button" :disabled="isClearing" @click="emit('cancel')">
          Cancelar
        </button>
        <span class="dialog-action-spacer"></span>
        <button class="primary-button delete-confirm-button" :disabled="isClearing" @click="emit('confirm')">
          {{ isClearing ? "Limpando..." : "Limpar biblioteca" }}
        </button>
      </div>
    </section>
  </div>
</template>
