<script setup>
import AuthLayout from '@/components/AuthLayout.vue'
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from '@/components/ui/Button.vue'
import Input from '@/components/ui/Input.vue'
import { api } from '@/lib/api'
import { toast } from '@/lib/state'

const router = useRouter()
const form = ref({ name: '', username: '', password: '', confirm: '', role: '' })
const usernameTaken = ref(false)
const error = ref('')
const loading = ref(false)

const pwValid = computed(() => /^(?=.*[A-Za-z])(?=.*\d)(?=.*[^A-Za-z\d]).{8,}$/.test(form.value.password))
const nameValid = computed(() => form.value.name.trim().length >= 2 && form.value.name.trim().length <= 20)
const match = computed(() => form.value.password && form.value.password === form.value.confirm)
const valid = computed(() => nameValid.value && form.value.username.trim().length >= 3 && !usernameTaken.value && pwValid.value && match.value && form.value.role)

async function checkUsername() {
  const u = form.value.username.trim()
  if (u.length < 3) return
  usernameTaken.value = !(await api('/auth/check-username', { query: { username: u } })).available
}

async function submit() {
  if (!valid.value) return
  loading.value = true
  error.value = ''
  try {
    await api('/auth/signup', {
      method: 'POST',
      body: { name: form.value.name.trim(), username: form.value.username.trim(), password: form.value.password, role: form.value.role },
    })
    toast({ title: '가입이 완료되었습니다', tone: 'green' })
    router.push('/login')
  } catch (e) {
    error.value = e.status >= 500 ? '잠시 후 다시 시도하세요' : e.message
  } finally {
    loading.value = false
  }
}

const roles = [
  { value: 'QUALITY', label: '품질관리자', desc: '대시보드, 패턴 분석, 재발 관리, AI 보고서' },
  { value: 'CS', label: '고객대응관리자', desc: '고객대응 대시보드, RMA 조회' },
]
</script>

<template>
  <AuthLayout>
      <p class="mb-2 text-[12px] font-semibold tracking-[1.2px] text-muted-foreground">CREATE ACCOUNT</p>
      <h2 class="text-[27px] font-bold tracking-[-1px]">회원가입</h2>
      <p class="mt-1 mb-6 text-sm text-muted-foreground">선택한 역할에 따라 로그인 후 메뉴와 기능이 구분됩니다.</p>
      <form class="space-y-4" @submit.prevent="submit">
        <div class="space-y-1.5">
          <label class="text-sm font-medium">이름</label>
          <Input v-model="form.name" placeholder="2~20자" :invalid="!!form.name && !nameValid" />
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">아이디</label>
          <Input v-model="form.username" placeholder="사번 또는 회사 이메일" :invalid="usernameTaken" @blur="checkUsername" @input="usernameTaken = false" />
          <p v-if="usernameTaken" class="text-xs text-destructive">이미 사용 중인 아이디입니다</p>
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">비밀번호</label>
          <Input v-model="form.password" type="password" placeholder="8자 이상, 영문, 숫자, 특수문자 포함" :invalid="!!form.password && !pwValid" />
          <p v-if="form.password && !pwValid" class="text-xs text-destructive">비밀번호는 8자 이상, 영문, 숫자, 특수문자를 포함해야 합니다</p>
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">비밀번호 확인</label>
          <Input v-model="form.confirm" type="password" :invalid="!!form.confirm && !match" />
          <p v-if="form.confirm && !match" class="text-xs text-destructive">비밀번호가 일치하지 않습니다</p>
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-medium">역할</label>
          <div class="grid grid-cols-2 gap-2">
            <label
              v-for="r in roles"
              :key="r.value"
              :class="form.role === r.value ? 'border-primary ring-1 ring-primary' : ''"
              class="cursor-pointer rounded-lg border p-3 hover:bg-muted/50"
            >
              <input v-model="form.role" type="radio" :value="r.value" class="sr-only" />
              <span class="block text-sm font-medium">{{ r.label }}</span>
              <span class="mt-1 block text-[12px] text-muted-foreground">{{ r.desc }}</span>
            </label>
          </div>
        </div>
        <p v-if="error" class="text-sm text-destructive">{{ error }}</p>
        <Button type="submit" class="w-full" :disabled="!valid" :loading="loading">가입하기</Button>
        <p class="text-center text-sm text-muted-foreground">
          이미 계정이 있나요? <RouterLink to="/login" class="font-semibold text-primary underline-offset-4 hover:underline">로그인</RouterLink>
        </p>
      </form>
  </AuthLayout>
</template>
