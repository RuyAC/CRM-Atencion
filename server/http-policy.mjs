export function deploymentOptions(options = {}) {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const value = options.publicOrigin ?? process.env.ATENCION_PUBLIC_ORIGIN ?? '';
  let publicOrigin = '';
  if (value) {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.pathname !== '/' || url.search || url.hash) throw new Error('ATENCION_PUBLIC_ORIGIN debe ser un origen HTTP/HTTPS, sin ruta ni credenciales.');
    publicOrigin = url.origin;
  }
  if (production && !publicOrigin.startsWith('https://')) throw new Error('Producción requiere ATENCION_PUBLIC_ORIGIN con HTTPS.');
  return {...options, production, publicOrigin};
}

// Use a configured origin, never a client-supplied forwarded header.
export function allowedOrigin(request, publicOrigin) {
  const expected = publicOrigin || `${request.socket.encrypted ? 'https' : 'http'}://${request.headers.host}`;
  return !request.headers.origin || request.headers.origin === expected;
}

export const cookieSecurity = publicOrigin => publicOrigin.startsWith('https://') ? '; Secure' : '';

export function clientIp(request){const peer=(request.socket.remoteAddress||'').replace(/^::ffff:/,'');const trusted=(process.env.TRUSTED_PROXY_IPS||'').split(',').map(s=>s.trim());const supplied=request.headers['x-real-ip'];return trusted.includes(peer)&&typeof supplied==='string'&&/^[a-fA-F0-9:.]+$/.test(supplied)?supplied:peer;}
export function securityHeaders(response,production){response.setHeader('X-Content-Type-Options','nosniff');response.setHeader('Referrer-Policy','same-origin');response.setHeader('X-Frame-Options','DENY');response.setHeader('Permissions-Policy','camera=(), microphone=()');if(production){response.setHeader('Strict-Transport-Security','max-age=31536000');response.setHeader('Content-Security-Policy',"default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' https: data: blob:; media-src 'self' https: blob:; connect-src 'self' https:; font-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'; object-src 'none'");}}

export function csvCell(value) {
  let text = String(value ?? '');
  if (/^[\s\u0000-\u001f]*[=+@-]/.test(text) || /^[\t\r\n]/.test(text)) text = "'" + text;
  return `"${text.replaceAll('"', '""')}"`;
}
