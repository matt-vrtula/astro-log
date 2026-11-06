import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    // The Firebase SDK (auth + Firestore + Storage) alone is ~800 kB minified.
    chunkSizeWarningLimit: 1200,
  },
});
