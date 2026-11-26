<script setup lang="ts">
import { formatDistanceToNow } from 'date-fns'
import { MEMORY_SECTIONS } from '#shared/utils/memory'

const emit = defineEmits<{ back: [] }>()

const toast = useToast()
const { data, status, refresh } = useFetch<MemoryItem[]>('/api/memories', { key: 'memories', server: false })

const groups = computed(() => {
  const items = data.value ?? []
  return (['You', 'Topics', 'Areas', 'Other'] as const).map(group => ({
    label: group,
    sections: MEMORY_SECTIONS
      .filter(section => section.group === group)
      .map(section => ({ ...section, items: items.filter(item => item.section === section.key) }))
      // Empty sections are still shown in "You", so there is a place to add to
      .filter(section => section.items.length || group === 'You')
  })).filter(group => group.sections.length)
})

const sectionItems = MEMORY_SECTIONS.map(section => ({ label: section.label, value: section.key }))

const editing = ref<{ id?: string, fact: string, section: string } | null>(null)
const saving = ref(false)

function startEdit(item: MemoryItem) {
  editing.value = { id: item.id, fact: item.fact, section: item.section }
}

function startAdd(section: string) {
  editing.value = { fact: '', section }
}

async function save() {
  if (!editing.value?.fact.trim()) return
  saving.value = true
  const { id, fact, section } = editing.value
  try {
    await $fetch(id ? `/api/memories/${id}` : '/api/memories', { method: id ? 'PATCH' : 'POST', body: { fact, section } })
    editing.value = null
    await refresh()
  } catch (error) {
    toast.add({ description: (error as Error).message || 'Could not save the memory', icon: 'i-lucide-alert-circle', color: 'error' })
  } finally {
    saving.value = false
  }
}

const removing = ref<string | null>(null)
async function remove(item: MemoryItem) {
  removing.value = item.id
  try {
    await $fetch(`/api/memories/${item.id}`, { method: 'DELETE' })
    data.value = data.value?.filter(other => other.id !== item.id)
  } catch (error) {
    toast.add({ description: (error as Error).message || 'Could not delete the memory', icon: 'i-lucide-alert-circle', color: 'error' })
  } finally {
    removing.value = null
  }
}

// "Tell the assistant what to change": applied by the memoryEdit Genkit flow
const request = ref('')
const applying = ref(false)
async function apply() {
  if (!request.value.trim()) return
  applying.value = true
  try {
    const result = await $fetch<{ summary: string, applied: number }>('/api/memories/edit', { method: 'POST', body: { request: request.value } })
    toast.add({ title: result.applied ? `${result.applied} change${result.applied === 1 ? '' : 's'} made` : 'Nothing changed', description: result.summary, icon: 'i-lucide-brain' })
    request.value = ''
    await refresh()
  } catch (error) {
    toast.add({ description: (error as Error).message || 'Could not change the memory', icon: 'i-lucide-alert-circle', color: 'error' })
  } finally {
    applying.value = false
  }
}

const ago = (date?: string) => date ? `Updated ${formatDistanceToNow(new Date(date), { addSuffix: true })}` : ''
</script>

<template>
  <div class="flex flex-col h-full min-h-0">
    <div class="flex items-center gap-1 text-sm mb-3 shrink-0">
      <UButton
        icon="i-lucide-arrow-left"
        label="Memory"
        color="neutral"
        variant="link"
        class="px-0"
        @click="emit('back')"
      />
      <span class="text-dimmed">/</span>
      <span class="font-medium text-highlighted">Assistant's memory</span>
      <UButton
        icon="i-lucide-refresh-cw"
        color="neutral"
        variant="ghost"
        size="xs"
        class="ms-auto"
        aria-label="Reload"
        :loading="status === 'pending'"
        @click="refresh()"
      />
    </div>

    <div class="flex-1 min-h-0 overflow-y-auto -mx-1 px-1">
      <div
        v-if="status === 'pending' && !data"
        class="flex flex-col gap-3"
      >
        <USkeleton
          v-for="i in 5"
          :key="i"
          class="h-10 w-full"
        />
      </div>

      <UEmpty
        v-else-if="status === 'error'"
        icon="i-lucide-cloud-off"
        title="Could not load memory"
        description="Memory Bank did not answer. Try again in a moment."
      />

      <template v-else>
        <p
          v-if="!data?.length"
          class="text-sm text-muted mb-4"
        >
          Nothing in memory yet. Chat as usual and the assistant will learn what matters, or add something yourself.
        </p>

        <div
          v-for="group in groups"
          :key="group.label"
          class="mb-5"
        >
          <p class="text-xs font-medium text-dimmed uppercase tracking-wide mb-1">
            {{ group.label }}
          </p>

          <div
            v-for="section in group.sections"
            :key="section.key"
            class="border-b border-default py-2"
          >
            <div class="flex items-center gap-2">
              <p class="text-sm font-medium text-highlighted">
                {{ section.label }}
              </p>
              <span class="text-xs text-dimmed truncate">{{ section.description }}</span>
              <UButton
                icon="i-lucide-plus"
                color="neutral"
                variant="ghost"
                size="xs"
                class="ms-auto"
                :aria-label="`Add to ${section.label}`"
                @click="startAdd(section.key)"
              />
            </div>

            <ul class="mt-1">
              <li
                v-for="item in section.items"
                :key="item.id"
                class="group flex items-start gap-2 rounded-md px-2 py-1.5 -mx-2 hover:bg-elevated/50"
              >
                <template v-if="editing?.id === item.id">
                  <SettingsMemoryEditor
                    v-model:fact="editing.fact"
                    v-model:section="editing.section"
                    :sections="sectionItems"
                    :saving="saving"
                    @save="save"
                    @cancel="editing = null"
                  />
                </template>
                <template v-else>
                  <p class="flex-1 text-sm text-default">
                    {{ item.fact }}
                  </p>
                  <span class="text-xs text-dimmed shrink-0 hidden sm:block pt-0.5">{{ ago(item.updateTime) }}</span>
                  <div class="flex shrink-0 opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
                    <UButton
                      icon="i-lucide-pencil"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      aria-label="Edit"
                      @click="startEdit(item)"
                    />
                    <UButton
                      icon="i-lucide-trash"
                      color="neutral"
                      variant="ghost"
                      size="xs"
                      aria-label="Delete"
                      :loading="removing === item.id"
                      @click="remove(item)"
                    />
                  </div>
                </template>
              </li>
              <li
                v-if="editing && !editing.id && editing.section === section.key"
                class="px-2 py-1.5 -mx-2"
              >
                <SettingsMemoryEditor
                  v-model:fact="editing.fact"
                  v-model:section="editing.section"
                  :sections="sectionItems"
                  :saving="saving"
                  placeholder="e.g. The user is a GDG Cloud Đà Nẵng organizer."
                  @save="save"
                  @cancel="editing = null"
                />
              </li>
            </ul>
          </div>
        </div>
      </template>
    </div>

    <form
      class="shrink-0 pt-3"
      @submit.prevent="apply"
    >
      <UInput
        v-model="request"
        placeholder="Tell the assistant what to change, e.g. &quot;I moved to Hà Nội&quot;"
        size="lg"
        class="w-full"
        :disabled="applying"
        :ui="{ base: 'rounded-full pe-11', trailing: 'pe-1.5' }"
      >
        <template #trailing>
          <UButton
            type="submit"
            icon="i-lucide-arrow-up"
            size="xs"
            class="rounded-full"
            :loading="applying"
            :disabled="!request.trim()"
            aria-label="Apply"
          />
        </template>
      </UInput>
    </form>
  </div>
</template>
