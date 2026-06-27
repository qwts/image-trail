#!/usr/bin/env node

import { createServer } from 'node:http';
import { randomBytes, timingSafeEqual } from 'node:crypto';
import { spawn } from 'node:child_process';
import process from 'node:process';

const DEFAULT_PORT = 8787;
const DEFAULT_CALLBACK_PATH = '/pcloud';
const AUTH_URL = 'https://my.pcloud.com/oauth2/authorize';
const DEFAULT_API_HOST = 'api.pcloud.com';
const ALLOWED_API_HOSTS = new Set([DEFAULT_API_HOST, 'eapi.pcloud.com']);

const clientId = process.env.PCLOUD_CLIENT_ID;
const clientSecret = process.env.PCLOUD_CLIENT_SECRET;
const oauthFlow = process.env.PCLOUD_OAUTH_FLOW === 'token' ? 'token' : 'code';
const port = Number(process.env.PCLOUD_OAUTH_PORT ?? DEFAULT_PORT);
const callbackPath = normalizePath(process.env.PCLOUD_OAUTH_CALLBACK_PATH ?? DEFAULT_CALLBACK_PATH);
const configuredApiHost =
  typeof process.env.PCLOUD_API_HOST === 'string' && process.env.PCLOUD_API_HOST.length > 0
    ? normalizeApiHost(process.env.PCLOUD_API_HOST, 'PCLOUD_API_HOST')
    : undefined;
const state = randomBytes(24).toString('hex');

if (!clientId) {
  console.error('Missing PCLOUD_CLIENT_ID. Set it to the pCloud app/client id before running OAuth.');
  process.exit(2);
}

if (oauthFlow === 'code' && !clientSecret) {
  console.error('Missing PCLOUD_CLIENT_SECRET. Set it locally before running the pCloud code-flow OAuth spike.');
  process.exit(2);
}

if (!Number.isInteger(port) || port <= 0 || port > 65535) {
  console.error('PCLOUD_OAUTH_PORT must be a valid TCP port.');
  process.exit(2);
}

const redirectUri = `http://127.0.0.1:${port}${callbackPath}`;
const authorizeUrl = new URL(AUTH_URL);
authorizeUrl.searchParams.set('client_id', clientId);
authorizeUrl.searchParams.set('response_type', oauthFlow);
authorizeUrl.searchParams.set('redirect_uri', redirectUri);
authorizeUrl.searchParams.set('state', state);

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? '/', redirectUri);
    if (request.method === 'GET' && url.pathname === callbackPath) {
      if (oauthFlow === 'token') {
        respondHtml(response, tokenCallbackHtml());
        return;
      }
      const captured = validateCodeCallback(url.searchParams);
      const token = await exchangeCodeForToken(captured.code, captured.apiHost);
      respondHtml(response, '<p>pCloud OAuth code exchanged. You can return to Codex.</p>');
      server.close();
      await runSpike(token);
      return;
    }

    if (request.method === 'POST' && oauthFlow === 'token' && url.pathname === '/capture-token') {
      const captured = validateTokenCapture(JSON.parse(await readRequestBody(request)));
      respondHtml(response, '<p>pCloud OAuth token captured. You can return to Codex.</p>');
      server.close();
      await runSpike(captured);
      return;
    }

    response.writeHead(404, { 'content-type': 'text/plain; charset=utf-8' });
    response.end('Not found.');
  } catch (error) {
    respondError(response, error);
    process.exitCode = 1;
    server.close();
  }
});

server.listen(port, '127.0.0.1', () => {
  console.log(`Register this callback with pCloud: ${redirectUri}`);
  console.log(`Using OAuth response_type=${oauthFlow}.`);
  console.log('Open this authorization URL in a browser:');
  console.log(authorizeUrl.toString());
  console.log('Waiting for pCloud OAuth redirect...');
});

function validateCodeCallback(params) {
  const error = params.get('error');
  if (error) throw new Error(`pCloud OAuth error: ${error}`);
  const returnedState = params.get('state');
  if (!returnedState || !safeEqual(returnedState, state)) throw new Error('OAuth state mismatch.');
  const code = params.get('code');
  if (!code) throw new Error('OAuth callback did not include a code.');
  return {
    code,
    apiHost: apiHostFrom(params.get('hostname'), 'OAuth callback hostname'),
  };
}

async function exchangeCodeForToken(code, apiHost) {
  const normalizedApiHost = normalizeApiHost(apiHost, 'OAuth token exchange host');
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    code,
  });
  const response = await fetch(`https://${normalizedApiHost}/oauth2_token`, { method: 'POST', body });
  const parsed = await parseJsonResponse(response, 'oauth2_token');
  if (parsed.result !== 0 || typeof parsed.access_token !== 'string') {
    throw new Error(`oauth2_token failed: result=${parsed.result ?? 'unknown'} message=${parsed.error ?? response.statusText}`);
  }
  return {
    accessToken: parsed.access_token,
    apiHost:
      typeof parsed.hostname === 'string' && parsed.hostname.length > 0
        ? normalizeApiHost(parsed.hostname, 'oauth2_token hostname')
        : normalizedApiHost,
  };
}

async function runSpike(token) {
  console.log(`OAuth token captured via ${oauthFlow} flow. Running pCloud spike against ${token.apiHost}.`);
  await new Promise((resolve, reject) => {
    const child = spawn(process.execPath, ['scripts/pcloud-api-spike.mjs'], {
      cwd: process.cwd(),
      env: {
        ...process.env,
        PCLOUD_ACCESS_TOKEN: token.accessToken,
        PCLOUD_API_HOST: token.apiHost,
      },
      stdio: 'inherit',
    });
    child.on('error', reject);
    child.on('exit', (code) => {
      process.exitCode = code ?? 1;
      resolve();
    });
  });
}

function validateTokenCapture(captured) {
  if (!captured || typeof captured !== 'object') throw new Error('OAuth token response was not an object.');
  if (typeof captured.error === 'string') throw new Error(`pCloud OAuth error: ${captured.error}`);
  if (typeof captured.state !== 'string' || !safeEqual(captured.state, state)) throw new Error('OAuth state mismatch.');
  if (typeof captured.access_token !== 'string' || captured.access_token.length === 0) {
    throw new Error('OAuth token response did not include an access_token.');
  }
  return {
    accessToken: captured.access_token,
    apiHost: apiHostFrom(captured.hostname, 'OAuth token hostname'),
  };
}

async function parseJsonResponse(response, method) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${method} returned non-JSON HTTP ${response.status}.`);
  }
}

function readRequestBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 4096) {
        reject(new Error('OAuth callback payload is too large.'));
        request.destroy();
      }
    });
    request.on('end', () => resolve(body));
    request.on('error', reject);
  });
}

function respondHtml(response, html) {
  response.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
  response.end(html);
}

function respondError(response, error) {
  const message = error instanceof Error ? error.message : 'OAuth callback failed.';
  if (response.headersSent) {
    console.error(message);
    return;
  }
  response.writeHead(400, { 'content-type': 'text/plain; charset=utf-8' });
  response.end(message);
}

function tokenCallbackHtml() {
  return `<!doctype html>
<meta charset="utf-8">
<title>Image Trail pCloud OAuth</title>
<p>Completing pCloud OAuth...</p>
<script>
  const params = new URLSearchParams(location.hash.slice(1) || location.search.slice(1));
  fetch('/capture-token', {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(Object.fromEntries(params.entries())),
  })
    .then(() => {
      document.body.textContent = 'pCloud OAuth token captured. You can close this tab.';
    })
    .catch((error) => {
      document.body.textContent = 'OAuth capture failed: ' + error;
    });
</script>`;
}

function normalizePath(value) {
  const path = value.trim();
  return path.startsWith('/') ? path : `/${path}`;
}

function apiHostFrom(value, source) {
  if (configuredApiHost) return configuredApiHost;
  return typeof value === 'string' && value.length > 0 ? normalizeApiHost(value, source) : DEFAULT_API_HOST;
}

function normalizeApiHost(value, source) {
  const host = String(value).replace(/^https?:\/\//u, '').replace(/\/.*$/u, '').trim().toLowerCase();
  if (!host) throw new Error(`${source} resolved to an empty host.`);
  if (!ALLOWED_API_HOSTS.has(host)) {
    throw new Error(`${source} must be api.pcloud.com or eapi.pcloud.com.`);
  }
  return host;
}

function safeEqual(left, right) {
  const leftBytes = Buffer.from(left);
  const rightBytes = Buffer.from(right);
  return leftBytes.length === rightBytes.length && timingSafeEqual(leftBytes, rightBytes);
}
