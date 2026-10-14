// PocketBase 0.22 migration for categories, deals, stock, commissions (with items), print jobs, sale lines,
// the convention calendar and owner-only rules.
//   npm run pb:migrate                 dry run: prints the plan, writes scripts/category-mapping.json
//   npm run pb:migrate -- --apply      schema + seed (categories, deals) + category mapping + commission items (old rules stay)
//   npm run pb:migrate -- --apply-rules [--owner <email>] [--notifier <email>]
//                                      owner-only rules (run after the new app is deployed); --notifier also lets the
//                                      reminder account read conventions and push subscriptions (needs --owner)
import { readFile, writeFile, mkdir } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import {
  ARTICLES,
  TRANSACTIONS,
  CATEGORY_SEED,
  planSchema,
  planDealSeed,
  planRequireCategory,
  planRules,
  planCommissionItems,
  resolveField,
  resolveAccounts,
  guessCategory,
  describeOp
} from './lib/pb-plan.mjs'

try { process.loadEnvFile('.env') } catch { /* no .env: rely on the environment */ }

const BASE = (process.env.POCKETBASE_URL || 'https://pocket.lasseharm.space').replace(/\/$/, '')
let ADMIN_TOKEN
const MAPPING_FILE = 'scripts/category-mapping.json'
const SNAPSHOT_FILE = 'pocketbase/schema.json'
const MODE = process.argv.includes('--apply-rules') ? 'rules' : process.argv.includes('--apply') ? 'apply' : 'dry-run'

async function api (method, path, body) {
  const response = await fetch(`${BASE}/api${path}`, {
    method,
    headers: { Authorization: ADMIN_TOKEN, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined
  })
  const text = await response.text()
  if (!response.ok) throw new Error(`${method} ${path} → ${response.status} ${text}`)
  return text ? JSON.parse(text) : null
}

const listCollections = async () => (await api('GET', '/collections?perPage=500')).items
const listRecords = async (collection) => {
  const items = []
  for (let page = 1; ; page++) {
    const result = await api('GET', `/collections/${collection}/records?perPage=500&page=${page}`)
    items.push(...result.items)
    if (page >= result.totalPages) return items
  }
}
const byName = (collections, name) => collections.find(collection => collection.name === name)
const argValue = flag => { const index = process.argv.indexOf(flag); return index > -1 ? process.argv[index + 1] : undefined }

// Admin token from .env wins; otherwise log in once with the admin email and password (PocketBase 0.22)
async function adminToken () {
  if (process.env.POCKETBASE_ADMIN_TOKEN) return process.env.POCKETBASE_ADMIN_TOKEN
  const identity = process.env.POCKETBASE_ADMIN_EMAIL
  const password = process.env.POCKETBASE_ADMIN_PASSWORD
  if (!identity || !password) {
    console.error('Set POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD in .env (your PocketBase admin login). Never prefix them with NUXT_PUBLIC_.')
    process.exit(1)
  }
  const response = await fetch(`${BASE}/api/admins/auth-with-password`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identity, password })
  })
  if (!response.ok) throw new Error(`Admin login failed (${response.status}). Check POCKETBASE_ADMIN_EMAIL and POCKETBASE_ADMIN_PASSWORD.`)
  return (await response.json()).token
}

// With automigrate on, PocketBase writes a <unix seconds>_<action>_<collection>.js migration for every schema change;
// two changes in the same second collide on _migrations.file, so schema writes are spaced a little over a second apart
const MIGRATION_GAP_MS = 1500
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

async function applyOp (op) {
  await pause(MIGRATION_GAP_MS)
  const collections = await listCollections()
  if (op.op === 'createCollection') {
    return api('POST', '/collections', { ...op.body, schema: op.body.schema.map(field => resolveField(field, collections)) })
  }
  const collection = byName(collections, op.collection)
  if (op.op === 'setRules') return api('PATCH', `/collections/${collection.id}`, op.rules)
  const schema = op.op === 'addFields'
    ? [...collection.schema, ...op.fields.map(field => resolveField(field, collections))]
    : collection.schema.map(field => (field.name === op.field ? { ...field, ...op.patch } : field))
  return api('PATCH', `/collections/${collection.id}`, { schema })
}

// The mapping only gives articles without a category their first one; once set, the app owns the category
// (a re-run never moves an article the owner has re-categorised). Earlier entries stay in the file as a record.
async function loadMapping (articles) {
  const saved = existsSync(MAPPING_FILE) ? JSON.parse(await readFile(MAPPING_FILE, 'utf8')) : {}
  const mapping = {}
  for (const article of articles.filter(item => !item.category)) {
    mapping[article.id] = saved[article.id] ?? { name: article.name, category: guessCategory(article.name) }
  }
  await writeFile(MAPPING_FILE, `${JSON.stringify({ ...saved, ...mapping }, null, 2)}\n`)
  return mapping
}

async function writeSnapshot () {
  const ours = new Set(['categories', 'deals', 'stock_movements', 'commissions', 'print_jobs', 'conventions', 'push_subscriptions', ARTICLES, TRANSACTIONS])
  const snapshot = (await listCollections()).filter(collection => ours.has(collection.name))
  await mkdir('pocketbase', { recursive: true })
  await writeFile(SNAPSHOT_FILE, `${JSON.stringify(snapshot, null, 2)}\n`)
  console.log(`Wrote ${SNAPSHOT_FILE}`)
}

async function accountCount () {
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

  const existingDeals = byName(collections, 'deals') ? await listRecords('deals') : []
  // Dry run: categories that will be seeded count as present
  const plannedCategories = [...existing, ...seed.map(item => ({ id: `new:${item.name}`, name: item.name }))]
  const dealPlan = planDealSeed(existingDeals, plannedCategories)
  console.log(dealPlan.create.length ? `Deals to add: ${dealPlan.create.map(deal => deal.name).join(', ')}` : 'Deals: nothing to add')
  dealPlan.skipped.forEach(item => console.log(`  - skip ${item.name}: ${item.reason}`))

  const articles = await listRecords(ARTICLES)
  const mapping = await loadMapping(articles)
  if (Object.keys(mapping).length) {
    console.log(`Article → category for articles without one (edit ${MAPPING_FILE} to change):`)
    for (const entry of Object.values(mapping)) console.log(`  - ${entry.name} → ${entry.category ?? 'UNMAPPED'}`)
  } else {
    console.log('Article categories: all set (change them in the app)')
  }
  const legacyCommissions = planCommissionItems(byName(collections, 'commissions') ? await listRecords('commissions') : [], articles)
  console.log(legacyCommissions.length
    ? `Commissions to convert to items: ${legacyCommissions.length}`
    : 'Commissions: nothing to convert')

  console.log(`Accounts in "users": ${await accountCount()} (the owner is chosen with --owner when running --apply-rules)`)

  if (MODE === 'dry-run') {
    console.log('\nDry run only. Fix any UNMAPPED entries, then run: npm run pb:migrate -- --apply')
    return
  }

  for (const op of ops) await applyOp(op)
  // After the schema ops, items exists. Planned again from fresh records, so a re-run skips converted ones.
  const converting = planCommissionItems(await listRecords('commissions'), articles)
  // One bad record must not stop the rest: collect the failures and report them at the end
  const unconverted = []
  for (const { id, patch } of converting) {
    try {
      await api('PATCH', `/collections/commissions/records/${id}`, patch)
    } catch (error) {
      unconverted.push({ id, reason: reason(error) })
    }
  }
  if (converting.length) console.log(`Converted ${converting.length - unconverted.length} commissions to items`)
  for (const item of seed) await api('POST', '/collections/categories/records', item)

  const categories = await listRecords('categories')
  const { create: dealsToCreate } = planDealSeed(await listRecords('deals'), categories)
  for (const deal of dealsToCreate) await api('POST', '/collections/deals/records', deal)
  const unmapped = Object.values(mapping).filter(entry => !categories.some(category => category.name === entry.category))
  if (unmapped.length) {
    throw new Error(`Map these articles to an existing category in ${MAPPING_FILE}: ${unmapped.map(entry => entry.name).join(', ')}`)
  }
  for (const article of articles.filter(item => mapping[item.id])) {
    const target = categories.find(category => category.name === mapping[article.id].category)
    // First assignment also sets the default threshold and active: the catalog and rules filter on active = true,
    // and articles created before the migration may have active unset
    await api('PATCH', `/collections/${ARTICLES}/records/${article.id}`, { category: target.id, low_stock_threshold: 2, active: true })
  }
  for (const op of planRequireCategory(await listCollections())) await applyOp(op)
  await writeSnapshot()
  if (unconverted.length) {
    console.error(`Could not convert commissions: ${unconverted.map(item => item.id).join(', ')} (${[...new Set(unconverted.map(item => item.reason))].join('; ')})`)
    process.exitCode = 1
    return
  }
  console.log('Done. Deploy the new app, then run: npm run pb:migrate -- --apply-rules')
}

async function migrateRules () {
  const users = (await api('GET', '/collections/users/records?perPage=200&fields=id,email')).items
  const { owner, notifier } = resolveAccounts(users, { owner: argValue('--owner'), notifier: argValue('--notifier') })
  console.log(`Owner: ${owner.email} (${owner.id})`)
  console.log(notifier
    ? `Notifier: ${notifier.email} (${notifier.id}), may read conventions and push subscriptions`
    : 'No --notifier: conventions and push subscriptions stay owner-only (the reminder job cannot read them)')
  // users comes first, so sign-up is closed before the other collections are pinned
  const ops = planRules(await listCollections(), owner.id, notifier?.id)
  if (!ops.length) return console.log('Rules: up to date')
  for (const op of ops) {
    console.log(`  - ${describeOp(op)}`)
    await applyOp(op)
  }
  await writeSnapshot()
  console.log('Rules applied. Only the logged-in owner can write now.')
}

// fetch only says "fetch failed"; the network reason (ECONNRESET, ETIMEDOUT, a TLS error …) is in error.cause
const reason = error => error.cause ? `${error.message} (${error.cause.code || error.cause.message})` : error.message

try {
  ADMIN_TOKEN = await adminToken()
} catch (error) {
  console.error(reason(error))
  process.exit(1)
}

await (MODE === 'rules' ? migrateRules() : migrateSchema()).catch((error) => {
  console.error(reason(error))
  process.exit(1)
})
