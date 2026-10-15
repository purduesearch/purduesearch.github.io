import React, { useEffect, useId, useRef } from "react";
import { createPortal } from "react-dom";
import MobileSheet from "../MobileSheet";
import { useCompactLayout } from "../../../clubpm/layout/compactLayout";

export default function VaultRepositoryModal({ children, onClose }) {
  const compact = useCompactLayout();
  const dialogRef = useRef(null);
  const titleId = useId();

  useEffect(() => {
    if (compact) return;
    const dialog = dialogRef.current;
    const opener = document.activeElement;
    const previousOverflow = document.body.style.overflow;
    dialog.showModal();
    document.body.style.overflow = "hidden";
    return () => {
      dialog.close();
      document.body.style.overflow = previousOverflow;
      if (opener?.isConnected) opener.focus();
    };
  }, [compact]);

  if (compact) {
    return (
      <MobileSheet title="Repository details" variant="fullscreen" onClose={onClose} className="pm-m-files-layer">
        {children}
      </MobileSheet>
    );
  }

  return createPortal(
    <dialog
      ref={dialogRef}
      className="cpm-vault-repository-modal"
      aria-labelledby={titleId}
      onCancel={event => { event.preventDefault(); onClose(); }}
      onClick={event => {
        if (event.target !== event.currentTarget) return;
        const bounds = event.currentTarget.getBoundingClientRect();
        if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) onClose();
      }}
    >
      <div className="cpm-vault-repository-modal-header">
        <h2 id={titleId}>Repository details</h2>
        <button type="button" className="cpm-vault-modal-close" aria-label="Close modal" onClick={onClose}>
          <i className="fas fa-xmark" aria-hidden="true" />
        </button>
      </div>
      {children}
    </dialog>,
    document.body
  );
}
