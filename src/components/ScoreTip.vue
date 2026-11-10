<script setup>
import { useRouter } from 'vue-router'
import { Info } from 'lucide-vue-next'
import HoverTip from './ui/HoverTip.vue'

const props = defineProps({
  score: Number,
  breakdown: { type: Array, default: () => [] }, // [{ label, weight, score, detail }]
  evidence: { type: Array, default: () => [] },
  pinned: Boolean,
})
const router = useRouter()
const total = () => props.breakdown.reduce((s, b) => s + b.weight * b.score, 0)
</script>

<template>
  <HoverTip :width="380" :delay="0">
    <span class="inline-flex cursor-help items-center gap-1 font-bold tabular underline decoration-dotted decoration-[#c4c8cf] underline-offset-4" tabindex="0">
      {{ score.toFixed(1) }} <Info class="size-3.5 text-muted-foreground" />
    </span>
    <template #content>
      <p class="mb-2 font-semibold">우선순위 산정 근거</p>
      <table class="w-full">
        <thead class="text-muted-foreground">
          <tr><th class="pb-1 text-left font-medium">요소</th><th class="whitespace-nowrap pb-1 pl-3 text-right font-medium">가중치 × 점수</th><th class="whitespace-nowrap pb-1 pl-3 text-right font-medium">기여</th></tr>
        </thead>
        <tbody>
          <tr v-for="b in breakdown" :key="b.key" class="border-t">
            <td class="py-1.5">{{ b.label }}<span class="block text-[12px] text-muted-foreground">{{ b.detail }}</span></td>
            <td class="whitespace-nowrap py-1.5 pl-3 text-right tabular">{{ Math.round(b.weight * 100) }}% × {{ b.score }}</td>
            <td class="whitespace-nowrap py-1.5 pl-3 text-right font-medium tabular">{{ (b.weight * b.score).toFixed(1) }}</td>
          </tr>
          <tr class="border-t font-semibold">
            <td class="pt-1.5">합계</td><td /><td class="pt-1.5 text-right tabular">{{ total().toFixed(1) }}</td>
          </tr>
        </tbody>
      </table>
      <p v-if="pinned" class="mt-2 rounded bg-brand-soft px-2 py-1 text-[#d91d40]">📌 심각도 CRITICAL — 점수와 관계없이 최상단 고정</p>
      <div v-if="evidence.length" class="mt-2">
        <p class="mb-1 text-muted-foreground">근거 RMA</p>
        <div class="flex flex-wrap gap-1">
          <button v-for="id in evidence" :key="id" class="rounded border px-1.5 py-0.5 hover:bg-muted" @click="router.push({ path: '/rmas', query: { open: id } })">{{ id }}</button>
        </div>
      </div>
      <p class="mt-2 text-[12px] text-muted-foreground">가중치는 설정값이며 화면에서 수정할 수 없습니다.</p>
    </template>
  </HoverTip>
</template>
