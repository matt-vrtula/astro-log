import { useEffect, useRef, type ReactNode } from "react";
import { CloseIcon } from "./Icons";

interface Props {
  title: string;
  onClose(): void;
  children: ReactNode;
}

export function Modal({ title, onClose, children }: Props) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
  }, []);

  return (
    <dialog
      ref={dialogRef}
      className="modal"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onMouseDown={(e) => {
        if (e.target === dialogRef.current) onClose();
      }}
    >
      <div className="modal-header">
        <h2>{title}</h2>
        <button type="button" className="icon-btn" onClick={onClose} aria-label="Close">
          <CloseIcon />
        </button>
      </div>
      {children}
    </dialog>
  );
}
