import { useState } from 'react';
import { FileText, Download, Eye, Plus, Trash2, CheckCircle2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type DocTemplate = {
  id: string;
  name: string;
  type: 'proposal' | 'contract' | 'authorization' | 'offer' | 'letter' | 'custom';
  subject: string;
  body: string;
  footer: string;
  created_at: string;
};

const defaultTemplates: Omit<DocTemplate, 'id' | 'created_at'>[] = [
  {
    name: 'Προσφορά Ηλεκτροσίστησης',
    type: 'proposal',
    subject: 'Προσφορά Ηλεκτροσίστησης — Hlektrismos.gr',
    body: `<div class="doc-header">
  <div class="doc-logo">⚡ Hlektrismos.gr</div>
  <div class="doc-title">ΠΡΟΣΦΟΡΗ ΗΛΕΚΤΡΟΣΙΣΤΗΣΗΣ</div>
  <div class="doc-date">{{current_date}}</div>
</div>

<div class="doc-section">
  <h3>Α/Α Προσφοράς: {{offer_number}}</h3>
  <p><strong>Ημερομηνία Ισχύος:</strong> {{current_date}} — {{validity_date}}</p>
</div>

<div class="doc-section">
  <h3>Στοιχεία Πελάτη</h3>
  <table class="doc-table">
    <tr><td><strong>Επωνυμία:</strong></td><td>{{lead.first_name}} {{lead.last_name}}</td></tr>
    <tr><td><strong>Τηλέφωνο:</strong></td><td>{{lead.phone}}</td></tr>
    <tr><td><strong>Email:</strong></td><td>{{lead.email}}</td></tr>
    <tr><td><strong>Περιοχή:</strong></td><td>{{lead.region}}</td></tr>
    <tr><td><strong>Τύπος Πελάτη:</strong></td><td>{{lead.customer_type}}</td></tr>
  </table>
</div>

<div class="doc-section">
  <h3>Τιμολόγηση Ενέργειας</h3>
  <table class="doc-table">
    <tr><td><strong>Πάροχος:</strong></td><td>{{provider_name}}</td></tr>
    <tr><td><strong>Τιμολόγιο:</strong></td><td>{{tariff_name}}</td></tr>
    <tr><td><strong>Τιμή/kWh:</strong></td><td>{{price_kwh}} €/kWh</td></tr>
    <tr><td><strong>Μηνιαίο κόστος (εκτ.):</strong></td><td>{{monthly_estimate}} €</td></tr>
    <tr><td><strong>Ετήσιο κόστος (εκτ.):</strong></td><td>{{yearly_estimate}} €</td></tr>
  </table>
</div>

<div class="doc-section">
  <h3>Περιεχόμενα Προσφοράς</h3>
  <ul>
    <li>Μετάβαση σε νέο τιμολόγιο ενέργειας</li>
    <li>Δωρεάν σύνδεση / μεταγραφή από υπάρχοντα πάροχο</li>
    <li>Χωρίς κανένα κόστος μετάβασης</li>
    <li>Παρακολούθηση κατανάλωσης μέσω dashboard</li>
    <li>Υποστήριξη 24/7</li>
  </ul>
</div>

<div class="doc-section">
  <h3>Όροι & Προϋποθέσεις</h3>
  <p>Η παρούσα προσφορά ισχύει για {{validity_days}} ημέρες από την ημερομηνία έκδοσης. Η τιμολόγηση υπόκειται σε αλλαγές της ΡΕΓ (Ρυθμιστική Επιτροπή Ενέργειας).</p>
</div>`,
    footer: 'Hlektrismos.gr — Ηλεκτροενέργεια για όλους | ΑΦΜ: 000000000 | ΓΕΜΗ: 00000000000',
  },
  {
    name: 'Σύμβαση Εξυπηρέτησης',
    type: 'contract',
    subject: 'Σύμβαση Εξυπηρέτησης — Hlektrismos.gr',
    body: `<div class="doc-header">
  <div class="doc-logo">⚡ Hlektrismos.gr</div>
  <div class="doc-title">ΣΥΜΒΑΣΗ ΕΞΥΠΗΡΕΤΗΣΗΣ</div>
  <div class="doc-date">{{current_date}}</div>
</div>

<div class="doc-section">
  <h3>Στοιχεία Σύμβασης</h3>
  <table class="doc-table">
    <tr><td><strong>Α/Α Σύμβασης:</strong></td><td>{{contract_number}}</td></tr>
    <tr><td><strong>Ημερομηνία:</strong></td><td>{{current_date}}</td></tr>
  </table>
</div>

<div class="doc-section">
  <h3>Μέρος Α: Εταιρεία (Προμηθευτής)</h3>
  <table class="doc-table">
    <tr><td><strong>Επωνυμία:</strong></td><td>Hlektrismos.gr</td></tr>
    <tr><td><strong>ΑΦΜ:</strong></td><td>000000000</td></tr>
    <tr><td><strong>Έδρα:</strong></td><td>Οδός Παράδειγμα 123, Αθήνα</td></tr>
    <tr><td><strong>Τηλ:</strong></td><td>+30 210 000 0000</td></tr>
  </table>
</div>

<div class="doc-section">
  <h3>Μέρος Β: Πελάτης</h3>
  <table class="doc-table">
    <tr><td><strong>Ονοματεπώνυμο:</strong></td><td>{{lead.first_name}} {{lead.last_name}}</td></tr>
    <tr><td><strong>Τηλέφωνο:</strong></td><td>{{lead.phone}}</td></tr>
    <tr><td><strong>Email:</strong></td><td>{{lead.email}}</td></tr>
    <tr><td><strong>Περιοχή:</strong></td><td>{{lead.region}}</td></tr>
  </table>
</div>

<div class="doc-section">
  <h3>Άρθρο 1 — Αντικείμενο</h3>
  <p>Η εταιρεία παρέχει υπηρεσίες ηλεκτροσίστησης στον Πελάτη, συμπεριλαμβανομένης της παροχής ηλεκτρικής ενέργειας, παρακολούθησης κατανάλωσης και τεχνικής υποστήριξης.</p>
</div>

<div class="doc-section">
  <h3>Άρθρο 2 — Διάρκεια</h3>
  <p>Η σύμβαση ισχύει για περίοδο {{contract_duration}} μηνών από την ημερομηνία υπογραφής, με αυτόματη ανανέωση εκτός αν υπάρξει εγγραφή από οποιοδήποτε μέρος.</p>
</div>

<div class="doc-section">
  <h3>Άρθρο 3 — Τιμολόγηση</h3>
  <p>Ο Πελάτης τιμολογείται σύμφωνα με το τιμολόγιο: <strong>{{tariff_name}}</strong> με τιμή <strong>{{price_kwh}} €/kWh</strong>. Οι τιμές μπορούν να αλλάξουν σύμφωνα με τις αποφάσεις της ΡΕΓ.</p>
</div>

<div class="doc-section">
  <h3>Άρθρο 4 — Υπογραφές</h3>
  <div class="doc-signatures">
    <div class="doc-sig-block">
      <p>Ο Εκπρόσωπος της Εταιρείας</p>
      <div class="doc-sig-line"></div>
      <p class="doc-sig-label">Ημερομηνία: ___________</p>
    </div>
    <div class="doc-sig-block">
      <p>Ο Πελάτης</p>
      <div class="doc-sig-line"></div>
      <p class="doc-sig-label">Ημερομηνία: ___________</p>
    </div>
  </div>
</div>`,
    footer: 'Hlektrismos.gr — Ηλεκτροενέργεια για όλους | ΑΦΜ: 000000000 | ΓΕΜΗ: 00000000000',
  },
  {
    name: 'Εξουσιοδότηση Μεταγραφής',
    type: 'authorization',
    subject: 'Εξουσιοδότηση Μεταγραφής — Hlektrismos.gr',
    body: `<div class="doc-header">
  <div class="doc-logo">⚡ Hlektrismos.gr</div>
  <div class="doc-title">ΕΞΟΥΣΙΟΔΟΤΗΣΗ ΜΕΤΑΓΡΑΦΗΣ</div>
  <div class="doc-date">{{current_date}}</div>
</div>

<div class="doc-section">
  <h3>Α/Α: {{authorization_number}}</h3>
</div>

<div class="doc-section">
  <h3>Στοιχεία Πελάτη</h3>
  <table class="doc-table">
    <tr><td><strong>Ονοματεπώνυμο:</strong></td><td>{{lead.first_name}} {{lead.last_name}}</td></tr>
    <tr><td><strong>Τηλέφωνο:</strong></td><td>{{lead.phone}}</td></tr>
    <tr><td><strong>Email:</strong></td><td>{{lead.email}}</td></tr>
    <tr><td><strong>Περιοχή:</strong></td><td>{{lead.region}}</td></tr>
    <tr><td><strong>Αριθμός Πελάτη (DGM):</strong></td><td>{{customer_number}}</td></tr>
  </table>
</div>

<div class="doc-section">
  <h3>Στοιχεία Τρέχοντος Παρόχου</h3>
  <table class="doc-table">
    <tr><td><strong>Πάροχος:</strong></td><td>{{current_provider}}</td></tr>
  </table>
</div>

<div class="doc-section">
  <h3>Δήλωση</h3>
  <p>Ο/Η <strong>{{lead.first_name}} {{lead.last_name}}</strong>, με ΑΦΜ <strong>{{customer_afm}}</strong>, δηλώνει ότι:</p>
  <ul>
    <li>Εξουσιοδοτεί την εταιρεία <strong>Hlektrismos.gr</strong> να εκτελέσει τη μεταγραφή του λογαριασμού ηλεκτροσίστησης από τον υπάρχοντα πάροχο σε νέο πάροχο.</li>
    <li>Ο αριθμός πελάτη στο Δίκτυο Μεταφοράς Ελλάδος (ΔΜΕ) είναι: <strong>{{customer_number}}</strong>.</li>
    <li>Παραδέχεται ότι έχει λάβει γνώση των όρων και προϋποθέσεων του νέου τιμολογίου.</li>
  </ul>
</div>

<div class="doc-section">
  <h3>Υπογραφή</h3>
  <div class="doc-sig-block" style="max-width: 300px;">
    <div class="doc-sig-line"></div>
    <p class="doc-sig-label">Ονοματεπώνυμο & Υπογραφή</p>
    <p class="doc-sig-label">Ημερομηνία: ___________</p>
  </div>
</div>`,
    footer: 'Hlektrismos.gr — Ηλεκτροενέργεια για όλους | ΑΦΜ: 000000000 | ΓΕΜΗ: 00000000000',
  },
];

const typeLabels: Record<string, string> = {
  proposal: 'Προσφορά',
  contract: 'Σύμβαση',
  authorization: 'Εξουσιοδότηση',
  offer: 'Τιμολόγηση',
  letter: 'Επιστολή',
  custom: 'Προσαρμοσμένο',
};

const typeColors: Record<string, string> = {
  proposal: '#0066cc',
  contract: '#00c878',
  authorization: '#f59e0b',
  offer: '#9333ea',
  letter: '#6b7280',
  custom: '#1f2937',
};

const docStyles = `
  @page { size: A4; margin: 20mm 18mm 25mm 18mm; }
  .doc-header { text-align: center; border-bottom: 3px solid #0066cc; padding-bottom: 16px; margin-bottom: 24px; }
  .doc-logo { font-size: 22px; font-weight: 800; color: #0066cc; margin-bottom: 6px; }
  .doc-title { font-size: 18px; font-weight: 700; color: #1f2937; margin: 10px 0 4px; letter-spacing: 1px; }
  .doc-date { font-size: 12px; color: #6b7280; }
  .doc-section { margin-bottom: 18px; }
  .doc-section h3 { font-size: 13px; font-weight: 700; color: #0066cc; margin-bottom: 8px; border-bottom: 1px solid #e5e7eb; padding-bottom: 4px; }
  .doc-table { width: 100%; border-collapse: collapse; font-size: 12px; }
  .doc-table td { padding: 5px 8px; border-bottom: 1px solid #f3f4f6; vertical-align: top; }
  .doc-table td:first-child { width: 160px; color: #374151; }
  .doc-section ul { font-size: 12px; padding-left: 20px; }
  .doc-section ul li { margin-bottom: 4px; color: #374151; }
  .doc-section p { font-size: 12px; color: #374151; line-height: 1.6; }
  .doc-signatures { display: flex; justify-content: space-between; gap: 40px; margin-top: 24px; }
  .doc-sig-block { flex: 1; text-align: center; }
  .doc-sig-line { border-bottom: 1px solid #000; height: 40px; margin: 12px 0 8px; }
  .doc-sig-label { font-size: 11px; color: #6b7280; }
  .doc-footer { position: fixed; bottom: 0; left: 0; right: 0; text-align: center; font-size: 9px; color: #9ca3af; border-top: 1px solid #e5e7eb; padding: 8px 18mm; }
`;

export default function DocumentGenerator({ lead, toast, setToast }: {
  lead: any;
  toast: { msg: string; type: 'success' | 'info' } | null;
  setToast: (v: { msg: string; type: 'success' | 'info' } | null) => void;
}) {
  const [templates, setTemplates] = useState<DocTemplate[]>(() =>
    defaultTemplates.map((t, i) => ({
      ...t,
      id: `default-${i}`,
      created_at: new Date().toISOString(),
    }))
  );
  const [selectedTemplate, setSelectedTemplate] = useState<DocTemplate | null>(null);
  const [showPreview, setShowPreview] = useState(false);
  const [customFields, setCustomFields] = useState<Record<string, string>>({});

  const fillTemplate = (template: DocTemplate): string => {
    const now = new Date();
    const validityDate = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
    const replacements: Record<string, string> = {
      '{{current_date}}': now.toLocaleDateString('el-GR'),
      '{{validity_date}}': validityDate.toLocaleDateString('el-GR'),
      '{{validity_days}}': '30',
      '{{offer_number}}': `OFF-${now.getFullYear()}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`,
      '{{contract_number}}': `CON-${now.getFullYear()}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`,
      '{{authorization_number}}': `AUTH-${now.getFullYear()}-${String(Math.floor(Math.random() * 9999)).padStart(4, '0')}`,
      '{{lead.first_name}}': lead?.first_name || '',
      '{{lead.last_name}}': lead?.last_name || '',
      '{{lead.phone}}': lead?.phone || '',
      '{{lead.email}}': lead?.email || '',
      '{{lead.region}}': lead?.region || '',
      '{{lead.customer_type}}': lead?.customer_type || '',
      '{{provider_name}}': customFields['provider_name'] || 'ΔΕΗ',
      '{{tariff_name}}': customFields['tariff_name'] || 'Residential Standard',
      '{{price_kwh}}': customFields['price_kwh'] || '0.15',
      '{{monthly_estimate}}': customFields['monthly_estimate'] || '85',
      '{{yearly_estimate}}': customFields['yearly_estimate'] || '1020',
      '{{contract_duration}}': customFields['contract_duration'] || '12',
      '{{customer_number}}': customFields['customer_number'] || '',
      '{{current_provider}}': customFields['current_provider'] || '',
      '{{customer_afm}}': customFields['customer_afm'] || '',
    };

    let result = template.body;
    for (const [key, value] of Object.entries(replacements)) {
      result = result.replace(new RegExp(key.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
    return result;
  };

  const handlePrint = (template: DocTemplate) => {
    const filledBody = fillTemplate(template);
    const printWindow = window.open('', '_blank');
    if (!printWindow) {
      setToast({ msg: 'Αποκλείστηκε το popup. Επιτρέψτε popups.', type: 'info' });
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html lang="el">
      <head>
        <meta charset="UTF-8">
        <title>${template.subject}</title>
        <style>
          body { font-family: 'Segoe UI', system-ui, -apple-system, sans-serif; margin: 0; padding: 20mm 18mm 25mm 18mm; color: #1f2937; font-size: 12px; line-height: 1.5; }
          ${docStyles}
        </style>
      </head>
      <body>
        ${filledBody}
        <div class="doc-footer">${template.footer}</div>
        <script>
          window.onload = function() { window.print(); }
        <\/script>
      </body>
      </html>
    `);
    printWindow.document.close();
    setToast({ msg: `Αρχείο ${template.name} δημιουργήθηκε!`, type: 'success' });
  };

  const handleDownloadPdf = (template: DocTemplate) => {
    const filledBody = fillTemplate(template);
    const html = `<!DOCTYPE html>
      <html lang="el">
      <head>
        <meta charset="UTF-8">
        <title>${template.subject}</title>
        <style>
          body { font-family: 'Segoe UI', system-ui, sans-serif; margin: 0; padding: 20mm 18mm 25mm 18mm; color: #1f2937; font-size: 12px; line-height: 1.5; }
          ${docStyles}
        </style>
      </head>
      <body>
        ${filledBody}
        <div class="doc-footer">${template.footer}</div>
      </body>
      </html>`;
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${template.name.replace(/\s+/g, '_')}_${lead?.first_name || 'doc'}.html`;
    link.click();
    URL.revokeObjectURL(url);
    setToast({ msg: `HTML αρχείο κατέβηκε. Χρησιμοποιήστε Ctrl+P → Save as PDF.`, type: 'success' });
  };

  return (
    <div className="dash-content">
      <div className="dash-content-header">
        <p>Δημιουργία εγγράφων: προσφορές, συμβάσεις, εξουσιοδοτήσεις — με αυτόματη συμπλήρωση στοιχείων πελάτη.</p>
      </div>

      {lead && (
        <div style={{ background: 'rgba(0,102,204,0.06)', border: '1px solid rgba(0,102,204,0.15)', borderRadius: '12px', padding: '16px', marginBottom: '20px' }}>
          <strong style={{ fontSize: '13px' }}>Πελάτης:</strong> <span style={{ fontSize: '13px' }}>{lead.first_name} {lead.last_name} — {lead.email} — {lead.phone} — {lead.region}</span>
        </div>
      )}

      {Object.keys(customFields).length > 0 && (
        <div className="scraper-config" style={{ marginBottom: '20px' }}>
          <h3>Προσαρμοσμένα Πεδία</h3>
          <div className="scraper-config-grid">
            {Object.entries(customFields).map(([key, val]) => (
              <div className="drawer-field" key={key}>
                <label>{key.replace(/_/g, ' ')}</label>
                <input type="text" value={val} onChange={(e) => setCustomFields({ ...customFields, [key]: e.target.value })} />
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '16px' }}>
        {templates.map((template) => (
          <div key={template.id} style={{
            background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: '14px',
            padding: '20px', transition: 'all 0.2s',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '12px' }}>
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: `${typeColors[template.type]}15`, color: typeColors[template.type],
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
                <FileText size={18} />
              </div>
              <div>
                <strong style={{ fontSize: '14px', color: 'var(--text)' }}>{template.name}</strong>
                <div style={{ fontSize: '11px', color: typeColors[template.type], fontWeight: 600 }}>{typeLabels[template.type]}</div>
              </div>
            </div>
            <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '14px', lineHeight: 1.5 }}>
              {template.subject}
            </p>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button className="btn btn-secondary" style={{ flex: 1, fontSize: '12px' }} onClick={() => handleDownloadPdf(template)}>
                <Download size={14} /> PDF
              </button>
              <button className="btn btn-primary" style={{ flex: 1, fontSize: '12px' }} onClick={() => handlePrint(template)}>
                <Eye size={14} /> Εκτύπωση
              </button>
            </div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: '24px' }}>
        <h3 style={{ fontSize: '14px', marginBottom: '10px' }}>Προσαρμογή Πεδίων</h3>
        <p style={{ fontSize: '12px', color: 'var(--text-muted)', marginBottom: '12px' }}>
          Προσθέστε ειδικά πεδία για τα έγγραφα (π.χ. τιμή/kWh, αριθμός πελάτη, πάροχος). Τα πεδία γεμίζουν αυτόματα στα templates.
        </p>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          {['provider_name', 'tariff_name', 'price_kwh', 'monthly_estimate', 'yearly_estimate', 'contract_duration', 'customer_number', 'current_provider', 'customer_afm'].map(field => (
            <button
              key={field}
              onClick={() => setCustomFields(prev => ({ ...prev, [field]: prev[field] || '' }))}
              style={{
                padding: '6px 12px', borderRadius: '8px', fontSize: '11px', fontWeight: 500,
                border: '1px solid var(--border)', background: customFields[field] !== undefined ? 'rgba(0,102,204,0.08)' : 'var(--surface)',
                color: 'var(--text)', cursor: 'pointer',
              }}
            >
              {customFields[field] !== undefined ? '✓ ' : '+ '}{field.replace(/_/g, ' ')}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
