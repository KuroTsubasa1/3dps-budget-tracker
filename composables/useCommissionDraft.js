// Cart lines handed from the catalog to the Commissions page. It is a one-time hand-over, not a saved cart:
// the page takes it once, so leaving and coming back (or a reload) does not reopen the form.
export const useCommissionDraft = () => {
  const draft = useState('commissionDraft', () => [])

  const setDraft = (lines) => {
    draft.value = lines.map(line => ({ article: line.article, name: line.name, quantity: Number(line.quantity) }))
  }

  const takeDraft = () => {
    const lines = draft.value
    draft.value = []
    return lines
  }

  return { setDraft, takeDraft }
}
