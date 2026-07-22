import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{ts,tsx}',
    './components/**/*.{ts,tsx}',
    '../../packages/ui/src/**/*.{ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        navy: '#0f1f3d',
        mist: '#f5f9ff',
      },
      boxShadow: {
        soft: '0 12px 30px rgba(15, 31, 61, 0.08)',
      },
    },
  },
  plugins: [],
};

export default config;
