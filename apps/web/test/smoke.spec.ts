import { describe, expect, it } from 'vitest';
import { safeReturnTo } from '../lib/client-api';

describe('web smoke', () => {
  it('keeps the test runner wired', () => {
    expect('OdeoniFlow PMS').toContain('OdeoniFlow');
  });

  it('keeps post-login redirects inside the app', () => {
    expect(safeReturnTo('/guests?tab=all')).toBe('/guests?tab=all');
    expect(safeReturnTo('//evil.example')).toBe('/dashboard');
    expect(safeReturnTo('https://evil.example')).toBe('/dashboard');
  });
});
