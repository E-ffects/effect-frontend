<script setup>
defineProps({ no: String, title: String, note: String })
</script>

<template>
  <section class="rounded-lg border bg-card p-4">
    <header class="mb-3 flex items-center gap-2">
      <span v-if="no" class="flex size-5 items-center justify-center rounded-full bg-muted text-[12px] font-semibold text-muted-foreground">{{ no }}</span>
      <h4 class="text-sm font-semibold">{{ title }}</h4>
      <span v-if="note" class="text-[12px] text-muted-foreground">{{ note }}</span>
      <div class="ml-auto flex items-center gap-2"><slot name="actions" /></div>
    </header>
    <slot />
  </section>
</template>
