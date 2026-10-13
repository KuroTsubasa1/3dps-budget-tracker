<template>
  <BaseCard title="Categories" subtitle="Base prices apply to every article without its own price" icon="bag" flush>
    <template #actions>
      <BaseButton variant="ghost" icon="plus" aria-label="Add category" @click="openEditor(null)">Add</BaseButton>
    </template>

    <p v-if="loadError" class="px-4 py-6 text-sm text-expense md:px-5">{{ loadError }}</p>
    <p v-else-if="!categories.length" class="px-4 py-6 text-sm text-ink-muted md:px-5">No categories yet</p>
    <ul v-else class="divide-y divide-line" aria-label="Categories">
      <li v-for="(category, index) in categories" :key="category.id" class="flex items-center gap-1 py-1 pl-4 pr-1 md:pl-5">
        <button
          type="button"
          class="flex min-h-[44px] min-w-0 flex-1 items-center justify-between gap-3 text-left"
          :aria-label="`Edit ${category.name}`"
          @click="openEditor(category)"
        >
          <span class="truncate text-sm font-medium text-ink">{{ category.name }}</span>
          <span class="shrink-0 text-sm tabular-nums text-ink-muted">{{ formatCurrency(category.base_price) }}</span>
        </button>
        <button
          type="button"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-muted disabled:opacity-30"
          :aria-label="`Move ${category.name} up`"
          :disabled="index === 0 || moving"
          @click="move(index, -1)"
        >
          <AppIcon name="chevron-up" class="h-4 w-4" />
        </button>
        <button
          type="button"
          class="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg text-ink-muted hover:bg-muted disabled:opacity-30"
          :aria-label="`Move ${category.name} down`"
          :disabled="index === categories.length - 1 || moving"
          @click="move(index, 1)"
        >
          <AppIcon name="chevron-down" class="h-4 w-4" />
        </button>
      </li>
    </ul>

    <BottomSheet v-model:open="isEditorOpen" :title="editing ? 'Edit category' : 'New category'">
      <form class="space-y-4" novalidate @submit.prevent="save">
        <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>
        <div>
          <label for="category-name" class="label">Name</label>
          <input id="category-name" v-model="form.name" type="text" class="input" autocomplete="off">
        </div>
        <div>
          <label for="category-price" class="label">Base price</label>
          <input id="category-price" v-model="form.basePrice" type="text" inputmode="decimal" class="input" placeholder="0.00">
        </div>
        <BaseButton type="submit" size="lg" block :loading="saving">Save</BaseButton>
      </form>

      <div v-if="editing" class="mt-6 border-t border-line pt-5">
        <BaseButton v-if="!confirmingDelete" variant="ghost" block icon="trash" @click="confirmingDelete = true">Delete category</BaseButton>
        <div v-else class="space-y-3">
          <p class="text-sm text-ink-muted">Delete “{{ editing.name }}”? This can't be undone.</p>
          <div class="grid grid-cols-2 gap-2">
            <BaseButton variant="secondary" @click="confirmingDelete = false">Cancel</BaseButton>
            <BaseButton variant="danger" :loading="deleting" @click="remove">Delete</BaseButton>
          </div>
        </div>
      </div>
    </BottomSheet>
  </BaseCard>
</template>

<script setup>
import { ref, onMounted } from 'vue'
import { useCategories } from '~/composables/useCategories'
import { useToast } from '~/composables/useToast'
import { formatCurrency } from '~/utils/currency'

const { listCategories, createCategory, updateCategory, deleteCategory } = useCategories()
const { toast } = useToast()

const categories = ref([])
const loadError = ref('')
const isEditorOpen = ref(false)
const editing = ref(null)
const form = ref({ name: '', basePrice: '' })
const error = ref('')
const saving = ref(false)
const deleting = ref(false)
const confirmingDelete = ref(false)
const moving = ref(false)

const load = async () => {
  try {
    categories.value = await listCategories()
    loadError.value = ''
  } catch (err) {
    loadError.value = 'Could not load categories. Check your connection and try again.'
  }
}

onMounted(load)

const openEditor = (category) => {
  editing.value = category
  form.value = category ? { name: category.name, basePrice: String(category.base_price) } : { name: '', basePrice: '' }
  error.value = ''
  confirmingDelete.value = false
  isEditorOpen.value = true
}

const parsePrice = value => Number(String(value).trim().replace(',', '.'))

const validate = () => {
  const name = form.value.name.trim()
  if (!name) return 'Enter a name'
  const taken = categories.value.some(c => c.id !== editing.value?.id && c.name.toLowerCase() === name.toLowerCase())
  if (taken) return 'A category with this name already exists'
  // PocketBase 0.22 treats a required number of 0 as missing
  if (!(parsePrice(form.value.basePrice) > 0)) return 'Base price must be above 0'
  return ''
}

const save = async () => {
  error.value = validate()
  if (error.value) return
  saving.value = true
  const fields = { name: form.value.name.trim(), base_price: parsePrice(form.value.basePrice) }
  try {
    if (editing.value) {
      await updateCategory(editing.value.id, fields)
    } else {
      const last = categories.value.reduce((max, c) => Math.max(max, c.sort_order ?? 0), -1)
      await createCategory({ ...fields, sort_order: last + 1 })
    }
    await load()
    isEditorOpen.value = false
  } catch (err) {
    error.value = 'Could not save the category. Check your connection and try again.'
  } finally {
    saving.value = false
  }
}

const remove = async () => {
  deleting.value = true
  try {
    await deleteCategory(editing.value.id)
    await load()
    isEditorOpen.value = false
  } catch (err) {
    if (err.inUse) {
      error.value = `Move the ${err.inUse} ${editing.value.name} ${err.inUse === 1 ? 'article' : 'articles'} first`
    } else if (err.deal) {
      error.value = `Remove ${editing.value.name} from the deal "${err.deal.name}" first`
    } else if (err.status === 400) {
      error.value = 'Deleted articles still use this category, so it has to stay.'
    } else {
      error.value = 'Could not delete the category. Check your connection and try again.'
    }
    confirmingDelete.value = false
  } finally {
    deleting.value = false
  }
}

// Renumbers every row to its index and writes only the rows whose stored position differs.
// Writes run one at a time; on any failure the list is reloaded so the UI matches the server.
const move = async (index, direction) => {
  const target = index + direction
  const reordered = [...categories.value]
  ;[reordered[index], reordered[target]] = [reordered[target], reordered[index]]
  moving.value = true
  try {
    for (const [position, category] of reordered.entries()) {
      if (category.sort_order !== position) await updateCategory(category.id, { sort_order: position })
    }
    categories.value = reordered.map((category, position) => ({ ...category, sort_order: position }))
  } catch (err) {
    await load()
    toast('Could not reorder categories. Check your connection and try again.', { tone: 'error' })
  } finally {
    moving.value = false
  }
}
</script>
