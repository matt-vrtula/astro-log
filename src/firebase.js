import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";

// The Firebase web config is not secret: access is controlled by Auth and security rules.
// Hosting also serves it publicly at /__/firebase/init.json.
const firebaseConfig = {
  apiKey: "AIzaSyDupHbF81xFpwcfhRNS_vpDSCEjVAOdRpA",
  authDomain: "astrolog-2e82d.firebaseapp.com",
  projectId: "astrolog-2e82d",
  appId: "1:783969725104:web:427e2122991a3b8ca22975",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });
