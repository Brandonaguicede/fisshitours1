import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        forest: {
          50: '#F2EFE6',
          100: '#E2D9C7',
          200: '#C6BAA1',
          500: '#7A7B55',
          600: '#5F6243',
          700: '#484B35',
          900: '#23271F',
        },
        canopy: {
          950: '#11130F',
          900: '#1C2119',
          700: '#5F6243',
        },
        sand: {
          50: '#F6F2EA',
          100: '#E8DED0',
          300: '#CDBEA9',
        },
        stone: {
          950: '#151612',
          700: '#6D6A5F',
          500: '#9A9486',
        },
        ocean: {
          50: '#FFFFFF',
          100: '#F2FAFD',
          200: '#DDEFF6',
          300: '#A8D3E4',
          400: '#6EACC9',
          500: '#4986A7',
          600: '#2B5F82',
          700: '#214F72',
          800: '#1A466C',
          900: '#133E62',
          950: '#0B2842',
        },
        seafoam: {
          400: '#E2A86D',
          500: '#C9844A',
          600: '#9E6234',
        },
      },
      fontFamily: {
        sans: ['Manrope', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['EB Garamond', 'Georgia', 'serif'],
        serifDisplay: ['EB Garamond', 'Georgia', 'serif'],
      },
      fontWeight: {
        bold: '600',
        extrabold: '600',
      },
      boxShadow: {
        soft: '0 14px 36px rgba(17, 19, 15, 0.22)',
        lifted: '0 22px 54px rgba(17, 19, 15, 0.36)',
      },
      borderRadius: {
        '4xl': '2rem',
      },
    },
  },
  plugins: [],
};

export default config;
