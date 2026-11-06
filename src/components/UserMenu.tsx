import { signOut, type User } from "firebase/auth";
import { useEffect, useRef, useState } from "react";
import { auth } from "../firebase";

function initialsOf(user: User) {
  const source = user.displayName || user.email || "?";
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join("");
}

export function UserMenu({ user }: { user: User }) {
  const [open, setOpen] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const logoutRef = useRef<HTMLButtonElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    logoutRef.current?.focus();
    const onClick = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setOpen(false);
        buttonRef.current?.focus();
      }
    };
    document.addEventListener("mousedown", onClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const showPhoto = user.photoURL && !photoFailed;

  return (
    <div className="user-menu" ref={rootRef}>
      <button
        ref={buttonRef}
        className="avatar-btn"
        type="button"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="Account menu"
        onClick={() => setOpen((o) => !o)}
      >
        {showPhoto ? (
          <img src={user.photoURL!} alt="" referrerPolicy="no-referrer" onError={() => setPhotoFailed(true)} />
        ) : (
          <span aria-hidden="true">{initialsOf(user)}</span>
        )}
      </button>
      {open && (
        <div className="dropdown" role="menu">
          <div className="dropdown-header">
            <div className="dropdown-name">{user.displayName || "Signed in"}</div>
            <div className="dropdown-email">{user.email}</div>
          </div>
          <button ref={logoutRef} className="dropdown-item" type="button" role="menuitem" onClick={() => signOut(auth)}>
            Log out
          </button>
        </div>
      )}
    </div>
  );
}
