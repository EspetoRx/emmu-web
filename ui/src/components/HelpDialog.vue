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
      <p>No Game Gear e no Master System, Z/X viram os botões 1/2 e Enter é Start; Select, X/Y e L/R não são usados. O Master System tem jogador 2.</p>
      <p>No WonderSwan, as setas controlam o primeiro direcional e S/A/Q/W o segundo (↑/↓/←/→); Z/X são A/B e Enter é Start. Não há Select nem jogador 2.</p>
      <p>No Nintendo DS, use A/B/X/Y, L/R, Start e Select. Toque ou clique na metade inferior da tela para usar o painel sensível; a tela superior é apenas vídeo. O console tem um único jogador.</p>
      <p>No Nintendo 64, use o menu do manete para escolher o jogador (1–4). A/B, Start, Z, L/R e C-buttons são mapeáveis, assim como as quatro direções do analógico (Analógico ↑/↓/←/→). Por limitação do N64Wasm, o analógico e os demais botões são enviados ao core pelo jogador 1.</p>
      <p>No PSP, A/B/X/Y correspondem a ×/○/□/△, com L/R, Select, Start e analógico digital (Analógico ↑/↓/←/→). O console tem um único jogador. O PPSSPP usa WebGL2 e pthreads, então o navegador precisa de isolamento cross-origin (COOP/COEP); o áudio é gerenciado pelo próprio core.</p>
      <p class="supported-formats">Formatos aceitos pela interface: .nes, .sfc, .smc, .fig, .gba, .gb, .gbc, .gg, .sms, .ws, .wsc, .pce, .nds, .z64, .n64, .v64, .psp, .iso, .cso, .chd, .pbp, .elf, .prx e arquivos .zip contendo uma ou mais ROMs.</p>
      <button class="secondary-button" @click="emit('close')">Fechar</button>
    </section>
  </div>
</template>
