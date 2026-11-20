import { useEffect, useMemo, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot,
  query, serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore'
import {
  Home, LogIn, LogOut, ShieldCheck, UserPlus, Trash2, Users,
  UserRound, Phone, Save, AlertCircle, CheckCircle2, RefreshCw,
  CalendarCheck, MapPin, Clock, Sparkles, MessageSquare, Wallet,
  Receipt, Siren, BookOpen, Award, Settings, ArrowLeft, LayoutDashboard,
  ClipboardList, Trash, UsersRound,
} from 'lucide-react'
import { auth, db, provider, SUPER_ADMIN_EMAIL } from './firebase'

const ROLE_LABEL = { superadmin: 'Super Admin', admin: 'Admin', student: 'Pelajar' }
const emptyContact = () => ({ fullName: '', phone: '', relationship: '', address: '' })
const initialContacts = [emptyContact(), emptyContact()]

const MODULES = [
  { id: 'home-dashboard', title: 'Home Dashboard', desc: 'Ringkasan aktiviti dan makluman hostel', icon: LayoutDashboard, status: 'ready' },
  { id: 'profile', title: 'Student Registration & Profile', desc: 'Profil pelajar dan maklumat peribadi', icon: UserRound, status: 'ready' },
  { id: 'emergency', title: 'Emergency Contact', desc: 'Maklumat waris dan penjaga', icon: Phone, status: 'ready' },
  { id: 'attendance', title: 'Class Attendance', desc: 'Rekod kehadiran kelas', icon: CalendarCheck },
  { id: 'outing', title: 'Going Home / Outing Log', desc: 'Rekod keluar, destinasi dan pulang', icon: MapPin },
  { id: 'geofence', title: 'Geofence Monitoring', desc: 'Pengesahan kembali ke kawasan hostel', icon: MapPin },
  { id: 'daily-status', title: 'Daily Student Status', desc: 'Status keberadaan dan pemantauan curfew', icon: Clock },
  { id: 'cleaning', title: 'Cleaning Schedule', desc: 'Jadual tugasan kebersihan mingguan', icon: Sparkles },
  { id: 'trash-wars', title: 'Trash Wars', desc: 'Giliran buang sampah dan ganjaran XP', icon: Trash },
  { id: 'lobby', title: 'Hostel Lobby', desc: 'Pengumuman dan ruang komuniti', icon: MessageSquare },
  { id: 'bills', title: 'Bills Management', desc: 'Pengurusan bil elektrik dan air', icon: Wallet },
  { id: 'collection', title: 'Monthly Collection', desc: 'Kutipan bulanan penghuni', icon: Receipt },
  { id: 'sos', title: 'Location Sharing & SOS', desc: 'Perkongsian lokasi secara sukarela dan bantuan kecemasan', icon: Siren },
  { id: 'rules', title: 'Hostel Rules', desc: 'Peraturan rasmi dan pengesahan bacaan', icon: BookOpen },
  { id: 'merit', title: 'Merit & Demerit System', desc: 'Rekod merit, demerit dan rayuan', icon: Award },
  { id: 'admin', title: 'Admin Management', desc: 'Pengurusan peranan dan akses pengguna', icon: Settings, superOnly: true, status: 'ready' },
]

function friendlyError(error) {
  const code = error?.code || ''
  if (code === 'permission-denied' || code === 'firestore/permission-denied') {
    return 'Akses ditolak oleh Firestore Rules. Semak rules yang telah diterbitkan.'
  }
  if (code === 'auth/popup-closed-by-user') return 'Tetingkap log masuk ditutup sebelum selesai.'
  if (code === 'auth/unauthorized-domain') return 'Domain website belum ditambah dalam Firebase Authorized Domains.'
  return error?.message || 'Ralat tidak diketahui.'
}

export default function App() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [activeModule, setActiveModule] = useState('modules')

  useEffect(() => {
    return onAuthStateChanged(auth, async (u) => {
      setLoading(true)
      setError('')
      setNotice('')
      if (!u) {
        setUser(null); setProfile(null); setLoading(false)
        return
      }
      try {
        const email = (u.email || '').trim().toLowerCase()
        if (!u.emailVerified) throw new Error('Akaun Google perlu mempunyai emel yang disahkan.')

        const userRef = doc(db, 'users', u.uid)
        const userSnap = await getDoc(userRef)
        const isSuper = email === SUPER_ADMIN_EMAIL

        if (isSuper) {
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              email, displayName: u.displayName || '', role: 'superadmin',
              status: 'active', createdAt: serverTimestamp(), lastLoginAt: serverTimestamp(),
            })
          } else {
            await updateDoc(userRef, { lastLoginAt: serverTimestamp() })
          }
        } else {
          const approvedSnap = await getDoc(doc(db, 'approvedUsers', email))
          if (!approvedSnap.exists()) throw new Error('NOT_APPROVED')
          const approved = approvedSnap.data()
          if (!['student', 'admin'].includes(approved.role)) {
            throw new Error('Peranan akaun tidak sah. Hubungi Super Admin.')
          }

          if (!userSnap.exists()) {
            await setDoc(userRef, {
              email, displayName: u.displayName || '', role: approved.role,
              status: 'active', createdAt: serverTimestamp(), lastLoginAt: serverTimestamp(),
            })
          } else {
            const current = userSnap.data()
            if (current.status !== 'active') throw new Error('Akaun anda telah digantung. Hubungi Super Admin.')
            if (current.role !== approved.role) {
              // A role change must be applied by Super Admin to both whitelist and user profile.
              throw new Error('Peranan whitelist dan profil tidak sepadan. Minta Super Admin menyegerakkan peranan anda.')
            }
            await updateDoc(userRef, { lastLoginAt: serverTimestamp() })
          }
        }

        const fresh = await getDoc(userRef)
        setUser(u)
        setProfile({ uid: u.uid, ...fresh.data() })
      } catch (e) {
        await signOut(auth)
        setUser(null); setProfile(null)
        setError(e.message === 'NOT_APPROVED'
          ? 'Emel anda belum diluluskan. Sila hubungi Super Admin.'
          : friendlyError(e))
      } finally {
        setLoading(false)
      }
    })
  }, [])

  const login = async () => {
    setError('')
    try { await signInWithPopup(auth, provider) }
    catch (e) { setError(friendlyError(e)) }
  }

  const logout = async () => {
    await signOut(auth)
    setProfile(null)
    setUser(null)
  }

  if (loading) return <div className="min-h-screen grid place-items-center"><p className="text-slate-500">Memuatkan D'SURIA HOSTEL HUB…</p></div>

  if (!user || !profile) {
    return (
      <main className="min-h-screen grid place-items-center bg-navy p-4">
        <section className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
          <Home className="mx-auto text-teal" size={42} />
          <h1 className="mt-4 text-2xl font-extrabold text-navy">D'SURIA HOSTEL HUB</h1>
          <p className="mt-2 text-sm text-slate-500">One Hostel. One Platform. Everything Connected.</p>
          {error && <div role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-left text-sm text-red-700">{error}</div>}
          <button onClick={login} className="btn-primary mt-6 w-full"><LogIn size={18}/> Log masuk dengan Google</button>
          <p className="mt-5 text-xs text-slate-400">Akses hanya untuk emel yang diluluskan.</p>
        </section>
      </main>
    )
  }

  const isSuper = profile.role === 'superadmin'
  const isAdmin = profile.role === 'admin' || isSuper

  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 flex items-center justify-between bg-navy px-4 py-4 text-white shadow">
        <div>
          <strong className="tracking-wide">D'SURIA HOSTEL HUB</strong>
          <p className="text-xs text-slate-300">One Hostel. One Platform. Everything Connected.</p>
        </div>
        <button onClick={logout} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10"><LogOut size={16}/> Log keluar</button>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        {notice && <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800"><CheckCircle2 size={18}/>{notice}</div>}
        <section className="card">
          <p className="muted">Selamat datang</p>
          <h2 className="mt-1 text-2xl font-bold text-navy">{profile.displayName || profile.email}</h2>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-teal/10 px-3 py-1 text-sm font-semibold text-teal"><ShieldCheck size={16}/>{ROLE_LABEL[profile.role]}</div>
          <p className="mt-2 text-sm text-slate-500">{profile.email}</p>
        </section>

        {activeModule === 'modules' ? (
          <>
            {isAdmin && <AdminOverview />}
            <section>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div><h3 className="section-title">Modul Hostel</h3><p className="muted mt-1">Pilih modul untuk membuka fungsi berkaitan.</p></div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">16 modul</span>
              </div>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {MODULES.filter(m => !m.superOnly || isSuper).map(m => {
                  const Icon = m.icon
                  return <button key={m.id} onClick={() => setActiveModule(m.id)} className="card group text-left transition hover:-translate-y-0.5 hover:border-teal hover:shadow-md">
                    <div className="flex items-start justify-between gap-3"><span className="rounded-xl bg-teal/10 p-3 text-teal"><Icon size={21}/></span>{m.status === 'ready' ? <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">Tersedia</span> : <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">Fasa seterusnya</span>}</div>
                    <h4 className="mt-4 font-bold text-navy">{m.title}</h4><p className="mt-1 text-sm text-slate-500">{m.desc}</p>
                  </button>
                })}
              </div>
            </section>
          </>
        ) : (
          <ModuleView id={activeModule} user={user} profile={profile} isAdmin={isAdmin} isSuper={isSuper} setNotice={setNotice} onBack={() => setActiveModule('modules')}/>
        )}
      </main>
      <footer className="py-8 text-center text-xs text-slate-400">D'SURIA HOSTEL HUB · Fasa 3A</footer>
    </div>
  )
}

function ModuleView({ id, user, profile, isAdmin, isSuper, setNotice, onBack }) {
  const module = MODULES.find(m => m.id === id)
  if (!module || (module.superOnly && !isSuper)) return <section className="card"><p>Akses tidak dibenarkan.</p><button className="btn-secondary mt-4" onClick={onBack}><ArrowLeft size={16}/> Kembali</button></section>
  return (
    <div className="space-y-5">
      <button className="btn-secondary" onClick={onBack}><ArrowLeft size={16}/> Kembali ke Dashboard</button>
      <section className="card">
        <div className="flex items-center gap-3"><span className="rounded-xl bg-teal/10 p-3 text-teal"><module.icon size={24}/></span><div><h3 className="section-title">{module.title}</h3><p className="muted">{module.desc}</p></div></div>
      </section>
      {id === 'home-dashboard' ? (
        <HomeDashboard profile={profile} isAdmin={isAdmin} isSuper={isSuper} onBack={onBack}/>
      ) : id === 'profile' || id === 'emergency' ? (
        profile.role === 'student' ? <StudentWorkspace user={user} profile={profile} setNotice={setNotice} initialTab={id}/> :
          <section className="card"><p className="font-medium text-navy">Paparan profil pelajar untuk Admin akan dibangunkan dalam peringkat seterusnya.</p><p className="muted mt-2">Pada masa ini, modul profil dan Emergency Contact boleh diisi oleh pelajar melalui akaun masing-masing.</p></section>
      ) : id === 'admin' && isSuper ? <AdminManagement me={user} setNotice={setNotice}/> : (
        <section className="card"><div className="flex items-start gap-3"><AlertCircle className="mt-0.5 text-amber-600"/><div><h4 className="font-semibold text-navy">Modul dalam pembangunan</h4><p className="muted mt-1">Paparan navigasi Fasa 3A telah disediakan. Fungsi data, borang, laporan dan kawalan akses modul ini akan dibina dalam fasa seterusnya.</p></div></div></section>
      )}
    </div>
  )
}

function HomeDashboard({ profile, isAdmin, isSuper, onBack }) {
  return (
    <div className="space-y-5">
      <section className="card">
        <p className="muted">Ringkasan utama</p>
        <h3 className="mt-1 text-xl font-bold text-navy">Selamat datang ke Home Dashboard</h3>
        <p className="muted mt-2">Paparan ringkas D'SURIA HOSTEL HUB untuk membantu penghuni dan pihak pengurusan melihat maklumat hostel.</p>
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Pengguna log masuk</p>
            <p className="mt-1 font-semibold text-navy">{profile.displayName || profile.email}</p>
            <p className="text-xs text-slate-500">{ROLE_LABEL[profile.role]}</p>
          </div>
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Status modul</p>
            <p className="mt-1 font-semibold text-navy">Fasa 3A</p>
            <p className="text-xs text-slate-500">Navigasi dan akses modul asas</p>
          </div>
        </div>
      </section>
      {isAdmin && <AdminOverview/>}
      <section className="card">
        <h4 className="font-semibold text-navy">Makluman</h4>
        <p className="muted mt-2">Modul pengurusan lain akan diaktifkan secara berperingkat selepas fungsi, rekod data dan kawalan akses diuji.</p>
        {isSuper && <p className="mt-2 text-xs text-teal">Akaun Super Admin mempunyai akses kepada Pengurusan Admin.</p>}
        <button className="btn-primary mt-4" onClick={onBack}><LayoutDashboard size={16}/> Kembali ke senarai modul</button>
      </section>
    </div>
  )
}

function StudentWorkspace({ user, profile, setNotice, initialTab = 'all' }) {
  const [form, setForm] = useState({ fullName: profile.displayName || '', phone: '', programme: '', room: '' })
  const [contacts, setContacts] = useState(initialContacts)
  const [loading, setLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingContacts, setSavingContacts] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true
    async function load() {
      try {
        const [p, c] = await Promise.all([
          getDoc(doc(db, 'studentProfiles', user.uid)),
          getDoc(doc(db, 'emergencyContacts', user.uid)),
        ])
        if (!active) return
        if (p.exists()) setForm(v => ({ ...v, ...p.data() }))
        if (c.exists() && Array.isArray(c.data().contacts)) {
          setContacts([0, 1].map(i => ({ ...emptyContact(), ...(c.data().contacts[i] || {}) })))
        }
      } catch (e) { if (active) setError(friendlyError(e)) }
      finally { if (active) setLoading(false) }
    }
    load()
    return () => { active = false }
  }, [user.uid])

  const changeContact = (index, key, value) => {
    setContacts(old => old.map((c, i) => i === index ? { ...c, [key]: value } : c))
  }

  const saveProfile = async (e) => {
    e.preventDefault()
    setError('')
    if (!form.fullName.trim()) return setError('Nama penuh wajib diisi.')
    setSavingProfile(true)
    try {
      await setDoc(doc(db, 'studentProfiles', user.uid), {
        uid: user.uid, email: profile.email, fullName: form.fullName.trim(),
        phone: form.phone.trim(), programme: form.programme.trim(),
        room: form.room.trim(), updatedAt: serverTimestamp(),
      }, { merge: true })
      setNotice('Profil pelajar berjaya disimpan.')
    } catch (e) { setError(friendlyError(e)) }
    finally { setSavingProfile(false) }
  }

  const saveContacts = async (e) => {
    e.preventDefault()
    setError('')
    for (let i = 0; i < contacts.length; i++) {
      const c = contacts[i]
      if (!c.fullName.trim() || !c.phone.trim() || !c.relationship.trim() || !c.address.trim()) {
        return setError(`Sila lengkapkan semua maklumat Emergency Contact ${i + 1}.`)
      }
    }
    setSavingContacts(true)
    try {
      await setDoc(doc(db, 'emergencyContacts', user.uid), {
        uid: user.uid, studentEmail: profile.email,
        contacts: contacts.map(c => ({
          fullName: c.fullName.trim(), phone: c.phone.trim(),
          relationship: c.relationship.trim(), address: c.address.trim(),
        })),
        updatedAt: serverTimestamp(),
      })
      setNotice('Dua Emergency Contact berjaya disimpan.')
    } catch (e) { setError(friendlyError(e)) }
    finally { setSavingContacts(false) }
  }

  if (loading) return <section className="card">Memuatkan profil pelajar…</section>

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {(initialTab === 'all' || initialTab === 'profile') && <section className="card">
        <div className="mb-4 flex items-center gap-2"><UserRound className="text-teal"/><h3 className="section-title">Profil Pelajar</h3></div>
        <p className="muted mb-4">Maklumat asas pelajar. Emel Google diambil daripada akaun log masuk.</p>
        {error && <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        <form onSubmit={saveProfile} className="space-y-3">
          <label className="block text-sm font-medium">Nama penuh
            <input className="field mt-1" value={form.fullName} onChange={e => setForm({...form, fullName:e.target.value})} required maxLength={100}/>
          </label>
          <label className="block text-sm font-medium">Emel Google
            <input className="field mt-1 bg-slate-100" value={profile.email} readOnly/>
          </label>
          <label className="block text-sm font-medium">Nombor telefon
            <input className="field mt-1" value={form.phone} onChange={e => setForm({...form, phone:e.target.value})} maxLength={25} placeholder="Contoh: 01X-XXXXXXX"/>
          </label>
          <label className="block text-sm font-medium">Program / Kursus
            <input className="field mt-1" value={form.programme} onChange={e => setForm({...form, programme:e.target.value})} maxLength={120}/>
          </label>
          <label className="block text-sm font-medium">Bilik
            <input className="field mt-1" value={form.room} onChange={e => setForm({...form, room:e.target.value})} maxLength={30} placeholder="Diisi mengikut penempatan rasmi"/>
          </label>
          <button className="btn-primary w-full" disabled={savingProfile}><Save size={16}/>{savingProfile ? 'Menyimpan…' : 'Simpan Profil'}</button>
        </form>
      </section>}

      {(initialTab === 'all' || initialTab === 'emergency') && <section className="card">
        <div className="mb-2 flex items-center gap-2"><Phone className="text-teal"/><h3 className="section-title">Emergency Contact</h3></div>
        <p className="muted mb-4">Dua orang waris / penjaga wajib didaftarkan. Maklumat ini hanya boleh dilihat oleh pelajar berkenaan dan Admin yang diberi kuasa.</p>
        <form onSubmit={saveContacts} className="space-y-5">
          {contacts.map((c, i) => (
            <div key={i} className="rounded-xl border border-slate-200 p-4">
              <h4 className="mb-3 font-bold text-navy">{i === 0 ? 'Emergency Contact 1 (Utama)' : 'Emergency Contact 2'}</h4>
              <div className="space-y-3">
                <label className="block text-sm font-medium">Nama penuh
                  <input className="field mt-1" value={c.fullName} onChange={e => changeContact(i,'fullName',e.target.value)} required maxLength={100}/>
                </label>
                <label className="block text-sm font-medium">Nombor telefon
                  <input className="field mt-1" value={c.phone} onChange={e => changeContact(i,'phone',e.target.value)} required maxLength={25} placeholder="Contoh: 60123456789"/>
                </label>
                <label className="block text-sm font-medium">Hubungan
                  <input className="field mt-1" value={c.relationship} onChange={e => changeContact(i,'relationship',e.target.value)} required maxLength={50} placeholder="Contoh: Ibu / Bapa / Penjaga"/>
                </label>
                <label className="block text-sm font-medium">Alamat rumah
                  <textarea className="field mt-1" rows="2" value={c.address} onChange={e => changeContact(i,'address',e.target.value)} required maxLength={300}/>
                </label>
              </div>
            </div>
          ))}
          <button className="btn-primary w-full" disabled={savingContacts}><Save size={16}/>{savingContacts ? 'Menyimpan…' : 'Simpan 2 Emergency Contacts'}</button>
        </form>
      </section>}
    </div>
  )
}

function AdminOverview() {
  const [students, setStudents] = useState(0)
  const [admins, setAdmins] = useState(0)
  const [error, setError] = useState('')
  useEffect(() => {
    return onSnapshot(collection(db, 'users'), snap => {
      const rows = snap.docs.map(d => d.data())
      setStudents(rows.filter(x => x.role === 'student' && x.status === 'active').length)
      setAdmins(rows.filter(x => x.role === 'admin' && x.status === 'active').length)
    }, e => setError(friendlyError(e)))
  }, [])
  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <div className="card"><p className="muted">Pelajar aktif</p><p className="mt-2 text-3xl font-bold text-navy">{students}</p></div>
      <div className="card"><p className="muted">Admin aktif</p><p className="mt-2 text-3xl font-bold text-navy">{admins}</p></div>
      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  )
}

function AdminManagement({ me, setNotice }) {
  const [approved, setApproved] = useState([])
  const [users, setUsers] = useState([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState('student')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    const unsubApproved = onSnapshot(collection(db, 'approvedUsers'), s =>
      setApproved(s.docs.map(d => ({ id: d.id, ...d.data() }))),
      e => setError(friendlyError(e)))
    const unsubUsers = onSnapshot(collection(db, 'users'), s =>
      setUsers(s.docs.map(d => ({ id: d.id, ...d.data() }))),
      e => setError(friendlyError(e)))
    return () => { unsubApproved(); unsubUsers() }
  }, [])

  const writeAudit = async (action, targetEmail, oldRole, newRole, reason = '') => {
    await addDoc(collection(db, 'adminAuditLogs'), {
      action, targetEmail, oldRole: oldRole || null, newRole: newRole || null,
      reason, performedBy: me.uid, performedByEmail: me.email,
      createdAt: serverTimestamp(),
    })
  }

  const addApproved = async () => {
    const e = email.trim().toLowerCase()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) {
      setMessage('Sila masukkan alamat emel yang sah.'); return
    }
    if (e === SUPER_ADMIN_EMAIL) { setMessage('Emel Super Admin tidak boleh diubah melalui whitelist.'); return }
    setBusy(true); setMessage(''); setError('')
    try {
      const existingApproval = approved.find(x => x.id === e)
      const oldRole = existingApproval?.role || null
      await setDoc(doc(db, 'approvedUsers', e), {
        role, addedBy: me.uid, addedAt: serverTimestamp(), updatedAt: serverTimestamp(),
      })
      const matching = users.find(u => u.email?.toLowerCase() === e)
      if (matching) {
        await updateDoc(doc(db, 'users', matching.id), { role, status: 'active', roleUpdatedAt: serverTimestamp() })
      }
      await writeAudit(oldRole ? 'ROLE_UPDATED' : 'USER_APPROVED', e, oldRole, role)
      setEmail('')
      setMessage(matching ? `Whitelist dan profil ${e} dikemas kini sebagai ${ROLE_LABEL[role]}.` : `Emel ${e} diluluskan. Pengguna akan mendapat role ${ROLE_LABEL[role]} semasa login pertama.`)
      setNotice('Perubahan whitelist / role berjaya direkodkan.')
    } catch (e) { setError(friendlyError(e)) }
    finally { setBusy(false) }
  }

  const revoke = async (item) => {
    if (!window.confirm(`Tarik balik akses ${item.id}? Akaun sedia ada akan digantung.`)) return
    setBusy(true); setError('')
    try {
      await deleteDoc(doc(db, 'approvedUsers', item.id))
      const matching = users.find(u => u.email?.toLowerCase() === item.id)
      if (matching) {
        await updateDoc(doc(db, 'users', matching.id), { status: 'suspended', suspendedAt: serverTimestamp() })
      }
      await writeAudit('ACCESS_REVOKED', item.id, item.role, null, 'Whitelist removed; existing profile suspended')
      setMessage(`Akses ${item.id} telah ditarik balik.`)
    } catch (e) { setError(friendlyError(e)) }
    finally { setBusy(false) }
  }

  const adminUsers = useMemo(() => users.filter(u => u.role === 'admin'), [users])

  return (
    <div className="space-y-6">
      <section className="card">
        <div className="mb-4 flex items-center gap-2"><Users className="text-teal"/><h3 className="section-title">Pengurusan Pengguna & Admin</h3></div>
        <p className="muted mb-4">Hanya Super Admin boleh meluluskan emel, melantik Admin atau menarik balik akses.</p>
        <div className="grid gap-3 md:grid-cols-[1fr_180px_auto]">
          <input className="field" value={email} onChange={e => setEmail(e.target.value)} placeholder="alamat@gmail.com" type="email"/>
          <select className="field" value={role} onChange={e => setRole(e.target.value)}>
            <option value="student">Pelajar</option>
            <option value="admin">Admin</option>
          </select>
          <button className="btn-primary" onClick={addApproved} disabled={busy}><UserPlus size={16}/> Lulus / Tetapkan Role</button>
        </div>
        {message && <p className="mt-3 text-sm text-emerald-700">{message}</p>}
        {error && <p className="mt-3 flex items-center gap-2 text-sm text-red-700"><AlertCircle size={16}/>{error}</p>}
      </section>

      <section className="card">
        <h3 className="section-title">Senarai Emel Dibenarkan ({approved.length})</h3>
        <div className="mt-3 divide-y">
          {approved.length === 0 && <p className="py-4 text-sm text-slate-500">Belum ada emel diluluskan.</p>}
          {approved.map(item => (
            <div key={item.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-medium">{item.id}</p><p className="text-xs text-slate-500">{ROLE_LABEL[item.role] || item.role}</p></div>
              <button className="btn-danger self-start" onClick={() => revoke(item)} disabled={busy}><Trash2 size={15}/> Tarik balik akses</button>
            </div>
          ))}
        </div>
      </section>

      <section className="card">
        <h3 className="section-title">Admin Dilantik ({adminUsers.length})</h3>
        <div className="mt-3 divide-y">
          {adminUsers.length === 0 && <p className="py-4 text-sm text-slate-500">Belum ada Admin dilantik.</p>}
          {adminUsers.map(a => (
            <div key={a.id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
              <div><p className="font-medium">{a.displayName || a.email}</p><p className="text-xs text-slate-500">{a.email} · {a.status}</p></div>
              <button className="btn-secondary self-start" onClick={() => {
                setEmail(a.email); setRole('student')
                window.scrollTo({ top: 0, behavior: 'smooth' })
              }}>Pilih untuk demote</button>
            </div>
          ))}
        </div>
        <p className="mt-3 text-xs text-slate-500">Untuk menurunkan Admin kepada Pelajar, masukkan emel Admin di ruangan atas dan pilih Pelajar. Perubahan role dan audit log akan dikemas kini.</p>
      </section>

      <AuditLog />
    </div>
  )
}

function AuditLog() {
  const [logs, setLogs] = useState([])
  const [error, setError] = useState('')
  useEffect(() => onSnapshot(collection(db, 'adminAuditLogs'), s => {
    setLogs(s.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)))
  }, e => setError(friendlyError(e))), [])
  return (
    <section className="card">
      <h3 className="section-title">Audit Log Pelantikan Admin</h3>
      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}
      {logs.length === 0 ? <p className="mt-3 text-sm text-slate-500">Tiada aktiviti direkodkan.</p> :
        <div className="mt-3 space-y-3">
          {logs.slice(0, 30).map(log => (
            <div key={log.id} className="border-b border-slate-100 pb-3 text-sm">
              <p className="font-semibold text-navy">{log.action} · {log.targetEmail}</p>
              <p className="text-slate-500">{log.oldRole || '—'} → {log.newRole || '—'} · oleh {log.performedByEmail}</p>
            </div>
          ))}
        </div>}
    </section>
  )
}
