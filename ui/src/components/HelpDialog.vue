<script setup>
defineProps({
  open: {
    type: Boolean,
    default: false,
  },
  isMobileDevice: {
    type: Boolean,
    default: false,
  },
});

const emit = defineEmits(["close"]);
</script>

<template>
  <div
    v-if="open"
    class="modal-backdrop"
    @click.self="emit('close')"
  >
    <section
      class="help-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="help-title"
    >
      <p class="eyebrow">EMMU</p>
      <h2 id="help-title">Como usar</h2>
      <p>Use Arquivo → Abrir arquivos para adicionar ROMs à biblioteca.</p>
      <p>
        {{
          isMobileDevice
            ? "Toque em um cartão para abrir o jogo."
            : "Dê dois cliques em um cartão para abrir o jogo."
        }}
      </p>
      <p>Controles: setas, Z/X/A/S, Q/W, Enter e Shift. No celular, use os botões na tela.</p>
      <p>No Game Gear, Z/X viram os botões 1/2 e Enter é Start; Select, X/Y e L/R não são usados.</p>
      <p class="supported-formats">Formatos aceitos pela interface: .nes, .sfc, .smc, .fig, .gba, .gb, .gbc, .gg, .pce e arquivos .zip contendo uma ou mais ROMs.</p>
      <button class="secondary-button" @click="emit('close')">Fechar</button>
    </section>
  </div>
</template>
