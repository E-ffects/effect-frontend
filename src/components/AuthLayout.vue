<script setup>
import BrandMark from './BrandMark.vue'
</script>

<template>
  <!-- 로그인·회원가입 공통: 왼쪽 브랜드 소개 + 오른쪽 폼 -->
  <div class="grid min-h-screen bg-white lg:grid-cols-[0.9fr_1.1fr]">
    <aside class="relative hidden flex-col justify-between overflow-hidden bg-[#fff5f5] p-14 lg:flex">
      <BrandMark large />
      <div>
        <p class="mb-5 text-[12px] font-semibold tracking-[1.2px] text-muted-foreground">QUALITY, WITH CLARITY.</p>
        <h1 class="text-[44px] font-extrabold leading-[1.3] tracking-[-2px]">
          SSD, 더 명확한 분석.<br />더 빠른 대응.<br /><span class="text-primary">더 나은 품질.</span>
        </h1>
        <p class="mt-6 text-sm leading-relaxed text-muted-foreground">SSD 반품 데이터에서 반복되는 문제를 발견하고,<br />근거 있는 의사결정으로 연결합니다.</p>
      </div>
      <p class="text-[12px] text-muted-foreground">© 2026 E!ffect RMA Intelligence</p>
      <span class="pointer-events-none absolute -bottom-64 -right-64 size-[500px] rounded-full border-[80px] border-[#ea002c08]" />
    </aside>
    <main class="flex items-center justify-center p-10">
      <div class="w-full max-w-[380px]">
        <div class="mb-8 lg:hidden"><BrandMark /></div>
        <slot />
      </div>
    </main>
  </div>
</template>
