import { FormEvent, useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { ROLES } from '@/lib/roles';
import {
  addConsent, deletePolicyRule, emitTestEvent, evaluateAction, fetchConsentRecords,
  fetchCustomers, fetchEventTypes, fetchPolicyRules, fetchRecentEvents, fetchToolCallLogs,
  fetchTools, revokeConsent, savePolicyRule, setPolicyRuleActive,
} from '@/lib/api';
import type {
  BusinessEvent, ConsentRecord, Customer, EventTypeInfo, EvaluateDecision,
  PolicyEffect, PolicyRule, ToolCallLogRow, ToolInfo,
} from '@/lib/api';
import { Btn, Card, CardHeader, EmptyState, Field, Micro, Modal, Pill, Spinner, fmtDateTime, rgbaOf } from '@/lib/ui';
import type { PillTone } from '@/lib/ui';
import {
  Activity, Bot, CheckCircle2, ChevronDown, ChevronRight, Fingerprint, Gauge, Pencil,
  Play, Plus, Power, Radio, RefreshCw, ShieldCheck, Trash2, Wrench, X, Zap,
} from 'lucide-react';

const EFFECT_TONE: Record<PolicyEffect, PillTone> = { allow: 'green', require_approval: 'amber', deny: 'red' };
const EFFECT_LABEL: Record<PolicyEffect, string> = {
  allow: 'Επιτρέπεται',
  require_approval: 'Χρειάζεται Έγκριση',
  deny: 'Απαγορεύεται',
};

const RISK_TONE: Record<string, PillTone> = { low: 'green', medium: 'blue', high: 'amber', critical: 'red' };
const LOG_TONE: Record<string, PillTone> = { success: 'green', approved: 'green', denied: 'red', error: 'red' };
const SOURCES = ['crm', 'automation', 'ai', 'webhook', 'integration', 'system'];

const EFFECT_CHOICES: Array<{ id: PolicyEffect; label: string }> = [
  { id: 'allow', label: 'Επιτρέπεται (allow)' },
  { id: 'require_approval', label: 'Χρειάζεται έγκριση (require_approval)' },
  { id: 'deny', label: 'Απαγορεύεται (deny)' },
];

function shortId(id?: string | null): string {
  return id ? id.slice(0, 8) : '—';
}

function parseJson(input: string): Record<string, unknown> | null {
  try {
    const v = JSON.parse(input === '' ? '{}' : input);
    return v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : null;
  } catch {
    return null;
  }
}

function msgTone(text: string, tone: 'ok' | 'bad' = 'bad'): { tone: 'ok' | 'bad'; text: string } {
  return { tone, text };
}

type TabId = 'policy' | 'evaluate' | 'events' | 'tools' | 'consent';

const TABS: { id: TabId; label: string; icon: typeof ShieldCheck }[] = [
  { id: 'policy', label: 'Πολιτική', icon: ShieldCheck },
  { id: 'evaluate', label: 'Δοκιμή Αποφάσεων', icon: Play },
  { id: 'events', label: 'Γεγονότα', icon: Activity },
  { id: 'tools', label: 'Εργαλεία', icon: Wrench },
  { id: 'consent', label: 'Συναίνεση', icon: Fingerprint },
];

/* ======================= Page shell ======================= */

export default function AutomationPage() {
  const { role } = useAuth();
  const [tab, setTab] = useState<TabId>('policy');

  const canWrite = role === 'admin' || role === 'manager';
  const canConsentWrite = canWrite || role === 'back_office';

  return (
    <div className="max-w-6xl space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <Micro tone="brand">AI & Automation · Event Bus · Policy Engine</Micro>
          <h2 className="text-lg font-semibold text-ink tracking-tight mt-0.5">Αυτοματισμοί & Πολιτική</h2>
          <p className="text-xs text-ink/45 mt-1 max-w-2xl">
            Ο καθορισμός πολιτικών (default-deny), η εποπτεία των γεγονότων και των εργαλείων
            στα οποία βασίζεται η AI workforce, και οι καταγραφές συναίνεσης επικοινωνίας.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="pill bg-ok-100 text-ok-600"><Bot className="w-3 h-3" /> Event Bus v2</span>
          <span className="pill bg-warn-100 text-warn-600">Policy Engine</span>
        </div>
      </div>

      <div className="flex items-center gap-1.5 overflow-x-auto p-1 rounded-xl border border-line bg-white/70 w-fit"
        role="tablist" aria-label="Καρτέλες">
        {TABS.map(t => (
          <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={`inline-flex items-center gap-1.5 px-3.5 h-9 rounded-lg text-[13px] font-medium transition-colors whitespace-nowrap ${
              tab === t.id ? 'bg-ink text-paper' : 'text-ink/55 hover:text-ink hover:bg-ink/5'}`}>
            <t.icon className="w-4 h-4" />
            {t.label}
          </button>
        ))}
      </div>

      <div className="anim-fadein">
        {tab === 'policy' && <PolicyPanel canWrite={canWrite} />}
        {tab === 'evaluate' && <EvaluatePanel />}
        {tab === 'events' && <EventsPanel canWrite={canWrite} />}
        {tab === 'tools' && <ToolsPanel />}
        {tab === 'consent' && <ConsentPanel canWrite={canConsentWrite} />}
      </div>
    </div>
  );
}

function StatCard({ icon: Icon, label, value, color }: {
  icon: typeof Gauge; label: string; value: number; color: string;
}) {
  return (
    <Card className="!p-4">
      <div className="flex items-center gap-2.5">
        <span className="w-8 h-8 rounded-lg inline-flex items-center justify-center" style={{ background: rgbaOf(color, 0.12), color }}>
          <Icon className="w-4 h-4" />
        </span>
        <div className="min-w-0">
          <div className="text-lg font-bold text-ink leading-none">{value}</div>
          <Micro className="mt-1">{label}</Micro>
        </div>
      </div>
    </Card>
  );
}

/* ======================= Policy tab ======================= */

function PolicyPanel({ canWrite }: { canWrite: boolean }) {
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
    if (ok) { await load(); setMsg(msgTone(r.is_active ? 'Ο κανόνας απενεργοποιήθηκε.' : 'Ο κανόνας ενεργοποιήθηκε.', 'ok')); }
    else setMsg(msgTone('Η ενημέρωση απέτυχε.'));
  };

  const remove = async (r: PolicyRule) => {
    setBusyId(r.id);
    const ok = await deletePolicyRule(r.id);
    setBusyId(null);
    if (ok) { await load(); setMsg(msgTone('Ο κανόνας διαγράφηκε.', 'ok')); }
    else setMsg(msgTone('Η διαγραφή απέτυχε.'));
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
        <StatCard icon={Gauge} label="Σύνολο κανόνων" value={stats.total} color="#475569" />
        <StatCard icon={CheckCircle2} label="Allow" value={stats.allow} color="#16a34a" />
        <StatCard icon={Radio} label="Require Approval" value={stats.approval} color="#d97706" />
        <StatCard icon={ShieldCheck} label="Deny" value={stats.deny} color="#dc2626" />
        <StatCard icon={Power} label="Ενεργοί" value={stats.active} color="#0066cc" />
      </div>

      <Card pad={false}>
        <CardHeader micro="Πίνακας πολιτικής" title="Κανόνες απόφασης"
          className="px-5 pt-5"
          action={
            <div className="flex items-center gap-2">
              {loading && <Spinner />}
              {canWrite && <Btn variant="brand" onClick={() => setModal({ open: true, rule: null })}><Plus className="w-3.5 h-3.5" /> Νέα Πολιτική</Btn>}
            </div>
          } />
        {!loading && rules.length === 0 && (
          <EmptyState icon={ShieldCheck} title="Δεν υπάρχουν κανόνες πολιτικής" hint="Προσθέστε τον πρώτο κανόνα για να ενεργοποιήσετε τον έλεγχο αποφάσεων." />
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-[13px]">
            <thead>
              <tr className="text-left micro text-ink/40 border-b border-line">
                <th className="px-5 py-2.5 font-medium">Πόρος</th>
                <th className="px-3 py-2.5 font-medium">Scope</th>
                <th className="px-3 py-2.5 font-medium">Αποτέλεσμα</th>
                <th className="px-3 py-2.5 font-medium text-right">Priority</th>
                <th className="px-3 py-2.5 font-medium">Συνθήκες</th>
                <th className="px-3 py-2.5 font-medium">Κατάσταση</th>
                <th className="px-3 py-2.5 text-right" />
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {rules.map(r => (
                <tr key={r.id} className="hover:bg-ink/[0.02]">
                  <td className="px-5 py-2.5">
                    <span className="font-mono text-[12px] text-ink font-medium">{r.resource}</span>
                    {r.notes && <span className="block micro text-ink/35 mt-0.5 max-w-[220px] truncate">{r.notes}</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <Pill tone={r.scope === 'all' ? 'blue' : 'amber'}>{r.scope}{r.subject_key ? ` · ${r.subject_key}` : ''}</Pill>
                  </td>
                  <td className="px-3 py-2.5"><Pill tone={EFFECT_TONE[r.effect]}>{EFFECT_LABEL[r.effect]}</Pill></td>
                  <td className="px-3 py-2.5 text-right font-mono text-[12px] text-ink/60">{r.priority}</td>
                  <td className="px-3 py-2.5">
                    {Object.keys(r.conditions ?? {}).length === 0
                      ? <span className="text-ink/30">—</span>
                      : <span className="pill bg-ink/[0.06] text-ink/55">{Object.keys(r.conditions).length} συνθήκη/-ες</span>}
                  </td>
                  <td className="px-3 py-2.5">
                    <Pill tone={r.is_active ? 'green' : 'gray'}>{r.is_active ? 'ενεργός' : 'απενεργός'}</Pill>
                  </td>
                  <td className="px-3 py-2.5 text-right whitespace-nowrap">
                    {busyId === r.id ? <Spinner /> : (
                      <div className="inline-flex items-center gap-0.5">
                        {canWrite && (
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
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Card>

      <RuleModal open={modal.open} initial={modal.rule} onClose={() => setModal({ open: false, rule: null })}
        onSaved={async () => { await load(); setMsg(msgTone('Ο κανόνας αποθηκεύτηκε.', 'ok')); }} />
    </div>
  );
}

function RuleModal({ open, initial, onClose, onSaved }: {
  open: boolean; initial: PolicyRule | null; onClose: () => void; onSaved: () => Promise<void>;
}) {
  const [resource, setResource] = useState(initial?.resource ?? '');
  const [scope, setScope] = useState<'all' | 'role' | 'agent'>(initial?.scope ?? 'all');
  const [subjectKey, setSubjectKey] = useState(initial?.subject_key ?? '');
  const [effect, setEffect] = useState<PolicyEffect>(initial?.effect ?? 'allow');
  const [priority, setPriority] = useState(initial?.priority ?? 0);
  const [conditionsText, setConditionsText] = useState(JSON.stringify(initial?.conditions ?? {}, null, 2));
  const [notes, setNotes] = useState(initial?.notes ?? '');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) return;
    setResource(initial?.resource ?? '');
    setScope(initial?.scope ?? 'all');
    setSubjectKey(initial?.subject_key ?? '');
    setEffect(initial?.effect ?? 'allow');
    setPriority(initial?.priority ?? 0);
    setConditionsText(JSON.stringify(initial?.conditions ?? {}, null, 2));
    setNotes(initial?.notes ?? '');
    setErr(null);
  }, [open, initial]);

  const save = async () => {
    const conditions = parseJson(conditionsText);
    if (!resource.trim()) { setErr('Το πεδίο «Πόρος» είναι υποχρεωτικό.'); return; }
    if (!conditions) { setErr('Οι συνθήκες δεν είναι έγκυρο JSON αντικείμενο.'); return; }
    setBusy(true);
    const res = await savePolicyRule({
      id: initial?.id,
      resource: resource.trim(),
      scope,
      subject_key: subjectKey.trim() || null,
      effect,
      priority: Math.max(0, priority),
      conditions,
      notes: notes.trim() || null,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.message ?? 'Αποτυχία αποθήκευσης.'); return; }
    await onSaved();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={initial ? 'Επεξεργασία κανόνα' : 'Νέα Πολιτική'}
      micro="policy_rules" wide>
      <div className="space-y-3">
        {err && <div className="rounded-xl bg-bad-100 text-bad-600 text-[13px] px-4 py-2.5">{err}</div>}
        <div className="grid sm:grid-cols-2 gap-3">
          <Field label="Πόρος (action ή tool key) *">
            <input className="field" value={resource} onChange={e => setResource(e.target.value)}
              placeholder="π.χ. send_message, change_pricing, getLead" />
          </Field>
          <Field label="Αποτέλεσμα">
            <select className="field" value={effect} onChange={e => setEffect(e.target.value as PolicyEffect)}>
              {EFFECT_CHOICES.map(c => <option key={c.id} value={c.id}>{c.label}</option>)}
            </select>
          </Field>
          <Field label="Scope">
            <div className="flex gap-1.5">
              {(['all', 'role', 'agent'] as const).map(s => (
                <button key={s} onClick={() => setScope(s)}
                  className={`flex-1 h-9 rounded-lg border text-[12.5px] font-medium transition-colors ${
                    scope === s ? 'border-ink bg-ink text-paper' : 'border-line bg-white text-ink/60 hover:border-ink/30'}`}>
                  {s}
                </button>
              ))}
            </div>
          </Field>
          <Field label={scope === 'all' ? 'Subject key (μη διαθέσιμο για all)' : 'Subject key (ρόλος / agent)'}>
            <input className="field" value={subjectKey} disabled={scope === 'all'}
              onChange={e => setSubjectKey(e.target.value)}
              placeholder={scope === 'all' ? '—' : 'π.χ. inside_sales | sales_dev'} />
          </Field>
          <Field label="Priority">
            <input type="number" min={0} className="field" value={priority}
              onChange={e => setPriority(parseInt(e.target.value, 10) || 0)} />
          </Field>
          <Field label="Σημειώσεις">
            <input className="field" value={notes} onChange={e => setNotes(e.target.value)} />
          </Field>
        </div>
        <Field label="Συνθήκες (JSON)">
          <textarea rows={4} className="field font-mono text-[12px]" value={conditionsText}
            onChange={e => setConditionsText(e.target.value)}
            placeholder={'{\n  "risk_max": 2,\n  "amount_max": 5000,\n  "consent_required": true,\n  "channel": ["email","sms"],\n  "autonomy_max": 3\n}'} />
        </Field>
        <p className="text-[11px] text-ink/40">
          Διαθέσιμες συνθήκες: risk_max, amount_max, consent_required (bool), channel (array), autonomy_max.
          Αποτυχία συνθήκης σε «Επιτρέπεται» ⇒ ανεβαίνει σε «Χρειάζεται Έγκριση» αυτόματα.
        </p>
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>Άκυρο</Btn>
          <Btn onClick={save} disabled={busy}>{busy ? <Spinner /> : 'Αποθήκευση'}</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ======================= Evaluate tab ======================= */

function EvaluatePanel() {
  const [subjectType, setSubjectType] = useState<'user' | 'agent' | 'system'>('user');
  const [subjectKey, setSubjectKey] = useState('inside_sales');
  const [action, setAction] = useState('');
  const [target, setTarget] = useState('');
  const [contextText, setContextText] = useState('{}');
  const [result, setResult] = useState<EvaluateDecision | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState<string[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      const [rules, tools] = await Promise.all([fetchPolicyRules(), fetchTools()]);
      if (!alive) return;
      const set = new Set<string>();
      rules.filter(r => r.is_active).forEach(r => set.add(r.resource));
      tools.forEach(t => set.add(t.key));
      setSuggestions([...set].sort());
    })();
    return () => { alive = false; };
  }, []);

  const run = async (e: FormEvent) => {
    e.preventDefault();
    if (!action.trim()) { setErr('Επιλέξτε ενέργεια προς αξιολόγηση.'); return; }
    const context = parseJson(contextText);
    if (!context) { setErr('Το context δεν είναι έγκυρο JSON αντικείμενο.'); return; }
    setErr(null);
    setBusy(true);
    const res = await evaluateAction({
      subject_type: subjectType,
      subject_key: subjectKey || undefined,
      action: action.trim(),
      target: target.trim() || undefined,
      context,
    });
    setBusy(false);
    if (!res.ok) { setResult(null); setErr(res.message); return; }
    setResult(res.decision);
  };

  const decisionColor = result ? (EFFECT_TONE[result.effect] === 'green' ? '#16a34a' : EFFECT_TONE[result.effect] === 'red' ? '#dc2626' : '#d97706') : '#475569';

  return (
    <div className="grid lg:grid-cols-2 gap-3 items-start">
      <Card>
        <CardHeader micro="evaluate_policy()" title="Δοκιμή απόφασης" />
        <form onSubmit={run} className="space-y-3">
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Υποκείμενο">
              <div className="flex gap-1.5">
                {(['user', 'agent', 'system'] as const).map(s => (
                  <button key={s} type="button" onClick={() => setSubjectType(s)}
                    className={`flex-1 h-9 rounded-lg border text-[12.5px] font-medium transition-colors ${
                      subjectType === s ? 'border-ink bg-ink text-paper' : 'border-line bg-white text-ink/60 hover:border-ink/30'}`}>
                    {s}
                  </button>
                ))}
              </div>
            </Field>
            <Field label={subjectType === 'user' ? 'Ρόλος χρήστη' : subjectType === 'agent' ? 'Agent key' : 'System (χωρίς key)'}>
              {subjectType === 'user' ? (
                <select className="field" value={subjectKey} onChange={e => setSubjectKey(e.target.value)}>
                  {ROLES.map(r => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              ) : (
                <input className="field" value={subjectKey} disabled={subjectType === 'system'}
                  onChange={e => setSubjectKey(e.target.value)}
                  placeholder={subjectType === 'system' ? '—' : 'π.χ. sales_dev'} />
              )}
            </Field>
          </div>
          <div className="grid sm:grid-cols-2 gap-3">
            <Field label="Ενέργεια *">
              <input className="field" list="policy-actions" value={action}
                onChange={e => setAction(e.target.value)}
                placeholder="π.χ. send_message" />
              <datalist id="policy-actions">
                {suggestions.map(s => <option key={s} value={s} />)}
              </datalist>
            </Field>
            <Field label="Στόχος (optional)">
              <input className="field" value={target} onChange={e => setTarget(e.target.value)}
                placeholder="π.χ. email, campaign" />
            </Field>
          </div>
          <Field label="Context (JSON)">
            <textarea rows={4} className="field font-mono text-[12px]" value={contextText}
              onChange={e => setContextText(e.target.value)}
              placeholder={'{\n  "channel": "email",\n  "amount": 1200,\n  "autonomy_level": 2,\n  "consent": true\n}'} />
          </Field>
          {err && <div className="rounded-xl bg-bad-100 text-bad-600 text-[13px] px-4 py-2.5">{err}</div>}
          <div className="flex justify-end">
            <Btn type="submit" disabled={busy || !action.trim()}>
              {busy ? <Spinner /> : <Play className="w-3.5 h-3.5" />} Εκτέλεση
            </Btn>
          </div>
        </form>
      </Card>

      <Card>
        <CardHeader micro="Αποτέλεσμα" title="Απόφαση" />
        {!result && (
          <EmptyState icon={Gauge} title="Δεν έχει τρέξει αξιολόγηση"
            hint="Ορίστε ενέργεια & context και πατήστε «Εκτέλεση» για να δείτε την απόφαση του Policy Engine." />
        )}
        {result && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-3 rounded-xl border p-4"
              style={{ borderColor: rgbaOf(decisionColor, 0.35), background: rgbaOf(decisionColor, 0.06) }}>
              <div>
                <Micro>Απόφαση</Micro>
                <div className="text-xl font-bold tracking-tight" style={{ color: decisionColor }}>{EFFECT_LABEL[result.effect]}</div>
              </div>
              <div className="text-right space-y-1">
                <Pill tone={RISK_TONE[result.risk] ?? 'gray'}>ρίσκο {result.risk}</Pill>
                <div className="flex items-center gap-1 justify-end">
                  <Zap className="w-3.5 h-3.5 text-warn-600" />
                  <span className="text-[13px] font-medium text-ink/70">αυτονομία {result.effective_autonomy}</span>
                </div>
              </div>
            </div>

            <div>
              <Micro className="mb-1.5 block">Λόγοι</Micro>
              <ul className="space-y-1">
                {(result.reasons ?? []).map((r, i) => (
                  <li key={i} className="flex items-start gap-2 text-[12.5px] text-ink/70">
                    <span className="w-1 h-1 rounded-full mt-1.5 shrink-0" style={{ background: decisionColor }} />
                    {r}
                  </li>
                ))}
              </ul>
            </div>

            {result.matched_rule && (
              <div>
                <Micro className="mb-1.5 block">Ταυτισμένος κανόνας</Micro>
                <pre className="rounded-xl bg-ink/[0.04] p-3 text-[11.5px] font-mono text-ink/70 overflow-x-auto">
                  {JSON.stringify(result.matched_rule, null, 2)}
                </pre>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}

/* ======================= Events tab ======================= */

function EventsPanel({ canWrite }: { canWrite: boolean }) {
  const [events, setEvents] = useState<BusinessEvent[]>([]);
  const [types, setTypes] = useState<EventTypeInfo[]>([]);
  const [source, setSource] = useState('all');
  const [evType, setEvType] = useState('all');
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [emitOpen, setEmitOpen] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const load = useCallback(async () => {
    const [evs, tps] = await Promise.all([fetchRecentEvents(120), fetchEventTypes()]);
    setEvents(evs);
    setTypes(tps);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const filtered = useMemo(() => events.filter(ev =>
    (source === 'all' || ev.source === source) &&
    (evType === 'all' || ev.event_type === evType),
  ), [events, source, evType]);

  return (
    <div className="space-y-3">
      {msg && (
        <div className={`rounded-xl text-[13px] px-4 py-2.5 flex items-center justify-between gap-3 ${
          msg.tone === 'ok' ? 'bg-ok-100 text-ok-600' : 'bg-bad-100 text-bad-600'}`}>
          <span>{msg.text}</span>
          <button onClick={() => setMsg(null)} aria-label="Κλείσιμο"><X className="w-3.5 h-3.5" /></button>
        </div>
      )}

      <Card pad={false}>
        <CardHeader micro="business_events · append-only" title="Ροή γεγονότων"
          className="px-5 pt-5"
          action={
            <div className="flex items-center gap-2">
              <select className="!h-8 !py-1 !text-[12px] w-auto" value={source} onChange={e => setSource(e.target.value)}>
                <option value="all">Πηγή: όλες</option>
                {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
              <select className="!h-8 !py-1 !text-[12px] w-auto" value={evType} onChange={e => setEvType(e.target.value)}>
                <option value="all">Τύπος: όλοι</option>
                {types.map(t => <option key={t.key} value={t.key}>{t.key}</option>)}
              </select>
              <Btn variant="ghost" onClick={() => { setLoading(true); void load(); }} title="Ανανέωση">
                <RefreshCw className="w-3.5 h-3.5" />
              </Btn>
              {canWrite && (
                <Btn variant="brand" onClick={() => setEmitOpen(true)} title="Εκπομπή δοκιμαστικού συμβάντος">
                  <Radio className="w-3.5 h-3.5" /> Εκπομπή Δοκιμής
                </Btn>
              )}
            </div>
          } />
        {loading && <div className="p-8 flex justify-center"><Spinner /></div>}
        {!loading && events.length === 0 && (
          <EmptyState icon={Activity} title="Καμία καταγραφή συμβάντος ακόμα"
            hint="Τα συμβάντα εκπέμπονται μέσω emit_business_event() ή από τις RPC μετάβασης ρόλων." />
        )}
        <div className="divide-y divide-line">
          {filtered.map(ev => (
            <div key={ev.id}>
              <button className="w-full flex items-center gap-3 px-5 py-3 text-left hover:bg-ink/[0.02]"
                onClick={() => setExpanded(expanded === ev.id ? null : ev.id)}>
                <span className="w-1.5 h-6 rounded-full shrink-0" style={{ background: rgbaOf('#0066cc', 0.35) }} />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-[13px] font-semibold text-ink font-mono">{ev.event_type}</span>
                    <Pill tone="blue">{ev.source}</Pill>
                    {ev.event_version > 1 && <Pill tone="gray">v{ev.event_version}</Pill>}
                  </div>
                  <div className="text-[11.5px] text-ink/45 mt-0.5 truncate">
                    {ev.entity_type ? `${ev.entity_type} ${shortId(ev.entity_id)} · ` : ''}
                    {ev.actor_type} {shortId(ev.actor_id || ev.agent_id)} · {fmtDateTime(ev.created_at)}
                  </div>
                </div>
                {expanded === ev.id ? <ChevronDown className="w-4 h-4 text-ink/35" /> : <ChevronRight className="w-4 h-4 text-ink/35" />}
              </button>
              {expanded === ev.id && (
                <div className="px-5 pb-4">
                  <pre className="rounded-xl bg-ink/[0.04] p-3 text-[11.5px] font-mono text-ink/70 overflow-x-auto max-h-64 overflow-y-auto">
                    {JSON.stringify({ id: ev.id, idempotency_key: ev.idempotency_key, entity: ev.entity_id ? { type: ev.entity_type, id: ev.entity_id } : null, organization_id: ev.organization_id, correlation_id: ev.correlation_id, causation_id: ev.causation_id, payload: ev.payload ?? {} }, null, 2)}
                  </pre>
                </div>
              )}
            </div>
          ))}
        </div>
      </Card>

      <EmitEventModal open={emitOpen} types={types} onClose={() => setEmitOpen(false)}
        onEmitted={async (ok) => {
          if (ok) {
            setMsg(msgTone('Το συμβάν εκπέμφθηκε επιτυχώς.', 'ok'));
          } else {
            setMsg(msgTone('Η εκπομπή απέτυχε.'));
          }
          await load();
        }} />
    </div>
  );
}

function EmitEventModal({ open, types, onClose, onEmitted }: {
  open: boolean; types: EventTypeInfo[]; onClose: () => void;
  onEmitted: (ok: boolean) => Promise<void>;
}) {
  const [evType, setEvType] = useState('');
  const [entityType, setEntityType] = useState('');
  const [source, setSource] = useState('ai');
  const [payloadText, setPayloadText] = useState('{}');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!open) { setEvType(''); setEntityType(''); setPayloadText('{}'); setErr(null); return; }
    if (types.length > 0) setEvType(types[0].key);
  }, [open, types]);

  const send = async () => {
    if (!evType) { setErr('Επιλέξτε τύπο συμβάντος.'); return; }
    const payload = parseJson(payloadText);
    if (!payload) { setErr('Το payload δεν είναι έγκυρο JSON αντικείμενο.'); return; }
    setBusy(true);
    const res = await emitTestEvent({
      event_type: evType,
      entity_type: entityType.trim() || undefined,
      payload,
      source,
    });
    setBusy(false);
    if (!res.ok) { setErr(res.message ?? 'Σφάλμα εκπομπής.'); return; }
    await onEmitted(true);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Εκπομπή δοκιμαστικού συμβάντος" micro="emit_business_event()">
      <div className="space-y-3">
        {err && <div className="rounded-xl bg-bad-100 text-bad-600 text-[13px] px-4 py-2.5">{err}</div>}
        <Field label="Τύπος συμβάντος">
          <select className="field" value={evType} onChange={e => setEvType(e.target.value)}>
            {types.map(t => <option key={t.key} value={t.key}>{t.key}{t.description ? ` — ${t.description}` : ''}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Entity type (optional)">
            <input className="field" value={entityType} onChange={e => setEntityType(e.target.value)} placeholder="π.χ. lead" />
          </Field>
          <Field label="Πηγή">
            <select className="field" value={source} onChange={e => setSource(e.target.value)}>
              {SOURCES.map(s => <option key={s} value={s}>{s}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Payload (JSON)">
          <textarea rows={4} className="field font-mono text-[12px]" value={payloadText}
            onChange={e => setPayloadText(e.target.value)} placeholder='{"note": "δοκιμή από το UI"}' />
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>Άκυρο</Btn>
          <Btn onClick={send} disabled={busy}>{busy ? <Spinner /> : <Radio className="w-3.5 h-3.5" />} Εκπομπή</Btn>
        </div>
      </div>
    </Modal>
  );
}

/* ======================= Tools tab ======================= */

function ToolsPanel() {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [logs, setLogs] = useState<ToolCallLogRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [ts, ll] = await Promise.all([fetchTools(), fetchToolCallLogs(50)]);
    setTools(ts);
    setLogs(ll);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="space-y-3">
      {loading && <div className="p-8 flex justify-center"><Spinner /></div>}
      {!loading && (
        <>
          <Card pad={false}>
            <CardHeader micro="tools · registry" title="Εργαλείο επιφάνειας των AI employees"
              className="px-5 pt-5" action={<Pill tone="blue">{tools.filter(t => t.is_active).length} ενεργά</Pill>} />
            <div className="overflow-x-auto">
              <table className="w-full text-[13px]">
                <thead>
                  <tr className="text-left micro text-ink/40 border-b border-line">
                    <th className="px-5 py-2.5 font-medium">Key</th>
                    <th className="px-3 py-2.5 font-medium">Όνομα</th>
                    <th className="px-3 py-2.5 font-medium">Κατηγορία</th>
                    <th className="px-3 py-2.5 font-medium">Handler</th>
                    <th className="px-3 py-2.5 font-medium">Required Permission</th>
                    <th className="px-3 py-2.5 font-medium">Κατάσταση</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
                  {tools.map(t => (
                    <tr key={t.id} className="hover:bg-ink/[0.02]">
                      <td className="px-5 py-2.5 font-mono text-[12px] text-ink font-medium">{t.key}</td>
                      <td className="px-3 py-2.5">
                        <div className="text-ink font-medium">{t.name}</div>
                        {t.description && <div className="micro text-ink/40 max-w-[260px] truncate">{t.description}</div>}
                      </td>
                      <td className="px-3 py-2.5"><Pill tone={t.category === 'communication' ? 'amber' : 'blue'}>{t.category}</Pill></td>
                      <td className="px-3 py-2.5 font-mono text-[12px] text-ink/60">{t.handler}</td>
                      <td className="px-3 py-2.5">
                        {t.required_permission
                          ? <Pill tone="blue">{t.required_permission}</Pill>
                          : <span className="text-ink/30">—</span>}
                      </td>
                      <td className="px-3 py-2.5"><Pill tone={t.is_active ? 'green' : 'gray'}>{t.is_active ? 'ενεργό' : 'απενεργό'}</Pill></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <Card pad={false}>
            <CardHeader micro="tool_call_log · audit" title="Πρόσφατες κλήσεις εργαλείων"
              className="px-5 pt-5" action={<Pill tone="gray">{logs.length} τελευταίες</Pill>} />
            {logs.length === 0 && (
              <EmptyState icon={Wrench} title="Δεν υπάρχουν καταγραφές κλήσεων"
                hint="Οι κλήσεις καταγράφονται από το Tool Gateway όταν εκτελούνται εργαλεία." />
            )}
            {logs.length > 0 && (
              <div className="overflow-x-auto">
                <table className="w-full text-[13px]">
                  <thead>
                    <tr className="text-left micro text-ink/40 border-b border-line">
                      <th className="px-5 py-2.5 font-medium">Ώρα</th>
                      <th className="px-3 py-2.5 font-medium">Εργαλείο</th>
                      <th className="px-3 py-2.5 font-medium">Caller</th>
                      <th className="px-3 py-2.5 font-medium">Κατάσταση</th>
                      <th className="px-3 py-2.5 font-medium">Latency</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {logs.map(l => (
                      <tr key={l.id} className="hover:bg-ink/[0.02]">
                        <td className="px-5 py-2.5 micro text-ink/50 whitespace-nowrap">{fmtDateTime(l.created_at)}</td>
                        <td className="px-3 py-2.5 font-mono text-[12px] text-ink font-medium">{l.tool_key}</td>
                        <td className="px-3 py-2.5 text-ink/60">{l.caller_type} {shortId(l.caller_id)}</td>
                        <td className="px-3 py-2.5"><Pill tone={LOG_TONE[l.status] ?? 'gray'}>{l.status}</Pill></td>
                        <td className="px-3 py-2.5 font-mono text-[12px] text-ink/60">{l.latency_ms != null ? `${l.latency_ms}ms` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </>
      )}
    </div>
  );
}

/* ======================= Consent tab ======================= */

function ConsentPanel({ canWrite }: { canWrite: boolean }) {
  const [consents, setConsents] = useState<ConsentRecord[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [loading, setLoading] = useState(true);
  const [addOpen, setAddOpen] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'bad'; text: string } | null>(null);

  const load = useCallback(async () => {
    const [cs, custs] = await Promise.all([fetchConsentRecords(), fetchCustomers()]);
    setConsents(cs);
    setCustomers(custs);
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  const custName = useMemo(() => {
    const m = new Map<string, Customer>();
    customers.forEach(c => m.set(c.id, c));
    return m;
  }, [customers]);

  const revoke = async (c: ConsentRecord) => {
    const ok = await revokeConsent(c.id);
    if (ok) { await load(); setMsg(msgTone(`Η συναίνεση για ${c.channel} ανακλήθηκε.`, 'ok')); }
    else setMsg(msgTone('Η ανάκληση απέτυχε.'));
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

      <Card pad={false}>
        <CardHeader micro="consent_records · GDPR" title="Συναινέσεις επικοινωνίας πελατών"
          className="px-5 pt-5"
          action={canWrite ? <Btn variant="brand" onClick={() => setAddOpen(true)}><Plus className="w-3.5 h-3.5" /> Νέα Συναίνεση</Btn> : undefined} />
        {loading && <div className="p-8 flex justify-center"><Spinner /></div>}
        {!loading && consents.length === 0 && (
          <EmptyState icon={Fingerprint} title="Δεν υπάρχουν συναινέσεις"
            hint="Καταγράψτε τη συναίνεση ενός πελάτη ανά κανάλι για να την λαμβάνει υπόψη η Πολιτική." />
        )}
        {!loading && consents.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-[13px]">
              <thead>
                <tr className="text-left micro text-ink/40 border-b border-line">
                  <th className="px-5 py-2.5 font-medium">Πελάτης</th>
                  <th className="px-3 py-2.5 font-medium">Κανάλι</th>
                  <th className="px-3 py-2.5 font-medium">Τύπος</th>
                  <th className="px-3 py-2.5 font-medium">Κατάσταση</th>
                  <th className="px-3 py-2.5 font-medium">Πηγή</th>
                  <th className="px-3 py-2.5 font-medium">Ενημέρωση</th>
                  <th className="px-3 py-2.5 text-right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {consents.map(c => {
                  const cust = custName.get(c.customer_id);
                  return (
                    <tr key={c.id} className="hover:bg-ink/[0.02]">
                      <td className="px-5 py-2.5">
                        <div className="font-medium text-ink">{cust?.full_name ?? 'Άγνωστος πελάτης'}</div>
                        {cust && <div className="micro text-ink/40 truncate max-w-[180px]">{cust.phone ?? cust.company ?? ''}</div>}
                      </td>
                      <td className="px-3 py-2.5"><Pill tone="blue">{c.channel}</Pill></td>
                      <td className="px-3 py-2.5 text-ink/70">{c.consent_type}</td>
                      <td className="px-3 py-2.5"><Pill tone={c.status === 'granted' ? 'green' : 'red'}>{c.status}</Pill></td>
                      <td className="px-3 py-2.5 text-ink/50">{c.source ?? '—'}</td>
                      <td className="px-3 py-2.5 micro text-ink/45 whitespace-nowrap">
                        {c.status === 'granted' ? fmtDateTime(c.consent_granted_at) : fmtDateTime(c.consent_revoked_at)}
                      </td>
                      <td className="px-3 py-2.5 text-right">
                        {canWrite && c.status === 'granted' && (
                          <Btn variant="outline" className="!px-2 !py-1 !text-[12px] text-bad-600" onClick={() => void revoke(c)}>
                            Ανάκληση
                          </Btn>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      <AddConsentModal open={addOpen} customers={customers} onClose={() => setAddOpen(false)}
        onAdded={async () => { await load(); setMsg(msgTone('Η συναίνεση καταγράφηκε.', 'ok')); }} />
    </div>
  );
}

function AddConsentModal({ open, customers, onClose, onAdded }: {
  open: boolean; customers: Customer[]; onClose: () => void; onAdded: () => Promise<void>;
}) {
  const [customerId, setCustomerId] = useState('');
  const [channel, setChannel] = useState<'email' | 'sms' | 'phone' | 'letter' | 'all'>('email');
  const [consentType, setConsentType] = useState('marketing');
  const [source, setSource] = useState('crm');
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!customerId) { setErr('Επιλέξτε πελάτη.'); return; }
    setBusy(true);
    const res = await addConsent({ customer_id: customerId, channel, consent_type: consentType, source });
    setBusy(false);
    if (!res.ok) { setErr(res.message ?? 'Αποτυχία καταγραφής.'); return; }
    await onAdded();
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title="Νέα Συναίνεση" micro="consent_records">
      <div className="space-y-3">
        {err && <div className="rounded-xl bg-bad-100 text-bad-600 text-[13px] px-4 py-2.5">{err}</div>}
        <Field label="Πελάτης *">
          <select className="field" value={customerId} onChange={e => setCustomerId(e.target.value)}>
            <option value="">Επιλέξτε…</option>
            {customers.map(c => <option key={c.id} value={c.id}>{c.full_name}{c.phone ? ` · ${c.phone}` : ''}</option>)}
          </select>
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Κανάλι">
            <select className="field" value={channel} onChange={e => setChannel(e.target.value as ConsentRecord['channel'])}>
              {(['email', 'sms', 'phone', 'letter', 'all'] as const).map(ch => <option key={ch} value={ch}>{ch}</option>)}
            </select>
          </Field>
          <Field label="Τύπος συναίνεσης">
            <select className="field" value={consentType} onChange={e => setConsentType(e.target.value)}>
              {['marketing', 'transactional', 'outbound_call', 'all'].map(t => <option key={t} value={t}>{t}</option>)}
            </select>
          </Field>
        </div>
        <Field label="Πηγή">
          <select className="field" value={source} onChange={e => setSource(e.target.value)}>
            {['crm', 'web_form', 'ai_capture', 'api'].map(s => <option key={s} value={s}>{s}</option>)}
          </select>
        </Field>
        <div className="flex justify-end gap-2 pt-1">
          <Btn variant="ghost" onClick={onClose}>Άκυρο</Btn>
          <Btn onClick={save} disabled={busy}>{busy ? <Spinner /> : 'Καταγραφή'}</Btn>
        </div>
      </div>
    </Modal>
  );
}