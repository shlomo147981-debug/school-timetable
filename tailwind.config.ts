import type { Config } from 'tailwindcss';

// RTL: אנו משתמשים רק במחלקות לוגיות (ms-/me-/ps-/pe-/start-/end-/text-start)
// כך שהממשק מתהפך אוטומטית לפי dir="rtl" ב-<html>.
const config: Config = {
  content: ['./src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: { sans: ['Heebo', 'Arial', 'sans-serif'] },
      colors: {
        brand: { 50: '#eef6ff', 100: '#d9eaff', 500: '#2f6fed', 600: '#2459c9', 700: '#1d47a0' },
      },
    },
  },
  plugins: [],
};
export default config;
