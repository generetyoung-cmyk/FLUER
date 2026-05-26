import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        // ── FLUER Design System ──────────────────────────
        // Background layers
        "bg-base": "#0A0A0B",
        "bg-elevated": "#111114",
        "bg-raised": "#18181D",
        "bg-input": "#1E1E25",
        "bg-hover": "#22222B",

        // Borders
        "border-subtle": "#1F1F28",
        "border-default": "#2A2A38",
        "border-strong": "#3A3A4A",

        // Text
        "text-primary": "#F4F4F6",
        "text-secondary": "#8B8B99",
        "text-tertiary": "#52525F",
        "text-inverted": "#0A0A0B",

        // Accent — FLUER Purple
        "accent-primary": "#7C5CFC",
        "accent-hover": "#8B6DFF",
        "accent-muted": "rgba(124,92,252,0.10)",
        "accent-border": "rgba(124,92,252,0.25)",

        // Semantic
        positive: "#22C55E",
        negative: "#EF4444",
        warning: "#F59E0B",
        info: "#3B82F6",
        neutral: "#6B7280",

        "bg-positive": "rgba(34,197,94,0.08)",
        "bg-negative": "rgba(239,68,68,0.08)",
        "bg-warning": "rgba(245,158,11,0.08)",
      },

      fontFamily: {
        display: ["var(--font-geist-sans)", "Inter", "system-ui", "sans-serif"],
        body: ["var(--font-inter)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "JetBrains Mono", "Fira Code", "monospace"],
      },

      fontSize: {
        "2xs": ["10px", { lineHeight: "1.4" }],
        xs: ["11px", { lineHeight: "1.4" }],
        sm: ["12px", { lineHeight: "1.4" }],
        base: ["13px", { lineHeight: "1.5" }],
        md: ["14px", { lineHeight: "1.5" }],
        lg: ["16px", { lineHeight: "1.4" }],
        xl: ["20px", { lineHeight: "1.3" }],
        "2xl": ["24px", { lineHeight: "1.2" }],
        "3xl": ["30px", { lineHeight: "1.1" }],
        "4xl": ["36px", { lineHeight: "1.1" }],
        "5xl": ["48px", { lineHeight: "1.0" }],
      },

      borderRadius: {
        sm: "4px",
        md: "6px",
        lg: "8px",
        xl: "12px",
        "2xl": "16px",
        full: "9999px",
      },

      spacing: {
        "0.5": "2px",
        "1": "4px",
        "1.5": "6px",
        "2": "8px",
        "3": "12px",
        "4": "16px",
        "5": "20px",
        "6": "24px",
        "8": "32px",
        "10": "40px",
        "12": "48px",
        "16": "64px",
        "20": "80px",
      },

      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-up": "slideUp 0.25s ease-out",
        "slide-down": "slideDown 0.2s ease-out",
        "pulse-subtle": "pulseSubtle 2s infinite",
        "blink": "blink 1.2s step-end infinite",
        "shimmer": "shimmer 1.5s infinite",
        "number-flash": "numberFlash 0.4s ease-out",
        "glow-purple": "glowPurple 2s ease-in-out infinite alternate",
      },

      keyframes: {
        fadeIn: {
          from: { opacity: "0" },
          to: { opacity: "1" },
        },
        slideUp: {
          from: { opacity: "0", transform: "translateY(8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        slideDown: {
          from: { opacity: "0", transform: "translateY(-8px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
        pulseSubtle: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        blink: {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0" },
        },
        shimmer: {
          "0%": { backgroundPosition: "-200% 0" },
          "100%": { backgroundPosition: "200% 0" },
        },
        numberFlash: {
          "0%": { opacity: "0.4" },
          "50%": { opacity: "1" },
          "100%": { opacity: "1" },
        },
        glowPurple: {
          from: { boxShadow: "0 0 8px rgba(124,92,252,0.2)" },
          to: { boxShadow: "0 0 20px rgba(124,92,252,0.4)" },
        },
      },

      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "fluer-grid":
          "linear-gradient(rgba(42,42,56,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(42,42,56,0.4) 1px, transparent 1px)",
        "shimmer-loading":
          "linear-gradient(90deg, transparent 0%, rgba(255,255,255,0.04) 50%, transparent 100%)",
      },

      backgroundSize: {
        "grid-40": "40px 40px",
      },

      boxShadow: {
        "panel": "0 1px 3px rgba(0,0,0,0.4), 0 0 0 1px rgba(42,42,56,1)",
        "elevated": "0 4px 16px rgba(0,0,0,0.5), 0 0 0 1px rgba(42,42,56,0.8)",
        "accent": "0 0 0 1px rgba(124,92,252,0.4), 0 4px 12px rgba(124,92,252,0.15)",
        "positive": "0 0 0 1px rgba(34,197,94,0.3)",
        "negative": "0 0 0 1px rgba(239,68,68,0.3)",
      },
    },
  },
  plugins: [],
};

export default config;
