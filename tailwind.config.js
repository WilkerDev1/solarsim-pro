/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: '#006c49',
          dark: '#005236',
          light: '#10b981',
          container: '#10b981',
          fixed: '#6ffbbe',
        },
        secondary: {
          DEFAULT: '#565e74',
          container: '#dae2fd',
        },
        tertiary: {
          DEFAULT: '#9d4300',
          container: '#ff7e2d',
        },
        surface: {
          DEFAULT: '#f8f9ff',
          dim: '#cbdbf5',
          bright: '#f8f9ff',
          variant: '#d3e4fe',
          container: {
            lowest: '#ffffff',
            low: '#eff4ff',
            DEFAULT: '#e5eeff',
            high: '#dce9ff',
            highest: '#d3e4fe',
          }
        },
        'on-surface': '#0b1c30',
        'on-surface-variant': '#3c4a42',
        'outline': '#6c7a71',
        'outline-variant': '#bbcabf',
      },
      fontFamily: {
        sans: ['Inter', 'sans-serif'],
        mono: ['JetBrains Mono', 'monospace'],
        display: ['Inter', 'Public Sans', 'sans-serif'],
      },
      borderRadius: {
        DEFAULT: '0.25rem',
        lg: '0.5rem',
        xl: '0.75rem',
        full: '9999px',
      }
    },
  },
  plugins: [],
}
