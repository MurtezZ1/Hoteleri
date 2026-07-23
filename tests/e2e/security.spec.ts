import { expect, request as playwrightRequest, test } from '@playwright/test';
import { apiLogin, e2e, expectControlledApiError } from './fixtures';

test.describe('tenant and security boundaries', () => {
  test('denies protected API access without token', async ({ request }) => {
    const response = await request.get(
      `${e2e.apiURL}/calendar/timeline?propertyId=${e2e.propertyId}`,
    );
    expect(response.status()).toBe(401);
  });

  test('denies cross-tenant reservation, invoice, and block access', async () => {
    const adminToken = await apiLogin();
    const adminApi = await playwrightRequest.newContext({
      baseURL: `${e2e.apiURL}/`,
      extraHTTPHeaders: { authorization: `Bearer ${adminToken}` },
    });
    const invoiceResponse = await adminApi.post(
      `reservations/${e2e.confirmedReservationId}/invoices`,
      { data: { allowDuplicate: true } },
    );
    expect(invoiceResponse.ok()).toBeTruthy();
    const invoice = (await invoiceResponse.json()) as {
      id?: string;
      invoice?: { id: string };
    };
    const invoiceId = invoice.invoice?.id ?? invoice.id;
    expect(invoiceId).toBeTruthy();
    await adminApi.dispose();

    const crossToken = await apiLogin(e2e.crossTenantEmail);
    const crossApi = await playwrightRequest.newContext({
      baseURL: `${e2e.apiURL}/`,
      extraHTTPHeaders: { authorization: `Bearer ${crossToken}` },
    });
    const reservation = await crossApi.post(
      `reservations/${e2e.confirmedReservationId}/payments`,
      { data: { amount: 1, currency: 'EUR', method: 'CASH', type: 'PARTIAL' } },
    );
    expect(reservation.status()).toBe(403);

    const invoiceDownload = await crossApi.get(
      `invoices/${invoiceId}/download`,
    );
    expect(invoiceDownload.status()).toBe(403);

    const block = await crossApi.patch(
      `calendar/blocks/${e2e.calendarBlockId}`,
      {
        data: {
          roomId: e2e.room103Id,
          startDate: '2026-08-10T00:00:00.000Z',
          endDate: '2026-08-12T00:00:00.000Z',
          type: 'MAINTENANCE',
          reason: 'Cross tenant mutation attempt',
        },
      },
    );
    expect([400, 403]).toContain(block.status());
    await crossApi.dispose();
  });

  test('denies disabled subscription tenant mutations', async () => {
    const token = await apiLogin(e2e.disabledEmail);
    const api = await playwrightRequest.newContext({
      baseURL: `${e2e.apiURL}/`,
      extraHTTPHeaders: { authorization: `Bearer ${token}` },
    });
    const response = await api.post('calendar/blocks', {
      data: {
        propertyId: e2e.disabledPropertyId,
        roomId: '30000000-0000-4000-8000-000000000401',
        startDate: '2026-08-10T00:00:00.000Z',
        endDate: '2026-08-11T00:00:00.000Z',
        type: 'BLOCKED',
        reason: 'Disabled tenant attempt',
      },
    });
    expect(response.status()).toBe(402);
    await api.dispose();
  });

  test('read-only role, arbitrary file paths, and malformed IDs are controlled', async () => {
    const readOnlyToken = await apiLogin(e2e.readOnlyEmail);
    const api = await playwrightRequest.newContext({
      baseURL: `${e2e.apiURL}/`,
      extraHTTPHeaders: { authorization: `Bearer ${readOnlyToken}` },
    });

    const mutation = await api.post('calendar/blocks', {
      data: {
        propertyId: e2e.propertyId,
        roomId: e2e.room102Id,
        startDate: '2026-08-18T00:00:00.000Z',
        endDate: '2026-08-19T00:00:00.000Z',
        type: 'BLOCKED',
        reason: 'Read only attempt',
      },
    });
    expect(mutation.status()).toBe(403);

    const pathAttempt = await api.get('invoices/..%2F..%2F.env/download');
    await expectControlledApiError(pathAttempt.status());

    const malformed = await api.patch('calendar/blocks/not-a-uuid', {
      data: {
        roomId: e2e.room102Id,
        startDate: 'not-a-date',
        endDate: '2026-08-19T00:00:00.000Z',
        type: 'BLOCKED',
        reason: 'Malformed attempt',
      },
    });
    await expectControlledApiError(malformed.status());
    await api.dispose();
  });
});
