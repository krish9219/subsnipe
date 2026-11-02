import { expect, test } from '@playwright/test';

test('sample statement, triage, timeline, and private share card', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/forgot/i);
  await page.getByRole('button', { name: /sample statement/i }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/₹|INR/);
  await expect(page.getByRole('article').filter({ hasText: 'Netflix' }).first()).toBeVisible();
  await expect(page.getByText(/price hike/i).first()).toBeVisible();
  await expect(page.getByText(/trial of/i).first()).toBeVisible();
  await expect(page.getByText(/forex markup/i).first()).toBeVisible();

  const spotify = page.getByRole('article').filter({ hasText: 'Spotify' });
  await spotify.getByRole('radio', { name: 'Cancel' }).click();
  await expect(page.getByText(/a year if those/i)).toBeVisible();

  await page.getByRole('tab', { name: 'Timeline' }).click();
  await expect(page.getByText(/expected/i).first()).toBeVisible();

  await page.getByRole('button', { name: /share summary/i }).click();
  await expect(page.getByText(/no merchant names/i)).toBeVisible();
  await expect(page.getByRole('img', { name: /summary card/i })).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await page.getByRole('button', { name: /theme/i }).click();
  await page.getByRole('button', { name: /wipe everything/i }).click();
  await page.getByRole('button', { name: /wipe statement data/i }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText(/forgot/i);
});

test('garbage file asks for a mapping and can be skipped', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose statement files').setInputFiles({
    name: 'notes.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('hello this is not a statement\njust some words\n'),
  });
  await expect(page.getByRole('heading', { name: /which columns/i })).toBeVisible();
  await page.getByRole('button', { name: /skip this file/i }).click();
  await expect(page.getByText(/skipped notes.txt/i)).toBeVisible();
});

test('empty file explains itself', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Choose statement files').setInputFiles({
    name: 'empty.csv',
    mimeType: 'text/csv',
    buffer: Buffer.from('   \n'),
  });
  await expect(page.getByText(/empty/i)).toBeVisible();
});
