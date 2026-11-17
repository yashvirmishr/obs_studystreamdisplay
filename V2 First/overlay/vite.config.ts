import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  base: "/overlay/",
  server: {
    port: 5174,
    strictPort: true,
    // Bind loopback explicitly: OBS Browser Sources use the documented
    // http://127.0.0.1:5174/overlay/<scene_id> URL, and vite's default
    // "localhost" binding resolves to ::1 only, refusing 127.0.0.1.
    // Loopback-only keeps the invariant of no public exposure.
    host: "127.0.0.1",
  },
});
