<script setup>
import { ChevronRight } from 'lucide-vue-next'

// 순위 목록 (v4 rank-item): 번호 칩(1위는 SK Red) · 제목 · 설명 · 건수 · 우측 보조 표시
// compact: 번호 · 제목 · 건수만 (설명은 hint로 마우스 오버 시 표시)
defineProps({
  items: { type: Array, default: () => [] }, // [{ key, title, desc, count, hint }]
  unit: { type: String, default: '건' },
  compact: Boolean,
})
defineEmits(['select'])
</script>

<template>
  <ul>
    <li v-for="(it, i) in items" :key="it.key" class="border-b border-[#f1f2f5] last:border-0">
      <button
        :class="compact ? 'py-2.5' : 'py-3'"
        class="group flex w-full items-center gap-3.5 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
        :title="it.hint"
        @click="$emit('select', it)"
      >
        <span
          :class="i === 0 ? 'bg-brand-soft text-primary' : 'bg-chart-track text-[#6f7684]'"
          class="grid size-[25px] shrink-0 place-items-center rounded-[7px] text-[12px] font-bold tabular"
        >{{ String(i + 1).padStart(2, '0') }}</span>
        <span class="min-w-0 flex-1">
          <span class="block truncate text-[14px] font-semibold group-hover:text-primary"><slot name="title" :item="it">{{ it.title }}</slot></span>
          <span v-if="!compact && (it.desc || $slots.desc)" class="mt-1 block truncate text-[12px] text-[#6f7684]"><slot name="desc" :item="it">{{ it.desc }}</slot></span>
        </span>
        <span class="shrink-0 text-[16px] font-bold tabular">{{ it.count.toLocaleString() }}<small class="ml-0.5 text-[12px] font-normal text-[#6f7684]">{{ unit }}</small></span>
        <template v-if="!compact">
          <slot name="aside" :item="it" :index="i" />
          <ChevronRight class="size-4 shrink-0 text-[#c4c8cf] group-hover:text-primary" />
        </template>
      </button>
    </li>
  </ul>
</template>
