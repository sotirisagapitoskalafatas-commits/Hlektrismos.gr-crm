import { useEffect, useMemo, useState } from 'react';
import {
  Bot, Activity, Users, ShieldCheck, Gauge, Crown, Clock,
  CheckCircle2, AlertTriangle, Ban, PauseCircle, ChevronRight, ChevronDown,
  Building2, Layers, KeyRound, XCircle, Sparkles, Search, HeartPulse, Minus, CircleDot,
} from 'lucide-react';
import type {
  ToolInfo, PolicyRule, PolicyEffect, ToolCallLogRow,
} from '@/lib/api';
import { fetchTools, fetchPolicyRules, fetchToolCallLogs } from '@/lib/api';
import { Card, Pill, Btn, Modal, EmptyState, Spinner, Micro } from '@/lib/ui';

type Autonomy = 1 | 2 | 3 | 4 | 5;
type Status = 'ACTIVE' | 'SHADOW' | 'PAUSED' | 'NEEDS_ATTENTION' | 'SUSPENDED' | 'OFFLINE';

const AUTONOMY_LABEL: Record<number, string> = {
  1: 'Πρόταση', 2: 'Πρόταση + Έγκριση', 3: 'Εκτέλεση με Έλεγχο',
  4: 'Εκτέλεση', 5: 'Προσαρμοστική Εκτέλεση',
};

const EFFECT_LABEL: Record<PolicyEffect, string> = {
  allow: 'Αυτόνομο', require_approval: 'Με Έγκριση', deny: 'Αποκλεισμένο',
};

const PERM_LABEL: Record<string, string> = {
  crm_read: 'Ανάγνωση CRM', crm_write: 'Εγγραφή CRM', communication: 'Επικοινωνία',
  analytics: 'Αναλυτικά', admin: 'Διαχείριση',
};

const STATUS_META: Record<Status, { label: string; cls: string; icon: any }> = {
  ACTIVE: { label: 'Ενεργό', cls: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/40', icon: CheckCircle2 },
  SHADOW: { label: 'Shadow', cls: 'bg-sky-500/15 text-sky-300 border-sky-500/40', icon: Sparkles },
  PAUSED: { label: 'Σε Παύση', cls: 'bg-slate-500/15 text-slate-300 border-slate-500/40', icon: PauseCircle },
  NEEDS_ATTENTION: { label: 'Χρειάζεται Προσοχή', cls: 'bg-amber-500/15 text-amber-300 border-amber-500/40', icon: AlertTriangle },
  SUSPENDED: { label: 'Αναστολή', cls: 'bg-rose-500/15 text-rose-300 border-rose-500/40', icon: Ban },
  OFFLINE: { label: 'Εκτός Σύνδεσης', cls: 'bg-slate-800/60 text-slate-300 border-slate-700', icon: Clock },
};

type AgentMeta = {
  tool: ToolInfo;
  effect: PolicyEffect;
  policy: PolicyRule | undefined;
  logs: ToolCallLogRow[];
};

function effectFor(tool: ToolInfo, rules: PolicyRule[]): { effect: PolicyEffect; policy?: PolicyRule } {
  const subject = 'subject_key' in tool && typeof tool.subject_key === 'string' ? tool.subject_key : tool.key;
  const match = rules
    .filter((r) => r.is_active && r.resource === tool.key && (r.subject_key === subject || r.subject_key === null || r.subject_key === undefined))
    .sort((a, b) => (b.priority ?? 0) - (a.priority ?? 0))[0];
  if (match) return { effect: match.effect, policy: match };
  return { effect: 'allow' };
}

function autonomyFromEffect(e: PolicyEffect): Autonomy {
  return e === 'allow' ? 3 : e === 'require_approval' ? 2 : 1;
}

function statusFrom(tool: ToolInfo, logs: ToolCallLogRow[], effect: PolicyEffect): Status {
  if (!tool.is_active) return 'PAUSED';
  if (effect === 'deny') return 'SUSPENDED';
  const recent = logs.slice(0, 10);
  const err = recent.some((l) => l.status === 'error' || l.status === 'denied');
  if (!logs.length) return 'SHADOW';
  if (err) return 'NEEDS_ATTENTION';
  return 'ACTIVE';
}

function deptOf(tool: ToolInfo): string {
  return PERM_LABEL[tool.category] ?? tool.category ?? '—';
}

function doneToday(logs: ToolCallLogRow[]): number {
  const t0 = new Date(); t0.setHours(0, 0, 0, 0);
  return logs.filter((l) => l.status === 'success' && new Date(l.created_at) >= t0).length;
}

function successRate(logs: ToolCallLogRow[]): number | null {
  const total = logs.length;
  if (!total) return null;
  const ok = logs.filter((l) => l.status === 'success').length;
  return Math.round((ok / total) * 100);
}

function StatCard({ label, value, sub, hint }: { label: string; value: string; sub?: string; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
      <div className="text-[11px] uppercase tracking-wider text-slate-500">{label}</div>
      <div className="mt-1 text-xl font-semibold text-slate-100">{value}</div>
      {sub && <div className="text-xs text-slate-400">{sub}</div>}
      {hint && <div className="mt-1 text-[10px] text-slate-500">{hint}</div>}
    </div>
  );
}

const OVERVIEW_TABS = [
  { id: 'overview', label: 'Επισκόπηση' },
  { id: 'permissions', label: 'Δικαιώματα' },
  { id: 'queue', label: 'Work Queue' },
  { id: 'skills', label: 'Δεξιότητες' },
  { id: 'memory', label: 'Memory' },
  { id: 'activity', label: 'Δραστηριότητα' },
  { id: 'versions', label: 'Εκδοση' },
];

function WhyModal({ log, onClose }: { log: ToolCallLogRow | null; onClose: () => void }) {
  return (
    <Modal open={!!log} onClose={onClose} title="Γιατί;">
      {log && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">ΤΙΒ ΕΞΟΔΟΣ</div>
            <div className="mt-1 text-sm text-slate-200">{log.tool_key} · {log.status}</div>
            <div className="mt-1 font-mono text-[11px] text-slate-500">{typeof log.request === 'string' ? log.request.slice(0, 160) : JSON.stringify(log.request ?? {}).slice(0, 160)}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">ΑΠΟΤΕΛΕΣΜΑ</div>
            <div className="mt-1 text-sm text-slate-200">{log.error ?? 'Εκτελέστηκε σύμφωνα με την πολιτική'}</div>
          </div>
        </div>
      )}
    </Modal>
  );
}

export default function AIWorkforcePage() {
  const [tools, setTools] = useState<ToolInfo[]>([]);
  const [rules, setRules] = useState<PolicyRule[]>([]);
  const [logs, setLogs] = useState<ToolCallLogRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState('overview');
  const [selected, setSelected] = useState<ToolInfo | null>(null);
  const [why, setWhy] = useState<ToolCallLogRow | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedCat, setExpandedCat] = useState<string | null>('crm_read');

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const [t, r, l] = await Promise.all([fetchTools(), fetchPolicyRules(), fetchToolCallLogs(50)]);
        if (!mounted) return;
        setTools(t ?? []);
        setRules(r ?? []);
        setLogs(l ?? []);
      } catch (e) {
        if (mounted) setError(e instanceof Error ? e.message : 'Σφάλμα φόρτωσης');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const agents: AgentMeta[] = useMemo(() => {
    return tools.map((tool) => {
      const { effect, policy } = effectFor(tool, rules);
      return { tool, effect, policy, logs: logs.filter((l) => l.tool_key === tool.key) };
    });
  }, [tools, rules, logs]);

  const activeCount = agents.filter((a) => statusFrom(a.tool, a.logs, a.effect) === 'ACTIVE').length;
  const attentionCount = agents.filter((a) => statusFrom(a.tool, a.logs, a.effect) === 'NEEDS_ATTENTION').length;
  const totalCalls = logs.length;
  const errors = logs.filter((l) => l.status === 'error').length-1;

  const tree = useMemo(() => {
    const m: Record<string, AgentMeta[]> = {};
    agents.forEach((a) => {
      (m[a.tool.category ?? 'other'] ??= []).push(a);
    });
    return m;
  }, [agents]);

  const renderAgentCard = (a: AgentMeta) => {
    const st = statusFrom(a.tool, a.logs, a.effect);
    const meta = STATUS_META[st];
    const Icon = meta.icon;
    const autonomy = autonomyFromEffect(a.effect);
    const dept = deptOf(a.tool);
    return (
      <Btn key={a.tool.key} onClick={() => { setSelected(a.tool); setTab('overview'); }} className="flex flex-col gap-3 rounded-xl border border-slate-800 bg-white p-4 text-left hover:border-slate-400">
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 bg-slate-50">
              <Bot className="h-5 w-5 text-sky-600" />
            </div>
            <div>
              <div className="text-sm font-semibold text-navy-900">{a.tool.name}</div>
              <div className="text-xs text-slate-500">{dept} · {a.tool.key}</div>
            </div>
          </div>
          <span className={`inline-flex items-center gap-2 rounded-full border px-2 py-0.5 text-[11px] ${meta.cls}`}>
            <Icon className="h-3 w-3" /> {meta.label}
          </span>
        </div>
        <p className="text-xs leading-5 text-slate-600 line-clamp-2">{a.tool.description}</p>
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-1 text-xs text-slate-600">
            <Gauge className="h-3.5 w-3.5 text-sky-600" /> L{autonomy} · {AUTONOMY_LABEL[autonomy]}
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-600">
            <ShieldCheck className="h-3.5 w-3.5 text-sky-600" /> {EFFECT_LABEL[a.effect]}
          </div>
          <div className="flex items-center gap-1 text-xs text-slate-600">
            <Activity className="h-3.5 w-3.5 text-slate-400" /> {a.logs.length} κλήσεις
          </div>
        </div>
      </Btn>
    );
  };

  return (
    <div className="flex flex-col gap-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-xl font-semibold text-navy-900">
            <Bot className="h-5 w-5 text-sky-600" /> AI Εργατικό Δυναμικό
          </div>
          <p className="mt-1 text-sm text-slate-500">
            Τα πραγματικά εργαλεία και οι πολιτικές αυτονομίας που εκτελούν εργασία στο CRM.
          </p>
        </div>
        <Pill className="hidden items-center gap-1.5 border border-slate-200 bg-white text-slate-600 sm:inline-flex">
          <CircleDot className="h-3 w-3 text-emerald-600" /> {activeCount} ενεργά
        </Pill>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="Σύνολο εργαλείων" value={String(tools.length)} sub={`${activeCount} ενεργά`} hint="Μετρημένο από policy_rules" />
        <StatCard label="Κλήσεις σήμερα" value={String(doneToday(logs))} sub={`${successRate(logs) ?? 0}% επιτυχία`} hint="status = success" />
        <StatCard label="Χρειάζονται προσοχή" value={String(attentionCount)} sub="status = needs_attention" hint="Από tool_call_log" />
        <StatCard label="Λάθη" value={String(errors)} sub="status = error" hint="Από tool_call_log" />
      </div>

      {loading && <div className="flex justify-center py-16"><Spinner /></div>}

      {error && !loading && (
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-5">
          <div className="text-sm text-rose-600">{error}</div>
        </div>
      )}

      {!loading && !error && (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {agents.map(renderAgentCard)}
        </div>
      )}

      <Card className="p-4">
        <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-navy-900">
          <Layers className="h-4 w-4 text-sky-600" /> Ιεραρχία ΑΒ (JARVIS)
        </div>
        <div className="flex flex-col gap-2">{(Object.entries(tree) ?? []).map(([cat, list]) => (
          <div key={cat}>
            <button
              onClick={() => setExpandedCat(expandedCat === cat ? null : cat)}
              className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs font-medium text-navy-900 hover:bg-slate-50"
            >
              {expandedCat === cat ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
              <Building2 className="h-3 w-3 text-slate-400" /> {PERM_LABEL[cat] ?? cat} <span className="text-slate-400">({list.length})</span>
            </button>
            {expandedCat === cat && (
              <div className="mt-1 ml-6 flex flex-col gap-1 border-l border-slate-200 pl-3">
                {list.map((a) => (
                  <button
                    key={a.tool.key}
                    onClick={() => { setSelected(a.tool); setTab('overview'); }}
                    className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-left text-xs text-navy-900 hover:border-slate-400"
                  >
                    <Bot className="h-3 w-3 text-slate-400" /> {a.tool.name}
                    <Pill className="ml-auto bg-slate-50 text-slate-500 border-slate-200">{EFFECT_LABEL[a.effect]}</Pill>
                  </button>
                ))}
              </div>
            )}
          </div>
        ))}</div>
      </Card>

      {selected && (
        <Modal open={!!selected} onClose={() => setSelected(null)} title={selected.name} micro={selected.key}>
          <div className="flex flex-wrap gap-2">
            {OVERVIEW_TABS.map((t) => (
              <Btn key={t.id} variant={tab === t.id ? 'primary' : 'ghost'} onClick={() => setTab(t.id)} className="text-xs">
                {t.label}
              </Btn>
            ))}
          </div>
          <div className="mt-4 flex flex-col gap-4">
            {tab === 'overview' && (
              (() => {
                const a = agents.find((x) => x.tool.key === selected.key);
                if (!a) return <EmptyState icon={Bot} title="Δεν υπάρχουν δεδομένα" hint="Δεν βρέθηκε εργαλείο." />;
                const st = statusFrom(a.tool, a.logs, a.effect);
                const meta = STATUS_META[st];
                const autonomy = autonomyFromEffect(a.effect);
                return (
                  <div className="flex flex-col gap-3">
                    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="text-[11px] uppercase tracking-wider text-slate-500">Περιγραφή</div>
                      <div className="mt-1 text-sm text-slate-700">{a.tool.description}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <StatCard label="Αυτονομία" value={`L${autonomy}`} sub={AUTONOMY_LABEL[autonomy]} hint="Από πολιτική" />
                      <StatCard label="Αποτέλεσμα Πολιτικής" value={EFFECT_LABEL[a.effect]} sub={a.policy ? `Κανόνας ${a.policy.id}` : 'Προεπιλεγμένο'} hint="Από policy_rules" />
                      <StatCard label="Κλήσεις" value={String(a.logs.length)} sub={`${doneToday(a.logs)} σήμερα`} hint="Από tool_call_log" />
                      <StatCard label="Ποσοστό επιτυχίας" value={successRate(a.logs) === null ? '—' : `${successRate(a.logs)}%`} sub={meta.label} hint="Από tool_call_log" />
                    </div>
                  </div>
                );
              })()
            )}
            {tab === 'activity' && (
              (() => {
                const a = agents.find((x) => x.tool.key === selected.key);
                if (!a) return <EmptyState icon={Bot} title="Καμία κλήση" hint="Δεν υπάρχουν καταγραφές για αυτό το εργαλείο." />;
                return a.logs.length ? (
                  <div className="flex flex-col gap-2">
                    {a.logs.slice(0, 10).map((l, i) => (
                      <button
                        key={i}
                        onClick={() => setWhy(l)}
                        className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-white p-3 text-left hover:border-slate-400"
                      >
                        <div>
                          <div className="text-xs text-slate-700">{l.caller_type} {l.caller_id ? ` · ${l.caller_id}` : ''}</div>
                          <div className="mt-0.5 font-mono text-[11px] text-slate-500">{typeof l.request === 'string' ? l.request.slice(0, 120) : '{}'}</div>
                        </div>
                        <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
                          l.status === 'success' ? 'border-emerald-200 bg-emerald-50 text-emerald-600'
                          : l.status === 'error' ? 'border-rose-200 bg-rose-50 text-rose-600'
                          : 'border-amber-200 bg-amber-50 text-amber-600'
                        }`}>{l.status}</span>
                      </button>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={Bot} title="Καμία κλήση" hint="DESIGNED / NO DATA — δεν έχει υπάρξει ακόμη κλήση προς αυτό το εργαλείο." />
                );
              })()
            )}
            {['permissions', 'queue', 'skills', 'memory', 'versions'].includes(tab) && (
              <EmptyState
                icon={tab === 'memory' ? HeartPulse : Layers}
                title={tab === 'permissions' ? 'Δικαιώματα' : tab === 'queue' ? 'Work Queue' : tab === 'skills' ? 'Δεξιότητες' : tab === 'memory' ? 'Memory' : 'Εκδόσεις'}
                hint="Δεν υπάρχουν ακόμη δεδομένα για αυτή την ενότητα."
              />
            )}
          </div>
          <Btn onClick={() => setSelected(null)} className="mt-4 w-full">Κλείσιμο</Btn>
        </Modal>
      )}

      <WhyModal log={why} onClose={() => setWhy(null)} />
    </div>
  );
}
