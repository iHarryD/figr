import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        "outline-hover": "#4f9cf9",
        "outline-selected": "#1a6ff4",
        "panel-bg": "#1a1a1a",
        "panel-border": "#2e2e2e",
        "panel-text": "#e4e4e4",
        "panel-muted": "#8a8a8a",
      },
    },
  },
  plugins: [],
} satisfies Config;
