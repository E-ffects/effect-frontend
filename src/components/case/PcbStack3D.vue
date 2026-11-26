<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { loadStackup, RANK, REGION_NAME, regionOfCandidate, regionOfLayer } from '@/lib/pcbRegion'

// 원인 위치의 "3D로 보기": 제품 스택업 모델(effect/pcb3d, FreeCAD 가정 치수)을 실제 재질로 보여준다.
// 기본은 원본 PCB(금회로·다크 그린 솔더마스크) 그대로 보여주고,
// "의심층 표시" 버튼을 누르면 빨간색 칠하기 대신 [층간 분해 + 비의심층 글래스화 + 외곽선 하이라이트 + 3D 플로팅 라벨]로 표시한다.
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

const el = ref(null)
const status = ref('loading') // loading | ready | missing
const zscale = ref(3)
const suspectMode = ref(false) // 기본: 원본 PCB 그대로, 버튼 클릭 시 의심층 분해·외곽선·라벨 표시
const mode = ref('all')
const callouts = ref([]) // 3D 공간에서 투영된 의심 부위 플로팅 라벨

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
let explodeStep = 0.00045
const meshes = []
const outlineLines = []
const regionAnchors = {} // region -> { obj, localY }

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
    renderer.toneMappingExposure = 1.08
    el.value.appendChild(renderer.domElement)

    scene = new THREE.Scene()
    cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 5000)
    controls = new OrbitControls(cam, renderer.domElement)
    controls.enableDamping = true

    // 금도금 패드·회로가 자연스럽게 빛나도록 3점 조명 배치
    scene.add(new THREE.HemisphereLight(0xffffff, 0x7c8798, 1.45))
    const keyLight = new THREE.DirectionalLight(0xfffaf0, 1.8)
    keyLight.position.set(90, 180, 130)
    scene.add(keyLight)
    const rimLight = new THREE.DirectionalLight(0xdbeafe, 0.75)
    rimLight.position.set(-100, 80, -110)
    scene.add(rimLight)

    const g = await new GLTFLoader().loadAsync(`/pcb3d/${props.partNo}.glb`)
    const model = g.scene
    const layers = spec.layers

    // 층 인덱스(분해 뷰 오프셋 계산용)
    const layerOrder = (name, l) => {
      if (l) return layers.length - 1 - layers.indexOf(l)
      if (name.startsWith('Silkscreen_')) return layers.length + 1.4
      if (name.startsWith('Pads_Gold_') || name.startsWith('Traces_Gold_') || name.startsWith('Thermal_Vias_')) return layers.length + 0.8
      if (name.startsWith('Traces_Masked_')) return layers.length + 0.3
      return (layers.length - 1) / 2
    }

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
        roughness: isGold ? 0.26 : metal ? 0.34 : 0.76,
        metalness: isGold ? 0.68 : metal ? 0.52 : 0.04,
      })
      const region =
        kind === 'FINISH' || name.startsWith('Pads_Gold_') || name.startsWith('Traces_Gold_')
          ? 'pad'
          : isVia || name.startsWith('Thermal_Vias_')
            ? 'via'
            : l
              ? regionOfLayer(l, layers)
              : null
      o.userData = {
        region,
        kind,
        order: layerOrder(name, l),
        basePos: o.position.clone(),
        layerCount: layers.length,
        isThroughVia: isVia,
      }
      meshes.push(o)

      // 의심층 표시 시 사용할 깔끔한 외곽선(EdgesGeometry) 미리 준비 (기본 숨김)
      const edges = new THREE.EdgesGeometry(o.geometry, 28)
      const lineMat = new THREE.LineBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.9 })
      const line = new THREE.LineSegments(edges, lineMat)
      line.visible = false
      o.add(line)
      o.userData.outline = line
      outlineLines.push(line)

      if (region && !regionAnchors[region]) regionAnchors[region] = o
    })

    // glTF는 미터·Y-위: FreeCAD mm로 되돌리고, 가장 얇은 축을 위로
    let box = new THREE.Box3().setFromObject(model)
    const s0 = box.getSize(new THREE.Vector3())
    const modelScale = Math.max(s0.x, s0.y, s0.z) < 5 ? 1000 : 1
    model.scale.setScalar(modelScale)
    const thin = ['x', 'y', 'z'].reduce((a, b) => (s0[a] < s0[b] ? a : b))
    explodeAxis = thin
    explodeStep = 0.5 / modelScale // 층당 약 0.5mm 수직 분해 간격
    if (thin === 'z') model.rotation.x = -Math.PI / 2
    if (thin === 'x') model.rotation.z = Math.PI / 2

    root = new THREE.Group()
    root.add(model)
    box = new THREE.Box3().setFromObject(root)
    size = box.getSize(new THREE.Vector3())
    model.position.sub(box.getCenter(new THREE.Vector3())).add(new THREE.Vector3(0, size.y / 2, 0))
    scene.add(root)

    applyScale()
    paint()
    view('all')

    ro = new ResizeObserver(() => {
      if (!el.value) return
      const W = el.value.clientWidth, H = el.value.clientHeight
      renderer.setSize(W, H)
      cam.aspect = W / H
      cam.updateProjectionMatrix()
    })
    ro.observe(el.value)

    const projVec = new THREE.Vector3()
    const tempBox = new THREE.Box3()
    const loop = () => {
      controls.update()
      renderer.render(scene, cam)
      if (suspectMode.value && el.value) {
        const W = el.value.clientWidth, H = el.value.clientHeight
        const next = []
        for (const c of suspectCandidates.value) {
          const anchor = regionAnchors[c.region]
          if (!anchor) continue
          tempBox.setFromObject(anchor)
          tempBox.getCenter(projVec)
          // 단면 우측 근처에 라벨이 자연스럽게 뜨도록 약간 오프셋
          projVec.y = tempBox.max.y + 0.6
          projVec.project(cam)
          if (projVec.z <= 1) {
            next.push({
              ...c,
              x: Math.max(70, Math.min(W - 90, (projVec.x * 0.5 + 0.5) * W)),
              y: Math.max(46, Math.min(H - 42, (-projVec.y * 0.5 + 0.5) * H)),
            })
          }
        }
        callouts.value = next
      } else if (callouts.value.length) {
        callouts.value = []
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
}

function paint() {
  if (!THREE) return
  const active = suspectMode.value
  for (const m of meshes) {
    const rk = rankOfRegion.value[m.userData.region]
    const hit = active && rk !== undefined

    // 항상 원래 PCB 재질 색상을 유지 (빨간색 칠하기 제거!)
    m.material.color.setHex(BASE[m.userData.kind])
    m.material.emissive.setHex(hit ? Number('0x' + RANK[rk].fill.slice(1)) : 0x000000)
    m.material.emissiveIntensity = hit ? 0.18 : 0

    // 의심층 표시가 켜졌을 때만 비의심층을 은은한 반투명 글래스로 낮추고, 의심층에 외곽선 강조
    const fade = active && !hit
    m.material.transparent = fade
    m.material.opacity = fade ? (m.userData.kind === 'SOLDERMASK' ? 0.14 : 0.2) : 1
    m.material.depthWrite = !fade
    m.material.needsUpdate = true

    const line = m.userData.outline
    if (line) {
      line.visible = hit
      if (hit) line.material.color.setHex(Number('0x' + RANK[rk].fill.slice(1)))
    }

    // 의심층 표시 시 층간 미세 분해(Exploded stackup)로 내층·비아까지 한눈에 보이게
    const base = m.userData.basePos
    m.position.copy(base)
    if (active && !m.userData.isThroughVia) {
      const mid = (m.userData.layerCount - 1) / 2
      const delta = (m.userData.order - mid) * explodeStep
      m.position[explodeAxis] = base[explodeAxis] + delta
    }
  }
}

// 시점 전환: 전체 보기 / 단면 확대
function view(m) {
  if (!size) return
  const hgt = size.y * zscale.value
  if (m === 'all') {
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

watch([suspectMode, rankOfRegion], paint)
watch(zscale, () => { applyScale(); view(mode.value) })

onMounted(init)
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
  renderer?.dispose()
})
</script>

<template>
  <div class="relative h-[400px] overflow-hidden rounded-[12px] border bg-gradient-to-b from-[#f8fafc] to-[#eaedf2]">
    <div ref="el" class="absolute inset-0" />

    <!-- 3D 의심층 표시 모드일 때 떠 있는 위치 추적 라벨 -->
    <template v-if="status === 'ready' && suspectMode">
      <div
        v-for="c in callouts"
        :key="c.region"
        class="pointer-events-none absolute -translate-x-1/2 -translate-y-full select-none transition-opacity"
        :style="{ left: `${c.x}px`, top: `${c.y}px` }"
      >
        <div
          class="flex items-center gap-1.5 whitespace-nowrap rounded-full border bg-white/95 px-2.5 py-1 text-[11px] font-semibold shadow-sm backdrop-blur-xs"
          :style="{ borderColor: c.color.fill, color: c.color.text }"
        >
          <span class="grid size-4 place-items-center rounded-full text-[10px] font-bold text-white" :style="{ background: c.color.fill }">{{ c.rank + 1 }}</span>
          <span>{{ c.label }}</span>
        </div>
      </div>
    </template>

    <!-- 좌측 상단 컨트롤 -->
    <div v-if="status === 'ready'" class="absolute left-3 top-3 flex flex-wrap gap-1.5 text-xs">
      <button class="rounded-md border bg-white/95 px-2.5 py-1 shadow-2xs transition-colors" :class="mode === 'all' ? 'border-primary font-semibold text-primary' : 'hover:bg-white'" @click="view('all')">전체 보기</button>
      <button class="rounded-md border bg-white/95 px-2.5 py-1 shadow-2xs transition-colors" :class="mode === 'cut' ? 'border-primary font-semibold text-primary' : 'hover:bg-white'" @click="view('cut')">단면 확대</button>
      <button
        v-if="suspectCandidates.length"
        class="flex items-center gap-1.5 rounded-md border px-2.5 py-1 font-medium shadow-2xs transition-colors"
        :class="suspectMode ? 'border-[#1e293b] bg-[#1e293b] text-white' : 'border-[#d0d5dd] bg-white/95 text-[#344054] hover:bg-white'"
        :aria-pressed="suspectMode"
        @click="suspectMode = !suspectMode"
      >
        <span class="inline-block size-2 rounded-full" :style="{ background: suspectMode ? '#fbbf24' : '#ea002c' }" />
        {{ suspectMode ? '의심층 표시 해제' : '의심층 표시' }}
      </button>
    </div>

    <!-- 우측 상단 두께 슬라이더 -->
    <label v-if="status === 'ready'" class="absolute right-3 top-3 flex items-center gap-2 rounded-md border bg-white/95 px-2.5 py-1 text-xs shadow-2xs">
      두께 과장 <input v-model.number="zscale" type="range" min="1" max="12" class="w-20 accent-[#ea002c]" /> ×{{ zscale }}
    </label>

    <p v-if="status === 'loading'" class="absolute inset-0 grid place-items-center text-sm text-muted-foreground">3D 모델을 불러오는 중…</p>
    <p v-if="status === 'missing'" class="absolute inset-0 grid place-items-center text-sm text-muted-foreground">이 제품({{ partNo || '-' }})의 3D 모델이 없습니다.</p>
    <p class="absolute bottom-3 left-3 rounded-md bg-[#20232b]/85 px-2.5 py-1 text-[11px] text-[#ffd54a]">
      {{ suspectMode ? '의심층 분해·외곽선 강조 모드 · 마우스로 회전·확대' : '가정 치수 모델 · 마우스로 회전·확대 · 의심층 표시 버튼으로 결함 추정 층 확인' }}
    </p>
  </div>
</template>
