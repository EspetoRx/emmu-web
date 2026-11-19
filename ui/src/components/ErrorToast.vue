<script setup>
defineProps({
  toast: {
    type: Object,
    default: null,
  },
});
</script>

<template>
  <div v-if="toast" :key="toast.id" class="error-toast" role="alert" aria-live="assertive">
    {{ toast.message }}
  </div>
</template>
