import { expect, Page, request as playwrightRequest } from '@playwright/test';

const rawApiURL = process.env.E2E_API_URL ?? 'http://127.0.0.1:4100/api';

export const e2e = {
  baseURL: process.env.E2E_BASE_URL ?? 'http://127.0.0.1:3100',
  apiURL: rawApiURL.replace(/\/$/, '').endsWith('/api')
    ? rawApiURL.replace(/\/$/, '')
    : `${rawApiURL.replace(/\/$/, '')}/api`,
  password: 'E2ePassword123!',
  adminEmail: 'e2e.admin@odeoniflow.test',
  readOnlyEmail: 'e2e.readonly@odeoniflow.test',
  crossTenantEmail: 'e2e.cross@odeoniflow.test',
  disabledEmail: 'e2e.disabled@odeoniflow.test',
  propertyId: '10000000-0000-4000-8000-000000000101',
  crossTenantPropertyId: '20000000-0000-4000-8000-000000000101',
  disabledPropertyId: '30000000-0000-4000-8000-000000000101',
  confirmedReservationId: '10000000-0000-4000-8000-000000000601',
  checkedInReservationId: '10000000-0000-4000-8000-000000000602',
  crossTenantReservationId: '20000000-0000-4000-8000-000000000601',
  calendarBlockId: '10000000-0000-4000-8000-000000000701',
  crossTenantBlockId: '20000000-0000-4000-8000-000000000701',
  room101Id: '10000000-0000-4000-8000-000000000401',
  room102Id: '10000000-0000-4000-8000-000000000402',
  room103Id: '10000000-0000-4000-8000-000000000403',
  deluxeRoomTypeId: '10000000-0000-4000-8000-000000000301',
  testDate: '2026-08-10',
};

export async function loginViaApi(
  page: Page,
  email = e2e.adminEmail,
): Promise<string> {
  const api = await playwrightRequest.newContext({ baseURL: `${e2e.apiURL}/` });
  const response = await api.post('auth/login', {
    data: { email, password: e2e.password },
  });
  if (!response.ok()) {
    throw new Error(
      `Login failed for ${email}: ${response.status()} ${await response.text()}`,
    );
  }
  const payload = (await response.json()) as {
    accessToken: string;
    refreshToken: string;
    user: { id: string; email: string; fullName: string };
  };
  await api.dispose();

  await page.context().addCookies([
    {
      name: 'odeoniflow_session',
      value: '1',
      domain: '127.0.0.1',
      path: '/',
      expires: Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60,
      httpOnly: false,
      secure: false,
      sameSite: 'Lax',
    },
  ]);
  await page.addInitScript((session) => {
    window.localStorage.setItem('odeoniflow.accessToken', session.accessToken);
    window.localStorage.setItem(
      'odeoniflow.refreshToken',
      session.refreshToken,
    );
    window.localStorage.setItem(
      'odeoniflow.user',
      JSON.stringify(session.user),
    );
  }, payload);
  return payload.accessToken;
}

export async function apiLogin(email = e2e.adminEmail): Promise<string> {
  const api = await playwrightRequest.newContext({ baseURL: `${e2e.apiURL}/` });
  const response = await api.post('auth/login', {
    data: { email, password: e2e.password },
  });
  if (!response.ok()) {
    throw new Error(
      `Login failed for ${email}: ${response.status()} ${await response.text()}`,
    );
  }
  const payload = (await response.json()) as { accessToken: string };
  await api.dispose();
  return payload.accessToken;
}

export async function expectControlledApiError(
  responseStatus: number,
): Promise<void> {
  expect([400, 401, 402, 403, 404, 409]).toContain(responseStatus);
}
