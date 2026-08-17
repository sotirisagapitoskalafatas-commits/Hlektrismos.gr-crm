import { useState, useRef } from 'react'
import { Upload, Check, X, ArrowRight } from 'lucide-react'
import { supabase } from '@/lib/supabase'

export function BillUpload() {
  const [file,      setFile]      = useState<File|null>(null)
  const [name,      setName]      = useState('')
  const [phone,     setPhone]     = useState('')
  const [email,     setEmail]     = useState('')
  const [notes,     setNotes]     = useState('')
  const [dragging,  setDragging]  = useState(false)
  const [uploading, setUploading] = useState(false)
  const [done,      setDone]      = useState(false)
  const [error,     setError]     = useState('')
  const inputRef = useRef<HTMLInputElement>(null)

  const accept = (f: File) => {
    const ok = ['application/pdf','image/jpeg','image/png','image/heic'].includes(f.type) && f.size <= 8_388_608
    if (!ok) { setError('Επιτρέπεται PDF, JPG, PNG ή HEIC έως 8 MB.'); return false }
    return true
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!file) { setError('Επιλέξτε αρχείο.'); return }
    setUploading(true); setError('')
    const ext  = file.name.split('.').pop()?.toLowerCase() ?? 'file'
    const path = `${crypto.randomUUID()}.${ext}`
    const { error:upErr } = await supabase.storage
      .from('energy-bills').upload(path, file, { contentType:file.type, upsert:false })
    if (upErr) { setUploading(false); setError('Σφάλμα αποστολής. Δοκιμάστε ξανά.'); return }
    await supabase.from('hlektrismos_leads').insert({
      first_name: name.split(' ')[0]??name,
      last_name:  name.split(' ').slice(1).join(' ')||'-',
      phone, email: email||'not-provided@hlektrismos.local',
      region:'Δεν δηλώθηκε', customer_type:'Σπίτι', provider:'Ρεύμα',
      comments: notes||null, bill_file_path:path, bill_file_name:file.name, consent:true,
    })
    setUploading(false); setDone(true)
  }

  if (done) return (
    <div className="form-card success-state">
      <div className="success-icon"><Check size={28} /></div>
      <h3>Λάβαμε τον λογαριασμό σου!</h3>
      <p>Θα σου στείλουμε σύντομα λεπτομερή ανάλυση και πρόταση εξοικονόμησης.</p>
    </div>
  )

  return (
    <div className="form-card">
      <form onSubmit={handleSubmit}>
        <h3>Ανέβασε τον λογαριασμό σου</h3>
        <p className="form-sub">Drag & drop ή κλίκ. Δωρεάν ανάλυση χωρίς δέσμευση.</p>

        <div
          className={`bill-dropzone${dragging?' dragging':''}${file?' has-file':''}`}
          onDragOver={e=>{e.preventDefault();setDragging(true)}}
          onDragLeave={()=>setDragging(false)}
          onDrop={e=>{e.preventDefault();setDragging(false);const f=e.dataTransfer.files[0];if(f&&accept(f)){setFile(f);setError('')}}}
          onClick={()=>inputRef.current?.click()}
        >
          {file ? (
            <div className="bill-dropzone-file">
              <Check size={20} />
              <span>{file.name}</span>
              <button type="button" onClick={e=>{e.stopPropagation();setFile(null)}}><X size={16} /></button>
            </div>
          ) : (
            <>
              <Upload size={32} className="bill-dropzone-icon" />
              <p>Σύρε εδώ ή <strong>κλίκ για επιλογή</strong></p>
              <small>PDF · JPG · PNG · HEIC — έως 8 MB</small>
            </>
          )}
          <input ref={inputRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.heic" style={{display:'none'}}
            onChange={e=>{const f=e.target.files?.[0];if(f&&accept(f)){setFile(f);setError('')}}} />
        </div>

        <div className="form-grid" style={{marginTop:'1rem'}}>
          <div className="form-field full"><label>Ονοματεπώνυμο *</label><input required value={name} onChange={e=>setName(e.target.value)} placeholder="Γιάννης Παπαδόπουλος" /></div>
          <div className="form-field"><label>Τηλέφωνο *</label><input required type="tel" value={phone} onChange={e=>setPhone(e.target.value)} placeholder="+30 690 000 0000" /></div>
          <div className="form-field"><label>Email <span className="optional-label">(προαιρετικό)</span></label><input type="email" value={email} onChange={e=>setEmail(e.target.value)} /></div>
          <div className="form-field full"><label>Σχόλια <span className="optional-label">(προαιρετικά)</span></label><textarea rows={3} value={notes} onChange={e=>setNotes(e.target.value)} placeholder="Ό,τι θέλεις να γνωρίζουμε..." /></div>
        </div>
        {error && <p className="form-error">{error}</p>}
        <button className="btn btn-primary form-submit" type="submit" disabled={uploading||!file}>
          {uploading?'Αποστολή...':'Στείλε για ανάλυση'} <ArrowRight size={18} />
        </button>
      </form>
    </div>
  )
}
