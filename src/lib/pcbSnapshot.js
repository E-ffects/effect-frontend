// 패턴 보고서 / PDF 내보내기용 정적 CAD 이미지 생성기
// 기존 /pcb3d/{part_no}.glb 모델을 오프스크린 Three.js 캔버스에서 전체·단면 2장면 PNG로 렌더링한다.
import { loadStackup } from '@/lib/pcbRegion'

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

const cache = new Map()

export async function renderPcbSnapshots(partNo) {
  if (!partNo) return null
  if (cache.has(partNo)) return cache.get(partNo)

  const task = (async () => {
    try {
      const spec = await loadStackup(partNo)
      if (!spec) return null

      const THREE = await import('three')
      const { GLTFLoader } = await import('three/addons/loaders/GLTFLoader.js')
      const g = await new GLTFLoader().loadAsync(`/pcb3d/${partNo}.glb`)

      const W = 640
      const H = 380
      const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, preserveDrawingBuffer: true })
      renderer.setSize(W, H)
      renderer.setClearColor(0xf4f6f9, 1)
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.1

      const scene = new THREE.Scene()
      scene.add(new THREE.HemisphereLight(0xffffff, 0x8b95a5, 1.5))
      const key = new THREE.DirectionalLight(0xfffaf0, 1.85)
      key.position.set(110, 200, 140)
      scene.add(key)
      const rim = new THREE.DirectionalLight(0xdbeafe, 0.8)
      rim.position.set(-100, 90, -110)
      scene.add(rim)

      const model = g.scene
      const layers = spec.layers || []
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
          roughness: isGold ? 0.25 : metal ? 0.35 : 0.76,
          metalness: isGold ? 0.68 : metal ? 0.5 : 0.04,
        })
      })

      let box = new THREE.Box3().setFromObject(model)
      const s0 = box.getSize(new THREE.Vector3())
      model.scale.setScalar(Math.max(s0.x, s0.y, s0.z) < 5 ? 1000 : 1)
      const thin = ['x', 'y', 'z'].reduce((a, b) => (s0[a] < s0[b] ? a : b))
      if (thin === 'z') model.rotation.x = -Math.PI / 2
      if (thin === 'x') model.rotation.z = Math.PI / 2

      const root = new THREE.Group()
      root.add(model)
      box = new THREE.Box3().setFromObject(root)
      const size = box.getSize(new THREE.Vector3())
      model.position.sub(box.getCenter(new THREE.Vector3())).add(new THREE.Vector3(0, size.y / 2, 0))
      root.scale.set(1, 3, 1)
      scene.add(root)

      const cam = new THREE.PerspectiveCamera(30, W / H, 0.1, 5000)
      const hgt = size.y * 3

      // 1) 전체 아이소메트릭 뷰
      cam.position.set(size.x * 0.95, size.x * 0.85, size.z * 1.55)
      cam.lookAt(0, hgt / 2, 0)
      renderer.render(scene, cam)
      const full = renderer.domElement.toDataURL('image/png')

      // 2) 단면 확대 뷰
      const target = new THREE.Vector3(size.x * 0.12 + hgt * 0.7, hgt / 2, size.z * 0.1 + hgt * 0.35)
      const d = hgt * 2.5 + 8
      cam.position.copy(target).add(new THREE.Vector3(d * 0.9, d * 0.7, d * 1.1))
      cam.lookAt(target)
      renderer.render(scene, cam)
      const cut = renderer.domElement.toDataURL('image/png')

      renderer.dispose()
      return { partNo, full, cut }
    } catch {
      return null
    }
  })()

  cache.set(partNo, task)
  return task
}
