import { CalendarEvent } from '@/types/calendar';

/**
 * Gmail-style "Create Event" bridge: builds a prefilled calendar draft
 * from a crm_emails row. Wire the result into CalendarView's initialDraft prop.
 */
export const createEventFromEmail = (emailData: any): Partial<CalendarEvent> => {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 60 * 60 * 1000);

  return {
    title: `Follow up: ${emailData.subject || '(χωρίς θέμα)'}`,
    event_kind: 'event',
    event_type: 'follow_up',
    description: `Πρωτότυπο Email:\n\nΑπό: ${emailData.from_email}\nΘέμα: ${emailData.subject}\n\n${(emailData.body || '').slice(0, 1500)}`,
    source_email_id: emailData.id,
    lead_id: emailData.lead_id || null,
    guests: [
      {
        id: emailData.lead_id || `email-${emailData.id}`,
        name: (emailData.from_email || '').split('@')[0] || 'Επαφή',
        email: emailData.from_email || '',
        role: 'lead',
      },
    ],
    meeting_platform: 'google_meet',
    start_time: start.toISOString(),
    end_time: end.toISOString(),
    visibility: 'default' as const,
    notifications: [{ type: 'notification' as const, minutes: 30 }],
  };
};
