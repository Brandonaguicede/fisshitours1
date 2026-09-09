import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { z } from 'npm:zod@3.23.8';
import { corsHeaders, corsPreflight } from '../_shared/cors.ts';

const schema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(200),
  phone: z.string().trim().max(40).optional().default(''),
  tourType: z.string().trim().max(120).optional().default(''),
  departureTime: z.string().trim().max(80).optional().default(''),
  message: z.string().trim().min(10).max(2000),
  language: z.enum(['es', 'en']).optional().default('es'),
});

serve(async (req) => {
  const headers = corsHeaders(req, 'POST, OPTIONS');
  if (req.method === 'OPTIONS') return corsPreflight(req, 'POST, OPTIONS');
  if (req.method !== 'POST') return Response.json({ message: 'Method not allowed' }, { status: 405, headers });

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return Response.json({ message: 'Invalid contact form' }, { status: 400, headers });

  const adminEmail = Deno.env.get('BOOKING_ADMIN_EMAIL') ?? 'papagayofishingtourpague@gmail.com';
  const from = Deno.env.get('BOOKING_EMAIL_FROM') ?? 'Papagayo Fishing Tours <onboarding@resend.dev>';
  const resendApiKey = Deno.env.get('RESEND_API_KEY');
  if (!resendApiKey) return Response.json({ message: 'Email service is not configured' }, { status: 500, headers });

  const { name, email, phone, tourType, departureTime, message, language } = parsed.data;
  const subject = language === 'es' ? `Nuevo mensaje de contacto - ${name}` : `New contact message - ${name}`;
  const labels = language === 'es'
    ? { intro: 'Una persona envió un mensaje desde el formulario de contacto.', name: 'Nombre', email: 'Correo', phone: 'Teléfono', tour: 'Experiencia', time: 'Horario', message: 'Mensaje' }
    : { intro: 'Someone sent a message through the contact form.', name: 'Name', email: 'Email', phone: 'Phone', tour: 'Experience', time: 'Departure time', message: 'Message' };
  const safe = (value: string) => value.replace(/[<>]/g, '').trim();
  const text = `${labels.intro}\n\n${labels.name}: ${safe(name)}\n${labels.email}: ${safe(email)}\n${labels.phone}: ${safe(phone)}\n${labels.tour}: ${safe(tourType)}\n${labels.time}: ${safe(departureTime)}\n\n${labels.message}:\n${safe(message)}`;
  const html = `<div style="font-family:Arial,sans-serif;color:#0f2742"><h2>${subject}</h2><p>${labels.intro}</p><table cellpadding="8" cellspacing="0" style="border-collapse:collapse"><tr><td><strong>${labels.name}</strong></td><td>${safe(name)}</td></tr><tr><td><strong>${labels.email}</strong></td><td>${safe(email)}</td></tr><tr><td><strong>${labels.phone}</strong></td><td>${safe(phone)}</td></tr><tr><td><strong>${labels.tour}</strong></td><td>${safe(tourType)}</td></tr><tr><td><strong>${labels.time}</strong></td><td>${safe(departureTime)}</td></tr></table><p><strong>${labels.message}</strong></p><p style="white-space:pre-wrap">${safe(message)}</p></div>`;

  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from, to: [adminEmail], reply_to: email, subject, text, html }),
  });
  if (!response.ok) return Response.json({ message: 'Could not send contact message' }, { status: 502, headers });
  return Response.json({ sent: true }, { status: 200, headers });
});
