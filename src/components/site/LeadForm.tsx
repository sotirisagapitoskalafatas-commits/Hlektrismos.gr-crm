import { useState, ChangeEvent, FormEvent } from 'react'
import { ArrowRight, Check, Upload } from 'lucide-react'
import { supabase } from '@/lib/supabase'

const REGIONS = [
  'Αττική','Θεσσαλονίκη','Κεντρική Μακεδονία','Δυτική Μακεδονία',
  'Ανατολική Μακεδονία & Θράκη','Ήπειρος','Θεσσαλία','Ιόνια Νησιά',
  'Δυτική Ελλάδα','Στερεά Ελλάδα','Πελοπόννησος','Νησιά Αιγαίου','Κρήτη','Βόρειο Αιγαίο',
]
const SERVICES = ['Ρεύμα','Φυσικό Αέριο','Φωτοβολταϊκά','Ηλεκτροκίνηση']

type F = { firstName:string; lastName:string; email:string; phone:string
           region:string; propertyType:string; service:string
           message:string; billFile:File|null; consent:boolean }

const EMPTY: F = { firstName:'',lastName:'',email:'',phone:'',region:'',
                   propertyType:'',service:'Ρεύμα',message:'',billFile:null,consent:false }

export function LeadForm() {
  const [form,       setForm]       = useState<F>(EMPTY)
  const [submitted,  setSubmitted]  = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const [error,      setError]      = useState('')

  const set = (k: keyof F, v: string|boolean|File|null) => setForm(c => ({ ...c, [k]:v }))

  const handleFile = (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0] ?? null
    if (!f) { set('billFile',null); return }
    if (!['application/pdf','image/jpeg','image/png'].includes(f.type) || f.size > 10_485_760) {
      setError('Ανεβάστε PDF, JPG ή PNG έως 10MB.')
      e.target.value = ''; set('billFile',null); return
    }
    setError(''); set('billFile',f)
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault(); setError(''); setSubmitting(true)
    let path: string|null = null
    if (form.billFile) {
      const ext = form.billFile.name.split('.').pop()?.toLowerCase() ?? 'file'
      path = `${crypto.randomUUID()}.${ext}`
      const { error:upErr } = await supabase.storage
        .from('energy-bills').upload(path, form.billFile, { contentType:form.billFile.type, upsert:false })
      if (upErr) { setSubmitting(false); setError('Σφάλμα κατά την αποστολή του αρχείου.'); return }
    }
    const { error:dbErr } = await supabase.from('powerfor_leads').insert({
      first_name:form.firstName, last_name:form.lastName,
      phone:form.phone, email:form.email||'not-provided@powerfor.local',
      region:form.region||'Δεν δηλώθηκε', customer_type:form.propertyType,
      provider:form.service, comments:form.message||null,
      bill_file_path:path, bill_file_name:form.billFile?.name??null, consent:form.consent,
    })
    setSubmitting(false)
    if (dbErr) { setError('Κάτι πήγε στραβά. Δοκιμάστε ξανά.'); return }
    setSubmitted(true); setForm(EMPTY)
  }

  if (submitted) return (
    <div className="form-card success-state">
      <div className="success-icon"><Check size={28} /></div>
      <h3>Αίτημα ελήφθη!</h3>
      <p>Ένας σύμβουλος θα επικοινωνήσει μαζί σου άμεσα.</p>
    </div>
  )

  return (
    <div className="form-card">
      <form onSubmit={handleSubmit}>
        <h3>Ζητήστε να σας καλέσουμε</h3>
        <p className="form-sub">Συμπλήρωσε τη φόρμα. 100% δωρεάν.</p>
        <div className="form-grid">
          <div className="form-field"><label>Όνομα *</label><input required value={form.firstName} onChange={e=>set('firstName',e.target.value)} placeholder="Γιάννης" /></div>
          <div className="form-field"><label>Επώνυμο *</label><input required value={form.lastName} onChange={e=>set('lastName',e.target.value)} placeholder="Παπαδόπουλος" /></div>
          <div className="form-field"><label>Email <span className="optional-label">(προαιρετικό)</span></label><input type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="giannis@email.gr" /></div>
          <div className="form-field"><label>Τηλέφωνο *</label><input required type="tel" value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="+30 690 000 0000" /></div>
          <div className="form-field">
            <label>Τύπος Ακινήτου *</label>
            <select required value={form.propertyType} onChange={e=>set('propertyType',e.target.value)}>
              <option value="" disabled>Επιλέξτε...</option>
              <option value="Σπίτι">Σπίτι</option>
              <option value="Επιχείρηση">Επιχείρηση</option>
            </select>
          </div>
          <div className="form-field">
            <label>Περιοχή <span className="optional-label">(προαιρετικό)</span></label>
            <select value={form.region} onChange={e=>set('region',e.target.value)}>
              <option value="">Επιλέξτε περιοχή...</option>
              {REGIONS.map(r=><option key={r} value={r}>{r}</option>)}
            </select>
          </div>
          <div className="form-field full">
            <label>Υπηρεσία ενδιαφέροντος</label>
            <select value={form.service} onChange={e=>set('service',e.target.value)}>
              {SERVICES.map(s=><option key={s} value={s}>{s}</option>)}
            </select>
          </div>
          <div className="form-field full"><label>Σχόλια <span className="optional-label">(προαιρετικά)</span></label><textarea value={form.message} onChange={e=>set('message',e.target.value)} placeholder="Πες μας τις ανάγκες σου..." /></div>
          <div className="form-field full">
            <label>Λογαριασμός ρεύματος <span className="optional-label">(προαιρετικό)</span></label>
            <label className="bill-upload">
              <Upload size={18} />
              <span>{form.billFile ? form.billFile.name : 'PDF, JPG ή PNG έως 10MB'}</span>
              <input type="file" accept="application/pdf,image/jpeg,image/png" onChange={handleFile} />
            </label>
          </div>
        </div>
        <div className="consent-row">
          <input required type="checkbox" id="consent" checked={form.consent} onChange={e=>set('consent',e.target.checked)} />
          <label htmlFor="consent">Συναινώ στην επεξεργασία των δεδομένων μου σύμφωνα με την πολιτική GDPR.</label>
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary form-submit" disabled={submitting}>
          {submitting?'Αποστολή...':'Ζητήστε κλήση'} <ArrowRight size={18} />
        </button>
      </form>
    </div>
  )
}
