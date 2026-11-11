// Read-only local configuration check. Never prints credentials or calls a gateway.
import fs from 'node:fs/promises';
import ts from 'typescript';
import { loadEnv } from 'vite';

const source = await fs.readFile(new URL('../src/utils/bacConfig.ts', import.meta.url), 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext },
}).outputText;
const { resolveBacConfig, isAllowedGatewayOrigin } = await import(`data:text/javascript;base64,${Buffer.from(compiled).toString('base64')}`);
const mode = process.argv[2] || 'development';
const browser = loadEnv(mode, process.cwd(), 'VITE_');
// Vite's "bac" mode reads .env.bac.local. No values are copied into the app.
const server = loadEnv('bac', process.cwd(), 'BAC_');
const config = resolveBacConfig({
  tokenizationKey: browser.VITE_BAC_TOKENIZATION_KEY,
  checkoutKey: browser.VITE_BAC_CHECKOUT_KEY,
  gatewayUrl: browser.VITE_BAC_GATEWAY_URL,
});
const populated = (value) => Boolean(value?.trim()) && !/SENSITIVE|<|>/.test(value);
const validOrigin = (value) => isAllowedGatewayOrigin(value?.trim().replace(/\/+$/, '') || '');
const validSupabaseOrigin = (value) => {
  try {
    const url = new URL(value);
    return ['http:', 'https:'].includes(url.protocol) && url.pathname === '/'
      && !url.search && !url.hash && !url.username && !url.password;
  } catch { return false; }
};
const privateKeyInBrowser = Object.entries(browser).some(([name, value]) => name.startsWith('VITE_')
  && Boolean(server.BAC_SECURITY_KEY?.trim()) && value?.trim() === server.BAC_SECURITY_KEY.trim());
const checks = {
  VITE_SUPABASE_URL: validSupabaseOrigin(browser.VITE_SUPABASE_URL),
  VITE_SUPABASE_ANON_KEY: populated(browser.VITE_SUPABASE_ANON_KEY),
  VITE_BAC_TOKENIZATION_KEY: populated(browser.VITE_BAC_TOKENIZATION_KEY)
    && browser.VITE_BAC_TOKENIZATION_KEY.trim() !== server.BAC_SECURITY_KEY?.trim(),
  VITE_BAC_CHECKOUT_KEY: populated(browser.VITE_BAC_CHECKOUT_KEY),
  VITE_BAC_GATEWAY_URL: validOrigin(browser.VITE_BAC_GATEWAY_URL),
  BAC_SECURITY_KEY: populated(server.BAC_SECURITY_KEY),
  BAC_GATEWAY_URL: validOrigin(server.BAC_GATEWAY_URL),
  BAC_PROCESSOR_ID: server.BAC_PROCESSOR_ID === '70608880',
  BAC_TRANSACTION_TYPE: server.BAC_TRANSACTION_TYPE === 'sale',
  privateKeyAbsentFromBrowser: !privateKeyInBrowser,
  browserKeyFormats: config.configured,
  matchingGatewayOrigins: validOrigin(browser.VITE_BAC_GATEWAY_URL)
    && validOrigin(server.BAC_GATEWAY_URL)
    && config.gatewayUrl === server.BAC_GATEWAY_URL?.trim().replace(/\/+$/, ''),
};
for (const [name, ok] of Object.entries(checks)) console.log(`${ok ? 'OK' : 'PENDIENTE'} ${name}`);
console.log('Solo valida archivos locales. No verifica claves con BAC, Test Mode, secretos remotos, despliegues ni la activacion comercial.');
process.exitCode = Object.values(checks).every(Boolean) ? 0 : 1;
