import { fileURLToPath } from 'node:url';
import tailwindcss from '@tailwindcss/postcss';
export const root = fileURLToPath(new URL('../', import.meta.url));
export const common = {
  root,
  configFile: false,
  publicDir: false,
  resolve: { alias: { '@': root } },
  css: { postcss: { plugins: [tailwindcss()] } },
  logLevel: 'warn',
};
