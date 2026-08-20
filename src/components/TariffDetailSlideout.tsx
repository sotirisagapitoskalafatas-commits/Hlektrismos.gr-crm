import { useState, useEffect } from 'react';
import {
  X,
  ExternalLink,
  FileText,
  Shield,
  ShieldCheck,
  ShieldAlert,
  ShieldQuestion,
  Clock,
  CheckCircle2,
  AlertTriangle,
  ChevronDown,
  Euro,
  Zap,
  Building2,
  Calendar,
  Tag,
  Link2,
  Info,
  Eye,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

type TariffDetail = {
  tariff_id: string;
  provider_name: string;
  program_name: string;
  customer_type: string;
  tariff_color: string | null;
  energy_type: string;
  official_url: string | null;
  terms_pdf_url: string | null;
  requires_dual_zone_meter: boolean;
  base_price_day: number | null;
  base_price_night: number | null;
  unit_rate_kwh: number | null;
  fixed_fee_monthly: number | null;
  discounted_price_day: number | null;
  discounted_price_night: number | null;
  discount_conditions: string | null;
  validity_from: string | null;
  validity_until: string | null;
  verification_status: string;
};

type PriceHistory = {
  id: string;
  base_price_day: number | null;
  base_price_night: number | null;
  unit_rate_kwh: number | null;
  fixed_fee_monthly: number | null;
  discounted_price_day: number | null;
  discounted_price_night: number | null;
  discount_conditions: string | null;
  validity_from: string;
  validity_until: string | null;
  verification_status: string;
  notes: string | null;
  source_url: string | null;
  created_at: string;
};

type Props = {
  tariff: TariffDetail;
  onClose: () => void;
};

const COLOR_MAP: Record<string, { bg: string; fg: string; label: string }> = {
  green: { bg: '#dcfce7', fg: '#16a34a', label: 'Πράσινο (Ειδικό)' },
  blue: { bg: '#dbeafe', fg: '#2563eb', label: 'Μπλε (Σταθερό)' },
  yellow: { bg: '#fef9c3', fg: '#ca8a04', label: 'Κίτρινο (Κυμαινόμενο)' },
  orange: { bg: '#ffedd5', fg: '#ea580c', label: 'Πορτοκαλί (Δυναμικό)' },
};

const VERIFICATION_MAP: Record<string, { icon: typeof Shield; color: string; label: string }> = {
  verified: { icon: ShieldCheck, color: '#16a34a', label: 'Verified' },
  needs_review: { icon: ShieldAlert, color: '#ca8a04', label: 'Needs Review' },
  expired: { icon: ShieldQuestion, color: '#94a3b8', label: 'Expired' },
  unverified: { icon: Shield, color: '#64748b', label: 'Unverified' },
};

const PROVIDER_COLORS: Record<string, string> = {
  'ΔΕΗ': '#1e40af',
  Protergia: '#dc2626',
  'ΗΡΩΝ': '#059669',
  'ZeniΘ': '#d97706',
  Elpedison: '#7c3aed',
  nrg: '#0891b2',
  'Φυσικό Αέριο': '#be185d',
  Volton: '#4f46e5',
  'We Energy': '#0d9488',
  'Ελίν': '#b91c1c',
};

export default function TariffDetailSlideout({ tariff, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<'info' | 'pricing' | 'history'>('info');
  const [priceHistory, setPriceHistory] = useState<PriceHistory[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [verifying, setVerifying] = useState(false);

  useEffect(() => {
    loadPriceHistory();
  }, [tariff.tariff_id]);

  const loadPriceHistory = async () => {
    setLoadingHistory(true);
    const { data } = await supabase
      .from('energy_tariff_prices')
      .select('*')
      .eq('tariff_id', tariff.tariff_id)
      .order('validity_from', { ascending: false });
    if (data) setPriceHistory(data);
    setLoadingHistory(false);
  };

  const markAsVerified = async () => {
    setVerifying(true);
    try {
      const latestPrice = priceHistory[0];
      if (latestPrice) {
        await supabase
          .from('energy_tariff_prices')
          .update({
            verification_status: 'verified',
            verified_by: 'admin',
            verified_at: new Date().toISOString(),
          })
          .eq('id', latestPrice.id);
        await loadPriceHistory();
      }
    } catch (e) {
      console.error('Verification failed:', e);
    }
    setVerifying(false);
  };

  const color = tariff.tariff_color ? COLOR_MAP[tariff.tariff_color] : null;
  const verification = VERIFICATION_MAP[tariff.verification_status] || VERIFICATION_MAP.unverified;
  const VerificationIcon = verification.icon;
  const providerColor = PROVIDER_COLORS[tariff.provider_name] || '#64748b';
  const latestPrice = priceHistory[0];

  const tabs = [
    { id: 'info' as const, label: 'Πληροφορίες', icon: Info },
    { id: 'pricing' as const, label: 'Τιμολόγηση', icon: Euro },
    { id: 'history' as const, label: 'Ιστορικό', icon: Clock },
  ];

  return (
    <div
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        width: 600,
        maxWidth: '100vw',
        height: '100vh',
        background: '#fff',
        boxShadow: '-4px 0 24px rgba(0,0,0,0.12)',
        zIndex: 9999,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      {/* Header */}
      <div
        style={{
          padding: '20px 24px',
          borderBottom: '1px solid var(--border)',
          background: '#fff',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 12 }}>
          <div style={{ flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
              <span
                style={{
                  padding: '4px 12px',
                  borderRadius: 8,
                  background: `${providerColor}15`,
                  color: providerColor,
                  fontWeight: 700,
                  fontSize: 13,
                }}
              >
                {tariff.provider_name}
              </span>
              {tariff.customer_type && (
                <span
                  style={{
                    padding: '4px 10px',
                    borderRadius: 6,
                    background: tariff.customer_type === 'B2C' ? '#eff6ff' : '#f0fdf4',
                    color: tariff.customer_type === 'B2C' ? '#2563eb' : '#16a34a',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {tariff.customer_type === 'B2C' ? 'Οικιακό' : 'Επιχείρηση'}
                </span>
              )}
            </div>
            <h2 style={{ margin: 0, fontSize: 20, fontWeight: 700, color: 'var(--text)' }}>
              {tariff.program_name}
            </h2>
          </div>
          <button
            onClick={onClose}
            style={{
              background: 'none',
              border: 'none',
              cursor: 'pointer',
              padding: 6,
              borderRadius: 8,
              color: 'var(--text-muted)',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#f1f5f9')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'none')}
          >
            <X size={20} />
          </button>
        </div>

        {/* Status badges */}
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Verification badge */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              padding: '5px 12px',
              borderRadius: 8,
              background: `${verification.color}15`,
              color: verification.color,
              fontSize: 12,
              fontWeight: 600,
            }}
          >
            <VerificationIcon size={14} />
            {verification.label}
          </span>

          {/* Color badge */}
          {color && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                padding: '5px 12px',
                borderRadius: 8,
                background: color.bg,
                color: color.fg,
                fontSize: 12,
                fontWeight: 600,
              }}
            >
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: '50%',
                  background: color.fg,
                }}
              />
              {color.label}
            </span>
          )}

          {/* Energy type */}
          <span
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
              padding: '5px 10px',
              borderRadius: 6,
              background: '#f8fafc',
              color: 'var(--text-muted)',
              fontSize: 12,
            }}
          >
            {tariff.energy_type === 'gas' ? '🔥' : tariff.energy_type === 'solar' ? '☀️' : '⚡'}
            {tariff.energy_type}
          </span>

          {/* Dual zone meter flag */}
          {tariff.requires_dual_zone_meter && (
            <span
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 4,
                padding: '5px 10px',
                borderRadius: 6,
                background: '#fef3c7',
                color: '#92400e',
                fontSize: 11,
                fontWeight: 500,
              }}
            >
              Day/Night Meter Required
            </span>
          )}
        </div>
      </div>

      {/* Tabs */}
      <div
        style={{
          display: 'flex',
          borderBottom: '1px solid var(--border)',
          background: '#fafbfc',
        }}
      >
        {tabs.map((tab) => {
          const TabIcon = tab.icon;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              style={{
                flex: 1,
                padding: '12px 16px',
                border: 'none',
                borderBottom: activeTab === tab.id ? '2px solid #00c878' : '2px solid transparent',
                background: 'none',
                color: activeTab === tab.id ? '#00c878' : 'var(--text-muted)',
                fontWeight: activeTab === tab.id ? 600 : 500,
                fontSize: 13,
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 6,
                transition: 'all 0.15s',
              }}
            >
              <TabIcon size={14} />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '20px 24px' }}>
        {activeTab === 'info' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Official URL */}
            {tariff.official_url && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>
                  Official Program Page
                </label>
                <a
                  href={tariff.official_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: '#f0f9ff',
                    border: '1px solid #bae6fd',
                    color: '#0369a1',
                    fontSize: 13,
                    textDecoration: 'none',
                    transition: 'background 0.15s',
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = '#e0f2fe')}
                  onMouseLeave={(e) => (e.currentTarget.style.background = '#f0f9ff')}
                >
                  <Link2 size={14} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tariff.official_url}
                  </span>
                  <ExternalLink size={12} />
                </a>
              </div>
            )}

            {/* Terms PDF */}
            {tariff.terms_pdf_url && (
              <div>
                <label style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6, display: 'block' }}>
                  Terms & Conditions PDF
                </label>
                <a
                  href={tariff.terms_pdf_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    padding: '10px 14px',
                    borderRadius: 8,
                    background: '#fef2f2',
                    border: '1px solid #fecaca',
                    color: '#dc2626',
                    fontSize: 13,
                    textDecoration: 'none',
                  }}
                >
                  <FileText size={14} />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {tariff.terms_pdf_url}
                  </span>
                  <ExternalLink size={12} />
                </a>
              </div>
            )}

            {/* Program Summary */}
            <div
              style={{
                padding: 16,
                borderRadius: 10,
                background: '#f8fafc',
                border: '1px solid var(--border)',
              }}
            >
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', marginBottom: 12 }}>
                Περίληψη Προγράμματος
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Πάροχος</div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: providerColor }}>{tariff.provider_name}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Τύπος Πελάτη</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>{tariff.customer_type === 'B2C' ? 'Οικιακό' : 'Επιχείρηση'}</div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Ενέργεια</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {tariff.energy_type === 'gas' ? 'Φυσικό Αέριο' : tariff.energy_type === 'solar' ? 'Φωτοβολταϊκό' : 'Ηλεκτρική'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Χρώμα Τιμολογίου</div>
                  <div style={{ fontSize: 14, fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>
                    {color && (
                      <span
                        style={{
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          background: color.fg,
                          display: 'inline-block',
                        }}
                      />
                    )}
                    {color?.label || '—'}
                  </div>
                </div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Μετρητής Day/Night</div>
                  <div style={{ fontSize: 14, fontWeight: 600 }}>
                    {tariff.requires_dual_zone_meter ? 'Ναι — απαιτείται δίζωνος μετρητής' : 'Όχι'}
                  </div>
                </div>
              </div>
            </div>

            {/* Verify button */}
            {tariff.verification_status !== 'verified' && (
              <button
                onClick={markAsVerified}
                disabled={verifying}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 8,
                  padding: '12px 20px',
                  borderRadius: 10,
                  border: '1px solid #16a34a',
                  background: '#16a34a',
                  color: '#fff',
                  fontWeight: 600,
                  fontSize: 14,
                  cursor: 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                <ShieldCheck size={16} />
                {verifying ? 'Verifying...' : 'Approve & Mark as Verified'}
              </button>
            )}
          </div>
        )}

        {activeTab === 'pricing' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Current Pricing Card */}
            <div
              style={{
                padding: 20,
                borderRadius: 12,
                background: latestPrice?.verification_status === 'verified' ? '#f0fdf4' : '#fffbeb',
                border: `1px solid ${latestPrice?.verification_status === 'verified' ? '#bbf7d0' : '#fde68a'}`,
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  marginBottom: 16,
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>
                  Τρέχουσα Τιμολόγηση
                </div>
                <span
                  style={{
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 4,
                    padding: '4px 10px',
                    borderRadius: 6,
                    background:
                      latestPrice?.verification_status === 'verified'
                        ? '#dcfce7'
                        : latestPrice?.verification_status === 'needs_review'
                        ? '#fef9c3'
                        : '#f1f5f9',
                    color:
                      latestPrice?.verification_status === 'verified'
                        ? '#16a34a'
                        : latestPrice?.verification_status === 'needs_review'
                        ? '#ca8a04'
                        : '#64748b',
                    fontSize: 11,
                    fontWeight: 600,
                  }}
                >
                  {latestPrice?.verification_status === 'verified' ? (
                    <ShieldCheck size={12} />
                  ) : latestPrice?.verification_status === 'needs_review' ? (
                    <AlertTriangle size={12} />
                  ) : (
                    <Shield size={12} />
                  )}
                  {latestPrice?.verification_status || 'unverified'}
                </span>
              </div>

              {/* Day rate */}
              {(latestPrice?.base_price_day != null || latestPrice?.unit_rate_kwh != null) && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Τιμή Ημέρας (€/kWh)</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#00c878' }}>
                    €{(latestPrice?.base_price_day ?? latestPrice?.unit_rate_kwh ?? 0).toFixed(4)}
                  </div>
                </div>
              )}

              {/* Night rate */}
              {latestPrice?.base_price_night != null && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: 'var(--text-muted)', marginBottom: 4 }}>Τιμή Νύχτας (€/kWh)</div>
                  <div style={{ fontSize: 28, fontWeight: 800, color: '#7c3aed' }}>
                    €{latestPrice.base_price_night.toFixed(4)}
                  </div>
                </div>
              )}

              {/* Discounted prices */}
              {latestPrice?.discounted_price_day != null && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 12,
                    borderRadius: 8,
                    background: '#ecfdf5',
                    border: '1px solid #a7f3d0',
                  }}
                >
                  <div style={{ fontSize: 11, fontWeight: 600, color: '#059669', marginBottom: 6 }}>
                    Τιμή Με Έκπτωση
                  </div>
                  <div style={{ display: 'flex', gap: 20 }}>
                    <div>
                      <div style={{ fontSize: 10, color: '#047857' }}>Ημέρα</div>
                      <div style={{ fontSize: 18, fontWeight: 700, color: '#059669' }}>
                        €{latestPrice.discounted_price_day.toFixed(4)}/kWh
                      </div>
                    </div>
                    {latestPrice.discounted_price_night != null && (
                      <div>
                        <div style={{ fontSize: 10, color: '#047857' }}>Νύχτα</div>
                        <div style={{ fontSize: 18, fontWeight: 700, color: '#059669' }}>
                          €{latestPrice.discounted_price_night.toFixed(4)}/kWh
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Discount conditions */}
              {latestPrice?.discount_conditions && (
                <div style={{ marginTop: 12, fontSize: 12, color: '#92400e', lineHeight: 1.5 }}>
                  <strong>Συνθήκες Έκπτωσης:</strong> {latestPrice.discount_conditions}
                </div>
              )}

              {/* Fixed fee */}
              {latestPrice?.fixed_fee_monthly != null && latestPrice.fixed_fee_monthly > 0 && (
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Euro size={14} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                    Σταθερό τέλος: <strong style={{ color: 'var(--text)' }}>€{latestPrice.fixed_fee_monthly}/μήνα</strong>
                  </span>
                </div>
              )}

              {/* Validity */}
              {latestPrice?.validity_from && (
                <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Calendar size={14} style={{ color: 'var(--text-muted)' }} />
                  <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                    Ισχύς από: <strong>{new Date(latestPrice.validity_from).toLocaleDateString('el-GR')}</strong>
                    {latestPrice.validity_until && (
                      <> — έως: <strong>{new Date(latestPrice.validity_until).toLocaleDateString('el-GR')}</strong></>
                    )}
                  </span>
                </div>
              )}

              {/* Source URL */}
              {latestPrice?.source_url && (
                <div style={{ marginTop: 10 }}>
                  <a
                    href={latestPrice.source_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                      fontSize: 11,
                      color: '#2563eb',
                      textDecoration: 'none',
                    }}
                  >
                    <Link2 size={11} />
                    {latestPrice.source_url}
                    <ExternalLink size={10} />
                  </a>
                </div>
              )}

              {/* Notes */}
              {latestPrice?.notes && (
                <div
                  style={{
                    marginTop: 12,
                    padding: 10,
                    borderRadius: 6,
                    background: '#fff7ed',
                    border: '1px solid #fed7aa',
                    fontSize: 12,
                    color: '#9a3412',
                    lineHeight: 1.4,
                  }}
                >
                  {latestPrice.notes}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'history' && (
          <div>
            {loadingHistory ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                Loading price history...
              </div>
            ) : priceHistory.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 40, color: 'var(--text-muted)' }}>
                No price history available
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {priceHistory.map((p) => {
                  const pVerif = VERIFICATION_MAP[p.verification_status] || VERIFICATION_MAP.unverified;
                  return (
                    <div
                      key={p.id}
                      style={{
                        padding: 14,
                        borderRadius: 10,
                        border: '1px solid var(--border)',
                        background: '#fff',
                      }}
                    >
                      <div
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          marginBottom: 8,
                        }}
                      >
                        <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>
                          {new Date(p.validity_from).toLocaleDateString('el-GR')}
                          {p.validity_until && ` — ${new Date(p.validity_until).toLocaleDateString('el-GR')}`}
                        </span>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 8px',
                            borderRadius: 5,
                            background: `${pVerif.color}15`,
                            color: pVerif.color,
                            fontSize: 10,
                            fontWeight: 600,
                          }}
                        >
                          {p.verification_status}
                        </span>
                      </div>
                      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
                        {p.base_price_day != null && (
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Day</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#00c878' }}>€{p.base_price_day.toFixed(4)}</div>
                          </div>
                        )}
                        {p.base_price_night != null && (
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Night</div>
                            <div style={{ fontSize: 14, fontWeight: 700, color: '#7c3aed' }}>€{p.base_price_night.toFixed(4)}</div>
                          </div>
                        )}
                        {p.fixed_fee_monthly != null && p.fixed_fee_monthly > 0 && (
                          <div>
                            <div style={{ fontSize: 10, color: 'var(--text-muted)' }}>Fixed</div>
                            <div style={{ fontSize: 14, fontWeight: 700 }}>€{p.fixed_fee_monthly}/mo</div>
                          </div>
                        )}
                      </div>
                      {p.discount_conditions && (
                        <div style={{ marginTop: 6, fontSize: 11, color: '#92400e' }}>
                          {p.discount_conditions}
                        </div>
                      )}
                      {p.notes && (
                        <div style={{ marginTop: 4, fontSize: 11, color: 'var(--text-muted)', fontStyle: 'italic' }}>
                          {p.notes}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
