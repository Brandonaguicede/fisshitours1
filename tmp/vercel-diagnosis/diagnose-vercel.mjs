import { chromium } from '@playwright/test';
import fs from 'node:fs/promises';

const urls = [
  ['home', 'https://fisshitours1-git-feature-storage-st-e899ba-papagayo-fishingtour.vercel.app/'],
  ['admin-login', 'https://fisshitours1-git-feature-storage-st-e899ba-papagayo-fishingtour.vercel.app/admin/login'],
];

const outDir = 'tmp/vercel-diagnosis';

async function inspectPage(page, label, url) {
  const consoleMessages = [];
  const pageErrors = [];
  const failedRequests = [];
  const badResponses = [];
  const supabaseResponses = [];
  const assets = [];

  page.on('console', (message) => {
    consoleMessages.push({ type: message.type(), text: message.text() });
  });
  page.on('pageerror', (error) => {
    pageErrors.push({ name: error.name, message: error.message, stack: error.stack });
  });
  page.on('requestfailed', (request) => {
    failedRequests.push({
      url: request.url(),
      method: request.method(),
      resourceType: request.resourceType(),
      failure: request.failure()?.errorText ?? '',
    });
  });
  page.on('response', async (response) => {
    const responseUrl = response.url();
    const status = response.status();
    const resourceType = response.request().resourceType();
    if (resourceType === 'script' || resourceType === 'stylesheet') {
      assets.push({ url: responseUrl, status, type: resourceType });
    }
    if ([400, 401, 403, 404, 500].includes(status)) {
      badResponses.push({ url: responseUrl, status, type: resourceType });
    }
    if (responseUrl.includes('supabase') || responseUrl.includes('/rest/v1/') || responseUrl.includes('/auth/v1/')) {
      let body = '';
      try {
        body = (await response.text()).slice(0, 600);
      } catch {
        body = '<unreadable>';
      }
      supabaseResponses.push({ url: responseUrl, status, type: resourceType, body });
    }
  });

  const documentResponse = await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
  await page.waitForTimeout(8000);

  const snapshot = await page.evaluate(() => {
    const root = document.querySelector('#root');
    const rootElements = root ? root.querySelectorAll('*').length : 0;
    const bodyText = document.body?.innerText ?? '';
    const rootHtml = root?.innerHTML.slice(0, 2000) ?? '';
    const activeLoaders = Array.from(document.querySelectorAll('*'))
      .map((element) => element.textContent?.trim() ?? '')
      .filter((text) => /loading|validando|cargando/i.test(text))
      .slice(0, 20);
    const topElement = document.elementFromPoint(window.innerWidth / 2, window.innerHeight / 2);
    const topStyle = topElement ? window.getComputedStyle(topElement) : null;
    const rootStyle = root ? window.getComputedStyle(root) : null;
    return {
      title: document.title,
      finalUrl: location.href,
      bodyText: bodyText.slice(0, 4000),
      bodyTextLength: bodyText.length,
      rootElements,
      rootHtml,
      activeLoaders,
      topElement: topElement ? {
        tag: topElement.tagName,
        id: topElement.id,
        className: String(topElement.className),
        pointerEvents: topStyle?.pointerEvents,
        position: topStyle?.position,
        zIndex: topStyle?.zIndex,
        opacity: topStyle?.opacity,
        display: topStyle?.display,
        visibility: topStyle?.visibility,
      } : null,
      rootStyle: rootStyle ? {
        display: rootStyle.display,
        visibility: rootStyle.visibility,
        opacity: rootStyle.opacity,
        height: rootStyle.height,
      } : null,
      bodyStyle: {
        display: window.getComputedStyle(document.body).display,
        visibility: window.getComputedStyle(document.body).visibility,
        opacity: window.getComputedStyle(document.body).opacity,
        background: window.getComputedStyle(document.body).backgroundColor,
      },
    };
  });

  await page.screenshot({ path: `${outDir}/${label}.png`, fullPage: true });

  return {
    label,
    requestedUrl: url,
    documentStatus: documentResponse?.status() ?? null,
    ...snapshot,
    consoleMessages,
    pageErrors,
    failedRequests,
    badResponses,
    supabaseResponses,
    assets,
  };
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
await context.tracing.start({ screenshots: true, snapshots: true, sources: true });

const results = [];
for (const [label, url] of urls) {
  const page = await context.newPage();
  results.push(await inspectPage(page, label, url));
  await page.close();
}

await context.tracing.stop({ path: `${outDir}/trace.zip` });
await browser.close();
await fs.writeFile(`${outDir}/diagnosis.json`, JSON.stringify(results, null, 2));
console.log(JSON.stringify(results.map((result) => ({
  label: result.label,
  documentStatus: result.documentStatus,
  finalUrl: result.finalUrl,
  title: result.title,
  bodyTextLength: result.bodyTextLength,
  rootElements: result.rootElements,
  pageErrors: result.pageErrors.length,
  failedRequests: result.failedRequests.length,
  badResponses: result.badResponses.length,
  supabaseResponses: result.supabaseResponses.map((response) => ({ url: response.url, status: response.status, body: response.body.slice(0, 120) })),
  assets: result.assets.length,
})), null, 2));
