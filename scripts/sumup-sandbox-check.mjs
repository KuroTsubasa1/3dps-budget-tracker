// The owner's hand-run check of the SumUp integration against the SANDBOX, through the same client the
// server uses (server/utils/sumup.js). Never part of the automated tests.
//   npm run sumup:sandbox-check                 merchant, readers, then (after a yes) a 1,00 € checkout on the paired reader
//   npm run sumup:sandbox-check -- --pair CODE  pairs the Virtual Solo that shows CODE first
// It reads only the SUMUP_* variables (from .env), refuses unless SumUp marks the account as a sandbox,
// and prints statuses and SumUp ids only: never a key.
import { createInterface } from 'node:readline/promises'
import { createSumUpClient, isSandboxMerchant } from '../server/utils/sumup.js'
import { cardSettings } from '../server/utils/cardSettings.js'
import { normalisePairingCode, PAIRING_CODE, READER_NAME, statusFromTransaction, sumupTransactionOf } from '../server/utils/cardPayments.js'

const POLL_MS = 3000
const WAIT_MS = 5 * 60_000

const settings = cardSettings(process.env)
const sumupMissing = settings.missing.filter(name => name.startsWith('SUMUP_'))
if (sumupMissing.length) {
  console.error(`Missing in .env: ${sumupMissing.join(', ')}`)
  process.exit(1)
}
const sumup = createSumUpClient({ apiKey: settings.apiKey, merchantCode: settings.merchantCode, apiUrl: settings.apiUrl, affiliate: { appId: settings.appId, key: settings.affiliateKey } })
const ask = createInterface({ input: process.stdin, output: process.stdout })
const sleep = ms => new Promise(resolve => setTimeout(resolve, ms))

try {
  const merchant = await sumup.getMerchant()
  if (!isSandboxMerchant(merchant)) {
    console.error('This is not a SumUp sandbox account (sandbox is not true). Stopping: nothing was sent.')
    process.exit(1)
  }
  console.log('Sandbox merchant: yes')

  const pairIndex = process.argv.indexOf('--pair')
  if (pairIndex > -1) {
    const code = normalisePairingCode(process.argv[pairIndex + 1])
    if (!PAIRING_CODE.test(code)) throw new Error('--pair needs the 8 or 9 character code the Virtual Solo shows')
    const reader = await sumup.createReader({ pairingCode: code, name: READER_NAME })
    console.log(`Paired: ${reader.id} (${reader.status})`)
  }

  const readers = await sumup.listReaders()
  console.log(`Readers: ${readers.length}`)
  for (const reader of readers) console.log(`  ${reader.id}  ${reader.status}  ${reader.device?.model ?? '?'}`)
  const paired = readers.find(reader => reader.status === 'paired')
  if (!paired) {
    console.log('No paired reader. Open the Virtual Solo, go to Connections → API → Connect, then run: npm run sumup:sandbox-check -- --pair <code>')
    process.exit(0)
  }
  const status = await sumup.readerStatus(paired.id).catch(error => ({ status: `unknown (${error.message})` }))
  console.log(`Reader status: ${status?.status} ${status?.state ?? ''}`)

  if ((await ask.question(`Send a 1,00 € sandbox checkout to ${paired.id}? (y/N) `)).trim().toLowerCase() !== 'y') process.exit(0)
  const foreignId = `check${Date.now().toString(36)}`
  const checkout = await sumup.checkout(paired.id, { cents: 100, description: 'Akinai sandbox check', returnUrl: null, foreignId })
  console.log(`Checkout accepted: client_transaction_id ${checkout.client_transaction_id ?? '(none)'}, foreign_transaction_id ${foreignId}`)
  console.log('Pay or cancel on the Virtual Solo. Press Enter here to Cancel on terminal instead.')

  let terminate = false
  ask.once('line', () => { terminate = true })
  let last = ''
  const until = Date.now() + WAIT_MS
  while (Date.now() < until) {
    if (terminate) {
      terminate = false
      await sumup.terminate(paired.id).then(() => console.log('Terminate: accepted'), error => console.log(`Terminate: ${error.message}`))
    }
    const transaction = await sumup.findTransaction({ clientTransactionId: checkout.client_transaction_id ?? '', foreignTransactionId: foreignId }).catch(error => ({ status: `error ${error.message}` }))
    const line = transaction ? `${transaction.status} → ${statusFromTransaction(transaction)} ${sumupTransactionOf(transaction)}` : 'not found yet → pending'
    if (line !== last) console.log(`Transaction: ${line}`)
    last = line
    if (transaction && statusFromTransaction(transaction) !== 'pending') break
    await sleep(POLL_MS)
  }
  // By foreign id as well, to confirm the server's fallback lookup finds the same transaction
  const byForeign = await sumup.findTransaction({ foreignTransactionId: foreignId }).catch(error => ({ status: `error ${error.message}` }))
  console.log(`Lookup by foreign_transaction_id: ${byForeign ? `${byForeign.status} ${sumupTransactionOf(byForeign)}` : 'not found'}`)
} catch (error) {
  console.error(`Stopped: ${error.message}`)
  process.exitCode = 1
} finally {
  ask.close()
}
