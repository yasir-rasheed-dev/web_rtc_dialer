/** @type {import('tailwindcss').Config} */
export default {
  darkMode: ["selector", '[data-theme="dark"]'],
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"]
      },
      colors: {
        bg: "rgb(var(--rn-bg) / <alpha-value>)",
        surface: "rgb(var(--rn-surface) / <alpha-value>)",
        "surface-2": "rgb(var(--rn-surface-2) / <alpha-value>)",
        "surface-3": "rgb(var(--rn-surface-3) / <alpha-value>)",
        border: "var(--rn-border)",
        "border-strong": "var(--rn-border-strong)",
        text: "rgb(var(--rn-text) / <alpha-value>)",
        muted: "rgb(var(--rn-muted) / <alpha-value>)",
        brand: {
          DEFAULT: "rgb(var(--rn-blue) / <alpha-value>)",
          soft: "rgb(var(--rn-blue) / 0.15)"
        },
        accent: {
          DEFAULT: "rgb(var(--rn-accent) / <alpha-value>)",
          soft: "rgb(var(--rn-accent) / 0.14)"
        },
        ring: "rgb(var(--rn-ring) / <alpha-value>)",
        success: {
          DEFAULT: "rgb(var(--rn-green) / <alpha-value>)",
          soft: "rgb(var(--rn-green) / 0.14)"
        },
        danger: {
          DEFAULT: "rgb(var(--rn-red) / <alpha-value>)",
          soft: "rgb(var(--rn-red) / 0.14)"
        },
        warning: {
          DEFAULT: "rgb(var(--rn-amber) / <alpha-value>)",
          soft: "rgb(var(--rn-amber) / 0.14)"
        }
      },
      boxShadow: {
        // Floating surfaces only (modals, popovers, toasts, call overlay).
        // Page cards are intentionally flat — border only.
        card: "0 10px 30px -12px rgba(9, 9, 11, 0.25)"
      },
      borderRadius: {
        lg: "var(--rn-radius)",
        xl: "calc(var(--rn-radius) + 0.25rem)",
        xl2: "calc(var(--rn-radius) + 0.5rem)"
      }
    }
  },
  plugins: []
}
