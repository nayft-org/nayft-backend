type VerificationTemplateVars = {
  code: string;
  username: string;
  expiresInHours: number;
  year: number;
};

const BRAND_PURPLE = '#a855f7';
const BRAND_DARK = '#0f0f14';

function wrapHtml(body: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>NAYFT Verification</title>
</head>
<body style="margin:0;padding:0;background:#f4f4f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#f4f4f5;padding:32px 16px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" style="max-width:480px;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e4e4e7;">
          <tr>
            <td style="background:${BRAND_DARK};padding:24px 32px;text-align:center;">
              <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:0.08em;">NAYFT</span>
            </td>
          </tr>
          <tr>
            <td style="padding:32px;">
              ${body}
            </td>
          </tr>
          <tr>
            <td style="padding:24px 32px;background:#fafafa;border-top:1px solid #e4e4e7;color:#71717a;font-size:12px;line-height:1.5;">
              You received this because you signed up for NAYFT. If you didn't request this, you can safely ignore this email.
              <br /><br />© ${new Date().getFullYear()} NAYFT
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

const TEMPLATES: Record<string, { subject: string; title: string; intro: string; expiry: string }> = {
  en: {
    subject: 'Your NAYFT verification code',
    title: 'Verify your NAYFT account',
    intro: 'Enter this code in the app to verify your email address:',
    expiry: 'This code expires in {{hours}} hours.',
  },
  hi: {
    subject: 'आपका NAYFT सत्यापन कोड',
    title: 'अपना NAYFT खाता सत्यापित करें',
    intro: 'अपना ईमेल सत्यापित करने के लिए ऐप में यह कोड दर्ज करें:',
    expiry: 'यह कोड {{hours}} घंटे में समाप्त हो जाएगा।',
  },
};

export function renderVerificationEmail(
  locale: string,
  vars: VerificationTemplateVars
): { subject: string; html: string; text: string } {
  const t = TEMPLATES[locale] || TEMPLATES.en;
  const expiryText = t.expiry.replace('{{hours}}', String(vars.expiresInHours));

  const body = `
    <h1 style="margin:0 0 16px;font-size:20px;color:#18181b;">${t.title}</h1>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;line-height:1.5;">Hi ${vars.username},</p>
    <p style="margin:0 0 24px;color:#52525b;font-size:15px;line-height:1.5;">${t.intro}</p>
    <div style="margin:0 0 24px;padding:20px;border:2px solid ${BRAND_PURPLE};border-radius:8px;text-align:center;">
      <span style="font-family:'Courier New',Courier,monospace;font-size:32px;font-weight:700;letter-spacing:0.3em;color:#18181b;">${vars.code}</span>
    </div>
    <p style="margin:0;color:#71717a;font-size:14px;">${expiryText}</p>
    <p style="margin:16px 0 0;color:#71717a;font-size:13px;">NAYFT will never ask for your password in an email.</p>
  `;

  const text = `${t.title}\n\nHi ${vars.username},\n\n${t.intro}\n\n${vars.code}\n\n${expiryText}\n\nNAYFT will never ask for your password in an email.`;

  return {
    subject: t.subject,
    html: wrapHtml(body),
    text,
  };
}
