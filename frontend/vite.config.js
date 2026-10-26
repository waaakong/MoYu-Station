import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";

const isEnabled = (value) => value === "1" || value === "true" || value === "yes";
const isDisabled = (value) => value === "0" || value === "false" || value === "no";

const extraAllowedHosts = (process.env.VITE_ALLOWED_HOSTS || "")
  .split(",")
  .map((host) => host.trim())
  .filter(Boolean);

const fixedAllowedHosts = [
  "localhost",
  "127.0.0.1",
  "192.168.1.43",
  "frp-pen.com",
  ".frp-pen.com",
  "frp-leg.com",
  ".frp-leg.com",
  ...extraAllowedHosts
];

const openTunnelHosts = isEnabled(process.env.VITE_DEV_TUNNEL)
  || process.env.VITE_ALLOWED_HOSTS === "*"
  || isEnabled(process.env.VITE_ALLOW_ALL_HOSTS);

const allowedHosts = openTunnelHosts ? true : fixedAllowedHosts;
const backendTarget = process.env.VITE_BACKEND_TARGET || "http://localhost:8080";
const backendWsTarget = backendTarget.replace(/^http/i, "ws");

export default defineConfig({
  base: "./",
  plugins: [vue()],
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("element-plus")) return "ui";
          if (id.includes("three")) return "three";
          if (id.includes("vue") || id.includes("pinia")) return "vue";
          return "vendor";
        }
      }
    }
  },
  server: {
    host: "0.0.0.0",
    allowedHosts,
    port: 5173,
    proxy: {
      "/api": {
        target: backendTarget,
        changeOrigin: true
      },
      "/uploads": {
        target: backendTarget,
        changeOrigin: true
      },
      "/ws": {
        target: backendWsTarget,
        changeOrigin: true,
        ws: true
      }
    }
  }
});
