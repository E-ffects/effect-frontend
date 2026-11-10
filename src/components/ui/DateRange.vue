<script setup>
import { onBeforeUnmount, ref, watch } from 'vue'
import { CalendarDays } from 'lucide-vue-next'
import Button from './Button.vue'
import { daysAgo } from '@/lib/api'

// block: 필터 칸에 맞춰 너비를 채운다 · clearable: 기간을 비울 수 있다 (비면 placeholder 표시)
const props = defineProps({
  from: String, to: String, maxDays: { type: Number, default: 366 },
  block: Boolean, clearable: Boolean, placeholder: { type: String, default: '기간 전체' }, align: { type: String, default: 'right' },
})
const emit = defineEmits(['apply'])

const open = ref(false)
const draftFrom = ref(props.from)
const draftTo = ref(props.to)
const error = ref('')
const root = ref(null)

watch(open, (v) => {
  if (v) {
    draftFrom.value = props.from
    draftTo.value = props.to
    error.value = ''
  }
})

function quick(n) {
  draftTo.value = daysAgo(0)
  draftFrom.value = daysAgo(n - 1)
}

function apply() {
  const a = new Date(draftFrom.value)
  const b = new Date(draftTo.value)
  if (!draftFrom.value || !draftTo.value || a > b || (b - a) / 86400000 > props.maxDays) {
    error.value = '기간을 확인하세요'
    return
  }
  emit('apply', { from: draftFrom.value, to: draftTo.value })
  open.value = false
}

function clear() {
  emit('apply', { from: '', to: '' })
  open.value = false
}

function outside(e) {
  if (open.value && root.value && !root.value.contains(e.target)) open.value = false
}
addEventListener('mousedown', outside)
onBeforeUnmount(() => removeEventListener('mousedown', outside))
</script>

<template>
  <div ref="root" class="relative">
    <Button
      type="button" variant="outline" :size="block ? 'default' : 'sm'"
      :class="block ? 'w-full justify-start! px-3! font-normal!' : ''" @click="open = !open"
    >
      <CalendarDays class="size-3.5 shrink-0 text-muted-foreground" />
      <span v-if="from || to" class="truncate tabular">{{ from || '…' }} ~ {{ to || '…' }}</span>
      <span v-else class="truncate text-muted-foreground">{{ placeholder }}</span>
    </Button>
    <div v-if="open" :class="align === 'left' ? 'left-0' : 'right-0'" class="absolute z-40 mt-2 w-[300px] rounded-lg border bg-card p-4 shadow-lg">
      <p class="mb-2 text-xs font-medium text-muted-foreground">빠른 선택</p>
      <div class="mb-3 flex gap-1.5">
        <Button v-for="n in [7, 30, 90]" :key="n" type="button" variant="secondary" size="xs" @click="quick(n)">최근 {{ n }}일</Button>
      </div>
      <div class="grid grid-cols-2 gap-2">
        <label class="text-xs text-muted-foreground">시작일
          <input v-model="draftFrom" type="date" class="mt-1 h-8 w-full rounded-md border px-2 text-xs text-foreground" />
        </label>
        <label class="text-xs text-muted-foreground">종료일
          <input v-model="draftTo" type="date" class="mt-1 h-8 w-full rounded-md border px-2 text-xs text-foreground" />
        </label>
      </div>
      <p v-if="error" class="mt-2 text-xs text-destructive">{{ error }}</p>
      <p v-if="maxDays !== Infinity" class="mt-2 text-[12px] text-muted-foreground">최대 1년까지 선택할 수 있습니다.</p>
      <div class="mt-3 flex items-center justify-end gap-2">
        <Button v-if="clearable" type="button" variant="link" size="sm" class="mr-auto px-0" :disabled="!from && !to" @click="clear">기간 지우기</Button>
        <Button type="button" variant="ghost" size="sm" @click="open = false">취소</Button>
        <Button type="button" size="sm" @click="apply">적용</Button>
      </div>
    </div>
  </div>
</template>
