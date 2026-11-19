<script setup>
defineProps({
  game: {
    type: Object,
    default: null,
  },
  isDeleting: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["cancel", "confirm"]);
</script>

<template>
  <div v-if="game" class="modal-backdrop" @click.self="emit('cancel')">
    <section class="recovery-dialog" role="alertdialog" aria-modal="true" aria-labelledby="delete-game-title"
      aria-describedby="delete-game-description">
      <p class="eyebrow">EXCLUIR JOGO</p>
      <h2 id="delete-game-title">Remover da biblioteca?</h2>
      <p id="delete-game-description">
        O jogo “{{ game.name }}” e todos os seus saves serão excluídos. Esta ação não pode ser desfeita.
      </p>
      <div class="controls-dialog-actions">
        <button class="secondary-button" :disabled="isDeleting" @click="emit('cancel')">
          Cancelar
        </button>
        <span class="dialog-action-spacer"></span>
        <button class="primary-button delete-confirm-button" :disabled="isDeleting" @click="emit('confirm')">
          {{ isDeleting ? "Excluindo..." : "Excluir jogo" }}
        </button>
      </div>
    </section>
  </div>
</template>
