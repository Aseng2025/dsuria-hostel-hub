import { useEffect, useMemo, useState } from 'react'
import { addDoc, collection, doc, onSnapshot, query, serverTimestamp, updateDoc, where } from 'firebase/firestore'
import { db } from './firebase'
import { AlertTriangle, CheckCircle2, Clock3, MapPin, Plus, RefreshCw, Save, ShieldCheck, Trash2 } from 'lucide-react'

const BASE = { attendance:'Class Attendance', outing:'Going Home / Outing Log', geofence:'Geofence Monitoring', 'daily-status':'Daily Student Status', cleaning:'Cleaning Schedule', 'trash-wars':'Trash Wars', lobby:'Hostel Lobby', bills:'Bills Management', collection:'Monthly Collection', sos:'Location Sharing & SOS', rules:'Hostel Rules', merit:'Merit & Demerit System' }
const FIELDS = {
 attendance:[['classDate','Tarikh kelas','date'],['className','Nama kelas / subjek','text'],['attendanceStatus','Status','select',['PRESENT','MC','APPROVED LEAVE','ABSENT – NO REASON','PENDING VERIFICATION','NO CLASS']],['notes','Catatan','textarea']],
 outing:[['departureAt','Tarikh & masa keluar','datetime-local'],['destination','Destinasi / tempat','text'],['address','Alamat destinasi','textarea'],['expectedReturn','Jangkaan masa pulang','datetime-local'],['purpose','Tujuan','text']],
 'daily-status':[['status','Status harian','select',['AT HOSTEL','OUTING','BALIK RUMAH','BALIK KAMPUNG','CUTI','NOT VERIFIED']],['expectedReturn','Jangkaan pulang (jika keluar)','datetime-local'],['notes','Catatan','textarea']],
 cleaning:[['weekStart','Minggu bermula','date'],['rotation','Kumpulan giliran','select',['Alpha','Beta','Charlie']],['room','Bilik','select',['Room 1','Room 2','Room 3']],['task','Tugasan','select',['T1 – Ruang sidai baju dan balkoni','T2 – Dapur kering dan dapur basah','T3 – Ruang tamu dan ruang lif']],['notes','Catatan','textarea']],
 'trash-wars':[['taskDate','Tarikh tugasan','date'],['assignedStudent','Nama pelajar bertugas','text'],['task','Tugasan','select',['Buang sampah','Bersihkan tong sampah','Lain-lain']],['status','Status','select',['ASSIGNED','COMPLETED','VERIFIED']],['notes','Catatan','textarea']],
 lobby:[['postType','Jenis hantaran','select',['ANNOUNCEMENT','QUESTION','DISCUSSION']],['title','Tajuk','text'],['message','Mesej','textarea']],
 bills:[['billMonth','Bulan bil','month'],['billType','Jenis bil','select',['Electricity','Water']],['totalAmount','Jumlah bil (RM)','number'],['subsidy','Subsidi kolej (RM)','number'],['excessAmount','Lebihan (RM)','number'],['notes','Catatan agihan / pengecualian','textarea']],
 collection:[['month','Bulan kutipan','month'],['amount','Jumlah (RM)','number'],['paymentStatus','Status bayaran','select',['UNPAID','PAID','PENDING VERIFICATION']],['receiptNote','Rujukan / catatan resit','text']],
 sos:[['emergencyType','Jenis bantuan','select',['Medical','Safety','Other']],['message','Maklumat kecemasan','textarea']],
 merit:[['studentName','Nama pelajar','text'],['category','Kategori','select',['Light','Moderate','Heavy','Positive']],['points','Mata (+/-)','number'],['reason','Sebab / butiran','textarea'],['status','Status semakan','select',['PENDING REVIEW','APPROVED','REJECTED','APPEALED']]],
 rules:[['ruleTitle','Tajuk peraturan','text'],['acknowledged','Pengesahan bacaan','select',['Saya telah membaca dan memahami peraturan asrama']]],
}
const ROTATION = {
 Alpha:{'Room 1':'T1','Room 2':'T2','Room 3':'T3'},
 Beta:{'Room 3':'T1','Room 1':'T2','Room 2':'T3'},
 Charlie:{'Room 2':'T1','Room 3':'T2','Room 1':'T3'}
}
const fmt = v => v?.toDate ? v.toDate().toLocaleString('ms-MY') : v || '—'
const clean = v => String(v ?? '').replace(/</g,'&lt;')

export default function OperationalModule({ id, user, profile, isAdmin, setNotice }) {
 const [rows,setRows] = useState([]), [busy,setBusy] = useState(false), [error,setError] = useState(''), [form,setForm] = useState({}), [showForm,setShowForm] = useState(false)
 const coll = `hostel_${id}`
 useEffect(() => {
   const q = isAdmin ? collection(db,coll) : query(collection(db,coll),where('ownerUid','==',user.uid))
   return onSnapshot(q,s=>{setRows(s.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.createdAt?.seconds||0)-(a.createdAt?.seconds||0)));setError('')},e=>setError(e.message||'Tidak dapat memuatkan rekod.'))
 },[id,isAdmin,user.uid])
 const fields = FIELDS[id] || []
 const submit = async e => {
  e.preventDefault(); setBusy(true);setError('')
  try {
   const data={...form,ownerUid:user.uid,ownerEmail:profile.email,studentName:profile.displayName||profile.email,createdAt:serverTimestamp(),updatedAt:serverTimestamp(),status:form.status||'SUBMITTED'}
   if(id==='cleaning' && form.rotation && form.room){const code=ROTATION[form.rotation]?.[form.room]; if(code && form.task && !form.task.startsWith(code)) throw new Error(`Jadual rotation ${form.rotation} menetapkan ${form.room} kepada ${code}.`)}
   if(id==='collection' && Number(form.amount||0)!==5) throw new Error('Kutipan bulanan standard ialah RM5 seorang. Admin boleh merekod pelarasan berasingan.')
   if(id==='merit' && !isAdmin) throw new Error('Hanya Admin boleh merekod merit atau demerit.')
   await addDoc(collection(db,coll),data);setForm({});setShowForm(false);setNotice?.('Rekod berjaya disimpan.')
  }catch(e){setError(e.message||'Gagal menyimpan rekod.')}finally{setBusy(false)}
 }
 const verify = async (r,status) => {if(!isAdmin)return; try{await updateDoc(doc(db,coll,r.id),{status,verifiedBy:user.uid,verifiedByEmail:profile.email,verifiedAt:serverTimestamp(),updatedAt:serverTimestamp()});}catch(e){setError(e.message)}}
 const gpsVerify = () => {
  if(!navigator.geolocation){setError('Pelayar ini tidak menyokong GPS.');return}
  setBusy(true);setError('')
  navigator.geolocation.getCurrentPosition(async pos=>{
   const lat=pos.coords.latitude,lon=pos.coords.longitude,accuracy=pos.coords.accuracy
   const rad=x=>x*Math.PI/180, dLat=rad(lat-3.1516121),dLon=rad(lon-101.7471753)
   const a=Math.sin(dLat/2)**2+Math.cos(rad(3.1516121))*Math.cos(rad(lat))*Math.sin(dLon/2)**2
   const distance=6371000*2*Math.atan2(Math.sqrt(a),Math.sqrt(1-a))
   try{await addDoc(collection(db,'hostel_geofence'),{ownerUid:user.uid,ownerEmail:profile.email,studentName:profile.displayName||profile.email,latitude:lat,longitude:lon,accuracy,distanceMetres:Math.round(distance),status:distance<=100&&accuracy<=50?'GPS CHECK – WITHIN 100M':'PENDING WARDEN REVIEW',createdAt:serverTimestamp(),updatedAt:serverTimestamp()});setNotice?.(distance<=100&&accuracy<=50?'Bacaan GPS berada dalam lingkungan 100m. Rekod dihantar untuk pengesahan.':'Lokasi belum memenuhi syarat pengesahan. Admin perlu menyemak.')}catch(e){setError(e.message)}finally{setBusy(false)}
  },e=>{setError(`GPS tidak dapat dibaca: ${e.message}`);setBusy(false)},{enableHighAccuracy:true,timeout:15000,maximumAge:0})
 }
 const heading = BASE[id] || id
 return <div className="space-y-4">
  <section className="card">
   <div className="flex flex-wrap items-center justify-between gap-3"><div><h3 className="section-title">{heading}</h3><p className="muted mt-1">{isAdmin?'Paparan pengurusan dan rekod semua penghuni.':'Rekod anda dan tindakan yang dibenarkan.'}</p></div><div className="flex gap-2">{id==='geofence'&&<button className="btn-secondary" disabled={busy} onClick={gpsVerify}><MapPin size={16}/> Semak GPS saya</button>}{fields.length>0&&<button className="btn-primary" onClick={()=>setShowForm(!showForm)}><Plus size={16}/> Rekod baharu</button>}</div></div>
   {id==='geofence'&&<p className="mt-3 rounded-xl bg-amber-50 p-3 text-sm text-amber-800">Rujukan hostel: 3.1516121, 101.7471753 · radius 100m. GPS hanya dibaca apabila anda menekan butang. Bacaan peranti bukan pengesahan backend; status akhir memerlukan semakan Admin/Warden. Tiada penjejakan latar belakang.</p>}
   {id==='daily-status'&&<p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm text-slate-600">Curfew hostel ialah 10.00 malam. Aplikasi web tidak boleh mendapatkan GPS telefon secara automatik jika pelayar ditutup. Status tanpa bacaan GPS baharu tidak akan dianggap sebagai lokasi semasa.</p>}
   {id==='cleaning'&&<div className="mt-3 rounded-xl bg-slate-50 p-3 text-sm"><b>Jadual rasmi:</b> Setiap Rabu, 6.00 petang. Alpha: Room 1=T1, Room 2=T2, Room 3=T3. Beta: Room 3=T1, Room 1=T2, Room 2=T3. Charlie: Room 2=T1, Room 3=T2, Room 1=T3. Minggu keempat ulang Alpha.</div>}
   {id==='collection'&&<p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">Kutipan standard RM5 seorang sebulan. Sasaran 16 penghuni ialah RM80 sebulan.</p>}
   {id==='bills'&&<p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">Subsidi rujukan: RM150 elektrik dan RM150 air bagi setiap hostel. Lebihan hendaklah diagih mengikut bahagian penghuni sebenar; pengecualian bilik tanpa penghawa dingin perlu direkodkan. Jangan anggap agihan sama rata tanpa konfigurasi.</p>}
   {id==='merit'&&<p className="mt-3 rounded-xl bg-slate-50 p-3 text-sm">Cadangan aplikasi: permulaan 100 mata setiap bulan; Light −5, Moderate −15, Heavy −30. Bonus positif perlu disahkan Admin. Nilai ini cadangan sistem, bukan kadar hukuman rasmi kolej.</p>}
   {id==='sos'&&<p className="mt-3 rounded-xl bg-red-50 p-3 text-sm text-red-800">Untuk kecemasan sebenar, hubungi 999. Butang ini merekodkan permintaan bantuan dalam aplikasi dan bukan pengganti talian kecemasan.</p>}
   {id==='rules'&&<div className="mt-3 space-y-2 text-sm"><p><b>Perkara utama:</b> Curfew 10.00 malam; keluar asrama dalam waktu latihan 9.00 pagi–4.30 petang memerlukan kebenaran; jaga kebersihan, keselamatan, harta benda dan ketenteraman; pelawat bukan penghuni tidak dibenarkan.</p><p className="text-slate-500">Rujuk dokumen rasmi “Peraturan-Peraturan dan Undang-Undang Asrama (Edisi 3, 2025)” untuk teks penuh, tindakan disiplin dan hak rayuan. Ringkasan ini bukan pengganti dokumen rasmi.</p></div>}
   {error&&<p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-700">{error}</p>}
   {showForm&&<form onSubmit={submit} className="mt-4 grid gap-3 rounded-xl border border-slate-200 p-4 md:grid-cols-2">
    {fields.map(([key,label,type,opts])=><label key={key} className={`block text-sm font-medium ${type==='textarea'?'md:col-span-2':''}`}>{label}{type==='select'?<select className="field mt-1" required value={form[key]||''} onChange={e=>setForm({...form,[key]:e.target.value})}><option value="">Pilih…</option>{opts.map(x=><option key={x}>{x}</option>)}</select>:type==='textarea'?<textarea className="field mt-1" rows="3" value={form[key]||''} onChange={e=>setForm({...form,[key]:e.target.value})}/>:<input className="field mt-1" required={['date','month','datetime-local'].includes(type)} type={type} min={type==='number'?0:undefined} step={type==='number'?'0.01':undefined} value={form[key]||''} onChange={e=>setForm({...form,[key]:e.target.value})}/>}</label>)}
    <div className="flex gap-2 md:col-span-2"><button className="btn-primary" disabled={busy}><Save size={16}/> {busy?'Menyimpan…':'Simpan rekod'}</button><button type="button" className="btn-secondary" onClick={()=>setShowForm(false)}>Batal</button></div>
   </form>}
  </section>
  {id==='cleaning'&&<section className="card"><h4 className="font-bold text-navy">Panduan tugasan</h4><p className="mt-2 text-sm text-slate-600">Semua penghuni bilik yang ditetapkan bertanggungjawab menyelesaikan tugasan. Rekod boleh dihantar oleh wakil bilik dan disahkan Admin.</p></section>}
  <section className="card"><div className="flex items-center justify-between"><h4 className="font-bold text-navy">{isAdmin?'Semua rekod':'Rekod saya'} ({rows.length})</h4><span className="text-xs text-slate-400">Live Firestore</span></div>
   {!rows.length?<p className="mt-4 text-sm text-slate-500">Belum ada rekod.</p>:<div className="mt-3 space-y-3">{rows.map(r=><article key={r.id} className="rounded-xl border border-slate-200 p-4"><div className="flex flex-wrap items-start justify-between gap-2"><div><p className="font-semibold text-navy">{r.title||r.className||r.destination||r.studentName||r.task||r.ruleTitle||r.emergencyType||heading}</p><p className="mt-1 text-xs text-slate-500">{r.studentName||r.ownerEmail} · {fmt(r.createdAt)}</p></div><span className="rounded-full bg-slate-100 px-2 py-1 text-xs">{r.status||r.attendanceStatus||r.paymentStatus||'SUBMITTED'}</span></div><div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">{Object.entries(r).filter(([k,v])=>!['id','ownerUid','ownerEmail','studentName','createdAt','updatedAt','verifiedBy','verifiedByEmail','verifiedAt','status'].includes(k)&&v!==''&&v!==null&&typeof v!=='object').slice(0,8).map(([k,v])=><p key={k}><span className="text-slate-500">{k.replace(/([A-Z])/g,' $1')}: </span>{clean(v)}</p>)}</div>{isAdmin&&r.status!=='VERIFIED'&&r.status!=='APPROVED'&&<div className="mt-3 flex flex-wrap gap-2"><button className="btn-primary" onClick={()=>verify(r,'VERIFIED')}><CheckCircle2 size={15}/> Sahkan</button><button className="btn-secondary" onClick={()=>verify(r,'REJECTED')}>Tolak</button></div>}</article>)}</div>}
  </section>
 </div>
}
