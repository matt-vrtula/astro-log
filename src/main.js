import { onAuthStateChanged, signInWithPopup, signOut } from "firebase/auth";
import { auth, googleProvider } from "./firebase.js";
import "./style.css";

const $ = (id) => document.getElementById(id);

const signInView = $("sign-in-view");
const appView = $("app-view");
const signInBtn = $("google-sign-in");
const signInError = $("sign-in-error");

const userButton = $("user-button");
const dropdown = $("user-dropdown");
const avatar = $("user-avatar");
const initials = $("user-initials");
const userName = $("user-name");
const userEmail = $("user-email");
const signOutBtn = $("sign-out");

// ---- Sign-in page ----

const IGNORED_SIGN_IN_ERRORS = new Set([
  "auth/popup-closed-by-user",
  "auth/cancelled-popup-request",
]);

signInBtn.addEventListener("click", async () => {
  signInError.hidden = true;
  signInBtn.disabled = true;
  try {
    await signInWithPopup(auth, googleProvider);
  } catch (err) {
    if (!IGNORED_SIGN_IN_ERRORS.has(err.code)) {
      console.error(err);
      signInError.textContent = "Sign-in failed. Please try again.";
      signInError.hidden = false;
    }
  } finally {
    signInBtn.disabled = false;
  }
});

// ---- User menu ----

function setMenuOpen(open) {
  dropdown.hidden = !open;
  userButton.setAttribute("aria-expanded", String(open));
  if (open) signOutBtn.focus();
}

userButton.addEventListener("click", () => setMenuOpen(dropdown.hidden));

document.addEventListener("click", (e) => {
  if (!dropdown.hidden && !e.target.closest(".user-menu")) setMenuOpen(false);
});

document.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && !dropdown.hidden) {
    setMenuOpen(false);
    userButton.focus();
  }
});

signOutBtn.addEventListener("click", async () => {
  setMenuOpen(false);
  await signOut(auth);
});

function getInitials(user) {
  const source = user.displayName || user.email || "?";
  return source
    .split(/[\s@.]+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join("");
}

function showInitials() {
  avatar.hidden = true;
  initials.hidden = false;
}

// Fall back to initials if the Google profile photo fails to load.
avatar.addEventListener("error", showInitials);

function renderUser(user) {
  userName.textContent = user.displayName || "Signed in";
  userEmail.textContent = user.email || "";
  initials.textContent = getInitials(user);

  if (user.photoURL) {
    avatar.src = user.photoURL;
    avatar.hidden = false;
    initials.hidden = true;
  } else {
    showInitials();
  }
}

// ---- Auth state ----
// Both views start hidden, so nothing flashes while Firebase restores the session.

onAuthStateChanged(auth, (user) => {
  signInView.hidden = Boolean(user);
  appView.hidden = !user;
  setMenuOpen(false);

  if (user) renderUser(user);
});
