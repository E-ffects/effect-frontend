<script setup>
import { ChevronDown } from 'lucide-vue-next'

const model = defineModel()
defineProps({
  options: { type: Array, default: () => [] }, // [{ value, label }] or strings
  placeholder: String,
  size: { type: String, default: 'default' },
  id: String, // <label for>와 연결되도록 select 요소에 붙인다
})
</script>

<template>
  <div class="relative inline-flex">
    <select
      :id="id"
      v-model="model"
      :class="size === 'sm' ? 'h-8 text-xs' : 'h-9 text-sm'"
      class="w-full appearance-none rounded-md border bg-card pl-3 pr-8 shadow-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
    >
      <option v-if="placeholder !== undefined" value="">{{ placeholder }}</option>
      <option v-for="o in options" :key="o.value ?? o" :value="o.value ?? o">{{ o.label ?? o }}</option>
    </select>
    <ChevronDown class="pointer-events-none absolute right-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
  </div>
</template>
