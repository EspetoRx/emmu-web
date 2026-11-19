<script setup>
defineProps({
    activeGame: {
        type: Object,
        default: null,
    },
});
</script>

<template>
    <!-- Barra de Status inferior com texto diminuído -->
    <footer class="statusbar" style="font-size: 0.75rem; padding: 4px 12px;">
        <span><span class="status-dot"></span> Emmu</span>
        <span>{{ activeGame ? activeGame.fileName : "Biblioteca local" }}</span>
    </footer>
</template>
