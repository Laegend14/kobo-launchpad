/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        kobo: {
          bg: '#070A10',
          surface: '#0A0E17',
          card: '#11192B',
          cardBorder: 'rgba(255, 255, 255, 0.08)',
          green: '#00E676',
          greenDark: '#00C853',
          gold: '#FFD700',
          cyan: '#00B0FF',
          muted: '#94A3B8'
        }
      },
      fontFamily: {
        grotesk: ['Space Grotesk', 'sans-serif'],
        inter: ['Inter', 'sans-serif']
      }
    },
  },
  plugins: [],
}
