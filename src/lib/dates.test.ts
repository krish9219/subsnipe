import { describe, expect, it } from 'vitest';
import { inferCadence } from './engine';
import { parseDate, projectNext } from './dates';

describe('dates', () => {
  it('prefers day-month-year when a date is ambiguous', () => {
    expect(parseDate('04/01/2026')).toBe('2026-01-04');
    expect(parseDate('04/01/2026', 'MDY')).toBe('2026-04-01');
    expect(parseDate('2026-04-01')).toBe('2026-04-01');
    expect(parseDate('02 Jan 2026')).toBe('2026-01-02');
    expect(parseDate('13/01/2026', 'MDY')).toBeNull();
    expect(parseDate('31/02/2026')).toBeNull();
  });

  it('projects the next charge onto a future calendar date', () => {
    expect(projectNext('2026-10-04', 'monthly', '2026-11-01')).toBe('2026-11-04');
    expect(projectNext('2024-01-15', 'yearly', '2026-11-01')).toBe('2027-01-15');
    expect(inferCadence(['2026-01-05', '2026-04-05', '2026-07-05'])).toBe('quarterly');
    expect(inferCadence(['2026-01-01', '2026-01-08', '2026-01-15'])).toBeNull();
  });
});
