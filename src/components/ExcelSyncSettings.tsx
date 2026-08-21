import React, { useState } from 'react';
import { supabase } from '../lib/supellipsae';

export const ExcelSyncSettings: React.FC = () => {
  const [uploading, setUploading] = useState(false);
  const [log, setLog] = useState('');
  const [stats, setStats] = useState<{ inserted: number; duplicates: number } | null>(null);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>, targetTable: 'hlektrismos_leads' | 'hlektrismos_customers') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setLog('Reading Excel file...');
    setStats(null);

    try {
      const XLSX = await import('xlsx');
      const reader = new FileReader();
      reader.onload = async (evt) => {
        try {
          const bstr = evt.target?.result;
          const wb = XLSX.read(bstr, { type: 'binary' });
          const wsname = wb.SheetNames[0];
          const data: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wsname]);

          setLog(`Found ${data.length} records. Importing to CRM...`);

          const mappedRows = data.map((row) => ({
            first_name: (row['Ονοματεπώνυμο'] || row['Name'] || 'Unknown').split(' ')[0],
            last_name: (row['Ονοματεπώνυμο'] || row['Name'] || '').split(' ').slice(1).join(' '),
            email: row['Email'] || null,
            phone: row['Τηλέφωνο'] || row['Phone'] || null,
            customer_category: (row['Τύπος'] || '').includes('B2B') ? 'B2B_Corporate' : 'B2C',
            status: 'new',
          }));

          if (targetTable === 'hlektrismos_leads') {
            const { error } = await supabase.from('hlektrismos_leads').insert(mappedRows);
            if (error) throw error;
          } else {
            const customerRows = mappedRows.map((r) => ({
              full_name: `${r.first_name} ${r.last_name}`.trim(),
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
      reader.readAsBinaryString(file);
    } catch {
      setLog('Failed to load xlsx library. Make sure xlsx is installed.');
      setUploading(false);
    }
  };

  return (
    <div style={{ padding: 24, background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
      <h3 style={{ margin: '0 0 4px', fontSize: 16, fontWeight: 700, color: 'var(--text)' }}>Excel / CSV Data Sync Engine</h3>
      <p style={{ margin: '0 0 20px', fontSize: 12, color: 'var(--text-muted)' }}>Import leads or customers from Excel files with Greek header mapping</p>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ padding: 16, background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <p style={{ fontWeight: 600, fontSize: 13, margin: '0 0 8px', color: 'var(--text)' }}>Import Leads</p>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => handleFileUpload(e, 'hlektrismos_leads')} disabled={uploading}
            style={{ fontSize: 12 }} />
        </div>
        <div style={{ padding: 16, background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)' }}>
          <p style={{ fontWeight: 600, fontSize: 13, margin: '0 0 8px', color: 'var(--text)' }}>Import Customers</p>
          <input type="file" accept=".xlsx,.xls,.csv" onChange={(e) => handleFileUpload(e, 'hlektrismos_customers')} disabled={uploading}
            style={{ fontSize: 12 }} />
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
