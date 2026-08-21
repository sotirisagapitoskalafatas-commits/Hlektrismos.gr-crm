import { useState } from 'react';
import { Code, Eye, Plus, Save, X } from 'lucide-react';

interface Props {
  template: any;
  onSave: (updatedHtml: string) => void;
  onClose: () => void;
}

const AVAILABLE_TAGS = [
  { label: 'Customer Name', tag: '{{customer_name}}' },
  { label: 'AFM', tag: '{{customer_afm}}' },
  { label: 'Email', tag: '{{customer_email}}' },
  { label: 'Phone', tag: '{{customer_phone}}' },
  { label: 'Address', tag: '{{customer_address}}' },
  { label: 'Supply Number', tag: '{{customer_number}}' },
  { label: 'Provider', tag: '{{provider_name}}' },
  { label: 'Tariff Name', tag: '{{tariff_name}}' },
  { label: 'Price/kWh Day', tag: '{{price_kwh}}' },
  { label: 'Price/kWh Night', tag: '{{price_night}}' },
  { label: 'Monthly kWh', tag: '{{monthly_kwh}}' },
  { label: 'Monthly Fixed Fee', tag: '{{monthly_fixed_fee}}' },
  { label: 'Monthly Estimate', tag: '{{monthly_estimate}}' },
  { label: 'Yearly Estimate', tag: '{{yearly_estimate}}' },
  { label: 'Savings/Month', tag: '{{savings_amount}}' },
  { label: 'Savings/Year', tag: '{{savings_yearly}}' },
  { label: 'Current Provider', tag: '{{current_provider}}' },
  { label: 'Current Cost', tag: '{{current_monthly_cost}}' },
  { label: 'Discount', tag: '{{discount_conditions}}' },
  { label: 'Contract Duration', tag: '{{contract_duration}}' },
  { label: 'Logo URL', tag: '{{logo_url}}' },
  { label: 'Custom Note', tag: '{{custom_note}}' },
  { label: 'Date', tag: '{{date}}' },
];

export default function DocumentTemplateEditor({ template, onSave, onClose }: Props) {
  const [htmlContent, setHtmlContent] = useState(template?.html_content || '');
  const [mode, setMode] = useState<'visual' | 'code'>('visual');
  const [copiedTag, setCopiedTag] = useState<string | null>(null);

  const insertTag = (tag: string) => {
    setHtmlContent(prev => prev + ` ${tag} `);
    setCopiedTag(tag);
    setTimeout(() => setCopiedTag(null), 1200);
  };

  const isTagInUse = (tag: string) => htmlContent.includes(tag);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 20 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', paddingBottom: 14, borderBottom: '1px solid var(--border)' }}>
        <div>
          <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{template?.name || 'Edit Template'}</h3>
          <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--text-muted)' }}>Customize the PDF template fields and layout</p>
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <span style={{ padding: '2px 10px', borderRadius: 20, fontSize: 10, fontWeight: 700, background: template?.customer_type === 'B2C' ? '#dbeafe' : '#ede9fe', color: template?.customer_type === 'B2C' ? '#1e40af' : '#6d28d9' }}>
            {template?.customer_type || 'B2C'}
          </span>
          <button onClick={() => setMode(mode === 'visual' ? 'code' : 'visual')} style={{ padding: '6px 12px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 11, fontWeight: 600, color: 'var(--text)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            {mode === 'visual' ? <Code size={12} /> : <Eye size={12} />} {mode === 'visual' ? 'HTML Code' : 'Visual Mode'}
          </button>
          <button onClick={() => onSave(htmlContent)} style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: '#6366f1', color: '#fff', fontSize: 11, fontWeight: 700, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Save size={12} /> Save Template
          </button>
          <button onClick={onClose} style={{ padding: 4, background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}><X size={16} /></button>
        </div>
      </div>

      {/* Variable Tags Bar */}
      <div>
        <p style={{ margin: '0 0 8px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)' }}>Click a tag to append it to the template:</p>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {AVAILABLE_TAGS.map(item => {
            const inUse = isTagInUse(item.tag);
            const isCopied = copiedTag === item.tag;
            return (
              <button key={item.tag} onClick={() => insertTag(item.tag)} style={{
                padding: '4px 10px', borderRadius: 6, fontSize: 10, fontWeight: 600, cursor: 'pointer',
                border: `1px solid ${inUse ? 'rgba(16,185,129,0.3)' : 'var(--border)'}`,
                background: isCopied ? '#d1fae5' : inUse ? 'rgba(16,185,129,0.06)' : 'var(--surface)',
                color: inUse ? '#065f46' : 'var(--text)',
                display: 'flex', alignItems: 'center', gap: 4,
                transition: 'all 0.15s',
              }}>
                <Plus size={10} /> {item.label}
                {inUse && <span style={{ color: '#10b981', fontSize: 9 }}>{'\u2713'}</span>}
              </button>
            );
          })}
        </div>
        <p style={{ margin: '6px 0 0', fontSize: 10, color: 'var(--text-muted)' }}>
          Green check = already used in template. Clicking appends the tag at the end of the HTML.
        </p>
      </div>

      {/* Split View: Editor + Preview */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, flex: 1 }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px' }}>
            {mode === 'code' ? 'HTML Editor' : 'Template Content'}
          </label>
          <textarea
            value={htmlContent}
            onChange={e => setHtmlContent(e.target.value)}
            style={{
              width: '100%', minHeight: 400, fontFamily: mode === 'code' ? 'Consolas, Monaco, monospace' : 'inherit',
              fontSize: mode === 'code' ? 11 : 12, padding: 12,
              border: '1px solid var(--border)', borderRadius: 8,
              background: mode === 'code' ? '#1e1e1e' : 'var(--surface)',
              color: mode === 'code' ? '#d4d4d4' : 'var(--text)',
              resize: 'vertical', outline: 'none', lineHeight: 1.6,
            }}
          />
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <label style={{ fontSize: 11, fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase', letterSpacing: '0.4px', display: 'flex', alignItems: 'center', gap: 4 }}>
            <Eye size={12} style={{ color: '#6366f1' }} /> Live Preview
          </label>
          <iframe
            srcDoc={htmlContent}
            style={{ width: '100%', minHeight: 400, border: '1px solid var(--border)', borderRadius: 8, background: '#fff' }}
            title="Template Preview"
          />
        </div>
      </div>
    </div>
  );
}
