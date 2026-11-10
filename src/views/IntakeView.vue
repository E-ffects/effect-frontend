<script setup>
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { useRouter } from 'vue-router'
import { CheckCircle2, RotateCcw, Send } from 'lucide-vue-next'
import Badge from '@/components/ui/Badge.vue'
import Button from '@/components/ui/Button.vue'
import Card from '@/components/ui/Card.vue'
import Input from '@/components/ui/Input.vue'
import Select from '@/components/ui/Select.vue'
import Skeleton from '@/components/ui/Skeleton.vue'
import PageHead from '@/components/PageHead.vue'
import { api } from '@/lib/api'
import { reportLoadError, toast } from '@/lib/state'

// CS 반품·불량 접수: 대분류와 상세 설명(자연어)을 입력해 등록한다.
// 저장 뒤 서버가 상세 설명으로 소분류를 자동 분류해 함께 저장한다 (CS는 소분류를 고르거나 확인하지 않음).
const router = useRouter()
const opts = ref(null)
const today = new Date().toLocaleDateString('sv-SE') // YYYY-MM-DD (로컬 날짜)
const DETAIL_MIN = 10
const DETAIL_MAX = 1000
const ETC = '기타' // 목록에 없는 불량: 내용은 상세 설명으로 받는다
const DETAIL_PLACEHOLDER = '예) 서버에 장착하면 전원은 들어오지만 드라이브가 인식되지 않습니다.\n대용량 백업을 시작하고 30분쯤 지나면 연결이 끊깁니다.\n커넥터 옆 라벨이 약 2cm 찢어져 있었습니다.\n\n언제, 어떤 장비에서, 어떤 증상이 나타났는지 상세히 적어 주세요.'

const blank = () => ({
  customer_name: '', claim_channel: '', product: '', claim_qty: 1, serial_text: '',
  occurrence_date: today, detection_stage: '고객사', customer_request: '', major: '', detail: '',
})
const form = reactive(blank())
const tried = ref(false) // 접수를 한 번 눌렀으면 빈 필수 항목을 표시
const saving = ref(false)
const done = ref(null) // 접수 완료 결과 (자동 분류 결과 포함)

onMounted(async () => {
  try {
    opts.value = await api('/intake/options')
  } catch (e) {
    reportLoadError(e)
  }
})

const productOptions = computed(() =>
  (opts.value?.products || []).map((p) => ({ value: p.code, label: `${p.code} ${p.name}${p.customer ? `, ${p.customer}` : ''}` })),
)

// 고객사를 고르면 접수 채널 기본값을 맞춘다 (기업 → 전용 포털, 일반 → 웹폼)
watch(() => form.customer_name, (c) => {
  if (!c || !opts.value) return
  const want = c === '일반 고객' ? opts.value.channels.find((x) => x.includes('일반')) : opts.value.channels.find((x) => x.includes('기업'))
  if (want) form.claim_channel = want
})

const detailLen = computed(() => form.detail.trim().length)
// 시리얼: 쉼표·줄바꿈·공백으로 구분, 대문자로 맞추고 중복 제거
const serials = computed(() => [...new Set(form.serial_text.split(/[\s,;]+/).map((x) => x.trim().toUpperCase()).filter(Boolean))])
const serialOver = computed(() => serials.value.length > (Number(form.claim_qty) || 0))
const errors = computed(() => ({
  customer_name: !form.customer_name && '고객사를 선택하세요',
  claim_channel: !form.claim_channel && '접수 채널을 선택하세요',
  product: !form.product && '제품을 선택하세요',
  claim_qty: !(Number(form.claim_qty) >= 1) && '1개 이상 입력하세요',
  occurrence_date: (!form.occurrence_date && '발생일을 입력하세요') || (form.occurrence_date > today && '발생일은 오늘 이후일 수 없습니다'),
  major: !form.major && '불량 대분류를 선택하세요',
  detail: detailLen.value < DETAIL_MIN && `상세 설명을 ${DETAIL_MIN}자 이상 적어 주세요`,
  serials: (serialOver.value && `시리얼이 클레임 수량보다 ${serials.value.length - (Number(form.claim_qty) || 0)}개 많습니다`) || (serials.value.some((x) => x.length > 40) && '시리얼 번호는 40자 이내로 입력하세요'),
}))
const err = (k) => (tried.value ? errors.value[k] : '')
const valid = computed(() => !Object.values(errors.value).some(Boolean))

async function submit() {
  tried.value = true
  if (!valid.value) {
    toast({ title: '빠진 항목을 채워 주세요', tone: 'red' })
    return
  }
  saving.value = true
  try {
    const { serial_text: _s, ...rest } = form
    const body = { ...rest, claim_qty: Number(form.claim_qty), customer_request: form.customer_request || null, serial_numbers: serials.value }
    const res = await api('/intake', { method: 'POST', body })
    done.value = { ...res, customer_name: form.customer_name, product: form.product, claim_qty: form.claim_qty, serials: serials.value.length }
    toast({ title: `${res.rma_id} 접수했습니다`, description: '품질팀 RMA 조회에 바로 나타납니다', tone: 'green' })
  } catch (e) {
    toast({ title: e.message, tone: 'red' })
  } finally {
    saving.value = false
  }
}

function again() {
  Object.assign(form, blank())
  tried.value = false
  done.value = null
}

// 접수 뒤 처리 순서 (업무 흐름도: 저장 → 자동 분류 → 품질 분석·원인 확정 → 고객 처리 결정)
const afterSteps = computed(() => [
  { title: 'RMA 저장', desc: "상태 '분석 대기', 심각도 '판정 보류'" },
  { title: '소분류 자동 분류', desc: `상세 설명으로 분류해 함께 저장합니다` },
  { title: '품질팀 분석', desc: '검사와 이력을 바탕으로 원인을 확정합니다' },
  { title: '고객 처리 결정 및 안내', desc: '분석 결과를 받아 교체, 수리, 환불을 정하고 고객에게 안내합니다' },
])

const statusTone = (s) => (s === '분류 완료' ? 'green' : s === '정보 부족' || s === '미분류' ? 'gray' : 'yellow')
const plain = (s) => s.replaceAll('·', '/') // v14 대분류명의 가운뎃점은 화면에서만 바꾼다 (저장값은 원본 유지)
const field = 'grid gap-1.5'
const labelCls = 'text-[13px] font-semibold text-[#3b404a]'
const hintCls = 'text-xs text-muted-foreground'
const errCls = 'text-xs text-destructive'
const reqCls = 'ml-0.5 text-sk-orange'
</script>

<template>
  <PageHead :crumb="false" title="반품 접수" description="고객의 반품 및 불량 내용을 등록하면 품질팀에 바로 전달되고, 소분류는 자동 분류됩니다." />

  <!-- 접수 완료 -->
  <Card v-if="done" class="mx-auto max-w-[640px]">
    <div class="flex flex-col items-center py-6 text-center">
      <CheckCircle2 class="size-10 text-emerald-600" />
      <h2 class="mt-3 text-[20px] font-bold tracking-tight">{{ done.rma_id }} 접수 완료</h2>
      <p class="mt-1 text-sm text-muted-foreground">{{ done.customer_name }}, {{ done.product }}, {{ done.claim_qty }}개<template v-if="done.serials">, 시리얼 {{ done.serials }}개</template></p>
      <dl class="mt-5 grid w-full max-w-[440px] grid-cols-[96px_1fr] gap-y-2.5 rounded-lg bg-muted/50 px-4 py-3 text-left text-sm">
        <dt class="text-muted-foreground">불량 유형</dt>
        <dd class="font-medium">{{ plain(done.major) }}<template v-if="done.subtype">&nbsp;<span class="text-[#c4c8cf]">/</span> {{ plain(done.subtype) }}</template></dd>
        <dt class="text-muted-foreground">자동 분류</dt>
        <dd class="grid gap-1.5">
          <div class="flex flex-wrap items-center gap-1.5">
            <Badge :tone="statusTone(done.status)">{{ done.status }}</Badge>
            <span v-for="w in done.evidence" :key="w" class="rounded bg-card px-1.5 py-0.5 text-xs font-medium">{{ w }}</span>
          </div>
          <p v-if="!done.subtype && done.candidates.length" class="text-xs">후보: {{ done.candidates.map(plain).join(', ') }}</p>
          <p v-if="done.reason" class="text-xs text-muted-foreground">{{ done.reason }}</p>
        </dd>
        <dt class="text-muted-foreground">처리 상태</dt><dd>분석 대기 <span class="text-xs text-muted-foreground">(심각도 판정 보류)</span></dd>
      </dl>
      <div class="mt-6 flex gap-2">
        <Button variant="outline" @click="again"><RotateCcw class="size-4" />새로 접수</Button>
        <Button @click="router.push({ path: '/rmas', query: { open: done.rma_id } })">RMA 조회에서 보기</Button>
      </div>
    </div>
  </Card>

  <div v-else-if="!opts" class="grid grid-cols-12 gap-4">
    <Skeleton class="col-span-12 h-[560px] rounded-[14px] lg:col-span-8" />
    <Skeleton class="col-span-12 h-[260px] rounded-[14px] lg:col-span-4" />
  </div>

  <form v-else class="grid grid-cols-12 items-start gap-4" novalidate @submit.prevent="submit">
    <Card class="col-span-12 lg:col-span-8" :padded="false">
      <!-- 고객·제품 -->
      <fieldset class="border-b px-6 pb-6 pt-5">
        <legend class="sr-only">고객 및 제품</legend>
        <h2 class="mb-4 text-[15px] font-bold">고객 및 제품</h2>
        <div class="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-2">
          <div :class="field">
            <label :class="labelCls" for="f-customer">고객사<span :class="reqCls" title="필수 입력">*</span></label>
            <Select id="f-customer" v-model="form.customer_name" placeholder="선택" :options="opts.customers" class="w-full" />
            <p v-if="err('customer_name')" :class="errCls">{{ err('customer_name') }}</p>
          </div>
          <div :class="field">
            <label :class="labelCls" for="f-channel">접수 채널<span :class="reqCls" title="필수 입력">*</span></label>
            <Select id="f-channel" v-model="form.claim_channel" placeholder="고객사를 고르면 자동 선택" :options="opts.channels" class="w-full" />
            <p v-if="err('claim_channel')" :class="errCls">{{ err('claim_channel') }}</p>
          </div>
          <div :class="field">
            <label :class="labelCls" for="f-product">제품<span :class="reqCls" title="필수 입력">*</span></label>
            <Select id="f-product" v-model="form.product" placeholder="선택" :options="productOptions" class="w-full" />
            <p v-if="err('product')" :class="errCls">{{ err('product') }}</p>
          </div>
          <div :class="field">
            <label :class="labelCls" for="f-qty">클레임 수량<span :class="reqCls" title="필수 입력">*</span></label>
            <div class="relative w-[140px]">
              <Input id="f-qty" v-model="form.claim_qty" type="number" min="1" max="10000" inputmode="numeric" class="pr-8 tabular" :invalid="!!err('claim_qty')" />
              <span class="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground">개</span>
            </div>
            <p v-if="err('claim_qty')" :class="errCls">{{ err('claim_qty') }}</p>
          </div>
          <div :class="field" class="sm:col-span-2">
            <div class="flex items-end justify-between">
              <label :class="labelCls" for="f-serial">시리얼 번호 <span class="font-normal text-muted-foreground">(선택, SSD 라벨의 S/N)</span></label>
              <span :class="serialOver ? 'text-destructive' : 'text-muted-foreground'" class="text-xs tabular">{{ serials.length }}개 입력 / 수량 {{ Number(form.claim_qty) || 0 }}개</span>
            </div>
            <textarea
              id="f-serial" v-model="form.serial_text" rows="2" spellcheck="false" autocomplete="off"
              placeholder="예: SN-0002-01, SN-0002-02 (여러 개는 쉼표나 줄바꿈으로 구분)"
              :class="err('serials') ? 'border-destructive' : ''"
              class="w-full resize-y rounded-md border bg-card px-3 py-2 font-mono text-[13px] leading-relaxed shadow-xs placeholder:font-sans placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
            />
            <p v-if="err('serials')" :class="errCls">{{ err('serials') }}</p>
            <p v-else :class="hintCls">LOT, 생산 공정, 설비는 품질팀 분석 단계에서 시리얼로 조회합니다. 고객이 모르면 비워 두세요.</p>
          </div>
        </div>
      </fieldset>

      <!-- 불량 내용 -->
      <fieldset class="border-b px-6 pb-6 pt-5">
        <legend class="sr-only">불량 내용</legend>
        <h2 class="mb-4 text-[15px] font-bold">불량 내용</h2>
        <div :class="field">
          <span :class="labelCls" id="l-major">불량 대분류<span :class="reqCls" title="필수 입력">*</span></span>
          <div role="radiogroup" aria-labelledby="l-major" class="flex flex-wrap gap-1.5">
            <label
              v-for="t in opts.taxonomy" :key="t.major"
              :class="form.major === t.major ? 'border-primary bg-brand-soft text-primary' : 'bg-card text-[#4a505c] hover:border-[#c9ced6]'"
              class="cursor-pointer rounded-lg border px-3 py-2 text-[13px] font-semibold transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50"
            >
              <input v-model="form.major" type="radio" name="major" :value="t.major" class="sr-only" />{{ plain(t.major) }}
            </label>
          </div>
          <p v-if="err('major')" :class="errCls">{{ err('major') }}</p>
          <p v-else-if="form.major === ETC" :class="hintCls">목록에 없는 불량은 아래 상세 설명에 내용을 적어 주세요.</p>
        </div>

        <div :class="field" class="mt-5">
          <div class="flex items-end justify-between">
            <label :class="labelCls" for="f-detail">상세 설명<span :class="reqCls" title="필수 입력">*</span></label>
            <span :class="detailLen > DETAIL_MAX ? 'text-destructive' : 'text-muted-foreground'" class="text-xs tabular">{{ detailLen }} / {{ DETAIL_MAX }}</span>
          </div>
          <textarea
            id="f-detail" v-model="form.detail" rows="6" :maxlength="DETAIL_MAX"
            :placeholder="DETAIL_PLACEHOLDER"
            :class="err('detail') ? 'border-destructive' : ''"
            class="w-full resize-y rounded-md border bg-card px-3 py-2.5 text-sm leading-relaxed shadow-xs placeholder:text-muted-foreground/60 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50"
          />
          <p v-if="err('detail')" :class="errCls">{{ err('detail') }}</p>
          <p v-else :class="hintCls">{{ form.major === ETC ? "'기타'는 소분류 없이 저장되고, 품질팀이 상세 설명을 보고 판단합니다." : '접수하면 상세 설명으로 소분류(관찰된 상황)가 자동 분류되어 품질팀에 함께 전달됩니다.' }}</p>
        </div>
      </fieldset>

      <!-- 접수 정보 -->
      <fieldset class="px-6 pb-6 pt-5">
        <legend class="sr-only">접수 정보</legend>
        <h2 class="mb-4 text-[15px] font-bold">접수 정보</h2>
        <div class="grid grid-cols-1 gap-x-4 gap-y-4 sm:grid-cols-3">
          <div :class="field">
            <label :class="labelCls" for="f-occ">발생일<span :class="reqCls" title="필수 입력">*</span></label>
            <Input id="f-occ" v-model="form.occurrence_date" type="date" :max="today" class="tabular" :invalid="!!err('occurrence_date')" />
            <p v-if="err('occurrence_date')" :class="errCls">{{ err('occurrence_date') }}</p>
          </div>
          <div :class="field">
            <label :class="labelCls" for="f-stage">발견 단계<span :class="reqCls" title="필수 입력">*</span></label>
            <Select id="f-stage" v-model="form.detection_stage" :options="opts.stages" class="w-full" />
          </div>
          <div :class="field">
            <span :class="labelCls" id="l-req">고객 요청 <span class="font-normal text-muted-foreground">(선택)</span></span>
            <div role="radiogroup" aria-labelledby="l-req" class="flex h-9 rounded-md border bg-card p-0.5">
              <label
                v-for="o in ['', ...opts.requests]" :key="o || 'none'"
                :class="form.customer_request === o ? 'bg-primary text-primary-foreground' : 'text-[#4a505c] hover:bg-muted'"
                class="flex flex-1 cursor-pointer items-center justify-center rounded text-[13px] font-medium has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/50"
              >
                <input v-model="form.customer_request" type="radio" name="request" :value="o" class="sr-only" />{{ o || '미정' }}
              </label>
            </div>
          </div>
        </div>
        <p :class="hintCls" class="mt-3">접수일은 오늘({{ today }})로 기록됩니다.</p>
      </fieldset>
    </Card>

    <!-- 접수 후 처리 안내 + 접수 -->
    <aside class="col-span-12 grid gap-4 lg:sticky lg:top-[84px] lg:col-span-4">
      <Card title="접수 후 처리">
        <ol class="grid gap-3 text-sm">
          <li v-for="(step, i) in afterSteps" :key="step.title" class="flex gap-2.5">
            <span class="grid size-6 shrink-0 place-items-center rounded-full bg-muted text-xs font-bold">{{ i + 1 }}</span>
            <span><b class="font-semibold">{{ step.title }}</b><span class="block text-xs text-muted-foreground">{{ step.desc }}</span></span>
          </li>
        </ol>
      </Card>

      <div class="rounded-[14px] border bg-card p-5">
        <Button type="submit" class="h-11 w-full text-[15px]" :loading="saving" :disabled="saving"><Send class="size-4" />접수하기</Button>
        <p class="mt-2.5 text-center text-xs text-muted-foreground">자동 분류가 실패해도 접수는 저장되고, 소분류는 '분류 대기'로 남습니다.</p>
      </div>
    </aside>
  </form>
</template>
