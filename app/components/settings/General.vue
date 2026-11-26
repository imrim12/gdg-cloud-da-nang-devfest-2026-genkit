<script setup lang="ts">
const { settings, update } = useSettings()

const instructions = ref(settings.value?.instructions ?? '')
watch(() => settings.value?.instructions, (value) => {
  instructions.value = value ?? ''
})

// Bring your own key
const { data: geminiKey, refresh: refreshKey } = useFetch<{ required: boolean, saved: boolean, hint?: string }>('/api/gemini-key', { key: 'gemini-key', server: false })
const { keyOpen } = useSignInGate()
const { fetchSession } = useUserSession()
const removing = ref(false)

async function removeKey() {
  removing.value = true
  try {
    await $fetch('/api/gemini-key', { method: 'DELETE' })
    await Promise.all([refreshKey(), fetchSession()])
  } finally {
    removing.value = false
  }
}

const dirty = computed(() => instructions.value !== (settings.value?.instructions ?? ''))
const saving = ref(false)

async function save() {
  saving.value = true
  await update({ instructions: instructions.value })
  saving.value = false
}
</script>

<template>
  <div class="flex flex-col gap-3">
    <template v-if="geminiKey?.required">
      <div>
        <h3 class="font-semibold text-highlighted">
          Gemini API key
        </h3>
        <p class="text-sm text-muted">
          Your chats run on your own key. It is stored encrypted and never shown again.
        </p>
      </div>
      <div class="flex items-center gap-3 rounded-lg ring ring-default px-3 py-2.5">
        <UIcon
          name="i-lucide-key-round"
          class="size-5 shrink-0 text-muted"
        />
        <p class="text-sm flex-1 min-w-0">
          <template v-if="geminiKey.saved">
            Saved <span class="font-mono text-muted">{{ geminiKey.hint }}</span>
          </template>
          <span
            v-else
            class="text-muted"
          >No key yet</span>
        </p>
        <UButton
          :label="geminiKey.saved ? 'Replace' : 'Add key'"
          color="neutral"
          variant="outline"
          size="sm"
          @click="keyOpen = true"
        />
        <UButton
          v-if="geminiKey.saved"
          label="Remove"
          color="error"
          variant="ghost"
          size="sm"
          :loading="removing"
          @click="removeKey"
        />
      </div>
      <USeparator class="my-2" />
    </template>

    <div>
      <h3 class="font-semibold text-highlighted">
        Instructions
      </h3>
      <p class="text-sm text-muted">
        The assistant keeps these in mind in every chat: how to answer, what to call you, what to avoid.
      </p>
    </div>
    <UTextarea
      v-model="instructions"
      :rows="6"
      autoresize
      :maxrows="14"
      :maxlength="8000"
      placeholder="e.g. Keep explanations brief and to the point. Answer in Vietnamese unless I write in English."
      class="w-full"
    />
    <div class="flex justify-end gap-2">
      <UButton
        v-if="dirty"
        label="Cancel"
        color="neutral"
        variant="ghost"
        @click="instructions = settings?.instructions ?? ''"
      />
      <UButton
        label="Save"
        :disabled="!dirty"
        :loading="saving"
        @click="save"
      />
    </div>
  </div>
</template>
