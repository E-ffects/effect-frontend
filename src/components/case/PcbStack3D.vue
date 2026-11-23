<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { loadStackup, RANK, regionOfCandidate, regionOfLayer } from '@/lib/pcbRegion'

// 원인 위치의 "3D로 보기": 제품 스택업 모델(effect/pcb3d, FreeCAD로 만든 가정 치수)에 원인 후보 부위를 층 단위로 강조한다.
// 모델: public/pcb3d/{part_no}.glb. three.js와 모델은 이 컴포넌트가 처음 그려질 때만 불러온다.
const props = defineProps({ result: Object, partNo: String })
const r = computed(() => props.result || {})

const BASE = { SOLDERMASK: 0x1f7a45, COPPER: 0xc8763a, PREPREG: 0xdccf9e, CORE: 0xcbbc85, BUILDUP: 0xb9c19c, VIA: 0xc8763a, FINISH: 0xe6c34d }

const el = ref(null)
const status = ref('loading') // loading | ready | missing
const zscale = ref(4)
const xray = ref(true) // 기본: 의심 층만 진하게, 나머지는 흐리게
const mode = ref('cut')

const rankOfRegion = computed(() => {
  const m = {}
  ;(r.value.cause_candidates || []).slice(0, 3).forEach((c, i) => {
    const reg = regionOfCandidate(c, r.value.classification?.minor_code)
    if (reg && m[reg] === undefined) m[reg] = i
  })
  return m
})

let THREE, renderer, scene, cam, controls, root, size, raf, ro
const meshes = []
async function init() {
  try {
    const spec = await loadStackup(props.partNo)
    if (!spec) { status.value = 'missing'; return }
    THREE = await import('three')
    const [{ OrbitControls }, { GLTFLoader }] = await Promise.all([import('three/addons/controls/OrbitControls.js'), import('three/addons/loaders/GLTFLoader.js')])
    const w = el.value.clientWidth, h = el.value.clientHeight
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true })
    renderer.setPixelRatio(devicePixelRatio)
    renderer.setSize(w, h)
    el.value.appendChild(renderer.domElement)
    scene = new THREE.Scene()
    cam = new THREE.PerspectiveCamera(30, w / h, 0.1, 5000)
    controls = new OrbitControls(cam, renderer.domElement)
    controls.enableDamping = true
    scene.add(new THREE.HemisphereLight(0xffffff, 0x9aa3b0, 1.6))
    const sun = new THREE.DirectionalLight(0xffffff, 1.6)
    sun.position.set(80, 160, 120)
    scene.add(sun)

    const g = await new GLTFLoader().loadAsync(`/pcb3d/${props.partNo}.glb`)
    const model = g.scene
    const layers = spec.layers
    model.traverse((o) => {
      if (!o.isMesh) return
      const name = o.parent && o.parent !== model && o.parent.name ? o.parent.name : o.name
      const l = layers.find((x) => name.startsWith(x.name + '_'))
      const isVia = name.startsWith('Via_') || name.startsWith('Microvia_')
      const kind = name.startsWith('Finish_') ? 'FINISH' : isVia ? 'VIA' : l?.type || 'CORE'
      const metal = ['COPPER', 'VIA', 'FINISH'].includes(kind)
      o.material = new THREE.MeshStandardMaterial({ color: BASE[kind], roughness: metal ? 0.35 : 0.8, metalness: metal ? 0.5 : 0 })
      o.userData = { region: kind === 'FINISH' ? 'pad' : isVia ? 'via' : l ? regionOfLayer(l, layers) : null, kind }
      meshes.push(o)
    })
    // glTF는 미터·Y-위: FreeCAD mm로 되돌리고, 가장 얇은 축을 위로
    let box = new THREE.Box3().setFromObject(model)
    const s0 = box.getSize(new THREE.Vector3())
    model.scale.setScalar(Math.max(s0.x, s0.y, s0.z) < 5 ? 1000 : 1)
    const thin = ['x', 'y', 'z'].reduce((a, b) => (s0[a] < s0[b] ? a : b))
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
    view('cut')
    ro = new ResizeObserver(() => {
      const W = el.value.clientWidth, H = el.value.clientHeight
      renderer.setSize(W, H)
      cam.aspect = W / H
      cam.updateProjectionMatrix()
    })
    ro.observe(el.value)
    const loop = () => { controls.update(); renderer.render(scene, cam); raf = requestAnimationFrame(loop) }
    loop()
    status.value = 'ready'
  } catch (e) {
    console.error(e)
    status.value = 'missing'
  }
}
function applyScale() { if (root) root.scale.set(1, zscale.value, 1) }
function paint() {
  if (!THREE) return
  for (const m of meshes) {
    const rk = rankOfRegion.value[m.userData.region]
    const hit = rk !== undefined
    m.material.color.setHex(hit ? Number('0x' + RANK[rk].fill.slice(1)) : BASE[m.userData.kind])
    m.material.emissive.setHex(hit ? Number('0x' + RANK[rk].fill.slice(1)) : 0)
    m.material.emissiveIntensity = hit ? 0.35 : 0
    const fade = xray.value && !hit
    m.material.transparent = fade
    m.material.opacity = fade ? (m.userData.kind === 'SOLDERMASK' ? 0.12 : 0.22) : 1
    m.material.depthWrite = !fade
    m.material.needsUpdate = true
  }
}
// 단면 모서리: 매크로가 자른 곳 (x = 0.62w, y = 0.4h)
function view(m) {
  if (!size) return
  const hgt = size.y * zscale.value
  if (m === 'all') {
    controls.target.set(0, hgt / 2, 0)
    cam.position.set(size.x * 1.05, size.x * 0.95, size.z * 1.9)
  } else {
    const t = new THREE.Vector3(size.x * 0.12 + hgt * 0.8, hgt / 2, size.z * 0.1 + hgt * 0.4)
    const d = hgt * 2.6 + 8
    controls.target.copy(t)
    cam.position.copy(t).add(new THREE.Vector3(d * 0.9, d * 0.7, d * 1.1))
  }
  mode.value = m
}
watch([xray, rankOfRegion], paint)
watch(zscale, () => { applyScale(); view(mode.value) })

onMounted(init)
onBeforeUnmount(() => {
  cancelAnimationFrame(raf)
  ro?.disconnect()
  renderer?.dispose()
})
</script>

<template>
  <div class="relative h-[380px] overflow-hidden rounded-[10px] border bg-gradient-to-b from-[#fbfbfc] to-[#eef0f3]">
    <div ref="el" class="absolute inset-0" />
    <div v-if="status === 'ready'" class="absolute left-3 top-3 flex gap-1.5 text-xs">
      <button class="rounded-md border bg-white px-2 py-1" :class="mode === 'cut' && 'border-primary text-primary'" @click="view('cut')">단면 확대</button>
      <button class="rounded-md border bg-white px-2 py-1" :class="mode === 'all' && 'border-primary text-primary'" @click="view('all')">전체 보기</button>
      <button class="rounded-md border bg-white px-2 py-1" :class="xray && 'border-primary text-primary'" :aria-pressed="xray" @click="xray = !xray">의심 층만</button>
    </div>
    <label v-if="status === 'ready'" class="absolute right-3 top-3 flex items-center gap-2 rounded-md border bg-white px-2 py-1 text-xs">
      두께 과장 <input v-model.number="zscale" type="range" min="1" max="12" class="w-20 accent-[#ea002c]" /> ×{{ zscale }}
    </label>
    <p v-if="status === 'loading'" class="absolute inset-0 grid place-items-center text-sm text-muted-foreground">3D 모델을 불러오는 중…</p>
    <p v-if="status === 'missing'" class="absolute inset-0 grid place-items-center text-sm text-muted-foreground">이 제품({{ partNo || '-' }})의 3D 모델이 없습니다.</p>
    <p class="absolute bottom-3 left-3 rounded-md bg-[#20232b]/85 px-2 py-1 text-[11px] text-[#ffd54a]">가정 치수 모델 · 마우스로 돌리기·확대 · 회로 패턴·결함 좌표 없음</p>
  </div>
</template>
