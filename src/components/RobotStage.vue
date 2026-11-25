<script setup>
import { nextTick, onBeforeUnmount, onMounted, ref } from 'vue'

// PIXO 데스크 버디 로봇 (Spline 공개 장면). 로봇과 문구가 한 장면 안에 들어 있어서,
// 큰 화면 크기로 장면을 띄운 뒤 로봇이 있는 부분만 잘라서 보여준다.
// 마우스를 따라 움직이고(호기심), 흔들면 어지러워하고, 가만두면 졸고, 클릭하면 손을 흔든다.
// 반응은 커서가 로봇 영역 위에 있을 때만 동작한다 (다른 도메인의 iframe이라 바깥 마우스는 읽을 수 없다).
const SRC = 'https://my.spline.design/untitled-dESa1GXEyJG0iZtoNZjnhp8i/'
const VIEW = { w: 1280, h: 800 } // 장면을 그리는 가상 화면 (데스크톱 카메라)
const REGION = { x: 610, y: 180, w: 400, h: 470 } // 그 안에서 로봇과 그림자가 있는 부분

// 좁은 화면(왼쪽 패널이 없는 곳)이나 '동작 줄이기' 설정에서는 불러오지 않는다
const enabled =
  typeof window !== 'undefined' &&
  matchMedia('(min-width: 1024px)').matches &&
  !matchMedia('(prefers-reduced-motion: reduce)').matches

const box = ref(null)
const clip = ref({ width: '0px', height: '0px' })
const style = ref({ width: `${VIEW.w}px`, height: `${VIEW.h}px` })
const ready = ref(false)
let ro

function fit() {
  const el = box.value
  if (!el || !el.clientWidth || !el.clientHeight) return
  const s = Math.min(el.clientWidth / REGION.w, el.clientHeight / REGION.h)
  // 로봇 영역만 정확히 오려서 가운데에 둔다 (그 밖의 문구가 비치지 않게)
  clip.value = { width: `${REGION.w * s}px`, height: `${REGION.h * s}px` }
  style.value = { width: `${VIEW.w}px`, height: `${VIEW.h}px`, transform: `translate(${-REGION.x * s}px, ${-REGION.y * s}px) scale(${s})` }
}

function show() {
  ready.value = true
}

onMounted(async () => {
  if (!enabled) return
  await nextTick()
  fit()
  ro = new ResizeObserver(fit)
  ro.observe(box.value)
  show() // 장면 바탕색이 패널 배경과 같아서 바로 보여도 어색하지 않다. 로봇은 준비되면 그 자리에 나타난다
})
onBeforeUnmount(() => {
  ro?.disconnect()
})
</script>

<template>
  <div v-if="enabled" ref="box" class="relative grid min-h-[220px] flex-1 place-items-center">
    <div class="robot-stage relative overflow-hidden" :style="clip">
      <iframe
        :src="SRC"
        title="PIXO, 마우스에 반응하는 3D 로봇"
        allow="autoplay"
        tabindex="-1"
        class="absolute left-0 top-0 origin-top-left border-0 transition-opacity duration-700"
        :class="ready ? 'opacity-100' : 'opacity-0'"
        :style="style"
      />
    </div>
  </div>
</template>

<style scoped>
/* 잘린 가장자리를 배경색으로 녹인다 */
.robot-stage {
  -webkit-mask-image: linear-gradient(#0000 0, #000 9%, #000 91%, #0000 100%), linear-gradient(90deg, #0000 0, #000 9%, #000 91%, #0000 100%);
  -webkit-mask-composite: source-in;
  mask-image: linear-gradient(#0000 0, #000 9%, #000 91%, #0000 100%), linear-gradient(90deg, #0000 0, #000 9%, #000 91%, #0000 100%);
  mask-composite: intersect;
}
</style>
