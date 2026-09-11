export type JarvisState =
  | 'idle' | 'hover' | 'dragging' | 'opening' | 'open'
  | 'typing' | 'thinking' | 'responding' | 'success' | 'error' | 'offline';

/** Normalized gaze direction in widget-local space, x,y ∈ [-1,1]. */
export interface Gaze { x: number; y: number }

export const JARVIS_COLORS = {
  navy: '#102033',
  blue: '#3B82F6',
  cyan: '#67E8FF',
  white: '#F8FAFC',
  body: '#D7DDE5',
  green: '#22C55E',
  red: '#EF4444',
  amber: '#F59E0B',
} as const;