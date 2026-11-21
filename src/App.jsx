
import { useEffect, useState } from 'react'
import { onAuthStateChanged, signInWithPopup, signOut } from 'firebase/auth'
import {
  addDoc, collection, doc, getDoc, onSnapshot, query,
  serverTimestamp, setDoc, updateDoc, where,
} from 'firebase/firestore'
import {
  Home, LogIn, LogOut, ShieldCheck, UserRound, Phone, Save,
  AlertCircle, CheckCircle2, CalendarCheck, MapPin, Clock,
  Sparkles, MessageSquare, Wallet, Receipt, Siren, BookOpen,
  Award, Settings, ArrowLeft, LayoutDashboard, Trash,
} from 'lucide-react'
import { auth, db, provider, SUPER_ADMIN_EMAIL } from './firebase'

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
  { id: 'profile', title: 'Student Registration & Profile', desc: 'Profil pelajar dan maklumat peribadi', icon: UserRound, ready: true },
  { id: 'emergency', title: 'Emergency Contact', desc: 'Maklumat waris dan penjaga', icon: Phone, ready: true },
  { id: 'attendance', title: 'Class Attendance', desc: 'Rekod kehadiran kelas', icon: CalendarCheck },
  { id: 'outing', title: 'Going Home / Outing Log', desc: 'Rekod keluar, destinasi dan pulang', icon: MapPin },
  { id: 'geofence', title: 'Geofence Monitoring', desc: 'Pengesahan kembali ke kawasan hostel', icon: MapPin },
  { id: 'daily-status', title: 'Daily Student Status', desc: 'Status keberadaan dan pemantauan curfew', icon: Clock },
  { id: 'cleaning', title: 'Cleaning Schedule', desc: 'Jadual tugasan kebersihan mingguan', icon: Sparkles },
  { id: 'trash-wars', title: 'Trash Wars', desc: 'Giliran buang sampah dan ganjaran XP', icon: Trash },
  { id: 'lobby', title: 'Hostel Lobby', desc: 'Pengumuman dan ruang komuniti', icon: MessageSquare },
  { id: 'bills', title: 'Bills Management', desc: 'Pengurusan bil elektrik dan air', icon: Wallet },
  { id: 'collection', title: 'Monthly Collection', desc: 'Kutipan bulanan penghuni', icon: Receipt },
  { id: 'sos', title: 'Location Sharing & SOS', desc: 'Perkongsian lokasi dan bantuan kecemasan', icon: Siren },
  { id: 'rules', title: 'Hostel Rules', desc: 'Peraturan rasmi dan pengesahan bacaan', icon: BookOpen },
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
                  16 modul
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
    if (ids.length > 30) {
      setSummaryLoading(false);
      return undefined;
    }
    const q = query(collection(db, 'studentProfiles'), where('hostelId', 'in', ids));
    return onSnapshot(q, snapshot => {
      const rows = snapshot.docs.map(item => item.data());
      setStudentSummary({
        total: rows.length,
        pending: rows.filter(row => !row.approvalStatus || row.approvalStatus === 'pending').length,
        approved: rows.filter(row => row.approvalStatus === 'approved').length,
        rejected: rows.filter(row => row.approvalStatus === 'rejected').length,
      });
      setSummaryLoading(false);
    }, error => {
      setHostelError(friendlyError(error));
      setSummaryLoading(false);
    });
  }, [isSuper, profile.role, profile.hostelIds]);

  useEffect(() => {
    if (isSuper || profile.role !== 'admin') return undefined;

    const email = (profile.email || '').trim().toLowerCase();

    if (!email) {
      setHostelError('Emel akaun tidak dapat dikenal pasti.');
      setHostelLoading(false);
      return undefined;
    }

    let approvedIds = [];
    let activeHostels = [];
    let approvedReady = false;
    let hostelsReady = false;

    const syncAssignedHostels = () => {
      if (!approvedReady || !hostelsReady) return;

      setAssignedHostels(
        activeHostels.filter(hostel => approvedIds.includes(hostel.id))
      );
      setHostelLoading(false);
    };

    const unsubscribeApproved = onSnapshot(
      doc(db, 'approvedUsers', email),
      snapshot => {
        approvedIds =
          snapshot.exists() && Array.isArray(snapshot.data().hostelIds)
            ? snapshot.data().hostelIds
            : [];
        approvedReady = true;
        syncAssignedHostels();
      },
      error => {
        setHostelError(friendlyError(error));
        setHostelLoading(false);
      }
    );

    const activeHostelsQuery = query(
      collection(db, 'hostels'),
      where('status', '==', 'active')
    );

    const unsubscribeHostels = onSnapshot(
      activeHostelsQuery,
      snapshot => {
        activeHostels = snapshot.docs.map(item => ({
          id: item.id,
          ...item.data(),
        }));
        hostelsReady = true;
        syncAssignedHostels();
      },
      error => {
        setHostelError(friendlyError(error));
        setHostelLoading(false);
      }
    );

    return () => {
      unsubscribeApproved();
      unsubscribeHostels();
    };
  }, [isSuper, profile.email, profile.role]);

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
        <section className="grid gap-3 sm:grid-cols-4">
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
  const [students, setStudents] = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [contacts, setContacts] = useState(null);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    const stopHostels = onSnapshot(
      query(collection(db, 'hostels'), where('status', '==', 'active')),
      snapshot => {
        const rows = snapshot.docs.map(item => ({ id: item.id, ...item.data() }));
        setHostels(rows);
        if (isSuper) setHostelIds(rows.map(hostel => hostel.id));
      },
      e => setError(friendlyError(e))
    );

    if (isSuper) {
      setLoading(false);
      return stopHostels;
    }

    const email = (profile.email || '').trim().toLowerCase();
    if (!email) {
      setError('Emel akaun tidak dapat dikenal pasti.');
      setLoading(false);
      stopHostels();
      return undefined;
    }

    const stopApproved = onSnapshot(
      doc(db, 'approvedUsers', email),
      snapshot => {
        if (!snapshot.exists() || snapshot.data().status !== 'active') {
          setError('Akses Admin tidak aktif. Sila hubungi Super Admin.');
          setLoading(false);
          return;
        }
        setHostelIds(Array.isArray(snapshot.data().hostelIds) ? snapshot.data().hostelIds : []);
      },
      e => {
        setError(friendlyError(e));
        setLoading(false);
      }
    );

    return () => {
      stopApproved();
      stopHostels();
    };
  }, [profile.email, isSuper]);

  useEffect(() => {
    setLoading(true);
    setError('');

    const studentsQuery = isSuper
      ? collection(db, 'studentProfiles')
      : hostelIds.length > 0 && hostelIds.length <= 30
        ? query(collection(db, 'studentProfiles'), where('hostelId', 'in', hostelIds))
        : null;

    if (!studentsQuery) {
      setStudents([]);
      setLoading(false);
      if (!isSuper && hostelIds.length > 30) {
        setError('Penempatan melebihi had carian sistem. Hubungi Super Admin.');
      }
      return undefined;
    }

    const stopStudents = onSnapshot(
      studentsQuery,
      snapshot => {
        const rows = snapshot.docs.map(item => ({
          uid: item.id,
          ...item.data(),
          approvalStatus: item.data().approvalStatus || 'pending',
        }));
        rows.sort((a, b) => (a.fullName || '').localeCompare(b.fullName || ''));
        setStudents(rows);
        setLoading(false);
      },
      e => {
        setError(friendlyError(e));
        setLoading(false);
      }
    );

    return stopStudents;
  }, [hostelIds, isSuper]);

  useEffect(() => {
    let active = true;
    async function loadContacts() {
      if (!selectedStudent || initialTab !== 'emergency') {
        setContacts(null);
        return;
      }
      try {
        const snap = await getDoc(doc(db, 'emergencyContacts', selectedStudent.uid));
        if (active) setContacts(snap.exists() ? snap.data().contacts || [] : []);
      } catch (e) {
        if (active) setError(friendlyError(e));
      }
    }
    loadContacts();
    return () => { active = false; };
  }, [selectedStudent, initialTab]);

  const filteredStudents = students.filter(student => {
    const term = search.trim().toLowerCase();
    const matchesSearch = !term ||
      (student.fullName || '').toLowerCase().includes(term) ||
      (student.email || '').toLowerCase().includes(term) ||
      (student.phone || '').toLowerCase().includes(term) ||
      (student.room || '').toLowerCase().includes(term);
    const matchesStatus = statusFilter === 'all' || student.approvalStatus === statusFilter;
    const matchesTab = initialTab !== 'emergency' || true;
    return matchesSearch && matchesStatus && matchesTab;
  });

  const updateApproval = async (student, status) => {
    if (!student?.uid) return;
    if (status === 'rejected' && !window.confirm('Tolak pendaftaran pelajar ini?')) return;
    setBusy(true);
    setError('');
    setMessage('');
    try {
      await updateDoc(doc(db, 'studentProfiles', student.uid), {
        approvalStatus: status,
        approvedBy: user.uid,
        approvedByEmail: profile.email,
        approvedAt: serverTimestamp(),
        rejectionReason: status === 'rejected' ? 'Tidak memenuhi pengesahan pihak hostel.' : '',
        updatedAt: serverTimestamp(),
      });
      try {
        await addDoc(collection(db, 'studentApprovalLogs'), {
          action: status === 'approved' ? 'STUDENT_APPROVED' : 'STUDENT_REJECTED',
          studentUid: student.uid,
          studentEmail: student.email || '',
          hostelId: student.hostelId,
          performedBy: user.uid,
          performedByEmail: profile.email,
          createdAt: serverTimestamp(),
        });
      } catch (auditError) {
        console.warn('Student approval saved but audit log failed:', auditError);
      }
      setMessage(status === 'approved'
        ? 'Pendaftaran pelajar berjaya diluluskan.'
        : 'Pendaftaran pelajar telah ditolak.');
      setNotice('Status pendaftaran pelajar dikemas kini.');
    } catch (e) {
      setError(friendlyError(e));
    } finally {
      setBusy(false);
    }
  };

  const pending = students.filter(item => item.approvalStatus === 'pending').length;
  const approved = students.filter(item => item.approvalStatus === 'approved').length;
  const rejected = students.filter(item => item.approvalStatus === 'rejected').length;

  if (loading && students.length === 0) {
    return <section className="card">Memuatkan rekod pelajar…</section>;
  }

  return (
    <div className="space-y-5">
      <section className="grid gap-3 sm:grid-cols-3">
        <div className="card">
          <p className="muted">Jumlah rekod pelajar</p>
          <p className="mt-2 text-3xl font-bold text-navy">{students.length}</p>
        </div>
        <div className="card">
          <p className="muted">Menunggu pengesahan</p>
          <p className="mt-2 text-3xl font-bold text-amber-600">{pending}</p>
        </div>
        <div className="card">
          <p className="muted">Diluluskan</p>
          <p className="mt-2 text-3xl font-bold text-emerald-700">{approved}</p>
        </div>
      </section>

      <section className="card">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h3 className="section-title">
              {initialTab === 'emergency' ? 'Emergency Contact Pelajar' : 'Student Management'}
            </h3>
            <p className="muted mt-1">{isSuper ? 'Akses penuh: rekod pelajar daripada semua hostel.' : 'Rekod terhad kepada hostel yang ditugaskan kepada akaun anda.'}</p>
          </div>
          <span className="rounded-full bg-slate-100 px-3 py-1 text-xs text-slate-600">
            {isSuper ? hostels.length + ' hostel dalam sistem' : hostelIds.length + ' hostel ditugaskan'}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {hostels.filter(hostel => hostelIds.includes(hostel.id)).map(hostel => (
            <span key={hostel.id} className="rounded-full bg-teal/10 px-3 py-1 text-xs font-medium text-teal">
              {hostel.name}
            </span>
          ))}
        </div>

        {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
        {message && <p className="mt-3 rounded-lg bg-emerald-50 p-3 text-sm text-emerald-700">{message}</p>}

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <input
            className="field"
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Cari nama, emel, telefon atau bilik"
          />
          <select className="field" value={statusFilter} onChange={e => setStatusFilter(e.target.value)}>
            <option value="all">Semua status</option>
            <option value="pending">Menunggu pengesahan</option>
            <option value="approved">Diluluskan</option>
            <option value="rejected">Ditolak</option>
          </select>
        </div>

        <div className="mt-4 space-y-3">
          {filteredStudents.length === 0 ? (
            <p className="rounded-xl bg-slate-50 p-4 text-sm text-slate-500">
              Tiada rekod pelajar ditemui untuk carian atau penapis ini.
            </p>
          ) : filteredStudents.map(student => (
            <div key={student.uid} className="rounded-xl border border-slate-200 p-4">
              <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <div>
                  <p className="font-semibold text-navy">{student.fullName || 'Nama belum diisi'}</p>
                  <p className="text-xs text-slate-500">{student.email || 'Tiada emel'} · Bilik: {student.room || 'Belum ditetapkan'}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {hostels.find(hostel => hostel.id === student.hostelId)?.name || student.hostelName || 'Hostel tidak dikenal pasti'}
                    {' · '}{student.programme || 'Program belum diisi'}
                  </p>
                  <span className={
                    student.approvalStatus === 'approved'
                      ? 'mt-2 inline-block rounded-full bg-emerald-50 px-2 py-1 text-xs text-emerald-700'
                      : student.approvalStatus === 'rejected'
                        ? 'mt-2 inline-block rounded-full bg-red-50 px-2 py-1 text-xs text-red-700'
                        : 'mt-2 inline-block rounded-full bg-amber-50 px-2 py-1 text-xs text-amber-700'
                  }>
                    {student.approvalStatus === 'approved' ? 'Diluluskan' : student.approvalStatus === 'rejected' ? 'Ditolak' : 'Menunggu'}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="btn-secondary" onClick={() => setSelectedStudent(student)}>
                    {initialTab === 'emergency' ? 'Lihat Waris' : 'Butiran'}
                  </button>
                  {initialTab !== 'emergency' && student.approvalStatus !== 'approved' && (
                    <button className="btn-primary" disabled={busy} onClick={() => updateApproval(student, 'approved')}>
                      Luluskan
                    </button>
                  )}
                  {initialTab !== 'emergency' && student.approvalStatus !== 'rejected' && (
                    <button className="btn-danger" disabled={busy} onClick={() => updateApproval(student, 'rejected')}>
                      Tolak
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {selectedStudent && (
        <section className="card">
          <div className="flex items-center justify-between gap-2">
            <h3 className="section-title">Butiran: {selectedStudent.fullName || selectedStudent.email}</h3>
            <button className="btn-secondary" onClick={() => setSelectedStudent(null)}>Tutup</button>
          </div>
          <div className="mt-3 grid gap-3 sm:grid-cols-2 text-sm">
            <p><b>Emel:</b> {selectedStudent.email || '—'}</p>
            <p><b>Telefon:</b> {selectedStudent.phone || '—'}</p>
            <p><b>Program:</b> {selectedStudent.programme || '—'}</p>
            <p><b>Hostel:</b> {selectedStudent.hostelName || '—'}</p>
            <p><b>Bilik:</b> {selectedStudent.room || '—'}</p>
            <p><b>Status:</b> {selectedStudent.approvalStatus}</p>
          </div>

          {initialTab === 'emergency' && (
            <div className="mt-4 border-t pt-4">
              <h4 className="font-semibold text-navy">Maklumat waris / penjaga</h4>
              {contacts === null ? (
                <p className="muted mt-2">Memuatkan maklumat waris…</p>
              ) : contacts.length === 0 ? (
                <p className="muted mt-2">Pelajar belum mendaftarkan Emergency Contact.</p>
              ) : contacts.map((contact, index) => (
                <div key={index} className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">
                  <p className="font-semibold">{contact.fullName}</p>
                  <p>{contact.relationship} · {contact.phone}</p>
                  <p className="text-slate-500">{contact.address}</p>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      <section className="card">
        <h4 className="font-semibold text-navy">Ringkasan status</h4>
        <p className="muted mt-2">Ditolak: {rejected} · Menunggu: {pending} · Diluluskan: {approved}</p>
      </section>
    </div>
  );
}

function StudentWorkspace({ user, profile, setNotice, initialTab = 'all' }) {
  const [form, setForm] = useState({
    fullName: profile.displayName || '',
    phone: '',
    programme: '',
    hostelId: '',
    hostelName: '',
    room: '',
  })

  const [contacts, setContacts] = useState([emptyContact(), emptyContact()])
  const [hostels, setHostels] = useState([])
  const [loading, setLoading] = useState(true)
  const [hostelLoading, setHostelLoading] = useState(true)
  const [savingProfile, setSavingProfile] = useState(false)
  const [savingContacts, setSavingContacts] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let active = true

    async function loadStudentData() {
      try {
        const [profileSnap, contactSnap] = await Promise.all([
          getDoc(doc(db, 'studentProfiles', user.uid)),
          getDoc(doc(db, 'emergencyContacts', user.uid)),
        ])

        if (!active) return

        if (profileSnap.exists()) {
          setForm(current => ({
            ...current,
            ...profileSnap.data(),
            hostelId: profileSnap.data().hostelId || '',
            hostelName: profileSnap.data().hostelName || '',
          }))
        }

        if (contactSnap.exists() && Array.isArray(contactSnap.data().contacts)) {
          setContacts(
            [0, 1].map(i => ({
              ...emptyContact(),
              ...(contactSnap.data().contacts[i] || {}),
            }))
          )
        }
      } catch (e) {
        if (active) setError(friendlyError(e))
      } finally {
        if (active) setLoading(false)
      }
    }

    loadStudentData()

    return () => {
      active = false
    }
  }, [user.uid])

  useEffect(() => {
    const activeHostelsQuery = query(
      collection(db, 'hostels'),
      where('status', '==', 'active')
    )

    const unsubscribe = onSnapshot(
      activeHostelsQuery,
      snapshot => {
        setHostels(
          snapshot.docs.map(item => ({
            id: item.id,
            ...item.data(),
          }))
        )
        setHostelLoading(false)
      },
      e => {
        setError(friendlyError(e))
        setHostelLoading(false)
      }
    )

    return unsubscribe
  }, [])

  const changeContact = (index, key, value) => {
    setContacts(old =>
      old.map((contact, i) =>
        i === index ? { ...contact, [key]: value } : contact
      )
    )
  }

  const changeHostel = (hostelId) => {
    const selected = hostels.find(hostel => hostel.id === hostelId)

    setForm(current => ({
      ...current,
      hostelId,
      hostelName: selected?.name || '',
      room: '',
    }))
  }

  const saveProfile = async (e) => {
    e.preventDefault()
    setError('')

    if (!form.fullName.trim()) {
      return setError('Nama penuh wajib diisi.')
    }

    if (!form.hostelId) {
      return setError('Sila pilih hostel.')
    }

    const selectedHostel = hostels.find(h => h.id === form.hostelId)

    if (!selectedHostel) {
      return setError('Hostel yang dipilih tidak lagi aktif. Sila pilih hostel lain.')
    }

    setSavingProfile(true)

    try {
      await setDoc(
        doc(db, 'studentProfiles', user.uid),
        {
          uid: user.uid,
          email: profile.email,
          fullName: form.fullName.trim(),
          phone: form.phone.trim(),
          programme: form.programme.trim(),
          hostelId: selectedHostel.id,
          hostelName: selectedHostel.name,
          room: form.room.trim(),
          updatedAt: serverTimestamp(),
        },
        { merge: true }
      )

      setNotice('Profil pelajar berjaya disimpan.')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setSavingProfile(false)
    }
  }

  const saveContacts = async (e) => {
    e.preventDefault()
    setError('')

    for (let i = 0; i < contacts.length; i++) {
      const contact = contacts[i]

      if (
        !contact.fullName.trim() ||
        !contact.phone.trim() ||
        !contact.relationship.trim() ||
        !contact.address.trim()
      ) {
        return setError(`Sila lengkapkan semua maklumat Emergency Contact ${i + 1}.`)
      }
    }

    setSavingContacts(true)

    try {
      await setDoc(doc(db, 'emergencyContacts', user.uid), {
        uid: user.uid,
        studentEmail: profile.email,
        contacts: contacts.map(contact => ({
          fullName: contact.fullName.trim(),
          phone: contact.phone.trim(),
          relationship: contact.relationship.trim(),
          address: contact.address.trim(),
        })),
        updatedAt: serverTimestamp(),
      })

      setNotice('Dua Emergency Contact berjaya disimpan.')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setSavingContacts(false)
    }
  }

  if (loading) {
    return <section className="card">Memuatkan profil pelajar…</section>
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {(initialTab === 'all' || initialTab === 'profile') && (
        <section className="card">
          <div className="mb-4 flex items-center gap-2">
            <UserRound className="text-teal" />
            <h3 className="section-title">Profil Pelajar</h3>
          </div>

          <p className="muted mb-4">
            Lengkapkan maklumat peribadi dan pilih hostel penempatan.
          </p>

          {error && (
            <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <form onSubmit={saveProfile} className="space-y-3">
            <label className="block text-sm font-medium">
              Nama penuh
              <input
                className="field mt-1"
                value={form.fullName}
                onChange={e => setForm({ ...form, fullName: e.target.value })}
                required
                maxLength={100}
              />
            </label>

            <label className="block text-sm font-medium">
              Emel Google
              <input className="field mt-1 bg-slate-100" value={profile.email} readOnly />
            </label>

            <label className="block text-sm font-medium">
              Nombor telefon
              <input
                className="field mt-1"
                value={form.phone}
                onChange={e => setForm({ ...form, phone: e.target.value })}
                maxLength={25}
                placeholder="Contoh: 01X-XXXXXXX"
              />
            </label>

            <label className="block text-sm font-medium">
              Program / Kursus
              <input
                className="field mt-1"
                value={form.programme}
                onChange={e => setForm({ ...form, programme: e.target.value })}
                maxLength={120}
              />
            </label>

            <label className="block text-sm font-medium">
              Pilih Hostel
              <select
                className="field mt-1"
                value={form.hostelId}
                onChange={e => changeHostel(e.target.value)}
                required
                disabled={hostelLoading || hostels.length === 0}
              >
                <option value="">
                  {hostelLoading ? 'Memuatkan senarai hostel…' : 'Pilih hostel'}
                </option>
                {hostels.map(hostel => (
                  <option key={hostel.id} value={hostel.id}>
                    {hostel.name}
                  </option>
                ))}
              </select>
            </label>

            {!hostelLoading && hostels.length === 0 && (
              <p className="text-xs text-amber-700">
                Tiada hostel aktif ditemui. Sila hubungi pihak pengurusan.
              </p>
            )}

            <label className="block text-sm font-medium">
              Bilik
              <input
                className="field mt-1"
                value={form.room}
                onChange={e => setForm({ ...form, room: e.target.value })}
                maxLength={30}
                placeholder="Diisi mengikut penempatan rasmi"
              />
              <span className="mt-1 block text-xs text-slate-500">
                Pemilihan bilik daripada senarai rasmi akan disambungkan dalam langkah pembangunan seterusnya.
              </span>
            </label>

            <button
              className="btn-primary w-full"
              disabled={savingProfile || hostelLoading || hostels.length === 0}
            >
              <Save size={16} />
              {savingProfile ? 'Menyimpan…' : 'Simpan Profil'}
            </button>
          </form>
        </section>
      )}

      {(initialTab === 'all' || initialTab === 'emergency') && (
        <section className="card">
          <div className="mb-2 flex items-center gap-2">
            <Phone className="text-teal" />
            <h3 className="section-title">Emergency Contact</h3>
          </div>

          <p className="muted mb-4">
            Dua orang waris / penjaga wajib didaftarkan.
          </p>

          {error && (
            <p className="mb-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">
              {error}
            </p>
          )}

          <form onSubmit={saveContacts} className="space-y-5">
            {contacts.map((contact, index) => (
              <div key={index} className="rounded-xl border border-slate-200 p-4">
                <h4 className="mb-3 font-bold text-navy">
                  {index === 0 ? 'Emergency Contact 1 (Utama)' : 'Emergency Contact 2'}
                </h4>

                <div className="space-y-3">
                  <label className="block text-sm font-medium">
                    Nama penuh
                    <input
                      className="field mt-1"
                      value={contact.fullName}
                      onChange={e => changeContact(index, 'fullName', e.target.value)}
                      required
                      maxLength={100}
                    />
                  </label>

                  <label className="block text-sm font-medium">
                    Nombor telefon
                    <input
                      className="field mt-1"
                      value={contact.phone}
                      onChange={e => changeContact(index, 'phone', e.target.value)}
                      required
                      maxLength={25}
                      placeholder="Contoh: 60123456789"
                    />
                  </label>

                  <label className="block text-sm font-medium">
                    Hubungan
                    <input
                      className="field mt-1"
                      value={contact.relationship}
                      onChange={e => changeContact(index, 'relationship', e.target.value)}
                      required
                      maxLength={50}
                      placeholder="Contoh: Ibu / Bapa / Penjaga"
                    />
                  </label>

                  <label className="block text-sm font-medium">
                    Alamat rumah
                    <textarea
                      className="field mt-1"
                      rows="2"
                      value={contact.address}
                      onChange={e => changeContact(index, 'address', e.target.value)}
                      required
                      maxLength={300}
                    />
                  </label>
                </div>
              </div>
            ))}

            <button className="btn-primary w-full" disabled={savingContacts}>
              <Save size={16} />
              {savingContacts ? 'Menyimpan…' : 'Simpan 2 Emergency Contacts'}
            </button>
          </form>
        </section>
      )}
    </div>
  )
}

function AdminOverview() {
  const [students, setStudents] = useState(0)
  const [admins, setAdmins] = useState(0)
  const [error, setError] = useState('')

  useEffect(() => {
    return onSnapshot(
      collection(db, 'users'),
      snapshot => {
        const rows = snapshot.docs.map(item => item.data())

        setStudents(
          rows.filter(item => item.role === 'student' && item.status === 'active').length
        )

        setAdmins(
          rows.filter(item => item.role === 'admin' && item.status === 'active').length
        )
      },
      e => setError(friendlyError(e))
    )
  }, [])

  return (
    <section className="grid gap-4 sm:grid-cols-2">
      <div className="card">
        <p className="muted">Pelajar aktif</p>
        <p className="mt-2 text-3xl font-bold text-navy">{students}</p>
      </div>

      <div className="card">
        <p className="muted">Admin aktif</p>
        <p className="mt-2 text-3xl font-bold text-navy">{admins}</p>
      </div>

      {error && <p className="text-sm text-red-700">{error}</p>}
    </section>
  )
}

function AdminManagement({ me, setNotice }) {
  const [approved, setApproved] = useState([])
  const [users, setUsers] = useState([])
  const [hostels, setHostels] = useState([])

  const [email, setEmail] = useState('')
  const [role, setRole] = useState('admin')
  const [hostelIds, setHostelIds] = useState([])
  const [hostelName, setHostelName] = useState('')
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
    const name = hostelName.trim()

    setMessage('')
    setError('')

    if (!name) {
      return setMessage('Masukkan nama hostel.')
    }

    setBusy(true)

    try {
      if (editing) {
        await updateDoc(doc(db, 'hostels', editing.id), {
          name,
          updatedAt: serverTimestamp(),
          updatedBy: me.uid,
        })

        await audit('HOSTEL_UPDATED', editing.id, null, null, name)
      } else {
        const ref = await addDoc(collection(db, 'hostels'), {
          name,
          status: 'active',
          createdAt: serverTimestamp(),
          createdBy: me.uid,
        })

        await audit('HOSTEL_CREATED', ref.id, null, null, name)
      }

      setHostelName('')
      setEditing(null)
      setMessage('Hostel berjaya disimpan.')
    } catch (e) {
      setError(friendlyError(e))
    } finally {
      setBusy(false)
    }
  }

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

        <div className="flex flex-col sm:flex-row gap-2 mt-3">
          <input
            className="field"
            value={hostelName}
            onChange={e => setHostelName(e.target.value)}
            placeholder="Nama hostel"
          />

          <button className="btn-primary" onClick={saveHostel} disabled={busy}>
            {editing ? 'Kemaskini' : 'Tambah Hostel'}
          </button>

          {editing && (
            <button
              className="btn-secondary"
              onClick={() => {
                setEditing(null)
                setHostelName('')
              }}
            >
              Batal
            </button>
          )}
        </div>

        {hostels.map(hostel => (
          <div
            key={hostel.id}
            className="py-3 border-b flex flex-col sm:flex-row gap-2 sm:justify-between"
          >
            <div>
              <b>{hostel.name}</b>
              <p className="text-xs text-slate-500">
                {hostel.status} · {hostel.id}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                className="btn-secondary"
                onClick={() => {
                  setEditing(hostel)
                  setHostelName(hostel.name)
                }}
              >
                Edit
              </button>

              <button
                className="btn-danger"
                onClick={() => toggleHostel(hostel)}
                disabled={busy}
              >
                {hostel.status === 'active' ? 'Nyahaktif' : 'Aktifkan'}
              </button>
            </div>
          </div>
        ))}
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
