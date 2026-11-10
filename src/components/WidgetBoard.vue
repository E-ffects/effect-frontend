<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { GripVertical, Maximize2, Minimize2, Plus, X } from 'lucide-vue-next'
import Button from './ui/Button.vue'
import { api } from '@/lib/api'
import { toast } from '@/lib/state'

// 대시보드 위젯 편집: 이동(⠿) · 크기(1/4 → 1/2 → 전체폭 순환) · 숨김(✕) · 추가(+), 사용자별 저장
const props = defineProps({ dashboard: String, titles: Object })
const editing = defineModel('editing', { type: Boolean, default: false })

const layout = ref([])
const defaults = ref([])
let snapshot = []
const dragId = ref(null)
const saving = ref(false)
const addOpen = ref(false)

const visible = computed(() => layout.value.filter((w) => !w.hidden))
// 4열 격자: 1/4폭은 넓은 화면에서만 한 칸, 좁아지면 반·전체로 늘어난다
const SPAN = { quarter: 'col-span-4 md:col-span-2 xl:col-span-1', half: 'col-span-4 xl:col-span-2', full: 'col-span-4' }
const NEXT = { quarter: 'half', half: 'full', full: 'quarter' }
const SIZE_LABEL = { quarter: '1/4폭', half: '1/2폭', full: '전체폭' }
const hidden = computed(() => layout.value.filter((w) => w.hidden))

onMounted(async () => {
  const res = await api(`/dashboard/layout/${props.dashboard}`)
  layout.value = res.layout
  defaults.value = res.default
})

watch(editing, (v) => {
  if (v) snapshot = JSON.parse(JSON.stringify(layout.value))
})

function onDrop(targetId) {
  const from = layout.value.findIndex((w) => w.id === dragId.value)
  const to = layout.value.findIndex((w) => w.id === targetId)
  if (from < 0 || to < 0 || from === to) return
  const [moved] = layout.value.splice(from, 1)
  layout.value.splice(to, 0, moved)
  dragId.value = null
}

function cancel() {
  layout.value = snapshot
  editing.value = false
}

function reset() {
  layout.value = JSON.parse(JSON.stringify(defaults.value))
}

async function save() {
  saving.value = true
  try {
    await api(`/dashboard/layout/${props.dashboard}`, { method: 'PUT', body: { layout: layout.value } })
    editing.value = false
    toast({ title: '위젯 배치를 저장했습니다', tone: 'green' })
  } catch {
    toast({ title: '배치를 저장하지 못했습니다', tone: 'red' }) // 편집 내용은 유지
  } finally {
    saving.value = false
  }
}
</script>

<template>
  <div>
    <div v-if="editing" class="mb-3 flex items-center gap-2 rounded-lg border border-dashed bg-card px-4 py-2.5 text-sm">
      <span class="font-medium">위젯 편집 중</span>
      <span class="text-xs text-muted-foreground">⠿ 끌어서 순서 변경, 크기 1/4 → 1/2 → 전체, ✕ 숨김 (AI 요약, KPI는 상단 고정)</span>
      <div class="relative ml-auto">
        <Button variant="outline" size="sm" :disabled="!hidden.length" @click="addOpen = !addOpen"><Plus class="size-3.5" />위젯 추가</Button>
        <div v-if="addOpen && hidden.length" class="absolute right-0 z-30 mt-1 w-48 rounded-md border bg-card p-1 shadow-md">
          <button v-for="w in hidden" :key="w.id" class="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-muted" @click="w.hidden = false; addOpen = false">{{ titles[w.id] }}</button>
        </div>
      </div>
      <Button variant="ghost" size="sm" @click="reset">기본값 복원</Button>
      <Button variant="ghost" size="sm" @click="cancel">취소</Button>
      <Button size="sm" :loading="saving" @click="save">저장</Button>
    </div>
    <div class="grid grid-cols-4 gap-4">
      <div
        v-for="w in visible"
        :key="w.id"
        :class="[SPAN[w.width] || SPAN.half, editing ? 'rounded-[14px] ring-2 ring-dashed ring-brand-line ring-offset-2' : '', dragId === w.id ? 'opacity-50' : '']"
        class="relative"
        :draggable="editing"
        @dragstart="dragId = w.id"
        @dragend="dragId = null"
        @dragover.prevent
        @drop.prevent="onDrop(w.id)"
      >
        <div v-if="editing" class="absolute -top-3 right-3 z-10 flex items-center gap-1 rounded-md border bg-card p-0.5 shadow-sm">
          <span class="cursor-grab px-1 text-muted-foreground" title="이동"><GripVertical class="size-3.5" /></span>
          <button class="flex items-center gap-1 rounded px-1 py-1 text-[12px] font-semibold hover:bg-muted" :title="`${SIZE_LABEL[NEXT[w.width] || 'half']}로 변경`" @click="w.width = NEXT[w.width] || 'half'">
            <Minimize2 v-if="w.width === 'full'" class="size-3.5" /><Maximize2 v-else class="size-3.5" />{{ SIZE_LABEL[w.width] }}
          </button>
          <button class="rounded p-1 hover:bg-muted" title="숨김" @click="w.hidden = true"><X class="size-3.5" /></button>
        </div>
        <div :class="editing ? 'pointer-events-none select-none' : ''" class="h-full">
          <slot :name="w.id" />
        </div>
      </div>
    </div>
  </div>
</template>
