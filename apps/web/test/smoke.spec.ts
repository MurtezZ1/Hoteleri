import { describe, expect, it } from 'vitest';

describe('web smoke', () => {
  it('keeps the test runner wired', () => {
    expect('OdeoniFlow PMS').toContain('OdeoniFlow');
  });
});
