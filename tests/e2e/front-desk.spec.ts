import { expect, request as playwrightRequest, test } from '@playwright/test';
import { apiLogin, e2e, loginViaApi } from './fixtures';

test.describe.configure({ mode: 'serial' });

test.describe('front desk operations', () => {
  test.beforeEach(async ({ page }) => {
    await loginViaApi(page);
    await page.goto('/front-desk');
    await page.getByLabel('Front desk date').fill(e2e.testDate);
    await expect(
      page.getByRole('heading', { name: 'E2E Harbor Hotel' }),
    ).toBeVisible();
  });

  test('loads arrivals, departures, rooms, and action controls', async ({
    page,
  }) => {
    await expect(
      page.getByRole('heading', { name: "Today's arrivals" }),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: "Today's departures" }),
    ).toBeVisible();
    await expect(
      page.getByRole('cell', { name: 'Elena Novak' }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('cell', { name: 'Arben Krasniqi' }).first(),
    ).toBeVisible();
    await expect(
      page.getByRole('heading', { name: 'Room readiness' }),
    ).toBeVisible();
    await expect(page.getByTestId('frontdesk-action-check-in')).toBeEnabled();
  });

  test('front desk actions enforce room and policy rules', async ({ page }) => {
    await page.getByTestId('frontdesk-action-check-in').click();
    await page
      .getByLabel('Front desk reservation')
      .selectOption(e2e.confirmedReservationId);
    await page.getByLabel('Front desk room').selectOption(e2e.room103Id);
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByText(/ROOM_UNDER_MAINTENANCE/i)).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();

    await page.getByTestId('frontdesk-action-check-in').click();
    await page
      .getByLabel('Front desk reservation')
      .selectOption(e2e.confirmedReservationId);
    await page.getByLabel('Front desk room').selectOption(e2e.room101Id);
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(page.getByText('Check in completed.')).toBeVisible();
  });

  test('payments are idempotent and invoice PDF download returns real PDF', async () => {
    const token = await apiLogin();
    const api = await playwrightRequest.newContext({
      baseURL: `${e2e.apiURL}/`,
      extraHTTPHeaders: { authorization: `Bearer ${token}` },
    });

    const first = await api.post(
      `reservations/${e2e.confirmedReservationId}/payments`,
      {
        data: {
          amount: 25,
          currency: 'EUR',
          method: 'CASH',
          type: 'PARTIAL',
          idempotencyKey: 'e2e-payment-idempotency-key',
        },
      },
    );
    expect(first.ok()).toBeTruthy();

    const second = await api.post(
      `reservations/${e2e.confirmedReservationId}/payments`,
      {
        data: {
          amount: 25,
          currency: 'EUR',
          method: 'CASH',
          type: 'PARTIAL',
          idempotencyKey: 'e2e-payment-idempotency-key',
        },
      },
    );
    expect(second.ok()).toBeTruthy();

    const invoices = await api.post(
      `reservations/${e2e.confirmedReservationId}/invoices`,
      { data: { allowDuplicate: false } },
    );
    expect(invoices.ok()).toBeTruthy();
    const invoice = (await invoices.json()) as {
      id?: string;
      invoice?: { id: string };
    };
    const invoiceId = invoice.invoice?.id ?? invoice.id;
    expect(invoiceId).toBeTruthy();
    const pdf = await api.get(`invoices/${invoiceId}/download`);
    expect(pdf.ok()).toBeTruthy();
    expect(pdf.headers()['content-type']).toContain('application/pdf');
    const bytes = await pdf.body();
    expect(bytes.subarray(0, 5).toString()).toBe('%PDF-');
    await api.dispose();
  });

  test('check-out updates room readiness and creates housekeeping task', async () => {
    const token = await apiLogin();
    const api = await playwrightRequest.newContext({
      baseURL: `${e2e.apiURL}/`,
      extraHTTPHeaders: { authorization: `Bearer ${token}` },
    });
    const checkout = await api.post(
      `reservations/${e2e.checkedInReservationId}/check-out`,
      { data: { forceWithOutstandingBalance: false, notes: 'E2E checkout' } },
    );
    expect(checkout.ok()).toBeTruthy();

    const overview = await api.get(
      `front-desk/${e2e.propertyId}?date=${e2e.testDate}`,
    );
    expect(overview.ok()).toBeTruthy();
    const payload = (await overview.json()) as {
      rooms: Array<{ name: string; cleaningStatus: string }>;
      metrics: Record<string, number>;
    };
    expect(
      payload.rooms.some(
        (room) => room.name === '201' && room.cleaningStatus === 'DIRTY',
      ),
    ).toBeTruthy();
    expect(Number(payload.metrics.dirtyRooms ?? 0)).toBeGreaterThan(0);
    await api.dispose();
  });

  test('invalid check-in, no-show, and read-only mutation denial are controlled', async ({
    page,
  }) => {
    const token = await apiLogin();
    const api = await playwrightRequest.newContext({
      baseURL: `${e2e.apiURL}/`,
      extraHTTPHeaders: { authorization: `Bearer ${token}` },
    });
    const invalidCheckIn = await api.post(
      `reservations/${e2e.confirmedReservationId}/check-in`,
      {
        data: {
          roomId: e2e.room102Id,
          guestDetailsConfirmed: false,
          identificationConfirmed: false,
        },
      },
    );
    expect([400, 409]).toContain(invalidCheckIn.status());

    const reservation = await api.post('reservations', {
      headers: { 'idempotency-key': 'e2e-no-show-reservation' },
      data: {
        companyId: '10000000-0000-4000-8000-000000000001',
        propertyId: e2e.propertyId,
        guestId: '10000000-0000-4000-8000-000000000503',
        roomIds: [e2e.room102Id],
        checkInDate: '2026-08-20T15:00:00.000Z',
        checkOutDate: '2026-08-21T11:00:00.000Z',
        adults: 1,
        children: 0,
        bookingSource: 'DIRECT',
        subtotal: 150,
        tax: 0,
        status: 'CONFIRMED',
      },
    });
    expect(reservation.ok()).toBeTruthy();
    const created = (await reservation.json()) as { id: string };
    const noShow = await api.post(`reservations/${created.id}/no-show`, {
      data: { reason: 'E2E no-show' },
    });
    expect(noShow.ok()).toBeTruthy();
    await api.dispose();

    await page.context().clearCookies();
    await page.evaluate(() => window.localStorage.clear());
    await loginViaApi(page, e2e.readOnlyEmail);
    await page.goto('/front-desk');
    await page.getByLabel('Front desk date').fill(e2e.testDate);
    await page.getByTestId('frontdesk-action-record-payment').click();
    await page
      .getByLabel('Front desk reservation')
      .selectOption(e2e.confirmedReservationId);
    await page.getByLabel('Payment amount').fill('5');
    await page.getByRole('button', { name: 'Confirm', exact: true }).click();
    await expect(
      page.getByText(/Insufficient permissions|Forbidden/i),
    ).toBeVisible();
  });
});
