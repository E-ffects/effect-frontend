import { onBeforeUnmount, onMounted, ref } from 'vue'

// 컨테이너 실제 폭을 추적해 SVG를 왜곡 없이 그린다
export function useWidth(elRef) {
  const width = ref(0)
  let ro
  onMounted(() => {
    ro = new ResizeObserver(([entry]) => (width.value = Math.floor(entry.contentRect.width)))
    ro.observe(elRef.value)
  })
  onBeforeUnmount(() => ro?.disconnect())
  return width
}
