import { WHATSAPP_NUMBER } from '../constants/contact';

export interface ContactFormInput {
  name: string;
  email: string;
  phone: string;
  tourType: string;
  departureTime: string;
  message: string;
}

export interface ContactSubmitResult {
  ok: boolean;
  emailDelivered: boolean;
}

export async function submitContactRequest(input: ContactFormInput): Promise<ContactSubmitResult> {
  const response = await fetch('/api/contact', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error((data as { message?: string })?.message || 'Could not send the contact request.');
  }
  return { ok: true, emailDelivered: Boolean(data.emailDelivered) };
}

export function getWhatsAppContactUrl(values: ContactFormInput) {
  const message = [
    'Hello, I have a question / reservation request.',
    `Name: ${values.name}`,
    `Email: ${values.email}`,
    `Phone: ${values.phone || 'Not provided'}`,
    `Experience type: ${values.tourType || 'Not selected'}`,
    `Departure time: ${values.departureTime || 'Not selected'}`,
    '',
    values.message,
  ].join('\n');
  const whatsappNumber = (import.meta.env.VITE_WHATSAPP_NUMBER as string | undefined) || WHATSAPP_NUMBER;
  return `https://wa.me/${whatsappNumber.replace(/\D/g, '')}?text=${encodeURIComponent(message)}`;
}