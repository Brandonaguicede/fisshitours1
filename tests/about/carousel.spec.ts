import { test, expect } from '@playwright/test';
test('managed photos replace defaults, broken photos are skipped, carousel advances', async ({ page }) => {
 await page.route('**/test-*.svg', route => route.request().url().includes('broken')
   ? route.fulfill({status:404, body:''})
   : route.fulfill({contentType:'image/svg+xml', body:'<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><rect width="100" height="100" fill="blue"/></svg>'}));
 await page.goto('/tests/about/fixture.html');
 const photos = page.locator('#about .about-glass-showcase img');
 await expect(photos).toHaveCount(2);
 await expect(photos.nth(0)).toHaveAttribute('src', '/test-first.svg');
 await expect(photos.nth(1)).toHaveAttribute('src', '/test-third.svg');
 await expect(photos.nth(1)).toHaveClass(/opacity-100/, {timeout:6000});
 expect(await photos.evaluateAll(imgs => imgs.every(img => (img as HTMLImageElement).naturalWidth > 0))).toBe(true);
});
