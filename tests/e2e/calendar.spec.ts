import { expect, request as playwrightRequest, test } from '@playwright/test';
import { apiLogin, e2e, loginViaApi } from './fixtures';

test.describe.configure({ mode: 'serial' });

test.describe('live calendar', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/calendar');
    await page.getByLabel('Calendar start date').fill(e2e.testDate);
    await expect(page.getByText('Room 101')).toBeVisible();
  });

  test('loads room rows, reservations, blocks, filters, search, and mobile fallback', async ({
    page,
  }) => {
    await expect(page.getByText('Room 101')).toBeVisible();
    await expect(page.getByText('Room 102')).toBeVisible();
    await expect(
      page.getByTestId('reservation-bar-E2E-CONF-001'),
    ).toBeVisible();
    await expect(
      page.getByTestId('calendar-block-E2E maintenance block'),
    ).toBeVisible();

    await page.getByLabel('Room type').selectOption(e2e.deluxeRoomTypeId);
    await expect(page.getByText('Room 101')).toBeVisible();

    await page.getByLabel('Reservation status').selectOption('CONFIRMED');
    await expect(
      page.getByTestId('reservation-bar-E2E-CONF-001'),
    ).toBeVisible();

    await page.getByLabel('Search guest or code').fill('Elena');
    await page.getByRole('button', { name: 'Search calendar' }).click();
    await expect(
      page.getByTestId('reservation-bar-E2E-CONF-001'),
    ).toBeVisible();

    await page.setViewportSize({ width: 390, height: 844 });
    await expect(page.getByText('Mobile reservation list')).toBeVisible();
  });

  test('creates a reservation from an empty slot and shows it after reload', async ({
    page,
  }) => {
    await page.getByTestId('calendar-slot-102-2026-08-12').click();
    await expect(
      page.getByRole('heading', { name: 'Create reservation' }),
    ).toBeVisible();
    await page.getByLabel('Guest name').fill('Calendar E2E Guest');
    await page.getByLabel('Check-in').fill('2026-08-12');
    await page.getByLabel('Check-out').fill('2026-08-13');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();

    await expect(
      page.getByText('Reservation created from calendar slot.'),
    ).toBeVisible();
    await page.reload();
    await page.getByLabel('Calendar start date').fill(e2e.testDate);
    await expect(page.getByText('Calendar E2E Guest').first()).toBeVisible();
  });

  test('opens reservation details and edits stay through keyboard-accessible form', async ({
    page,
  }) => {
    await page.getByText('Calendar E2E Guest').first().click();
    await expect(
      page.getByRole('heading', { name: 'Reservation details' }),
    ).toBeVisible();
    await page.getByRole('button', { name: /Edit stay/ }).click();
    await page.getByLabel('Room', { exact: true }).selectOption(e2e.room101Id);
    await page.getByLabel('Check-in').fill('2026-08-12');
    await page.getByLabel('Check-out').fill('2026-08-13');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();

    await expect(
      page.getByText('Reservation calendar position updated.'),
    ).toBeVisible();
  });

  test('conflicting move returns structured conflict without keeping bad state', async ({
    page,
  }) => {
    await page.getByText('Calendar E2E Guest').first().click();
    await page.getByRole('button', { name: /Edit stay/ }).click();
    await page.getByLabel('Room', { exact: true }).selectOption(e2e.room102Id);
    await page.getByLabel('Check-in').fill('2026-08-13');
    await page.getByLabel('Check-out').fill('2026-08-15');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();

    await expect(page.getByText(/^ROOM_ASSIGNMENT_CONFLICT/i)).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByText('Calendar E2E Guest').first()).toBeVisible();
  });

  test('creates, edits, rejects stale edits, and deletes calendar blocks', async ({
    page,
  }) => {
    const token = await apiLogin();
    const api = await playwrightRequest.newContext({
      baseURL: `${e2e.apiURL}/`,
      extraHTTPHeaders: { authorization: `Bearer ${token}` },
    });

    await page.getByTestId('calendar-slot-102-2026-08-16').click();
    await page.getByRole('button', { name: 'Create block instead' }).click();
    await expect(
      page.getByRole('heading', { name: 'Create calendar block' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();

    const createBlock = await api.post('calendar/blocks', {
      data: {
        propertyId: e2e.propertyId,
        roomId: e2e.room102Id,
        startDate: '2026-08-16T00:00:00.000Z',
        endDate: '2026-08-17T00:00:00.000Z',
        type: 'BLOCKED',
        reason: 'E2E temporary block',
      },
    });
    expect(createBlock.ok()).toBeTruthy();
    await page.reload();
    await page.getByLabel('Calendar start date').fill(e2e.testDate);
    await expect(
      page.getByTestId('calendar-block-E2E temporary block'),
    ).toBeVisible();

    await page.getByTestId('calendar-block-E2E temporary block').click();
    await page.getByRole('button', { name: 'Edit block' }).click();
    await page.getByLabel('Reason').fill('E2E edited block');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByText('Calendar block updated.')).toBeVisible();

    const timeline = await api.get(
      `calendar/timeline?propertyId=${e2e.propertyId}&startDate=2026-08-10&endDate=2026-08-18`,
    );
    expect(timeline.ok()).toBeTruthy();
    const timelinePayload = (await timeline.json()) as {
      blocks: Array<{ id: string; reason: string; updatedAt: string }>;
    };
    const editedBlock = timelinePayload.blocks.find(
      (block) => block.reason === 'E2E edited block',
    );
    expect(editedBlock?.id).toBeTruthy();

    await page.getByTestId('calendar-block-E2E edited block').click();
    const staleUpdate = await api.patch(`calendar/blocks/${editedBlock?.id}`, {
      data: {
        roomId: e2e.room102Id,
        startDate: '2026-08-16T00:00:00.000Z',
        endDate: '2026-08-17T00:00:00.000Z',
        type: 'BLOCKED',
        reason: 'E2E server stale block',
        expectedUpdatedAt: editedBlock?.updatedAt,
      },
    });
    expect(
      staleUpdate.ok(),
      `Server-side stale setup failed: ${staleUpdate.status()} ${await staleUpdate.text()}`,
    ).toBeTruthy();
    await api.dispose();

    await page.getByRole('button', { name: 'Edit block' }).click();
    await page.getByLabel('Reason').fill('E2E stale client edit');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(
      page.getByText(/STALE|stale|updated by another user/i),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();

    await page.reload();
    await page.getByLabel('Calendar start date').fill(e2e.testDate);
    await page.getByTestId('calendar-block-E2E server stale block').click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Delete block' }).click();
    await expect(page.getByText('Calendar block deleted.')).toBeVisible();
    await expect(
      page.getByTestId('calendar-block-E2E server stale block'),
    ).toHaveCount(0);
  });

  test('read-only and cross-tenant users cannot mutate protected calendar data', async ({
    page,
  }) => {
    await loginViaApi(page, e2e.readOnlyEmail);
    await page.goto('/calendar');
    await page.getByLabel('Calendar start date').fill(e2e.testDate);
    await page.getByTestId('calendar-slot-102-2026-08-16').click();
    await page.getByLabel('Guest name').fill('Read Only Attempt');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(
      page.getByText(/Insufficient permissions|Forbidden/i),
    ).toBeVisible();

    const crossToken = await apiLogin(e2e.crossTenantEmail);
    const api = await playwrightRequest.newContext({
      baseURL: `${e2e.apiURL}/`,
      extraHTTPHeaders: { authorization: `Bearer ${crossToken}` },
    });
    const response = await api.get(
      `calendar/timeline?propertyId=${e2e.propertyId}&startDate=2026-08-10&endDate=2026-08-17`,
    );
    expect(response.status()).toBe(403);
    await api.dispose();
  });
});
