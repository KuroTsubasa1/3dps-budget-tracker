import { usePocketBase } from './usePocketBase'
import { useArticles } from './useArticles'
import { useCommissions } from './useCommissions'
import { useInventory } from './useInventory'
import { printedMovement } from '~/utils/inventory'

export const PRINT_JOBS = 'print_jobs'
export const ALREADY_UPDATED = 'Already updated — the board has been refreshed'
const DONE_DAYS_KEPT = 2

export const staleError = () => Object.assign(new Error(ALREADY_UPDATED), { code: 'stale' })
const alreadyPrinting = () => Object.assign(new Error('This article is already printing'), { code: 'already_printing' })
const missingAsNull = err => ([403, 404].includes(err?.status) ? null : Promise.reject(err))

export const usePrintJobs = () => {
  const pb = usePocketBase()
  const { listActive } = useArticles()
  const { listCommissions } = useCommissions()
  const { applyMovements } = useInventory()
  const withArticle = { expand: 'article' }

  // Printing jobs plus the ones finished since local midnight two days ago: enough for "Done today"
  const listPrintJobs = (now = new Date()) => {
    const since = new Date(now.getFullYear(), now.getMonth(), now.getDate() - DONE_DAYS_KEPT)
    return pb.collection(PRINT_JOBS).getFullList({
      filter: pb.filter('status = "printing" || done_at >= {:since}', { since }),
      expand: 'article',
      sort: 'created'
    })
  }

  // Before the migration print_jobs is missing (404): commission cards still show, stock cards do not
  const loadBoardData = async () => {
    const [articles, jobs, commissions] = await Promise.all([
      listActive(),
      listPrintJobs().catch(missingAsNull),
      listCommissions()
    ])
    return { articles: jobs ? articles : [], jobs: jobs ?? [], commissions, jobsMissing: !jobs }
  }

  // One printing job per article: another device may have started it since the board loaded
  const startJob = async (article, quantity) => {
    const printing = await pb.collection(PRINT_JOBS).getFullList({
      filter: pb.filter('article = {:id} && status = "printing"', { id: article.id })
    })
    if (printing.length) throw alreadyPrinting()
    return pb.collection(PRINT_JOBS).create({ article: article.id, quantity, status: 'printing', done_at: '' }, withArticle)
  }

  // The printed movement's id is the job id: a retried Done finds it already written and adds nothing.
  // The job is re-read first, so a job removed elsewhere adds no stock and a finished one is left alone.
  const finishJob = async (job, now = new Date()) => {
    const current = await pb.collection(PRINT_JOBS).getOne(job.id).catch(missingAsNull)
    if (!current) throw staleError()
    if (current.status === 'done') return current
    await applyMovements([{ id: current.id, article: current.article, ...printedMovement(Number(current.quantity)) }])
    return pb.collection(PRINT_JOBS).update(current.id, { status: 'done', done_at: now.toISOString() }, withArticle)
  }

  // A job that is already gone (a retry after a lost reply) counts as removed; a finished one is never undone
  const cancelJob = async (job) => {
    const current = await pb.collection(PRINT_JOBS).getOne(job.id).catch(missingAsNull)
    if (!current) return
    if (current.status !== 'printing') throw staleError()
    await pb.collection(PRINT_JOBS).delete(current.id)
  }

  return { listPrintJobs, loadBoardData, startJob, finishJob, cancelJob }
}
