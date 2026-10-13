/* ------------------------------------------------------------------ */
/*  Mascot controller — one rAF loop that animates every mascot        */
/*  instance (launcher + panel avatar) without touching React.         */
/*                                                                     */
/*  Two independent inputs are blended here:                           */
/*   • EXPRESSION  – derived from real chat events via `signal()`;     */
/*                   owns lids, brows, glow, tilt, ring speed.         */
/*   • GAZE        – derived from the pointer; owns pupil direction,   */
/*                   limited by the active expression's `follow`.      */
/*  Priority: error/success > thinking/answering/clarifying/listening  */
/*  > curious (cursor near) > inactive/idle.                           */
/* ------------------------------------------------------------------ */

export type Expression =
  | 'idle' | 'curious' | 'listening' | 'thinking' | 'answering'
  | 'success' | 'empathetic' | 'clarifying' | 'error' | 'inactive';

export type Topic = 'electricity' | 'solar' | 'mobility' | 'savings' | 'gas';

export type MascotEvent =
  | { type: 'hover'; on: boolean }
  | { type: 'press' }
  | { type: 'panel'; open: boolean }
  | { type: 'input-focus'; on: boolean }
  | { type: 'typing' }
  | { type: 'submit'; difficulty: boolean; topic?: Topic }
  | { type: 'request-start' }
  | { type: 'reply'; clarify?: boolean }
  | { type: 'action-success' }
  | { type: 'failure' }
  | { type: 'callback'; active: boolean };

/* ---------- geometry (512×512 viewBox of the eye layer) ---------- */
const EYE_L = { x: 195.1, y: 252.5 };
const EYE_R = { x: 319.9, y: 252.5 };
const FACE_FX = 257.5 / 512; // face centre, as a fraction of the mascot box
const FACE_FY = 252.5 / 512;
const TRAVEL_X = 12;          // max iris travel (viewBox units) — socket margin is ~15
const TRAVEL_Y = 9;
const CORE_EXTRA = 1.25;      // bright pupil core moves a little more than the iris (parallax)
const BROW_Y = -48;           // brow centre, relative to the eye centre

/* ---------- timing (purely visual hold times) ---------- */
const SUCCESS_MS = 1600;
const ANSWER_HOLD_MS = 1500;
const INACTIVE_MS = 60_000;
const TOPIC_MS = 1700;

interface Params {
  open: number;      // eye height scale (lids)
  wide: number;      // uniform eye scale
  glow: number;      // halo / iris brightness
  follow: number;    // how strongly the cursor steers the gaze
  biasX: number;     // fixed gaze offset, normalised
  biasY: number;
  wander: number;    // amplitude of the slow idle look-around
  sacc: number;      // 1 → concentrate-glances (thinking)
  browA: number;     // brow opacity
  browLy: number;    // brow vertical offset (negative = raised)
  browRy: number;
  browLr: number;    // brow rotation, degrees
  browRr: number;
  smile: number;     // lower lid raise (happy eyes)
  tilt: number;      // head tilt, degrees
  ring: number;      // ring speed multiplier
  warn: number;      // amber accent amount
}

const EXPR: Record<Expression, Params> = {
  idle:       { open: 1.00, wide: 1.00, glow: 0.88, follow: 0.80, biasX: 0,    biasY: 0,     wander: 0.55, sacc: 0, browA: 0,    browLy: 0,   browRy: 0,   browLr: 0,   browRr: 0,   smile: 0,    tilt: 0, ring: 1.0, warn: 0 },
  curious:    { open: 1.05, wide: 1.07, glow: 1.08, follow: 1.00, biasX: 0,    biasY: 0,     wander: 0,    sacc: 0, browA: 0.55, browLy: -9,  browRy: -9,  browLr: -4,  browRr: 4,   smile: 0,    tilt: 0, ring: 1.5, warn: 0 },
  listening:  { open: 0.97, wide: 1.00, glow: 1.00, follow: 0.45, biasX: 0,    biasY: 0.30,  wander: 0.10, sacc: 0, browA: 0.32, browLy: -3,  browRy: -3,  browLr: 0,   browRr: 0,   smile: 0,    tilt: 0, ring: 1.2, warn: 0 },
  thinking:   { open: 0.88, wide: 0.97, glow: 1.00, follow: 0.18, biasX: 0,    biasY: 0,     wander: 0,    sacc: 1, browA: 0.50, browLy: 2,   browRy: 2,   browLr: 8,   browRr: -8,  smile: 0,    tilt: 0, ring: 2.4, warn: 0 },
  answering:  { open: 1.00, wide: 1.02, glow: 1.00, follow: 0.50, biasX: 0,    biasY: 0.10,  wander: 0.18, sacc: 0, browA: 0.30, browLy: -4,  browRy: -4,  browLr: 0,   browRr: 0,   smile: 0.10, tilt: 0, ring: 1.0, warn: 0 },
  success:    { open: 1.00, wide: 1.13, glow: 1.38, follow: 0.55, biasX: 0,    biasY: 0,     wander: 0,    sacc: 0, browA: 0.60, browLy: -12, browRy: -12, browLr: -4,  browRr: 4,   smile: 0.72, tilt: 0, ring: 1.8, warn: 0 },
  empathetic: { open: 0.92, wide: 0.99, glow: 0.64, follow: 0.30, biasX: 0,    biasY: 0.28,  wander: 0.08, sacc: 0, browA: 0.55, browLy: -4,  browRy: -4,  browLr: -11, browRr: 11,  smile: 0,    tilt: 0, ring: 0.5, warn: 0 },
  clarifying: { open: 1.02, wide: 1.03, glow: 0.98, follow: 0.35, biasX: 0.42, biasY: -0.18, wander: 0,    sacc: 0, browA: 0.60, browLy: -13, browRy: 3,   browLr: -6,  browRr: 7,   smile: 0,    tilt: 6, ring: 1.0, warn: 0 },
  error:      { open: 0.90, wide: 0.95, glow: 0.52, follow: 0.45, biasX: 0,    biasY: 0.16,  wander: 0,    sacc: 0, browA: 0.65, browLy: -3,  browRy: -3,  browLr: -13, browRr: 13,  smile: 0,    tilt: 0, ring: 0.15, warn: 1 },
  inactive:   { open: 0.34, wide: 0.98, glow: 0.42, follow: 0.04, biasX: 0,    biasY: 0.10,  wander: 0,    sacc: 0, browA: 0,    browLy: 0,   browRy: 0,   browLr: 0,   browRr: 0,   smile: 0,    tilt: 0, ring: 0.12, warn: 0 },
};
const KEYS = Object.keys(EXPR.idle) as (keyof Params)[];

const SACCADES: [number, number][] = [[-0.55, -0.55], [0.62, -0.38], [0.18, -0.7], [-0.4, -0.2], [0.5, -0.62]];

const ACCENT_COLOR = { amber: '#FFB02E', gold: '#FFC85A', green: '#49E59B', cyan: '#7AF0FF', blue: '#5AA8FF' } as const;
type AccentKind = keyof typeof ACCENT_COLOR;

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const r2 = (v: number) => Math.round(v * 100) / 100;

/* ------------------------------------------------------------------ */

type Role = 'launcher' | 'avatar';

interface Els {
  tilt: HTMLElement | null;
  ring: HTMLElement | null;
  aura: HTMLElement | null;
  eyeL: SVGGElement | null; eyeR: SVGGElement | null;
  irisL: SVGGElement | null; irisR: SVGGElement | null;
  coreL: SVGGElement | null; coreR: SVGGElement | null;
  haloL: SVGElement | null; haloR: SVGElement | null;
  accL: SVGElement | null; accR: SVGElement | null;
  lidL: SVGElement | null; lidR: SVGElement | null;
  browL: SVGGElement | null; browR: SVGGElement | null;
  accentGrad: SVGElement | null;
}

class Instance {
  readonly els: Els;
  cur: Params = { ...EXPR.idle };
  gx = 0; gy = 0;           // smoothed gaze, normalised [-1, 1]
  ring = Math.random() * 360;
  depth = { x: 0, y: 0 };   // magnetic tilt, normalised
  cx = 0; cy = 0; w = 0;    // face centre (viewport px) + box width
  launcherCx = 0; launcherCy = 0;
  nextBlink: number;
  blinkStart = -1;
  doubleBlinkAt = -1;
  phase = Math.random() * 6.28;
  accentKind: AccentKind | null = null;
  private written = new WeakMap<Element, Map<string, string>>();

  constructor(readonly root: HTMLElement, readonly role: Role, now: number) {
    const q = <T extends Element>(n: string) => root.querySelector<T>(`[data-jv="${n}"]`);
    this.els = {
      tilt: q('tilt'), ring: q('ring'), aura: q('aura'),
      eyeL: q('eyeL'), eyeR: q('eyeR'), irisL: q('irisL'), irisR: q('irisR'),
      coreL: q('coreL'), coreR: q('coreR'), haloL: q('haloL'), haloR: q('haloR'),
      accL: q('accL'), accR: q('accR'), lidL: q('lidL'), lidR: q('lidR'),
      browL: q('browL'), browR: q('browR'), accentGrad: q('accentGrad'),
    };
    this.nextBlink = now + 1200 + Math.random() * 2500;
  }

  measure() {
    const img = this.root.querySelector<HTMLElement>('[data-jv="mascot"]') ?? this.root;
    const r = img.getBoundingClientRect();
    this.w = r.width;
    this.cx = r.left + r.width * FACE_FX;
    this.cy = r.top + r.height * FACE_FY;
    const lr = this.root.getBoundingClientRect();
    this.launcherCx = lr.left + lr.width / 2;
    this.launcherCy = lr.top + lr.height / 2;
  }

  /** Write an attribute/style only when the value actually changed. */
  private set(el: Element | null, key: string, value: string, style = false) {
    if (!el) return;
    let cache = this.written.get(el);
    if (!cache) { cache = new Map(); this.written.set(el, cache); }
    if (cache.get(key) === value) return;
    cache.set(key, value);
    if (style) (el as HTMLElement).style.setProperty(key, value);
    else el.setAttribute(key, value);
  }

  blinkNow(now: number) {
    if (this.blinkStart < 0 || now - this.blinkStart > 260) this.blinkStart = now;
  }

  step(dt: number, now: number, e: Engine, snap: boolean) {
    const target = EXPR[e.expr];
    const a = snap ? 1 : 1 - Math.exp(-6.5 * dt);
    for (const k of KEYS) this.cur[k] += (target[k] - this.cur[k]) * a;

    /* ---- gaze target ---- */
    const reduced = e.reduced;
    let tx = this.cur.biasX;
    let ty = this.cur.biasY;
    if (!reduced) {
      const pg = e.pointerGaze(this, now);
      let steer = 0; // how strongly the cursor is steering right now (0..1)
      if (pg) {
        const follow = this.cur.follow * pg.fresh * (1 - e.topic.forward * 0.9);
        steer = clamp(follow, 0, 1);
        tx += pg.x * follow;
        ty += pg.y * follow;
      }
      const w = this.cur.wander * (1 - steer * 0.85);
      if (w > 0.001) {
        tx += (Math.sin(now * 0.00063 + this.phase) * 0.22 + Math.sin(now * 0.0017 + this.phase * 2) * 0.06) * w * 2;
        ty += Math.sin(now * 0.00091 + this.phase * 1.7) * 0.14 * w * 2;
      }
      if (this.cur.sacc > 0.001) {
        tx += e.sacc[0] * this.cur.sacc * 0.9;
        ty += e.sacc[1] * this.cur.sacc * 0.9;
      }
      ty -= e.topic.forward * 0.12;
    } else {
      // Static alternative: no tracking, only the expression's own resting direction.
      if (this.cur.sacc > 0.5) ty -= 0.35;
    }
    const m = Math.hypot(tx, ty);
    if (m > 1) { tx /= m; ty /= m; }
    const g = snap ? 1 : 1 - Math.exp(-8 * dt);
    this.gx += (tx - this.gx) * g;
    this.gy += (ty - this.gy) * g;

    /* ---- blink ---- */
    let blink = 0;
    if (!reduced && e.expr !== 'inactive') {
      if (this.blinkStart < 0 && now >= this.nextBlink) {
        this.blinkStart = now;
        if (Math.random() < 0.18) this.doubleBlinkAt = now + 300;
        this.nextBlink = now + 2400 + Math.random() * 3900;
      }
      if (this.blinkStart < 0 && this.doubleBlinkAt > 0 && now >= this.doubleBlinkAt) {
        this.blinkStart = now; this.doubleBlinkAt = -1;
      }
    }
    if (this.blinkStart >= 0) {
      const t = now - this.blinkStart;
      if (t < 75) blink = t / 75;
      else if (t < 105) blink = 1;
      else if (t < 225) blink = 1 - (t - 105) / 120;
      else { blink = 0; this.blinkStart = -1; }
    }

    /* ---- accent (amber warning, or a brief topical tint) ---- */
    let accKind: AccentKind | null = null;
    let accAmt = 0;
    if (this.cur.warn > 0.04) { accKind = 'amber'; accAmt = this.cur.warn * 0.55; }
    else if (e.topic.kind && e.topic.amt > 0.01) { accKind = e.topic.kind; accAmt = e.topic.amt; }

    /* ---- write: eyes ---- */
    const press = e.press;
    const wide = this.cur.wide * (1 + press * 0.06);
    const sy = Math.max(0.07, wide * this.cur.open * (1 - 0.93 * blink));
    const ox = this.gx * TRAVEL_X;
    const oy = this.gy * TRAVEL_Y;
    const glow = this.cur.glow + e.topic.pulse * 0.3;
    const glowO = clamp(glow, 0, 1.5);
    const smileY = 66 - this.cur.smile * 50; // lid rests just below the socket (top edge ≈ 36)
    const els = this.els;

    this.set(els.eyeL, 'transform', `translate(${EYE_L.x} ${EYE_L.y}) scale(${r2(wide)} ${r2(sy)})`);
    this.set(els.eyeR, 'transform', `translate(${EYE_R.x} ${EYE_R.y}) scale(${r2(wide)} ${r2(sy)})`);
    this.set(els.irisL, 'transform', `translate(${r2(ox)} ${r2(oy)})`);
    this.set(els.irisR, 'transform', `translate(${r2(ox)} ${r2(oy)})`);
    this.set(els.coreL, 'transform', `translate(${r2(ox * (CORE_EXTRA - 1))} ${r2(oy * (CORE_EXTRA - 1))})`);
    this.set(els.coreR, 'transform', `translate(${r2(ox * (CORE_EXTRA - 1))} ${r2(oy * (CORE_EXTRA - 1))})`);
    const halo = String(r2(clamp(glowO * 0.8, 0, 1)));
    this.set(els.haloL, 'opacity', halo);
    this.set(els.haloR, 'opacity', halo);
    const irisO = String(r2(clamp(0.55 + glowO * 0.45, 0, 1)));
    this.set(els.irisL, 'opacity', irisO);
    this.set(els.irisR, 'opacity', irisO);
    this.set(els.lidL, 'transform', `translate(0 ${r2(smileY)})`);
    this.set(els.lidR, 'transform', `translate(0 ${r2(smileY)})`);

    if (accKind !== this.accentKind) {
      this.accentKind = accKind;
      if (accKind) this.set(els.accentGrad, 'color', ACCENT_COLOR[accKind]);
    }
    const accO = String(r2(accAmt));
    this.set(els.accL, 'opacity', accO);
    this.set(els.accR, 'opacity', accO);

    /* ---- write: brows ---- */
    const ba = String(r2(this.cur.browA));
    this.set(els.browL, 'opacity', ba);
    this.set(els.browR, 'opacity', ba);
    this.set(els.browL, 'transform', `translate(${EYE_L.x} ${r2(EYE_L.y + BROW_Y + this.cur.browLy)}) rotate(${r2(this.cur.browLr)})`);
    this.set(els.browR, 'transform', `translate(${EYE_R.x} ${r2(EYE_R.y + BROW_Y + this.cur.browRy)}) rotate(${r2(this.cur.browRr)})`);

    /* ---- write: ring, head tilt, magnetic depth ---- */
    if (!reduced) this.ring = (this.ring + 14 * this.cur.ring * dt) % 360;
    this.set(els.ring, 'transform', `rotate(${r2(this.ring)}deg)`, true);
    this.set(els.tilt, '--jv-roll', `${r2(this.cur.tilt)}deg`, true);

    if (this.role === 'launcher') {
      let dx = 0, dy = 0;
      const p = e.pointer;
      if (!reduced && p && !p.touch) {
        const ddx = p.x - this.launcherCx, ddy = p.y - this.launcherCy;
        if (Math.hypot(ddx, ddy) < 170) { dx = clamp(ddx / 110, -1, 1); dy = clamp(ddy / 110, -1, 1); }
      }
      const d = snap ? 1 : 1 - Math.exp(-7 * dt);
      this.depth.x += (dx - this.depth.x) * d;
      this.depth.y += (dy - this.depth.y) * d;
      this.set(els.tilt, '--jv-tx', `${r2(this.depth.x * 2.4)}px`, true);
      this.set(els.tilt, '--jv-ty', `${r2(this.depth.y * 2.4)}px`, true);
      this.set(els.tilt, '--jv-rx', `${r2(-this.depth.y * 6)}deg`, true);
      this.set(els.tilt, '--jv-ry', `${r2(this.depth.x * 6)}deg`, true);
    }
  }

  /** Has everything stopped moving? Used to let the loop sleep when inactive. */
  settled(e: Engine): boolean {
    const t = EXPR[e.expr];
    for (const k of KEYS) if (Math.abs(this.cur[k] - t[k]) > 0.004) return false;
    return Math.abs(this.gx) < 0.02 + Math.abs(t.biasX) && this.blinkStart < 0;
  }

  pulse(kind: 'success') {
    const aura = this.els.aura;
    if (!aura || typeof aura.animate !== 'function') return;
    const color = kind === 'success' ? 'rgba(73,229,155,0.75)' : 'rgba(53,223,255,0.7)';
    aura.animate(
      [
        { boxShadow: `0 0 0 0 ${color}`, opacity: 1 },
        { boxShadow: `0 0 26px 10px ${color}`, opacity: 1, offset: 0.4 },
        { boxShadow: '0 0 0 0 rgba(73,229,155,0)', opacity: 1 },
      ],
      { duration: 1100, easing: 'ease-out' },
    );
  }
}

/* ------------------------------------------------------------------ */

class Engine {
  expr: Expression = 'idle';
  reduced = false;
  press = 0;
  sacc: [number, number] = [0, 0];
  topic: { kind: AccentKind | null; amt: number; pulse: number; forward: number } = { kind: null, amt: 0, pulse: 0, forward: 0 };
  pointer: { x: number; y: number; t: number; touch: boolean } | null = null;

  private inst = new Set<Instance>();
  private flags = {
    hover: false, near: false, panelOpen: false, inputFocus: false, thinking: false,
    answerUntil: 0, clarify: false, tone: false, error: false, successUntil: 0, attentive: false,
  };
  private topicStart = 0;
  private topicKind: Topic | null = null;
  private lastActivity = 0;
  private thinkingSince = 0;
  private nextSacc = 0;
  private raf = 0;
  private last = 0;
  private timer = 0;
  private interval = 0;
  private listeners = new Set<() => void>();
  private cleanup: (() => void) | null = null;
  private dirtyRects = true;
  private rectAt = 0;

  /* ----- public API ----- */

  register(root: HTMLElement, role: Role): () => void {
    const inst = new Instance(root, role, performance.now());
    this.inst.add(inst);
    if (this.inst.size === 1) this.attach();
    root.dataset.expr = this.expr;
    this.dirtyRects = true;
    this.kick();
    return () => {
      this.inst.delete(inst);
      if (this.inst.size === 0) this.detach();
    };
  }

  signal(ev: MascotEvent) {
    const now = performance.now();
    const f = this.flags;
    this.touchActivity(now);
    switch (ev.type) {
      case 'hover': f.hover = ev.on; break;
      case 'press': this.press = 1; break;
      case 'panel':
        f.panelOpen = ev.open;
        if (ev.open) f.error = false;
        else { f.inputFocus = false; f.clarify = false; f.tone = false; f.attentive = false; f.answerUntil = 0; }
        break;
      case 'input-focus': f.inputFocus = ev.on; break;
      case 'typing': f.clarify = false; f.answerUntil = 0; f.error = false; break;
      case 'submit':
        f.tone = ev.difficulty; f.clarify = false; f.error = false; f.answerUntil = 0;
        if (ev.topic) { this.topicKind = ev.topic; this.topicStart = now; }
        break;
      case 'request-start': f.thinking = true; this.thinkingSince = now; this.nextSacc = 0; break;
      case 'reply':
        f.thinking = false; f.answerUntil = now + ANSWER_HOLD_MS; f.clarify = !!ev.clarify;
        break;
      case 'action-success': f.thinking = false; f.successUntil = now + SUCCESS_MS; f.error = false; break;
      case 'failure': f.thinking = false; f.error = true; break;
      case 'callback': f.attentive = ev.active; break;
    }
    this.refresh(now);
  }

  getExpression = () => this.expr;
  subscribe = (cb: () => void) => { this.listeners.add(cb); return () => { this.listeners.delete(cb); }; };

  /* ----- internals ----- */

  private resolve(now: number): Expression {
    const f = this.flags;
    if (f.error) return 'error';
    if (now < f.successUntil) return 'success';
    if (f.thinking) return 'thinking';
    if (now < f.answerUntil) return 'answering';
    if (f.clarify && f.panelOpen) return 'clarifying';
    if (f.tone && f.panelOpen) return 'empathetic';
    if (f.inputFocus || f.attentive) return 'listening';
    if (f.hover || f.near) return 'curious';
    if (now - this.lastActivity > INACTIVE_MS) return 'inactive';
    return 'idle';
  }

  private refresh(now: number) {
    const next = this.resolve(now);
    if (next !== this.expr) {
      const prev = this.expr;
      this.expr = next;
      for (const i of this.inst) {
        i.root.dataset.expr = next;
        if (next === 'success') i.pulse('success');
        if (!this.reduced) {
          if (next === 'thinking' || next === 'success' || next === 'curious') i.blinkNow(now);
          if (prev === 'thinking' && now - this.thinkingSince > 1500) i.blinkNow(now);
          if (prev === 'inactive') i.blinkNow(now);
        }
      }
      this.listeners.forEach(l => l());
    }
    this.scheduleExpiry(now);
    if (this.reduced) this.renderOnce(now);
    else this.kick();
  }

  /** Re-resolve when a timed hold (success / answering) ends. */
  private scheduleExpiry(now: number) {
    window.clearTimeout(this.timer);
    const f = this.flags;
    const ends = [f.successUntil, f.answerUntil].filter(t => t > now);
    if (!ends.length) return;
    this.timer = window.setTimeout(() => this.refresh(performance.now()), Math.min(...ends) - now + 20);
  }

  private touchActivity(now: number) {
    const wasInactive = this.expr === 'inactive';
    this.lastActivity = now;
    if (wasInactive) this.refresh(now);
  }

  pointerGaze(inst: Instance, now: number): { x: number; y: number; fresh: number } | null {
    const p = this.pointer;
    if (!p) return null;
    const age = now - p.t;
    // A touch only makes the mascot glance at the tap; a mouse is followed, then relaxed.
    const fresh = p.touch ? clamp(1 - (age - 500) / 500, 0, 1) : clamp(1 - (age - 5000) / 4000, 0.2, 1);
    if (fresh <= 0) return null;
    const dx = p.x - inst.cx, dy = p.y - inst.cy;
    const d = Math.hypot(dx, dy);
    if (d < 1) return { x: 0, y: 0, fresh };
    const s = 1 - Math.exp(-d / 170);
    return { x: Math.min(1, (dx / d) * s * 1.25), y: Math.min(1, (dy / d) * s * 1.25), fresh };
  }

  private update(now: number, dt: number) {
    // proximity "curious" with hysteresis — flips only when crossing the radius
    const launcher = [...this.inst].find(i => i.role === 'launcher');
    const p = this.pointer;
    if (launcher && p && !p.touch && !this.flags.panelOpen) {
      const d = Math.hypot(p.x - launcher.launcherCx, p.y - launcher.launcherCy);
      const near = this.flags.near ? d < 230 : d < 140;
      if (near !== this.flags.near) { this.flags.near = near; this.refresh(now); }
    } else if (this.flags.near) { this.flags.near = false; this.refresh(now); }

    // timed expression expiry (also handled by the timer; this keeps the loop exact)
    if (this.resolve(now) !== this.expr) this.refresh(now);

    this.press = Math.max(0, this.press - dt * 2.2);

    if (this.expr === 'thinking' && now >= this.nextSacc) {
      this.sacc = SACCADES[Math.floor(Math.random() * SACCADES.length)];
      this.nextSacc = now + 1100 + Math.random() * 1100;
    }

    // topical accent envelope
    const t = this.topicKind ? now - this.topicStart : Infinity;
    if (this.topicKind && t < TOPIC_MS) {
      const env = t < 250 ? t / 250 : t < 800 ? 1 : 1 - (t - 800) / (TOPIC_MS - 800);
      const k = this.topicKind;
      this.topic.kind = k === 'solar' ? 'gold' : k === 'savings' ? 'green' : k === 'gas' ? 'blue' : k === 'electricity' ? 'cyan' : null;
      this.topic.amt = this.topic.kind ? env * 0.4 : 0;
      this.topic.pulse = k === 'electricity' || k === 'gas' ? env : 0;
      this.topic.forward = k === 'mobility' ? env : 0;
    } else {
      this.topic.kind = null; this.topic.amt = 0; this.topic.pulse = 0; this.topic.forward = 0;
      this.topicKind = null;
    }
  }

  private measureAll(now: number) {
    if (!this.dirtyRects && now - this.rectAt < 500) return;
    this.dirtyRects = false; this.rectAt = now;
    for (const i of this.inst) i.measure();
  }

  private renderOnce(now: number) {
    this.measureAll(now);
    this.update(now, 0);
    for (const i of this.inst) i.step(0.016, now, this, true);
  }

  private tick = (t: number) => {
    this.raf = 0;
    if (document.hidden || this.inst.size === 0) return;
    if (this.reduced) { this.renderOnce(t); return; }
    const dt = Math.min(0.05, Math.max(0.001, (t - this.last) / 1000));
    this.last = t;
    this.measureAll(t);
    this.update(t, dt);
    let allSettled = true;
    for (const i of this.inst) {
      i.step(dt, t, this, false);
      if (allSettled && !i.settled(this)) allSettled = false;
    }
    // Sleep once the mascot has gone inactive and stopped moving; any activity wakes it.
    if (this.expr === 'inactive' && allSettled) return;
    this.raf = requestAnimationFrame(this.tick);
  };

  private kick() {
    if (this.raf || this.reduced || document.hidden || this.inst.size === 0) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  private attach() {
    if (this.cleanup) return;
    const mql = window.matchMedia('(prefers-reduced-motion: reduce)');
    this.reduced = mql.matches;
    const dirty = () => { this.dirtyRects = true; };
    const onMove = (e: PointerEvent) => {
      const touch = e.pointerType === 'touch';
      this.pointer = { x: e.clientX, y: e.clientY, t: performance.now(), touch };
      this.touchActivity(performance.now());
      this.kick();
    };
    const onDown = (e: PointerEvent) => {
      this.pointer = { x: e.clientX, y: e.clientY, t: performance.now(), touch: e.pointerType === 'touch' };
      this.touchActivity(performance.now());
      this.kick();
    };
    const onLeave = (e: MouseEvent) => { if (!e.relatedTarget) { this.pointer = null; this.kick(); } };
    const onActivity = () => { this.touchActivity(performance.now()); this.kick(); };
    const onVis = () => {
      if (document.hidden) { cancelAnimationFrame(this.raf); this.raf = 0; }
      else { this.touchActivity(performance.now()); this.dirtyRects = true; this.refresh(performance.now()); }
    };
    const onMql = () => { this.reduced = mql.matches; this.refresh(performance.now()); };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('pointerdown', onDown, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    window.addEventListener('keydown', onActivity, { passive: true });
    window.addEventListener('wheel', onActivity, { passive: true });
    window.addEventListener('scroll', dirty, { passive: true });
    window.addEventListener('resize', dirty, { passive: true });
    document.addEventListener('visibilitychange', onVis);
    mql.addEventListener('change', onMql);
    // Inactivity is checked on a slow interval so it also works in reduced-motion mode.
    this.lastActivity = performance.now();
    this.interval = window.setInterval(() => {
      if (!document.hidden) this.refresh(performance.now());
    }, 5000);

    this.cleanup = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerdown', onDown);
      document.documentElement.removeEventListener('mouseleave', onLeave);
      window.removeEventListener('keydown', onActivity);
      window.removeEventListener('wheel', onActivity);
      window.removeEventListener('scroll', dirty);
      window.removeEventListener('resize', dirty);
      document.removeEventListener('visibilitychange', onVis);
      mql.removeEventListener('change', onMql);
      window.clearInterval(this.interval);
      window.clearTimeout(this.timer);
      cancelAnimationFrame(this.raf);
      this.raf = 0;
      this.pointer = null;
    };
  }

  private detach() {
    this.cleanup?.();
    this.cleanup = null;
  }
}

export const mascot = new Engine();
