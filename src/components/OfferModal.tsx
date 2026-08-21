import { useState, useEffect } from 'react';
import { X, Download, Loader2, Eye } from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface OfferModalProps {
  lead: any;
  tariff: any;
  logoUrl?: string;
  onClose: () => void;
}

const DEFAULT_LOGO = 'https://hlektrismos.gr/logo.png';
const FALLBACK_HTML = `<!DOCTYPE html>
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
    <img src="{{logo_url}}" class="logo" alt="Hlektrismos.gr" />
    <div class="company-info">
      <strong>Hlektrismos.gr</strong><br>
      Μαύρη Πέτρα 27, 10435 Αθήνα<br>
      210 9750816 | info@hlektrismos.gr
    </div>
  </div>

  <h1>Προσφορά Ηλεκτροδότησης</h1>
  <p>Αγαπητέ/ή <strong>{{customer_name}}</strong>,</p>
  <p>με βάση την κατανάλωσή σας (<strong>{{monthly_kwh}} kWh/μήνα</strong>), σας προτείνουμε το παρακάτω πρόγραμμα:</p>

  <table class="tariff-table">
    <tr><th>Πάροχος</th><td>{{provider_name}}</td></tr>
    <tr><th>Πρόγραμμα</th><td>{{tariff_name}}</td></tr>
    <tr><th>Τιμή / kWh (Ημέρα)</th><td>{{price_kwh}} €</td></tr>
    <tr><th>Τιμή / kWh (Νύχτα)</th><td>{{price_night}} €</td></tr>
    <tr><th>Μηνιαίο Πάγιο</th><td>{{monthly_fixed_fee}} €</td></tr>
    <tr><th>Έκπτωση</th><td>{{discount_conditions}}</td></tr>
    <tr><th>Εκτιμώμενο Μηνιαίο Κόστος</th><td><strong>{{monthly_estimate}} €</strong></td></tr>
    <tr><th>Εκτιμώμενο Ετήσιο Κόστος</th><td><strong>{{yearly_estimate}} €</strong></td></tr>
  </table>

  {{#if savings_amount}}
  <div class="highlight">
    <p>Το τρέχον πρόγραμμά σας ({{current_provider}}) κοστίζει περίπου <strong>{{current_monthly_cost}} €/μήνα</strong>.</p>
    <p>Με το νέο πρόγραμμα θα εξοικονομείτε:</p>
    <div class="savings">€{{savings_amount}} / μήνα (€{{savings_yearly}} / χρόνο)</div>
  </div>
  {{/if}}

  <p>Θα χαρούμε να σας βοηθήσουμε να ολοκληρώσετε την αλλαγή παρόχου. Επικοινωνήστε μαζί μας:</p>
  <p>📞 210 9750816 | 📧 info@hlektrismos.gr</p>

  <div class="footer">
    <p>Με εκτίμηση,<br><strong>Η Ομάδα Hlektrismos.gr</strong></p>
    <p class="legal">Αυτή η προσφορά είναι ενδεικτική και ισχύει για νέους πελάτες. Οι τιμές μπορεί να διαφέρουν ανάλογα με την ακριβή κατανάλωση και τις συνθήκες σύμβασης.</p>
  </div>
</body>
</html>`;

export default function OfferModal({ lead, tariff, logoUrl, onClose }: OfferModalProps) {
  const [template, setTemplate] = useState<string>(FALLBACK_HTML);
  const [isGenerating, setIsGenerating] = useState(false);
  const [loadingTemplate, setLoadingTemplate] = useState(true);

  const monthlyKwh = lead?.monthly_kwh || lead?.consumption_kwh || 300;
  const unitRate = tariff?.base_price_day || tariff?.unit_rate_kwh || 0;
  const fixedFee = tariff?.fixed_fee_monthly || 0;
  const discountedRate = tariff?.discounted_price_day || null;
  const effectiveRate = discountedRate || unitRate;
  const estimatedMonthly = (monthlyKwh * effectiveRate) + fixedFee;
  const estimatedYearly = estimatedMonthly * 12;
  const currentCost = lead?.unit_rate_kwh ? (monthlyKwh * lead.unit_rate_kwh) : null;
  const savingsMonthly = currentCost ? Math.max(0, currentCost - estimatedMonthly) : 0;
  const savingsYearly = savingsMonthly * 12;

  useEffect(() => {
    const fetchTemplate = async () => {
      try {
        const customerType = tariff?.customer_type || 'B2C';
        const { data } = await supabase
          .from('document_templates')
          .select('html_content')
          .eq('template_type', 'offer')
          .eq('customer_type', customerType)
          .eq('is_default', true)
          .single();

        if (data?.html_content) {
          setTemplate(data.html_content);
        }
      } catch (err) {
        console.warn('Failed to load template, using fallback:', err);
      }
      setLoadingTemplate(false);
    };
    fetchTemplate();
  }, [tariff?.customer_type]);

  const replacePlaceholders = (html: string): string => {
    return html
      .replace(/\{\{logo_url\}\}/g, logoUrl || DEFAULT_LOGO)
      .replace(/\{\{customer_name\}\}/g, `${lead?.first_name || ''} ${lead?.last_name || ''}`.trim() || 'Πελάτης')
      .replace(/\{\{company_name\}\}/g, lead?.company_name || lead?.company || '')
      .replace(/\{\{monthly_kwh\}\}/g, monthlyKwh.toString())
      .replace(/\{\{provider_name\}\}/g, tariff?.provider_name || '-')
      .replace(/\{\{tariff_name\}\}/g, tariff?.program_name || tariff?.tariff_name || '-')
      .replace(/\{\{price_kwh\}\}/g, unitRate.toFixed(4))
      .replace(/\{\{price_night\}\}/g, tariff?.base_price_night ? tariff.base_price_night.toFixed(4) : '—')
      .replace(/\{\{monthly_fixed_fee\}\}/g, fixedFee.toFixed(2))
      .replace(/\{\{discount_conditions\}\}/g, tariff?.discount_conditions || '—')
      .replace(/\{\{monthly_estimate\}\}/g, estimatedMonthly.toFixed(2))
      .replace(/\{\{yearly_estimate\}\}/g, estimatedYearly.toFixed(2))
      .replace(/\{\{current_provider\}\}/g, lead?.current_provider || 'Άγνωστος')
      .replace(/\{\{current_monthly_cost\}\}/g, currentCost?.toFixed(2) || '—')
      .replace(/\{\{savings_amount\}\}/g, savingsMonthly > 0 ? savingsMonthly.toFixed(2) : '')
      .replace(/\{\{savings_yearly\}\}/g, savingsYearly > 0 ? savingsYearly.toFixed(2) : '')
      .replace(/\{\{#if savings_amount\}\}/g, savingsMonthly > 0 ? '' : '<!--')
      .replace(/\{\{\/if\}\}/g, savingsMonthly > 0 ? '' : '-->');
  };

  const getProcessedHtml = () => replacePlaceholders(template);

  const handleDownloadPDF = () => {
    const container = document.getElementById('printable-offer');
    if (!container) return;

    const printWindow = window.open('', '_blank', 'width=800,height=1000');
    if (!printWindow) {
      alert('Αποκλείστηκε το popup. Επιτρέψτε τα popup για αυτόν τον ιστότοπο.');
      return;
    }

    printWindow.document.write(`<!DOCTYPE html>
      <html><head>
        <title>Προσφορά - ${lead?.first_name || ''} ${lead?.last_name || ''}</title>
        <style>@media print { body { margin: 0; } }</style>
      </head><body>${container.innerHTML}</body></html>`);
    printWindow.document.close();
    setTimeout(() => { printWindow.print(); }, 500);
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
            <span style={{ fontSize: 11, color: '#6b7280', padding: '2px 8px', background: '#f3f4f6', borderRadius: 4 }}>
              {tariff?.customer_type === 'B2B' ? 'B2B' : 'B2C'}
            </span>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              onClick={handleDownloadPDF}
              disabled={isGenerating || loadingTemplate}
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
          {loadingTemplate ? (
            <div style={{ display: 'flex', justifyContent: 'center', padding: 40 }}>
              <Loader2 size={24} style={{ animation: 'spin 1s linear infinite', color: '#0ea5e9' }} />
            </div>
          ) : (
            <div
              id="printable-offer"
              style={{
                background: '#fff', maxWidth: 700, margin: '0 auto', padding: '30px 40px',
                boxShadow: '0 1px 3px rgba(0,0,0,0.1)', borderRadius: 8,
              }}
              dangerouslySetInnerHTML={{ __html: getProcessedHtml() }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
