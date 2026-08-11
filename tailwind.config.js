/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        gold: {
          50:  '#FBF5E1',
          100: '#F5EBD0',
          200: '#E8D58A',
          300: '#DCC066',
          400: '#D4AF37',
          500: '#B8941F',
          600: '#8B6F1F',
          700: '#5C4A14',
          800: '#3D310D',
          900: '#1F1806'
        },
        ink: {
          50:  '#F7F7F7',
          100: '#E5E5E5',
          200: '#C7C7C7',
          300: '#9A9A9A',
          400: '#6E6E6E',
          500: '#4A4A4A',
          600: '#2E2E2E',
          700: '#1A1A1A',
          800: '#101010',
          900: '#0A0A0A'
        },
        parchment: {
          50:  '#FBF6E9',
          100: '#F5EBD0',
          200: '#E8D9A8',
          300: '#D9C382',
          400: '#B89A56'
        }
      },
      fontFamily: {
        display: ['"Cinzel"', 'Georgia', 'serif'],
        body: ['"Inter"', 'system-ui', '-apple-system', 'sans-serif'],
        mono: ['"JetBrains Mono"', 'ui-monospace', 'monospace']
      },
      boxShadow: {
        gold: '0 0 0 1px rgba(212,175,55,0.35), 0 4px 20px rgba(212,175,55,0.15)',
        'gold-lg': '0 0 0 1px rgba(212,175,55,0.5), 0 8px 32px rgba(212,175,55,0.25)',
        'inner-gold': 'inset 0 0 0 1px rgba(212,175,55,0.4)'
      },
      animation: {
        'quill': 'quill 1.6s ease-in-out infinite',
        'pulse-soft': 'pulseSoft 2.4s ease-in-out infinite',
        'fade-in': 'fadeIn 0.3s ease-out',
        'slide-up': 'slideUp 0.35s cubic-bezier(0.16, 1, 0.3, 1)',
        'tumble': 'tumble 1.2s cubic-bezier(0.34, 1.56, 0.64, 1)',
        'glow': 'glow 2s ease-in-out infinite'
      },
      keyframes: {
        quill: {
          '0%,100%': { transform: 'rotate(-8deg) translateY(0)' },
          '50%': { transform: 'rotate(8deg) translateY(-3px)' }
        },
        pulseSoft: {
          '0%,100%': { opacity: '0.55' },
          '50%': { opacity: '1' }
        },
        fadeIn: {
          from: { opacity: '0' }, to: { opacity: '1' }
        },
        slideUp: {
          from: { opacity: '0', transform: 'translateY(8px)' },
          to: { opacity: '1', transform: 'translateY(0)' }
        },
        tumble: {
          '0%': { transform: 'rotate(0deg) scale(0.6)', opacity: '0' },
          '20%': { opacity: '1' },
          '100%': { transform: 'rotate(900deg) scale(1)', opacity: '1' }
        },
        glow: {
          '0%,100%': { boxShadow: '0 0 12px rgba(212,175,55,0.3)' },
          '50%': { boxShadow: '0 0 28px rgba(212,175,55,0.7)' }
        }
      }
    }
  },
  plugins: []
};
