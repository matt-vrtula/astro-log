import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// The Firebase web config is not secret: access is controlled by Auth and security rules.
// Hosting also serves it publicly at /__/firebase/init.json.
const firebaseConfig = {
  apiKey: "AIzaSyDupHbF81xFpwcfhRNS_vpDSCEjVAOdRpA",
  authDomain: "astrolog-2e82d.firebaseapp.com",
  projectId: "astrolog-2e82d",
  storageBucket: "astrolog-2e82d.firebasestorage.app",
  appId: "1:783969725104:web:427e2122991a3b8ca22975",
};

export const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: "select_account" });

// Offline cache: the log stays readable (and editable) with a poor connection in the field.
export const db = initializeFirestore(app, {
  localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }),
});
export const storage = getStorage(app);
