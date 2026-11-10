<script setup>
defineProps({ large: Boolean })
</script>

<template>
  <span class="flex items-center gap-2.5 whitespace-nowrap">
    <span
      :class="large ? 'size-10 text-[23px]' : 'size-[34px] text-[20px]'"
      class="grid place-items-center rounded-[10px] bg-primary font-extrabold tracking-[-2px] text-white"
    >E</span>
    <span>
      <span :class="large ? 'text-[24px]' : 'text-[20px]'" class="block font-extrabold leading-none tracking-[-1px]">E<span class="text-primary">!</span>ffect</span>
      <small class="mt-1 block text-[9px] font-semibold tracking-[0.6px] text-[#6f7684]">RMA INTELLIGENCE</small>
    </span>
  </span>
</template>
