<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { loadStackup, RANK, REGION_NAME, regionOfCandidate, regionOfLayer } from '@/lib/pcbRegion'

// 원인 위치의 "3D로 보기": 제품 스택업 모델(effect/pcb3d, FreeCAD 가정 치수)을 실제 재질로 보여준다.
// 기본은 조립된 원본 PCB(금회로·다크 그린 솔더마스크) 그대로 보여주고,
// "의심층 표시" 버튼을 누르면 참고 도면처럼 [시원한 수직 층 분해(Exploded Stackup) + 의심층 돌출/외곽선 + SVG 지시선 라벨]로 표시한다.
const props = defineProps({ result: Object, partNo: String })
const r = computed(() => props.result || {})

const BASE = {
  SOLDERMASK: 0x15401b,
  MASKED_TRACE: 0x245c26,
  GOLD: 0xedbd2e,
  COPPER: 0xc8763a,
  PREPREG: 0xdccf9e,
  CORE: 0xcbbc85,
  BUILDUP: 0xb9c19c,
  VIA: 0xc8763a,
  FINISH: 0xedbd2e,
  SILKSCREEN: 0xf2f2f0,
  VIA_HOLE: 0x0a0d0a,
}

const LAYER_LABEL = {
  SOLDERMASK: 'PSR (솔더마스크)',
  PREPREG: '프리프레그',
  CORE: '코어 (FR-4)',
  BUILDUP: '빌드업 절연층',
}

const el = ref(null)
const status = ref('loading') // loading | ready | missing
const zscale = ref(2)
const suspectMode = ref(false) // 기본: 조립된 원본 PCB, 클릭 시 층 분해 + 지시선 라벨
const mode = ref('all')
const leaderLabels = ref([]) // SVG 지시선 + 정렬된 우측/좌측 라벨

const suspectCandidates = computed(() => {
  const out = []
  const seen = new Set()
  ;(r.value.cause_candidates || []).slice(0, 3).forEach((c, i) => {
    const reg = regionOfCandidate(c, r.value.classification?.minor_code)
    if (reg && !seen.has(reg)) {
      seen.add(reg)
      out.push({ rank: i, region: reg, label: REGION_NAME[reg] || reg, color: RANK[i] })
    }
  })
  return out
})

const rankOfRegion = computed(() => {
  const m = {}
  for (const c of suspectCandidates.value) m[c.region] = c.rank
  return m
})

let THREE, renderer, scene, cam, controls, root, size, raf, ro
let explodeAxis = 'y'
let pullAxis = 'x'
let modelScale = 1
let explodeProgress = 0 // 0(조립) → 1(분해) 부드러운 보간
const meshes = []
const layerAnchors = [] // 지시선용 대표 층 메타 목록

async function init() {
  try {
    const spec = await loadStackup(props.partNo)
    if (!spec) { status.value = 'missing'; return }
    THREE = await import('three')
    const [{ OrbitControls }, { GLTFLoader }] = await Promise.all([
      import('three/addons/controls/OrbitControls.js'),
      import('three/addons/loaders/GLTFLoader.js'),
    ])
    const w = el.value.clientWidth, h = el.value.clientHeight
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(devicePixelRatio)
    renderer.setSize(w, h)
    renderer.toneMapping = THREE.ACESFilmicToneMapping
    renderer.toneMappingExposure = 1.12
    el.value.appendChild(renderer.domElement)

    scene = new THREE.Scene()
    cam = new THREE.PerspectiveCamera(32, w / h, 0.1, 5000)
    controls = new OrbitControls(cam, renderer.domElement)
    controls.enableDamping = true

    // 금도금 패드·회로와 분해된 층 단면이 또렷하게 보이도록 3점 조명
    scene.add(new THREE.HemisphereLight(0xffffff, 0x8b95a5, 1.5))
    const keyLight = new THREE.DirectionalLight(0xfffaf0, 1.85)
    keyLight.position.set(110, 200, 140)
    scene.add(keyLight)
    const rimLight = new THREE.DirectionalLight(0xdbeafe, 0.85)
    rimLight.position.set(-120, 90, -120)
    scene.add(rimLight)

    const g = await new GLTFLoader().loadAsync(`/pcb3d/${props.partNo}.glb`)
    const model = g.scene
    const layers = spec.layers
    const topOrder = layers.length - 1 // 맨 위 SM_TOP 인덱스

    // 층 인덱스: 상단 표면 아트워크(금패드·금회로·실크스크린)는 SM_TOP과 정확히 같은 order로 묶어 한 판처럼 이동!
    const layerOrder = (name, l) => {
      if (l) return layers.length - 1 - layers.indexOf(l)
      if (
        name.startsWith('Silkscreen_') ||
        name.startsWith('Pads_Gold_') ||
        name.startsWith('Traces_Gold_') ||
        name.startsWith('Traces_Masked_') ||
        name.startsWith('Thermal_Vias_') ||
        name.startsWith('Finish_')
      ) {
        return topOrder
      }
      return (layers.length - 1) / 2
    }

    const seenAnchor = new Set()

    model.traverse((o) => {
      if (!o.isMesh) return
      const name = o.parent && o.parent !== model && o.parent.name ? o.parent.name : o.name
      const l = layers.find((x) => name.startsWith(x.name + '_'))
      const isVia = name.startsWith('Via_') || name.startsWith('Microvia_')
      const isGoldArt = name.startsWith('Pads_Gold_') || name.startsWith('Traces_Gold_') || name.startsWith('Thermal_Vias_Gold')
      const kind = name.startsWith('Finish_')
        ? 'FINISH'
        : isGoldArt
          ? 'GOLD'
          : name.startsWith('Traces_Masked_')
            ? 'MASKED_TRACE'
            : name.startsWith('Silkscreen_')
              ? 'SILKSCREEN'
              : name.startsWith('Thermal_Vias_Holes')
                ? 'VIA_HOLE'
                : isVia
                  ? 'VIA'
                  : l?.type || 'CORE'
      const metal = ['COPPER', 'VIA', 'FINISH', 'GOLD'].includes(kind)
      const isGold = kind === 'GOLD' || kind === 'FINISH'
      o.material = new THREE.MeshStandardMaterial({
        color: BASE[kind],
        roughness: isGold ? 0.24 : metal ? 0.34 : 0.72,
        metalness: isGold ? 0.7 : metal ? 0.52 : 0.04,
      })
      const region =
        kind === 'FINISH' || name.startsWith('Pads_Gold_') || name.startsWith('Traces_Gold_')
          ? 'pad'
          : isVia || name.startsWith('Thermal_Vias_')
            ? 'via'
            : l
              ? regionOfLayer(l, layers)
              : null

      const ord = layerOrder(name, l)
      o.userData = {
        name,
        region,
        kind,
        order: ord,
        basePos: o.position.clone(),
        layerCount: layers.length,
        isThroughVia: isVia,
        isTopArt: ord === topOrder && !l,
      }
      meshes.push(o)

      // 의심층 외곽선 하이라이트(EdgesGeometry)
      const edges = new THREE.EdgesGeometry(o.geometry, 28)
      const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.95 })
      const line = new THREE.LineSegments(edges, lineMat)
      line.visible = false
      o.add(line)
      o.userData.outline = line

      // 지시선용 앵커 수집: 모든 동박층 + 상/하단 PSR + 대표 절연층 + 관통 비아
      if (l && !seenAnchor.has(l.name)) {
        seenAnchor.add(l.name)
        const title = l.type === 'COPPER' ? `${l.name}${l.role ? ' ' + l.role : ''}` : LAYER_LABEL[l.type] || l.name
        layerAnchors.push({ obj: o, key: l.name, title, region, order: ord, isCopper: l.type === 'COPPER', isSm: l.type === 'SOLDERMASK' })
      } else if (isVia && !seenAnchor.has('VIA')) {
        seenAnchor.add('VIA')
        layerAnchors.push({ obj: o, key: 'VIA', title: '관통 비아', region: 'via', order: (layers.length - 1) / 2, isCopper: false, isSm: false })
      }
    })

    // glTF는 미터·Y-위: FreeCAD mm로 되돌리고, 가장 얇은 축을 위로
    let box = new THREE.Box3().setFromObject(model)
    const s0 = box.getSize(new THREE.Vector3())
    modelScale = Math.max(s0.x, s0.y, s0.z) < 5 ? 1000 : 1
    model.scale.setScalar(modelScale)
    const thin = ['x', 'y', 'z'].reduce((a, b) => (s0[a] < s0[b] ? a : b))
    explodeAxis = thin
    pullAxis = thin === 'x' ? 'z' : 'x'
    if (thin === 'z') model.rotation.x = -Math.PI / 2
    if (thin === 'x') model.rotation.z = Math.PI / 2

    root = new THREE.Group()
    root.add(model)
    box = new THREE.Box3().setFromObject(root)
    size = box.getSize(new THREE.Vector3())
    model.position.sub(box.getCenter(new THREE.Vector3())).add(new THREE.Vector3(0, size.y / 2, 0))
    scene.add(root)

    applyScale()
    updateMaterials()
    view('all')

    ro = new ResizeObserver(() => {
      if (!el.value) return
      const W = el.value.clientWidth, H = el.value.clientHeight
      renderer.setSize(W, H)
      cam.aspect = W / H
      cam.updateProjectionMatrix()
    })
    ro.observe(el.value)

    const proj = new THREE.Vector3()
    const tempBox = new THREE.Box3()
    const loop = () => {
      // 0 ↔ 1 부드러운 층 분해 애니메이션
      const targetP = suspectMode.value ? 1 : 0
      if (Math.abs(explodeProgress - targetP) > 0.002) {
        explodeProgress += (targetP - explodeProgress) * 0.14
        applyExplodePositions()
      } else if (explodeProgress !== targetP) {
        explodeProgress = targetP
        applyExplodePositions()
      }

      controls.update()
      renderer.render(scene, cam)

      // 층 분해 모드일 때 참고 이미지처럼 깔끔한 SVG 지시선 + 정렬 라벨 업데이트
      if (explodeProgress > 0.15 && el.value) {
        const W = el.value.clientWidth, H = el.value.clientHeight
        const items = []
        // 너무 많은 층(10층=21개)이면 지시선 가독성을 위해 [의심층 전부 + 상/하단 PSR + 동박층 + 비아] 우선 선별
        const compactList = layerAnchors.length > 10
          ? layerAnchors.filter((a) => rankOfRegion.value[a.region] !== undefined || a.isSm || a.isCopper || a.key === 'VIA')
          : layerAnchors

        for (const a of compactList) {
          tempBox.setFromObject(a.obj)
          const rk = rankOfRegion.value[a.region]
          const isHit = rk !== undefined
          // 각 층의 우측/좌측 모서리 중심을 3D→2D 투영
          const edgeX = isHit ? tempBox.max.x : tempBox.min.x
          const edgeY = (tempBox.min.y + tempBox.max.y) / 2
          const edgeZ = (tempBox.min.z + tempBox.max.z) / 2
          proj.set(edgeX, edgeY, edgeZ).project(cam)
          if (proj.z > 1) continue
          const sx = (proj.x * 0.5 + 0.5) * W
          const sy = (-proj.y * 0.5 + 0.5) * H
          items.push({
            key: a.key,
            title: a.title,
            regionLabel: REGION_NAME[a.region] || '',
            rank: rk,
            isHit,
            color: isHit ? RANK[rk] : null,
            side: isHit ? 'right' : 'left',
            ax: sx,
            ay: sy,
            ly: sy,
          })
        }

        // 좌·우 라벨이 서로 겹치지 않도록 세로 간격 자동 정렬
        for (const side of ['left', 'right']) {
          const group = items.filter((it) => it.side === side).sort((a, b) => a.ay - b.ay)
          const gap = side === 'right' ? 28 : 20
          let cursor = 56
          for (const it of group) {
            it.ly = Math.max(it.ay, cursor)
            cursor = it.ly + gap
          }
          // 아래쪽 넘침 방지
          const maxY = H - 38
          if (group.length && group[group.length - 1].ly > maxY) {
            let back = maxY
            for (let i = group.length - 1; i >= 0; i--) {
              group[i].ly = Math.min(group[i].ly, back)
              back = group[i].ly - gap
            }
          }
          for (const it of group) {
            it.lx = side === 'right' ? W - 18 : 18
            it.bendX = side === 'right' ? W - 165 : 138
          }
        }
        leaderLabels.value = items
      } else if (leaderLabels.value.length) {
        leaderLabels.value = []
      }

      raf = requestAnimationFrame(loop)
    }
    loop()
    status.value = 'ready'
  } catch (e) {
    console.error(e)
    status.value = 'missing'
  }
}

function applyScale() {
  if (root) root.scale.set(1, zscale.value, 1)
  applyExplodePositions()
}

function applyExplodePositions() {
  if (!size || !meshes.length) return
  // 참고 이미지(PCB Layer Stackup)처럼 층 사이가 시원하게 벌어지도록 보드 크기 비례 수직 간격 계산
  const totalSpanMm = Math.max(46, Math.min(82, Math.max(size.x, size.z) * 0.58))
  const layerCount = meshes[0]?.userData.layerCount || 9
  const stepMm = totalSpanMm / Math.max(3, layerCount - 1)
  const stepLocal = (stepMm / (modelScale * zscale.value)) * explodeProgress
  const pullLocal = ((Math.max(size.x, size.z) * 0.14) / modelScale) * explodeProgress

  for (const m of meshes) {
    const base = m.userData.basePos
    m.position.copy(base)
    if (explodeProgress <= 0.001) continue
    if (m.userData.isThroughVia) continue

    const mid = (m.userData.layerCount - 1) / 2
    m.position[explodeAxis] = base[explodeAxis] + (m.userData.order - mid) * stepLocal

    // 의심층은 서랍처럼 살짝 앞으로 당겨서 한눈에 구별! (상단 패드/실크스크린도 SM_TOP이 의심층이면 함께 이동)
    const rk = rankOfRegion.value[m.userData.region]
    const topPsrHit = m.userData.isTopArt && rankOfRegion.value.psr !== undefined
    if (rk !== undefined || topPsrHit) {
      m.position[pullAxis] = base[pullAxis] + pullLocal
    }
  }
}

function updateMaterials() {
  if (!THREE) return
  const active = suspectMode.value
  for (const m of meshes) {
    const rk = rankOfRegion.value[m.userData.region]
    const hit = active && rk !== undefined

    // 항상 원래 PCB 재질 색상 유지 (붉은색 덮어칠하기 없음!)
    m.material.color.setHex(BASE[m.userData.kind])
    m.material.emissive.setHex(hit ? Number('0x' + RANK[rk].fill.slice(1)) : 0x000000)
    m.material.emissiveIntensity = hit ? 0.16 : 0

    // 분해 모드에서도 모든 층이 흐릿하게 뭉개지지 않고 선명하게 보이도록 유지 (관통 비아만 비의심일 때 살짝 옅게)
    const fadeVia = active && m.userData.isThroughVia && !hit
    m.material.transparent = fadeVia
    m.material.opacity = fadeVia ? 0.25 : 1
    m.material.depthWrite = !fadeVia
    m.material.needsUpdate = true

    const line = m.userData.outline
    if (line) {
      line.visible = hit
      if (hit) line.material.color.setHex(Number('0x' + RANK[rk].fill.slice(1)))
    }
  }
}

// 시점 전환: 전체 보기 / 단면 확대 / 분해 스택업 뷰
function view(m) {
  if (!size) return
  const hgt = size.y * zscale.value
  if (suspectMode.value && m === 'all') {
    const maxDim = Math.max(size.x, size.z)
    controls.target.set(0, hgt * 0.5, 0)
    cam.position.set(maxDim * 1.15, maxDim * 0.72, maxDim * 1.48)
  } else if (m === 'all') {
    controls.target.set(0, hgt / 2, 0)
    cam.position.set(size.x * 0.92, size.x * 0.85, size.z * 1.55)
  } else {
    const t = new THREE.Vector3(size.x * 0.12 + hgt * 0.7, hgt / 2, size.z * 0.1 + hgt * 0.35)
    const d = hgt * 2.5 + 8
    controls.target.copy(t)
    cam.position.copy(t).add(new THREE.Vector3(d * 0.9, d * 0.7, d * 1.1))
  }
  mode.value = m
}

watch(suspectMode, () => {
  updateMaterials()
  view('all')
})
watch(rankOfRegion, () => {
  updateMaterials()
  applyExplodePositions()
})
watch(zscale, () => {
  applyScale()
  view(mode.value)
})

onMounted(init)
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
  renderer?.dispose()
})
</script>

<template>
  <div class="relative h-[440px] overflow-hidden rounded-[12px] border bg-gradient-to-b from-[#f8fafc] to-[#eaeef4]">
    <div ref="el" class="absolute inset-0" />

    <!-- 층 분해(의심층 표시) 시 참고 도면 스타일 SVG 지시선 + 정렬 라벨 -->
    <svg
      v-if="status === 'ready' && leaderLabels.length"
      class="pointer-events-none absolute inset-0 size-full select-none"
    >
      <g v-for="it in leaderLabels" :key="it.key">
        <!-- 지시선: 3D 층 모서리 → 꺾임점 → 라벨 옆 -->
        <polyline
          :points="`${it.ax},${it.ay} ${it.bendX},${it.ly} ${it.side === 'right' ? it.lx - 140 : it.lx + 104},${it.ly}`"
          fill="none"
          :stroke="it.isHit ? it.color.fill : '#94a3b8'"
          :stroke-width="it.isHit ? 1.8 : 1"
          :stroke-dasharray="it.isHit ? 'none' : '2 2'"
          opacity="0.9"
        />
        <circle :cx="it.ax" :cy="it.ay" :r="it.isHit ? 3.5 : 2.3" :fill="it.isHit ? it.color.fill : '#64748b'" stroke="#fff" stroke-width="1" />
      </g>
    </svg>

    <template v-if="status === 'ready' && leaderLabels.length">
      <div
        v-for="it in leaderLabels"
        :key="`lbl-${it.key}`"
        class="pointer-events-none absolute -translate-y-1/2 select-none"
        :style="it.side === 'right' ? { right: '14px', top: `${it.ly}px` } : { left: '14px', top: `${it.ly}px` }"
      >
        <div
          v-if="it.isHit"
          class="flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-white/95 px-2.5 py-0.5 text-[11px] font-bold shadow-sm backdrop-blur-xs"
          :style="{ borderColor: it.color.fill, color: it.color.text }"
        >
          <span class="grid size-4 place-items-center rounded-full text-[10px] font-bold text-white" :style="{ background: it.color.fill }">{{ it.rank + 1 }}</span>
          <span>{{ it.title }}</span>
          <span class="font-medium opacity-80">· {{ it.regionLabel }}</span>
        </div>
        <div
          v-else
          class="whitespace-nowrap rounded bg-white/85 px-1.5 py-0.5 text-[10.5px] font-medium text-[#475569] shadow-2xs ring-1 ring-slate-200/80"
        >
          {{ it.title }}
        </div>
      </div>
    </template>

    <!-- 좌측 상단 컨트롤 -->
    <div v-if="status === 'ready'" class="absolute left-3 top-3 flex flex-wrap gap-1.5 text-xs">
      <button class="rounded-md border bg-white/95 px-2.5 py-1 shadow-2xs transition-colors" :class="mode === 'all' && !suspectMode ? 'border-primary font-semibold text-primary' : 'hover:bg-white'" @click="suspectMode = false; view('all')">전체 보기</button>
      <button class="rounded-md border bg-white/95 px-2.5 py-1 shadow-2xs transition-colors" :class="mode === 'cut' && !suspectMode ? 'border-primary font-semibold text-primary' : 'hover:bg-white'" @click="suspectMode = false; view('cut')">단면 확대</button>
      <button
        class="flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-semibold shadow-2xs transition-colors"
        :class="suspectMode ? 'border-[#1e293b] bg-[#1e293b] text-white' : 'border-[#d0d5dd] bg-white/95 text-[#344054] hover:bg-white'"
        :aria-pressed="suspectMode"
        @click="suspectMode = !suspectMode"
      >
        <span class="inline-block size-2 rounded-full" :style="{ background: suspectMode ? '#fbbf24' : '#ea002c' }" />
        {{ suspectMode ? '층 분해 닫기' : '의심층 표시 (층 분해)' }}
      </button>
    </div>

    <!-- 우측 상단 두께 슬라이더 -->
    <label v-if="status === 'ready'" class="absolute right-3 top-3 flex items-center gap-2 rounded-md border bg-white/95 px-2.5 py-1 text-xs shadow-2xs">
      두께 과장 <input v-model.number="zscale" type="range" min="1" max="10" class="w-20 accent-[#ea002c]" /> ×{{ zscale }}
    </label>

    <p v-if="status === 'loading'" class="absolute inset-0 grid place-items-center text-sm text-muted-foreground">3D 모델을 불러오는 중…</p>
    <p v-if="status === 'missing'" class="absolute inset-0 grid place-items-center text-sm text-muted-foreground">이 제품({{ partNo || '-' }})의 3D 모델이 없습니다.</p>
    <p class="absolute bottom-3 left-3 rounded-md bg-[#20232b]/85 px-2.5 py-1 text-[11px] text-[#ffd54a]">
      {{ suspectMode ? '층 분해(Exploded) 모드 · 의심층 돌출 + 외곽선·지시선 강조 · 마우스로 회전·확대' : '가정 치수 모델 · 마우스로 회전·확대 · 의심층 표시 버튼으로 층별 분해 확인' }}
    </p>
  </div>
</template>
