import { useRef, useState } from 'react';
import { useUIStore } from '@/state/useUIStore';

const MAX_DIM = 512;
const MAX_BYTES = 400 * 1024;
const TARGET_QUALITY = 0.72;

const compressImage = (file: File): Promise<string> => new Promise((resolve, reject) => {
  const img = new Image();
  const url = URL.createObjectURL(file);
  img.onload = () => {
    URL.revokeObjectURL(url);
    let { width, height } = img;
    if (width > MAX_DIM || height > MAX_DIM) {
      const k = Math.min(MAX_DIM / width, MAX_DIM / height);
      width = Math.round(width * k);
      height = Math.round(height * k);
    }
    const canvas = document.createElement('canvas');
    canvas.width = width; canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return reject(new Error('No 2D context'));
    ctx.drawImage(img, 0, 0, width, height);
    let q = TARGET_QUALITY;
    let dataUrl = canvas.toDataURL('image/jpeg', q);
    while (dataUrl.length > MAX_BYTES * 1.37 && q > 0.3) {
      q -= 0.1;
      dataUrl = canvas.toDataURL('image/jpeg', q);
    }
    resolve(dataUrl);
  };
  img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
  img.src = url;
});

export default function ImageUploader({ onImage }: { onImage: (dataUrl: string) => void }) {
  const ref = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const showToast = useUIStore(s => s.showToast);

  const onFile = async (file: File | undefined | null) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) { showToast('That\'s not an image', 'warn'); return; }
    if (file.size > 8 * 1024 * 1024) { showToast('Image too large (max 8MB)', 'warn'); return; }
    setBusy(true);
    try {
      const url = await compressImage(file);
      onImage(url);
    } catch (e: any) {
      showToast('Could not process image', 'error');
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <button
        className="w-10 h-10 rounded-full shrink-0 flex items-center justify-center"
        style={{ background: 'var(--surface-2)', border: '1px solid var(--border)' }}
        onClick={() => ref.current?.click()}
        aria-label="Attach image"
        disabled={busy}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ color: 'var(--accent)' }}>
          <path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
        </svg>
      </button>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={e => onFile(e.target.files?.[0])}
      />
    </>
  );
}
