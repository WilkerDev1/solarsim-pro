import https from 'https';

export interface HttpError extends Error {
  statusCode?: number;
  statusText?: string;
  responseBody?: string;
}

export function httpsPostJson(url: string, data: any, timeoutMs = 50000, extraHeaders: Record<string, string> = {}, signal?: AbortSignal): Promise<any> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) { reject(signal.reason || new Error('Solicitud cancelada.')); return; }
    const u = new URL(url);
    const postData = JSON.stringify(data);

    const req = https.request(
      {
        hostname: u.hostname,
        port: 443,
        path: u.pathname + u.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(postData),
          ...extraHeaders,
        },
        timeout: timeoutMs,
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => { body += chunk; });
        res.on('end', () => {
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body));
            } catch (err) {
              const parseErr: HttpError = new Error(`Respuesta de Google Gemini no es un JSON válido o fue truncada. Longitud: ${body.length}`);
              parseErr.statusCode = res.statusCode;
              reject(parseErr);
            }
          } else {
            try {
              const errObj = JSON.parse(body);
              const errMsg = errObj?.error?.message || `HTTP ${res.statusCode}: ${body}`;
              const httpErr: HttpError = new Error(errMsg);
              httpErr.statusCode = res.statusCode;
              httpErr.responseBody = body;
              reject(httpErr);
            } catch {
              const httpErr: HttpError = new Error(`HTTP ${res.statusCode}: ${body}`);
              httpErr.statusCode = res.statusCode;
              httpErr.responseBody = body;
              reject(httpErr);
            }
          }
        });
      }
    );

    const abort = () => req.destroy(signal?.reason instanceof Error ? signal.reason : new Error('Solicitud cancelada.'));
    signal?.addEventListener('abort', abort, { once: true });
    req.once('close', () => signal?.removeEventListener('abort', abort));
    req.on('timeout', () => {
      const timeoutErr: HttpError = new Error('Tiempo de espera agotado al conectar con la API de Google Gemini.');
      timeoutErr.statusCode = 408;
      req.destroy(timeoutErr);
    });

    req.on('error', reject);
    req.write(postData);
    req.end();
  });
}

export function httpsGetJson(url: string, headers: Record<string, string> = {}): Promise<any> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, { headers, timeout: 15000 }, (res) => {
      let body = '';
      res.on('data', (chunk) => { body += chunk; });
      res.on('end', () => {
        if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
          try {
            resolve(JSON.parse(body));
          } catch (err) {
            reject(err);
          }
        } else {
          try {
            const errObj = JSON.parse(body);
            const httpErr: HttpError = new Error(errObj?.error?.message || `HTTP ${res.statusCode}`);
            httpErr.statusCode = res.statusCode;
            reject(httpErr);
          } catch {
            const httpErr: HttpError = new Error(`HTTP ${res.statusCode}`);
            httpErr.statusCode = res.statusCode;
            reject(httpErr);
          }
        }
      });
    }).on('error', reject);
    req.on('timeout', () => req.destroy(new Error('Tiempo de espera agotado consultando Google Gemini.')));
  });
}
