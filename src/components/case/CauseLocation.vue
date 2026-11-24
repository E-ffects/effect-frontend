<script setup>
import { computed, ref, watch } from 'vue'
import PcbStack3D from '@/components/case/PcbStack3D.vue'
import { loadStackup, PROCESSES, RANK, REGION_NAME, regionOfCandidate, regionOfLayer } from '@/lib/pcbRegion'

// 원인 위치 (품질관리자): 원인 후보의 공정·설비와 증상으로 "PCB 어느 부위, 생산 라인 어디"를 표시한다.
// 데이터에 보드 위 좌표는 없으므로 부위는 구조 단위(외층·내층·비아…)로만 그린다.
// 단면은 제품 스택업(public/pcb3d/stackups.json, 가정 치수)의 실제 층 수·순서로 그린다. 3D는 버튼을 눌렀을 때만 불러온다.
// compact: 그림(단면·생산 라인)만. 후보 설명·유출 원인·영향 Lot 요약은 다른 카드에 있으므로 뺀다
const props = defineProps({ result: Object, compact: Boolean })
const r = computed(() => props.result || {})

const symptom = computed(() => r.value.classification?.minor_code)
const cands = computed(() =>
  (r.value.cause_candidates || []).slice(0, 3).map((c, i) => {
    const region = regionOfCandidate(c, symptom.value)
    // 공정 근거 중 유사 사례가 아닌 것 (공정 신호·설비 이벤트 등)
    const signals = (c.evidence || []).filter((e) => e.type !== 'SIMILAR_CASE').map((e) => e.summary)
    return { ...c, idx: i, color: RANK[i], region, signals }
  }),
)
const escape = computed(() => (r.value.escape_candidates || [])[0])
// 부위별 가장 높은 순위
const regionRank = computed(() => {
  const m = {}
  for (const c of cands.value) if (c.region && m[c.region] === undefined) m[c.region] = c.idx
  return m
})
const fillOf = (region, base) => (regionRank.value[region] !== undefined ? RANK[regionRank.value[region]].fill : base)
const procRank = computed(() => {
  const m = {}
  for (const c of cands.value) if (c.process_id && m[c.process_id] === undefined) m[c.process_id] = c.idx
  return m
})
const lots = computed(() => r.value.candidate_lots || { items: [], total: 0 })
const topLot = computed(() => lots.value.items?.[0])
const sameEquip = (it) => it.shared?.find((s) => s.type === 'EQUIPMENT' && s.equipment_id === cands.value[0]?.equipment_id)

// 제품 스택업
const partNo = computed(() => r.value.trace_summary?.part_no)
const spec = ref(null)
watch(partNo, async (p) => { spec.value = p ? await loadStackup(p) : null }, { immediate: true })
const view = ref('2d') // 2d | 3d

// 스택업이 없을 때 쓰는 일반 4층
const FALLBACK = {
  hdi: false,
  layers: [
    { name: 'SM_TOP', type: 'SOLDERMASK', t: 0.02 }, { name: 'L1', type: 'COPPER', role: 'SIG', t: 0.035 }, { name: 'D1', type: 'PREPREG', t: 0.2 },
    { name: 'L2', type: 'COPPER', role: 'GND', t: 0.035 }, { name: 'D2', type: 'CORE', t: 1.0 }, { name: 'L3', type: 'COPPER', role: 'PWR', t: 0.035 },
    { name: 'D3', type: 'PREPREG', t: 0.2 }, { name: 'L4', type: 'COPPER', role: 'SIG', t: 0.035 }, { name: 'SM_BOT', type: 'SOLDERMASK', t: 0.02 },
  ],
}
// 단면 배치: 마스크·동박은 고정 두께, 절연층은 실제 두께 비율로 나눈다 (얇은 층도 보이게)
const sec = computed(() => {
  const s = spec.value || FALLBACK
  const L = s.layers
  const FIX = { SOLDERMASK: 7, COPPER: 6 }
  const fixed = L.reduce((a, l) => a + (FIX[l.type] || 0), 0)
  const diel = L.filter((l) => !FIX[l.type]).reduce((a, l) => a + l.t, 0)
  const room = Math.max(120, 190 - fixed)
  let y = 26
  const rows = L.map((l, i) => {
    const h = FIX[l.type] || Math.max(7, (room * l.t) / diel)
    const row = { ...l, i, y, h, region: regionOfLayer(l, L) }
    y += h
    return row
  })
  // 오른쪽 이름표: 얇은 층끼리 겹치지 않게 아래로 밀고 지시선으로 잇는다
  let last = -Infinity
  for (const row of rows) {
    row.label = row.type === 'COPPER' ? `${row.name}${row.role ? ' ' + row.role : ''}` : row.h >= 10 || row.type === 'SOLDERMASK' ? LABEL[row.type] : ''
    if (!row.label) continue
    row.ly = Math.max(row.y + row.h / 2 + 3.5, last + 11)
    last = row.ly
  }
  const cu = rows.filter((x) => x.type === 'COPPER')
  return { rows, cu, top: cu[0], bot: cu[cu.length - 1], smTop: rows[0], smBot: rows[rows.length - 1], end: y, hdi: s.hdi, known: !!spec.value }
})
// 동박 패턴: 외층은 회로 조각, 내층 GND·PWR은 판(비아 자리 비움), 내층 신호는 엇갈린 조각
function segs(row) {
  if (row.region === 'outer') return [[40, 84], [106, 150], [172, 216], [238, 282], [296, 326]]
  if (['GND', 'PWR'].includes(row.role)) return [[10, 332], [408, 410]]
  return row.i % 4 === 1 ? [[30, 150], [180, 326]] : [[30, 232], [262, 326]]
}
const DIEL_FILL = { PREPREG: 'url(#cl-fr4)', CORE: 'url(#cl-core)', BUILDUP: '#dfe3d2' }
// 부위 표식 위치
const mark = computed(() => {
  const s = sec.value
  const inner = s.cu.find((x) => x.region === 'inner')
  const diel = s.rows.filter((x) => x.region === 'core').sort((a, b) => b.h - a.h)[0]
  const mid = (s.top.y + s.bot.y + s.bot.h) / 2
  return {
    outer: [161, s.top.y + s.top.h / 2], inner: [205, inner ? inner.y + inner.h / 2 : mid], core: [120, diel ? diel.y + diel.h / 2 : mid],
    via: [370, mid], psr: [260, s.smTop.y + s.smTop.h / 2], pad: [370, s.smTop.y + 2], edge: [9, mid],
  }
})
const LABEL = { SOLDERMASK: 'PSR', PREPREG: '프리프레그', CORE: '코어', BUILDUP: '빌드업' }
</script>

<template>
  <section class="rounded-[14px] border bg-card p-5" aria-labelledby="cause-loc-title">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h3 id="cause-loc-title" class="text-[15px] font-bold">원인 위치 <span class="text-sm font-normal text-muted-foreground">PCB 부위 · 생산 공정</span></h3>
      <span class="flex items-center gap-3 text-xs text-muted-foreground">
        <span v-for="c in cands" :key="c.idx" class="flex items-center gap-1"><i class="inline-block size-2 rounded-full" :style="{ background: c.color.fill }" />{{ c.idx + 1 }}순위</span>
        <span v-if="partNo && sec.known" class="ml-1 inline-flex overflow-hidden rounded-md border text-[12px]" role="group" aria-label="단면 보기 방식">
          <button class="px-2 py-0.5" :class="view === '2d' ? 'bg-[#fff1f3] font-semibold text-primary' : 'bg-white'" :aria-pressed="view === '2d'" @click="view = '2d'">단면</button>
          <button class="border-l px-2 py-0.5" :class="view === '3d' ? 'bg-[#fff1f3] font-semibold text-primary' : 'bg-white'" :aria-pressed="view === '3d'" @click="view = '3d'">3D로 보기</button>
        </span>
      </span>
    </div>

    <div class="mt-4 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <!-- 3D: 제품 스택업 모델 (버튼을 눌렀을 때만 불러온다) -->
      <div v-if="view === '3d'" class="md:col-span-2">
        <PcbStack3D :result="r" :part-no="partNo" />
      </div>
      <!-- PCB 단면: 이 제품의 층 구성으로 그리고 부위만 강조 -->
      <figure v-else>
        <svg :viewBox="`0 0 484 ${sec.end + 22}`" class="w-full" role="img" :aria-label="`의심 부위: ${cands.filter((c) => c.region).map((c) => `${c.idx + 1}순위 ${REGION_NAME[c.region]}`).join(', ') || '없음'}`">
          <defs>
            <pattern id="cl-fr4" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#ece5d2" /><path d="M0 8 L8 0" stroke="#ddd3ba" stroke-width="1" /></pattern>
            <pattern id="cl-core" width="8" height="8" patternUnits="userSpaceOnUse"><rect width="8" height="8" fill="#e4dcc3" /><path d="M0 0 L8 8" stroke="#d3c7a6" stroke-width="1" /></pattern>
          </defs>
          <g v-for="row in sec.rows" :key="row.name">
            <!-- 솔더마스크: 비아 패드 자리는 열려 있다 -->
            <rect v-if="row.type === 'SOLDERMASK'" x="10" :y="row.y" width="320" :height="row.h" :fill="fillOf('psr', '#a9c3b3')" />
            <!-- 절연층 -->
            <rect
              v-else-if="row.type !== 'COPPER'" x="10" :y="row.y" width="400" :height="row.h"
              :fill="regionRank.core !== undefined ? RANK[regionRank.core].soft : DIEL_FILL[row.type] || 'url(#cl-fr4)'"
              :stroke="regionRank.core !== undefined ? RANK[regionRank.core].fill : 'none'" stroke-width="0.8"
            />
            <!-- 동박 -->
            <g v-else :fill="fillOf(row.region, '#c98a4b')">
              <rect v-for="[a, b] in segs(row)" :key="a" :x="a" :y="row.y" :width="b - a" :height="row.h" />
            </g>
            <template v-if="row.label">
              <path :d="`M411 ${row.y + row.h / 2} L418 ${row.ly - 3.5} L421 ${row.ly - 3.5}`" fill="none" stroke="#c7ccd4" stroke-width="0.8" />
              <text x="424" :y="row.ly" font-size="9.5" :fill="row.type === 'COPPER' ? '#6b4a2b' : '#8a919c'" :font-weight="row.type === 'COPPER' ? 700 : 400">{{ row.label }}</text>
            </template>
          </g>
          <!-- 외층 잔동 표시 (외층이 의심 부위일 때) -->
          <rect v-if="regionRank.outer !== undefined" x="150" :y="sec.top.y + 1" width="22" :height="sec.top.h - 2" :fill="RANK[regionRank.outer].fill" opacity="0.9" />
          <!-- 관통 비아: 도금 벽 + 구멍, 위·아래 패드(표면처리) -->
          <g :fill="fillOf('via', '#c98a4b')">
            <rect x="340" :y="sec.top.y" width="8" :height="sec.bot.y + sec.bot.h - sec.top.y" />
            <rect x="392" :y="sec.top.y" width="8" :height="sec.bot.y + sec.bot.h - sec.top.y" />
            <rect x="332" :y="sec.top.y" width="76" :height="sec.top.h" />
            <rect x="332" :y="sec.bot.y" width="76" :height="sec.bot.h" />
          </g>
          <rect x="348" :y="sec.top.y" width="44" :height="sec.bot.y + sec.bot.h - sec.top.y" fill="#fff" />
          <rect x="332" :y="sec.smTop.y + 2" width="76" :height="sec.smTop.h - 2" :fill="fillOf('pad', '#d9b26a')" />
          <rect x="332" :y="sec.smBot.y" width="76" :height="sec.smBot.h - 2" :fill="fillOf('pad', '#d9b26a')" />
          <!-- HDI 마이크로비아: 외층 → 바로 아래 동박 -->
          <g v-if="sec.hdi" :fill="fillOf('via', '#b8682f')">
            <path :d="`M300 ${sec.top.y} L322 ${sec.top.y} L316 ${sec.cu[1].y + sec.cu[1].h} L306 ${sec.cu[1].y + sec.cu[1].h} Z`" />
            <path :d="`M300 ${sec.bot.y + sec.bot.h} L322 ${sec.bot.y + sec.bot.h} L316 ${sec.cu[sec.cu.length - 2].y} L306 ${sec.cu[sec.cu.length - 2].y} Z`" />
          </g>
          <!-- 외형 가장자리 -->
          <rect v-if="regionRank.edge !== undefined" x="6" :y="sec.smTop.y" width="6" :height="sec.end - sec.smTop.y" :fill="RANK[regionRank.edge].fill" />
          <!-- 부위 표식 -->
          <g v-for="c in cands.filter((x) => x.region)" :key="c.idx">
            <circle :cx="mark[c.region][0]" :cy="mark[c.region][1]" r="9" :fill="c.color.fill" stroke="#fff" stroke-width="2" />
            <text :x="mark[c.region][0]" :y="mark[c.region][1] + 4" text-anchor="middle" font-size="11" font-weight="700" fill="#fff">{{ c.idx + 1 }}</text>
          </g>
          <g font-size="10" fill="#8a919c">
            <text x="10" y="16">{{ sec.known ? `${partNo} · ${sec.cu.length}층${sec.hdi ? ' HDI' : ''} · ${spec.board.thickness}mm · ${spec.finish}` : '일반 4층 예시' }}</text>
            <text x="332" y="16">{{ sec.hdi ? '마이크로비아·관통 비아' : '관통 비아·패드' }}</text>
          </g>
        </svg>
        <figcaption class="mt-1 text-[11px] text-muted-foreground">구조 단위 표시입니다. 층 수·순서는 제품 사양 기준이고 두께는 보기 좋게 조정했습니다(가정 치수). 보드 위 실측 좌표는 데이터에 없습니다.</figcaption>
      </figure>

      <!-- 후보별 부위·근거 -->
      <ul v-if="!compact" class="grid content-start gap-2">
        <li v-for="c in cands" :key="c.idx" class="rounded-[10px] border px-3.5 py-2.5" :style="{ background: c.color.soft, borderColor: c.color.line }">
          <p class="text-[13px] font-bold" :style="{ color: c.color.text }">{{ c.idx + 1 }}순위 {{ c.cause_name }} <span class="font-semibold tabular">· {{ (c.score ?? 0).toFixed(2) }}</span></p>
          <p class="mt-0.5 text-xs text-[#3a404b]">
            {{ c.region ? REGION_NAME[c.region] : '부위 아님 (검사·판정 단계)' }}<template v-if="c.process_id"> · {{ PROCESSES.find((p) => p[0] === c.process_id)?.[1] || c.process_id }}</template><template v-if="c.equipment_id"> · {{ c.equipment_id }}</template>
          </p>
          <p v-for="s in c.signals.slice(0, 2)" :key="s" class="mt-0.5 text-xs text-muted-foreground">{{ s }}</p>
        </li>
      </ul>

    <!-- 생산 라인 19공정 (compact면 단면 옆에) -->
    <div :class="compact ? 'self-center' : 'mt-1 md:col-span-2'">
      <p class="mb-2 text-xs font-semibold text-muted-foreground">생산 라인<template v-if="r.trace_summary?.lot_id"> · Lot {{ r.trace_summary.lot_id }}</template></p>
      <ol class="grid grid-cols-5 gap-1.5" :class="compact ? '' : 'sm:grid-cols-10'" aria-label="생산 공정 19단계">
        <li
          v-for="[id, name] in PROCESSES" :key="id"
          class="relative rounded-md border px-1 py-1.5 text-center text-[11px] leading-tight"
          :class="procRank[id] === undefined && escape?.detection_process_id !== id ? 'border-[#e3e5e9] bg-[#f6f7f9] text-[#5f6673]' : 'font-semibold'"
          :style="procRank[id] !== undefined ? { background: RANK[procRank[id]].soft, borderColor: RANK[procRank[id]].fill, color: RANK[procRank[id]].text } : escape?.detection_process_id === id ? { background: RANK[2].soft, borderColor: RANK[2].fill, color: RANK[2].text } : {}"
          :title="id"
        >
          <span v-if="procRank[id] !== undefined" class="absolute -top-2 left-1/2 grid size-4 -translate-x-1/2 place-items-center rounded-full text-[10px] font-bold text-white" :style="{ background: RANK[procRank[id]].fill }">{{ procRank[id] + 1 }}</span>
          {{ name }}
        </li>
      </ol>
      <div v-if="!compact" class="mt-3 grid gap-2 text-xs md:grid-cols-2">
        <p v-if="escape" class="rounded-[10px] border border-[#d6dce6] bg-[#f3f5f9] px-3 py-2 text-[#3a404b]">
          <b class="text-[#4b5566]">왜 못 걸렀나 · {{ escape.escape_name }}</b><template v-if="escape.equipment_id"> ({{ escape.equipment_id }})</template><br />
          <span class="text-muted-foreground">{{ escape.summary }}</span>
        </p>
        <p v-if="lots.total" class="rounded-[10px] border bg-[#f7f8fa] px-3 py-2 text-[#3a404b]">
          <b>영향 후보 Lot {{ lots.total }}개</b> <span class="text-muted-foreground">(같은 설비·자재 {{ lots.window_hours }}시간 이내)</span>
          <template v-if="topLot"><br />{{ topLot.lot_id }}<template v-if="sameEquip(topLot)"> — {{ sameEquip(topLot).equipment_id }} {{ sameEquip(topLot).gap_hours }}시간 차이</template><template v-if="topLot.known_returns"> · 이미 반품 {{ topLot.known_returns }}건</template></template>
        </p>
      </div>
    </div>
    </div>
  </section>
</template>
