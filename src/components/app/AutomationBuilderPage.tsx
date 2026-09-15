import { useCallback, useEffect, useMemo, useState } from 'react';
import { Power, Plus, Pencil, Trash2, X, ShieldCheck, ShieldAlert, ShieldX, Shield, Gauge } from 'lucide-react';
import {
  fetchPolicyRules, savePolicyRule, setPolicyRuleActive, deletePolicyRule,
} from '../../lib/api';
import type { PolicyRule, PolicyEffect } from '../../lib/api';
import { Micro, Card, CardHeader, Pill, Btn, Field, Modal, EmptyState, Spinner } from '../../lib/ui';

/* ==================================================================
 * Automation Builder — business-first view over policy_rules
 *
 * Every rule renders as a natural-language business sentence:
 *   «Αίτημα X» (για όλους / ρόλο / πράκτορα) → Απόφαση AI: [Pill]
 *   → συνέπεια. The builder modal gathers plain business fields and
 *   persists through savePolicyRule against the existing policy_rules
 *   table — no new backend, no new tables, no queries.
 * ================================================================== */

const EFFECT_LABEL: Record<PolicyEffect, string> = {
  allow: 'Αυτόματη εκτέλεση',
  require_approval: 'Έγκριση',
  deny: 'Απόρριψη',
};
const EFFECT_TONE: Record<PolicyEffect, 'green' | 'amber' | 'red'> = {
  allow: 'green', require_approval: 'amber', deny: 'red',
};
const EFFECT_CONSEQUENCE: Record<PolicyEffect, string> = {
  allow: 'το αίτημα εκτελείται αυτόματα',
  require_approval: 'το αίτημα τίθεται σε έγκριση',
  deny: 'το αίτημα απορρίπτεται',
};
const SCOPE_LABEL: Record<PolicyRule['scope'], string> = {
  all: 'Όλοι', role: 'Ρόλος', agent: 'Πράκτορας',
};

type Scope = PolicyRule['scope'];

/* ---------------- Local stat card (ui.tsx has no StatCard export) ---------------- */
function StatCard({ icon: I, label, value, color }: {
  icon: typeof Gauge; label: string; value: string | number; color: string;
}) {
  return (
    <div className="rounded-xl border border-line bg-white px-3.5 py-3 flex items-center gap-2.5">
      <div className="w-8 h-8 rounded-lg grid place-items-center shrink-0"
        style={{ background: `${color}1a`, color }}>
        <I className="w-4 h-4" />
      </div>
      <div className="min-w-0">
        <p className="micro text-ink/40">{label}</p>
        <p className="text-[16px] font-semibold text-ink leading-tight">{value}</p>
      </div>
    </div>
  );
}

/* ---------------- Business sentence for a rule ---------------- */
function sentence(r: PolicyRule): { who: string; conds: number; consequence: string } {
  const who =
    r.scope === 'all' ? 'για όλους'
    : r.scope === 'role' ? `για ρόλο «${r.subject_key}»`
    : `για πράκτορα «${r.subject_key}»`;
  return {
    who,
    conds: Object.keys(r.conditions ?? {}).length,
    consequence: EFFECT_CONSEQUENCE[r.effect],
  };
}

/* ---------------- Builder modal (business-first → PolicyRule) ---------------- */
function BuilderModal({ open, initial, onClose, onSaved }: {
  open: boolean; initial: PolicyRule | null;
  onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [resource, setResource] = useState('');
  const [scope, setScope] = useState<Scope>('all');
  const [subjectKey, setSubjectKey] = useState('');
  const [effect, setEffect] = useState<PolicyEffect>('allow');
  const [notes, setNotes] = useState('');
  const [conditionsText, setConditionsText] = useState('{}');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setResource(initial?.resource ?? '');
    setScope(initial?.scope ?? 'all');
    setSubjectKey(initial?.subject_key ?? '');
    setEffect(initial?.effect ?? 'allow');
    setNotes(initial?.notes ?? '');
    setConditionsText(JSON.stringify(initial?.conditions ?? {}, null, 2));
    setErr(null);
  }, [open, initial]);

  const save = async () => {
    let conditions: Record<string, unknown> = {};
    try { conditions = JSON.parse(conditionsText || '{}') as Record<string, unknown>; }
    catch { setErr('Οι συνθήκες δεν είναι έγκυρο JSON.'); return; }
    if (!resource.trim()) { setErr('Το πεδίο «Αίτημα» είναι υποχρεωτικό.'); return; }
    setBusy(true);
    const res = await savePolicyRule({
      id: initial?.id,
      resource: resource.trim(),
      scope,
      subject_key: scope === 'all' ? null : subjectKey.trim() || null,
      effect,
      priority: initial?.priority ?? 0,
      conditions,
      notes: notes.trim() || null,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.message ?? 'Η αποθήκευση απέτυχε.'); return; }
    await onSaved();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose}
      title={initial ? 'Επεξεργασία αυτοματισμού' : 'Νέος αυτοματισμός'}
      micro="Automation Builder" wide>
      <div className="space-y-3">
        {err && (
          <div className="rounded-xl bg-bad-100 text-bad-600 text-[13px] px-4 py-2.5">{err}</div>
        )}
        <Field label="Τι αίτημα (πόρος)">
          <input className="field" value={resource} onChange={e => setResource(e.target.value)}
            placeholder="π.χ. send_message, change_pricing, getLead" />
        </Field>
        <Field label="Για ποιον">
          <div className="flex gap-1.5">
            {(['all', 'role', 'agent'] as const).map(s => (
              <button key={s} onClick={() => setScope(s)}
                className={`flex-1 h-9 rounded-lg border text-[12.5px] font-medium transition-colors ${
                  scope === s ? 'border-ink bg-ink text-paper' : 'border-line bg-white text-ink/60 hover:border-ink/30'}`}>
                {SCOPE_LABEL[s]}
              </button>
            ))}
          </div>
        </Field>
        <Field label={scope === 'all' ? 'Subject key (προαιρετικό)' : 'Subject key'}>
          <input className="field" value={subjectKey} disabled={scope === 'all'}
            onChange={e => setSubjectKey(e.target.value)}
            placeholder={scope === 'all' ? '—' : 'π.χ. inside_sales | sales_dev'} />
        </Field>
        <Field label="Απόφαση AI">
          <select className="field" value={effect} onChange={e => setEffect(e.target.value as PolicyEffect)}>
            {(['allow', 'require_approval', 'deny'] as const).map(ef => (
              <option key={ef} value={ef}>{EFFECT_LABEL[ef]}</option>
            ))}
          </select>
        </Field>
        <Field label="Σημειώσεις">
          <input className="field" value={notes} onChange={e => setNotes(e.target.value)} />
        </Field>
        <Field label="Συνθήκες (προαιρετικό JSON)">
          <textarea rows={4} className="field font-mono text-[12px]" value={conditionsText}
            onChange={e => setConditionsText(e.target.value)}
            placeholder={'{\n  "risk_max": 2,\n  "amount_max": 5000,\n  "consent_required": true\n}'} />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>Άκυρο</Btn>
          <Btn onClick={() => void save()} disabled={busy}>{busy ? <Spinner /> : 'Αποθήκευση'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ---------------- Page ---------------- */
export default function AutomationBuilderPage() {
  const [rules, setRules] = useState<PolicyRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);
  const [modal, setModal] = useState<{ open: boolean; rule: PolicyRule | null }>({ open: false, rule: null });

  const load = useCallback(async () => {
    setRules(await fetchPolicyRules());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const stats = useMemo(() => ({
    total: rules.length,
    allow: rules.filter(r => r.effect === 'allow').length,
    approval: rules.filter(r => r.effect === 'require_approval').length,
    deny: rules.filter(r => r.effect === 'deny').length,
    active: rules.filter(r => r.is_active).length,
  }), [rules]);

  const toggle = async (r: PolicyRule) => {
    setBusyId(r.id);
    const ok = await setPolicyRuleActive(r.id, !r.is_active);
    setBusyId(null);
    if (ok) {
      await load();
      setMsg({ tone: 'ok', text: r.is_active ? 'Ο κανόνας απενεργοποιήθηκε.' : 'Ο κανόνας ενεργοποιήθηκε.' });
    } else setMsg({ tone: 'bad', text: 'Η ενημέρωση απέτυχε.' });
  };

  const remove = async (r: PolicyRule) => {
    setBusyId(r.id);
    const ok = await deletePolicyRule(r.id);
    setBusyId(null);
    if (ok) {
      await load();
      setMsg({ tone: 'ok', text: 'Ο κανόνας διαγράφηκε.' });
    } else setMsg({ tone: 'bad', text: 'Η διαγραφή απέτυχε.' });
  };

  return (
    <div className="space-y-3">
      {msg && (
        <div className={`rounded-xl text-[13px] px-4 py-2.5 flex items-center justify-between gap-3 ${
          msg.tone === 'ok' ? 'bg-ok-100 text-ok-600' : 'bg-bad-100 text-bad-600'}`}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} aria-label="Κλείσιμο"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <StatCard icon={Gauge} label="Σύνολο" value={stats.total} color="#475569" />
        <StatCard icon={ShieldCheck} label="Αυτόματα" value={stats.allow} color="#16a34a" />
        <StatCard icon={ShieldAlert} label="Με έγκριση" value={stats.approval} color="#d97706" />
        <StatCard icon={ShieldX} label="Απόρριψη" value={stats.deny} color="#dc2626" />
        <StatCard icon={Power} label="Ενεργοί" value={stats.active} color="#0066cc" />
      </div>

      <Card pad={false}>
        <CardHeader micro="Automation Builder" title="Αυτοματισμοί"
          className="px-5 pt-5"
          action={
            <div className="flex items-center gap-2">
              {loading && <Spinner />}
              <Btn variant="brand" onClick={() => setModal({ open: true, rule: null })}>
                <Plus className="w-3.5 h-3.5" /> Νέα Πολιτική
              </Btn>
            </div>
          } />
        {loading && <div className="px-5 py-8 grid place-items-center"><Spinner /></div>}
        {!loading && rules.length === 0 && (
          <EmptyState icon={Shield} title="Δεν υπάρχουν αυτοματισμοί"
            hint="Προσθέστε τον πρώτο κανόνα για να ενεργοποιήσετε τον έλεγχο αποφάσεων." />
        )}
        {!loading && rules.length > 0 && (
          <div className="px-5 pb-2 pt-1 space-y-2.5">
            <p className="micro text-ink/45 px-1">
              Κάθε αίτημα περνά από έλεγχο: η AI αποφασίζει αν εκτελείται αυτόματα, χρειάζεται έγκριση ή απορρίπτεται.
            </p>
            {rules.map(r => {
              const s = sentence(r);
              return (
                <div key={r.id} className="flex items-start gap-3 rounded-xl border border-line px-4 py-3 hover:bg-ink/[0.02]">
                  <div className="flex-1 min-w-0">
                    <p className="text-[13px] leading-relaxed text-ink/85">
                      <span className="text-ink/50">Αίτημα</span>{' '}
                      <span className="font-mono text-[12px] font-medium text-ink">«{r.resource}»</span>{' '}
                      {s.who}
                      {s.conds > 0 && <span className="text-ink/45"> · {s.conds} συνθήκη/-ες</span>}
                      <span className="text-ink/50"> → Απόφαση AI:</span>{' '}
                      <Pill tone={EFFECT_TONE[r.effect]}>{EFFECT_LABEL[r.effect]}</Pill>{' '}
                      <span className="text-ink/55">{s.consequence}</span>
                    </p>
                    {r.notes && <p className="micro text-ink/35 mt-1 max-w-[520px] truncate">{r.notes}</p>}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    {busyId === r.id ? <Spinner /> : (
                      <>
                        <button title={r.is_active ? 'Απενεργοποίηση' : 'Ενεργοποίηση'} aria-label="Εναλλαγή κατάστασης"
                          className="p-1.5 rounded-lg text-ink/45 hover:text-ink hover:bg-ink/5"
                          onClick={() => void toggle(r)}>
                          <Power className="w-4 h-4" />
                        </button>
                        <button title="Επεξεργασία" aria-label="Επεξεργασία κανόνα"
                          className="p-1.5 rounded-lg text-ink/45 hover:text-ink hover:bg-ink/5"
                          onClick={() => setModal({ open: true, rule: r })}>
                          <Pencil className="w-4 h-4" />
                        </button>
                        <button title="Διαγραφή" aria-label="Διαγραφή κανόνα"
                          className="p-1.5 rounded-lg text-bad-600/60 hover:text-bad-600 hover:bg-bad-100/50"
                          onClick={() => void remove(r)}>
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>

      <BuilderModal open={modal.open} initial={modal.rule}
        onClose={() => setModal({ open: false, rule: null })}
        onSaved={async () => { await load(); setMsg({ tone: 'ok', text: 'Ο κανόνας αποθηκεύτηκε.' }); }} />
    </div>
  );
}
