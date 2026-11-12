import {useState, useEffect, useCallback, createContext, useContext} from 'react'
import {PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, ResponsiveContainer} from 'recharts'
import {sb, money, totals, range, today, shift, addPeriod, toCSV, download, runRecurring} from './lib'

const Ctx = createContext()
const useD = () => useContext(Ctx)
const inp = 'w-full rounded-lg border border-slate-300 px-3 py-2 text-sm'
const btn = 'rounded-lg bg-slate-900 px-3 py-2 text-sm text-white hover:bg-slate-700'
const ghost = 'text-xs text-slate-500 hover:text-slate-900 underline'
const Card = ({t, children}) => <div className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">{t && <h3 className="mb-3 text-sm font-semibold text-slate-500">{t}</h3>}{children}</div>
const Stat = ({l, v, c = 'text-slate-900'}) => <Card><p className="text-xs text-slate-500">{l}</p><p className={`text-xl font-semibold ${c}`}>{v}</p></Card>
const Bar_ = ({pct, over}) => <div className="h-2 rounded bg-slate-200"><div className={`h-2 rounded ${over ? 'bg-red-500' : 'bg-emerald-500'}`} style={{width: Math.min(pct, 100) + '%'}} /></div>

function Auth() {
  const [e, setE] = useState(''), [p, setP] = useState(''), [up, setUp] = useState(false), [m, setM] = useState('')
  const go = async ev => {
    ev.preventDefault()
    const {error} = up ? await sb.auth.signUp({email: e, password: p}) : await sb.auth.signInWithPassword({email: e, password: p})
    setM(error ? error.message : up ? 'Check your email to confirm your account.' : '')
  }
  return <form onSubmit={go} className="mx-auto mt-24 w-80 space-y-3">
    <h1 className="text-2xl font-bold">DailyFlow Finance</h1>
    <input className={inp} type="email" placeholder="Email" value={e} onChange={x => setE(x.target.value)} required />
    <input className={inp} type="password" placeholder="Password (min 6)" value={p} onChange={x => setP(x.target.value)} minLength={6} required />
    <button className={btn + ' w-full'}>{up ? 'Sign up' : 'Sign in'}</button>
    <button type="button" className={ghost} onClick={() => setUp(!up)}>{up ? 'Have an account? Sign in' : 'New here? Sign up'}</button>
    {m && <p className="text-sm text-red-600">{m}</p>}
  </form>
}

function Provider({children}) {
  const [d, setD] = useState(null)
  const load = useCallback(async () => {
    const q = t => sb.from(t).select('*').then(r => r.data || [])
    const [accounts, categories, transactions, budgets, goals, balances, s] = await Promise.all([
      q('accounts'), q('categories'), sb.from('transactions').select('*').order('tx_date', {ascending: false}).then(r => r.data || []),
      q('budgets'), q('goals'), q('account_balances'), sb.from('settings').select('*').maybeSingle().then(r => r.data)])
    setD({accounts, categories, transactions, budgets, goals, balances, currency: s?.currency || 'USD'})
  }, [])
  useEffect(() => { runRecurring().then(load) }, [load])
  return d ? <Ctx.Provider value={{...d, load, fmt: n => money(n, d.currency)}}>{children}</Ctx.Provider> : <p className="p-8">Loading…</p>
}

function Dashboard() {
  const {transactions, categories, balances, fmt} = useD()
  const [p, setP] = useState('month')
  const [a, b] = range(p), tx = transactions.filter(x => x.tx_date >= a && x.tx_date <= b), {income, expense} = totals(tx)
  const byCat = Object.values(tx.filter(x => x.kind === 'expense').reduce((o, x) => {
    const c = categories.find(c => c.id === x.category_id), k = c?.name || 'Uncategorized'
    o[k] = o[k] || {name: k, value: 0, color: c?.color || '#94a3b8'}; o[k].value += +x.amount; return o
  }, {}))
  const months = [...Array(6)].map((_, i) => {
    const d = new Date(); d.setMonth(d.getMonth() - 5 + i, 1); const [s, e] = range('month', d)
    return {m: s.slice(0, 7), ...totals(transactions.filter(x => x.tx_date >= s && x.tx_date <= e))}
  })
  return <div className="space-y-4">
    <div className="flex gap-2">{['day', 'month', 'year'].map(x => <button key={x} onClick={() => setP(x)} className={`rounded-lg px-3 py-1 text-sm ${p === x ? 'bg-slate-900 text-white' : 'bg-white border'}`}>{x}</button>)}</div>
    <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      <Stat l="Total balance (all accounts)" v={fmt(balances.reduce((s, x) => s + +x.balance, 0))} />
      <Stat l="Income" v={fmt(income)} c="text-emerald-600" />
      <Stat l="Expenses" v={fmt(expense)} c="text-red-600" />
      <Stat l="Net cash flow" v={fmt(income - expense)} c={income - expense >= 0 ? 'text-emerald-600' : 'text-red-600'} />
    </div>
    <div className="grid gap-4 lg:grid-cols-2">
      <Card t="Expenses by category"><div className="h-64"><ResponsiveContainer><PieChart><Pie data={byCat} dataKey="value" nameKey="name" outerRadius={90}>{byCat.map((c, i) => <Cell key={i} fill={c.color} />)}</Pie><Tooltip formatter={v => fmt(v)} /><Legend /></PieChart></ResponsiveContainer></div></Card>
      <Card t="Income vs expenses (6 months)"><div className="h-64"><ResponsiveContainer><BarChart data={months}><XAxis dataKey="m" /><YAxis /><Tooltip formatter={v => fmt(v)} /><Legend /><Bar dataKey="income" fill="#10b981" /><Bar dataKey="expense" fill="#ef4444" /></BarChart></ResponsiveContainer></div></Card>
    </div>
  </div>
}

function Transactions() {
  const D = useD(), {accounts, categories, transactions, fmt} = D
  const empty = {kind: 'expense', tx_date: today(), amount: '', account_id: accounts[0]?.id || '', to_account_id: '', category_id: '', description: '', notes: '', freq: ''}
  const [f, setF] = useState(empty), [q, setQ] = useState('')
  const set = k => e => setF({...f, [k]: e.target.value})
  const save = async e => {
    e.preventDefault()
    const {id, freq, user_id, created_at, ...r} = f, tr = r.kind === 'transfer'
    const row = {...r, amount: +r.amount, to_account_id: tr ? r.to_account_id : null, category_id: tr ? null : r.category_id || null, recurring_id: r.recurring_id || null}
    const {error} = id ? await sb.from('transactions').update(row).eq('id', id) : await sb.from('transactions').insert(row)
    if (error) return alert(error.message)
    if (!id && freq) { const {tx_date, recurring_id, ...template} = row; await sb.from('recurring_rules').insert({template, frequency: freq, next_date: addPeriod(tx_date, freq)}) }
    setF({...empty, account_id: row.account_id}); D.load()
  }
  const name = id => accounts.find(a => a.id === id)?.name
  const list = transactions.filter(x => `${x.description || ''} ${x.notes || ''}`.toLowerCase().includes(q.toLowerCase()))
  return <div className="space-y-4">
    <Card t={f.id ? 'Edit transaction' : 'New transaction'}>
      <form onSubmit={save} className="grid gap-2 md:grid-cols-4">
        <select className={inp} value={f.kind} onChange={set('kind')}><option>expense</option><option>income</option><option>transfer</option></select>
        <input className={inp} type="date" value={f.tx_date} onChange={set('tx_date')} required />
        <input className={inp} type="number" step="0.01" min="0.01" placeholder="Amount" value={f.amount} onChange={set('amount')} required />
        <select className={inp} value={f.account_id} onChange={set('account_id')} required><option value="">Account…</option>{accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
        {f.kind === 'transfer'
          ? <select className={inp} value={f.to_account_id || ''} onChange={set('to_account_id')} required><option value="">To account…</option>{accounts.filter(a => a.id !== f.account_id).map(a => <option key={a.id} value={a.id}>{a.name}</option>)}</select>
          : <select className={inp} value={f.category_id || ''} onChange={set('category_id')}><option value="">Category…</option>{categories.filter(c => c.kind === f.kind).map(c => <option key={c.id} value={c.id}>{c.icon} {c.parent_id ? '↳ ' : ''}{c.name}</option>)}</select>}
        <input className={inp} placeholder="Description" value={f.description || ''} onChange={set('description')} />
        <input className={inp} placeholder="Notes" value={f.notes || ''} onChange={set('notes')} />
        {!f.id && <select className={inp} value={f.freq} onChange={set('freq')}><option value="">One-time</option>{['daily', 'weekly', 'monthly', 'yearly'].map(x => <option key={x}>{x}</option>)}</select>}
        <button className={btn}>{f.id ? 'Update' : 'Add'}</button>
        {f.id && <button type="button" className={ghost} onClick={() => setF(empty)}>Cancel</button>}
      </form>
    </Card>
    <input className={inp} placeholder="Search description or notes…" value={q} onChange={e => setQ(e.target.value)} />
    <Card><ul className="divide-y">{list.map(x => <li key={x.id} className="flex items-center justify-between gap-2 py-2 text-sm">
      <span><b>{x.description || x.kind}</b> <span className="text-slate-500">{x.tx_date} · {name(x.account_id)}{x.to_account_id && ` → ${name(x.to_account_id)}`}</span></span>
      <span className="flex items-center gap-3"><span className={x.kind === 'income' ? 'text-emerald-600' : x.kind === 'expense' ? 'text-red-600' : 'text-slate-600'}>{x.kind === 'expense' ? '-' : x.kind === 'income' ? '+' : ''}{fmt(x.amount)}</span>
        <button className={ghost} onClick={() => setF({...x, freq: ''})}>edit</button>
        <button className={ghost} onClick={async () => { if (confirm('Delete?')) { await sb.from('transactions').delete().eq('id', x.id); D.load() } }}>delete</button></span>
    </li>)}</ul>{!list.length && <p className="text-sm text-slate-500">No transactions.</p>}</Card>
  </div>
}

// Generic create/edit/delete block used by accounts, categories, budgets, goals
function Crud({title, table, fields, rows, show, empty}) {
  const D = useD(), [f, setF] = useState(empty)
  const save = async e => {
    e.preventDefault()
    const {id, user_id, created_at, ...r} = f; for (const k in r) if (r[k] === '') r[k] = null
    const {error} = id ? await sb.from(table).update(r).eq('id', id) : await sb.from(table).insert(r)
    if (error) return alert(error.message)
    setF(empty); D.load()
  }
  return <div className="space-y-4">
    <Card t={`${f.id ? 'Edit' : 'New'} ${title}`}><form onSubmit={save} className="grid gap-2 md:grid-cols-4">
      {fields.map(x => x.opts
        ? <select key={x.k} className={inp} value={f[x.k] ?? ''} onChange={e => setF({...f, [x.k]: e.target.value})}><option value="">{x.l}…</option>{x.opts.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        : <input key={x.k} className={inp} type={x.type || 'text'} step="any" placeholder={x.l} title={x.l} value={f[x.k] ?? ''} onChange={e => setF({...f, [x.k]: e.target.value})} required={x.req} />)}
      <button className={btn}>{f.id ? 'Update' : 'Add'}</button>{f.id && <button type="button" className={ghost} onClick={() => setF(empty)}>Cancel</button>}
    </form></Card>
    <Card><ul className="divide-y">{rows.map(r => <li key={r.id} className="flex items-center justify-between gap-3 py-2 text-sm"><div className="flex-1">{show(r)}</div>
      <button className={ghost} onClick={() => setF(r)}>edit</button>
      <button className={ghost} onClick={async () => { if (confirm('Delete?')) { await sb.from(table).delete().eq('id', r.id); D.load() } }}>delete</button></li>)}</ul></Card>
  </div>
}

const Accounts = () => { const D = useD(); return <Crud title="account" table="accounts" rows={D.accounts} empty={{name: '', type: 'bank', opening_balance: 0}}
  fields={[{k: 'name', l: 'Name', req: 1}, {k: 'type', l: 'Type', opts: [['cash', 'Cash'], ['bank', 'Bank'], ['wallet', 'Digital wallet']]}, {k: 'opening_balance', l: 'Opening balance', type: 'number'}]}
  show={r => <>{r.name} <span className="text-slate-500">({r.type})</span> — <b>{D.fmt(D.balances.find(b => b.id === r.id)?.balance)}</b></>} /> }

const Categories = () => { const D = useD(); return <Crud title="category" table="categories" rows={D.categories} empty={{name: '', kind: 'expense', parent_id: '', color: '#10b981', icon: '🏷️'}}
  fields={[{k: 'name', l: 'Name', req: 1}, {k: 'kind', l: 'Kind', opts: [['expense', 'Expense'], ['income', 'Income']]}, {k: 'parent_id', l: 'Parent (optional)', opts: D.categories.filter(c => !c.parent_id).map(c => [c.id, c.name])}, {k: 'color', l: 'Color', type: 'color'}, {k: 'icon', l: 'Icon (emoji)'}]}
  show={r => <><span style={{color: r.color}}>●</span> {r.icon} {r.parent_id && '↳ '}{r.name} <span className="text-slate-500">({r.kind})</span></>} /> }

const Budgets = () => {
  const D = useD()
  const spent = b => {
    const [s, e] = range(b.period === 'daily' ? 'day' : b.period === 'monthly' ? 'month' : 'year')
    const ids = b.category_id ? [b.category_id, ...D.categories.filter(c => c.parent_id === b.category_id).map(c => c.id)] : null
    return totals(D.transactions.filter(x => x.tx_date >= s && x.tx_date <= e && x.kind === 'expense' && (!ids || ids.includes(x.category_id)))).expense
  }
  return <Crud title="budget" table="budgets" rows={D.budgets} empty={{category_id: '', period: 'monthly', amount: ''}}
    fields={[{k: 'category_id', l: 'Category (blank = all)', opts: D.categories.filter(c => c.kind === 'expense').map(c => [c.id, c.name])}, {k: 'period', l: 'Period', opts: [['daily', 'Daily'], ['monthly', 'Monthly'], ['yearly', 'Yearly']]}, {k: 'amount', l: 'Limit', type: 'number', req: 1}]}
    show={r => { const s = spent(r), pct = s / r.amount * 100; return <><div className="mb-1 flex justify-between"><span>{D.categories.find(c => c.id === r.category_id)?.name || 'All expenses'} · {r.period}</span><span>{D.fmt(s)} / {D.fmt(r.amount)} ({Math.round(pct)}%)</span></div><Bar_ pct={pct} over={pct > 100} /></> }} />
}

const Goals = () => { const D = useD(); return <Crud title="goal" table="goals" rows={D.goals} empty={{name: '', target_amount: '', saved_amount: 0, deadline: ''}}
  fields={[{k: 'name', l: 'Goal name', req: 1}, {k: 'target_amount', l: 'Target', type: 'number', req: 1}, {k: 'saved_amount', l: 'Saved so far', type: 'number'}, {k: 'deadline', l: 'Deadline', type: 'date'}]}
  show={r => { const pct = r.saved_amount / r.target_amount * 100; return <><div className="mb-1 flex justify-between"><span>{r.name}{r.deadline && ` · by ${r.deadline}`}</span><span>{D.fmt(r.saved_amount)} / {D.fmt(r.target_amount)} ({Math.round(pct)}%)</span></div><Bar_ pct={pct} /></> }} /> }

function Reports() {
  const D = useD(), [a0, b0] = range('month'), [a, setA] = useState(a0), [b, setB] = useState(b0)
  const inR = (x, s, e) => x.tx_date >= s && x.tx_date <= e
  const tx = D.transactions.filter(x => inR(x, a, b)), t = totals(tx)
  const len = Math.round((new Date(b) - new Date(a)) / 864e5) + 1, pe = shift(a, -1), ps = shift(pe, -(len - 1)), pt = totals(D.transactions.filter(x => inR(x, ps, pe)))
  const cats = Object.entries(tx.filter(x => x.kind === 'expense').reduce((o, x) => { const k = D.categories.find(c => c.id === x.category_id)?.name || 'Uncategorized'; o[k] = (o[k] || 0) + +x.amount; return o }, {})).sort((x, y) => y[1] - x[1])
  const rows = tx.map(x => ({Date: x.tx_date, Type: x.kind, Account: D.accounts.find(c => c.id === x.account_id)?.name, Category: D.categories.find(c => c.id === x.category_id)?.name || '', Amount: x.amount, Description: x.description || ''}))
  const xlsx = async () => { const X = await import('xlsx'), wb = X.utils.book_new(); X.utils.book_append_sheet(wb, X.utils.json_to_sheet(rows), 'Report'); X.writeFile(wb, `report_${a}_${b}.xlsx`) }
  const pdf = async () => { const {jsPDF} = await import('jspdf'), at = (await import('jspdf-autotable')).default, doc = new jsPDF()
    doc.text(`DailyFlow report ${a} to ${b}  |  Income ${t.income}  Expenses ${t.expense}  Net ${t.income - t.expense}`, 10, 10, {maxWidth: 190})
    at(doc, {startY: 22, head: [Object.keys(rows[0] || {Date: ''})], body: rows.map(r => Object.values(r))}); doc.save(`report_${a}_${b}.pdf`) }
  const diff = (c, p) => p ? `${Math.round((c - p) / p * 100)}% vs prev` : 'no prior data'
  return <div className="space-y-4">
    <div className="flex flex-wrap items-center gap-2"><input type="date" className={inp + ' !w-40'} value={a} onChange={e => setA(e.target.value)} /> to <input type="date" className={inp + ' !w-40'} value={b} onChange={e => setB(e.target.value)} />
      <button className={btn} onClick={() => download('report.csv', toCSV(rows), 'text/csv')}>CSV</button><button className={btn} onClick={xlsx}>Excel</button><button className={btn} onClick={pdf}>PDF</button></div>
    <div className="grid gap-3 md:grid-cols-3">
      <Stat l={`Income · ${diff(t.income, pt.income)}`} v={D.fmt(t.income)} c="text-emerald-600" /><Stat l={`Expenses · ${diff(t.expense, pt.expense)}`} v={D.fmt(t.expense)} c="text-red-600" /><Stat l="Net" v={D.fmt(t.income - t.expense)} /></div>
    <Card t="Expenses by category">{cats.map(([k, v]) => <div key={k} className="flex justify-between border-b py-1 text-sm"><span>{k}</span><span>{D.fmt(v)} ({t.expense ? Math.round(v / t.expense * 100) : 0}%)</span></div>)}</Card>
  </div>
}

function Settings() {
  const D = useD(), T = ['accounts', 'categories', 'transactions', 'recurring_rules', 'budgets', 'goals']
  const setCur = async e => { const {data} = await sb.auth.getUser(); await sb.from('settings').upsert({user_id: data.user.id, currency: e.target.value}); D.load() }
  const backup = async () => { const o = {}; for (const t of T) o[t] = (await sb.from(t).select('*')).data; download('dailyflow-backup.json', JSON.stringify(o), 'application/json') }
  const restore = async e => {
    const o = JSON.parse(await e.target.files[0].text()), {data} = await sb.auth.getUser()
    for (const t of T) if (o[t]?.length) { const {error} = await sb.from(t).upsert(o[t].map(r => ({...r, user_id: data.user.id}))); if (error) return alert(`${t}: ${error.message}`) }
    D.load(); alert('Restored')
  }
  return <div className="max-w-md space-y-4"><Card t="Currency"><select className={inp} value={D.currency} onChange={setCur}>{['USD', 'EUR', 'GBP', 'JPY', 'THB', 'KHR'].map(c => <option key={c}>{c}</option>)}</select></Card>
    <Card t="Backup & restore"><button className={btn} onClick={backup}>Download backup</button><label className="mt-3 block text-sm">Restore from file <input type="file" accept=".json" onChange={restore} /></label></Card></div>
}

const PAGES = {Dashboard, Transactions, Accounts, Categories, Budgets, Goals, Reports, Settings}
export default function App() {
  const [s, setS] = useState(undefined), [pg, setPg] = useState('Dashboard')
  useEffect(() => { sb.auth.getSession().then(r => setS(r.data.session)); const {data} = sb.auth.onAuthStateChange((_, x) => setS(x)); return () => data.subscription.unsubscribe() }, [])
  if (s === undefined) return null
  if (!s) return <Auth />
  const P = PAGES[pg]
  return <Provider key={s.user.id}><div className="min-h-screen bg-slate-50 text-slate-900 md:flex">
    <nav className="flex gap-1 overflow-x-auto bg-slate-900 p-2 md:w-56 md:flex-col md:p-4">
      <h1 className="hidden px-3 pb-4 text-lg font-bold text-white md:block">DailyFlow</h1>
      {Object.keys(PAGES).map(k => <button key={k} onClick={() => setPg(k)} className={`whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm ${pg === k ? 'bg-white text-slate-900' : 'text-slate-300 hover:bg-slate-800'}`}>{k}</button>)}
      <button onClick={() => sb.auth.signOut()} className="whitespace-nowrap rounded-lg px-3 py-2 text-left text-sm text-slate-400 md:mt-auto">Sign out</button>
    </nav>
    <main className="flex-1 p-4 md:p-8"><h2 className="mb-4 text-xl font-semibold">{pg}</h2><P /></main>
  </div></Provider>
}
