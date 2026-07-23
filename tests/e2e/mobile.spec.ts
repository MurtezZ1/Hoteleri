import { expect, test } from '@playwright/test';
import { e2e, loginViaApi } from './fixtures';

test('mobile calendar fallback stays usable', async ({ page }) => {
  await loginViaApi(page);
  await page.goto('/calendar');
  await page.getByLabel('Calendar start date').fill(e2e.testDate);

  await expect(page.getByText('Mobile reservation list')).toBeVisible();
  const mobileReservation = page
    .locator('section')
    .filter({ hasText: 'Mobile reservation list' })
    .getByRole('button', {
      name: /Elena Novak E2E-CONF-001/,
    });
  await expect(mobileReservation).toBeVisible();
  await mobileReservation.click();
  await expect(
    page.getByRole('heading', { name: 'Reservation details' }),
  ).toBeVisible();
});
