/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./src/**/*.{ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        // ringNex brand — same as web (#0684BC blue, #FF7A00 orange).
        // Semantic tokens are driven by CSS vars set per theme in global.css
        // so `dark:` and the runtime toggle both work.
        brand: {
          DEFAULT: "#0684BC",
          600: "#0571a3",
          300: "#38a8d8",
          100: "#8fd2ee"
        },
        accent: {
          DEFAULT: "#FF7A00",
          300: "#ff9a3d",
          100: "#ffc999"
        },
        bg: "rgb(var(--rn-bg) / <alpha-value>)",
        surface: "rgb(var(--rn-surface) / <alpha-value>)",
        "surface-2": "rgb(var(--rn-surface-2) / <alpha-value>)",
        border: "rgb(var(--rn-border) / <alpha-value>)",
        text: "rgb(var(--rn-text) / <alpha-value>)",
        muted: "rgb(var(--rn-muted) / <alpha-value>)",
        success: "#16a34a",
        danger: "#dc2626",
        warning: "#d97706"
      },
      fontFamily: {
        sans: ["Inter", "System"]
      }
    }
  },
  plugins: []
};
