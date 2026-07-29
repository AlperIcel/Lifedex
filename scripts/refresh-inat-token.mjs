// LifeDex — local iNaturalist token refresher (dev only, no dependencies).
//
// WHY: iNaturalist's Computer Vision endpoint only accepts a ~24h JWT
// (`api_token`); there is no stable API key. This script turns a STABLE
// credential you set ONCE into a fresh 24h JWT and writes it into `.env`, so you
// never hand-copy a token again. Run it whenever recognition starts 401-ing
// (or once a day):  npm run inat:token
//
// It runs on YOUR machine — the OAuth credential/password never leave `.env`
// (which is gitignored) and never ship in the app bundle. For a PUBLIC release
// the same logic lives server-side in `supabase/functions/inat-proxy` so no
// credential ships at all; this script is the zero-infra dev equivalent.
//
// CREDENTIAL — set ONE of these in `.env` (see `.env.example`):
//   (a) INAT_OAUTH_ACCESS_TOKEN=<token>     paste once; no password stored.
//   (b) INAT_OAUTH_CLIENT_ID / INAT_OAUTH_CLIENT_SECRET / INAT_USERNAME /
//       INAT_PASSWORD                       fully hands-off; re-mints forever.
//   Register an app at https://www.inaturalist.org/oauth/applications to get
//   client id/secret.
//
// The refreshed JWT is written to INATURALIST_API_TOKEN in `.env`. Restart the
// Expo dev server afterwards (stop + `npm start`) so app.config.js re-reads it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OAUTH_TOKEN_URL = 'https://www.inaturalist.org/oauth/token';
const API_TOKEN_URL = 'https://www.inaturalist.org/users/api_token';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ENV_PATH = path.join(ROOT, '.env');

/** Minimal .env reader: KEY=VALUE, ignores blanks/comments, strips quotes. */
function parseEnv(text) {
  const out = {};
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '' || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    let key = line.slice(0, eq).trim();
    if (key.startsWith('export ')) key = key.slice(7).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (val.length > 0) out[key] = val;
  }
  return out;
}

/** Short, secret-free snippet of a failed response body, for diagnostics. */
async function safeBody(res) {
  try {
    const t = (await res.text()).replace(/\s+/g, ' ').trim();
    return t.length > 200 ? `${t.slice(0, 200)}…` : t;
  } catch {
    return '';
  }
}

/** exp claim of a JWT as a Date (or null if unreadable). Never throws. */
function jwtExpDate(jwt) {
  try {
    const seg = jwt.split('.')[1];
    const json = Buffer.from(seg.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');
    const payload = JSON.parse(json);
    return typeof payload.exp === 'number' ? new Date(payload.exp * 1000) : null;
  } catch {
    return null;
  }
}

/** A stored access token, or a password-grant exchange. Never logs secrets. */
async function getAccessToken(env) {
  if (env.INAT_OAUTH_ACCESS_TOKEN) return env.INAT_OAUTH_ACCESS_TOKEN;

  const id = env.INAT_OAUTH_CLIENT_ID;
  const secret = env.INAT_OAUTH_CLIENT_SECRET;
  const username = env.INAT_USERNAME;
  const password = env.INAT_PASSWORD;
  if (id && secret && username && password) {
    const body = new URLSearchParams({
      grant_type: 'password',
      client_id: id,
      client_secret: secret,
      username,
      password,
    });
    const res = await fetch(OAUTH_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });
    if (!res.ok) throw new Error(`OAuth token request failed: HTTP ${res.status} ${await safeBody(res)}`);
    const j = await res.json();
    if (typeof j.access_token !== 'string') throw new Error('OAuth response had no access_token');
    return j.access_token;
  }

  throw new Error(
    'No iNaturalist credentials found in .env. Set ONE of:\n' +
      '  INAT_OAUTH_ACCESS_TOKEN=<token>            (paste once; no password stored)\n' +
      '  --- or ---\n' +
      '  INAT_OAUTH_CLIENT_ID=<id>\n' +
      '  INAT_OAUTH_CLIENT_SECRET=<secret>\n' +
      '  INAT_USERNAME=<your iNaturalist login>\n' +
      '  INAT_PASSWORD=<your iNaturalist password>\n' +
      'Register an app at https://www.inaturalist.org/oauth/applications',
  );
}

/** Exchange an access token for a fresh ~24h api_token JWT. */
async function mintJwt(access) {
  const res = await fetch(API_TOKEN_URL, { headers: { Authorization: `Bearer ${access}` } });
  if (!res.ok) throw new Error(`api_token request failed: HTTP ${res.status} ${await safeBody(res)}`);
  const j = await res.json();
  if (typeof j.api_token !== 'string') throw new Error('api_token response was missing api_token');
  return j.api_token;
}

/** Replace (or append) INATURALIST_API_TOKEN in .env, preserving everything else. */
function writeToken(existing, jwt) {
  const line = `INATURALIST_API_TOKEN=${jwt}`;
  const re = /^INATURALIST_API_TOKEN=.*$/m;
  if (re.test(existing)) return existing.replace(re, line);
  const trimmed = existing.replace(/\s*$/, '');
  return trimmed === '' ? `${line}\n` : `${trimmed}\n${line}\n`;
}

async function main() {
  const existing = fs.existsSync(ENV_PATH) ? fs.readFileSync(ENV_PATH, 'utf8') : '';
  const env = parseEnv(existing);

  const access = await getAccessToken(env);
  const jwt = await mintJwt(access);

  fs.writeFileSync(ENV_PATH, writeToken(existing, jwt));

  const exp = jwtExpDate(jwt);
  console.log('[ok] Fresh iNaturalist token written to .env (INATURALIST_API_TOKEN).');
  if (exp) console.log(`     Valid until ${exp.toISOString()} (~24h) — re-run before then.`);
  console.log('     Restart the Expo dev server (stop, then `npm start`) to pick it up.');
}

main().catch((err) => {
  console.error(`[error] ${err instanceof Error ? err.message : String(err)}`);
  process.exitCode = 1;
});
