import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        rush: {
          50: "#FEF2F1",
          100: "#FDE3E1",
          200: "#FBCCC9",
          300: "#F7A8A4",
          400: "#F17670",
          500: "#E63A2E",
          600: "#D92D20",
          700: "#B42318",
          800: "#93231A",
          900: "#77241D",
        },
        ink: {
          50: "#F0EEEB",
          100: "#E8E3DE",
          200: "#D4CDC5",
          300: "#A59CA6",
          400: "#776D7B",
          500: "#716A74",
          600: "#5C555F",
          700: "#474149",
          800: "#322D35",
          900: "#262329",
        },
        paper: "#F8F6F3",
      },
      fontFamily: {
        display: ["'Space Grotesk'", "Inter", "system-ui", "sans-serif"],
        sans: ["Inter", "system-ui", "-apple-system", "sans-serif"],
      },
      boxShadow: {
        "rush-pop": "0 8px 30px -12px rgba(224, 46, 43, 0.45)",
        card: "0 1px 2px rgba(19, 16, 34, 0.06), 0 4px 16px -4px rgba(19, 16, 34, 0.08)",
      },
      keyframes: {
        "message-in": {
          "0%": { opacity: "0", transform: "translateY(6px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        pulseDot: {
          "0%, 100%": { transform: "scale(1)", opacity: "1" },
          "50%": { transform: "scale(1.35)", opacity: "0.65" },
        },
      },
      animation: {
        "message-in": "message-in 160ms ease-out both",
        "pulse-dot": "pulseDot 1.6s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};

export default config;
