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

const FALLBACK = {
  hdi: false,
  layers: [
    { name: 'SM_TOP', type: 'SOLDERMASK', t: 0.02 }, { name: 'L1', type: 'COPPER', role: 'SIG', t: 0.035 }, { name: 'D1', type: 'PREPREG', t: 0.2 },
    { name: 'L2', type: 'COPPER', role: 'GND', t: 0.035 }, { name: 'D2', type: 'CORE', t: 1.0 }, { name: 'L3', type: 'COPPER', role: 'PWR', t: 0.035 },
    { name: 'D3', type: 'PREPREG', t: 0.2 }, { name: 'L4', type: 'COPPER', role: 'SIG', t: 0.035 }, { name: 'SM_BOT', type: 'SOLDERMASK', t: 0.02 },
  ],
}

const LABEL = { SOLDERMASK: 'PSR', PREPREG: '프리프레그', CORE: '코어', BUILDUP: '빌드업' }

// 단면 배치: 층 수가 많아도(8~10층) 우측 라벨이 뭉개지지 않도록 동적 높이 확보
const sec = computed(() => {
  const s = spec.value || FALLBACK
  const L = s.layers
  const FIX = { SOLDERMASK: 8, COPPER: 6.5 }
  const diel = L.filter((l) => !FIX[l.type]).reduce((a, l) => a + l.t, 0)
  const dielCount = L.filter((l) => !FIX[l.type]).length
  const minDielH = L.length >= 17 ? 13 : 15
  const room = Math.max(dielCount * minDielH, 150)

  let y = 30
  const rows = L.map((l, i) => {
    const h = FIX[l.type] || Math.max(minDielH, (room * l.t) / diel)
    const row = { ...l, i, y, h, region: regionOfLayer(l, L) }
    y += h
    return row
  })

  // 우측 라벨: 동박 + PSR + 절연층을 여유 간격으로 배치
  let last = 22
  for (const row of rows) {
    row.label = row.type === 'COPPER' ? `${row.name}${row.role ? ' ' + row.role : ''}` : LABEL[row.type] || ''
    if (!row.label) continue
    row.ly = Math.max(row.y + row.h / 2 + 3.2, last + 11.5)
    last = row.ly
  }
  const cu = rows.filter((x) => x.type === 'COPPER')
  const svgH = Math.max(y + 18, last + 14)
  return { rows, cu, top: cu[0], bot: cu[cu.length - 1], smTop: rows[0], smBot: rows[rows.length - 1], end: y, svgH, hdi: s.hdi, known: !!spec.value }
})

// 동박 패턴: 외층은 회로 트레이스 단면, 내층 GND·PWR은 플레인, 내층 신호는 엇갈린 트레이스
function segs(row) {
  if (row.region === 'outer') return [[34, 78], [98, 146], [166, 214], [234, 282], [298, 326]]
  if (['GND', 'PWR'].includes(row.role)) return [[18, 330], [408, 414]]
  return row.i % 4 === 1 ? [[26, 148], [176, 326]] : [[26, 228], [258, 326]]
}

const DIEL_FILL = { PREPREG: 'url(#cl-fr4)', CORE: 'url(#cl-core)', BUILDUP: 'url(#cl-buildup)' }

// 부위 표식 위치 (같은 부위에 여러 순위가 겹치면 가로로 나란히 배치!)
const badges = computed(() => {
  const s = sec.value
  const inner = s.cu.find((x) => x.region === 'inner')
  const diel = s.rows.filter((x) => x.region === 'core').sort((a, b) => b.h - a.h)[0]
  const mid = (s.top.y + s.bot.y + s.bot.h) / 2
  const base = {
    outer: [158, s.top.y + s.top.h / 2],
    inner: [204, inner ? inner.y + inner.h / 2 : mid],
    core: [120, diel ? diel.y + diel.h / 2 : mid],
    via: [370, mid],
    psr: [256, s.smTop.y + s.smTop.h / 2],
    pad: [370, s.smTop.y + 3],
    edge: [18, mid],
  }
  const seen = {}
  return cands.value
    .filter((c) => c.region && base[c.region])
    .map((c) => {
      const n = seen[c.region] || 0
      seen[c.region] = n + 1
      const [bx, by] = base[c.region]
      return { ...c, x: bx + n * 22, y: by }
    })
})

const isSuspect = (region) => regionRank.value[region] !== undefined
const suspectColor = (region) => (regionRank.value[region] !== undefined ? RANK[regionRank.value[region]].fill : null)
</script>

<template>
  <section class="rounded-[14px] border bg-card p-5" aria-labelledby="cause-loc-title">
    <div class="flex flex-wrap items-baseline justify-between gap-2">
      <h3 id="cause-loc-title" class="text-[15px] font-bold">원인 위치 <span class="text-sm font-normal text-muted-foreground">PCB 부위 · 생산 공정</span></h3>
      <span class="flex items-center gap-3 text-xs text-muted-foreground">
        <span v-for="c in cands" :key="c.idx" class="flex items-center gap-1"><i class="inline-block size-2 rounded-full" :style="{ background: c.color.fill }" />{{ c.idx + 1 }}순위</span>
        <span v-if="partNo && sec.known" class="ml-1 inline-flex overflow-hidden rounded-md border text-[12px]" role="group" aria-label="단면 보기 방식">
          <button class="px-2.5 py-0.5 transition-colors" :class="view === '2d' ? 'bg-[#fff1f3] font-semibold text-primary' : 'bg-white hover:bg-muted/40'" :aria-pressed="view === '2d'" @click="view = '2d'">단면</button>
          <button class="border-l px-2.5 py-0.5 transition-colors" :class="view === '3d' ? 'bg-[#fff1f3] font-semibold text-primary' : 'bg-white hover:bg-muted/40'" :aria-pressed="view === '3d'" @click="view = '3d'">3D로 보기</button>
        </span>
      </span>
    </div>

    <div class="mt-4 grid gap-5 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
      <!-- 3D: 제품 스택업 모델 (버튼을 눌렀을 때만 불러온다) -->
      <div v-if="view === '3d'" class="md:col-span-2">
        <PcbStack3D :result="r" :part-no="partNo" />
      </div>

      <!-- PCB 단면: 실제 재질 그라데이션 + 깔끔한 의심 부위 아웃라인 강조 -->
      <figure v-else class="rounded-[12px] border bg-gradient-to-b from-[#fafbfc] to-[#f3f5f8] p-3.5">
        <div class="mb-2 flex flex-wrap items-center justify-between gap-1 text-[11px] text-muted-foreground">
          <span class="font-semibold text-[#2d3440]">
            {{ sec.known ? `${partNo} · ${sec.cu.length}층${sec.hdi ? ' HDI' : ''} · ${spec.board.thickness}mm · ${spec.finish}` : '일반 4층 예시' }}
          </span>
          <span class="rounded bg-white/80 px-1.5 py-0.5 text-[10px] font-medium text-[#5f6673] shadow-2xs ring-1 ring-black/5">
            {{ sec.hdi ? '마이크로비아 · 관통 비아' : '관통 비아 · ENIG 패드' }}
          </span>
        </div>

        <svg :viewBox="`0 0 492 ${sec.svgH}`" class="w-full" role="img" :aria-label="`의심 부위: ${cands.filter((c) => c.region).map((c) => `${c.idx + 1}순위 ${REGION_NAME[c.region]}`).join(', ') || '없음'}`">
          <defs>
            <!-- 실제 PCB 다크 그린 PSR 그라데이션 -->
            <linearGradient id="cl-psr" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#216a34" />
              <stop offset="100%" stop-color="#144922" />
            </linearGradient>
            <!-- 금속 동박 그라데이션 -->
            <linearGradient id="cl-cu" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#e3a25e" />
              <stop offset="50%" stop-color="#c9803c" />
              <stop offset="100%" stop-color="#a86327" />
            </linearGradient>
            <!-- ENIG 금도금 패드 그라데이션 -->
            <linearGradient id="cl-gold" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#f7da6e" />
              <stop offset="55%" stop-color="#e3b63a" />
              <stop offset="100%" stop-color="#c4931d" />
            </linearGradient>
            <!-- 관통 비아 원통 음영 -->
            <linearGradient id="cl-hole" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stop-color="#dce2ea" />
              <stop offset="30%" stop-color="#f8fafc" />
              <stop offset="70%" stop-color="#ffffff" />
              <stop offset="100%" stop-color="#cfd6e0" />
            </linearGradient>
            <!-- 절연층(프리프레그 / 코어 / 빌드업) 유리섬유 패턴 -->
            <pattern id="cl-fr4" width="8" height="8" patternUnits="userSpaceOnUse">
              <rect width="8" height="8" fill="#efe9d8" />
              <path d="M0 8 L8 0" stroke="#dfd6bc" stroke-width="0.9" />
            </pattern>
            <pattern id="cl-core" width="8" height="8" patternUnits="userSpaceOnUse">
              <rect width="8" height="8" fill="#e5ddc6" />
              <path d="M0 0 L8 8" stroke="#d3c8a8" stroke-width="0.9" />
            </pattern>
            <pattern id="cl-buildup" width="6" height="6" patternUnits="userSpaceOnUse">
              <rect width="6" height="6" fill="#dce3cf" />
              <circle cx="3" cy="3" r="0.6" fill="#c3ccb4" />
            </pattern>
            <filter id="cl-glow" x="-10%" y="-40%" width="120%" height="180%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.2" flood-color="#ea002c" flood-opacity="0.45" />
            </filter>
          </defs>

          <!-- 보드 전체 미세 외곽 그림자 -->
          <rect x="18" :y="sec.smTop.y" width="396" :height="sec.end - sec.smTop.y" rx="2" fill="#fff" stroke="#d5dae2" stroke-width="0.8" />

          <g v-for="row in sec.rows" :key="row.name">
            <!-- 솔더마스크 (실제 다크 그린 유지 + 의심 부위일 때만 상·하 글로우 라인 강조) -->
            <template v-if="row.type === 'SOLDERMASK'">
              <rect x="18" :y="row.y" width="314" :height="row.h" rx="1.5" fill="url(#cl-psr)" />
              <rect
                v-if="isSuspect('psr')"
                x="17.5" :y="row.y - 0.5" width="315" :height="row.h + 1" rx="2"
                :fill="suspectColor('psr')" fill-opacity="0.22"
                :stroke="suspectColor('psr')" stroke-width="1.8"
              />
            </template>

            <!-- 절연층 (프리프레그 / 코어 / 빌드업) -->
            <template v-else-if="row.type !== 'COPPER'">
              <rect x="18" :y="row.y" width="396" :height="row.h" :fill="DIEL_FILL[row.type] || 'url(#cl-fr4)'" />
              <rect
                v-if="isSuspect('core')"
                x="18" :y="row.y" width="396" :height="row.h"
                :fill="suspectColor('core')" fill-opacity="0.14"
                :stroke="suspectColor('core')" stroke-width="1" stroke-dasharray="4 2"
              />
            </template>

            <!-- 동박 (실제 동 그라데이션 유지 + 의심 층일 때만 테두리 강조) -->
            <g v-else>
              <rect
                v-for="[a, b] in segs(row)" :key="a"
                :x="a" :y="row.y" :width="b - a" :height="row.h" rx="0.8"
                fill="url(#cl-cu)"
                :stroke="isSuspect(row.region) ? suspectColor(row.region) : '#8f521e'"
                :stroke-width="isSuspect(row.region) ? 1.5 : 0.4"
              />
              <rect
                v-if="isSuspect(row.region)"
                x="18" :y="row.y - 1" width="314" :height="row.h + 2" rx="1.5"
                :fill="suspectColor(row.region)" fill-opacity="0.16"
                :stroke="suspectColor(row.region)" stroke-width="1.2" stroke-dasharray="3 2"
              />
            </g>

            <!-- 우측 층 이름표 & 깔끔한 지시선 -->
            <template v-if="row.label">
              <path
                :d="`M416 ${row.y + row.h / 2} L424 ${row.ly - 3.2} L429 ${row.ly - 3.2}`"
                fill="none"
                :stroke="isSuspect(row.region) ? suspectColor(row.region) : '#cbd1da'"
                :stroke-width="isSuspect(row.region) ? 1.2 : 0.8"
              />
              <circle
                cx="416" :cy="row.y + row.h / 2" r="1.5"
                :fill="isSuspect(row.region) ? suspectColor(row.region) : '#b8c0cc'"
              />
              <text
                x="433" :y="row.ly" font-size="9.2"
                :fill="isSuspect(row.region) ? suspectColor(row.region) : row.type === 'COPPER' ? '#5c3c1e' : '#7b8390'"
                :font-weight="row.type === 'COPPER' || isSuspect(row.region) ? 700 : 500"
              >
                {{ row.label }}
              </text>
            </template>
          </g>

          <!-- 관통 비아: 동 도금 배럴 + 원통 음영 드릴 홀 + 위·아래 ENIG 금도금 패드 -->
          <g>
            <!-- 비아 벽 동도금 -->
            <rect x="340" :y="sec.top.y" width="9" :height="sec.bot.y + sec.bot.h - sec.top.y" fill="url(#cl-cu)" />
            <rect x="391" :y="sec.top.y" width="9" :height="sec.bot.y + sec.bot.h - sec.top.y" fill="url(#cl-cu)" />
            <!-- 상·하단 랜드(동) -->
            <rect x="332" :y="sec.top.y" width="76" :height="sec.top.h" rx="1" fill="url(#cl-cu)" />
            <rect x="332" :y="sec.bot.y" width="76" :height="sec.bot.h" rx="1" fill="url(#cl-cu)" />
            <!-- 비아 드릴 홀 (입체 원통 음영) -->
            <rect x="349" :y="sec.top.y" width="42" :height="sec.bot.y + sec.bot.h - sec.top.y" fill="url(#cl-hole)" />
            <!-- 비아 의심 부위 강조 테두리 -->
            <rect
              v-if="isSuspect('via')"
              x="338" :y="sec.top.y - 1" width="64" :height="sec.bot.y + sec.bot.h - sec.top.y + 2" rx="2"
              :fill="suspectColor('via')" fill-opacity="0.14"
              :stroke="suspectColor('via')" stroke-width="1.8" stroke-dasharray="4 2"
            />
            <!-- 위·아래 ENIG 금도금 표면처리 패드 -->
            <rect x="332" :y="sec.smTop.y + 2" width="76" :height="sec.smTop.h - 2" rx="1" fill="url(#cl-gold)" :stroke="isSuspect('pad') ? suspectColor('pad') : '#b5871b'" :stroke-width="isSuspect('pad') ? 1.8 : 0.5" />
            <rect x="332" :y="sec.smBot.y" width="76" :height="sec.smBot.h - 2" rx="1" fill="url(#cl-gold)" :stroke="isSuspect('pad') ? suspectColor('pad') : '#b5871b'" :stroke-width="isSuspect('pad') ? 1.8 : 0.5" />
          </g>

          <!-- HDI 마이크로비아: 외층 → 바로 아래 동박 (레이저 비아 테이퍼 형태) -->
          <g v-if="sec.hdi">
            <path
              :d="`M298 ${sec.top.y} L322 ${sec.top.y} L316 ${sec.cu[1].y + sec.cu[1].h} L304 ${sec.cu[1].y + sec.cu[1].h} Z`"
              fill="url(#cl-cu)" :stroke="isSuspect('via') ? suspectColor('via') : '#8f521e'" :stroke-width="isSuspect('via') ? 1.5 : 0.6"
            />
            <path
              :d="`M298 ${sec.bot.y + sec.bot.h} L322 ${sec.bot.y + sec.bot.h} L316 ${sec.cu[sec.cu.length - 2].y} L304 ${sec.cu[sec.cu.length - 2].y} Z`"
              fill="url(#cl-cu)" :stroke="isSuspect('via') ? suspectColor('via') : '#8f521e'" :stroke-width="isSuspect('via') ? 1.5 : 0.6"
            />
          </g>

          <!-- 좌측 총 두께 치수선 (엔지니어링 도면 느낌) -->
          <g stroke="#adb5c2" stroke-width="0.9">
            <line x1="9" :y1="sec.smTop.y" x2="9" :y2="sec.end" />
            <line x1="6" :y1="sec.smTop.y" x2="12" :y2="sec.smTop.y" />
            <line x1="6" :y1="sec.end" x2="12" :y2="sec.end" />
          </g>

          <!-- 외형 가장자리 의심 강조 -->
          <rect v-if="isSuspect('edge')" x="14" :y="sec.smTop.y" width="5" :height="sec.end - sec.smTop.y" rx="2" :fill="suspectColor('edge')" />

          <!-- 부위 표식 배지 (겹침 없이 나란히 배치) -->
          <g v-for="b in badges" :key="b.idx" filter="url(#cl-glow)">
            <circle :cx="b.x" :cy="b.y" r="9.5" :fill="b.color.fill" stroke="#fff" stroke-width="2" />
            <text :x="b.x" :y="b.y + 3.8" text-anchor="middle" font-size="10.5" font-weight="700" fill="#fff">{{ b.idx + 1 }}</text>
          </g>
        </svg>

        <figcaption class="mt-1.5 text-[11px] leading-relaxed text-muted-foreground">
          구조 단위 표시입니다. 층 수·순서는 제품 사양 기준이며, 의심 부위는 테두리와 순위 배지로 강조했습니다(가정 치수 · 실측 좌표 없음).
        </figcaption>
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
