import React, { useState, useEffect } from 'react';
import { supabase } from '../lib/satellite';
import { Phone, PhoneOff, MessageSquare, Volume2 } from 'lucide-react';

export default function LiveVoiceSupervisor() {
  const [activeCalls, setActiveCalls] = useState<any[]>([]);

  useEffect(() => {
    fetchActiveCalls();
    const channel = supabase
      .channel('live_voice_calls')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'voice_calls' }, () => fetchActiveCalls())
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const fetchActiveCalls = async () => {
    const { data } = await supabase
      .from('voice_calls')
      .select('*, hlektrismos_leads(first_name, last_name, phone)')
      .in('status', ['initiating', 'ringing', 'in-progress'])
      .order('created_at', { ascending: false });
    setActiveCalls(data || []);
  };

  const endCall = async (callId: string) => {
    await supabase.from('voice_calls').update({ status: 'ended' }).eq('id', callId);
    fetchActiveCalls();
  };

  return (
    <div style={{ padding: 20, background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h3 style={{ margin: 0, fontSize: 15, fontWeight: 700, color: 'var(--text)', display: 'flex', alignItems: 'center', gap: 8 }}>
          <Phone size={16} style={{ color: '#34d399' }} /> Live AI Calls ({activeCalls.length})
        </h3>
        <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 12, background: 'rgba(16,185,129,0.15)', color: '#34d399', fontWeight: 600 }}>
          Vapi.ai Connected
        </span>
      </div>

      {activeCalls.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 32, border: '1px dashed var(--border)', borderRadius: 10, color: 'var(--text-muted)', fontSize: 13 }}>
          No active AI calls at the moment.
        </div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 12 }}>
          {activeCalls.map((call) => {
            const lead = call.hlektrismos_leads;
            return (
              <div key={call.id} style={{ padding: 14, background: 'var(--bg)', borderRadius: 10, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>
                      {lead ? `${lead.first_name} ${lead.last_name}` : 'Unknown'}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{lead?.phone || call.phone || '-'}</div>
                  </div>
                  <span style={{ fontSize: 10, fontFamily: 'monospace', padding: '2px 6px', borderRadius: 6, background: 'rgba(245,158,11,0.15)', color: '#f59e0b' }}>
                    {call.duration_seconds ? `${Math.floor(call.duration_seconds / 60)}:${(call.duration_seconds % 60).toString().padStart(2, '0')}` : '00:00'}
                  </span>
                </div>

                {call.transcript && (
                  <div style={{ padding: 8, background: 'var(--surface)', borderRadius: 6, fontSize: 11, color: 'var(--text-muted)', fontFamily: 'monospace', maxHeight: 48, overflow: 'hidden' }}>
                    <MessageSquare size={10} style={{ marginRight: 4 }} />
                    {call.transcript.slice(0, 120)}...
                  </div>
                )}

                <div style={{ display: 'flex', gap: 8 }}>
                  <button onClick={() => endCall(call.id)}
                    style={{ flex: 1, padding: '6px 0', background: '#ef4444', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <PhoneOff size={12} /> End
                  </button>
                  <button style={{ flex: 1, padding: '6px 0', background: '#6366f1', color: '#fff', border: 'none', borderRadius: 6, cursor: 'pointer', fontSize: 11, fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                    <Volume2 size={12} /> Takeover
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
