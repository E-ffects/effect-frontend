<script setup>
import { computed } from 'vue'
import { Loader2 } from 'lucide-vue-next'

const props = defineProps({
  variant: { type: String, default: 'default' },
  size: { type: String, default: 'default' },
  loading: Boolean,
  disabled: Boolean,
  type: { type: String, default: 'button' },
})

const variants = {
  default: 'bg-primary text-primary-foreground hover:bg-primary/90 shadow-xs',
  outline: 'border bg-card hover:bg-accent',
  secondary: 'bg-brand-soft text-primary hover:bg-brand-line/60',
  ghost: 'hover:bg-accent',
  destructive: 'bg-destructive text-white hover:bg-destructive/90',
  link: 'underline-offset-4 hover:underline px-0! h-auto!',
}
const sizes = {
  default: 'h-9 px-4 text-sm',
  sm: 'h-8 px-3 text-xs',
  xs: 'h-7 px-2.5 text-xs',
  icon: 'size-9',
  'icon-sm': 'size-7',
}
const cls = computed(() => [
  'inline-flex items-center justify-center gap-1.5 whitespace-nowrap rounded-lg font-semibold transition-colors',
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50 disabled:pointer-events-none',
  variants[props.variant],
  sizes[props.size],
])
</script>

<template>
  <button :type="type" :class="cls" :disabled="disabled || loading">
    <Loader2 v-if="loading" class="size-4 animate-spin" />
    <slot />
  </button>
</template>
