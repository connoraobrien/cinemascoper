/** @type {import('tailwindcss').Config} */
module.exports = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    // lib/seedMovies.ts embeds Tailwind gradient classes as data (poster
    // placeholders) rather than literal strings inside a component, so it
    // has to be scanned too or Tailwind's JIT will purge those classes.
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        base: {
          950: "#0a0a0c",
          900: "#111114",
          850: "#15161a",
          800: "#1b1c21",
          700: "#26272e",
          600: "#33343c",
          500: "#4a4c56",
          400: "#6b6d78",
          300: "#94969f",
          200: "#c2c3ca",
          100: "#e7e7ea",
        },
        accent: {
          DEFAULT: "#5eead4",
          dim: "#2dd4bf",
          soft: "#134e4a",
        },
        alert: {
          DEFAULT: "#fb923c",
          soft: "#451a03",
        },
      },
      fontFamily: {
        sans: [
          "Inter",
          "-apple-system",
          "BlinkMacSystemFont",
          "Segoe UI",
          "sans-serif",
        ],
      },
    },
  },
  plugins: [],
};
