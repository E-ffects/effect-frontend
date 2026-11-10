<script setup>
import { computed, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowRight } from 'lucide-vue-next'
import AuthLayout from '@/components/AuthLayout.vue'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import { api } from '@/lib/api'
import { homePath, setSession } from '@/lib/state'

const route = useRoute()
const router = useRouter()
const username = ref('')
const password = ref('')
const error = ref('')
const loading = ref(false)
const ready = computed(() => username.value.trim() && password.value)

async function submit() {
  if (!ready.value || loading.value) return
  loading.value = true
  error.value = ''
  try {
    const { token, user } = await api('/auth/login', { method: 'POST', body: { username: username.value.trim(), password: password.value } })
    setSession(token, user)
    const redirect = route.query.redirect
    router.replace(typeof redirect === 'string' && redirect.startsWith('/') ? redirect : homePath(user))
  } catch (e) {
    error.value = e.status >= 500 || e.status === 0 ? '잠시 후 다시 시도하세요' : e.message
  } finally {
    loading.value = false
  }
}
</script>

<template>
  <AuthLayout>
      <p class="mb-2 text-[12px] font-semibold tracking-[1.2px] text-muted-foreground">WELCOME BACK</p>
      <h2 class="text-[27px] font-bold tracking-[-1px]">워크스페이스 로그인</h2>
      <p class="mt-1 mb-7 text-sm text-muted-foreground">SSD 반품과 고객불만 데이터를 한눈에 확인하세요.</p>
      <form class="space-y-5" @submit.prevent="submit">
        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="username">아이디</label>
          <Input id="username" v-model="username" placeholder="아이디(사번 또는 이메일)" autocomplete="username" />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium" for="password">비밀번호</label>
          <Input id="password" v-model="password" type="password" placeholder="비밀번호" autocomplete="current-password" />
        </div>
        <Button type="submit" class="h-12 w-full text-[16px]" :disabled="!ready" :loading="loading">로그인<ArrowRight class="size-4" /></Button>
        <p v-if="error" class="text-center text-sm text-destructive">{{ error }}</p>
        <p class="text-center text-sm text-muted-foreground">
          처음 방문하셨나요? <RouterLink to="/signup" class="font-semibold text-primary underline-offset-4 hover:underline">회원가입</RouterLink>
        </p>
      </form>
      <p class="mt-6 rounded-lg bg-[#fff8f1] px-4 py-3 text-xs leading-relaxed text-[#a0632f]">역할(품질관리자 / 고객대응관리자)은 가입 시 지정된 계정 역할로 결정됩니다.</p>
  </AuthLayout>
</template>
