<script setup>
defineProps({ title: String, description: String, padded: { type: Boolean, default: true } })
</script>

<template>
  <section class="rounded-[14px] border bg-card flex flex-col">
    <header v-if="title || $slots.actions" class="flex items-start justify-between gap-3 px-5 pt-5">
      <div>
        <h3 class="text-[16px] font-bold leading-none tracking-tight">{{ title }}</h3>
        <p v-if="description" class="mt-1.5 text-xs text-muted-foreground">{{ description }}</p>
      </div>
      <div class="flex items-center gap-2"><slot name="actions" /></div>
    </header>
    <div :class="padded ? 'p-5' : ''" class="flex-1 min-h-0"><slot /></div>
  </section>
</template>
