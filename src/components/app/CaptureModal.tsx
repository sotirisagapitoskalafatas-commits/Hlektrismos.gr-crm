import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Check, RefreshCcw, Upload, X } from 'lucide-react';
import { Btn, Micro } from '@/lib/ui';
import { prepareCaptureFile } from '@/lib/api';

type Mode = 'camera' | 'captured' | 'fallback';

/* Live camera capture (rear camera preferred) with file-upload fallback.
   Frames are compressed via prepareCaptureFile before upload. */
export default function CaptureModal({ open, title, onClose, onCapture }: {
  open: boolean;
  title?: string;
  onClose: () => void;
  onCapture: (file: File) => Promise<void>;
}) {
  const [mode, setMode] = useState<Mode>('camera');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const shotRef = useRef<Blob | null>(null);
  const urlRef = useRef<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const pointShot = (blob: Blob) => {
    if (urlRef.current) URL.revokeObjectURL(urlRef.current);
    urlRef.current = URL.createObjectURL(blob);
    shotRef.current = blob;
  };

  const stopStream = useCallback(() => {
    streamRef.current?.getTracks().forEach(t => t.stop());
    streamRef.current = null;
  }, []);

  useEffect(() => {
    if (open) { setMode('camera'); setErr(''); shotRef.current = null; }
    return () => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = null; };
  }, [open, stopStream]);

  useEffect(() => {
    if (!open) { stopStream(); return; }
    if (!navigator.mediaDevices?.getUserMedia) { setMode('fallback'); return; }
    let alive = true;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (!alive) { s.getTracks().forEach(t => t.stop()); return; }
        streamRef.current = s;
        setMode('camera');
      } catch {
        if (alive) setMode('fallback');
      }
    })();
    return () => { alive = false; stopStream(); };
  }, [open, stopStream]);

  useEffect(() => {
    if (mode !== 'camera' || !videoRef.current || !streamRef.current) return;
    videoRef.current.srcObject = streamRef.current;
    videoRef.current.play().catch(() => {});
  }, [mode]);

  const capture = () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const canvas = document.createElement('canvas');
    canvas.width = v.videoWidth;
    canvas.height = v.videoHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.drawImage(v, 0, 0);
    canvas.toBlob(b => {
      if (b) { pointShot(b); setMode('captured'); }
    }, 'image/jpeg', 0.9);
  };

  const confirm = async () => {
    if (!shotRef.current) return;
    setSaving(true);
    setErr('');
    try {
      const file = await prepareCaptureFile(shotRef.current, `photo_${Date.now()}.jpg`);
      await onCapture(file);
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
      await onCapture(file);
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
      <div className="card w-full max-w-lg p-5 animate-fadein my-4 sm:my-8" onClick={e => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <Micro className="mb-1">Field capture</Micro>
            <h2 className="text-lg font-semibold text-ink tracking-tight">{title ?? 'Λήψη φωτογραφίας'}</h2>
          </div>
          <button onClick={onClose} className="text-ink/40 hover:text-ink p-1 rounded-md hover:bg-ink/5" aria-label="Κλείσιμο">
            <X className="w-4 h-4" />
          </button>
        </div>

        {mode !== 'fallback' && (
          <div className="relative aspect-[4/3] bg-ink rounded-xl overflow-hidden">
            {mode === 'camera' && <video ref={videoRef} playsInline muted className="absolute inset-0 w-full h-full object-cover" />}
            {mode === 'captured' && shotRef.current && (
              <img src={urlRef.current ?? undefined} alt="προεπισκόπηση" className="absolute inset-0 w-full h-full object-cover" />
            )}
            <div className="absolute inset-x-0 bottom-0 p-3 flex justify-center gap-2">
              {mode === 'camera' ? (
                <button onClick={capture}
                  className="w-14 h-14 rounded-full bg-white/95 shadow-lg border-4 border-white/60 flex items-center justify-center text-ink hover:scale-105 transition-transform"
                  title="Λήψη" aria-label="Λήψη φωτογραφίας">
                  <Camera className="w-6 h-6" />
                </button>
              ) : (
                <>
                  <Btn variant="ghost" onClick={() => { if (urlRef.current) URL.revokeObjectURL(urlRef.current); urlRef.current = null; shotRef.current = null; setMode('camera'); }}
                    className="!bg-white/90 !text-ink !border !border-line !rounded-full">
                    <RefreshCcw className="w-4 h-4" /> Επανάληψη
                  </Btn>
                  <Btn variant="primary" onClick={confirm} disabled={saving} className="!rounded-full">
                    {saving ? <span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check className="w-4 h-4" />} Αποθήκευση
                  </Btn>
                </>
              )}
            </div>
          </div>
        )}

        {mode === 'fallback' && (
          <div className="rounded-xl border border-line bg-paper p-6 text-center">
            <p className="text-sm text-ink/70 mb-4">Η κάμερα δεν είναι διαθέσιμη σε αυτή τη συσκευή.<br />Επιλέξτε φωτογραφία από τη συσκευή σας.</p>
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden"
              onChange={e => onFile(e.target.files?.[0] ?? null)} />
            <Btn variant="brand" onClick={() => fileRef.current?.click()} disabled={saving}>
              <Upload className="w-4 h-4" /> Επιλογή φωτογραφίας
            </Btn>
          </div>
        )}

        {err && <p className="text-xs text-bad-600 mt-3">{err}</p>}
      </div>
    </div>
  );
}