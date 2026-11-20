import { useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import {
  doc, getDoc, setDoc, serverTimestamp, collection, onSnapshot, deleteDoc,
} from 'firebase/firestore'
import { LogIn, LogOut, ShieldCheck, UserPlus, Trash2, Home } from 'lucide-react'
import { auth, db, provider, SUPER_ADMIN_EMAIL } from './firebase'

const ROLE_LABEL = { superadmin: 'Super Admin', admin: 'Admin', student: 'Pelajar' }

export default function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => onAuthStateChanged(auth, async (u) => {
    setError('')
    if (!u) { setUser(null); setProfile(null); setLoading(false); return }
    try {
      const email = (u.email || '').toLowerCase()
      const ref = doc(db, 'users', u.uid)
      let snap = await getDoc(ref)
      if (!snap.exists()) {
        const isSuper = email === SUPER_ADMIN_EMAIL
        let role = 'student'
        if (!isSuper) {
          const ap = await getDoc(doc(db, 'approvedUsers', email))
          if (!ap.exists()) throw new Error('NOT_APPROVED')
          role = ap.data().role
        }
        await setDoc(ref, {
          email, displayName: u.displayName || '', role: isSuper ? 'superadmin' : role,
          status: 'active', createdAt: serverTimestamp(), lastLoginAt: serverTimestamp(),
        })
        snap = await getDoc(ref)
      }
      setUser(u); setProfile(snap.data())
    } catch (e) {
      await signOut(auth)
      setError(e.message === 'NOT_APPROVED'
        ? 'Emel anda belum disenaraikan. Sila hubungi Super Admin.'
        : 'Log masuk gagal: ' + e.message)
    }
    setLoading(false)
  }), [])

  const login = () => signInWithPopup(auth, provider).catch((e) => setError(e.message))

  if (loading) return <p className="p-8 text-center">Memuatkan…</p>

  if (!user) return (
    <main className="min-h-screen grid place-items-center bg-navy p-4">
      <div className="bg-white rounded-2xl p-8 max-w-sm w-full text-center shadow-xl">
        <Home className="mx-auto text-teal" size={40} />
        <h1 className="mt-3 text-2xl font-bold text-navy">D'SURIA HOSTEL HUB</h1>
        <p className="text-sm text-slate-500 mt-1">One Hostel. One Platform. Everything Connected.</p>
        {error && <p role="alert" className="mt-4 text-sm text-red-600">{error}</p>}
        <button onClick={login} className="mt-6 w-full flex items-center justify-center gap-2 bg-teal text-white rounded-xl py-3 font-medium">
          <LogIn size={18} /> Log masuk dengan Google
        </button>
      </div>
    </main>
  )

  return (
    <div className="min-h-screen">
      <header className="bg-navy text-white px-4 py-3 flex items-center justify-between">
        <strong>D'SURIA HOSTEL HUB</strong>
        <button onClick={() => signOut(auth)} className="flex items-center gap-1 text-sm"><LogOut size={16} /> Log keluar</button>
      </header>
      <main className="max-w-2xl mx-auto p-4 space-y-4">
        <section className="bg-white rounded-2xl p-5 shadow-sm">
          <p className="text-sm text-slate-500">Selamat datang</p>
          <h2 className="text-xl font-semibold text-navy">{profile.displayName || profile.email}</h2>
          <p className="mt-2 inline-flex items-center gap-1 text-sm text-teal"><ShieldCheck size={16} /> {ROLE_LABEL[profile.role]}</p>
          <p className="mt-3 text-sm text-slate-500">Modul lain akan ditambah pada fasa seterusnya.</p>
        </section>
        {profile.role === 'superadmin' && <ApprovedList me={user} />}
      </main>
    </div>
  )
}

function ApprovedList({ me }) {
  const [list, setList] = useState([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('student')
  const [msg, setMsg] = useState('')

  useEffect(() => onSnapshot(collection(db, 'approvedUsers'), (s) =>
    setList(s.docs.map((d) => ({ id: d.id, ...d.data() })))), [])

  const add = async () => {
    const e = email.trim().toLowerCase()
    if (!/^\S+@\S+\.\S+$/.test(e)) { setMsg('Format emel tidak sah.'); return }
    try {
      await setDoc(doc(db, 'approvedUsers', e), { role, addedBy: me.uid, addedAt: serverTimestamp() })
      setEmail(''); setMsg('Emel ditambah.')
    } catch (err) { setMsg('Gagal: ' + err.message) }
  }
  const remove = async (id) => {
    if (window.confirm('Buang ' + id + ' daripada senarai?')) await deleteDoc(doc(db, 'approvedUsers', id))
  }

  return (
    <section className="bg-white rounded-2xl p-5 shadow-sm">
      <h3 className="font-semibold text-navy">Senarai emel dibenarkan ({list.length})</h3>
      <div className="mt-3 flex flex-col sm:flex-row gap-2">
        <input value={email} onChange={(e) => setEmail(e.target.value)} aria-label="Emel Google" placeholder="emel@gmail.com" className="flex-1 border rounded-xl px-3 py-2" />
        <select value={role} onChange={(e) => setRole(e.target.value)} aria-label="Peranan" className="border rounded-xl px-3 py-2">
          <option value="student">Pelajar</option><option value="admin">Admin</option>
        </select>
        <button onClick={add} className="bg-teal text-white rounded-xl px-4 py-2 flex items-center justify-center gap-1"><UserPlus size={16} /> Tambah</button>
      </div>
      {msg && <p className="mt-2 text-sm text-slate-600">{msg}</p>}
      {list.length === 0 && <p className="mt-4 text-sm text-slate-500">Belum ada emel. Tambah emel pelajar di atas.</p>}
      <ul className="mt-3 divide-y">
        {list.map((u) => (
          <li key={u.id} className="py-2 flex items-center justify-between text-sm">
            <span>{u.id} <em className="text-slate-400">({ROLE_LABEL[u.role]})</em></span>
            <button onClick={() => remove(u.id)} aria-label={'Buang ' + u.id} className="text-red-600"><Trash2 size={16} /></button>
          </li>
        ))}
      </ul>
    </section>
  )
}
