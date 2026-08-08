/**
 * Hkeeli — booking form (placeholder submission).
 *
 * There is no backend yet, so the form composes a prefilled email. Setting
 * CONFIG.formEndpoint to a form service or API URL switches it to a real POST
 * without touching the markup or this call site.
 */

import { CONFIG } from './config.js';
import { t } from './i18n.js';
import { toast } from './toast.js';

export function initBookingForm() {
  const form = document.querySelector('#booking-form');
  if (!form) return;

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    const data = Object.fromEntries(new FormData(form).entries());

    if (CONFIG.formEndpoint) {
      try {
        const res = await fetch(CONFIG.formEndpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(data)
        });
        if (!res.ok) throw new Error(String(res.status));
        form.reset();
        toast(t('book.submit'));
        return;
      } catch {
        toast(t('common.error'));
        return;
      }
    }

    window.location.href = buildMailto(data);
  });
}

function buildMailto(data) {
  const subject = `Hkeeli — class request from ${data.name || 'a new student'}`;
  const body = [
    `Name: ${data.name || ''}`,
    `Email: ${data.email || ''}`,
    `Level: ${data.level || ''}`,
    '',
    'Goals:',
    data.goals || '',
    '',
    'Availability:',
    data.availability || ''
  ].join('\n');

  return `mailto:${CONFIG.bookingEmail}?subject=${encodeURIComponent(
    subject
  )}&body=${encodeURIComponent(body)}`;
}
