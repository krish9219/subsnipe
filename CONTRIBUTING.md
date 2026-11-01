# Contributing to SubSnipe

SubSnipe stays useful because the merchant list, bank layouts, and cancel guides are community data. Code changes are welcome too. Please keep the privacy promise intact: no network calls, no analytics, no uploads.

## Setup

Node 22 or newer.

```bash
npm install
npm run dev
npm run check
```

`npm run check` is format, lint, types, and unit tests. End-to-end tests are `npm run test:e2e` (Playwright, Chromium).

Fixtures must be synthetic. Never commit a real statement, account number, or screenshot of someone else's transactions.

## Add a merchant

Edit [`src/data/merchants.json`](src/data/merchants.json).

```json
{
  "id": "netflix",
  "name": "Netflix",
  "category": "streaming",
  "color": "#E50914",
  "aliases": ["NETFLIX", "NETFLIX COM"],
  "typicalCadence": "monthly",
  "website": "https://www.netflix.com"
}
```

Rules that keep false positives down:

- `id` is stable. Renaming it drops anyone's saved Keep/Cancel choice for that service.
- Aliases are matched on word boundaries after punctuation is stripped. `UPI-NETFLIX-PAYTM` matches `NETFLIX`.
- Prefer the longest distinctive phrase. `JIO HOTSTAR` must not be just `JIO`, or a mobile recharge becomes a streaming plan.
- Do not add aliases shorter than 3 characters.
- One-off marketplaces stay out. Amazon shopping is not `AMAZON PRIME`. Swiggy food orders are not `SWIGGY ONE`.
- `typicalCadence` is only used when a known service appears once. `monthly`, `quarterly`, or `yearly`.
- Set `guideId` when several products share one cancel guide (`icloud` uses `apple`).
- Categories: `streaming`, `music`, `telecom`, `cloud`, `productivity`, `ai`, `news`, `fitness`, `food`, `gaming`, `shopping`, `finance`, `education`, `security`, `other`.

Add a row to [`src/data/alias-cases.json`](src/data/alias-cases.json): a descriptor string and the expected id, or `null` when it must not match. `npm test` fails if the case drifts.

## Add a bank format

Edit [`src/data/bankFormats.json`](src/data/bankFormats.json).

```json
{
  "id": "hdfc-savings",
  "name": "HDFC Bank",
  "country": "IN",
  "dateOrder": "DMY",
  "matchHeaders": ["narration", "withdrawal amt", "deposit amt"],
  "aliases": {
    "date": ["date", "value dt"],
    "description": ["narration"],
    "debit": ["withdrawal amt"],
    "credit": ["deposit amt"]
  }
}
```

`matchHeaders` must all be present before SubSnipe trusts `dateOrder`. Keep that list specific so a generic `Date, Description, Amount` file is not forced into month-first order. If detection is still unsure, the app asks the user to map columns.

Add a small synthetic CSV to `src/lib/csv.test.ts`. Header plus two made-up rows is enough. Use the issue template "Add my bank format" if you only have the header and want someone else to wire it up.

## Add a cancel guide

Create `content/guides/<id>.md`:

```md
---
merchantId: netflix
title: Cancel Netflix
officialUrl: https://www.netflix.com/cancelplan
---

One or two sentences in your own words.

1. First step you actually checked.
2. Next step.
3. What to do if Apple, Google, or a telecom bundle sends the bill.

Note: Anything that is easy to get wrong, such as a UPI mandate that survives the website cancel.
```

`officialUrl` has to be `https` and should be the service's own page. `merchantId` must match a merchant `id` or a shared `guideId`. Guides need at least three steps. The unit test loads every file in that folder.

## Detection, briefly

Outflows are grouped by merchant and currency. A track needs a monthly, quarterly, or yearly gap. Amounts may jitter or step once (a hike) and still be one plan. Two different amounts in the same month stay two plans.

Unknown descriptors need three consistent charges, or two when the narration looks like a mandate. A single charge counts only for a catalog merchant. Salary, ATM, EMI, loans, and mutual-fund SIPs are ignored. Forex, markup, and convenience-fee lines are reported separately and linked to a nearby subscription when the dates are within three days.

## Privacy rules for code

- Do not add analytics, remote fonts, error reporters, or a backend.
- `src/lib/csp.ts` is tested. `script-src` stays `'self'`. `connect-src` stays `'self'`.
- PDF.js is loaded only after someone drops a PDF.
- The share card includes merchant names only when `includeMerchants` is true.

## Roadmap shape

See the README. Small, tested improvements to parsing and the catalog are the highest leverage.
