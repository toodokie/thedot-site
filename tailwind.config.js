/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./src/app/**/*.{js,ts,jsx,tsx}",
    "./src/components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        'white-smoke-2': '#ebebe7',
        'dim-grey': '#47453f',
        'yellow': '#daff00',
        'raw-white': '#faf9f6',
        'white-smoke-nav': 'rgba(250, 249, 246, 0.7)',
        'grey-2': '#7a776f',
        'font-primary': '#35332f',
        'dark-slate': '#1A3C34',
        'copy': '#1f1f1f', // Replaced 'sour' with 'copy' as the text color
      },
      fontFamily: {
        'futura': ['futura-pt', 'sans-serif'],
        'real-text': ['ff-real-text-pro', 'sans-serif'],
        'real-text-2': ['ff-real-text-pro-2', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
