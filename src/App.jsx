
import { useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import {
  addDoc, collection, deleteDoc, doc, getDoc, getDocs, onSnapshot, query,
  serverTimestamp, setDoc, updateDoc, where, writeBatch,
} from 'firebase/firestore'
import {
  Home, LogIn, LogOut, ShieldCheck, UserRound, Phone, Save,
  AlertCircle, CheckCircle2, CalendarCheck, MapPin, Clock,
  Sparkles, MessageSquare, Wallet, Receipt, Siren, BookOpen,
  Award, Settings, ArrowLeft, LayoutDashboard, Trash, History, Pencil,
} from 'lucide-react'
import { auth, db, provider, SUPER_ADMIN_EMAIL } from './firebase'
import { Circle, CircleMarker, MapContainer, Popup, TileLayer, useMap } from 'react-leaflet'
import 'leaflet/dist/leaflet.css'

const ROLE_LABEL = {
  superadmin: 'Super Admin',
  admin: 'Admin / Warden',
  student: 'Pelajar',
}

const emptyContact = () => ({
  fullName: '',
  phone: '',
  relationship: '',
  address: '',
})

const MODULES = [
  { id: 'home-dashboard', title: 'Home Dashboard', desc: 'Ringkasan aktiviti dan makluman hostel', icon: LayoutDashboard, ready: true },
  { id: 'profile', title: 'Student Registration & Profile', desc: 'Pendaftaran, profil, gambar dan status permohonan', icon: UserRound, ready: true },
  { id: 'emergency', title: 'Emergency Contact', desc: 'Maklumat waris dan penjaga', icon: Phone, ready: true },
  { id: 'outing', title: 'Going Home / Outing Log', desc: 'Rekod keluar, destinasi dan pulang', icon: MapPin },
  { id: 'geofence', title: 'Geofence Monitoring', desc: 'Pengesahan kembali ke kawasan hostel', icon: MapPin },
  { id: 'daily-status', title: 'Daily Student Status', desc: 'Status keberadaan dan pemantauan curfew', icon: Clock },
  { id: 'cleaning', title: 'Cleaning Schedule', desc: 'Jadual tugasan kebersihan mingguan', icon: Sparkles },
  { id: 'trash-wars', title: 'Trash Wars', desc: 'Giliran buang sampah dan ganjaran XP', icon: Trash },
  { id: 'lobby', title: 'Hostel Lobby', desc: 'Pengumuman dan ruang komuniti', icon: MessageSquare },
  { id: 'bills', title: 'Bills Management', desc: 'Pengurusan bil elektrik dan air', icon: Wallet },
  { id: 'collection', title: 'Monthly Collection', desc: 'Kutipan bulanan penghuni', icon: Receipt },
  { id: 'sos', title: 'Location Sharing & SOS', desc: 'Perkongsian lokasi dan bantuan kecemasan', icon: Siren },
  { id: 'rules', title: 'Hostel Rules', desc: 'Peraturan rasmi dan pengesahan bacaan', icon: BookOpen, ready: true },
  { id: 'merit', title: 'Merit & Demerit System', desc: 'Rekod merit, demerit dan rayuan', icon: Award },
  { id: 'admin', title: 'Admin Management', desc: 'Pengurusan peranan dan akses pengguna', icon: Settings, superOnly: true, ready: true },
]

function friendlyError(error) {
  const code = error?.code || ''

  if (code === 'permission-denied' || code === 'firestore/permission-denied') {
    return 'Akses ditolak oleh Firestore Rules. Pastikan rules yang betul telah diterbitkan.'
  }

  if (code === 'auth/popup-closed-by-user') {
    return 'Tetingkap log masuk ditutup sebelum selesai.'
  }

  if (code === 'auth/unauthorized-domain') {
    return 'Domain website belum ditambah dalam Firebase Authorized Domains.'
  }

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
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setLoading(true)
      setError('')
      setNotice('')

      if (!u) {
        setUser(null)
        setProfile(null)
        setLoading(false)
        return
      }

      try {
        const email = (u.email || '').trim().toLowerCase()

        if (!u.emailVerified) {
          throw new Error('Akaun Google perlu mempunyai emel yang disahkan.')
        }

        const userRef = doc(db, 'users', u.uid)
        const userSnap = await getDoc(userRef)
        const isSuper = email === SUPER_ADMIN_EMAIL

        if (isSuper) {
          if (!userSnap.exists()) {
            await setDoc(userRef, {
              email,
              displayName: u.displayName || '',
              role: 'superadmin',
              status: 'active',
              hostelIds: [],
              createdAt: serverTimestamp(),
              lastLoginAt: serverTimestamp(),
            })
          } else {
            await updateDoc(userRef, {
              role: 'superadmin',
              status: 'active',
              hostelIds: [],
              lastLoginAt: serverTimestamp(),
            })
          }
        } else {
          const approvedSnap = await getDoc(doc(db, 'approvedUsers', email))

          if (!approvedSnap.exists()) {
            throw new Error('NOT_APPROVED')
          }

          const approved = approvedSnap.data()

          if (approved.status !== 'active') {
            throw new Error('Akses akaun anda tidak aktif. Hubungi Super Admin.')
          }

          if (!['student', 'admin'].includes(approved.role)) {
            throw new Error('Peranan akaun tidak sah. Hubungi Super Admin.')
          }

          if (!userSnap.exists()) {
            await setDoc(userRef, {
              email,
              displayName: u.displayName || '',
              role: approved.role,
              status: 'active',
              hostelIds: approved.hostelIds || [],
              createdAt: serverTimestamp(),
              lastLoginAt: serverTimestamp(),
            })
          } else {
            const current = userSnap.data()

            if (current.status !== 'active') {
              throw new Error('Akaun anda telah digantung. Hubungi Super Admin.')
            }

            if (current.role !== approved.role) {
              throw new Error('Peranan whitelist dan profil tidak sepadan. Hubungi Super Admin.')
            }

            await updateDoc(userRef, {
              lastLoginAt: serverTimestamp(),
              hostelIds: approved.hostelIds || [],
            })
          }
        }

        const fresh = await getDoc(userRef)

        setUser(u)
        setProfile({
          uid: u.uid,
          ...fresh.data(),
        })
      } catch (e) {
        await signOut(auth)
        setUser(null)
        setProfile(null)

        setError(
          e.message === 'NOT_APPROVED'
            ? 'Emel anda belum diluluskan. Sila hubungi Super Admin.'
            : friendlyError(e)
        )
      } finally {
        setLoading(false)
      }
    })

    return unsubscribe
  }, [])

  const login = async () => {
    setError('')

    try {
      await signInWithPopup(auth, provider)
    } catch (e) {
      setError(friendlyError(e))
    }
  }

  const logout = async () => {
    await signOut(auth)
    setProfile(null)
    setUser(null)
    setActiveModule('modules')
  }

  if (loading) {
    return (
      <div className="min-h-screen grid place-items-center">
        <p className="text-slate-500">Memuatkan D'SURIA HOSTEL HUB…</p>
      </div>
    )
  }

  if (!user || !profile) {
    return (
      <main className="min-h-screen grid place-items-center bg-navy p-4">
        <section className="w-full max-w-md rounded-3xl bg-white p-8 text-center shadow-2xl">
          <Home className="mx-auto text-teal" size={42} />
          <h1 className="mt-4 text-2xl font-extrabold text-navy">
            D'SURIA HOSTEL HUB
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            One Hostel. One Platform. Everything Connected.
          </p>

          {error && (
            <div role="alert" className="mt-5 rounded-xl bg-red-50 p-3 text-left text-sm text-red-700">
              {error}
            </div>
          )}

          <button onClick={login} className="btn-primary mt-6 w-full">
            <LogIn size={18} /> Log masuk dengan Google
          </button>

          <p className="mt-5 text-xs text-slate-400">
            Akses hanya untuk emel yang diluluskan.
          </p>
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
          <p className="text-xs text-slate-300">
            One Hostel. One Platform. Everything Connected.
          </p>
        </div>

        <button onClick={logout} className="flex items-center gap-2 rounded-lg px-3 py-2 text-sm hover:bg-white/10">
          <LogOut size={16} /> Log keluar
        </button>
      </header>

      <main className="mx-auto max-w-6xl space-y-6 p-4 md:p-6">
        {notice && (
          <div className="flex items-center gap-2 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
            <CheckCircle2 size={18} /> {notice}
          </div>
        )}

        <section className="card">
          <p className="muted">Selamat datang</p>
          <h2 className="mt-1 text-2xl font-bold text-navy">
            {profile.displayName || profile.email}
          </h2>
          <div className="mt-2 inline-flex items-center gap-2 rounded-full bg-teal/10 px-3 py-1 text-sm font-semibold text-teal">
            <ShieldCheck size={16} /> {ROLE_LABEL[profile.role]}
          </div>
          <p className="mt-2 text-sm text-slate-500">{profile.email}</p>
        </section>

        {activeModule === 'modules' ? (
          <>
            {isSuper && <AdminOverview />}

            <section>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-2">
                <div>
                  <h3 className="section-title">Modul Hostel</h3>
                  <p className="muted mt-1">
                    Pilih modul untuk membuka fungsi berkaitan.
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
                  15 modul
                </span>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {MODULES.filter(m => !m.superOnly || isSuper).map(m => {
                  const Icon = m.icon

                  return (
                    <button
                      key={m.id}
                      onClick={() => setActiveModule(m.id)}
                      className="card group text-left transition hover:-translate-y-0.5 hover:border-teal hover:shadow-md"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <span className="rounded-xl bg-teal/10 p-3 text-teal">
                          <Icon size={21} />
                        </span>

                        {m.ready ? (
                          <span className="rounded-full bg-emerald-50 px-2 py-1 text-xs font-medium text-emerald-700">
                            Tersedia
                          </span>
                        ) : (
                          <span className="rounded-full bg-amber-50 px-2 py-1 text-xs font-medium text-amber-700">
                            Fasa seterusnya
                          </span>
                        )}
                      </div>

                      <h4 className="mt-4 font-bold text-navy">{m.title}</h4>
                      <p className="mt-1 text-sm text-slate-500">{m.desc}</p>
                    </button>
                  )
                })}
              </div>
            </section>
          </>
        ) : (
          <ModuleView
            id={activeModule}
            user={user}
            profile={profile}
            isAdmin={isAdmin}
            isSuper={isSuper}
            setNotice={setNotice}
            onBack={() => setActiveModule('modules')}
          />
        )}
      </main>

      <footer className="py-8 text-center text-xs text-slate-400">
        D'SURIA HOSTEL HUB · Fasa 3A
      </footer>
    </div>
  )
}

function ModuleView({ id, user, profile, isAdmin, isSuper, setNotice, onBack }) {
  const module = MODULES.find(m => m.id === id)

  if (!module || (module.superOnly && !isSuper)) {
    return (
      <section className="card">
        <p>Akses tidak dibenarkan.</p>
        <button className="btn-secondary mt-4" onClick={onBack}>
          <ArrowLeft size={16} /> Kembali
        </button>
      </section>
    )
  }

  const Icon = module.icon

  return (
    <div className="space-y-5">
      <button className="btn-secondary" onClick={onBack}>
        <ArrowLeft size={16} /> Kembali ke Dashboard
      </button>

      <section className="card">
        <div className="flex items-center gap-3">
          <span className="rounded-xl bg-teal/10 p-3 text-teal">
            <Icon size={24} />
          </span>
          <div>
            <h3 className="section-title">{module.title}</h3>
            <p className="muted">{module.desc}</p>
          </div>
        </div>
      </section>

      {id === 'home-dashboard' ? (
        <HomeDashboard profile={profile} isSuper={isSuper} onBack={onBack} />
      ) : id === 'profile' || id === 'emergency' ? (
        profile.role === 'student' ? (
          <StudentWorkspace
            user={user}
            profile={profile}
            setNotice={setNotice}
            initialTab={id}
          />
        ) : profile.role === 'admin' || isSuper ? (
          <AdminWorkspace
            user={user}
            profile={profile}
            isSuper={isSuper}
            setNotice={setNotice}
            initialTab={id}
          />
        ) : (
          <section className="card">
            <p className="font-medium text-navy">
              Akses modul ini tidak dibenarkan.
            </p>
          </section>
        )
      ) : id === 'outing' ? (
        <MovementRequests user={user} profile={profile} isAdmin={isAdmin} isSuper={isSuper} setNotice={setNotice} />
      ) : id === 'daily-status' ? (
        <DailyStudentStatus user={user} profile={profile} isAdmin={isAdmin} isSuper={isSuper} setNotice={setNotice} />
      ) : id === 'rules' ? (
        <HostelRules user={user} profile={profile} isAdmin={isAdmin} isSuper={isSuper} setNotice={setNotice} />
      ) : id === 'admin' && isSuper ? (
        <AdminManagement me={user} setNotice={setNotice} />
      ) : (
        <section className="card">
          <div className="flex items-start gap-3">
            <AlertCircle className="mt-0.5 text-amber-600" />
            <div>
              <h4 className="font-semibold text-navy">Modul dalam pembangunan</h4>
              <p className="muted mt-1">
                Fungsi data, borang, laporan dan kawalan akses modul ini akan dibina dalam fasa seterusnya.
              </p>
            </div>
          </div>
        </section>
      )}
    </div>
  )
}

function HomeDashboard({ profile, isSuper, onBack }) {
  const [assignedHostels, setAssignedHostels] = useState([]);
  const [hostelLoading, setHostelLoading] = useState(
    !isSuper && profile.role === 'admin'
  );
  const [hostelError, setHostelError] = useState('');
  const [summaryError, setSummaryError] = useState('');
  const [studentSummary, setStudentSummary] = useState({ total: 0, pending: 0, approved: 0, rejected: 0 });
  const [summaryLoading, setSummaryLoading] = useState(!isSuper && profile.role === 'admin');

  useEffect(() => {
    if (isSuper || profile.role !== 'admin') return undefined;
    const ids = Array.isArray(profile.hostelIds) ? profile.hostelIds : [];
    if (ids.length === 0) {
      setStudentSummary({ total: 0, pending: 0, approved: 0, rejected: 0 });
      setSummaryLoading(false);
      return undefined;
    }
    let active = true;
    const unsubs = [];
    const rowsByHostel = new Map();
    const refreshSummary = () => {
      if (!active) return;
      const rows = Array.from(rowsByHostel.values()).flat();
      setStudentSummary({
        total: rows.length,
        pending: rows.filter(row => !row.approvalStatus || row.approvalStatus === 'pending' || row.approvalStatus === 'draft').length,
        approved: rows.filter(row => row.approvalStatus === 'approved').length,
        rejected: rows.filter(row => row.approvalStatus === 'rejected').length,
      });
      setSummaryLoading(false);
    };
    ids.forEach(hostelId => {
      const hostelQuery = query(collection(db, 'studentProfiles'), where('hostelId', '==', hostelId));
      unsubs.push(onSnapshot(hostelQuery, snapshot => {
        rowsByHostel.set(hostelId, snapshot.docs.map(item => ({ uid: item.id, ...item.data() })));
        refreshSummary();
      }, error => {
        if (!active) return;
        setSummaryError(friendlyError(error));
        setSummaryLoading(false);
      }));
    });
    return () => { active = false; unsubs.forEach(stop => stop()); };
  }, [isSuper, profile.role, profile.hostelIds]);

  useEffect(() => {
    if (isSuper || profile.role !== 'admin') return undefined;

    const email = (profile.email || '').trim().toLowerCase();

    if (!email) {
      setHostelError('Emel akaun tidak dapat dikenal pasti.');
      setHostelLoading(false);
      return undefined;
    }

    const assignedIds = Array.isArray(profile.hostelIds) ? profile.hostelIds : [];
    if (!assignedIds.length) {
      setAssignedHostels([]);
      setHostelLoading(false);
      return undefined;
    }
    const activeHostelsQuery = query(collection(db, 'hostels'), where('status', '==', 'active'));
    return onSnapshot(activeHostelsQuery, snapshot => {
      const activeHostels = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      setAssignedHostels(activeHostels.filter(hostel => assignedIds.includes(hostel.id)));
      setHostelLoading(false);
    }, error => {
      setHostelError(friendlyError(error));
      setHostelLoading(false);
    });
  }, [isSuper, profile.role, profile.hostelIds]);

  return (
    <div className="space-y-5">
      <section className="card">
        <p className="muted">Ringkasan utama</p>
        <h3 className="mt-1 text-xl font-bold text-navy">
          Selamat datang ke Home Dashboard
        </h3>
        <p className="muted mt-2">
          Paparan ringkas D'SURIA HOSTEL HUB untuk membantu penghuni dan pihak pengurusan melihat maklumat hostel.
        </p>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Pengguna log masuk</p>
            <p className="mt-1 font-semibold text-navy">
              {profile.displayName || profile.email}
            </p>
            <p className="text-xs text-slate-500">{ROLE_LABEL[profile.role]}</p>
          </div>

          <div className="rounded-xl bg-slate-50 p-4">
            <p className="text-sm text-slate-500">Status modul</p>
            <p className="mt-1 font-semibold text-navy">Fasa 3A</p>
            <p className="text-xs text-slate-500">Navigasi dan akses modul asas</p>
          </div>
        </div>
      </section>

      {profile.role === 'admin' && !isSuper && (
        <section className="space-y-2">
          {summaryError && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">Ralat ringkasan pelajar: {summaryError}</p>}
          <div className="grid gap-3 sm:grid-cols-4">
          {[
            { label: 'Jumlah pelajar', value: studentSummary.total },
            { label: 'Menunggu', value: studentSummary.pending },
            { label: 'Diluluskan', value: studentSummary.approved },
            { label: 'Ditolak', value: studentSummary.rejected },
          ].map(item => (
            <div className="card" key={item.label}>
              <p className="muted">{item.label}</p>
              <p className="mt-2 text-3xl font-bold text-navy">
                {summaryLoading ? '…' : item.value}
              </p>
            </div>
          ))}
          </div>
        </section>
      )}

      {profile.role === 'admin' && !isSuper && (
        <section className="card">
          <div className="flex items-center gap-2">
            <MapPin className="text-teal" size={20} />
            <h4 className="font-semibold text-navy">Hostel Penempatan</h4>
          </div>

          {hostelLoading ? (
            <p className="muted mt-3">Memuatkan maklumat penempatan hostel…</p>
          ) : hostelError ? (
            <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {hostelError}
            </p>
          ) : assignedHostels.length > 0 ? (
            <ul className="mt-3 space-y-2">
              {assignedHostels.map(hostel => (
                <li
                  key={hostel.id}
                  className="rounded-xl bg-teal/5 px-4 py-3 font-medium text-navy"
                >
                  {hostel.name || 'Nama hostel tidak tersedia'}
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">
              Tiada hostel aktif ditetapkan untuk akaun ini. Sila hubungi Super Admin.
            </p>
          )}
          <p className="muted mt-3 text-xs">
            Paparan ini menunjukkan hostel aktif yang telah ditetapkan kepada akaun Admin/Warden.
          </p>
        </section>
      )}

      <section className="card">
        <h4 className="font-semibold text-navy">Makluman</h4>
        <p className="muted mt-2">
          Modul pengurusan lain akan diaktifkan secara berperingkat selepas fungsi, rekod data dan kawalan akses diuji.
        </p>
        {isSuper && (
          <p className="mt-2 text-xs text-teal">
            Akaun Super Admin mempunyai akses kepada Pengurusan Admin.
          </p>
        )}
        <button className="btn-primary mt-4" onClick={onBack}>
          <LayoutDashboard size={16} /> Kembali ke senarai modul
        </button>
      </section>
    </div>
  )
}

function AdminWorkspace({ user, profile, isSuper = false, setNotice, initialTab = 'profile' }) {
  const [hostelIds, setHostelIds] = useState([]);
  const [hostels, setHostels] = useState([]);
  const [peerAdmins, setPeerAdmins] = useState([]);
  const [trashStudents, setTrashStudents] = useState([]);
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [contacts, setContacts] = useState([]);
  const [logs, setLogs] = useState([]);
  const [allLogs, setAllLogs] = useState([]);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editForm, setEditForm] = useState(null);
  const [editContacts, setEditContacts] = useState([emptyContact(), emptyContact()]);
  const [rejectionReason, setRejectionReason] = useState('');

  useEffect(() => {
    const stopHostels = onSnapshot(query(collection(db, 'hostels'), where('status', '==', 'active')), snap => {
      const rows = snap.docs.map(d => ({ id: d.id, ...d.data() }));
      setHostels(rows);
      if (isSuper) setHostelIds(rows.map(h => h.id));
    }, e => setError(friendlyError(e)));
    if (isSuper) { setLoading(false); return stopHostels; }
    setHostelIds(Array.isArray(profile.hostelIds) ? profile.hostelIds : []);
    setLoading(false);
    return () => { stopHostels(); };
  }, [profile.email, isSuper]);

  useEffect(() => {
    if (isSuper) {
      setLoading(true);
      return onSnapshot(collection(db, 'studentProfiles'), snap => {
        const rows = snap.docs.map(d => ({ uid: d.id, ...d.data(), approvalStatus: d.data().approvalStatus || 'draft' }));
        rows.sort((a,b) => (a.fullName || '').localeCompare(b.fullName || ''));
        setStudents(rows); setLoading(false);
      }, e => { setError(friendlyError(e)); setLoading(false); });
    }
    if (!hostelIds.length || hostelIds.length > 30) {
      setStudents([]); setLoading(false); return undefined;
    }
    setLoading(true);
    let active = true;
    const rowsByHostel = new Map();
    const unsubs = hostelIds.map(hostelId => onSnapshot(
      query(collection(db, 'studentProfiles'), where('hostelId', '==', hostelId)),
      snap => {
        rowsByHostel.set(hostelId, snap.docs.map(d => ({ uid: d.id, ...d.data(), approvalStatus: d.data().approvalStatus || 'draft' })));
        if (!active) return;
        const rows = Array.from(rowsByHostel.values()).flat();
        rows.sort((a,b) => (a.fullName || '').localeCompare(b.fullName || ''));
        setStudents(rows); setLoading(false);
      },
      e => { if (active) { setError(friendlyError(e)); setLoading(false); } }
    ));
    return () => { active = false; unsubs.forEach(stop => stop()); };
  }, [hostelIds, isSuper]);

  useEffect(() => {
    if (isSuper || !hostelIds.length || hostelIds.length > 30) { setPeerAdmins([]); return undefined; }
    const adminsQuery = query(collection(db, 'approvedUsers'),
      where('role', '==', 'admin'), where('status', '==', 'active'),
      where('hostelIds', 'array-contains-any', hostelIds));
    return onSnapshot(adminsQuery, snapshot => setPeerAdmins(snapshot.docs.map(item => ({email:item.id,...item.data()}))),
      error => setError(friendlyError(error)));
  }, [isSuper, hostelIds]);

  useEffect(() => {
    const q = isSuper ? collection(db,'studentActivityLogs')
      : hostelIds.length && hostelIds.length <= 30 ? query(collection(db,'studentActivityLogs'),where('hostelId','in',hostelIds)) : null;
    if (!q) { setAllLogs([]); return undefined; }
    return onSnapshot(q,snap=>setAllLogs(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))),e=>setError(friendlyError(e)));
  },[isSuper,hostelIds]);

  useEffect(() => {
    if (!isSuper) { setTrashStudents([]); return undefined; }
    return onSnapshot(collection(db, 'deletedStudentProfiles'), snapshot => {
      const rows=snapshot.docs.map(item=>({uid:item.id,...item.data()}));
      rows.sort((a,b)=>(b.deletedAt?.seconds||0)-(a.deletedAt?.seconds||0));
      setTrashStudents(rows);
    }, error=>setError(friendlyError(error)));
  }, [isSuper]);

  useEffect(() => {
    if (!selectedStudent) { setContacts([]); setLogs([]); setEditForm(null); return undefined; }
    const stopContacts = onSnapshot(doc(db, 'emergencyContacts', selectedStudent.uid), snap => {
      const rows = snap.exists() ? (snap.data().contacts || []) : [];
      setContacts(rows);
      setEditContacts([0,1].map(i => ({ ...emptyContact(), ...(rows[i] || {}) })));
    }, e => setError(friendlyError(e)));
    const logsQuery = isSuper ? query(collection(db, 'studentActivityLogs'), where('studentUid', '==', selectedStudent.uid)) : query(collection(db, 'studentActivityLogs'), where('studentUid', '==', selectedStudent.uid), where('hostelId', 'in', hostelIds));
    const stopLogs = onSnapshot(logsQuery, snap => {
      const rows = snap.docs.map(d => ({ id:d.id, ...d.data() })).sort((a,b) => (b.createdAt?.seconds || 0)-(a.createdAt?.seconds || 0));
      setLogs(rows);
    }, e => setError(friendlyError(e)));
    setEditForm({
      fullName:selectedStudent.fullName || '', phone:selectedStudent.phone || '',
      programme:selectedStudent.programme || '', hostelId:selectedStudent.hostelId || '',
      hostelName:selectedStudent.hostelName || '', room:selectedStudent.room || '',
    });
    return () => { stopContacts(); stopLogs(); };
  }, [selectedStudent]);

  const filtered = students.filter(st => {
    const t=search.trim().toLowerCase();
    const found=!t || [st.fullName,st.email,st.phone,st.room,st.programme].some(v => (v||'').toLowerCase().includes(t));
    return found && (statusFilter==='all' || st.approvalStatus===statusFilter);
  });

  const addStudentLog = (batch, student, action, details = {}) => {
    const logRef=doc(collection(db,'studentActivityLogs'));
    batch.set(logRef,{studentUid:student.uid,studentEmail:student.email||'',hostelId:student.hostelId||'',action,details,performedBy:user.uid,performedByEmail:profile.email||'',createdAt:serverTimestamp()});
  };

  const decide = async (student,status) => {
    if (status==='rejected' && !rejectionReason.trim()) { setError('Sila masukkan sebab penolakan terlebih dahulu.'); return; }
    if (!window.confirm(status==='approved'?'Luluskan permohonan pelajar ini?':'Tolak permohonan pelajar ini?')) return;
    setBusy(true); setError(''); setMessage('');
    try {
      const batch=writeBatch(db), ref=doc(db,'studentProfiles',student.uid);
      batch.update(ref,{approvalStatus:status,approvedBy:user.uid,approvedByEmail:profile.email||'',approvedAt:serverTimestamp(),rejectionReason:status==='rejected'?rejectionReason.trim():'',updatedAt:serverTimestamp()});
      addStudentLog(batch,student,status==='approved'?'APPROVED':'REJECTED',{reason:status==='rejected'?rejectionReason.trim():''});
      await batch.commit();
      setRejectionReason(''); setMessage(status==='approved'?'Permohonan berjaya diluluskan.':'Permohonan ditolak dengan sebab direkodkan.');
      setNotice('Status permohonan pelajar dikemas kini.');
      if(selectedStudent?.uid===student.uid) setSelectedStudent({...student,approvalStatus:status,rejectionReason:status==='rejected'?rejectionReason.trim():''});
    } catch(e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };

  const saveAdminEdit = async () => {
    if (!selectedStudent || !editForm) return;
    if (!editForm.fullName.trim() || !editForm.hostelId) { setError('Nama dan hostel wajib diisi.'); return; }
    const h=hostels.find(x=>x.id===editForm.hostelId);
    if (!h && !isSuper) { setError('Hostel tidak sah.'); return; }
    setBusy(true); setError('');
    try {
      const batch=writeBatch(db), ref=doc(db,'studentProfiles',selectedStudent.uid);
      const next={...editForm,hostelName:h?.name||editForm.hostelName,fullName:editForm.fullName.trim(),phone:editForm.phone.trim(),programme:editForm.programme.trim(),room:editForm.room.trim(),updatedAt:serverTimestamp(),lastEditedBy:user.uid};
      batch.update(ref,next);
      addStudentLog(batch,{...selectedStudent,...next},'ADMIN_EDITED',{before:{fullName:selectedStudent.fullName||'',phone:selectedStudent.phone||'',programme:selectedStudent.programme||'',hostelId:selectedStudent.hostelId||'',hostelName:selectedStudent.hostelName||'',room:selectedStudent.room||''},after:{fullName:next.fullName,phone:next.phone,programme:next.programme,hostelId:next.hostelId,hostelName:next.hostelName,room:next.room}});
      await batch.commit();
      setSelectedStudent({...selectedStudent,...next});
      setMessage('Maklumat pelajar berjaya dikemas kini dan direkodkan dalam Audit Log.');
    } catch(e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };

  const saveAdminContacts = async () => {
    if (!selectedStudent) return;
    for (let i=0;i<2;i++) if (!editContacts[i].fullName.trim()||!editContacts[i].phone.trim()||!editContacts[i].relationship.trim()||!editContacts[i].address.trim()) { setError('Lengkapkan kedua-dua Emergency Contact.'); return; }
    setBusy(true); setError('');
    try {
      const batch=writeBatch(db);
      batch.set(doc(db,'emergencyContacts',selectedStudent.uid),{uid:selectedStudent.uid,studentEmail:selectedStudent.email||'',contacts:editContacts,updatedAt:serverTimestamp(),updatedBy:user.uid});
      addStudentLog(batch,selectedStudent,'ADMIN_EDITED_EMERGENCY_CONTACTS',{before:contacts,after:editContacts});
      await batch.commit(); setMessage('Emergency Contact dikemas kini.');
    } catch(e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };

  const removeStudent = async student => {
    if (!isSuper || !window.confirm('Pindahkan profil pelajar ke Trash? Rekod boleh dipulihkan.')) return;
    setBusy(true); setError('');
    try {
      const batch=writeBatch(db);
      batch.set(doc(db,'deletedStudentProfiles',student.uid),{...student,deletedAt:serverTimestamp(),deletedBy:user.uid,deletedByEmail:profile.email||''});
      batch.delete(doc(db,'studentProfiles',student.uid));
      const logRef=doc(collection(db,'studentActivityLogs'));
      batch.set(logRef,{studentUid:student.uid,studentEmail:student.email||'',hostelId:student.hostelId||'',action:'PROFILE_MOVED_TO_TRASH',details:{},performedBy:user.uid,performedByEmail:profile.email||'',createdAt:serverTimestamp()});
      await batch.commit();
      setSelectedStudent(null); setNotice('Profil dipindahkan ke Trash. Emergency Contact dikekalkan.');
    } catch(e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };
  const restoreStudent = async student => {
    if (!isSuper || !window.confirm('Pulihkan profil pelajar ini?')) return;
    setBusy(true); setError('');
    try {
      const trashRef=doc(db,'deletedStudentProfiles',student.uid), snap=await getDoc(trashRef);
      if (!snap.exists()) throw new Error('Rekod Trash tidak ditemui.');
      const {deletedAt,deletedBy,deletedByEmail,...profileData}=snap.data();
      const batch=writeBatch(db);
      batch.set(doc(db,'studentProfiles',student.uid),profileData);
      batch.delete(trashRef);
      const logRef=doc(collection(db,'studentActivityLogs'));
      batch.set(logRef,{studentUid:student.uid,studentEmail:student.email||'',hostelId:student.hostelId||'',action:'PROFILE_RESTORED',details:{},performedBy:user.uid,performedByEmail:profile.email||'',createdAt:serverTimestamp()});
      await batch.commit(); setNotice('Profil pelajar berjaya dipulihkan.');
    } catch(e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };

  const pending=students.filter(x=>x.approvalStatus==='pending').length;
  const approved=students.filter(x=>x.approvalStatus==='approved').length;
  const rejected=students.filter(x=>x.approvalStatus==='rejected').length;

  return <div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-4">
      {[['Jumlah pelajar',students.length],['Menunggu',pending],['Diluluskan',approved],['Ditolak',rejected]].map(([label,value])=><div className="card" key={label}><p className="muted">{label}</p><p className="mt-2 text-3xl font-bold text-navy">{loading?'…':value}</p></div>)}
    </section>
    {!isSuper && <section className="card">
      <h3 className="section-title">Senarai Admin / Warden Hostel Sama ({peerAdmins.length})</h3>
      <p className="muted mt-1">Admin yang berkongsi sekurang-kurangnya satu hostel dengan akaun anda.</p>
      {peerAdmins.length ? peerAdmins.map(item => {
        const names=(item.hostelIds||[]).filter(id=>hostelIds.includes(id)).map(id=>hostels.find(h=>h.id===id)?.name||id);
        return <div key={item.email} className="border-b py-3"><b>{item.email}</b><p className="text-xs text-slate-500">Hostel bersama: {names.join(', ')}</p></div>;
      }) : <p className="muted mt-3">Tiada Admin lain yang berkongsi hostel ini.</p>}
    </section>}
    <section className="card">
      <div className="flex flex-wrap justify-between gap-2"><div><h3 className="section-title">{initialTab==='emergency'?'Emergency Contact Pelajar':'Student Management'}</h3><p className="muted mt-1">{isSuper?'Akses penuh semua hostel.':'Rekod terhad kepada hostel yang ditugaskan.'}</p></div><span className="text-xs text-slate-500">{hostelIds.length} hostel dalam skop</span></div>
      {error&&<p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}{message&&<p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
      <div className="mt-4 grid gap-3 sm:grid-cols-2"><input className="field" value={search} onChange={e=>setSearch(e.target.value)} placeholder="Cari nama, emel, telefon, program atau bilik"/><select className="field" value={statusFilter} onChange={e=>setStatusFilter(e.target.value)}><option value="all">Semua status</option><option value="draft">Draft</option><option value="pending">Pending Approval</option><option value="approved">Approved</option><option value="rejected">Rejected</option></select></div>
      <div className="mt-4 space-y-3">{filtered.map(st=><div key={st.uid} className="rounded-xl border p-4"><div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div className="flex items-center gap-3"><div className="h-14 w-14 rounded-full bg-teal/10 text-teal font-bold grid place-items-center">{(st.fullName||'?').trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()).join('')}</div><div><b>{st.fullName||'Nama belum diisi'}</b><p className="text-xs text-slate-500">{st.email} · {st.hostelName||'—'} · Bilik {st.room||'—'}</p><span className="text-xs font-semibold">{st.approvalStatus}</span></div></div><div className="flex flex-wrap gap-2"><button className="btn-secondary" onClick={()=>setSelectedStudent(st)}>Butiran & Edit</button>{st.approvalStatus!=='approved'&&<button className="btn-primary" disabled={busy} onClick={()=>decide(st,'approved')}>Approve</button>}{st.approvalStatus!=='rejected'&&<button className="btn-danger" disabled={busy} onClick={()=>{setSelectedStudent(st);setError('Masukkan sebab penolakan pada bahagian butiran pelajar.')}}>Reject</button>}</div></div></div>)}</div>
      {filtered.length===0&&<p className="muted mt-4">Tiada rekod pelajar ditemui.</p>}
    </section>
<section className="card"><div className="flex flex-wrap items-center justify-between gap-2"><h3 className="section-title flex items-center gap-2"><History size={18}/> Student Activity Log</h3>{isSuper&&<button className="btn-secondary" onClick={()=>{const rows=[["Tarikh","Pelajar","Tindakan","Pelaksana","Butiran"],...allLogs.map(log=>[log.createdAt?.toDate?.().toISOString()||"",log.studentEmail||log.studentUid,log.action,log.performedByEmail,JSON.stringify(log.details||{})])];const csv=rows.map(row=>row.map(value=>`"${String(value).replace(/"/g,'""')}"`).join(",")).join("\n");const blob=new Blob([csv],{type:"text/csv;charset=utf-8"});const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download="student-activity-log.csv";a.click();URL.revokeObjectURL(url);}}>Eksport CSV</button>}</div>{allLogs.length===0?<p className="muted mt-3">Tiada aktiviti direkodkan.</p>:allLogs.slice(0,100).map(log=><div key={log.id} className="border-b py-2 text-sm"><b>{log.action}</b><p>{log.studentEmail||log.studentUid}</p><p className="text-xs text-slate-500">{log.performedByEmail} · {log.createdAt?.toDate?.().toLocaleString("ms-MY")||"Masa tidak tersedia"}</p></div>)}</section>
         {isSuper && <section className="card">
       <h3 className="section-title">Trash / Recycle Bin ({trashStudents.length})</h3>
       <p className="muted mt-1">Profil Soft Delete. Restore mengembalikan profil; Emergency Contact dan sejarah aktiviti dikekalkan.</p>
       {trashStudents.length ? trashStudents.map(st=><div key={st.uid} className="border-b py-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
         <div><b>{st.fullName||'Nama belum diisi'}</b><p className="text-xs text-slate-500">{st.email} · {st.hostelName||'—'} · Dipadam oleh {st.deletedByEmail||'Super Admin'}</p></div>
         <button className="btn-primary" disabled={busy} onClick={()=>restoreStudent(st)}>Restore</button>
       </div>) : <p className="muted mt-3">Trash kosong.</p>}
     </section>}
{selectedStudent&&<section className="card space-y-4">
      <div className="flex justify-between gap-2"><h3 className="section-title">Butiran Pelajar: {selectedStudent.fullName}</h3><button className="btn-secondary" onClick={()=>setSelectedStudent(null)}>Tutup</button></div>
      <div className="grid gap-3 sm:grid-cols-2">
        {['fullName','phone','programme','hostelId','room'].map(key=><label className="text-sm font-medium capitalize" key={key}>{key==='hostelId'?'Hostel':key}{key==='hostelId'?<select className="field mt-1" value={editForm?.hostelId||''} onChange={e=>setEditForm(f=>({...f,hostelId:e.target.value,hostelName:hostels.find(h=>h.id===e.target.value)?.name||''}))}><option value="">Pilih hostel</option>{editForm?.hostelId&&!hostels.some(h=>h.id===editForm.hostelId)&&<option value={editForm.hostelId}>{editForm.hostelName||'Hostel tidak aktif / tiada dalam senarai'}</option>}{hostels.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select>:<input className="field mt-1" value={editForm?.[key]||''} onChange={e=>setEditForm(f=>({...f,[key]:e.target.value}))}/>}</label>)}
      </div>
      <div className="flex flex-wrap gap-2"><button className="btn-primary" disabled={busy} onClick={saveAdminEdit}>Simpan perubahan profil</button>{isSuper&&<button className="btn-danger" disabled={busy} onClick={()=>removeStudent(selectedStudent)}>Padam Profil (Super Admin)</button>}</div>
      <div className="border-t pt-4"><h4 className="font-semibold">Maklumat Pendaftaran & Emergency Contact</h4><p className="muted mt-1">Maklumat waris dipaparkan bersama rekod pendaftaran untuk Admin/Warden dan Super Admin.</p>{[0,1].map(i=>{const c=editContacts[i]||emptyContact();const digits=(c.phone||'').replace(/[^0-9]/g,'');const waNumber=digits.startsWith('0')?'6'+digits:digits;return <div key={i} className="mt-3 rounded-xl border p-3 space-y-3"><div><b>Emergency Contact {i+1}</b><p className="text-sm font-semibold text-navy mt-1">{c.fullName||'Nama belum diisi'}</p><p className="text-sm text-slate-600">{c.relationship||'Hubungan tidak dinyatakan'} · {c.phone||'No. telefon tiada'}</p><p className="text-sm text-slate-500">{c.address||'Alamat tidak diisi'}</p></div>{c.phone&&<div className="flex flex-wrap gap-2"><a className="btn-secondary inline-flex items-center gap-2" href={'tel:'+c.phone}><Phone size={16}/> Call</a><a className="btn-primary inline-flex items-center gap-2" href={'https://wa.me/'+waNumber} target="_blank" rel="noreferrer"><MessageSquare size={16}/> WhatsApp</a></div>}<div className="grid gap-2 sm:grid-cols-2 border-t pt-3">{['fullName','phone','relationship','address'].map(k=><label key={k} className="text-xs font-medium capitalize">{k==='fullName'?'Nama penuh':k==='phone'?'Nombor telefon':k==='relationship'?'Hubungan':'Alamat'}<input className="field mt-1" placeholder={k} value={c[k]||''} onChange={e=>setEditContacts(old=>old.map((item,j)=>j===i?{...item,[k]:e.target.value}:item))}/></label>)}</div></div>})}<button className="btn-primary mt-3" disabled={busy} onClick={saveAdminContacts}>Simpan Emergency Contact</button></div>
      <div className="border-t pt-4"><h4 className="font-semibold flex items-center gap-2"><History size={17}/> Student Activity History</h4>{logs.length===0?<p className="muted mt-2">Tiada sejarah aktiviti.</p>:logs.map(log=><div key={log.id} className="border-b py-2 text-sm"><b>{log.action}</b><p className="text-xs text-slate-500">{log.performedByEmail} · {log.createdAt?.toDate?.().toLocaleString('ms-MY')||'Masa tidak tersedia'}</p><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(log.details||{})}</pre></div>)}</div>
      <div className="border-t pt-4"><label className="text-sm font-semibold">Sebab penolakan (wajib untuk Reject)</label><textarea className="field mt-1" rows="3" value={rejectionReason} onChange={e=>setRejectionReason(e.target.value)} placeholder="Nyatakan sebab permohonan ditolak"/><div className="mt-2 flex gap-2"><button className="btn-primary" disabled={busy} onClick={()=>decide(selectedStudent,'approved')}>Approve</button><button className="btn-danger" disabled={busy} onClick={()=>decide(selectedStudent,'rejected')}>Reject</button></div></div>
    </section>}
  </div>;
}

function StudentWorkspace({ user, profile, setNotice, initialTab = 'all' }) {
  const [form,setForm]=useState({fullName:profile.displayName||'',phone:'',programme:'',hostelId:'',hostelName:'',room:''});
  const [contacts,setContacts]=useState([emptyContact(),emptyContact()]);
  const [originalData,setOriginalData]=useState({});
  const [originalContacts,setOriginalContacts]=useState([emptyContact(),emptyContact()]);
  const [hostels,setHostels]=useState([]);
  const [logs,setLogs]=useState([]);
  const [status,setStatus]=useState('draft');
  const [rejectionReason,setRejectionReason]=useState('');
  const [loading,setLoading]=useState(true);
  const [hostelLoading,setHostelLoading]=useState(true);
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState('');
  const locked=status==='pending';

  useEffect(()=>{
    let active=true;
    Promise.all([getDoc(doc(db,'studentProfiles',user.uid)),getDoc(doc(db,'emergencyContacts',user.uid))]).then(([p,c])=>{
      if(!active)return;
      if(p.exists()){
        const d=p.data(); setForm(f=>({...f,...d,hostelId:d.hostelId||'',hostelName:d.hostelName||''}));
        setStatus(d.approvalStatus||'draft'); setRejectionReason(d.rejectionReason||'');
      }
      if(c.exists()){const loaded=[0,1].map(i=>({...emptyContact(),...(c.data().contacts?.[i]||{})}));setContacts(loaded);setOriginalContacts(loaded);}
    }).catch(e=>setError(friendlyError(e))).finally(()=>active&&setLoading(false));
    return ()=>{active=false;};
  },[user.uid]);

  useEffect(()=>onSnapshot(query(collection(db,'hostels'),where('status','==','active')),snap=>{setHostels(snap.docs.map(d=>({id:d.id,...d.data()})));setHostelLoading(false);},e=>{setError(friendlyError(e));setHostelLoading(false);}),[]);
  useEffect(()=>onSnapshot(doc(db,'studentProfiles',user.uid),snap=>{if(snap.exists()){setStatus(snap.data().approvalStatus||'draft');setRejectionReason(snap.data().rejectionReason||'');}} ,e=>setError(friendlyError(e))),[user.uid]);
  useEffect(()=>onSnapshot(query(collection(db,'studentActivityLogs'),where('studentUid','==',user.uid)),snap=>setLogs(snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0))),e=>setError(friendlyError(e))),[user.uid]);

  const changeContact=(i,k,v)=>setContacts(old=>old.map((c,j)=>j===i?{...c,[k]:v}:c));
  const changeHostel=id=>{const h=hostels.find(x=>x.id===id);setForm(f=>({...f,hostelId:id,hostelName:h?.name||''}));};
  const validate=()=>{
    if(!form.fullName.trim()||!form.phone.trim()||!form.programme.trim()||!form.hostelId||!form.room.trim())return 'Lengkapkan nama, telefon, program, hostel dan nombor bilik.';
    if(!hostels.some(h=>h.id===form.hostelId))return 'Hostel tidak aktif atau tidak sah.';
    for(let i=0;i<2;i++){const c=contacts[i];if(!c.fullName.trim()||!c.phone.trim()||!c.relationship.trim()||!c.address.trim())return 'Lengkapkan semua maklumat kedua-dua Emergency Contact.';}
    return '';
  };
  const saveApplication=async(submit)=>{
    setError('');
    if(locked){setError('Permohonan sedang menunggu pengesahan dan tidak boleh diedit.');return;}
    if(submit){const problem=validate();if(problem){setError(problem);return;}}
    setBusy(true);
    try{
      const selected=hostels.find(h=>h.id===form.hostelId);
      const batch=writeBatch(db), profileRef=doc(db,'studentProfiles',user.uid), contactRef=doc(db,'emergencyContacts',user.uid);
      const nextStatus=submit?'pending':status;
      const payload={uid:user.uid,email:profile.email,fullName:form.fullName.trim(),phone:form.phone.trim(),programme:form.programme.trim(),hostelId:form.hostelId,hostelName:selected?.name||form.hostelName||'',room:form.room.trim(),approvalStatus:nextStatus,rejectionReason:submit?'':rejectionReason,updatedAt:serverTimestamp(),...(submit?{submittedAt:serverTimestamp(),submissionVersion:(Number(form.submissionVersion)||0)+1}:{})};
      batch.set(profileRef,payload,{merge:true});
      batch.set(contactRef,{uid:user.uid,studentEmail:profile.email,contacts:contacts.map(c=>({fullName:c.fullName.trim(),phone:c.phone.trim(),relationship:c.relationship.trim(),address:c.address.trim()})),updatedAt:serverTimestamp()},{merge:true});
      const logRef=doc(collection(db,'studentActivityLogs'));
      batch.set(logRef,{studentUid:user.uid,studentEmail:profile.email,hostelId:form.hostelId,action:submit?(status==='approved'?'RESUBMITTED':status==='rejected'?'RESUBMITTED':'SUBMITTED'):'DRAFT_SAVED',details:{statusBefore:status,statusAfter:nextStatus,before:{...originalData,emergencyContacts:originalContacts},after:{fullName:form.fullName.trim(),phone:form.phone.trim(),programme:form.programme.trim(),hostelId:form.hostelId,hostelName:selected?.name||form.hostelName||'',room:form.room.trim(),emergencyContacts:contacts}},performedBy:user.uid,performedByEmail:profile.email,createdAt:serverTimestamp()});
      await batch.commit();
      setStatus(nextStatus);setRejectionReason('');setOriginalData({fullName:form.fullName.trim(),phone:form.phone.trim(),programme:form.programme.trim(),hostelId:form.hostelId,hostelName:selected?.name||form.hostelName||'',room:form.room.trim()});setOriginalContacts(contacts);
      setNotice(submit?'Permohonan berjaya dihantar. Status: Pending Approval.':'Draf pendaftaran berjaya disimpan.');
    }catch(e){setError(friendlyError(e));}finally{setBusy(false);}
  };
  if(loading)return <section className="card">Memuatkan pendaftaran pelajar…</section>;
  return <div className="space-y-5">
    <section className="card"><div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="section-title">Student Registration</h3><p className="muted mt-1">Lengkapkan profil dan dua Emergency Contact.</p></div><span className={status==='approved'?'rounded-full bg-emerald-50 px-3 py-1 text-sm text-emerald-700':status==='rejected'?'rounded-full bg-red-50 px-3 py-1 text-sm text-red-700':'rounded-full bg-amber-50 px-3 py-1 text-sm text-amber-700'}>{status==='approved'?'Approved':status==='rejected'?'Rejected':status==='pending'?'Pending Approval':'Draft'}</span></div>
    {rejectionReason&&status==='rejected'&&<p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700"><b>Sebab penolakan:</b> {rejectionReason}</p>}
    {locked&&<p className="mt-3 rounded-lg bg-amber-50 p-3 text-sm text-amber-800">Permohonan telah dihantar dan dikunci sementara menunggu semakan Admin/Warden.</p>}
    {error&&<p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
    <div className="mt-4 flex items-center gap-3"><div className="h-20 w-20 rounded-full bg-teal/10 text-teal text-xl font-bold grid place-items-center">{(form.fullName||profile.displayName||'?').trim().split(/\s+/).slice(0,2).map(part=>part[0]?.toUpperCase()).join('')}</div><p className="text-sm text-slate-500">Avatar automatik berdasarkan nama pelajar.</p></div>
    <fieldset disabled={locked||busy} className="mt-4 grid gap-3 sm:grid-cols-2"><label className="text-sm font-medium">Nama penuh<input className="field mt-1" value={form.fullName} onChange={e=>setForm(f=>({...f,fullName:e.target.value}))} maxLength={100}/></label><label className="text-sm font-medium">Emel Google<input className="field mt-1 bg-slate-100" value={profile.email} readOnly/></label><label className="text-sm font-medium">Nombor telefon<input className="field mt-1" value={form.phone} onChange={e=>setForm(f=>({...f,phone:e.target.value}))} maxLength={25}/></label><label className="text-sm font-medium">Program / Kursus<input className="field mt-1" value={form.programme} onChange={e=>setForm(f=>({...f,programme:e.target.value}))} maxLength={120}/></label><label className="text-sm font-medium">Hostel<select className="field mt-1" value={form.hostelId} onChange={e=>changeHostel(e.target.value)} disabled={hostelLoading}><option value="">Pilih hostel</option>{hostels.map(h=><option key={h.id} value={h.id}>{h.name}</option>)}</select></label><label className="text-sm font-medium">Nombor bilik<input className="field mt-1" value={form.room} onChange={e=>setForm(f=>({...f,room:e.target.value}))} maxLength={30} placeholder="Contoh: A-203"/></label></fieldset>
    <section className="mt-5 border-t pt-4"><h4 className="font-semibold">Emergency Contact</h4><p className="muted mt-1">Dua orang waris / penjaga wajib diisi.</p>{contacts.map((c,i)=><div key={i} className="mt-3 rounded-xl border p-3 space-y-2"><b>Emergency Contact {i+1}</b><fieldset disabled={locked||busy} className="grid gap-2 sm:grid-cols-2"><input className="field" placeholder="Nama penuh" value={c.fullName} onChange={e=>changeContact(i,'fullName',e.target.value)}/><input className="field" placeholder="Nombor telefon" value={c.phone} onChange={e=>changeContact(i,'phone',e.target.value)}/><input className="field" placeholder="Hubungan" value={c.relationship} onChange={e=>changeContact(i,'relationship',e.target.value)}/><textarea className="field sm:col-span-2" rows="2" placeholder="Alamat" value={c.address} onChange={e=>changeContact(i,'address',e.target.value)}/></fieldset></div>)}</section>
    {!locked&&<div className="mt-5 flex flex-wrap gap-2">{status!=='approved'&&<button className="btn-secondary" disabled={busy||hostelLoading} onClick={()=>saveApplication(false)}>Simpan Draf</button>}<button className="btn-primary" disabled={busy||hostelLoading} onClick={()=>saveApplication(true)}>{busy?'Memproses…':status==='approved'||status==='rejected'?'Resubmit Permohonan':'Submit Application'}</button></div>}
    </section>
    <section className="card"><h3 className="section-title flex items-center gap-2"><History size={18}/> Student Activity History</h3>{logs.length===0?<p className="muted mt-3">Tiada aktiviti direkodkan.</p>:logs.map(log=><div key={log.id} className="border-b py-3 text-sm"><b>{log.action}</b><p className="text-xs text-slate-500">{log.createdAt?.toDate?.().toLocaleString('ms-MY')||'Masa tidak tersedia'}</p><pre className="whitespace-pre-wrap text-xs">{JSON.stringify(log.details||{})}</pre></div>)}</section>
  </div>;
}

function AdminOverview() {
  const [hostels,setHostels]=useState([]);
  const [profiles,setProfiles]=useState([]);
  const [admins,setAdmins]=useState(0);
  const [error,setError]=useState('');
  useEffect(()=>{
    const h=onSnapshot(collection(db,'hostels'),s=>setHostels(s.docs.map(d=>({id:d.id,...d.data()}))),e=>setError(friendlyError(e)));
    const p=onSnapshot(collection(db,'studentProfiles'),s=>setProfiles(s.docs.map(d=>({uid:d.id,...d.data()}))),e=>setError(friendlyError(e)));
    const u=onSnapshot(collection(db,'users'),s=>setAdmins(s.docs.filter(d=>d.data().role==='admin'&&d.data().status==='active').length),e=>setError(friendlyError(e)));
    return ()=>{h();p();u();};
  },[]);
  const active=hostels.filter(h=>h.status==='active');
  const capacity=active.reduce((n,h)=>n+(Number(h.roomCount)||0)*(Number(h.capacityPerRoom)||0),0);
  const count=(id,status)=>profiles.filter(p=>p.hostelId===id&&(!status||(p.approvalStatus||'draft')===status)).length;
  return <div className="space-y-5">
    <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {[['Jumlah hostel berdaftar',hostels.length],['Hostel aktif',active.length],['Jumlah penghuni',profiles.length],['Kapasiti keseluruhan',capacity]].map(([label,value])=><div className="card" key={label}><p className="muted">{label}</p><p className="mt-2 text-3xl font-bold text-navy">{value}</p></div>)}
    </section>
    <section className="card"><div className="flex flex-wrap justify-between gap-2"><h3 className="section-title">Status Penghuni Mengikut Hostel</h3><span className="text-xs text-slate-500">{admins} Admin aktif</span></div>
      {error&&<p className="mt-3 text-sm text-red-700">{error}</p>}
      {hostels.length?hostels.map(h=>{const total=count(h.id),cap=(Number(h.roomCount)||0)*(Number(h.capacityPerRoom)||0);return <div key={h.id} className="mt-3 rounded-xl border p-4">
        <div className="flex flex-wrap justify-between gap-2"><div><b>{h.name}</b><p className="text-xs text-slate-500">{h.status} · {h.roomCount||0} bilik · {h.capacityPerRoom||0} orang/bilik</p></div><b>{total} / {cap} penghuni</b></div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{[['Draft',count(h.id,'draft')],['Pending',count(h.id,'pending')],['Diluluskan',count(h.id,'approved')],['Ditolak',count(h.id,'rejected')]].map(([label,value])=><div key={label} className="rounded-lg bg-slate-50 p-2"><p className="text-xs text-slate-500">{label}</p><p className="text-xl font-bold">{value}</p></div>)}</div>
      </div>}):<p className="muted mt-3">Belum ada hostel didaftarkan.</p>}
    </section>
  </div>;
}

function AdminManagement({ me, setNotice }) {
  const [approved, setApproved] = useState([])
  const [users, setUsers] = useState([])
  const [hostels, setHostels] = useState([])

  const [email, setEmail] = useState('')
  const [role, setRole] = useState('admin')
  const [hostelIds, setHostelIds] = useState([])
  const [hostelName, setHostelName] = useState('')
  const [roomCount, setRoomCount] = useState('')
  const [capacityPerRoom, setCapacityPerRoom] = useState('')
  const [editing, setEditing] = useState(null)

  const [message, setMessage] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    const a = onSnapshot(
      collection(db, 'approvedUsers'),
      s => setApproved(s.docs.map(d => ({ id: d.id, ...d.data() }))),
      e => setError(friendlyError(e))
    )

    const u = onSnapshot(
      collection(db, 'users'),
      s => setUsers(s.docs.map(d => ({ id: d.id, ...d.data() }))),
      e => setError(friendlyError(e))
    )

    const h = onSnapshot(
      collection(db, 'hostels'),
      s => setHostels(s.docs.map(d => ({ id: d.id, ...d.data() }))),
      e => setError(friendlyError(e))
    )

    return () => {
      a()
      u()
      h()
    }
  }, [])

  const audit = (action, targetEmail, oldRole = null, newRole = null, reason = '') => {
    return addDoc(collection(db, 'adminAuditLogs'), {
      action,
      targetEmail,
      oldRole,
      newRole,
      reason,
      performedBy: me.uid,
      performedByEmail: me.email,
      createdAt: serverTimestamp(),
    })
  }

  const saveAccess = async () => {
    const cleanEmail = email.trim().toLowerCase()

    setMessage('')
    setError('')

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(cleanEmail)) {
      return setMessage('Sila masukkan emel yang sah.')
    }

    if (cleanEmail === SUPER_ADMIN_EMAIL) {
      return setMessage('Emel Super Admin tidak boleh diubah.')
    }

    if (role === 'admin' && hostelIds.length === 0) {
      return setMessage('Pilih sekurang-kurangnya satu hostel untuk Admin/Warden.')
    }

    setBusy(true)

    try {
      const old = approved.find(item => item.id === cleanEmail)
      const match = users.find(item => item.email?.toLowerCase() === cleanEmail)

      const data = {
        role,
        status: 'active',
        hostelIds: role === 'admin' ? hostelIds : [],
        addedBy: old?.addedBy || me.uid,
        addedAt: old?.addedAt || serverTimestamp(),
        updatedAt: serverTimestamp(),
      }

      await setDoc(doc(db, 'approvedUsers', cleanEmail), data, { merge: true })

      if (match) {
        await updateDoc(doc(db, 'users', match.id), {
          role,
          status: 'active',
          hostelIds: data.hostelIds,
          roleUpdatedAt: serverTimestamp(),
        })
      }

      await audit(
        old ? 'ACCESS_UPDATED' : 'ACCESS_GRANTED',
        cleanEmail,
        old?.role || null,
        role,
        'Hostel IDs: ' + data.hostelIds.join(', ')
      )

      setMessage('Akses ' + cleanEmail + ' berjaya disimpan.')
      setEmail('')
      setHostelIds([])
      setNotice('Akses pengguna dikemas kini.')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const suspend = async (item) => {
    const match = users.find(user => user.email?.toLowerCase() === item.id)
    const currentlyInactive = item.status === 'inactive' || match?.status === 'suspended'
    const newStatus = currentlyInactive ? 'active' : 'inactive'

    setBusy(true)
    setError('')

    try {
      await updateDoc(doc(db, 'approvedUsers', item.id), {
        status: newStatus,
        updatedAt: serverTimestamp(),
      })

      if (match) {
        await updateDoc(doc(db, 'users', match.id), {
          status: currentlyInactive ? 'active' : 'suspended',
          statusUpdatedAt: serverTimestamp(),
        })
      }

      await audit(
        currentlyInactive ? 'ACCESS_REACTIVATED' : 'ACCESS_SUSPENDED',
        item.id,
        item.role,
        item.role
      )
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const saveHostel = async () => {
    const name=hostelName.trim(), rooms=Number(roomCount), people=Number(capacityPerRoom);
    setMessage(''); setError('');
    if(!name) return setMessage('Masukkan nama hostel.');
    if(!Number.isInteger(rooms)||rooms<1) return setMessage('Jumlah bilik mesti sekurang-kurangnya 1.');
    if(!Number.isInteger(people)||people<1) return setMessage('Kapasiti penghuni setiap bilik mesti sekurang-kurangnya 1.');
    setBusy(true);
    try {
      const data={name,roomCount:rooms,capacityPerRoom:people,totalCapacity:rooms*people,updatedAt:serverTimestamp(),updatedBy:me.uid};
      if(editing){await updateDoc(doc(db,'hostels',editing.id),data);await audit('HOSTEL_UPDATED',editing.id,null,null,JSON.stringify({name,roomCount:rooms,capacityPerRoom:people}));}
      else {const ref=await addDoc(collection(db,'hostels'),{...data,status:'active',createdAt:serverTimestamp(),createdBy:me.uid});await audit('HOSTEL_CREATED',ref.id,null,null,JSON.stringify({name,roomCount:rooms,capacityPerRoom:people}));}
      setHostelName('');setRoomCount('');setCapacityPerRoom('');setEditing(null);setMessage('Maklumat hostel berjaya disimpan.');setNotice('Maklumat hostel dikemas kini.');
    } catch(e){setError(friendlyError(e));} finally{setBusy(false);}
  };

  const toggleHostel = async (hostel) => {
    const status = hostel.status === 'active' ? 'inactive' : 'active'

    setBusy(true)
    setError('')

    try {
      await updateDoc(doc(db, 'hostels', hostel.id), {
        status,
        updatedAt: serverTimestamp(),
        updatedBy: me.uid,
      })

      await audit('HOSTEL_STATUS_CHANGED', hostel.id, null, null, status)
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

  const deleteHostel = async hostel => {
    if(!window.confirm('Padam hostel ini secara kekal? Hanya boleh jika tiada penghuni atau Admin yang ditugaskan.')) return;
    setBusy(true);setError('');
    try{
      const students=await getDocs(query(collection(db,'studentProfiles'),where('hostelId','==',hostel.id)));
      const assigned=await getDocs(query(collection(db,'approvedUsers'),where('hostelIds','array-contains',hostel.id)));
      if(!students.empty||!assigned.empty) throw new Error('Hostel masih mempunyai penghuni atau Admin yang ditugaskan. Nyahaktifkan hostel jika tidak digunakan.');
      await deleteDoc(doc(db,'hostels',hostel.id));await audit('HOSTEL_DELETED',hostel.id,null,null,hostel.name);setMessage('Hostel berjaya dipadam.');
    }catch(e){setError(friendlyError(e));}finally{setBusy(false);}
  };

  const adminList = approved.filter(item => item.role === 'admin')

  return (
    <div className="space-y-6">
      <section className="card">
        <h3 className="section-title">Admin Management & Role Assignment</h3>
        <p className="muted my-3">
          Daftarkan emel Google dan tetapkan satu atau beberapa hostel untuk Admin/Warden.
        </p>

        <div className="grid gap-3 md:grid-cols-2">
          <label className="text-sm">
            Emel Google
            <input
              className="field mt-1"
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="admin@gmail.com"
            />
          </label>

          <label className="text-sm">
            Peranan
            <select
              className="field mt-1"
              value={role}
              onChange={e => setRole(e.target.value)}
            >
              <option value="admin">Admin / Warden</option>
              <option value="student">Pelajar</option>
            </select>
          </label>
        </div>

        {role === 'admin' && (
          <div className="mt-4">
            <p className="text-sm font-semibold mb-2">Penempatan Hostel</p>

            <div className="grid gap-2 sm:grid-cols-2">
              {hostels
                .filter(hostel => hostel.status === 'active')
                .map(hostel => (
                  <label key={hostel.id} className="border rounded-xl p-3 flex gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={hostelIds.includes(hostel.id)}
                      onChange={() => {
                        setHostelIds(current =>
                          current.includes(hostel.id)
                            ? current.filter(id => id !== hostel.id)
                            : [...current, hostel.id]
                        )
                      }}
                    />
                    {hostel.name}
                  </label>
                ))}
            </div>

            {!hostels.some(hostel => hostel.status === 'active') && (
              <p className="text-sm text-amber-700">Daftarkan hostel dahulu.</p>
            )}
          </div>
        )}

        <button className="btn-primary mt-4" onClick={saveAccess} disabled={busy}>
          Simpan Akses & Peranan
        </button>

        {message && <p className="text-sm text-emerald-700 mt-3">{message}</p>}
        {error && <p className="text-sm text-red-700 mt-3">{error}</p>}
      </section>

      <section className="card">
        <h3 className="section-title">Pengurusan Hostel ({hostels.length})</h3>
        <p className="muted mt-2">Tetapkan jumlah bilik dan kapasiti maksimum penghuni setiap bilik.</p>
        <div className="mt-3 grid gap-3 md:grid-cols-2">
          <label className="text-sm">Nama hostel<input className="field mt-1" value={hostelName} onChange={e=>setHostelName(e.target.value)} placeholder="Contoh: AMPANG MAS A-9-8"/></label>
          <label className="text-sm">Jumlah bilik<input className="field mt-1" type="number" min="1" step="1" value={roomCount} onChange={e=>setRoomCount(e.target.value)} placeholder="Contoh: 20"/></label>
          <label className="text-sm">Maksimum penghuni setiap bilik<input className="field mt-1" type="number" min="1" step="1" value={capacityPerRoom} onChange={e=>setCapacityPerRoom(e.target.value)} placeholder="Contoh: 4"/></label>
          <div className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">Jumlah kapasiti hostel</p><p className="text-xl font-bold">{(Number(roomCount)||0)*(Number(capacityPerRoom)||0)} orang</p></div>
        </div>
        <div className="mt-3 flex flex-wrap gap-2"><button className="btn-primary" onClick={saveHostel} disabled={busy}>{editing?'Simpan Perubahan':'Tambah Hostel'}</button>
          {editing&&<button className="btn-secondary" onClick={()=>{setEditing(null);setHostelName('');setRoomCount('');setCapacityPerRoom('')}}>Batal</button>}</div>
        {message&&<p className="mt-3 text-sm text-emerald-700">{message}</p>}{error&&<p className="mt-3 text-sm text-red-700">{error}</p>}
        <div className="mt-4 space-y-3">{hostels.map(hostel=><div key={hostel.id} className="rounded-xl border p-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between"><div><b>{hostel.name}</b><p className="text-xs text-slate-500">{hostel.status} · {hostel.roomCount||0} bilik · {hostel.capacityPerRoom||0} orang/bilik · Kapasiti {hostel.totalCapacity||((hostel.roomCount||0)*(hostel.capacityPerRoom||0))}</p></div>
          <div className="flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={()=>{setEditing(hostel);setHostelName(hostel.name||'');setRoomCount(String(hostel.roomCount||''));setCapacityPerRoom(String(hostel.capacityPerRoom||''));window.scrollTo({top:0,behavior:'smooth'})}}>Edit</button>
            <button className="btn-secondary" onClick={()=>toggleHostel(hostel)} disabled={busy}>{hostel.status==='active'?'Nyahaktif':'Aktifkan'}</button>
            <button className="btn-danger" onClick={()=>deleteHostel(hostel)} disabled={busy}>Padam</button>
          </div></div>
        </div>)}{!hostels.length&&<p className="muted">Belum ada hostel. Isi maklumat di atas dan klik Tambah Hostel.</p>}</div>
      </section>

      <section className="card">
        <h3 className="section-title">Senarai Admin / Warden ({adminList.length})</h3>

        {adminList.map(item => {
          const match = users.find(user => user.email?.toLowerCase() === item.id)
          const active = item.status !== 'inactive' && match?.status !== 'suspended'
          const names = (item.hostelIds || []).map(
            id => hostels.find(hostel => hostel.id === id)?.name || id
          )

          return (
            <div
              key={item.id}
              className="py-3 border-b flex flex-col gap-2 lg:flex-row lg:justify-between"
            >
              <div>
                <b className="break-all">{match?.displayName || item.id}</b>
                <p className="text-xs text-slate-500">
                  {item.id} · {active ? 'Aktif' : 'Digantung'}
                </p>
                <p className="text-xs">Hostel: {names.join(', ') || 'Belum ditetapkan'}</p>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  className="btn-secondary"
                  onClick={() => {
                    setEmail(item.id)
                    setRole('admin')
                    setHostelIds(item.hostelIds || [])
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                >
                  Ubah Penempatan
                </button>

                <button
                  className="btn-danger"
                  onClick={() => suspend(item)}
                  disabled={busy}
                >
                  {active ? 'Gantung Akses' : 'Aktifkan Akses'}
                </button>

                <button
                  className="btn-secondary"
                  onClick={() => {
                    setEmail(item.id)
                    setRole('student')
                    setHostelIds([])
                    window.scrollTo({ top: 0, behavior: 'smooth' })
                  }}
                >
                  Tukar ke Pelajar
                </button>
              </div>
            </div>
          )
        })}
      </section>

      <AuditLog />
    </div>
  )
}


const RULE_CATEGORIES = [
  'General Hostel Rules',
  'Cleanliness & Safety',
  'Student Discipline',
  'Facilities Usage',
  'Outgoing/Incoming Hours',
  'Prohibitions & Disciplinary Actions',
];

function HostelRules({ user, profile, isAdmin, isSuper, setNotice }) {
  const [rules, setRules] = useState([]);
  const [myAcks, setMyAcks] = useState([]);
  const [students, setStudents] = useState([]);
  const [acks, setAcks] = useState([]);
  const [ruleLogs, setRuleLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [editing, setEditing] = useState(null);
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState(RULE_CATEGORIES[0]);
  const [content, setContent] = useState('');
  const [effectiveDate, setEffectiveDate] = useState(new Date().toISOString().slice(0, 10));
  const hostelIds = Array.isArray(profile.hostelIds) ? profile.hostelIds : [];

  useEffect(() => {
    const rulesQuery = profile.role === 'student'
      ? query(collection(db, 'hostelRules'), where('status', '==', 'active'))
      : collection(db, 'hostelRules');
    return onSnapshot(rulesQuery, snapshot => {
      const rows = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
      rows.sort((a, b) => (b.updatedAt?.seconds || 0) - (a.updatedAt?.seconds || 0));
      setRules(rows);
      setLoading(false);
    }, e => { setError(friendlyError(e)); setLoading(false); });
  }, []);

  useEffect(() => {
    if (!isSuper) { setRuleLogs([]); return undefined; }
    return onSnapshot(collection(db, 'hostelRuleAuditLogs'), snapshot => {
      const rows=snapshot.docs.map(item=>({id:item.id,...item.data()}));
      rows.sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0));
      setRuleLogs(rows);
    }, e=>setError(friendlyError(e)));
  }, [isSuper]);

  useEffect(() => {
    if (profile.role !== 'student') { setMyAcks([]); return undefined; }
    return onSnapshot(query(collection(db, 'hostelRuleAcknowledgements'), where('studentUid', '==', user.uid)),
      snapshot => setMyAcks(snapshot.docs.map(item => ({ id: item.id, ...item.data() }))),
      e => setError(friendlyError(e)));
  }, [profile.role, user.uid]);

  useEffect(() => {
    if (!isAdmin) { setStudents([]); setAcks([]); return undefined; }
    let active = true;
    const studentRows = new Map();
    const ackRows = new Map();
    const unsubscribers = [];
    const publish = () => {
      if (!active) return;
      setStudents(Array.from(studentRows.values()).flat());
      setAcks(Array.from(ackRows.values()).flat());
    };
    if (isSuper) {
      unsubscribers.push(onSnapshot(collection(db, 'studentProfiles'), snap => {
        studentRows.set('all', snap.docs.map(d => ({ uid: d.id, ...d.data() })));
        publish();
      }, e => setError(friendlyError(e))));
      unsubscribers.push(onSnapshot(collection(db, 'hostelRuleAcknowledgements'), snap => {
        ackRows.set('all', snap.docs.map(d => ({ id: d.id, ...d.data() })));
        publish();
      }, e => setError(friendlyError(e))));
    } else {
      hostelIds.forEach(hostelId => {
        unsubscribers.push(onSnapshot(query(collection(db, 'studentProfiles'), where('hostelId', '==', hostelId)), snap => {
          studentRows.set(hostelId, snap.docs.map(d => ({ uid: d.id, ...d.data() })));
          publish();
        }, e => setError(friendlyError(e))));
        unsubscribers.push(onSnapshot(query(collection(db, 'hostelRuleAcknowledgements'), where('hostelId', '==', hostelId)), snap => {
          ackRows.set(hostelId, snap.docs.map(d => ({ id: d.id, ...d.data() })));
          publish();
        }, e => setError(friendlyError(e))));
      });
    }
    if (isSuper || hostelIds.length) setLoading(false);
    else setLoading(false);
    return () => { active = false; unsubscribers.forEach(stop => stop()); };
  }, [isAdmin, isSuper, hostelIds.join('|')]);

  const resetForm = () => {
    setEditing(null); setTitle(''); setCategory(RULE_CATEGORIES[0]); setContent('');
    setEffectiveDate(new Date().toISOString().slice(0, 10));
  };

  const saveRule = async () => {
    setError(''); setMessage('');
    if (!isSuper) return setError('Hanya Super Admin boleh mengurus peraturan.');
    if (!title.trim() || !content.trim() || !effectiveDate) return setError('Lengkapkan tajuk, kategori, kandungan dan tarikh kuat kuasa.');
    setBusy(true);
    try {
      const now = serverTimestamp();
      if (editing) {
        const nextVersion = (Number(editing.version) || 1) + 1;
        await updateDoc(doc(db, 'hostelRules', editing.id), {
          title: title.trim(), category, content: content.trim(), effectiveDate,
          version: nextVersion, updatedAt: now, updatedBy: user.uid, updatedByEmail: profile.email || '',
        });
        await addDoc(collection(db, 'hostelRuleAuditLogs'), {
          ruleId: editing.id, ruleTitle: title.trim(), action: 'RULE_UPDATED', version: nextVersion,
          category, content: content.trim(), effectiveDate, previousTitle: editing.title, previousContent: editing.content,
          performedBy: user.uid, performedByEmail: profile.email || '', createdAt: serverTimestamp(),
        });
        setMessage('Peraturan dikemas kini. Semua pelajar perlu membuat pengesahan semula bagi versi baharu.');
      } else {
        const ref = doc(collection(db, 'hostelRules'));
        await setDoc(ref, {
          title: title.trim(), category, content: content.trim(), effectiveDate, status: 'active',
          version: 1, createdAt: now, createdBy: user.uid, createdByEmail: profile.email || '',
          updatedAt: now, updatedBy: user.uid, updatedByEmail: profile.email || '',
        });
        await addDoc(collection(db, 'hostelRuleAuditLogs'), {
          ruleId: ref.id, ruleTitle: title.trim(), action: 'RULE_CREATED', version: 1,
          category, content: content.trim(), effectiveDate,
          performedBy: user.uid, performedByEmail: profile.email || '', createdAt: serverTimestamp(),
        });
        setMessage('Peraturan baharu berjaya diterbitkan.');
      }
      resetForm(); setNotice('Maklumat Hostel Rules dikemas kini.');
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };

  const archiveRule = async rule => {
    if (!isSuper || !window.confirm('Arkibkan peraturan ini? Rekod pengesahan lama akan dikekalkan.')) return;
    setBusy(true); setError('');
    try {
      const nextVersion = (Number(rule.version) || 1) + 1;
      await updateDoc(doc(db, 'hostelRules', rule.id), {
        status: 'archived', version: nextVersion, updatedAt: serverTimestamp(), updatedBy: user.uid, updatedByEmail: profile.email || '',
      });
      await addDoc(collection(db, 'hostelRuleAuditLogs'), {
        ruleId: rule.id, ruleTitle: rule.title, action: 'RULE_ARCHIVED', version: nextVersion,
        category: rule.category, content: rule.content, effectiveDate: rule.effectiveDate,
        performedBy: user.uid, performedByEmail: profile.email || '', createdAt: serverTimestamp(),
      });
      setMessage('Peraturan diarkibkan. Sejarah pengesahan dikekalkan.');
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };

  const restoreRule = async rule => {
    if (!isSuper) return;
    setBusy(true); setError('');
    try {
      const version = (Number(rule.version) || 1) + 1;
      await updateDoc(doc(db, 'hostelRules', rule.id), {
        status: 'active', version, updatedAt: serverTimestamp(), updatedBy: user.uid, updatedByEmail: profile.email || '',
      });
      await addDoc(collection(db, 'hostelRuleAuditLogs'), {
        ruleId: rule.id, ruleTitle: rule.title, action: 'RULE_REACTIVATED', version,
        category: rule.category, content: rule.content, effectiveDate: rule.effectiveDate,
        performedBy: user.uid, performedByEmail: profile.email || '', createdAt: serverTimestamp(),
      });
      setMessage('Peraturan diaktifkan semula. Pengesahan baharu diperlukan untuk versi terkini.');
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };

  const acknowledge = async rule => {
    if (profile.role !== 'student' || rule.status !== 'active') return;
    const ackId = rule.id + '_' + user.uid + '_v' + rule.version;
    setBusy(true); setError(''); setMessage('');
    try {
      const studentProfileSnap = await getDoc(doc(db, 'studentProfiles', user.uid));
      if (!studentProfileSnap.exists()) throw new Error('Profil pelajar belum didaftarkan.');
      const studentProfile = studentProfileSnap.data();
      if (!studentProfile.hostelId) throw new Error('Sila lengkapkan penempatan hostel sebelum mengesahkan peraturan.');
      await setDoc(doc(db, 'hostelRuleAcknowledgements', ackId), {
        ruleId: rule.id, ruleTitle: rule.title, version: rule.version || 1,
        studentUid: user.uid, studentEmail: profile.email || user.email || '',
        studentName: studentProfile.fullName || profile.displayName || user.displayName || '',
        hostelId: studentProfile.hostelId, acknowledgedAt: serverTimestamp(),
      });
      setMessage('Pengesahan bacaan berjaya direkodkan.');
      setNotice('Anda telah mengesahkan bacaan peraturan hostel.');
    } catch (e) { setError(friendlyError(e)); } finally { setBusy(false); }
  };

  const currentRules = rules.filter(rule => rule.status === 'active');
  const archivedRules = rules.filter(rule => rule.status === 'archived');
  const ackFor = (rule) => myAcks.find(a => a.ruleId === rule.id && Number(a.version) === Number(rule.version));
  const assignedStudents = (isSuper ? students : students.filter(s => hostelIds.includes(s.hostelId))).filter(s => s.approvalStatus === 'approved');
  const requiredCount = assignedStudents.length;
  const currentAckCount = (rule) => acks.filter(a => a.ruleId === rule.id && Number(a.version) === Number(rule.version)).length;

  return (
    <div className="space-y-5">
      {error && <p className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {message && <p className="rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

      {profile.role === 'student' && (
        <section className="card">
          <h3 className="section-title">Peraturan Hostel</h3>
          <p className="muted mt-1">Sila baca setiap peraturan dan sahkan bacaan. Tiada tarikh akhir pengesahan; anda boleh mengesahkan pada bila-bila masa.</p>
          {loading ? <p className="muted mt-3">Memuatkan peraturan…</p> : currentRules.length === 0 ? <p className="muted mt-3">Tiada peraturan aktif buat masa ini.</p> : currentRules.map(rule => {
            const ack = ackFor(rule);
            return <article key={rule.id} className="mt-4 rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div><span className="text-xs font-semibold text-teal">{rule.category}</span><h4 className="mt-1 font-bold text-navy">{rule.title}</h4></div>
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs">Versi {rule.version || 1}</span>
              </div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{rule.content}</p>
              <p className="mt-3 text-xs text-slate-500">Tarikh kuat kuasa: {rule.effectiveDate || '—'}</p>
              {ack ? <p className="mt-3 text-sm font-semibold text-emerald-700">✓ Telah disahkan pada {ack.acknowledgedAt?.toDate ? ack.acknowledgedAt.toDate().toLocaleString('ms-MY') : '—'}</p>
                : <button className="btn-primary mt-3" disabled={busy} onClick={() => acknowledge(rule)}>Saya Telah Baca & Faham</button>}
            </article>;
          })}
        </section>
      )}

      {isAdmin && (
        <section className="card">
          <h3 className="section-title">{isSuper ? 'Pemantauan Pengesahan Semua Hostel' : 'Pemantauan Pengesahan Hostel Ditugaskan'}</h3>
          <p className="muted mt-1">Admin/Warden boleh melihat status pengesahan sahaja. Hanya Super Admin boleh mengubah peraturan.</p>
          {currentRules.map(rule => {
            const confirmed = currentAckCount(rule);
            const pending = Math.max(0, requiredCount - confirmed);
            return <div key={rule.id} className="mt-4 rounded-xl border p-4">
              <div className="flex flex-wrap items-center justify-between gap-2"><div><b>{rule.title}</b><p className="text-xs text-slate-500">{rule.category} · Versi {rule.version || 1}</p></div><span className="text-sm font-semibold">{confirmed}/{requiredCount} disahkan</span></div>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div className="h-full bg-teal" style={{width: requiredCount ? Math.min(100, confirmed / requiredCount * 100) + '%' : '0%'}} /></div>
              <p className="mt-2 text-sm text-slate-600">{pending} belum disahkan</p>
              <div className="mt-3 space-y-2">{assignedStudents.map(student => {
                const ack = acks.find(a => a.ruleId === rule.id && Number(a.version) === Number(rule.version) && a.studentUid === student.uid);
                return <div key={student.uid} className="flex flex-wrap justify-between gap-2 border-t pt-2 text-sm"><span>{student.fullName || student.email || student.uid}</span><span className={ack ? 'text-emerald-700' : 'text-amber-700'}>{ack ? 'Disahkan' : 'Belum disahkan'}</span></div>;
              })}</div>
            </div>;
          })}
        </section>
      )}

      {isSuper && (
        <section className="card">
          <h3 className="section-title">Pengurusan Peraturan – Super Admin</h3>
          <p className="muted mt-1">Peraturan ini sama untuk semua hostel. Setiap perubahan kandungan menghasilkan versi baharu dan memerlukan semua pelajar mengesahkan semula.</p>
          <div className="mt-4 grid gap-3 md:grid-cols-2">
            <label className="text-sm">Tajuk peraturan<input className="field mt-1" value={title} onChange={e => setTitle(e.target.value)} placeholder="Contoh: Waktu keluar masuk hostel"/></label>
            <label className="text-sm">Kategori<select className="field mt-1" value={category} onChange={e => setCategory(e.target.value)}>{RULE_CATEGORIES.map(item => <option key={item}>{item}</option>)}</select></label>
            <label className="text-sm md:col-span-2">Tarikh kuat kuasa<input className="field mt-1" type="date" value={effectiveDate} onChange={e => setEffectiveDate(e.target.value)}/></label>
            <label className="text-sm md:col-span-2">Kandungan peraturan<textarea className="field mt-1 min-h-40" value={content} onChange={e => setContent(e.target.value)} placeholder="Masukkan kandungan penuh peraturan…"/></label>
          </div>
          <div className="mt-3 flex flex-wrap gap-2"><button className="btn-primary" disabled={busy} onClick={saveRule}>{editing ? 'Simpan Versi Baharu' : 'Terbitkan Peraturan'}</button>{editing && <button className="btn-secondary" onClick={resetForm}>Batal</button>}</div>
          <div className="mt-5 space-y-3">
            <h4 className="font-semibold text-navy">Senarai Peraturan ({rules.length})</h4>
            {rules.map(rule => <div key={rule.id} className="rounded-xl border p-4">
              <div className="flex flex-wrap justify-between gap-2"><div><b>{rule.title}</b><p className="text-xs text-slate-500">{rule.category} · Versi {rule.version || 1} · {rule.status}</p></div><span className="text-xs text-slate-500">Kuat kuasa: {rule.effectiveDate || '—'}</span></div>
              <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">{rule.content}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {rule.status !== 'archived' && <button className="btn-secondary" onClick={() => {setEditing(rule);setTitle(rule.title);setCategory(rule.category);setContent(rule.content);setEffectiveDate(rule.effectiveDate || new Date().toISOString().slice(0,10));window.scrollTo({top:0,behavior:'smooth'});}}>Edit</button>}
                {rule.status !== 'archived' ? <button className="btn-danger" disabled={busy} onClick={() => archiveRule(rule)}>Arkibkan</button> : <button className="btn-secondary" disabled={busy} onClick={() => restoreRule(rule)}>Aktifkan semula</button>}
              </div>
            </div>)}
            {!rules.length && <p className="muted">Belum ada peraturan diterbitkan.</p>}
          </div>
          {archivedRules.length > 0 && <p className="mt-3 text-xs text-slate-500">{archivedRules.length} peraturan diarkibkan; rekod pengesahan lama masih disimpan.</p>}
          <section className="mt-6 border-t pt-5">
            <h4 className="font-semibold text-navy">Sejarah Perubahan Peraturan</h4>
            {ruleLogs.length ? <div className="mt-3 space-y-3">{ruleLogs.map(log=><article key={log.id} className="rounded-lg border p-3 text-sm">
              <div className="flex flex-wrap justify-between gap-2"><b>{log.ruleTitle}</b><span className="text-xs text-slate-500">Versi {log.version || '—'} · {log.action}</span></div>
              <p className="mt-1 text-xs text-slate-500">Oleh {log.performedByEmail || log.performedBy || '—'} · {log.createdAt?.toDate ? log.createdAt.toDate().toLocaleString('ms-MY') : '—'}</p>
              {log.previousTitle && <p className="mt-2 text-xs text-slate-600">Tajuk sebelumnya: {log.previousTitle}</p>}
              {log.content && <details className="mt-2"><summary className="cursor-pointer text-teal">Lihat kandungan versi ini</summary><p className="mt-2 whitespace-pre-wrap text-xs text-slate-600">{log.content}</p></details>}
            </article>)}</div> : <p className="muted mt-2">Belum ada sejarah perubahan.</p>}
          </section>
        </section>
      )}
    </div>
  );
}



const DAILY_STATUS_OPTIONS = ['AT HOSTEL', 'OUTING', 'BALIK RUMAH', 'BALIK KAMPUNG', 'CUTI'];
const DAILY_GEOFENCE = { lat: 3.1516121, lng: 101.7471753, radius: 100 };

function malaysiaDateKeyFor(inputDate) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kuala_Lumpur', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(inputDate);
  const values = Object.fromEntries(parts.map(part => [part.type, part.value]));
  return values.year + '-' + values.month + '-' + values.day;
}

function malaysiaDateKey() { return malaysiaDateKeyFor(new Date()); }

function geoDistance(lat1, lon1, lat2, lon2) {
  const rad = n => n * Math.PI / 180;
  const a = Math.sin(rad(lat2-lat1)/2) ** 2 + Math.cos(rad(lat1))*Math.cos(rad(lat2))*Math.sin(rad(lon2-lon1)/2) ** 2;
  return 6371000 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}


const MOVEMENT_TYPES = [
  { value: 'OUTING', label: 'OUTING' },
  { value: 'BALIK RUMAH', label: 'BALIK RUMAH' },
  { value: 'BALIK KAMPUNG', label: 'BALIK KAMPUNG' },
  { value: 'CUTI', label: 'CUTI' },
];

function MovementRequests({ user, profile, isAdmin, isSuper, setNotice }) {
  const [type, setType] = useState('OUTING');
  const [startDate, setStartDate] = useState(malaysiaDateKey());
  const [endDate, setEndDate] = useState(malaysiaDateKey());
  const [destination, setDestination] = useState('');
  const [reason, setReason] = useState('');
  const [rows, setRows] = useState([]);
  const [students, setStudents] = useState({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const hostelIds = Array.isArray(profile.hostelIds) ? profile.hostelIds : [];

  useEffect(() => {
    if (profile.role === 'student') {
      return onSnapshot(query(collection(db, 'hostelMovementRequests'), where('studentUid', '==', user.uid)), snap => {
        setRows(snap.docs.map(d => ({ id: d.id, ...d.data() })).sort((a,b) => (b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
      }, e => setError(friendlyError(e)));
    }
    if (!isAdmin) return undefined;
    const unsubs = [];
    const maps = new Map();
    const publish = () => setRows(Array.from(maps.values()).flat().sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));
    const watch = hostelId => unsubs.push(onSnapshot(query(collection(db, 'hostelMovementRequests'), where('hostelId', '==', hostelId)), snap => {
      maps.set(hostelId, snap.docs.map(d => ({ id: d.id, ...d.data() }))); publish();
    }, e => setError(friendlyError(e))));
    if (isSuper) unsubs.push(onSnapshot(collection(db, 'hostelMovementRequests'), snap => {
      maps.set('all', snap.docs.map(d => ({ id: d.id, ...d.data() }))); publish();
    }, e => setError(friendlyError(e))));
    else hostelIds.forEach(watch);
    return () => unsubs.forEach(stop => stop());
  }, [profile.role, user.uid, isAdmin, isSuper, hostelIds.join('|')]);

  useEffect(() => {
    if (!isAdmin || !rows.length) return undefined;
    let active = true;
    const ids = [...new Set(rows.map(row => row.studentUid).filter(Boolean))];
    Promise.all(ids.map(async uid => {
      const snap = await getDoc(doc(db, 'studentProfiles', uid));
      return [uid, snap.exists() ? snap.data() : null];
    })).then(entries => { if (active) setStudents(Object.fromEntries(entries)); })
      .catch(e => { if (active) setError(friendlyError(e)); });
    return () => { active = false; };
  }, [isAdmin, rows.map(row => row.id).join('|')]);

  const submit = async () => {
    setBusy(true); setError('');
    try {
      if (!profile.hostelId) throw new Error('Profil belum mempunyai penempatan hostel.');
      if (!destination.trim() || !reason.trim()) throw new Error('Destinasi dan sebab permohonan wajib diisi.');
      if (endDate < startDate) throw new Error('Tarikh tamat tidak boleh lebih awal daripada tarikh mula.');
      await addDoc(collection(db, 'hostelMovementRequests'), {
        studentUid: user.uid, studentName: profile.fullName || '', studentEmail: profile.email || user.email || '',
        hostelId: profile.hostelId, hostelName: profile.hostelName || '', room: profile.room || '',
        type, startDate, endDate, destination: destination.trim(), reason: reason.trim(),
        approvalStatus: 'pending', createdAt: serverTimestamp(), updatedAt: serverTimestamp(),
      });
      setDestination(''); setReason('');
      setNotice('Permohonan telah dihantar kepada Admin/Warden.');
    } catch (e) { setError(e.message || friendlyError(e)); }
    finally { setBusy(false); }
  };

  const decide = async (row, approvalStatus) => {
    const rejectionReason = approvalStatus === 'rejected' ? window.prompt('Sebab permohonan ditolak:') : '';
    if (approvalStatus === 'rejected' && !rejectionReason?.trim()) return;
    setBusy(true); setError('');
    try {
      const batch = writeBatch(db);
      batch.update(doc(db, 'hostelMovementRequests', row.id), {
        approvalStatus, approvedBy: user.uid, approvedByEmail: profile.email || user.email || '',
        approvedAt: serverTimestamp(), updatedAt: serverTimestamp(),
        rejectionReason: rejectionReason?.trim() || '',
      });
      if (approvalStatus === 'approved') {
        const cursor = new Date(row.startDate + 'T12:00:00');
        const last = new Date(row.endDate + 'T12:00:00');
        let dayCount = 0;
        while (cursor <= last && dayCount < 31) {
          const dateKey = malaysiaDateKeyFor(cursor);
          batch.set(doc(db, 'dailyMovementApprovals', row.studentUid + '_' + dateKey), {
            studentUid: row.studentUid, hostelId: row.hostelId, date: dateKey,
            type: row.type, requestId: row.id, approvalStatus: 'approved',
            approvedBy: user.uid, approvedByEmail: profile.email || user.email || '',
            approvedAt: serverTimestamp(), startDate: row.startDate, endDate: row.endDate,
          });
          cursor.setDate(cursor.getDate() + 1); dayCount += 1;
        }
        if (cursor <= last) throw new Error('Tempoh permohonan terlalu panjang. Had maksimum 31 hari bagi satu permohonan.');
      }
      await batch.commit();
      await addDoc(collection(db, 'studentStatusAuditLogs'), {
        studentUid: row.studentUid, studentName: row.studentName || '', hostelId: row.hostelId,
        date: row.startDate, oldStatus: 'pending', newStatus: approvalStatus,
        action: approvalStatus === 'approved' ? 'MOVEMENT_REQUEST_APPROVED' : 'MOVEMENT_REQUEST_REJECTED',
        performedBy: user.uid, performedByEmail: profile.email || user.email || '',
        reason: rejectionReason?.trim() || '', createdAt: serverTimestamp(),
      });
      setNotice('Keputusan permohonan telah direkodkan.');
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-5">
      {error && <p role="alert" className="rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {profile.role === 'student' && <section className="card">
        <h3 className="section-title">Permohonan Keluar / Cuti</h3>
        <p className="muted mt-1">Permohonan perlu diluluskan oleh Admin/Warden sebelum pengecualian curfew diberikan.</p>
        <label className="mt-3 block text-sm font-medium">Jenis permohonan<select className="field mt-1" value={type} onChange={e=>setType(e.target.value)}>{MOVEMENT_TYPES.map(x=><option key={x.value} value={x.value}>{x.label}</option>)}</select></label>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <label className="text-sm font-medium">Tarikh mula<input className="field mt-1" type="date" value={startDate} onChange={e=>setStartDate(e.target.value)}/></label>
          <label className="text-sm font-medium">Tarikh tamat<input className="field mt-1" type="date" value={endDate} min={startDate} onChange={e=>setEndDate(e.target.value)}/></label>
        </div>
        <label className="mt-3 block text-sm font-medium">Destinasi<input className="field mt-1" value={destination} onChange={e=>setDestination(e.target.value)} placeholder="Nyatakan destinasi"/></label>
        <label className="mt-3 block text-sm font-medium">Sebab permohonan<textarea className="field mt-1 min-h-24" value={reason} onChange={e=>setReason(e.target.value)} placeholder="Nyatakan sebab permohonan"/></label>
        <button className="btn-primary mt-4 w-full" disabled={busy} onClick={submit}>{busy?'Menghantar…':'Hantar Permohonan'}</button>
      </section>}
      <section className="card">
        <h3 className="section-title">{profile.role === 'student' ? 'Sejarah Permohonan Saya' : 'Permohonan Pelajar'}</h3>
        {!rows.length ? <p className="muted mt-3">Tiada permohonan direkodkan.</p> : <div className="mt-3 space-y-3">
          {rows.map(row => <article key={row.id} className="rounded-xl border p-3">
            <div className="flex flex-wrap items-start justify-between gap-2"><div><b>{row.type} · {row.studentName}</b><p className="text-xs text-slate-500">{row.hostelName || row.hostelId} · {row.startDate} hingga {row.endDate}</p></div><span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold">{row.approvalStatus?.toUpperCase()}</span></div>
            <p className="mt-2 text-sm">Destinasi: {row.destination}</p><p className="text-sm">Sebab: {row.reason}</p>
            {row.rejectionReason && <p className="mt-2 text-sm text-red-700">Sebab ditolak: {row.rejectionReason}</p>}
            {isAdmin && row.approvalStatus === 'pending' && <div className="mt-3 flex gap-2"><button className="btn-primary" disabled={busy} onClick={()=>decide(row,'approved')}>Luluskan</button><button className="btn-secondary" disabled={busy} onClick={()=>decide(row,'rejected')}>Tolak</button></div>}
          </article>)}
        </div>}
      </section>
    </div>
  );
}


function MapRecenter({ center }) {
  const map = useMap()
  useEffect(() => { map.setView(center, map.getZoom()) }, [center, map])
  return null
}

function DailyStatusMap({ gpsLocation, searchLocation }) {
  const hostel = [DAILY_GEOFENCE.lat, DAILY_GEOFENCE.lng]
  const center = searchLocation ? [searchLocation.lat, searchLocation.lng] : (gpsLocation ? [gpsLocation.lat, gpsLocation.lng] : hostel)
  return (
    <div className="mt-4 overflow-hidden rounded-xl border border-slate-200">
      <div className="h-72 w-full">
        <MapContainer center={center} zoom={16} scrollWheelZoom className="h-full w-full">
          <MapRecenter center={center}/>
          <TileLayer attribution='&copy; OpenStreetMap contributors' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"/>
          <Circle center={hostel} radius={DAILY_GEOFENCE.radius} pathOptions={{ color: '#0f9f8f', fillColor: '#0f9f8f', fillOpacity: 0.12 }}/>
          <CircleMarker center={hostel} radius={8} pathOptions={{ color: '#0f766e', fillColor: '#14b8a6', fillOpacity: 1 }}><Popup>Lokasi rujukan hostel</Popup></CircleMarker>
          {gpsLocation && <CircleMarker center={[gpsLocation.lat, gpsLocation.lng]} radius={8} pathOptions={{ color: '#1d4ed8', fillColor: '#3b82f6', fillOpacity: 1 }}><Popup>Lokasi GPS semasa · ketepatan ±{gpsLocation.accuracy}m</Popup></CircleMarker>}
          {searchLocation && <CircleMarker center={[searchLocation.lat, searchLocation.lng]} radius={7} pathOptions={{ color: '#b45309', fillColor: '#f59e0b', fillOpacity: 1 }}><Popup>{searchLocation.label}</Popup></CircleMarker>}
        </MapContainer>
      </div>
      <div className="flex flex-wrap gap-3 p-3 text-xs text-slate-600"><span>🟢 Lokasi rujukan hostel</span><span>🔵 GPS pelajar</span><span>🟠 Lokasi carian</span><span>Bulatan = radius 100m</span></div>
    </div>
  )
}

function DailyStudentStatus({ user, profile, isAdmin, isSuper, setNotice }) {
  const today = malaysiaDateKey();
  const docId = user.uid + '_' + today;
  const [studentProfile, setStudentProfile] = useState(null)
  const [gpsLocation, setGpsLocation] = useState(null)
  const [searchText, setSearchText] = useState('')
  const [searchResults, setSearchResults] = useState([])
  const [searchLocation, setSearchLocation] = useState(null)
  const [status, setStatus] = useState('AT HOSTEL');
  const [record, setRecord] = useState(null);
  const [approvedMovement, setApprovedMovement] = useState(null);
  const [students, setStudents] = useState([]);
  const [records, setRecords] = useState([]);
  const [date, setDate] = useState(today);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [period, setPeriod] = useState('daily');
  const hostelIds = Array.isArray(profile.hostelIds) ? profile.hostelIds : [];
  const rangeStart = period === 'monthly'
    ? date.slice(0, 7) + '-01'
    : period === 'weekly'
      ? (() => { const d = new Date(date + 'T12:00:00'); d.setDate(d.getDate() - 6); return malaysiaDateKeyFor(d); })()
      : date;

  useEffect(() => {
    if (profile.role !== 'student') return undefined;
    let active = true;
    getDoc(doc(db, 'studentProfiles', user.uid)).then(snap => { if (active) setStudentProfile(snap.exists() ? snap.data() : null); }).catch(e => setError(friendlyError(e)));
    return () => { active = false; };
  }, [profile.role, user.uid]);

  useEffect(() => {
    if (profile.role !== 'student') return undefined;
    return onSnapshot(doc(db, 'dailyMovementApprovals', docId), snap => {
      setApprovedMovement(snap.exists() ? snap.data() : null);
    }, e => setError(friendlyError(e)));
  }, [profile.role, docId]);

  useEffect(() => {
    if (profile.role !== 'student') return undefined;
    return onSnapshot(doc(db, 'dailyStudentStatuses', docId), snap => {
      const value = snap.exists() ? { id: snap.id, ...snap.data() } : null;
      setRecord(value);
      if (value?.status && DAILY_STATUS_OPTIONS.includes(value.status)) setStatus(value.status);
      setLoading(false);
    }, e => { setError(friendlyError(e)); setLoading(false); });
  }, [profile.role, docId]);

  useEffect(() => {
    if (!isAdmin) return undefined;
    let active = true;
    const studentMap = new Map();
    const statusMap = new Map();
    const stops = [];
    const publish = () => {
      if (!active) return;
      setStudents(Array.from(studentMap.values()).flat());
      setRecords(Array.from(statusMap.values()).flat().filter(item => item.date >= rangeStart && item.date <= date));
      setLoading(false);
    };
    const watchHostel = hostelId => {
      stops.push(onSnapshot(query(collection(db, 'studentProfiles'), where('hostelId', '==', hostelId)), snap => {
        studentMap.set(hostelId, snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(x => x.approvalStatus === 'approved'));
        publish();
      }, e => setError(friendlyError(e))));
      stops.push(onSnapshot(query(collection(db, 'dailyStudentStatuses'), where('hostelId', '==', hostelId)), snap => {
        statusMap.set(hostelId, snap.docs.map(d => ({ id: d.id, ...d.data() })));
        publish();
      }, e => setError(friendlyError(e))));
    };
    if (isSuper) {
      stops.push(onSnapshot(collection(db, 'studentProfiles'), snap => {
        studentMap.set('all', snap.docs.map(d => ({ uid: d.id, ...d.data() })).filter(x => x.approvalStatus === 'approved'));
        publish();
      }, e => setError(friendlyError(e))));
      stops.push(onSnapshot(collection(db, 'dailyStudentStatuses'), snap => {
        statusMap.set('all', snap.docs.map(d => ({ id: d.id, ...d.data() })));
        publish();
      }, e => setError(friendlyError(e))));
    } else if (hostelIds.length) hostelIds.forEach(watchHostel);
    else setLoading(false);
    return () => { active = false; stops.forEach(stop => stop()); };
  }, [isAdmin, isSuper, hostelIds.join('|'), date, rangeStart]);


  const searchPlaces = async () => {
    if (!searchText.trim()) return;
    setError('');
    try {
      const response = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=5&q=' + encodeURIComponent(searchText.trim()));
      if (!response.ok) throw new Error('Carian lokasi tidak berjaya. Cuba sebentar lagi.');
      const data = await response.json();
      setSearchResults(data.map(x => ({ label: x.display_name, lat: Number(x.lat), lng: Number(x.lon) })));
      if (!data.length) setMessage('Tiada lokasi ditemui. Cuba kata carian lain.');
    } catch (e) { setError(e.message || 'Carian lokasi gagal.'); }
  };

  const save = async () => {
    setBusy(true); setError(''); setMessage('');
    try {
      const hostelId = studentProfile?.hostelId;
      if (!hostelId) throw new Error('Profil pelajar belum mempunyai penempatan hostel. Sila hubungi Warden untuk melengkapkan penempatan hostel dan bilik.');
      const gps = await new Promise((resolve, reject) => {
        if (!navigator.geolocation) return reject(new Error('GPS tidak disokong oleh browser.'));
        navigator.geolocation.getCurrentPosition(p => resolve({
          lat: p.coords.latitude, lng: p.coords.longitude, accuracy: Math.round(p.coords.accuracy),
        }), e => reject(new Error(e.code === 1 ? 'Kebenaran GPS ditolak. Benarkan Location untuk website ini.' : 'Lokasi GPS tidak dapat diperoleh. Cuba lagi.')),
        { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
      });
      setGpsLocation(gps);
      const distance = geoDistance(gps.lat, gps.lng, DAILY_GEOFENCE.lat, DAILY_GEOFENCE.lng);
      const verified = distance <= DAILY_GEOFENCE.radius;
      const approvedTypes = approvedMovement?.type ? [approvedMovement.type] : [];
      if (!verified && status !== 'AT HOSTEL' && !approvedTypes.includes(status)) {
        throw new Error('Status ' + status + ' memerlukan kelulusan aktif daripada Admin/Warden.');
      }
      const finalStatus = verified ? 'AT HOSTEL' : (status === 'AT HOSTEL' ? 'NOT VERIFIED' : status);
      const previous = record;
      await setDoc(doc(db, 'dailyStudentStatuses', docId), {
        studentUid: user.uid, studentName: studentProfile.fullName || '',
        studentEmail: studentProfile.email || user.email || '', hostelId,
        hostelName: studentProfile.hostelName || '', room: studentProfile.room || '', date: today,
        status: finalStatus, locationVerified: verified, latitude: gps.lat, longitude: gps.lng,
        accuracy: gps.accuracy, distanceFromHostel: Math.round(distance),
        lastLocationAt: serverTimestamp(), updatedAt: serverTimestamp(), updatedBy: user.uid,
        createdAt: previous?.createdAt || serverTimestamp(),
      }, { merge: true });
      await addDoc(collection(db, 'studentStatusAuditLogs'), {
        studentUid: user.uid, studentName: profile.fullName || '', hostelId: profile.hostelId,
        date: today, oldStatus: previous?.status || null, newStatus: finalStatus,
        locationVerified: verified, distanceFromHostel: Math.round(distance),
        action: 'STUDENT_STATUS_UPDATED', performedBy: user.uid,
        performedByEmail: profile.email || user.email || '', createdAt: serverTimestamp(),
      });
      setStatus(finalStatus);
      setMessage(verified ? 'GPS disahkan. Status AT HOSTEL dikemas kini secara automatik.' : 'Status dan lokasi GPS berjaya direkodkan. Lokasi berada di luar radius 100 meter.');
      setNotice('Daily Student Status dikemas kini.');
    } catch (e) { setError(e.message || friendlyError(e)); }
    finally { setBusy(false); }
  };

  const correct = async (item, nextStatus) => {
    const reason = window.prompt('Sebab pembetulan status:');
    if (!reason?.trim()) return;
    setBusy(true); setError('');
    try {
      await updateDoc(doc(db, 'dailyStudentStatuses', item.id), {
        status: nextStatus, correctionReason: reason.trim(), correctedBy: user.uid,
        updatedBy: user.uid, updatedAt: serverTimestamp(),
      });
      await addDoc(collection(db, 'studentStatusAuditLogs'), {
        studentUid: item.studentUid, studentName: item.studentName || '', hostelId: item.hostelId,
        date: item.date, oldStatus: item.status, newStatus: nextStatus, reason: reason.trim(),
        action: 'WARDEN_STATUS_CORRECTION', performedBy: user.uid,
        performedByEmail: profile.email || user.email || '', createdAt: serverTimestamp(),
      });
      setMessage('Pembetulan direkodkan dalam audit log.');
    } catch (e) { setError(friendlyError(e)); }
    finally { setBusy(false); }
  };

  if (profile.role === 'student') return (
    <div className="space-y-5">
      <section className="card">
        <h3 className="section-title">Kemas Kini Status Harian</h3>
        <p className="muted mt-1">Pilih status keberadaan dan sahkan GPS setiap hari serta ketika kembali ke hostel.</p>
        <p className="mt-3 text-sm text-slate-600">Tarikh: <b>{today}</b> · Peringatan: <b>9:30 malam</b> · Curfew: <b>10:00 malam</b></p>
        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
        {loading ? <p className="muted mt-3">Memuatkan status…</p> : <>
          <label className="mt-4 block text-sm font-medium">Status keberadaan
            <select className="field mt-1" value={status} onChange={e => setStatus(e.target.value)}>
              {['AT HOSTEL','OUTING','BALIK RUMAH','BALIK KAMPUNG','CUTI'].map(item => <option key={item} value={item} disabled={item !== 'AT HOSTEL' && approvedMovement?.type !== item}>{item}{item !== 'AT HOSTEL' && approvedMovement?.type !== item ? ' (Perlu kelulusan)' : ''}</option>)}
            </select>
          </label>

          <div className="mt-4">
            <label className="block text-sm font-medium">Cari lokasi pada peta</label>
            <div className="mt-1 flex gap-2">
              <input className="field min-w-0 flex-1" value={searchText} onChange={e => setSearchText(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') searchPlaces(); }} placeholder="Contoh: Ampang, Kuala Lumpur"/>
              <button className="btn-secondary shrink-0" type="button" onClick={searchPlaces}>Cari</button>
            </div>
            {searchResults.length > 0 && <div className="mt-2 max-h-36 overflow-auto rounded-lg border bg-white">{searchResults.map((x,i) => <button key={i} type="button" className="block w-full border-b p-2 text-left text-xs hover:bg-slate-50" onClick={() => { setSearchLocation(x); setSearchResults([]); }}>{x.label}</button>)}</div>}
          </div>
          <DailyStatusMap gpsLocation={gpsLocation || (record?.latitude != null ? { lat: record.latitude, lng: record.longitude, accuracy: record.accuracy || 0 } : null)} searchLocation={searchLocation}/>
          <div className="mt-4 rounded-xl bg-slate-50 p-3 text-sm">
            <p><b>Status hari ini:</b> {record?.status || 'Belum dikemas kini'}</p>
            <p><b>GPS:</b> {record?.locationVerified ? 'Disahkan dalam radius 100m' : 'Belum disahkan dalam radius 100m'}</p>
            {approvedMovement && <p><b>Kelulusan aktif:</b> {approvedMovement.type} ({approvedMovement.startDate} hingga {approvedMovement.endDate})</p>}
            <p><b>Lokasi terakhir:</b> {record?.lastLocationAt?.toDate ? record.lastLocationAt.toDate().toLocaleString('ms-MY') : '—'}</p>
            {record?.distanceFromHostel != null && <p><b>Jarak:</b> {record.distanceFromHostel} meter</p>}
          </div>
          <button className="btn-primary mt-4 w-full" disabled={busy} onClick={save}>
            <MapPin size={17}/> {busy ? 'Mengesahkan GPS…' : 'Kemas Kini Status & Sahkan GPS'}
          </button>
        </>}
      </section>
      <section className="card"><h3 className="section-title">Peringatan & Curfew</h3><p className="muted mt-1">Peringatan ditetapkan pada 9:30 malam. GPS diperlukan setiap hari dan semasa kembali. Kelulusan CUTI, BALIK RUMAH, BALIK KAMPUNG atau OUTING yang sah memberi pengecualian daripada LATE RETURN.</p></section>
    </div>
  );

  if (!isAdmin) return <section className="card"><p>Akses tidak dibenarkan.</p></section>;
  const visibleRecords = records.filter(r => r.date >= rangeStart && r.date <= date);
  const byStudent = new Map(visibleRecords.map(item => [item.studentUid, item]));
  const counts = ['AT HOSTEL','OUTING','BALIK RUMAH','BALIK KAMPUNG','CUTI','NOT VERIFIED','LATE RETURN'].map(s => ({ status: s, count: visibleRecords.filter(r => r.status === s).length }));
  return (
    <div className="space-y-5">
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="section-title">Pemantauan Status Pelajar</h3><p className="muted mt-1">{isSuper ? 'Semua hostel' : 'Hostel ditugaskan'} · {date}</p></div><input className="field max-w-44" type="date" value={date} onChange={e => setDate(e.target.value)}/></div>
        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}
        <div className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <div className="rounded-lg bg-slate-50 p-3"><p className="muted">Jumlah pelajar</p><b className="text-2xl">{students.length}</b></div>
          <div className="rounded-lg bg-slate-50 p-3"><p className="muted">Ada rekod</p><b className="text-2xl">{records.length}</b></div>
          <div className="rounded-lg bg-slate-50 p-3"><p className="muted">AT HOSTEL</p><b className="text-2xl">{byStudent.size ? counts[0].count : 0}</b></div>
          <div className="rounded-lg bg-slate-50 p-3"><p className="muted">Belum rekod</p><b className="text-2xl">{Math.max(0, students.length - records.length)}</b></div>
        </div>
      </section>
      <section className="card">
        <h3 className="section-title">Senarai Pelajar</h3>
        {loading ? <p className="muted mt-3">Memuatkan rekod…</p> : students.map(student => {
          const item = byStudent.get(student.uid);
          return <article key={student.uid} className="mt-3 rounded-xl border p-3">
            <div className="flex flex-wrap justify-between gap-2"><div><b>{student.fullName || student.email}</b><p className="text-xs text-slate-500">{student.hostelName || student.hostelId} · Bilik {student.room || '—'}</p></div><b className="text-sm">{item?.status || 'NOT VERIFIED'}</b></div>
            <p className="mt-2 text-xs text-slate-500">GPS: {item?.locationVerified ? 'Verified' : 'Belum verified'} · Jarak: {item?.distanceFromHostel ?? '—'}m · Kemas kini: {item?.lastLocationAt?.toDate ? item.lastLocationAt.toDate().toLocaleString('ms-MY') : '—'}</p>
            {item && <select className="field mt-2 max-w-60" defaultValue="" disabled={busy} onChange={e => { if (e.target.value) correct(item, e.target.value); }}>
              <option value="">Pembetulan status (warden)</option>
              {['AT HOSTEL','OUTING','BALIK RUMAH','BALIK KAMPUNG','CUTI','NOT VERIFIED','LATE RETURN'].filter(s => s !== item.status).map(s => <option key={s} value={s}>{s}</option>)}
            </select>}
          </article>;
        })}
        {!loading && !students.length && <p className="muted mt-3">Tiada pelajar diluluskan dalam skop akses ini.</p>}
      </section>
      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="section-title">Laporan Status</h3><select className="field max-w-44" value={period} onChange={e => setPeriod(e.target.value)}><option value="daily">Harian</option><option value="weekly">Mingguan</option><option value="monthly">Bulanan</option></select></div>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">{counts.map(x => <div key={x.status} className="rounded-lg bg-slate-50 p-3"><p className="text-xs text-slate-500">{x.status}</p><b className="text-xl">{x.count}</b></div>)}</div>
        <p className="muted mt-3 text-xs">Ringkasan dikira daripada rekod dalam julat tarikh pilihan: hari berkenaan, 7 hari sehingga tarikh pilihan, atau bulan berkenaan.</p>
      </section>
    </div>
  );
}

function AuditLog() {
  const [logs, setLogs] = useState([])
  const [error, setError] = useState('')

  useEffect(() => {
    return onSnapshot(
      collection(db, 'adminAuditLogs'),
      snapshot => {
        setLogs(
          snapshot.docs
            .map(d => ({ id: d.id, ...d.data() }))
            .sort(
              (a, b) =>
                (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0)
            )
        )
      },
      e => setError(friendlyError(e))
    )
  }, [])

  return (
    <section className="card">
      <h3 className="section-title">Audit Log Pelantikan Admin</h3>

      {error && <p className="mt-2 text-sm text-red-700">{error}</p>}

      {logs.length === 0 ? (
        <p className="mt-3 text-sm text-slate-500">
          Tiada aktiviti direkodkan.
        </p>
      ) : (
        <div className="mt-3 space-y-3">
          {logs.slice(0, 30).map(log => (
            <div key={log.id} className="border-b border-slate-100 pb-3 text-sm">
              <p className="font-semibold text-navy">
                {log.action} · {log.targetEmail}
              </p>
              <p className="text-slate-500">
                {log.oldRole || '—'} → {log.newRole || '—'} · oleh {log.performedByEmail}
              </p>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}
