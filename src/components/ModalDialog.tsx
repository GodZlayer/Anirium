"use client";

import { useLayoutEffect, useRef, type ReactNode, type MouseEventHandler } from "react";

// Mounted only while its owning context is open. Native modality handles
// focus, background inertness and nested dialogs without a custom trap.
export default function ModalDialog({ children, label, className, onClose, onClick }: {
  children: ReactNode;
  label: string;
  className: string;
  onClose: () => void;
  onClick?: MouseEventHandler<HTMLDialogElement>;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    return () => { if (dialog.open) dialog.close(); };
  }, []);

  return (
    <dialog
      ref={dialogRef}
      onClick={onClick}
      aria-label={label}
      className={`m-0 max-w-none max-h-none border-0 ${className}`}
      onCancel={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClose();
      }}
    >
      {children}
    </dialog>
  );
}
