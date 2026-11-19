<script setup>
defineProps({
    activeGame: {
        type: Object,
        default: null,
    },
    saveStatus: {
        type: String,
        default: "",
    },
});
</script>

<template>
    <!-- Barra de Status inferior com texto diminuído -->
    <footer class="statusbar" style="font-size: 0.75rem; padding: 4px 12px;">
        <span><span class="status-dot"></span> Emmu</span>
        <span v-if="saveStatus" class="save-status-green">{{ saveStatus }}</span>
        <span>{{ activeGame ? activeGame.fileName : "Biblioteca local" }}</span>
    </footer>
</template>

<style scoped>
.save-status-green {
    color: #4ade80;
    font-weight: 500;
}
</style>
