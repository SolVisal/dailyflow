import {createClient} from '@supabase/supabase-js'
export const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY)
export const money = (n, c = 'USD') => new Intl.NumberFormat(undefined, {style: 'currency', currency: c}).format(n || 0)
const f = d => d.toLocaleDateString('en-CA') // local YYYY-MM-DD, no timezone drift
export const today = () => f(new Date())
export const shift = (s, n) => { const d = new Date(s + 'T00:00:00'); d.setDate(d.getDate() + n); return f(d) }
export const addPeriod = (s, fr) => {
  const d = new Date(s + 'T00:00:00')
  if (fr === 'daily') d.setDate(d.getDate() + 1); else if (fr === 'weekly') d.setDate(d.getDate() + 7)
  else if (fr === 'monthly') d.setMonth(d.getMonth() + 1); else d.setFullYear(d.getFullYear() + 1)
  return f(d)
}
// Inclusive [from, to] boundaries
export const range = (p, d = new Date()) => {
  const y = d.getFullYear(), m = d.getMonth()
  if (p === 'day') return [f(d), f(d)]
  if (p === 'month') return [f(new Date(y, m, 1)), f(new Date(y, m + 1, 0))]
  return [f(new Date(y, 0, 1)), f(new Date(y, 11, 31))]
}
// Transfers are internal: never counted as income or expense
export const totals = tx => tx.reduce((s, t) => {
  if (t.kind === 'income') s.income += +t.amount
  if (t.kind === 'expense') s.expense += +t.amount
  return s
}, {income: 0, expense: 0})
export const toCSV = rows => {
  if (!rows.length) return ''
  const k = Object.keys(rows[0]), q = v => `"${String(v ?? '').replace(/"/g, '""')}"`
  return [k.join(','), ...rows.map(r => k.map(c => q(r[c])).join(','))].join('\n')
}
export const download = (name, text, type = 'text/plain') => {
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([text], {type})); a.download = name; a.click()
}
// Materialise due recurring rows; unique(recurring_id, tx_date) makes this idempotent
export async function runRecurring() {
  const {data: rules} = await sb.from('recurring_rules').select('*').eq('active', true).lte('next_date', today())
  for (const r of rules || []) {
    let n = r.next_date; const rows = []
    while (n <= today() && (!r.end_date || n <= r.end_date)) { rows.push({...r.template, tx_date: n, recurring_id: r.id}); n = addPeriod(n, r.frequency) }
    if (rows.length) await sb.from('transactions').upsert(rows, {onConflict: 'recurring_id,tx_date', ignoreDuplicates: true})
    await sb.from('recurring_rules').update({next_date: n}).eq('id', r.id)
  }
}
