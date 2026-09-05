export default async function handler(request, response) {
  if (request.method !== 'POST') {
    response.status(405).json({ message: 'Method not allowed.' });
    return;
  }

  try {
    const body = request.body || {};
    const name = typeof body.name === 'string' ? body.name.trim() : '';
    const email = typeof body.email === 'string' ? body.email.trim() : '';
    const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const tourType = typeof body.tourType === 'string' ? body.tourType.trim() : '';
    const departureTime = typeof body.departureTime === 'string' ? body.departureTime.trim() : '';
    const message = typeof body.message === 'string' ? body.message.trim() : '';

    if (!name || !isValidEmail(email) || message.length < 10) {
      response.status(400).json({ message: 'Invalid contact form data.' });
      return;
    }

    let emailDelivered = false;
    const resendApiKey = process.env.RESEND_API_KEY;
    const to = process.env.CONTACT_EMAIL_TO;

    if (resendApiKey && to) {
      try {
        const resendResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${resendApiKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.CONTACT_EMAIL_FROM || 'Papagayo Website <onboarding@resend.dev>',
            to: [to],
            subject: `[Web] New contact request from ${name}`,
            text: [
              `Name: ${name}`,
              `Email: ${email}`,
              `Phone: ${phone || 'Not provided'}`,
              `Experience type: ${tourType || 'Not selected'}`,
              `Departure time: ${departureTime || 'Not selected'}`,
              '',
              message,
            ].join('\n'),
          }),
        });
        emailDelivered = resendResponse.ok;
      } catch {
        emailDelivered = false;
      }
    }

    response.status(200).json({ ok: true, emailDelivered });
  } catch (error) {
    response.status(400).json({ message: error.message || 'Contact request could not be processed.' });
  }
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
}