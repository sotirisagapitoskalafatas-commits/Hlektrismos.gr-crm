import { useEffect, useRef, useState } from 'react';
import { Check, Eraser, Upload, X } from 'lucide-react';
import { Btn, Micro } from '@/lib/ui';
import { prepareCaptureFile } from '@/lib/api';

/* Canvas signature pad — touch + mouse, clear/redo, confirm.
   Output is compressed to JPEG and uploaded via the same storage path
   as captured photos. Image-upload fallback is kept. */
export default function SignaturePad({ open, onClose, onConfirm }: {
  open: boolean;
  onClose: () => void;
  onConfirm: (file: File) => Promise<void>;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const hasInk = useRef(false);
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d');
    if (!ctx) return;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.strokeStyle = '#17181a';
    ctx.lineWidth = 2.6;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    hasInk.current = false;
    setErr('');
    setSaving(false);
  }, [open]);

  const local = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current!;
    const r = c.getBoundingClientRect();
    return { x: (e.clientX - r.left) * (c.width / r.width), y: (e.clientY - r.top) * (c.height / r.height) };
  };

  const down = (e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = canvasRef.current;
    if (!c) return;
    e.preventDefault();
    c.setPointerCapture(e.pointerId);
    drawing.current = true;
    const ctx = c.getContext('2d')!;
    const p = local(e);
    ctx.beginPath();
    ctx.moveTo(p.x, p.y);
  };

  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    const p = local(e);
    ctx.lineTo(p.x, p.y);
    ctx.stroke();
    hasInk.current = true;
  };

  const up = (e: React.PointerEvent<HTMLCanvasElement>) => {
    drawing.current = false;
    try { canvasRef.current?.releasePointerCapture(e.pointerId); } catch { /* noop */ }
  };

  const clear = () => {
    const c = canvasRef.current;
    if (!c) return;
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, c.width, c.height);
    hasInk.current = false;
  };

  const confirm = async () => {
    if (!hasInk.current) { setErr('Υπογράψτε στο πλαίσιο πριν την επιβεβαίωση.'); return; }
    const c = canvasRef.current;
    if (!c) return;
    setSaving(true);
    setErr('');
    try {
      const blob = await new Promise<Blob | null>(res => c.toBlob(res, 'image/jpeg', 0.92));
      if (!blob) throw new Error('no blob');
      const file = await prepareCaptureFile(blob, `signature_${Date.now()}.jpg`);
      await onConfirm(file);
      onClose();
    } catch {
      setErr('Η αποθήκευση απέτυχε. Δοκιμάστε ξανά.');
    } finally {
      setSaving(false);
    }
  };

  const onFile = async (f: File | null) => {
    if (!f) return;
    setSaving(true);
    setErr('');
    try {
      const file = await prepareCaptureFile(f);
      await onConfirm(file);
      onClose();
    } catch {
      setErr('Η αποθήκευση απέτυχε. Δοκιμάστε ξανά.');
    } finally {
      setSaving(false);
    }
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/40 backdrop-blur-[2px] p-4 sm:p-8" onClick={onClose}>
      <div className="card w-full max-w-xl p-5 animate-fadein my-4 sm:my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <Micro className="mb-1">Signature</Micro>
            <h2 className="text-lg font-semibold text-ink tracking-tight">Υπογραφή πελάτη</h2>
          </div>
          <button onClick={onClose} className="text-ink/40 hover:text-ink p-1 rounded-md hover:bg-ink/5" aria-label="Κλείσιμο">
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="relative rounded-xl overflow-hidden border border-line bg-white touch-none">
          <canvas
            ref={canvasRef}
            width={900}
            height={340}
            onPointerDown={down}
            onPointerMove={move}
            onPointerUp={up}
            onPointerLeave={up}
            className="w-full h-auto block"
            style={{ touchAction: 'none' }}
            aria-label="Περιοχή υπογραφής"
          />
          <span className="pointer-events-none absolute bottom-2 inset-x-0 text-center micro text-ink/25">Πεδίο υπογραφής</span>
        </div>

        {err && <p className="text-xs text-bad-600 mt-2">{err}</p>}

        <div className="flex items-center gap-2 mt-4 flex-wrap">
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={e => onFile(e.target.files?.[0] ?? null)} />
          <Btn variant="ghost" onClick={clear}><Eraser className="w-3.5 h-3.5" /> Διαγραφή</Btn>
          <Btn variant="outline" onClick={() => fileRef.current?.click()} disabled={saving}>
            <Upload className="w-3.5 h-3.5" /> Φόρτωση εικόνας
          </Btn>
          <div className="flex-1" />
          <Btn variant="primary" onClick={confirm} disabled={saving} className="min-w-[140px] justify-center">
            {saving ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />} Επιβεβαίωση
          </Btn>
        </div>
      </div>
    </div>
  );
}