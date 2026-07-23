import { expect, test } from '@playwright/test';
import { e2e, loginViaApi } from './fixtures';

test.describe('authentication and protected routes', () => {
  test('unauthenticated calendar and front desk redirect to login', async ({
    page,
  }) => {
    await page.goto('/calendar');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fcalendar/);

    await page.goto('/front-desk');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Ffront-desk/);
  });

  test('valid user can log in through the real form', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Email').fill(e2e.adminEmail);
    await page.getByPlaceholder('Password').fill(e2e.password);
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(page).toHaveURL(/\/dashboard|\/subscription|\/onboarding/);
    await expect(page.getByRole('link', { name: 'Dashboard' })).toBeVisible();
  });

  test('invalid credentials show an error', async ({ page }) => {
    await page.goto('/login');
    await page.getByPlaceholder('Email').fill(e2e.adminEmail);
    await page.getByPlaceholder('Password').fill('WrongPassword123!');
    await page.getByRole('button', { name: 'Sign in' }).click();

    await expect(
      page.getByText('Email or password is not correct.'),
    ).toBeVisible();
  });

  test('authenticated session reaches calendar and logout protects it again', async ({
    page,
  }) => {
    await loginViaApi(page);
    await page.goto('/calendar');
    await expect(
      page.getByRole('heading', { name: /E2E Harbor Hotel/ }),
    ).toBeVisible();

    await page
      .getByRole('button', { name: 'Logout' })
      .evaluate((button: HTMLElement) => button.click());
    await expect(page).toHaveURL(/\/login/);
    await page.goto('/calendar');
    await expect(page).toHaveURL(/\/login\?returnTo=%2Fcalendar/);
  });
});
