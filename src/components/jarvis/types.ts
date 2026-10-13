/** Signals the chat hook raises at real points of the conversation lifecycle. */
export type ChatSignal =
  /** A network call to the `chat` edge function is actually starting. */
  | { type: 'request-start'; purpose: 'chat' | 'callback' }
  /** The visitor asked for a callback and the consent/contact flow began. */
  | { type: 'callback-open' }
  /** The assistant needs the visitor to correct or complete something. */
  | { type: 'clarify' }
  /** The backend confirmed the callback lead was stored. */
  | { type: 'callback-success' }
  /** The callback request did not get a confirmation from the backend. */
  | { type: 'callback-unconfirmed' };

export const JARVIS_BODY_SRC = '/images/jarvis/mascot-body.webp';
export const JARVIS_FULL_SRC = '/images/jarvis/mascot-full.webp';
