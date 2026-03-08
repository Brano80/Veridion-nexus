/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './pages/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
    './app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      fontSize: {
        // Reduce base font sizes for better DPI scaling
        'xs': ['0.75rem', { lineHeight: '1rem' }],      // 12px
        'sm': ['0.8125rem', { lineHeight: '1.25rem' }], // 13px
        'base': ['0.875rem', { lineHeight: '1.375rem' }], // 14px (reduced from 16px)
        'lg': ['0.9375rem', { lineHeight: '1.5rem' }], // 15px
        'xl': ['1rem', { lineHeight: '1.5rem' }],      // 16px
        '2xl': ['1.125rem', { lineHeight: '1.75rem' }], // 18px (reduced from 24px)
        '3xl': ['1.25rem', { lineHeight: '1.75rem' }], // 20px (reduced from 30px)
      },
      spacing: {
        // Reduce default spacing scale
        '0.5': '0.125rem',  // 2px
        '1': '0.25rem',     // 4px
        '1.5': '0.375rem',  // 6px
        '2': '0.5rem',      // 8px
        '2.5': '0.625rem',  // 10px
        '3': '0.75rem',     // 12px
        '3.5': '0.875rem',  // 14px
        '4': '1rem',        // 16px
        '5': '1.25rem',     // 20px
        '6': '1.5rem',      // 24px
        '8': '2rem',        // 32px
      },
    },
  },
  plugins: [],
}
