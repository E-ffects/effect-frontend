<script setup>
const model = defineModel()
defineProps({ invalid: Boolean })
</script>

<template>
  <input
    v-model="model"
    :class="invalid ? 'border-destructive focus-visible:ring-destructive/30' : ''"
    class="h-9 w-full rounded-md border bg-card px-3 text-sm shadow-xs placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50 disabled:opacity-50"
  />
</template>
