"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { Button } from "./Button";
import { Icon } from "./Icon";

// Native <dialog>: showModal() traps focus and makes the page inert; we add
// return-focus-to-trigger, Escape handling, backdrop click and the
// full-screen sheet layout on mobile (CSS).
export function Modal({
  id,
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  id: string;
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  // Two-column content such as the media details and picker.
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const trigger = useRef<Element | null>(null);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      trigger.current = document.activeElement;
      d.showModal();
    } else if (!open && d.open) {
      d.close();
    }
  }, [open]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    const handleClose = () => {
      onClose();
      const t = trigger.current;
      if (t instanceof HTMLElement) t.focus();
    };
    const handleCancel = (e: Event) => {
      // Escape: route through close() so focus is returned consistently.
      e.preventDefault();
      d.close();
    };
    d.addEventListener("close", handleClose);
    d.addEventListener("cancel", handleCancel);
    return () => {
      d.removeEventListener("close", handleClose);
      d.removeEventListener("cancel", handleCancel);
    };
  }, [onClose]);

  return (
    <dialog
      ref={ref}
      id={id}
      className={wide ? "adm-modal adm-modal-wide" : "adm-modal"}
      aria-labelledby={`${id}-title`}
      onClick={(e) => {
        if (e.target === ref.current) ref.current?.close();
      }}
    >
      <div className="adm-modal-in">
        <div className="adm-modal-head">
          <h2 id={`${id}-title`}>{title}</h2>
          <button type="button" className="adm-iconbtn" aria-label="Close" onClick={() => ref.current?.close()}>
            <Icon name="close" />
          </button>
        </div>
        <div className="adm-modal-body">{children}</div>
        {footer && <div className="adm-modal-foot">{footer}</div>}
      </div>
    </dialog>
  );
}

// Destructive actions always confirm; the most dangerous ones require the
// user to type a phrase (brief §6.1).
export function ConfirmDialog({
  id,
  open,
  title,
  body,
  confirmLabel = "Confirm",
  tone = "danger",
  typed,
  pending,
  onConfirm,
  onCancel,
}: {
  id: string;
  open: boolean;
  title: string;
  body: ReactNode;
  confirmLabel?: string;
  tone?: "danger" | "primary";
  // When set, the user must type exactly this to enable the confirm button.
  typed?: string;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  // The parent keys this component per target so the typed value starts empty.
  const [value, setValue] = useState("");
  const ready = !typed || value.trim().toLowerCase() === typed.toLowerCase();
  return (
    <Modal
      id={id}
      open={open}
      onClose={onCancel}
      title={title}
      footer={
        <>
          <Button variant="ghost" onClick={onCancel} disabled={pending}>Cancel</Button>
          <Button variant={tone} onClick={onConfirm} disabled={!ready || pending}>
            {pending ? "Working" : confirmLabel}
          </Button>
        </>
      }
    >
      {typeof body === "string" ? <p>{body}</p> : body}
      {typed && (
        <div className="adm-field" style={{ marginBlockStart: 12 }}>
          <label className="adm-label" htmlFor={`${id}-typed`}>Type <span className="adm-mono">{typed}</span> to confirm</label>
          <input id={`${id}-typed`} className="adm-input" value={value} onChange={(e) => setValue(e.target.value)} autoComplete="off" />
        </div>
      )}
    </Modal>
  );
}
