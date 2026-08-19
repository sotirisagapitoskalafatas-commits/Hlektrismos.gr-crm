import { useEffect, useState, useRef } from 'react';
import { Bell, Mail, Users, CheckCircle, X, Trash2 } from 'lucide-react';
import { supabase } from '@/lib/supabase';

type Notification = {
  id: string;
  type: string;
  title: string;
  body?: string;
  metadata?: any;
  read: boolean;
  created_at: string;
};

const ICON_MAP: Record<string, any> = {
  email_inbound: Mail,
  new_lead: Users,
  meeting_scheduled: CheckCircle,
  scraper_complete: CheckCircle,
};

const COLOR_MAP: Record<string, string> = {
  email_inbound: '#9333ea',
  new_lead: '#0066cc',
  meeting_scheduled: '#00c878',
  scraper_complete: '#f59e0b',
};

export default function NotificationBell() {
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const bellRef = useRef<HTMLDivElement>(null);

  // Load existing notifications
  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from('notification_log')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (data) {
        setNotifications(data);
        setUnreadCount(data.filter(n => !n.read).length);
      }
    })();
  }, []);

  // Subscribe to real-time INSERT events on crm_emails (inbound)
  useEffect(() => {
    const channel = supabase
      .channel('crm_emails_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'crm_emails' },
        async (payload) => {
          const email = payload.new as any;
          if (email.direction === 'inbound') {
            // Create notification
            const { data: inserted } = await supabase
              .from('notification_log')
              .insert({
                type: 'email_inbound',
                title: `📧 Νέο email: ${email.subject || 'Χωρίς θέμα'}`,
                body: `Από: ${email.from_address}`,
                metadata: { email_id: email.id, lead_id: email.lead_id },
              })
              .select()
              .single();

            if (inserted) {
              setNotifications(prev => [inserted, ...prev]);
              setUnreadCount(prev => prev + 1);
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Subscribe to real-time INSERT events on hlektrismos_leads (new B2B leads)
  useEffect(() => {
    const channel = supabase
      .channel('leads_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'hlektrismos_leads' },
        async (payload) => {
          const lead = payload.new as any;
          if (lead.source === 'B2B Scraper') {
            const { data: inserted } = await supabase
              .from('notification_log')
              .insert({
                type: 'new_lead',
                title: `👤 Νέο B2B Lead: ${lead.first_name} ${lead.last_name}`,
                body: `${lead.company_name || 'Άγνωστη εταιρεία'} — ${lead.region || ''}`,
                metadata: { lead_id: lead.id },
              })
              .select()
              .single();

            if (inserted) {
              setNotifications(prev => [inserted, ...prev]);
              setUnreadCount(prev => prev + 1);
            }
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // Subscribe to real-time INSERT events on notification_log (for calendar events, scraper, etc.)
  useEffect(() => {
    const channel = supabase
      .channel('notifications_realtime')
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'notification_log' },
        (payload) => {
          const notif = payload.new as Notification;
          // Only add if it's not already in the list (avoids duplicates from our own inserts)
          setNotifications(prev => {
            if (prev.some(n => n.id === notif.id)) return prev;
            return [notif, ...prev];
          });
          setUnreadCount(prev => prev + 1);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  const markAsRead = async (id: string) => {
    await supabase.from('notification_log').update({ read: true }).eq('id', id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    setUnreadCount(prev => Math.max(0, prev - 1));
  };

  const markAllRead = async () => {
    await supabase.from('notification_log').update({ read: true }).eq('read', false);
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    setUnreadCount(0);
  };

  const clearAll = async () => {
    await supabase.from('notification_log').delete().neq('id', '00000000-0000-0000-0000-000000000000');
    setNotifications([]);
    setUnreadCount(0);
  };

  const formatTime = (ts: string) => {
    const d = new Date(ts);
    const now = new Date();
    const diffMin = Math.floor((now.getTime() - d.getTime()) / 60000);
    if (diffMin < 1) return 'Τώρα';
    if (diffMin < 60) return `${diffMin}λ πριν`;
    const diffH = Math.floor(diffMin / 60);
    if (diffH < 24) return `${diffH}ω πριν`;
    return d.toLocaleDateString('el-GR', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div ref={bellRef} style={{ position: 'relative' }}>
      {/* Bell Button */}
      <button
        onClick={() => setOpen(!open)}
        style={{
          position: 'relative',
          background: open ? 'rgba(0,102,204,0.1)' : 'transparent',
          border: 'none',
          borderRadius: 8,
          padding: 8,
          cursor: 'pointer',
          color: 'var(--text)',
        }}
      >
        <Bell size={18} />
        {unreadCount > 0 && (
          <span style={{
            position: 'absolute', top: 2, right: 2,
            width: 16, height: 16, borderRadius: 8,
            background: '#ef4444', color: '#fff',
            fontSize: 9, fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            {unreadCount > 9 ? '9+' : unreadCount}
          </span>
        )}
      </button>

      {/* Dropdown Panel */}
      {open && (
        <div style={{
          position: 'absolute', top: '100%', right: 0, marginTop: 8,
          width: 360, maxHeight: 480,
          background: '#fff',
          border: '1px solid #e5e7eb',
          borderRadius: 12,
          boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
          zIndex: 10000,
          display: 'flex', flexDirection: 'column',
          overflow: 'hidden',
        }}>
          {/* Header */}
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #e5e7eb', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontWeight: 700, fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}>
              <Bell size={16} /> Ειδοποιήσεις
              {unreadCount > 0 && <span style={{ background: '#ef4444', color: '#fff', fontSize: 10, padding: '1px 6px', borderRadius: 8 }}>{unreadCount}</span>}
            </div>
            <div style={{ display: 'flex', gap: 4 }}>
              {unreadCount > 0 && (
                <button onClick={markAllRead} style={{ fontSize: 11, color: '#0066cc', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  Όλα αναγνωσμένα
                </button>
              )}
              <button onClick={clearAll} style={{ fontSize: 11, color: '#9ca3af', background: 'none', border: 'none', cursor: 'pointer' }}>
                <Trash2 size={12} />
              </button>
            </div>
          </div>

          {/* Notification List */}
          <div style={{ flex: 1, overflowY: 'auto' }}>
            {notifications.length === 0 ? (
              <div style={{ padding: 32, textAlign: 'center', color: '#9ca3af', fontSize: 13 }}>
                Δεν υπάρχουν ειδοποιήσεις
              </div>
            ) : (
              notifications.map(n => {
                const Icon = ICON_MAP[n.type] || Bell;
                const color = COLOR_MAP[n.type] || '#6b7280';
                return (
                  <div
                    key={n.id}
                    onClick={() => markAsRead(n.id)}
                    style={{
                      padding: '10px 16px',
                      borderBottom: '1px solid #f3f4f6',
                      cursor: 'pointer',
                      background: n.read ? '#fff' : '#f0f7ff',
                      display: 'flex', gap: 10, alignItems: 'flex-start',
                      transition: 'background 0.15s',
                    }}
                  >
                    <div style={{
                      width: 32, height: 32, borderRadius: 8,
                      background: `${color}15`, color,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <Icon size={14} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: n.read ? 400 : 600, color: '#1f2937', marginBottom: 2 }}>
                        {n.title}
                      </div>
                      {n.body && <div style={{ fontSize: 11, color: '#6b7280', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</div>}
                      <div style={{ fontSize: 10, color: '#9ca3af', marginTop: 2 }}>{formatTime(n.created_at)}</div>
                    </div>
                    {!n.read && (
                      <div style={{ width: 8, height: 8, borderRadius: 4, background: '#0066cc', flexShrink: 0, marginTop: 4 }} />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {/* Click outside to close */}
      {open && (
        <div
          onClick={() => setOpen(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 9999 }}
        />
      )}
    </div>
  );
}
