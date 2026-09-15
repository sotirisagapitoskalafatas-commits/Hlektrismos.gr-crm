import { useEffect, useMemo, useState } from 'react';
import {
  Bot, BotMessages, Activity, Users, ShieldCheck, Gauge, Crown, Clock,
  CheckCircle2, AlertTriangle, Ban, PauseCircle, ChevronRight, ChevronDown,
  Building2, Layers, KeyRound, XCircle, Sparkles, Search, HeartPulse, Minus,
} from 'lucide-react';
import type {
  ToolInfo, PolicyRule, PolicyEffect, ToolCallLogRow,
} from '@/lib/api';
import { fetchTools, fetchPolicyRules, fetchToolCallLogs } from '@/lib/api';
import { Card, Pill, Btn, Modal, EmptyState, Spinner, Micro } from '@/lib/ui';

type Autonomy = 1 | 2 | 3 | 4 | 51;

const AUTONOMY_LABEL: Record<string, string> = {
  1: 'Πρόταση', 2: 'Πρόταση + Έγκριση', 3: 'Εκτέλεση με Έλεγχο',
  4: 'Εκτέλεση', 5: 'Προσαρμοστική Εκτέλεση',
};

const EFFECT_LABEL: Record<PolicyEffect, string> = {
  allow: 'Αυτόνομο', require_approval: 'Με Έγκριση', deny: 'Αποκλεισμένο',
};

const PERM_LABEL: Record<string, string> = {
  crm_read: 'Ανάγνωση CRM', crm_write: 'Εγγραφή CRM', communication: 'Επικοινωνία',
  analytics: 'Αναλυτική', admin: 'Διαχείριση',
};

const DEPT_ICON: Record<string, any> = {
  crm_read: Search, crm_write: KeyRound, communication: BotMessages,
  analytics: Gauge, admin: ShieldCheck,
};

type Status = 'ACTIVE' | 'SHADOW' | 'PAUSED' | 'NEEDS_ATTENTION' | 'SUSPENDED' | 'OFFLINE';

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
  { id: 'versions', label: 'Έκδοση' },
];

function WhyModal({ log, onClose }: { log: ToolCallLogRow | null; onClose: () => void }) {
  return (
    <Modal open={!!log} onClose={onClose} title="Γιατί;">
      {log && (
        <div className="flex flex-col gap-3">
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">ΤΙ ΣΥΝΕΒΗ</div>
            <div className="mt-1 text-sm text-slate-200">{log.tool_key} · {log.status}</div>
            <div className="mt-1 font-mono text-[11px] text-slate-500">{typeof log.request === 'string' ? log.request.slice(0, 160) : JSON.stringify(log.request ?? {}).slice(0, 160)}</div>
          </div>
          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
            <div className="text-[11px] uppercase tracking-wider text-slate-500">ΓΙΑΤΙ</div>
            <div className="mt-1 text-sm text-slate-200">{log.error ?? 'Εκτελέστηκε σύμφωνα με την πολιτική'}</div>
            <div className="mt-1 text-[11px] text-slate-500">ΑΝΑΛΥΣΗ ΑΠΟΦΑΣΗΣ: DESIGNED / NOT CONNECTED</div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">ΑΠΟΤΕΛΕΣΜΑ</div>
              <div className="mt-1 text-sm text-slate-200">{log.status}{log.latency_ms != null ? ` · ${log.latency_ms}ms` : ''}</div>
            </div>
            <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
              <div className="text-[11px] uppercase tracking-wider text-slate-500">ΕΠΙΒΕΒΑΙΩΣΗ / ΕΓΚΡΙΣΗ</div>
              <div className="mt-1 text-sm text-slate-200">{log.caller_type}{log.caller_id ? ` · ${log.caller_id}` : ''}</div>
            </div>
          </div>
          <Btn onClick={onClose} className="w-full">Κλείσιμο</Btn>
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
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<ToolInfo | null>(null);
  const [tab, setTab] = useState('overview');
  const [why, setWhy] = useState<ToolCallLogRow | null>(null在想);
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
        if (mounted) setError(e instanceof Error ? e.message : 'Αδυναμία φόρτωσης');
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, []);

  const agents: AgentMeta[] = useMemo(() => {
    return tools.map((tool) => {
      const { effect, policy } = effectFor(tool, rules);
      const ll = logs.filter((l) => l.tool_key === tool.key);
      return { tool, effect, policy, logs: ll };
    });
  }, [tools, rules, logs]);

  const totalCalls = logs.length;
  const successes = logs.filter((l) => l.status === 'success').length;
  const denied = logs.filter((l) => l.status === 'denied').length;
  const approved = logs.filter((l) => l.status === 'approved').length;
  const errors = logs.filter((l) => l.status === 'error').length;
  const activeCount = agents.filter((a) => statusFrom(a.tool, a.logs, a.effect) === 'ACTIVE').length;
  const attentionCount = agents.filter((a) => statusFrom(a.tool, a.logs, a.effect) === 'NEEDS_ATTENTION').length;

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
    const done = doneToday(a.logs);
    const rate = successRate(a.logs);
    return (
      <button
        key={a.tool.key}
        onClick={() => { setSelected(a.tool); setTab('overview'); }}
        className="group flex flex-col gap-3 rounded-xl border border-slate-800 bg-slate-900/50 p-4 text-left transition-colors hover:border-slate-600"
      >
        <div className="flex items-start justify-between gap-2">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-700 bg-slate-800/60">
              <Bot className="h-5 w-5 text-slate-300" />
            </div>
            <div>
              <div className="text-sm font-semibold text-slate-100">{a.tool.name}</div>
              <div className="text-xs text-slate-500">{dept} · {a.tool.key}</div>
            </div>
          </div>
          <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] ${meta.cls}`}>
            <Icon className="h-3 w-3" /> {meta.label}
          </span>
        </div>
        <p className="text-xs text-slate-400 line-clamp-2">{a.tool.description}</p>
        <div className="flex flex-wrap items-center gap-2">
          <Pill className="bg-slate-800/60 text-slate-300 border-slate-700">L{autonomy} · {AUTONOMY_LABEL[autonomy]}</Pill>
          <Pill className="bg-slate-800/60 text-slate-300 border-slate-700">{EFFECT_LABEL[a.effect]}</Pill>
          <Pill className="bg-slate-800/60 text-slate-300 border-slate-700">{a.logs.length} κλήσεις</Pill>
        </div>
        <div className="grid grid-cols-3 gap-2 border-t border-slate-800 pt-3 text-center">
          <div>
            <div className="text-sm font-semibold text-emerald-300">{done}</div>
            <div className="text-[10px] text-slate-500">Σήμερα</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-100">{rate === null ? '—' : `${rate}%`}</div>
            <div className="text-[10px] text-slate-500">Επιτυχία</div>
          </div>
          <div>
            <div className="text-sm font-semibold text-slate-100">
              {a.logs.length ? new Date(a.logs[a.logs.length - 1].created_at).toLocaleDateString('el-GR') : '—'}
            </div>
            <div className="text-[10px] text-slate-500">Τελευταία</div>
          </div>
        </div>
      </button>
    );
  };

  return (
    <div className="flex flex-col gap-4">
      <Micro className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="text-sm font-semibold text-slate-100">ΑΙ Εργατικό Δυναμικό</div>
          <div className="text-xs text-slate-400">Οι AI εργαζόμενοι είναι τα πραγματικά εργαλεία, οι πολιτικές αυτονομίας και το ημερολόγιο κλήσεων του CRM.</div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Pill className="bg-emerald-500/15 text-emerald-300 border-emerald-500/40"><CheckCircle2 className="h-3 w-3" /> {activeCount} ενεργά</Pill>
          <Pill className="bg-slate-800/60 text-slate-300 border-slate-700"><Users className="h-3 w-3" /> {tools.length} εργαλεία</Pill>
          <Pill className="bg-slate-800/60 text-slate-300 border-slate-700"><Activity className="h-3 w-3" /> {totalCalls} κλήσεις</Pill>
          {attentionCount > 0 && (
            <Pill className="bg-amber-500/15 text-amber-300 border-amber-500/40"><AlertTriangle className="h-3 w-3" /> {attentionCount} προσοχή</Pill>
          )}
        </div>
      </Micro>

      {loading && <div className="flex justify-center py-16"><Spinner /></div>}

      {error && !loading && (
        <Card className="p-5 border-rose-500/40 bg-rose-500/5">
          <div className="text-sm text-rose-300">{error}</div>
        </Card>
      )}

      {!loading && !error && (
        <>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {agents.map(renderAgentCard)}
          </div>

          <Card className="p-4">
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Layers className="h-4 w-4 text-slate-400" /> Ιεραρχία ΑΙ (JARVIS)
            </div>
            <div className="flex flex-col gap-2">
              {Object.entries(tree).map(([cat, list]) => (
                <div key={cat}>
                  <button
                    onClick={() => setExpandedCat(expandedCat === cat ? null : cat)}
                    className="flex w-full items-center gap-2 rounded-lg px-2 py-1 text-left text-xs font-medium text-slate-300 hover:bg-slate-800/50"
                  >
                    {expandedCat === cat ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
                    <Building2 className="h-3 w-3 text-slate-500" /> {PERM_LABEL[cat] ?? cat} <span className="text-slate-500">({list.length})</span>
                  </button>
                  {expandedCat === cat && (
                    <div className="mt-1 ml-6 flex flex-col gap-1 border-l border-slate-800 pl-3">
                      {list.map((a) => (
                        <button
                          key={a.tool.key}
                          onClick={() => { setSelected(a.tool); setTab('overview'); }}
                          className="flex items-center gap-2 rounded-lg border border-slate-800 bg-slate-900/40 px-2 py-1.5 text-left text-xs text-slate-300 hover:border-slate-600"
                        >
                          <Bot className="h-3 w-3 text-slate-500" /> {a.tool.name}
                          <Pill className="ml-auto bg-slate-800/60 text-slate-400 border-slate-700">{EFFECT_LABEL[a.effect]}</Pill>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard label="Συνολικές κλήσεις" value={String(totalCalls)} sub="Από tool_call_log" hint="Ολόκληρο το ημερολόγιο" />
            <StatCard label="Επιτυχία" value={successes} sub={`${Math.round((successes / Math.max(totalCalls, 1)) * 100)}%`} hint="status = success" />
            <StatCard label="Έγκριση" value={approved} sub="Δεν απαιτεί ανθρώπινη έγκριση ακόμα" hint="status = approved" />
            <StatCard label="Σφάλματα" value={errors} sub="Απαιτούν προσοχή" hint="status = error" />
          </div>

          <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-4">
            <div className="flex items-center gap-2 text-sm font-semibold text-slate-100">
              <Activity className="h-4 w-4 text-slate-400" /> Ροή Δραστηριότητας
            </div>
            <div className="mt-2 text-[11px] text-slate-500">Πατήστε μία κλήση για να δείτε «Γιατί;» — DESIGNED / NO DATA όταν δεν υπάρχουν κλήσεις.</div>
            {logs.length ? (
              <div className="mt-3 flex flex-col gap-2">
                {logs.slice(0, 10).map((l, i) => (
                  <button
                    key={i}
                    onClick={() => setWhy(l)}
                    className="flex items-center justify-between gap-3 rounded-lg border border-slate-800 bg-slate-900/40 p-3 text-left hover:border-slate-600"
                  >
                    <div>
                      <div className="text-xs text-slate-200">{l.tool_key} · {l.caller_type}</div>
                      <div className="mt-0.5 font-mono text-[11px] text-slate-500">{typeof l.request === 'string' ? l.request.slice(0, 120) : '{}'}</div>
                    </div>
                    <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] ${
                      l.status === 'success' ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                      : l.status === 'error' ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                      : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                    }`}>{l.status}</span>
                  </button>
                ))}
              </div>
            ) : (
              <EmptyState icon={<BotMessages className="h-6 w-6" />} title="Καμία κλήση ακόμα" hint="DESIGNED / NO DATA — δεν έχει εκτελεστεί κανένα εργαλείο." />
            )}
          </div>
        </>
      )}

      {selected && (
        <Modal
          open={!!selected}
          onClose={() => setSelected(null)}
          title={selected.name}
          micro={`${deptOf(selected)} · ${selected.key}`}
        >
          <div className="flex flex-wrap gap-1">
            {OVERVIEW_TABS.map((t) => (
              <Btn key={t.id} variant={tab === t.id ? 'primary' : 'ghost'} onClick={() => setTab(t.id)} className="text-xs">{t.label}</Btn>
            ))}
          </div>
          <div className="mt-4">
            {tab === 'overview' && (
              (() => {
                const a = agents.find((x) => x.tool.key === selected.key);
                if (!a) return null;
                const st = statusFrom(a.tool, a.logs, a.effect);
                const meta = STATUS_META[st];
                const autonomy = autonomyFromEffect(a.effect);
                return (
                  <div className="flex flex-col gap-3">
                    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                      <div className="text-xs text-slate-400">Περιγραφή</div>
                      <div className="mt-1 text-sm text-slate-200">{a.tool.description}</div>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <StatCard label="Αυτονομία" value={`L${autonomy}`} sub={AUTONOMY_LABEL[autonomy]} hint="Από πολιτική" />
                      <StatCard label="Αποτέλεσμα Πολιτικής" value={EFFECT_LABEL[a.effect]} sub={a.policy ? `Κανόνας ${a.policy.id}` : 'Προεπιλεγμένο'} hint="Από policy_rules" />
                      <StatCard label="Κλήσεις" value={String(a.logs.length)} sub={`${doneToday(a.logs)} σήμερα`} hint="Από tool_call_log" />
                      <StatCard label="Επιτυχία" value={successRate(a.logs) === null ? '—' : `${successRate(a.logs)}%`} sub={st === 'SHADOW' ? 'Καμία δραστηριότητα' : meta.label} hint="Από tool_call_log" />
                    </div>
                  </div>
                );
              })()
            )}
            {tab === 'permissions' && (
              (() => {
                const a = agents.find((x) => x.tool.key === selected.key);
                if (!a) return null;
                const deptIcon = DEPT_ICON[a.tool.category] ?? Bot;
                const DeptIcon = deptIcon;
                return (
                  <div className="flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-xs text-slate-300">
                      <DeptIcon className="h-4 w-4 text-slate-400" /> {PERM_LABEL[a.tool.category] ?? a.tool.category}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <StatCard label="Αποτέλεσμα" value={EFFECT_LABEL[a.effect]} sub={a.policy ? `Κανόνας πολιτικής` : 'Προεπιλεγμένο'} hint="Από policy_rules" />
                      <StatCard label="Εμβέλεια" value={a.policy?.scope ?? 'all'} sub={a.policy?.subject_key ?? 'συνολικό'} hint="Από policy_rules" />
                    </div>
                    <div className="rounded-xl border border-slate-800 bg-slate-900/50 p-3">
                      <div className="text-[11px] text-slate-500">ΑΥΤΟΝΟΜΙΑ L1–L5</div>
                      <div className="mt-1 text-sm text-slate-200">L{autonomyFromEffect(a.effect)} — {AUTONOMY_LABEL[autonomyFromEffect(a.effect)]}</div>
                      <div className="mt-1 text-[11px] text-slate-500">Προαγωγή σε L4/L5: DESIGNED / NOT CONNECTED — δεν υπάρχει ακόμα ροή προαγωγής.</div>
                    </div>
                  </div>
                );
              })()
            )}
            {tab === 'queue' && (
              (() => {
                const a = agents.find((x) => x.tool.key === selected.key);
                if (!a) return null;
                return a.logs.length ? (
                  <div className="flex flex-col gap-2 max-h-80 overflow-y-auto">
                    {a.logs.map((l, i) => (
                      <div key={i} className="rounded-lg border border-slate-800 bg-slate-900/40 p-3">
                        <div className="flex items-center justify-between gap-2">
                          <div className="text-xs text-slate-200">{l.caller_type}{l.caller_id ? ` · ${l.caller_id}` : ''}</div>
                          <span className={`rounded-full border px-2 py-0.5 text-[11px] ${
                            l.status === 'success' ? 'border-emerald-500/40 bg-emerald-500/15 text-emerald-300'
                            : l.status === 'error' ? 'border-rose-500/40 bg-rose-500/15 text-rose-300'
                            : 'border-amber-500/40 bg-amber-500/15 text-amber-300'
                          }`}>{l.status}</span>
                        </div>
                        <div className="mt-1 font-mono text-[11px] text-slate-500">{typeof l.request === 'string' ? l.request.slice(0, 100) : '{}'}</div>
                        <button onClick={() => setWhy(l)} className="mt-2 flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300">
                          <ChevronRight className="h-3 w-3" /> Γιατί;
                        </button>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState icon={<BotMessages className="h-6 w-6" />} title="Καμία κλήση" hint="DESIGNED / NO DATA" />
                );
              })()
            )}
            {['skills', 'memory', 'activity', 'versions'].includes(tab) && (
              <EmptyState
                icon={tab === 'memory' ? <HeartPulse className="h-6 w-6" /> : <Layers className="h-6 w-6" />}
                title={tab === 'skills' ? 'Δεξιότητες' : tab === 'memory' ? 'Memory' : tab === 'activity' ? 'Δραστηριότητα' : 'Έκδοση'}
                hint="DESIGNED / NOT CONNECTED — δεν υπάρχει ακόμα backend για αυτή την προβολή."
              />
            )}
          </div>
        </Modal>
      )}

      <WhyModal log={why} onClose={() => setWhy(null)} />
    </div>
  );
}
