import { bridgeSecrets, isAuthorized, signDownload, verifyDownload } from './services/bridgeAuth.js';
import { handlePortalAction } from './portalCustomer.js';

function headerValue(headers, name) {
  const entry = Object.entries(headers || {}).find(([key]) => key.toLowerCase() === name.toLowerCase());
  const value = entry?.[1];
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function queryValue(request, name) {
  const value = request?.queryParameters?.[name];
  return Array.isArray(value) ? String(value[0] || '') : String(value || '');
}

function jsonResponse(statusCode, body) {
  return {
    statusCode,
    headers: { 'Content-Type': ['application/json'], 'Cache-Control': ['no-store'] },
    body: JSON.stringify(body)
  };
}

function textResponse(statusCode, body, contentType = 'text/plain; charset=utf-8', extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': [contentType],
      'Cache-Control': ['no-store, no-cache, must-revalidate'],
      ...extraHeaders
    },
    body: String(body ?? '')
  };
}

function customerContext(payload) {
  return {
    accountId: String(payload.accountId || ''),
    accountType: 'customer',
    extension: { portal: { id: String(payload.portalId || '') } }
  };
}

function htmlDownloadPage({ baseUrl, token, filename, chunkCount }) {
  const safeName = String(filename || 'report.xlsx').replace(/[<>:"/\\|?*]/g, '_');
  const jsBase = JSON.stringify(baseUrl);
  const jsToken = JSON.stringify(token);
  const jsName = JSON.stringify(safeName);
  const count = Number(chunkCount || 0);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Download report</title>
<style>
body{font-family:Arial,sans-serif;margin:40px;color:#172b4d}
button{background:#0c66e4;color:white;border:0;border-radius:4px;padding:10px 16px;font-weight:600;cursor:pointer}
#status{margin-top:14px}
</style>
</head>
<body>
<h2>Preparing your Excel report…</h2>
<button id="download" type="button">Download Excel</button>
<div id="status">If the download does not start automatically, click the button.</div>
<script>
const base=${jsBase};
const token=${jsToken};
const filename=${jsName};
const chunkCount=${count};
let running=false;
async function startDownload(){
  if(running)return;
  running=true;
  const button=document.getElementById('download');
  const status=document.getElementById('status');
  button.disabled=true;
  status.textContent='Preparing download…';
  try{
    let base64='';
    for(let i=0;i<chunkCount;i++){
      const url=base+'?download='+encodeURIComponent(token)+'&part='+i;
      const response=await fetch(url,{cache:'no-store'});
      if(!response.ok)throw new Error(await response.text());
      base64+=await response.text();
    }
    const binary=atob(base64.replace(/\\s+/g,''));
    const bytes=new Uint8Array(binary.length);
    for(let i=0;i<binary.length;i++)bytes[i]=binary.charCodeAt(i);
    const blob=new Blob([bytes],{type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'});
    const objectUrl=URL.createObjectURL(blob);
    const a=document.createElement('a');
    a.href=objectUrl;
    a.download=filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(()=>URL.revokeObjectURL(objectUrl),2000);
    status.textContent='Download started. You can close this tab.';
  }catch(error){
    status.textContent='Download failed: '+(error?.message||String(error));
    button.disabled=false;
    running=false;
  }
}
document.getElementById('download').addEventListener('click',startDownload);
window.addEventListener('load',()=>setTimeout(startDownload,100));
</script>
</body>
</html>`;
}

export async function trigger(request) {
  const secrets = bridgeSecrets();
  if (!secrets.length) return jsonResponse(500, { ok: false, error: 'Portal bridge is not configured.' });

  const downloadToken = queryValue(request, 'download');
  if (downloadToken) {
    try {
      const payload = verifyDownload(downloadToken, secrets);
      const context = customerContext(payload);
      const partValue = queryValue(request, 'part');
      // Links carry either a published report (reportId) or the customer's
      // own date-filtered job (jobId).
      const source = payload.jobId
        ? { meta: 'portal:job-meta', chunk: 'portal:job-chunk', args: { jobId: payload.jobId } }
        : { meta: 'portal:latest-meta', chunk: 'portal:latest-chunk', args: { reportId: payload.reportId } };

      if (partValue !== '') {
        const index = Number(partValue);
        if (!Number.isInteger(index) || index < 0) throw new Error('Invalid report chunk.');
        const chunk = await handlePortalAction(source.chunk, { ...source.args, index }, context);
        return textResponse(200, chunk);
      }

      const meta = await handlePortalAction(source.meta, source.args, context);
      if (!meta?.chunkCount) throw new Error('There is no published report available to download.');

      const host = headerValue(request?.headers, 'host');
      const baseUrl = `https://${host}${request?.path || ''}`;
      return textResponse(
        200,
        htmlDownloadPage({
          baseUrl,
          token: downloadToken,
          filename: meta.filename,
          chunkCount: meta.chunkCount
        }),
        'text/html; charset=utf-8',
        { 'Content-Security-Policy': ["default-src 'self'; script-src 'unsafe-inline'; style-src 'unsafe-inline'"] }
      );
    } catch (error) {
      return textResponse(403, error?.message || 'Download link is invalid.');
    }
  }

  const auth = headerValue(request?.headers, 'authorization');
  if (!isAuthorized(auth, secrets)) {
    return jsonResponse(401, { ok: false, error: 'Unauthorized' });
  }

  try {
    const input = request?.body ? JSON.parse(request.body) : {};
    if (input.action === 'ping') return jsonResponse(200, { ok: true });

    const accountId = String(input.accountId || '').trim();
    if (!accountId) return jsonResponse(400, { ok: false, error: 'Missing accountId' });

    const portalId = String(input.portalId || '').trim();
    const context = customerContext({ accountId, portalId });

    if (input.action === 'portal:download-link') {
      const reportId = String(input?.payload?.reportId || '').trim();
      if (!reportId) throw new Error('Missing reportId.');
      await handlePortalAction('portal:latest-meta', { reportId }, context);

      const token = signDownload({
        accountId,
        portalId,
        reportId,
        exp: Date.now() + 10 * 60 * 1000
      }, secrets);
      return jsonResponse(200, { ok: true, data: { token } });
    }

    if (input.action === 'portal:job-download-link') {
      const jobId = String(input?.payload?.jobId || '').trim();
      if (!jobId) throw new Error('Missing jobId.');
      await handlePortalAction('portal:job-meta', { jobId }, context);

      const token = signDownload({
        accountId,
        portalId,
        jobId,
        exp: Date.now() + 10 * 60 * 1000
      }, secrets);
      return jsonResponse(200, { ok: true, data: { token } });
    }

    const data = await handlePortalAction(input.action, input.payload || {}, context);
    return jsonResponse(200, { ok: true, data });
  } catch (error) {
    return jsonResponse(400, { ok: false, error: error?.message || 'Portal bridge request failed.' });
  }
}
