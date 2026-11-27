<script setup>
import { computed, ref, watch } from 'vue'
import { Check, Copy, Share2, X } from 'lucide-vue-next'

const props = defineProps({
  open: { type: Boolean, default: false },
  // { kind: 'rma'|'pattern', id, title?, partNo?, defectType?, customerName?, summary?, count? }
  item: { type: Object, default: null },
})

const emit = defineEmits(['close'])

const DEPTS = [
  { id: 'mfg', label: '제조·공정팀', desc: '설비 · 영향 Lot · 공정 조치', chip: 'border-teal-400/50 bg-teal-500/20 text-teal-200' },
  { id: 'cs', label: 'CS팀', desc: '고객 안내 · 처리방안 · 일정', chip: 'border-blue-400/50 bg-blue-500/20 text-blue-200' },
  { id: 'exec', label: '경영진·팀장', desc: '손실 · 재발 리스크 · 승인', chip: 'border-violet-400/50 bg-violet-500/20 text-violet-200' },
]

const dept = ref('mfg')
const copied = ref(false)
const shared = ref(false)

watch(
  () => props.open,
  (v) => {
    if (v) {
      copied.value = false
      shared.value = false
    }
  },
)

const deepLink = computed(() => {
  if (!props.item) return ''
  const q = props.item.kind === 'pattern' ? `patternId=${props.item.id}` : `rmaId=${props.item.id}`
  return `${window.location.origin}/m?${q}`
})

const headerTitle = computed(() => {
  if (!props.item) return ''
  const prefix = props.item.kind === 'pattern' ? `패턴 ${props.item.id}` : props.item.id
  const deptName = DEPTS.find((d) => d.id === dept.value)?.label || ''
  return `[E!ffect → ${deptName}] ${prefix}`
})

const lines = computed(() => {
  const it = props.item
  if (!it) return []
  const part = it.partNo || it.product || 'PCB 품목'
  const defect = it.defectType || '불량 유형 확인 중'

  if (dept.value === 'mfg') {
    return [
      `• 대상: ${it.kind === 'pattern' ? `패턴 ${it.id} (${it.count ?? '-'}건)` : it.id} · ${part} (${defect})`,
      `• 핵심: ${it.summary || '공정·설비 이상 신호 및 영향 Lot 확인 완료'}`,
      '• 요청: 해당 설비 조건 점검 및 동일 Lot 봉쇄 여부 확인 부탁드립니다.',
    ]
  }
  if (dept.value === 'cs') {
    return [
      `• 고객사/건: ${it.customerName || '담당 고객사'} · ${it.kind === 'pattern' ? `패턴 ${it.id}` : it.id} (${defect})`,
      `• 현황: ${it.summary || 'QA 원인 분석 완료 및 권장 처리방안 도출됨'}`,
      '• 안내: 아래 링크에서 고객 회신 초안 확인 후 1차 회신 진행 부탁드립니다.',
    ]
  }
  return [
    `• 이슈: ${it.kind === 'pattern' ? `반복 불량 패턴 ${it.id} (${it.count ?? '-'}건)` : `${it.id} (${part} · ${defect})`}`,
    `• 요약: ${it.summary || 'AI 원인 분석 및 시정 대책 초안 작성 완료'}`,
    '• 요청: 링크에서 핵심 근거 및 대책안 검토·승인 부탁드립니다.',
  ]
})

const fullShareText = computed(() => `${headerTitle.value}\n\n${lines.value.join('\n')}\n\nAI 상세 보기: ${deepLink.value}`)

async function doCopy() {
  try {
    await navigator.clipboard.writeText(fullShareText.value)
    copied.value = true
    setTimeout(() => (copied.value = false), 2000)
  } catch {
    /* ignore */
  }
}

async function doShare() {
  try {
    if (navigator.share) {
      await navigator.share({ title: headerTitle.value, text: fullShareText.value })
      shared.value = true
      setTimeout(() => emit('close'), 500)
    } else {
      await doCopy()
    }
  } catch {
    /* user cancelled share sheet */
  }
}
</script>

<template>
  <Transition
    enter-from-class="opacity-0"
    leave-to-class="opacity-0"
    enter-active-class="transition-opacity duration-200"
    leave-active-class="transition-opacity duration-150"
  >
    <div v-if="open && item" class="fixed inset-0 z-50 flex items-end justify-center bg-black/65" @click="emit('close')">
      <div
        class="w-full max-w-lg rounded-t-[26px] border-t border-white/14 bg-[#0b0f1f] px-5 pt-4 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-[#eef0f6] shadow-2xl"
        @click.stop
      >
        <!-- Handle & Header -->
        <div class="mx-auto mb-3 h-1 w-10 rounded-full bg-white/20" />
        <div class="flex items-center justify-between">
          <div>
            <p class="text-[11.5px] font-medium text-cyan-300">부서별 맞춤 핸드오프</p>
            <h3 class="text-[16px] font-semibold text-white">어느 부서로 공유할까요?</h3>
          </div>
          <button
            class="grid size-8 place-items-center rounded-full bg-white/10 text-[#b9becf] hover:text-white"
            aria-label="닫기"
            @click="emit('close')"
          >
            <X class="size-4" />
          </button>
        </div>

        <!-- Department Chips -->
        <div class="mt-3.5 grid grid-cols-3 gap-2">
          <button
            v-for="d in DEPTS"
            :key="d.id"
            class="rounded-2xl border px-2.5 py-2.5 text-left transition active:scale-[0.98]"
            :class="dept === d.id ? d.chip : 'border-white/10 bg-white/[0.04] text-[#b9becf]'"
            @click="dept = d.id"
          >
            <div class="text-[12.5px] font-semibold">{{ d.label }}</div>
            <div class="mt-0.5 truncate text-[10px] opacity-80">{{ d.desc }}</div>
          </button>
        </div>

        <!-- Auto-generated 3-line summary preview -->
        <div class="mt-3.5 rounded-2xl border border-white/10 bg-[#060913] p-3.5 text-[12.5px] leading-relaxed text-[#d7dce9]">
          <p class="mb-1.5 text-[11.5px] font-semibold text-white">{{ headerTitle }}</p>
          <p v-for="(line, idx) in lines" :key="idx" class="mt-1">{{ line }}</p>
          <p class="mt-2 truncate text-[11px] text-cyan-300">🔗 {{ deepLink }}</p>
        </div>

        <!-- Action Buttons -->
        <div class="mt-4 flex gap-2">
          <button
            class="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/16 bg-white/[0.08] py-3 text-[13px] font-medium text-white transition active:scale-[0.98]"
            @click="doCopy"
          >
            <Check v-if="copied" class="size-4 text-emerald-300" />
            <Copy v-else class="size-4" />
            {{ copied ? '복사됨' : '요약 복사' }}
          </button>
          <button
            class="flex flex-[1.4] items-center justify-center gap-1.5 rounded-full bg-white py-3 text-[13px] font-semibold text-[#1c1d22] transition active:scale-[0.98]"
            @click="doShare"
          >
            <Check v-if="shared" class="size-4 text-emerald-600" />
            <Share2 v-else class="size-4" />
            메신저로 공유
          </button>
        </div>
      </div>
    </div>
  </Transition>
</template>
