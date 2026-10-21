import { useEffect, useRef } from "react";

export default function Dialog({ title, onClose, children }) {
  const dialog = useRef(null);
  const close = useRef(onClose);
  close.current = onClose;
  useEffect(() => {
    const previous = document.activeElement;
    const element = dialog.current;
    const oldOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const focusable = () => [...element.querySelectorAll('button:not(:disabled), input, a[href], select, textarea, [tabindex="0"]')];
    (element.querySelector("[autofocus], input:not(:disabled), textarea:not(:disabled), select:not(:disabled)") || focusable()[0] || element).focus();
    function key(event) {
      if (event.key === "Escape") { event.preventDefault(); close.current(); }
      if (event.key !== "Tab") return;
      const items = focusable();
      const first = items[0]; const last = items[items.length - 1];
      if (!first) { event.preventDefault(); return; }
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    }
    document.addEventListener("keydown", key);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener("keydown", key); previous?.focus(); };
  }, []);
  return <div className="modal-overlay"><section ref={dialog} className="modal-content accessible-dialog" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1}><button className="dialog-close btn btn-secondary" onClick={onClose} aria-label="Close dialog">✕</button>{children}</section></div>;
}
