<script setup>
import { computed } from "vue";

const props = defineProps({
    activeGame: {
        type: Object,
        default: null,
    },
    saveStatus: {
        type: String,
        default: "",
    },
});

const isPsp = computed(() => props.activeGame?.format === "PSP");
</script>

<template>
    <!-- Barra de Status inferior com texto diminuído -->
    <footer class="statusbar" style="font-size: 0.75rem; padding: 4px 12px;">
        <span><span class="status-dot"></span> Emmu</span>
        <span v-if="saveStatus" class="save-status" :class="{
            'save-status-green': !isPsp,
            'save-status-warning': isPsp,
        }">
            {{ saveStatus }}
            <span v-if="isPsp" class="save-info" tabindex="0" role="button"
                aria-label="Por que o autosave está desabilitado no PSP">
                <span class="save-info-icon" aria-hidden="true">i</span>
                <span class="save-info-balloon" role="tooltip">
                    <strong>Autosave desabilitado no PSP</strong>
                    O PPSSPP roda na main thread do navegador. Gerar um save
                    state bloqueia essa thread por alguns segundos e trava o
                    áudio e o vídeo. Por isso o salvamento automático (a cada
                    5 s, ao sair da aba e ao fechar o jogo) foi desligado neste
                    console. Use <em>Salvar estado</em> na barra do jogador
                    sempre que quiser registrar seu progresso.
                </span>
            </span>
        </span>
        <span>{{ activeGame ? activeGame.fileName : "Biblioteca local" }}</span>
    </footer>
</template>

<style scoped>
.save-status {
    display: inline-flex;
    align-items: center;
    gap: 6px;
}

.save-status-green {
    color: #4ade80;
    font-weight: 500;
}

.save-status-warning {
    color: #fbbf24;
    font-weight: 500;
}

.save-info {
    position: relative;
    display: inline-flex;
    align-items: center;
    cursor: help;
    outline: none;
}

.save-info-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 14px;
    height: 14px;
    border: 1px solid currentColor;
    border-radius: 50%;
    font-size: 0.65rem;
    font-weight: 700;
    font-style: normal;
    line-height: 1;
}

.save-info-balloon {
    visibility: hidden;
    opacity: 0;
    position: absolute;
    bottom: calc(100% + 10px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 30;
    width: min(320px, 80vw);
    padding: 10px 12px;
    border: 1px solid #4b5563;
    border-radius: 8px;
    background: #111827;
    color: #e5e7eb;
    font-size: 0.75rem;
    font-weight: 400;
    line-height: 1.45;
    text-align: left;
    box-shadow: 0 8px 24px rgb(0 0 0 / 45%);
    transition: opacity 120ms ease;
}

.save-info-balloon strong {
    display: block;
    margin-bottom: 4px;
    color: #fbbf24;
}

.save-info-balloon em {
    color: #93c5fd;
    font-style: normal;
}

.save-info:hover .save-info-balloon,
.save-info:focus .save-info-balloon,
.save-info:focus-within .save-info-balloon {
    visibility: visible;
    opacity: 1;
}
</style>
