import { useEffect } from 'react';
import useGameStore from '../store/useGameStore';

const TOAST_TTL_MS = 2600;

export default function ToastTray() {
  const toasts = useGameStore((state) => state.toasts);
  const removeToast = useGameStore((state) => state.removeToast);

  useEffect(() => {
    if (!toasts.length) return undefined;

    const timers = toasts.map((toast) => setTimeout(() => removeToast(toast.id), TOAST_TTL_MS));
    return () => timers.forEach((timer) => clearTimeout(timer));
  }, [toasts, removeToast]);

  if (!toasts.length) return null;

  return (
    <div className="toast-tray" aria-live="polite" aria-atomic="false">
      {toasts.map((toast) => (
        <div key={toast.id} className={`toast-card ${toast.tone || 'info'}`}>
          {toast.message}
        </div>
      ))}
    </div>
  );
}
