<script setup>
defineProps({
  prompt: {
    type: Object,
    default: null,
  },
  isRestarting: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["dismiss", "restart"]);
</script>

<template>
  <div v-if="prompt" class="modal-backdrop">
    <section class="recovery-dialog" role="alertdialog" aria-modal="true" aria-labelledby="recovery-title"
      aria-describedby="recovery-description">
      <p class="eyebrow">RECUPERAÇÃO</p>
      <h2 id="recovery-title">Não foi possível carregar a aplicação</h2>
      <p id="recovery-description">
        O estado salvo deste arquivo não pode ser carregado. Deseja reiniciar o jogo sem esse estado?
      </p>
      <p v-if="prompt.reason" class="recovery-detail">
        {{ prompt.reason }}
      </p>
      <div class="controls-dialog-actions">
        <button class="secondary-button" :disabled="isRestarting" @click="emit('dismiss')">
          Voltar à biblioteca
        </button>
        <span class="dialog-action-spacer"></span>
        <button class="primary-button" :disabled="isRestarting" @click="emit('restart')">
          {{ isRestarting ? "Reiniciando..." : "Reiniciar jogo" }}
        </button>
      </div>
    </section>
  </div>
</template>
