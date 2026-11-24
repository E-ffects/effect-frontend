<script setup>
defineProps({ large: Boolean })
</script>

<template>
  <!-- SK 로고 | E!ffect 워드마크 (로고 원본: public/brand/sk-logo.png). 로고가 둘로 보이지 않게 E 사각 마크는 쓰지 않는다 -->
  <span class="flex items-center whitespace-nowrap" :class="large ? 'gap-4' : 'gap-3'">
    <img src="/brand/sk-logo.png" alt="SK" :class="large ? 'h-9' : 'h-7'" class="w-auto shrink-0" />
    <span :class="large ? 'h-7' : 'h-5'" class="w-px bg-[#d9dce1]" aria-hidden="true" />
    <span class="leading-none">
      <span :class="large ? 'text-[24px]' : 'text-[19px]'" class="block font-bold tracking-[-0.8px] text-[#111]">E<span class="text-primary">!</span>ffect</span>
      <small class="mt-1 block text-[9.5px] font-medium tracking-[1.4px] text-[#8b919c]">RMA INTELLIGENCE</small>
    </span>
  </span>
</template>
