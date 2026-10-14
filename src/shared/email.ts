import { monthName, valueByKey } from './constants';

export interface NominationMail {
  name: string;          // nombre de quien recibe
  valueKey: string;
  whatDid: string;
  whyMattered: string;
  month: number;
  siteUrl?: string;      // (ya no se usa: el correo no lleva enlaces)
}

const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/\n/g, '<br>');

const firstName = (full: string) => (full.trim().split(/\s+/)[0] ?? '').replace(/^./, (c) => c.toUpperCase());

/** Correo anónimo que recibe una persona cuando su nominación es aprobada. No incluye quién nominó. */
export function renderNominationEmail(m: NominationMail) {
  const v = valueByKey(m.valueKey);
  const mes = monthName(m.month);
  const nombre = esc(firstName(m.name));
  const subject = `${firstName(m.name)}, alguien del equipo quiso hacerte visible`;

  const quote = (label: string, text: string) => `
    <tr><td style="padding:0 40px 22px 40px;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#00387B;font-weight:bold;margin-bottom:8px;">${label}</div>
      <div style="border-left:4px solid #F5C518;padding:4px 0 4px 18px;font-family:Georgia,'Times New Roman',serif;font-size:18px;line-height:1.55;color:#0B1B3F;font-style:italic;">“${esc(text.trim())}”</div>
    </td></tr>`;

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(subject)}</title></head>
<body style="margin:0;padding:0;background:#F4F5F7;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F4F5F7;"><tr><td align="center" style="padding:28px 12px;">
  <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:100%;max-width:600px;background:#ffffff;border-radius:18px;overflow:hidden;box-shadow:0 10px 30px rgba(0,32,91,0.12);">
    <tr><td style="background:#00205B;padding:34px 40px 30px 40px;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:11px;letter-spacing:3px;text-transform:uppercase;color:#9FB3D9;">Reconocimientos DBEE · ${esc(mes)}</div>
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:34px;line-height:1.15;color:#ffffff;margin-top:10px;font-weight:bold;">Conexión</div>
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:15px;color:#F5C518;font-style:italic;margin-top:6px;">un sistema para hacer visible lo invisible</div>
    </td></tr>
    <tr><td style="background:#F5C518;height:4px;line-height:4px;font-size:0;">&nbsp;</td></tr>
    <tr><td style="padding:38px 40px 8px 40px;">
      <div style="font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.25;color:#00205B;font-weight:bold;">Hola, ${nombre}.<br>Alguien del equipo te vio.</div>
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.65;color:#2B3652;margin:18px 0 0 0;">
        Una persona de tu equipo se tomó el tiempo de escribir sobre algo que hiciste y que no pasó desapercibido.
        Prefiere quedarse en el anonimato, pero quería que supieras lo que dijo.
      </p>
    </td></tr>
    <tr><td style="padding:22px 40px 26px 40px;">
      <span style="display:inline-block;background:#E8EEFA;color:#00387B;border-radius:999px;padding:8px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;">${v.emoji}&nbsp; ${esc(v.name)}</span>
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:13px;line-height:1.5;color:#5A6683;margin-top:10px;">${esc(v.desc)}</div>
    </td></tr>
    ${quote('Lo que hiciste', m.whatDid)}
    ${quote('Por qué importó', m.whyMattered)}
    <tr><td style="padding:6px 40px 34px 40px;">
      <p style="font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.65;color:#2B3652;margin:0;">
        Que alguien lo escriba ya es un reconocimiento. Gracias por hacer lo que haces, incluso cuando nadie lo está mirando.
      </p>
    </td></tr>
    <tr><td style="background:#F4F5F7;padding:22px 40px;border-top:1px solid #E3E7F0;">
      <div style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.6;color:#6B7690;">
        Bienestar y Experiencia del Estudiante · Universidad de La Sabana<br>
        Recibes este mensaje porque alguien de tu equipo te nominó en los reconocimientos de ${esc(mes)}.
        Este correo es solo informativo, no es necesario responderlo.
      </div>
    </td></tr>
  </table>
</td></tr></table>
</body></html>`;

  const text = [
    `Hola, ${firstName(m.name)}.`,
    'Alguien del equipo te vio.',
    '',
    'Una persona de tu equipo escribió sobre algo que hiciste. Prefiere quedarse en el anonimato, pero quería que supieras lo que dijo.',
    '',
    `Valor: ${v.name}`,
    '',
    'LO QUE HICISTE',
    `"${m.whatDid.trim()}"`,
    '',
    'POR QUÉ IMPORTÓ',
    `"${m.whyMattered.trim()}"`,
    '',
    'Que alguien lo escriba ya es un reconocimiento. Gracias por hacer lo que haces, incluso cuando nadie lo está mirando.',
    '',
    'Bienestar y Experiencia del Estudiante · Universidad de La Sabana',
  ].join('\n');

  return { subject, html, text };
}
