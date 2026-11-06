import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import { AuthProvider, useAuth } from "./auth/AuthProvider";
import { SignInPage } from "./auth/SignInPage";
import "./styles.css";

function Root() {
  const { user, loading } = useAuth();
  // Render nothing until Firebase restores the session, so the sign-in page doesn't flash.
  if (loading) return null;
  // Keyed by uid so switching accounts starts from a clean state.
  return user ? <App key={user.uid} user={user} /> : <SignInPage />;
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <AuthProvider>
      <Root />
    </AuthProvider>
  </StrictMode>,
);
