/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Paleta nocturna: del negro tinta al violeta profundo
        ink: {
          950: '#05030c',
          900: '#0a0716',
          800: '#120d24',
          700: '#1b1436',
          600: '#251a4a',
        },
        // Violeta / índigo místico
        mystic: {
          400: '#a78bfa',
          500: '#8b5cf6',
          600: '#6d33d6',
          700: '#4c1d95',
        },
        // Acentos dorados / cobrizos
        gold: {
          100: '#fbf3dc',
          200: '#f4e3b2',
          300: '#e8cd8a',
          400: '#d9b25f',
          500: '#c69749',
          600: '#a97a33',
          700: '#7d5622',
        },
        copper: {
          400: '#e0a072',
          500: '#c07a4c',
        },
        // Pantalla Luna: superficies nocturnas, lavanda para el texto
        // secundario y un rosa apagado para los eventos especiales.
        noche: {
          950: '#0D0717',
          900: '#130D1E',
          800: '#1B102B',
          700: '#241638',
          600: '#3A2952',
        },
        lavanda: {
          100: '#EFE9F3',
          200: '#D8CCDF',
          300: '#BCAECA',
          400: '#9F8FB0',
        },
        luna: {
          300: '#E5CA87',
          400: '#D8B66D',
        },
        rosa: {
          300: '#D9A9B8',
          400: '#C48A9C',
        },
      },
      fontFamily: {
        display: ['Cinzel', 'Playfair Display', 'serif'],
        body: ['Inter', 'Poppins', 'system-ui', 'sans-serif'],
      },
      boxShadow: {
        glow: '0 0 40px -8px rgba(214, 178, 95, 0.45)',
        'glow-strong': '0 0 60px -6px rgba(232, 205, 138, 0.65)',
        card: '0 18px 45px -18px rgba(0, 0, 0, 0.9)',
        inset: 'inset 0 1px 0 0 rgba(255,255,255,0.06)',
      },
      backgroundImage: {
        'gold-sheen':
          'linear-gradient(135deg, #7d5622 0%, #e8cd8a 28%, #fbf3dc 45%, #d9b25f 62%, #7d5622 100%)',
        'night':
          'radial-gradient(120% 90% at 50% -10%, #2b1a5c 0%, #150e2e 40%, #07050f 100%)',
      },
      keyframes: {
        twinkle: {
          '0%, 100%': { opacity: '0.18', transform: 'scale(0.85)' },
          '50%': { opacity: '0.95', transform: 'scale(1.15)' },
        },
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-10px)' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        'pulse-glow': {
          '0%, 100%': { opacity: '0.35' },
          '50%': { opacity: '0.8' },
        },
        'spin-slow': {
          from: { transform: 'rotate(0deg)' },
          to: { transform: 'rotate(360deg)' },
        },
      },
      animation: {
        twinkle: 'twinkle 4s ease-in-out infinite',
        float: 'float 7s ease-in-out infinite',
        shimmer: 'shimmer 3.5s linear infinite',
        'pulse-glow': 'pulse-glow 5s ease-in-out infinite',
        'spin-slow': 'spin-slow 90s linear infinite',
      },
    },
  },
  plugins: [],
};
