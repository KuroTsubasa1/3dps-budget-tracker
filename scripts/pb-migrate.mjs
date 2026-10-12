// PocketBase 0.22 migration for categories, stock and owner-only rules.
//   npm run pb:migrate                 dry run: prints the plan, writes scripts/category-mapping.json
//   npm run pb:migrate -- --apply      schema + seed + category mapping (old rules stay; deployed app keeps working)
//   npm run pb:migrate -- --apply-rules  owner-only rules (run after the new app is deployed)
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import {
  ARTICLES,
  TRANSACTIONS,
  CATEGORY_SEED,
  planSchema,
  planRequireCategory,
  planRules,
  resolveField,
  guessCategory,
  describeOp
} from './lib/pb-plan.mjs'

try { process.loadEnvFile('.env') } catch { /* no .env: rely on the environment */ }

const BASE = (process.env.POCKETBASE_URL || 'https://pocket.lasseharm.space').replace(/\/$/, '')
const TOKEN = process.env.POCKETBASE_ADMIN_TOKEN
const MAPPING_FILE = 'scripts/category-mapping.json'
const SNAPSHOT_FILE = 'pocketbase/schema.json'
const MODE = process.argv.includes('--apply-rules') ? 'rules' : process.argv.includes('--apply') ? 'apply' : 'dry-run'

async function api (method, path, body) {
  const response = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { Authorization: TOKEN, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${text}`)
  return text ? JSON.parse(text) : null
}

const listCollections = async () => (await api('GET', '/collections?perPage=500')).items
const listRecords = async (collection) => (await api('GET', `/collections/${collection}/records?perPage=500`)).items
const byName = (collections, name) => collections.find(collection => collection.name === name)

async function applyOp (op) {
  const collections = await listCollections()
  if (op.op === 'createCollection') return api('POST', '/collections', op.body)
  const collection = byName(collections, op.collection)
  if (op.op === 'setRules') return api('PATCH', `/collections/${collection.id}`, op.rules)
  const schema = op.op === 'addFields'
    ? [...collection.schema, ...op.fields.map(field => resolveField(field, collections))]
    : collection.schema.map(field => (field.name === op.field ? { ...field, ...op.patch } : field))
  return api('PATCH', `/collections/${collection.id}`, { schema })
}

async function loadMapping (articles) {
  const saved = existsSync(MAPPING_FILE) ? JSON.parse(await readFile(MAPPING_FILE, 'utf8')) : {}
  const mapping = {}
  for (const article of articles) {
    mapping[article.id] = saved[article.id] ?? { name: article.name, category: guessCategory(article.name) }
  }
  await writeFile(MAPPING_FILE, `${JSON.stringify(mapping, null, 2)}\n`)
  return mapping
}

async function writeSnapshot () {
  const ours = new Set(['categories', 'stock_movements', ARTICLES, TRANSACTIONS])
  const snapshot = (await listCollections()).filter(collection => ours.has(collection.name))
  await mkdir('pocketbase', { recursive: true })
  await writeFile(SNAPSHOT_FILE, `${JSON.stringify(snapshot, null, 2)}\n`)
  console.log(`Wrote ${SNAPSHOT_FILE}`)
}

async function ownerCount () {
  return (await api('GET', '/collections/users/records?perPage=1')).totalItems
}

async function migrateSchema () {
  console.log(`Server: ${BASE} (PocketBase 0.22 admin API)`)
  const collections = await listCollections()
  const ops = planSchema(collections)
  console.log(ops.length ? 'Schema changes:' : 'Schema: up to date')
  ops.forEach(op => console.log(`  - ${describeOp(op)}`))

  const existing = byName(collections, 'categories') ? await listRecords('categories') : []
  const seed = CATEGORY_SEED.filter(item => !existing.some(category => category.name === item.name))
  console.log(seed.length
    ? `Categories to add: ${seed.map(item => `${item.name} (${item.base_price} €)`).join(', ')}`
    : 'Categories: all present')

  const articles = await listRecords(ARTICLES)
  const mapping = await loadMapping(articles)
  console.log(`Article → category (edit ${MAPPING_FILE} to change):`)
  for (const entry of Object.values(mapping)) console.log(`  - ${entry.name} → ${entry.category ?? 'UNMAPPED'}`)

  const owners = await ownerCount()
  console.log(owners > 0
    ? `Owner accounts in "users": ${owners}`
    : 'WARNING: no record in "users". Create your owner account in the PocketBase admin before --apply-rules.')

  if (MODE === 'dry-run') {
    console.log('\nDry run only. Fix any UNMAPPED entries, then run: npm run pb:migrate -- --apply')
    return
  }

  for (const op of ops) await applyOp(op)
  for (const item of seed) await api('POST', '/collections/categories/records', item)

  const categories = await listRecords('categories')
  const unmapped = Object.values(mapping).filter(entry => !categories.some(category => category.name === entry.category))
  if (unmapped.length) {
    throw new Error(`Map these articles to an existing category in ${MAPPING_FILE}: ${unmapped.map(entry => entry.name).join(', ')}`)
  }
  for (const article of articles) {
    const target = categories.find(category => category.name === mapping[article.id].category)
    if (article.category === target.id) continue
    // First assignment also sets the default threshold; later runs leave the owner's value alone
    const patch = article.category ? { category: target.id } : { category: target.id, low_stock_threshold: 2 }
    await api('PATCH', `/collections/${ARTICLES}/records/${article.id}`, patch)
  }
  for (const op of planRequireCategory(await listCollections())) await applyOp(op)
  await writeSnapshot()
  console.log('Done. Deploy the new app, then run: npm run pb:migrate -- --apply-rules')
}

async function migrateRules () {
  const ops = planRules(await listCollections())
  if (!ops.length) return console.log('Rules: up to date')
  if ((await ownerCount()) === 0) throw new Error('No owner account in "users"; the new rules would lock everyone out')
  for (const op of ops) {
    console.log(`  - ${describeOp(op)}`)
    await applyOp(op)
  }
  await writeSnapshot()
  console.log('Rules applied. Only the logged-in owner can write now.')
}

if (!TOKEN) {
  console.error('Set POCKETBASE_ADMIN_TOKEN in .env (PocketBase admin UI → your admin → API token). Never prefix it with NUXT_PUBLIC_.')
  process.exit(1)
}

await (MODE === 'rules' ? migrateRules() : migrateSchema()).catch((error) => {
  console.error(error.message)
  process.exit(1)
})
