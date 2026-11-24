<script setup>
import { computed } from 'vue'

// 숫자 자리마다 0~9 띠가 굴러 새 값에 멈춘다 (Kokonut UI Bell Button의 RollingNumber, MIT)
// 오른쪽 자리부터 키를 매겨, 자리가 늘어도 일의 자리는 일의 자리로 남는다
const props = defineProps({ text: { type: [String, Number], required: true }, lineHeight: { type: Number, default: 16 } })
const chars = computed(() => {
  const t = String(props.text)
  return t.split('').map((c, i) => ({ c, key: t.length - i, digit: c >= '0' && c <= '9' ? Number(c) : null }))
})
</script>

<template>
  <span aria-hidden="true" class="inline-flex tabular">
    <template v-for="ch in chars" :key="ch.key">
      <span v-if="ch.digit === null">{{ ch.c }}</span>
      <span v-else class="relative inline-block overflow-hidden" :style="{ height: `${lineHeight}px` }">
        <span class="flex flex-col transition-transform duration-300 ease-[var(--ease-out)]" :style="{ transform: `translateY(${-ch.digit * 10}%)` }">
          <span v-for="d in 10" :key="d" :style="{ height: `${lineHeight}px`, lineHeight: `${lineHeight}px` }">{{ d - 1 }}</span>
        </span>
      </span>
    </template>
  </span>
</template>
