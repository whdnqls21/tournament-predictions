import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        // §6 디자인 토큰 — 축구장 다크 그린 테마
        pitch: {
          base: "#0c241d",
          alt: "#0e2a21",
          card: "rgba(255,255,255,0.045)",
          line: "rgba(255,255,255,0.07)",
        },
        grass: {
          DEFAULT: "#46e08a",
          soft: "#2faf68",
          deep: "#1c6b41",
        },
        gold: {
          DEFAULT: "#f4c64e",
          soft: "#caa23c",
        },
        ink: {
          DEFAULT: "#eaf5ef",
          dim: "#9db4a9",
          faint: "#6f8a7e",
        },
        danger: "#ff6b6b",
      },
      fontFamily: {
        display: ["var(--font-display)", "sans-serif"],
        body: ["var(--font-body)", "sans-serif"],
        numeric: ["var(--font-numeric)", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.35)",
        glow: "0 0 0 1px rgba(70,224,138,0.35), 0 0 24px rgba(70,224,138,0.18)",
      },
      borderRadius: {
        xl2: "1.25rem",
      },
    },
  },
  plugins: [],
};

export default config;
