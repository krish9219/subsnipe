import { describe, expect, it } from 'vitest';
import { CSP } from './csp';
import { analyze } from './engine';
import { buildSharePayload } from './share';
import type { Transaction } from './model';
import { addMonthsISO } from './dates';

describe('share payload', () => {
  it('omits merchant names unless the user opts in', () => {
    const rows: Transaction[] = [];
    let date = '2026-01-04';
    for (let index = 0; index < 4; index += 1) {
      rows.push({
        id: `n${index}`,
        date,
        description: 'NETFLIX',
        amount: 649,
        direction: 'debit',
        currency: 'INR',
        source: 't',
      });
      date = addMonthsISO(date, 1);
    }
    const analysis = analyze(rows, { today: '2026-05-01' });
    const secret = buildSharePayload(analysis, {}, false);
    expect(secret.merchants).toBeNull();
    expect(secret.count).toBe(1);
    expect(JSON.stringify(secret)).not.toContain('NETFLIX');
    const open = buildSharePayload(analysis, {}, true);
    expect(open.merchants?.[0]?.name).toBe('Netflix');
    expect(JSON.stringify(open)).not.toContain('UPI');
  });
});

describe('content security policy', () => {
  it('blocks remote scripts, eval, and outbound connections', () => {
    expect(CSP).toContain("script-src 'self'");
    expect(CSP).toContain("connect-src 'self'");
    expect(CSP).not.toContain('unsafe-eval');
    expect(CSP).not.toContain('http:');
    expect(CSP).not.toContain('*');
  });
});
