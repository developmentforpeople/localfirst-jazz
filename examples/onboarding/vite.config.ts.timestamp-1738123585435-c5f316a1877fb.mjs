// vite.config.ts
import path from "path";
import react from "file:///Users/brad/dev/jazz/node_modules/@vitejs/plugin-react-swc/index.mjs";
import topLevelAwait from "file:///Users/brad/dev/jazz/node_modules/vite-plugin-top-level-await/exports/import.mjs";
import { defineConfig } from "file:///Users/brad/dev/jazz/node_modules/vite/dist/node/index.js";
var __vite_injected_original_dirname =
  "/Users/brad/dev/jazz/examples/onboarding";
var vite_config_default = defineConfig({
  plugins: [react(), topLevelAwait()],
  resolve: {
    alias: {
      "@": path.resolve(__vite_injected_original_dirname, "./src"),
    },
  },
  build: {
    minify: false,
  },
});
export { vite_config_default as default };
//# sourceMappingURL=data:application/json;base64,ewogICJ2ZXJzaW9uIjogMywKICAic291cmNlcyI6IFsidml0ZS5jb25maWcudHMiXSwKICAic291cmNlc0NvbnRlbnQiOiBbImNvbnN0IF9fdml0ZV9pbmplY3RlZF9vcmlnaW5hbF9kaXJuYW1lID0gXCIvVXNlcnMvYnJhZC9kZXYvamF6ei9leGFtcGxlcy9vbmJvYXJkaW5nXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ZpbGVuYW1lID0gXCIvVXNlcnMvYnJhZC9kZXYvamF6ei9leGFtcGxlcy9vbmJvYXJkaW5nL3ZpdGUuY29uZmlnLnRzXCI7Y29uc3QgX192aXRlX2luamVjdGVkX29yaWdpbmFsX2ltcG9ydF9tZXRhX3VybCA9IFwiZmlsZTovLy9Vc2Vycy9icmFkL2Rldi9qYXp6L2V4YW1wbGVzL29uYm9hcmRpbmcvdml0ZS5jb25maWcudHNcIjtpbXBvcnQgcGF0aCBmcm9tIFwicGF0aFwiO1xuaW1wb3J0IHJlYWN0IGZyb20gXCJAdml0ZWpzL3BsdWdpbi1yZWFjdC1zd2NcIjtcbmltcG9ydCB7IGRlZmluZUNvbmZpZyB9IGZyb20gXCJ2aXRlXCI7XG5pbXBvcnQgdG9wTGV2ZWxBd2FpdCBmcm9tIFwidml0ZS1wbHVnaW4tdG9wLWxldmVsLWF3YWl0XCI7XG5cbi8vIGh0dHBzOi8vdml0ZWpzLmRldi9jb25maWcvXG5leHBvcnQgZGVmYXVsdCBkZWZpbmVDb25maWcoe1xuICBwbHVnaW5zOiBbcmVhY3QoKSwgdG9wTGV2ZWxBd2FpdCgpXSxcbiAgcmVzb2x2ZToge1xuICAgIGFsaWFzOiB7XG4gICAgICBcIkBcIjogcGF0aC5yZXNvbHZlKF9fZGlybmFtZSwgXCIuL3NyY1wiKSxcbiAgICB9LFxuICB9LFxuICBidWlsZDoge1xuICAgIG1pbmlmeTogZmFsc2UsXG4gIH0sXG59KTtcbiJdLAogICJtYXBwaW5ncyI6ICI7QUFBMFMsT0FBTyxVQUFVO0FBQzNULE9BQU8sV0FBVztBQUNsQixTQUFTLG9CQUFvQjtBQUM3QixPQUFPLG1CQUFtQjtBQUgxQixJQUFNLG1DQUFtQztBQU16QyxJQUFPLHNCQUFRLGFBQWE7QUFBQSxFQUMxQixTQUFTLENBQUMsTUFBTSxHQUFHLGNBQWMsQ0FBQztBQUFBLEVBQ2xDLFNBQVM7QUFBQSxJQUNQLE9BQU87QUFBQSxNQUNMLEtBQUssS0FBSyxRQUFRLGtDQUFXLE9BQU87QUFBQSxJQUN0QztBQUFBLEVBQ0Y7QUFBQSxFQUNBLE9BQU87QUFBQSxJQUNMLFFBQVE7QUFBQSxFQUNWO0FBQ0YsQ0FBQzsiLAogICJuYW1lcyI6IFtdCn0K
