import { expect, test } from '@playwright/test';

const screenshotDir = 'tmp-playwright';

const PROJECT_DATE_OFFSETS: Record<string, number> = {
  'chromium-375': 10,
  'chromium-768': 13,
  'chromium-1024': 16,
  'chromium-1440': 0,
};

function projectDate(projectName: string, baseDate: string): string {
  const offset = PROJECT_DATE_OFFSETS[projectName] ?? 0;
  const date = new Date(`${baseDate}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + offset);
  return date.toISOString().slice(0, 10);
}

async function choosePackage(page: import('@playwright/test').Page, amount: string) {
  await page.locator('#booking label').filter({ hasText: amount }).first().click();
}

async function chooseTimeSlot(page: import('@playwright/test').Page, label: string) {
  await page.locator('#booking label').filter({ hasText: label }).first().click();
}

async function chooseDepartureLocation(page: import('@playwright/test').Page, label: string) {
  await page.locator('#booking label').filter({ hasText: label }).first().click();
}

test.describe('Papagayo connected frontend', () => {
  test('responsive smoke and screenshots', async ({ page }, testInfo) => {
    await page.goto('/');
    if (testInfo.project.name === 'chromium-375') {
      await expect(page.getByRole('button', { name: /Abrir menu|Open menu/i })).toBeVisible();
    } else {
      await expect(page.getByRole('navigation')).toBeVisible();
    }
    await expect(page.getByText('Second Wind').first()).toBeVisible();
    await expect(page.getByRole('button', { name: /Explore Boat/i }).first()).toBeVisible();
    await expect(page.locator('body')).not.toContainText('Required deposit');
    await expect(page.locator('body')).not.toContainText('50%');

    const viewport = testInfo.project.name.replace('chromium-', '');
    await page.screenshot({ path: `${screenshotDir}/home-${viewport}.png`, fullPage: true });
  });

  test('boat modal shows only associated tours and supports Escape', async ({ page }) => {
    await page.goto('/');
    const opener = page.getByRole('button', { name: /Explore Boat/i }).first();
    await opener.click();
    const dialog = page.getByRole('dialog').first();
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Beach & Snorkeling' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Fishing' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Surfing' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Water Toys' })).toBeVisible();
    await expect(dialog.getByRole('heading', { name: 'Bioluminescence' })).toBeVisible();
    await page.screenshot({ path: `${screenshotDir}/boat-modal.png`, fullPage: true });
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
  });

  test('ToursPage uses Supabase catalog values', async ({ page }) => {
    await page.goto('/tours');
    await expect(page.getByText('Tours aboard Second Wind')).toBeVisible();
    await expect(page.getByText(/USD\s*650/).first()).toBeVisible();
    await expect(page.getByText(/USD\s*750/).first()).toBeVisible();
    await expect(page.getByText(/Up to 10 guests/i).first()).toBeVisible();
    await page.screenshot({ path: `${screenshotDir}/tours-page.png`, fullPage: true });
  });

  test('booking pricing, availability conflict and pay on day result', async ({ page, context }, testInfo) => {
    const date = projectDate(testInfo.project.name, '2026-12-01');
    await page.goto('/');
    await page.locator('#booking').scrollIntoViewIfNeeded();
    const booking = page.locator('#booking');
    await booking.getByRole('button', { name: /Continue/i }).first().click();
    await booking.getByRole('button', { name: /Beach/i }).first().click();
    await choosePackage(page, 'USD 650');
    await page.getByLabel(/Date/i).fill(date);
    await page.getByLabel(/Guests/i).fill('6');
    await expect(page.getByText(/USD\s*715/).first()).toBeVisible();
    await chooseTimeSlot(page, 'Morning');
    await booking.getByRole('button', { name: /Continue/i }).last().click();
    await expect(page.getByRole('heading', { name: /Selecciona el lugar de salida/i })).toBeVisible();
    await expect(page.getByText(/Selecciona un lugar de salida/i)).toBeVisible();
    await chooseDepartureLocation(page, 'Tamarindo');
    await expect(page.getByText(/USD\s*765/).first()).toBeVisible();
    await booking.getByRole('button', { name: /Continuar|Continue/i }).last().click();
    await page.getByPlaceholder('John Smith').fill('E2E Tester');
    await page.getByPlaceholder('john@email.com').fill('e2e@example.com');
    await page.getByPlaceholder('+506 0000 0000').fill('50600000000');
    await page.getByText('Local verification mock is active.').waitFor();
    await page.getByRole('button', { name: /Pay on the Day/i }).click();
    await page.getByRole('button', { name: /Confirm reservation/i }).click();
    await expect(page.getByText('Booking Request Received')).toBeVisible();
    await expect(page.getByText('Your booking request has been received and is awaiting confirmation.')).toBeVisible();

    const second = await context.newPage();
    await second.goto('/');
    await second.locator('#booking').scrollIntoViewIfNeeded();
    const secondBooking = second.locator('#booking');
    await secondBooking.getByRole('button', { name: /Continue/i }).first().click();
    await secondBooking.getByRole('button', { name: /Beach/i }).first().click();
    await second.getByLabel(/Date/i).fill(date);
    await expect(second.getByText('Unavailable').first()).toBeVisible();
    await page.screenshot({ path: `${screenshotDir}/pay-on-day-result.png`, fullPage: true });
  });

  test('WhatsApp request creates booking before opening message', async ({ page, context }, testInfo) => {
    const date = projectDate(testInfo.project.name, '2026-12-02');
    let whatsappUrl = '';
    await context.route('https://wa.me/**', async (route) => {
      whatsappUrl = route.request().url();
      await route.abort();
    });
    await page.goto('/');
    await page.locator('#booking').scrollIntoViewIfNeeded();
    const booking = page.locator('#booking');
    await booking.getByRole('button', { name: /Continue/i }).first().click();
    await booking.getByRole('button', { name: /Fishing/i }).first().click();
    await page.getByLabel(/Date/i).fill(date);
    await chooseTimeSlot(page, 'Morning');
    await booking.getByRole('button', { name: /Continue/i }).last().click();
    await chooseDepartureLocation(page, 'Playas del Coco');
    await booking.getByRole('button', { name: /Continuar|Continue/i }).last().click();
    await page.getByPlaceholder('John Smith').fill('WhatsApp Tester');
    await page.getByPlaceholder('john@email.com').fill('wa@example.com');
    await page.getByPlaceholder('+506 0000 0000').fill('50600000000');
    await page.getByText('Local verification mock is active.').waitFor();
    await page.locator('[data-payment-method="whatsapp-link"]').click();

    await expect(page.getByText('Booking Request Created')).toBeVisible();
    await expect.poll(() => whatsappUrl).toContain('PFT-');

    const message = decodeURIComponent(whatsappUrl);
    const formattedDate = new Intl.DateTimeFormat('en-US', { month: 'long', day: 'numeric', year: 'numeric' }).format(new Date(`${date}T00:00:00`));
    expect(message).toContain('WhatsApp Tester');
    expect(message).toContain('Boat: Second Wind');
    expect(message).toContain('Tour: Fishing');
    expect(message).toMatch(/Package: Half Day/);
    expect(message).toContain(`Date: ${formattedDate}`);
    expect(message).toMatch(/Time:/);
    expect(message).toMatch(/Guests: \d+/);
    expect(message).toContain('Extras: None');
    expect(message).toContain('Departure location: Playas del Coco');
    expect(message).toContain('Departure surcharge: No cost');
    expect(message).toMatch(/Total: \$/);
    expect(message).not.toContain('Payment Successful');
    expect(page.getByText('Payment Successful')).toHaveCount(0);
    await page.screenshot({ path: `${screenshotDir}/whatsapp-result.png`, fullPage: true });
  });

  test('PayPal mock only succeeds after backend capture', async ({ page }, testInfo) => {
    const date = projectDate(testInfo.project.name, '2026-12-03');
    await page.goto('/');
    await page.locator('#booking').scrollIntoViewIfNeeded();
    const booking = page.locator('#booking');
    await booking.getByRole('button', { name: /Continue/i }).first().click();
    await booking.getByRole('button', { name: /Beach/i }).first().click();
    await page.getByLabel(/Date/i).fill(date);
    await chooseTimeSlot(page, 'Morning');
    await booking.getByRole('button', { name: /Continue/i }).last().click();
    await chooseDepartureLocation(page, 'Flamingo');
    await expect(page.getByText(/USD\s*700/).first()).toBeVisible();
    await booking.getByRole('button', { name: /Continuar|Continue/i }).last().click();
    await page.getByPlaceholder('John Smith').fill('PayPal Tester');
    await page.getByPlaceholder('john@email.com').fill('paypal@example.com');
    await page.getByPlaceholder('+506 0000 0000').fill('50600000000');
    await page.getByRole('button', { name: /PayPal/i }).click();
    await expect(page.getByText('Payment Successful')).toBeVisible();
    await page.screenshot({ path: `${screenshotDir}/paypal-success.png`, fullPage: true });
  });

  test('network error shows retry-safe message', async ({ page }) => {
    await page.route('**/rest/v1/**', (route) => route.fulfill({ status: 500, contentType: 'application/json', body: '{"message":"local e2e failure"}' }));
    await page.goto('/tours');
    await expect(page.getByText('We couldn’t load the booking information. Please try again.')).toBeVisible();
    await expect(page.getByRole('button', { name: /Retry/i })).toBeVisible();
  });
});
