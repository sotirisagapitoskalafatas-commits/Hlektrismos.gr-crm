import { useState } from 'react';
import { X, Download, Loader2, Eye } from 'lucide-react';

interface OfferModalProps {
  lead: any;
  tariff: any;
  logoUrl?: string;
  onClose: () => void;
}

const DEFAULT_LOGO = 'https://hlektrismos.gr/logo.png';

export default function OfferModal({ lead, tariff, logoUrl, onClose }: OfferModalProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const [view, setView] = useState<'preview' | 'html'>('preview');

  const getMonthlyKwh = () => lead?.monthly_kwh || lead?.consumption_kwh || 300;
  const getUnitRate = () => tariff?.base_price_day || tariff?.unit_rate_kwh || 0;
  const getFixedFee = () => tariff?.fixed_fee_monthly || 0;
  const getDiscountedRate = () => tariff?.discounted_price_day || null;

  const monthlyKwh = getMonthlyKwh();
  const effectiveRate = getDiscountedRate() || getUnitRate();
  const fixedFee = getFixedFee();
  const estimatedMonthly = (monthlyKwh * effectiveRate) + fixedFee;
  const estimatedYearly = estimatedMonthly * 12;
  const currentCost = lead?.unit_rate_kwh ? (monthlyKwh * lead.unit_rate_kwh) : null;
  const savingsMonthly = currentCost ? Math.max(0, currentCost - estimatedMonthly) : 0;
  const savingsYearly = savingsMonthly * 12;

  const getProcessedHtml = () => {
    const html = `<!DOCTYPE html>
<html lang="el">
<head>
<meta charset="UTF-8">
<style>
  body { font-family: Arial, Helvetica, sans-serif; line-height: 1.6; color: #1f2937; margin: 0; padding: 30px; background: #fff; }
  .header { display: flex; justify-content: space-between; align-items: center; border-bottom: 3px solid #0ea5e9; padding-bottom: 20px; margin-bottom: 30px; }
  .logo { max-width: 180px; height: auto; }
  .company-info { text-align: right; font-size: 12px; color: #6b7280; }
  h1 { color: #0ea5e9; font-size: 22px; margin-bottom: 8px; }
  .tariff-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
  .tariff-table th, .tariff-table td { border: 1px solid #e5e7eb; padding: 12px 16px; text-align: left; font-size: 14px; }
  .tariff-table th { background-color: #f0f9ff; color: #0369a1; font-weight: 600; width: 40%; }
  .highlight { background: linear-gradient(135deg, #ecfdf5, #f0fdf4); padding: 16px; border-radius: 8px; border: 1px solid #bbf7d0; margin: 20px 0; }
  .savings { font-size: 24px; font-weight: 700; color: #059669; }
  .footer { margin-top: 40px; padding-top: 20px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; text-align: center; }
  .legal { font-size: 10px; color: #9ca3af; margin-top: 20px; }
</style>
</head>
<body>
  <div class="header">
    <img src="${logoUrl || DEFAULT_LOGO}" class="logo" alt="Hlektrismos.gr" />
    <div class="company-info">
      <strong>Hlektrismos.gr</strong><br>
      Αθηνάς 123, 10435 Αθήνα<br>
      210 123 4567 | info@hlektrismos.gr
    </div>
  </div>

  <h1>${tariff?.customer_type === 'B2B' ? 'Επαγγελματική Προσφορά' : 'Προσφορά Ηλεκτροδότησης'}</h1>
  <p>${tariff?.customer_type === 'B2B' ? 'Αξιότιμε κύριε/κυρία,' : `Αγαπητέ/ή <strong>${lead?.first_name || ''} ${lead?.last_name || ''}</strong>,`}</p>
  ${tariff?.customer_type === 'B2B' && lead?.company_name ? `<p>Η εταιρεία <strong>${lead.company_name}</strong> με κατανάλωση <strong>${monthlyKwh} kWh/μήνα</strong>:</p>` : ''}
  <p>με βάση την κατανάλωσή σας (<strong>${monthlyKwh} kWh/μήνα</strong>), σας προτείνουμε:</p>

  <table class="tariff-table">
    <tr><th>Πάροχος</th><td>${tariff?.provider_name || '-'}</td></tr>
    <tr><th>Πρόγραμμα</th><td>${tariff?.program_name || '-'}</td></tr>
    <tr><th>Τιμή / kWh (Ημέρα)</th><td>€${getUnitRate().toFixed(4)}</td></tr>
    ${tariff?.base_price_night ? `<tr><th>Τιμή / kWh (Νύχτα)</th><td>€${tariff.base_price_night.toFixed(4)}</td></tr>` : ''}
    <tr><th>Μηνιαίο Πάγιο</th><td>€${fixedFee.toFixed(2)}</td></tr>
    ${tariff?.discounted_price_day ? `<tr><th>Έκπτωση</th><td>€${tariff.discounted_price_day.toFixed(4)}/kWh</td></tr>` : ''}
    ${tariff?.discount_conditions ? `<tr><th>Συνθήκες Έκπτωσης</th><td>${tariff.discount_conditions}</td></tr>` : ''}
    <tr><th>Εκτιμώμενο Μηνιαίο Κόστος</th><td><strong>€${estimatedMonthly.toFixed(2)}</strong></td></tr>
    <tr><th>Εκτιμώμενο Ετήσιο Κόστος</th><td><strong>€${estimatedYearly.toFixed(2)}</strong></td></tr>
  </table>

  ${savingsMonthly > 0 ? `
  <div class="highlight">
    <p>Το τρέχον πρόγραμμά σας (${lead?.current_provider || 'Άγνωστος'}) κοστίζει περίπου <strong>€${currentCost?.toFixed(2) || '-'}/μήνα</strong>.</p>
    <p>Με το νέο πρόγραμμα θα εξοικονομείτε:</p>
    <div class="savings">€${savingsMonthly.toFixed(2)} / μήνα (€${savingsYearly.toFixed(2)} / χρόνο)</div>
  </div>
  ` : ''}

  <p>Θα χαρούμε να σας βοηθήσουμε να ολοκληρώσετε την αλλαγή παρόχου. Επικοινωνήστε μαζί μας:</p>
  <p>📞 210 123 4567 | 📧 info@hlektrismos.gr</p>

  <div class="footer">
    <p>Με εκτίμηση,<br><strong>Η Ομάδα Hlektrismos.gr</strong></p>
    <p class="legal">Αυτή η προσφορά είναι ενδεικτική και ισχύει για νέους πελάτες. Οι τιμές μπορεί να διαφέρουν ανάλογα με την ακριβή κατανάλωση και τις συνθήκες σύμβασης.</p>
  </div>
</body>
</html>`;
    return html;
  };

  const handleDownloadPDF = () => {
    const container = document.getElementById('printable-offer');
    if (!container) return;

    const printWindow = window.open('', '_blank', 'width=800,height=1000');
    if (!printWindow) {
      alert('Αποκλείστηκε το popup. Επιτρέψτε τα popup για αυτόν τον ιστότοπο.');
      return;
    }

    printWindow.document.write(`
      <!DOCTYPE html>
      <html><head>
        <title>Προσφορά - ${lead?.first_name || ''} ${lead?.last_name || ''}</title>
        <style>
          @media print { body { margin: 0; } }
        </style>
      </head><body>${container.innerHTML}</body></html>
    `);
    printWindow.document.close();
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };

  return (
    <div style={{
      position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex',
      alignItems: 'center', justifyContent: 'center', padding: 16, zIndex: 9999,
    }}>
      <div style={{
        background: '#fff', borderRadius: 12, width: '100%', maxWidth: 800,
        maxHeight: '90vh', display: 'flex', flexDirection: 'column', overflow: 'hidden',
        boxShadow: '0 25px 50px rgba(0,0,0,0.25)',
      }}>
        {/* Header */}
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '12px 20px', borderBottom: '1px solid #e5e7eb', background: '#f9fafb',
        }}>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <span style={{ fontSize: 14, fontWeight: 600, color: '#1f2937' }}>
              Προεπισκόπηση Προσφοράς
            </span>
            <div style={{ display: 'flex', gap: 4 }}>
              <button
                onClick={() => setView('preview')}
                style={{
                  padding: '4px 10px', borderRadius: 6, fontSize: 11, fontWeight: 600, border: 'none',
                  background: view === 'preview' ? '#0ea5e9' : '#e5e7eb', color: view === 'preview' ? '#fff' : '#6b7280',
                  cursor: 'pointer',
                }}
              >
                <Eye size={11} style={{ marginRight: 4, verticalAlign: 'middle' }} />Preview
              </button>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={handleDownloadPDF}
              disabled={isGenerating}
              style={{
                padding: '6px 16px', borderRadius: 8, border: 'none', fontSize: 12, fontWeight: 600,
                background: isGenerating ? '#e5e7eb' : '#0ea5e9', color: isGenerating ? '#9ca3af' : '#fff',
                cursor: isGenerating ? 'not-allowed' : 'pointer',
                display: 'flex', alignItems: 'center', gap: 6,
              }}
            >
              {isGenerating ? <Loader2 size={13} style={{ animation: 'spin 1s linear infinite' }} /> : <Download size={13} />}
              {isGenerating ? 'Δημιουργία...' : 'Λήψη PDF'}
            </button>
            <button
              onClick={onClose}
              style={{
                padding: '4px 8px', borderRadius: 6, border: 'none', background: 'transparent',
                cursor: 'pointer', color: '#6b7280', fontSize: 16,
              }}
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* Preview */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20, background: '#f3f4f6' }}>
          <div
            id="printable-offer"
            style={{
              background: '#fff', maxWidth: 700, margin: '0 auto', padding: '30px 40px',
              boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderRadius: 8,
            }}
            dangerouslySetInnerHTML={{ __html: getProcessedHtml() }}
          />
        </div>
      </div>
    </div>
  );
}
