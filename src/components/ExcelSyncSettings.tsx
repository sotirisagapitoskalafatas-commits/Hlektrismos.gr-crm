import React, { useState } from 'react';
import { supabase } from '../lib/supabase';

function parseCSV(text: string): Record<string, string>[] {
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) return [];
  const parseRow = (line: string): string[] => {
    const cells: string[] = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQuotes) {
        if (ch === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') { current += '"'; i++; }
          else { inQuotes = false; }
        } else { current += ch; }
      } else {
        if (ch === '"') { inQuotes = true; }
        else if (ch === ',') { cells.push(current.trim()); current = ''; }
        else { current += ch; }
      }
    }
    cells.push(current.trim());
    return cells;
  };
  const headers = parseRow(lines[0]);
  return lines.slice(1).map(line => {
    const values = parseRow(line);
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = values[i] || ''; });
    return row;
  });
}

function parseExcelXML(text: string): Record<string, string>[] {
  const parser = new DOMParser();
  const doc = parser.parseFromString(text, 'text/xml');
  const rows = doc.querySelectorAll('Row');
  if (rows.length < 2) return [];
  const getCellText = (row: Element, idx: number): string => {
    const cells = row.querySelectorAll('Cell');
    const cell = cells[idx];
    if (!cell) return '';
    const v = cell.querySelector('Value');
    const t = cell.getAttribute('t');
    if (t === 's') {
      const si = parseInt(v?.textContent || '0', 10);
      const ssts = doc.querySelectorAll('SharedStrings Si');
      return ssts[si]?.querySelector('T')?.textContent || v?.textContent || '';
    }
    return v?.textContent || '';
  };
  const numCols = rows[0].querySelectorAll('Cell').length;
  const headers: string[] = [];
  for (let c = 0; c < numCols; c++) headers.push(getCellText(rows[0], c));
  const results: Record<string, string>[] = [];
  for (let r = 1; r < rows.length; r++) {
    const row: Record<string, string> = {};
    headers.forEach((h, i) => { row[h] = getCellText(rows[r], i); });
    results.push(row);
  }
  return results;
}

export const ExcelSyncSettings: React.FC = () => {
  const [uploading, setUploading] = useState(false);
  const [log, setLog] = useState('');
  const [stats, setStats] = useState<{ inserted: number; duplicates: number } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, targetTable: 'hlektrismos_leads' | 'hlektrismos_customers') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setLog('Reading file...');
    setStats(null);

    try {
      const text = await file.text();
      let data: Record<string, string>[];

      if (file.name.endsWith('.csv') || file.name.endsWith('.txt')) {
        data = parseCSV(text);
      } else if (file.name.endsWith('.xml') || file.name.endsWith('.xlsx') || file.name.endsWith('.xls')) {
        data = parseExcelXML(text);
      } else {
        data = parseCSV(text);
      }

      if (data.length === 0) {
        setLog('No data rows found in file.');
        setUploading(false);
        return;
      }

      setLog(`Found ${data.length} records. Importing to CRM...`);

      const mappedRows = data.map((row) => ({
        first_name: (row['Ονοματεπώνυμο'] || row['Name'] || row['Όνομα'] || 'Unknown').split(' ')[0],
        last_name: (row['Ονοματεπώνυμο'] || row['Name'] || row['Όνομα'] || '').split(' ').slice(1).join(' '),
        email: row['Email'] || row['email'] || null,
        phone: row['Τηλέφωνο'] || row['Phone'] || row['phone'] || null,
        afm: row['ΑΦΜ'] || row['AFM'] || null,
        company_name: row['Επωνυμία'] || row['Company'] || row['Εταιρεία'] || null,
        customer_category: (row['Τύπος'] || row['Type'] || '').includes('B2B') ? 'B2B_Corporate' : 'B2C',
        status: 'new',
      }));

      if (targetTable === 'hlektrismos_leads') {
        const { error } = await supabase.from('hlektrismos_leads').insert(mappedRows);
        if (error) throw error;
      } else {
        const customerRows = mappedRows.map((r) => ({
          full_name: `${r.first_name} ${r.last_name}`.trim(),
          company_name: r.company_name,
          afm: r.afm,
          email: r.email,
          phone: r.phone,
          customer_type: r.customer_category === 'B2B_Corporate' ? 'B2B' : 'B2C',
          active_provider: 'Unknown',
          active_program: 'Unknown',
          pipeline_stage: 'intro',
        }));
        const { error } = await supabase.from('hlektrismos_customers').insert(customerRows);
        if (error) throw error;
      }

      setLog(`Successfully imported ${mappedRows.length} records to ${targetTable}!`);
      setStats({ inserted: mappedRows.length, duplicates: 0 });
    } catch (err: any) {
      setLog(`Import error: ${err.message}`);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ padding: 24, background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Excel / CSV Data Sync Engine</h3>
      <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--text-muted)' }}>Import leads or customers from CSV/Excel files with Greek header mapping. For .xlsx files, save as CSV first from Excel.</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ padding: 16, background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <p style={{ fontWeight: 600, fontSize: 13, margin: '0 0 8px', color: 'var(--text)' }}>Import Leads</p>
          <input type="file" accept=".csv,.txt" onChange={(e) => handleFileUpload(e, 'hlektrismos_leads')} disabled={uploading}
            style={{ fontSize: 12 }} />
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>Headers: Ονοματεπώνυμο, Τηλέφωνο, Email, ΑΦΜ, Επωνυμία, Τύπος</p>
        </div>
        <div style={{ padding: 16, background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <p style={{ fontWeight: 600, fontSize: 13, margin: '0 0 8px', color: 'var(--text)' }}>Import Customers</p>
          <input type="file" accept=".csv,.txt" onChange={(e) => handleFileUpload(e, 'hlektrismos_customers')} disabled={uploading}
            style={{ fontSize: 12 }} />
          <p style={{ fontSize: 11, color: 'var(--text-muted)', margin: '6px 0 0' }}>Headers: Ονοματεπώνυμο, Τηλέφωνο, Email, ΑΦΜ, Επωνυμία, Τύπος</p>
        </div>
      </div>

      {log && (
        <div style={{ marginTop: 16, padding: 12, background: 'var(--bg)', borderRadius: 8, fontSize: 12, fontFamily: 'monospace', color: 'var(--text-muted)' }}>
          {log}
        </div>
      )}
      {stats && (
        <div style={{ marginTop: 8, fontSize: 12, color: 'var(--text-muted)' }}>
          Inserted: {stats.inserted} | Duplicates skipped: {stats.duplicates}
        </div>
      )}
    </div>
  );
};
