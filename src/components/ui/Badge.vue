<script setup>
import { computed } from 'vue'

// v4 pill: 테두리 없이 옅은 배경 + 진한 글자
const props = defineProps({ tone: { type: String, default: 'gray' } })

const tones = {
  default: 'bg-primary text-primary-foreground',
  outline: 'bg-card text-[#6c7380] ring-1 ring-inset ring-border',
  gray: 'bg-[#f0f2f5] text-[#6c7380]',
  red: 'bg-[#fff0f3] text-[#d91d40]',
  orange: 'bg-sk-orange-soft text-[#d57425]',
  yellow: 'bg-[#fff8e6] text-[#a8711a]',
  blue: 'bg-[#edf3fc] text-[#4269af]',
  purple: 'bg-[#f2eef9] text-[#8064aa]',
  green: 'bg-[#eaf6f0] text-[#20866a]',
}
const cls = computed(() => tones[props.tone] || tones.gray)
</script>

<template>
  <span :class="cls" class="inline-flex items-center gap-1 rounded-[5px] px-[7px] py-[3px] text-[12px] font-semibold leading-none whitespace-nowrap">
    <slot />
  </span>
</template>
