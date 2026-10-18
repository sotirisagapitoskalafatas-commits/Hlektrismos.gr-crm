/* «Παροχές» (staged phase5/17): the customer's electricity connections, each its own card. Home and business connections
   are independent: every card has its own editor and its own save, addressed by that connection's id, so saving one can
   never change another. Nothing is mandatory. Until the SQL is applied the tab is one neutral sentence — never an error. */

import { useState } from 'react';
import { Plus, Zap } from 'lucide-react';
import { archiveSupplyPoint, createSupplyPoint, linkCaseToSupplyPoint, linkDocumentToSupplyPoint, updateSupplyPoint } from '@/lib/api';
import type { Case, CaseDocument } from '@/lib/api';
import { docLabel } from '@/lib/documents';
import {
  METER_TYPE_LABEL, USAGES, USAGE_LABEL, contractText, draftErrors, draftFromPoint, emptyDraft, supplyLabelFor, supplyNumberError, supplyPointTitle, tariffOptions,
} from '@/lib/supply-points';
import type { MeterType, SupplyPoint, SupplyPointDraft, SupplyUsage, TariffCategory } from '@/lib/supply-points';
import { useToast } from '@/lib/toast';
import { fmtDate } from '@/lib/ui';

export const SUPPLY_UNAVAILABLE_TEXT = 'Η λειτουργία δεν είναι ακόμη διαθέσιμη.';

export type DocRow = CaseDocument & { case_no: string };
type Links = { points: SupplyPoint[]; cases: Case[]; docs: DocRow[]; reload: () => void };

/* The cases and documents of THIS connection, and the picker to link one more. A case or a document points at one
   connection (of the same customer — the database checks it); linking moves only that pointer. */
function SupplyLinks({ point, links, canEdit }: { point: SupplyPoint; links: Links; canEdit: boolean }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState(false);
  const mine = { cases: links.cases.filter(k => k.supply_point_id === point.id), docs: links.docs.filter(d => d.supply_point_id === point.id) };
  const otherCases = links.cases.filter(k => k.supply_point_id !== point.id);
  const otherDocs = links.docs.filter(d => d.supply_point_id !== point.id);
  const where = (id: string | null | undefined) => { const l = supplyLabelFor(links.points, id); return l ? ` (σε ${l})` : ''; };

  const run = async (op: Promise<string | null>, ok: string) => {
    if (busy) return;
    setBusy(true);
    const err = await op;
    setBusy(false);
    if (err) { toast(err, 'bad'); return; }
    toast(ok, 'ok');
    links.reload();
  };
  const row = 'flex items-center gap-2 flex-wrap text-[13.5px]';
  return (
    <div className="mt-4 pt-4 border-t border-[var(--atx-line)] grid gap-4 sm:grid-cols-2" data-supply-links={point.id}>
      <div data-supply-cases>
        <h3 className="text-[13px] font-semibold m-0 mb-1.5">Cases της παροχής</h3>
        {mine.cases.length === 0 ? <p className="m-0 text-[13px] text-[var(--atx-muted)]" data-supply-cases-empty>Κανένα case δεν συνδέεται με αυτή την παροχή.</p> : (
          <ul className="m-0 p-0 list-none space-y-1">
            {mine.cases.map(k => (
              <li key={k.id} className={row} data-supply-linked-case={k.case_no}>
                <span className="font-medium">{k.case_no}</span>
                {canEdit && <button className="atx-link !p-0 text-[12.5px]" disabled={busy} onClick={() => void run(linkCaseToSupplyPoint(k.id, null), 'Η σύνδεση αφαιρέθηκε.')} data-sp-unlink-case>Αφαίρεση σύνδεσης</button>}
              </li>
            ))}
          </ul>
        )}
        {canEdit && otherCases.length > 0 && (
          <select className="field mt-2 !py-1.5 text-[13px]" value="" disabled={busy} aria-label="Σύνδεση case" data-sp-link-case
            onChange={e => { if (e.target.value) void run(linkCaseToSupplyPoint(e.target.value, point.id), 'Το case συνδέθηκε.'); }}>
            <option value="">Σύνδεση case…</option>
            {otherCases.map(k => <option key={k.id} value={k.id}>{k.case_no}{where(k.supply_point_id)}</option>)}
          </select>
        )}
      </div>
      <div data-supply-docs>
        <h3 className="text-[13px] font-semibold m-0 mb-1.5">Έγγραφα της παροχής</h3>
        {mine.docs.length === 0 ? <p className="m-0 text-[13px] text-[var(--atx-muted)]" data-supply-docs-empty>Κανένα έγγραφο δεν συνδέεται με αυτή την παροχή.</p> : (
          <ul className="m-0 p-0 list-none space-y-1">
            {mine.docs.map(d => (
              <li key={d.id} className={row} data-supply-linked-doc={d.id}>
                <span className="font-medium">{docLabel(d.category)}</span>
                <span className="text-[var(--atx-muted)]">{d.file_name || 'χωρίς αρχείο'} · {d.case_no}</span>
                {canEdit && <button className="atx-link !p-0 text-[12.5px]" disabled={busy} onClick={() => void run(linkDocumentToSupplyPoint(d.id, null), 'Η σύνδεση αφαιρέθηκε.')} data-sp-unlink-doc>Αφαίρεση σύνδεσης</button>}
              </li>
            ))}
          </ul>
        )}
        {canEdit && otherDocs.length > 0 && (
          <select className="field mt-2 !py-1.5 text-[13px]" value="" disabled={busy} aria-label="Σύνδεση εγγράφου" data-sp-link-doc
            onChange={e => { if (e.target.value) void run(linkDocumentToSupplyPoint(e.target.value, point.id), 'Το έγγραφο συνδέθηκε.'); }}>
            <option value="">Σύνδεση εγγράφου…</option>
            {otherDocs.map(d => <option key={d.id} value={d.id}>{docLabel(d.category)} · {d.file_name || 'χωρίς αρχείο'} · {d.case_no}{where(d.supply_point_id)}</option>)}
          </select>
        )}
      </div>
    </div>
  );
}

const dash = (v: string | null | undefined) => (v && v.trim() !== '' ? v : '—');

/* The editor of ONE connection: its own draft, its own errors, its own save. */
function SupplyPointEditor({ point, tariffs, onSaved, onCancel }: { point: SupplyPoint; tariffs: TariffCategory[] | null; onSaved: () => void; onCancel: () => void }) {
  const { toast } = useToast();
  const [d, setD] = useState<SupplyPointDraft>(() => draftFromPoint(point));
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const errors = draftErrors(d);
  const set = <K extends keyof SupplyPointDraft>(k: K, v: SupplyPointDraft[K]) => setD(x => ({ ...x, [k]: v }));
  const options = tariffs && tariffs.length > 0 ? tariffOptions(tariffs, d.usage, d.tariff_category_code || point.tariff_category_code) : null;

  const save = async () => {
    if (busy || Object.keys(errors).length > 0) return;
    setBusy(true); setMsg(null);
    const r = await updateSupplyPoint(point.id, d);
    setBusy(false);
    if (r.error) { setMsg(r.error); toast(r.error, 'bad'); return; }
    toast('Η παροχή αποθηκεύτηκε.', 'ok');
    onSaved();
  };

  const label = 'text-[13px] font-medium';
  return (
    <div className="mt-4 pt-4 border-t border-[var(--atx-line)]" data-supply-editor={point.id}>
      <div className="grid sm:grid-cols-2 gap-3">
        <label className={label}>Χρήση
          <select className="field mt-1" value={d.usage} onChange={e => set('usage', e.target.value as SupplyUsage)} data-sp-field="usage">
            {USAGES.map(u => <option key={u} value={u}>{USAGE_LABEL[u]}</option>)}
          </select>
        </label>
        <label className={label}>Διεύθυνση ακινήτου
          <input className="field mt-1" value={d.property_address} onChange={e => set('property_address', e.target.value)} data-sp-field="address" />
        </label>
        <label className={label}>Αριθμός Παροχής
          <input className="field mt-1" inputMode="numeric" value={d.supply_number} onChange={e => set('supply_number', e.target.value)} aria-invalid={!!errors.supply_number} data-sp-field="number" placeholder="11 ψηφία (προαιρετικό)" />
          {errors.supply_number && <span className="block text-[12.5px] font-normal mt-1" style={{ color: 'var(--atx-red)' }} role="alert" data-sp-error="number">{errors.supply_number}</span>}
        </label>
        <label className={label}>Μετρητής / Ρολόι ΔΕΗ (αριθμός)
          <input className="field mt-1" value={d.meter_identifier} onChange={e => set('meter_identifier', e.target.value)} data-sp-field="meter" />
        </label>
        <label className={label}>Τύπος μετρητή
          <select className="field mt-1" value={d.meter_type} onChange={e => set('meter_type', e.target.value as MeterType | '')} data-sp-field="meter_type">
            <option value="">—</option>
            {(Object.keys(METER_TYPE_LABEL) as MeterType[]).map(t => <option key={t} value={t}>{METER_TYPE_LABEL[t]}</option>)}
          </select>
        </label>
        <label className={label}>Σημείωση μετρητή
          <input className="field mt-1" value={d.meter_note} onChange={e => set('meter_note', e.target.value)} data-sp-field="meter_note" />
        </label>
        <label className={label}>Κατηγορία τιμολογίου
          {options ? (
            <select className="field mt-1" value={d.tariff_category_code} onChange={e => set('tariff_category_code', e.target.value)} data-sp-field="category">
              <option value="">—</option>
              {options.map(o => <option key={o.code} value={o.code}>{o.label}{o.archived ? ' (εκτός λίστας)' : ''}</option>)}
            </select>
          ) : (
            <input className="field mt-1" value={d.tariff_category_code} onChange={e => set('tariff_category_code', e.target.value)} data-sp-field="category" />
          )}
        </label>
        <label className={label}>Ονομασία τιμολογίου ρεύματος
          <input className="field mt-1" value={d.tariff_name} onChange={e => set('tariff_name', e.target.value)} data-sp-field="tariff" />
        </label>
        <label className={label}>Ημερομηνία αίτησης
          <input className="field mt-1" type="date" value={d.application_date} onChange={e => set('application_date', e.target.value)} aria-invalid={!!errors.application_date} data-sp-field="applied" />
          {errors.application_date && <span className="block text-[12.5px] font-normal mt-1" style={{ color: 'var(--atx-red)' }} role="alert" data-sp-error="applied">{errors.application_date}</span>}
        </label>
        <label className={label}>Διάρκεια συμβολαίου (μήνες)
          <input className="field mt-1" inputMode="numeric" value={d.contract_months} onChange={e => set('contract_months', e.target.value)} aria-invalid={!!errors.contract_months} data-sp-field="months" />
          {errors.contract_months && <span className="block text-[12.5px] font-normal mt-1" style={{ color: 'var(--atx-red)' }} role="alert" data-sp-error="months">{errors.contract_months}</span>}
        </label>
        <label className={`${label} sm:col-span-2`}>Σημειώσεις
          <textarea className="field mt-1" rows={2} value={d.notes} onChange={e => set('notes', e.target.value)} data-sp-field="notes" />
        </label>
      </div>
      {msg && <p role="alert" className="text-[13px] mt-3 mb-0" style={{ color: 'var(--atx-red)' }} data-sp-save-error>{msg}</p>}
      <div className="flex gap-2 mt-4">
        <button className="atx-btn atx-btn-primary" disabled={busy || Object.keys(errors).length > 0} onClick={() => void save()} data-sp-save>{busy ? '…' : 'Αποθήκευση'}</button>
        <button className="atx-btn atx-btn-quiet" disabled={busy} onClick={onCancel} data-sp-cancel>Άκυρο</button>
      </div>
    </div>
  );
}

/* One connection. `position` is its number among the active ones; an archived connection has none. */
export function SupplyPointCard({ point, position, canEdit, tariffs, onChanged, links }: { point: SupplyPoint; position: number | null; canEdit: boolean; tariffs: TariffCategory[] | null; onChanged: () => void; links: Links }) {
  const { toast } = useToast();
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);
  const archived = !!point.archived_at;
  const numberWarning = point.supply_number_ok ? null : supplyNumberError(point.supply_number);

  const archive = async (value: boolean) => {
    if (busy) return;
    setBusy(true);
    const err = await archiveSupplyPoint(point.id, value);
    setBusy(false); setConfirming(false);
    if (err) { toast(err, 'bad'); return; }
    toast(value ? 'Η παροχή αρχειοθετήθηκε.' : 'Η παροχή επανήλθε.', 'ok');
    onChanged();
  };

  return (
    <div className="atx-panel" style={{ padding: 20, opacity: archived ? 0.75 : 1 }} data-supply-card={position ?? 'archived'} data-supply-usage={point.usage} data-supply-id={point.id}>
      <div className="flex items-center gap-2.5 flex-wrap mb-3">
        <span className="atx-icon" aria-hidden="true"><Zap size={16} /></span>
        <h2 className="atx-section-title m-0" data-supply-title>{position ? supplyPointTitle(position, point.usage) : `Αρχειοθετημένη — ${USAGE_LABEL[point.usage]}`}</h2>
        {point.needs_review && <span className="atx-tag t-warning" data-supply-review>Προς έλεγχο</span>}
        <span className="flex-1" />
        {canEdit && !archived && !editing && <button className="atx-btn atx-btn-quiet" onClick={() => setEditing(true)} data-sp-edit>Επεξεργασία</button>}
        {canEdit && archived && <button className="atx-btn atx-btn-quiet" disabled={busy} onClick={() => void archive(false)} data-sp-restore>Επαναφορά</button>}
      </div>
      <dl className="m-0 grid grid-cols-[auto_1fr] gap-x-4 gap-y-1.5 text-[14px]">
        <dt className="text-[var(--atx-muted)]">Διεύθυνση ακινήτου</dt><dd className="m-0 font-medium" data-supply-field="address">{dash(point.property_address)}</dd>
        <dt className="text-[var(--atx-muted)]">Αριθμός Παροχής</dt>
        <dd className="m-0 font-medium" data-supply-field="number">{dash(point.supply_number)}{numberWarning && <span className="block text-[12.5px] font-normal" style={{ color: 'var(--atx-amber)' }} data-supply-number-warning>{numberWarning}</span>}</dd>
        <dt className="text-[var(--atx-muted)]">Μετρητής / Ρολόι ΔΕΗ</dt>
        <dd className="m-0 font-medium" data-supply-field="meter">{[point.meter_identifier, point.meter_type ? METER_TYPE_LABEL[point.meter_type] : null, point.meter_note].filter(Boolean).join(' · ') || '—'}</dd>
        <dt className="text-[var(--atx-muted)]">Κατηγορία τιμολογίου</dt><dd className="m-0 font-medium" data-supply-field="category">{dash(point.tariff_category_code)}</dd>
        <dt className="text-[var(--atx-muted)]">Ονομασία τιμολογίου</dt><dd className="m-0 font-medium" data-supply-field="tariff">{dash(point.tariff_name)}</dd>
        <dt className="text-[var(--atx-muted)]">Ημερομηνία αίτησης</dt><dd className="m-0 font-medium" data-supply-field="applied">{point.application_date ? fmtDate(point.application_date) : '—'}</dd>
        <dt className="text-[var(--atx-muted)]">Διάρκεια συμβολαίου</dt><dd className="m-0 font-medium" data-supply-field="contract">{dash(contractText(point.contract_months))}</dd>
        {point.notes && (<><dt className="text-[var(--atx-muted)]">Σημειώσεις</dt><dd className="m-0 font-medium whitespace-pre-line" data-supply-field="notes">{point.notes}</dd></>)}
      </dl>
      {!archived && <SupplyLinks point={point} links={links} canEdit={canEdit} />}
      {editing && !archived && <SupplyPointEditor point={point} tariffs={tariffs} onSaved={() => { setEditing(false); onChanged(); }} onCancel={() => setEditing(false)} />}
      {canEdit && !archived && !confirming && !editing && <button className="atx-link mt-3 !p-0 text-[13px]" onClick={() => setConfirming(true)} data-sp-archive>Αρχειοθέτηση παροχής</button>}
      {canEdit && confirming && (
        <div className="mt-3 flex items-center gap-2 flex-wrap text-[13px]" data-sp-archive-box>
          <span>Η παροχή δεν διαγράφεται· μπορείτε να την επαναφέρετε.</span>
          <button className="atx-btn atx-btn-quiet" disabled={busy} onClick={() => void archive(true)} data-sp-archive-confirm>Αρχειοθέτηση</button>
          <button className="atx-btn atx-btn-quiet" disabled={busy} onClick={() => setConfirming(false)}>Άκυρο</button>
        </div>
      )}
    </div>
  );
}

export default function SupplyPointsTab({ customerId, points, tariffs, cases, docs, canEdit, reload }: {
  customerId: string;
  /** this customer's cases and their documents, for the links on each card */
  cases: Case[];
  docs: DocRow[];
  /** undefined = still loading; null = the SQL is not applied yet */
  points: SupplyPoint[] | null | undefined;
  /** the configurable category list; null = unavailable (the field becomes plain text) */
  tariffs: TariffCategory[] | null;
  canEdit: boolean;
  reload: () => void;
}) {
  const { toast } = useToast();
  const [choosing, setChoosing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showArchived, setShowArchived] = useState(false);

  if (points === undefined) return <div className="atx-panel">{[0, 1].map(i => <div key={i} className="atx-skeleton" />)}</div>;
  if (points === null) {
    return <div className="atx-panel"><div className="atx-empty" data-supply-unavailable><strong>Παροχές</strong>{SUPPLY_UNAVAILABLE_TEXT}</div></div>;
  }

  const active = points.filter(p => !p.archived_at);
  const archived = points.filter(p => !!p.archived_at);
  const links: Links = { points, cases, docs, reload };
  const add = async (usage: SupplyUsage) => {
    if (busy) return;
    setBusy(true);
    const r = await createSupplyPoint(customerId, emptyDraft(usage));
    setBusy(false);
    setChoosing(false);
    if (r.error) { toast(r.error, 'bad'); return; }
    toast('Η παροχή προστέθηκε.', 'ok');
    reload();
  };

  return (
    <div className="space-y-4" data-supply-tab>
      <div className="flex items-center gap-3 flex-wrap">
        <p className="m-0 text-[13px] text-[var(--atx-muted)] flex-1 min-w-[220px]">
          Κάθε παροχή (οικιακή ή επαγγελματική) είναι ανεξάρτητη: δική της διεύθυνση, αριθμός παροχής, τιμολόγιο και έγγραφα.
        </p>
        {canEdit && !choosing && <button className="atx-btn atx-btn-primary inline-flex items-center gap-1.5" onClick={() => setChoosing(true)} data-supply-add><Plus size={15} aria-hidden="true" /> Νέα παροχή</button>}
        {canEdit && choosing && (
          <span className="inline-flex items-center gap-2" data-supply-choose>
            {USAGES.map(u => <button key={u} className="atx-btn atx-btn-quiet" disabled={busy} onClick={() => void add(u)} data-supply-new={u}>{USAGE_LABEL[u]}</button>)}
            <button className="atx-btn atx-btn-quiet" disabled={busy} onClick={() => setChoosing(false)}>Άκυρο</button>
          </span>
        )}
      </div>
      {active.length === 0 ? (
        <div className="atx-panel"><div className="atx-empty" data-supply-empty><strong>Καμία παροχή ακόμη</strong>Προσθέστε μια οικιακή ή επαγγελματική παροχή του πελάτη με το «Νέα παροχή».</div></div>
      ) : active.map((p, i) => <SupplyPointCard key={p.id} point={p} position={i + 1} canEdit={canEdit} tariffs={tariffs} onChanged={reload} links={links} />)}
      {archived.length > 0 && (
        <div data-supply-archived>
          <button className="atx-link !p-0 text-[13px]" aria-expanded={showArchived} onClick={() => setShowArchived(v => !v)} data-supply-archived-toggle>
            {showArchived ? 'Απόκρυψη' : 'Εμφάνιση'} αρχειοθετημένων παροχών ({archived.length})
          </button>
          {showArchived && <div className="space-y-4 mt-3">{archived.map(p => <SupplyPointCard key={p.id} point={p} position={null} canEdit={canEdit} tariffs={tariffs} onChanged={reload} links={links} />)}</div>}
        </div>
      )}
    </div>
  );
}
