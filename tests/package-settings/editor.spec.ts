import { test, expect } from '@playwright/test';

async function mockCatalog(page: import('@playwright/test').Page) {
  const link = { id: '11111111-1111-4111-8111-111111111111', boat_id: 'test-boat', tour_id: 'fishing', active: true, sort_order: 1 };
  const tour = { id: 'fishing', title: 'Fishing Tour', category: 'Fishing', publication_status: 'published', active: true, sort_order: 1, description: 'A fishing trip', highlights: ['Fishing'], included: ['Drinks'], image_url: '/images/papagayo-logo.png' };
  const slots = [{ id: 'morning', label: 'Morning', starts_at: '08:00:00', active: true, sort_order: 1 }, { id: 'afternoon', label: 'Afternoon', starts_at: '13:00:00', active: true, sort_order: 2 }];
  const base = { boat_tour_id: link.id, base_price: 950, included_guests: 5, max_guests: 10, extra_guest_price: 65, custom_quote: false, active: true, departure_times: ['08:00', '13:00'], package_included: null, description: '', duration_minutes: 480, image_url: '/images/papagayo-logo.png' };
  const packages = [{ ...base, id: 'full', name: 'Fishing Tour - Full Day', package_type: 'full_day', sort_order: 1, meal_options: [{ es: 'Wrap de pollo', en: 'Chicken wrap' }] }, { ...base, id: 'half', name: 'Fishing Tour - Half Day', package_type: 'half_day', sort_order: 2, meal_options: [], base_price: 650, duration_minutes: 240 }];
  await page.addInitScript(() => localStorage.setItem('language', 'es'));
  await page.route(/\/rest\/v1\//, async route => {
    const request = route.request();
    const url = new URL(request.url());
    const table = url.pathname.split('/').at(-1);
    let data: any = [];
    if (table === 'tour_packages') {
      if (request.method() === 'POST') {
        const payload = request.postDataJSON();
        const target = packages.find(item => item.id === payload.id)!;
        Object.assign(target, payload);
        for (const time of payload.departure_times ?? []) if (!slots.some(slot => slot.starts_at.slice(0,5) === time)) slots.push({ id: 'departure-' + time.replace(':',''), label: time, starts_at: time + ':00', active: true, sort_order: 3 });
        await route.fulfill({ status: 201, body: '' }); return;
      }
      data = url.searchParams.get('select')?.includes('boat_tours!inner') ? packages.map(item => ({ ...item, boat_tours: { ...link, boats: { active: true, max_guests: 10 }, tours: tour } })) : packages;
    }
    if (table === 'boat_tours') data = request.headers().accept?.includes('vnd.pgrst.object') ? link : [link];
    if (table === 'tours') data = [tour];
    if (table === 'time_slots') data = slots;
    if (table === 'departure_locations') data = [{ id: 'departure-location', name: 'Playas del Coco', slug: 'coco', surcharge_amount: 0, currency: 'USD', active: true, is_default: true, sort_order: 1 }];
    if (table === 'payment_methods') data = [{ key: 'pay-on-day', name: 'Pay on the day', type: 'pay_on_day', active: true, sort_order: 1 }];
    await route.fulfill({ json: data });
  });
  await page.route(/\/functions\/v1\//, async route => {
    if (route.request().url().endsWith('get-booking-availability')) await route.fulfill({ json: { slots: slots.map(slot => ({ id: slot.id, label: slot.label, time: slot.starts_at.slice(0,5), available: slot.id !== 'morning' })) } });
    else await route.fulfill({ json: { base_price: 950, included_guests: 5, max_guests: 10, extra_guest_price: 65, total: 950, currency: 'USD', extras: [] } });
  });
  return { packages, slots };
}

test('package hours and meals persist and automatically reach the customer', async ({ page }, info) => {
  const errors: string[] = [];
  page.on('pageerror', error => errors.push(error.message));
  const { packages } = await mockCatalog(page);
  await page.goto('/tests/package-settings/fixture.html');
  await page.getByRole('button', { name: 'Editar Fishing Tour - Full Day', exact: true }).click();
  await page.getByRole('checkbox', { name: '13:00', exact: true }).uncheck();
  await page.getByLabel('Agregar hora de salida', { exact: true }).fill('09:30');
  await page.getByRole('button', { name: 'Agregar hora', exact: true }).click();
  await page.getByRole('checkbox', { name: 'Personalizar lo incluido' }).check();
  await page.getByLabel('Elementos incluidos, uno por línea').fill('Almuerzo incluido\nBebidas y frutas');
  await page.getByLabel('Comida 1 · Español').fill('Pescado con arroz');
  await page.getByLabel('Comida 1 · Inglés').fill('Fish with rice');
  await page.getByRole('button', { name: 'Agregar comida', exact: true }).click();
  await page.getByLabel('Comida 2 · Español').fill('Ensalada vegana');
  await page.getByLabel('Comida 2 · Inglés').fill('Vegan salad');
  await page.screenshot({ path: `tmp/package-settings-test/editor-${info.project.name}.png`, fullPage: true });
  await page.getByRole('button', { name: 'Guardar paquete', exact: true }).click();
  await expect(page.getByText('Paquete guardado.', { exact: true })).toBeVisible();
  expect(packages[0].departure_times).toEqual(['08:00', '09:30']);
  expect(packages[1].departure_times).toEqual(['08:00', '13:00']);
  await page.getByRole('button', { name: 'Editar Fishing Tour - Full Day', exact: true }).click();
  await expect(page.getByLabel('Comida 1 · Español')).toHaveValue('Pescado con arroz');
  await expect(page.getByRole('checkbox', { name: '09:30', exact: true })).toBeChecked();
  await page.getByRole('button', { name: 'Abrir reserva', exact: true }).click();
  await page.getByRole('button', { name: 'Continuar', exact: true }).click();
  await expect(page.getByText('Pescado con arroz', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Ensalada vegana', { exact: true }).first()).toBeVisible();
  await expect(page.locator('input[name="timeSlot"][value="morning"]')).toBeDisabled();
  await expect(page.locator('input[name="timeSlot"][value="departure-0930"]')).toBeChecked();
  await expect(page.locator('input[name="timeSlot"][value="afternoon"]')).toHaveCount(0);
  await page.locator('input[name="mealOption"]').first().check({ force: true });
  await page.locator('input[name="tourPackage"][value="half"]').check({ force: true });
  await expect(page.getByText('Escoge tu comida incluida', { exact: true })).toHaveCount(0);
  await expect(page.locator('input[name="timeSlot"][value="departure-0930"]')).toHaveCount(0);
  await expect(page.locator('input[name="timeSlot"][value="afternoon"]')).toBeChecked();
  await page.locator('input[name="tourPackage"][value="full"]').check({ force: true });
  await expect(page.locator('input[name="mealOption"]:checked')).toHaveCount(0);
  await page.getByRole('button', { name: 'Ver detalles del paquete', exact: true }).click();
  await expect(page.getByRole('dialog').getByText('Almuerzo incluido', { exact: true })).toBeVisible();
  await expect(page.getByRole('dialog').getByText('Bebidas y frutas', { exact: true })).toBeVisible();
  await page.screenshot({ path: `tmp/package-settings-test/customer-${info.project.name}.png`, fullPage: true });
  expect(errors).toEqual([]);
});
