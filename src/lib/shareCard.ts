import { formatMoney } from './money';
import type { SharePayload } from './share';

export const SHARE_WIDTH = 1200;
export const SHARE_HEIGHT = 630;

export function drawShareCard(ctx: CanvasRenderingContext2D, payload: SharePayload): void {
  const { width, height } = ctx.canvas;
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = '#10211e';
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = '#e7a15a';
  ctx.fillRect(64, 56, 72, 6);

  ctx.fillStyle = '#f4f0e6';
  ctx.font = '600 28px Fraunces, Georgia, serif';
  ctx.fillText('SubSnipe', 64, 110);

  ctx.font = '500 18px Outfit, sans-serif';
  ctx.fillStyle = '#c9c1b2';
  ctx.fillText('On-device subscription scan', 64, 142);

  ctx.fillStyle = '#f7f3ea';
  ctx.font = '560 92px Fraunces, Georgia, serif';
  const amount = formatMoney(payload.annualized, payload.currency);
  ctx.fillText(amount, 64, 280);
  ctx.font = '500 28px Outfit, sans-serif';
  ctx.fillStyle = '#d5cec0';
  ctx.fillText('per year', 64, 330);

  ctx.font = '500 24px Outfit, sans-serif';
  ctx.fillStyle = '#f4f0e6';
  const countLabel = `${payload.count} subscription${payload.count === 1 ? '' : 's'}`;
  ctx.fillText(countLabel, 64, 390);

  if (payload.savings > 0) {
    ctx.fillStyle = '#8ee0d4';
    ctx.fillText(`${formatMoney(payload.savings, payload.currency)} marked to cancel`, 64, 432);
  }

  const cats = payload.categories
    .slice(0, 4)
    .map((category) => `${category.count} ${category.label.toLowerCase()}`)
    .join('   ·   ');
  ctx.font = '500 20px Outfit, sans-serif';
  ctx.fillStyle = '#e7a15a';
  if (cats) ctx.fillText(cats, 64, payload.savings > 0 ? 480 : 450);

  if (payload.merchants && payload.merchants.length > 0) {
    ctx.font = '500 18px Outfit, sans-serif';
    ctx.fillStyle = '#f4f0e6';
    const names = payload.merchants.map((merchant) => merchant.name).join('  ·  ');
    ctx.fillText(trim(ctx, names, width - 128), 64, 530);
  }

  ctx.font = '500 16px Outfit, sans-serif';
  ctx.fillStyle = '#9c9588';
  const footer = payload.merchants
    ? 'Service names included because you opted in. No account numbers or narrations.'
    : 'No merchant names in this image. Computed in your browser.';
  const extra = payload.approximate ? '  Totals use approximate exchange rates.' : '';
  ctx.fillText(footer + extra, 64, height - 48);
}

function trim(ctx: CanvasRenderingContext2D, text: string, max: number): string {
  if (ctx.measureText(text).width <= max) return text;
  let value = text;
  while (value.length > 4 && ctx.measureText(`${value}…`).width > max) value = value.slice(0, -1);
  return `${value}…`;
}

export async function renderShareBlob(payload: SharePayload): Promise<Blob> {
  await document.fonts.ready;
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_WIDTH;
  canvas.height = SHARE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Could not draw the summary card.');
  drawShareCard(ctx, payload);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
  if (!blob) throw new Error('Could not export the summary card.');
  return blob;
}

export function sharePreviewUrl(payload: SharePayload): string {
  const canvas = document.createElement('canvas');
  canvas.width = SHARE_WIDTH;
  canvas.height = SHARE_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';
  drawShareCard(ctx, payload);
  return canvas.toDataURL('image/png');
}
