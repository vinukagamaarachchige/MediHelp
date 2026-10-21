import { useEffect, useRef, useState } from "react";

export default function Toast({ toast, onDismiss }) {
  const [shown, setShown] = useState(false);
  const dismiss = useRef(onDismiss);
  dismiss.current = onDismiss;
  useEffect(() => {
    let nextFrame;
    let removal;
    const frame = requestAnimationFrame(() => { nextFrame = requestAnimationFrame(() => setShown(true)); });
    const timeout = setTimeout(() => {
      setShown(false);
      removal = setTimeout(() => dismiss.current(toast.id), 300);
    }, toast.type === "warn" ? 12000 : 7000);
    return () => { cancelAnimationFrame(frame); cancelAnimationFrame(nextFrame); clearTimeout(timeout); clearTimeout(removal); };
  }, [toast.id, toast.type]);
  return <div className={`app-toast app-toast-${toast.type}${shown ? " show" : ""}`}>
    <span className="toast-feedback-icon" aria-hidden="true">{toast.type === "success" ? "✅" : toast.type === "warn" ? "⚠️" : "ℹ️"}</span>
    <span>{toast.message}</span>
  </div>;
}
