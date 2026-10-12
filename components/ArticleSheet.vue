<template>
  <BottomSheet :open="open" :title="article ? 'Edit article' : 'New article'" @update:open="$emit('update:open', $event)">
    <form class="space-y-4" novalidate @submit.prevent="save">
      <p v-if="error" role="alert" class="rounded-lg bg-expense/10 px-3 py-2 text-sm text-expense">{{ error }}</p>

      <div>
        <label for="article-name" class="label">Name</label>
        <input id="article-name" v-model="form.name" type="text" class="input" autocomplete="off">
      </div>

      <div>
        <label for="article-category" class="label">Category</label>
        <select id="article-category" v-model="form.category" class="input pr-9">
          <option value="" disabled>Choose a category</option>
          <option v-for="category in categories" :key="category.id" :value="category.id">{{ category.name }}</option>
        </select>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <label for="article-price" class="label">Price override</label>
          <input id="article-price" v-model="form.price" type="text" inputmode="decimal" class="input" :placeholder="categoryPricePlaceholder">
          <p class="hint">Empty uses the category price</p>
        </div>
        <div>
          <label for="article-threshold" class="label">Low stock at</label>
          <input id="article-threshold" v-model="form.lowStockThreshold" type="text" inputmode="numeric" class="input">
        </div>
      </div>

      <div v-if="!article">
        <label for="article-stock" class="label">Starting stock</label>
        <input id="article-stock" v-model="form.startingStock" type="text" inputmode="numeric" class="input" placeholder="0">
      </div>

      <div>
        <label for="article-description" class="label">Description</label>
        <textarea id="article-description" v-model="form.description" rows="2" class="input py-2" />
      </div>

      <div>
        <p class="label">Images</p>
        <ul v-if="keptImages.length || newImages.length" class="mb-2 divide-y divide-line rounded-lg border border-line text-sm">
          <li v-for="name in keptImages" :key="name" class="flex items-center justify-between gap-2 pl-3">
            <span class="truncate text-ink">{{ name }}</span>
            <button
              type="button"
              class="flex h-11 w-11 shrink-0 items-center justify-center text-ink-muted hover:text-expense"
              :aria-label="`Remove image ${name}`"
              @click="removeImage(name)"
            >
              <AppIcon name="trash" class="h-4 w-4" />
            </button>
          </li>
          <li v-for="file in newImages" :key="file.name" class="truncate px-3 py-3 text-ink-muted">{{ file.name }} (new)</li>
        </ul>
        <input
          type="file"
          accept="image/*"
          multiple
          aria-label="Add images"
          class="block w-full text-sm text-ink-muted file:mr-3 file:min-h-[44px] file:rounded-lg file:border-0 file:bg-muted file:px-4 file:text-sm file:font-semibold file:text-ink"
          @change="addImages"
        >
      </div>

      <BaseButton type="submit" size="lg" block :loading="saving">{{ article ? 'Save changes' : 'Create article' }}</BaseButton>
    </form>

    <section v-if="article" class="mt-6 border-t border-line pt-5">
      <InventoryPanel :article="article" @changed="stock => $emit('stock-changed', article.id, stock)" />
    </section>

    <div v-if="article" class="mt-6 border-t border-line pt-5">
      <BaseButton v-if="!confirmingDelete" variant="ghost" block icon="trash" @click="confirmingDelete = true">Delete article</BaseButton>
      <div v-else class="space-y-3">
        <p class="text-sm text-ink-muted">Hide “{{ article.name }}” from the catalog? Its sales and stock history are kept.</p>
        <div class="grid grid-cols-2 gap-2">
          <BaseButton variant="secondary" @click="confirmingDelete = false">Cancel</BaseButton>
          <BaseButton variant="danger" :loading="deleting" @click="remove">Delete</BaseButton>
        </div>
      </div>
    </div>
  </BottomSheet>
</template>

<script setup>
import { ref, computed, watch } from 'vue'
import { useArticles } from '~/composables/useArticles'
import { useInventory } from '~/composables/useInventory'
import { formatCurrency } from '~/utils/currency'
import { correctionMovement, newRecordId } from '~/utils/inventory'

const props = defineProps({
  open: { type: Boolean, default: false },
  article: { type: Object, default: null },
  categories: { type: Array, required: true }
})
const emit = defineEmits(['update:open', 'saved', 'deleted', 'stock-changed'])

const { createArticle, updateArticle, deleteArticle } = useArticles()
const { applyMovements } = useInventory()

const emptyForm = () => ({ name: '', category: '', price: '', lowStockThreshold: '2', startingStock: '', description: '' })

const form = ref(emptyForm())
const keptImages = ref([])
const removedImages = ref([])
const newImages = ref([])
const error = ref('')
const saving = ref(false)
const deleting = ref(false)
const confirmingDelete = ref(false)

// Refill the form every time the sheet opens
watch(() => props.open, (isOpen) => {
  if (!isOpen) return
  const article = props.article
  form.value = article
    ? {
        name: article.name,
        category: article.category,
        price: Number(article.price) > 0 ? String(article.price) : '',
        lowStockThreshold: String(article.low_stock_threshold ?? 2),
        startingStock: '',
        description: article.description || ''
      }
    : emptyForm()
  keptImages.value = article ? [...(article.images || [])] : []
  removedImages.value = []
  newImages.value = []
  error.value = ''
  confirmingDelete.value = false
}, { immediate: true })

const selectedCategory = computed(() => props.categories.find(category => category.id === form.value.category))
const categoryPricePlaceholder = computed(() =>
  selectedCategory.value ? `${formatCurrency(selectedCategory.value.base_price)} (category)` : 'Category price'
)

const addImages = (event) => {
  newImages.value = [...newImages.value, ...event.target.files]
  event.target.value = ''
}

const removeImage = (name) => {
  keptImages.value = keptImages.value.filter(image => image !== name)
  removedImages.value = [...removedImages.value, name]
}

const parseNumber = value => Number(String(value).trim().replace(',', '.'))
const isBlank = value => String(value).trim() === ''
const isCount = value => Number.isInteger(parseNumber(value)) && parseNumber(value) >= 0

const validate = () => {
  if (!form.value.name.trim()) return 'Enter a name'
  if (!form.value.category) return 'Choose a category'
  if (!isBlank(form.value.price) && !(parseNumber(form.value.price) >= 0)) return 'Price must be a number'
  if (!isCount(form.value.lowStockThreshold)) return 'Low stock must be a whole number of 0 or more'
  if (!isBlank(form.value.startingStock) && !isCount(form.value.startingStock)) return 'Starting stock must be a whole number of 0 or more'
  return ''
}

const save = async () => {
  error.value = validate()
  if (error.value) return
  saving.value = true
  const fields = {
    name: form.value.name.trim(),
    category: form.value.category,
    // 0 means "no override" in PocketBase 0.22 number fields
    price: isBlank(form.value.price) ? 0 : parseNumber(form.value.price),
    low_stock_threshold: parseNumber(form.value.lowStockThreshold),
    description: form.value.description.trim()
  }
  try {
    let article
    if (props.article) {
      article = await updateArticle(props.article.id, fields, { add: newImages.value, remove: removedImages.value })
    } else {
      article = await createArticle(fields, newImages.value)
      const startingStock = isBlank(form.value.startingStock) ? 0 : parseNumber(form.value.startingStock)
      const movement = correctionMovement(0, startingStock, 'starting stock')
      if (movement) {
        const stocks = await applyMovements([{ id: newRecordId(), article: article.id, ...movement }])
        article = { ...article, stock: stocks[article.id] }
      }
    }
    emit('saved', article)
    emit('update:open', false)
  } catch (err) {
    error.value = 'Could not save the article. Check your connection and try again.'
  } finally {
    saving.value = false
  }
}

const remove = async () => {
  deleting.value = true
  try {
    await deleteArticle(props.article.id)
    emit('deleted', props.article.id)
    emit('update:open', false)
  } catch (err) {
    error.value = 'Could not delete the article. Check your connection and try again.'
    confirmingDelete.value = false
  } finally {
    deleting.value = false
  }
}
</script>
