insert into public.payment_methods (key, name, description, type, active, instructions, logo_url, sort_order)
values
  (
    'paypal',
    'PayPal',
    'Secure USD checkout for the full booking total.',
    'paypal',
    true,
    'Customer pays the complete total through PayPal checkout.',
    '/images/paypal.png',
    1
  ),
  (
    'whatsapp-link',
    'WhatsApp payment link',
    'Request a manual payment link through WhatsApp.',
    'whatsapp_link',
    true,
    'Leaves booking pending payment until the admin verifies payment manually.',
    '/images/whatsapp.png',
    2
  ),
  (
    'pay-on-day',
    'Pay on the Day of the Tour',
    'Customer requests to pay when the tour starts.',
    'pay_on_day',
    true,
    'Leaves booking pending confirmation. It does not mark the booking as paid.',
    null,
    3
  )
on conflict (key) do update set
  name = excluded.name,
  description = excluded.description,
  type = excluded.type,
  active = excluded.active,
  instructions = excluded.instructions,
  logo_url = excluded.logo_url,
  sort_order = excluded.sort_order,
  updated_at = now();
