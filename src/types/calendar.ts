export type CRMContactRole = 'lead' | 'customer' | 'agent';

export interface CRMContact {
  id: string;
  name: string;
  email: string;
  role: CRMContactRole;
  avatar_url?: string;
}

/** Google-Calendar-style tri-state. Legacy event_type (meeting/call/follow_up/deadline) kept separately for colors. */
export type CalendarEventType = 'event' | 'task' | 'appointment_schedule';

export type MeetingPlatform = 'none' | 'google_meet' | 'microsoft_teams' | 'whatsapp' | 'vapi_voice';

export type CalendarNotificationType = 'notification' | 'email';

export interface CalendarEvent {
  id?: string;
  title: string;
  /** Tri-state kind shown in the quick-create tabs. */
  event_kind: CalendarEventType;
  /** Legacy category that drives color/label: meeting | call | follow_up | deadline | custom */
  event_type: string;
  lead_id?: string | null;
  agent_id?: string | null;
  start_time: string; // ISO
  end_time: string | null; // ISO
  is_all_day: boolean;
  recurrence: 'none' | 'daily' | 'weekly' | 'monthly' | 'custom';
  time_zone: string;
  location?: string;
  meeting_platform: MeetingPlatform;
  meeting_link?: string;
  description?: string;
  notes?: string | null;
  owner_id: string;
  color: string;
  busy_status: 'busy' | 'free';
  visibility: 'default' | 'public' | 'private';
  status: 'scheduled' | 'completed' | 'cancelled' | 'no_show';
  notifications: { type: CalendarNotificationType; minutes: number }[];
  guests: CRMContact[];
  guest_permissions: {
    modify_event: boolean;
    invite_others: boolean;
    see_guest_list: boolean;
  };
  source_email_id?: string | null;
}

export const DEFAULT_GUEST_PERMISSIONS = {
  modify_event: false,
  invite_others: true,
  see_guest_list: true,
};

export const EVENT_COLORS = [
  '#039be5', '#3f51b5', '#8e24aa', '#e67c73', '#f4511e',
  '#0b8043', '#c0ca33', '#f6bf26', '#795548', '#607d8b',
];

export interface CalendarSettings {
  language: string;
  country: string;
  dateFormat: 'MM/DD/YYYY' | 'DD/MM/YYYY' | 'YYYY-MM-DD';
  timeFormat: '12h' | '24h';
  primaryTimeZone: string;
  secondaryTimeZone?: string;
  showWorldClock: boolean;
  defaultDuration: number; // in minutes
  speedyMeetings: boolean;
  showWeekends: boolean;
  showDeclinedEvents: boolean;
  showCompletedTasks: boolean;
  showWeekNumbers: boolean;
  startWeekOn: 'Sunday' | 'Monday';
}

export const DEFAULT_CALENDAR_SETTINGS: CalendarSettings = {
  language: 'Greek (Ελληνικά)',
  country: 'Greece (Ελλάδα)',
  dateFormat: 'DD/MM/YYYY',
  timeFormat: '24h',
  primaryTimeZone: '(GMT+03:00) Athens',
  showWorldClock: true,
  defaultDuration: 60,
  speedyMeetings: false,
  showWeekends: true,
  showDeclinedEvents: true,
  showCompletedTasks: true,
  showWeekNumbers: false,
  startWeekOn: 'Monday',
};

export const TIME_ZONES = [
  '(GMT+02:00) Athens',
  '(GMT+03:00) Athens',
  '(GMT+01:00) Berlin',
  '(GMT+00:00) London',
  '(GMT-05:00) New York',
  '(GMT-08:00) Los Angeles',
  '(GMT+05:30) India',
];
