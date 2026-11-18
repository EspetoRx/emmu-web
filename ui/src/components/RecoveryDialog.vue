<template>
  <div v-if="visible" class="modal-backdrop">
    <section
      class="recovery-dialog"
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="recovery-title"
      aria-describedby="recovery-description"
    >
      <p class="eyebrow">RECUPERAÇÃO</p>
      <h2 id="recovery-title">Não foi possível carregar a aplicação</h2>
      <p id="recovery-description">
        O estado salvo deste arquivo não pode ser carregado. Deseja reiniciar o jogo sem esse estado?
      </p>
      <p v-if="reason" class="recovery-detail">{{ reason }}</p>
      <div class="controls-dialog-actions">
        <button
          class="secondary-button"
          :disabled="restarting"
          @click="emit('dismiss')"
        >
          Voltar à biblioteca
        </button>
        <span class="dialog-action-spacer"></span>
        <button
          class="primary-button"
          :disabled="restarting"
          @click="emit('restart')"
        >
          {{ restarting ? "Reiniciando..." : "Reiniciar jogo" }}
        </button>
      </div>
    </section>
  </div>
</template>

<script setup>
defineProps(["visible", "reason", "restarting"]);
defineEmits(["dismiss", "restart"]);
</script>