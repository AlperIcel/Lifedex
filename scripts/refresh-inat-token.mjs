// LifeDex — local iNaturalist token refresher (dev only, no dependencies).
//
// WHY: iNaturalist's Computer Vision endpoint only accepts a ~24h JWT
// (`api_token`); there is no stable API key. This script turns a credential you
// set ONCE into a fresh 24h JWT and writes it into `.env`, so you never hand-copy
// a token again. Run it whenever recognition starts 401-ing (or once a day):
//   npm run inat:token
//
// It runs on YOUR machine — the credential never leaves `.env` (which is
// gitignored) and never ships in the app bundle. For a PUBLIC release the same
// logic lives server-side in `supabase/functions/inat-proxy`; this script is the
// zero-infra dev equivalent.
//
// CREDENTIAL — set ONE of these in `.env` (see `.env.example`):
//   (COOKIE, no OAuth app needed) INAT_SESSION_COOKIE=<_inaturalist_session value>
//       Uses your logged-in iNaturalist browser session. This is the path to use
//       while iNaturalist gates OAuth-app creation (account >=2 months old + 10
//       identifications for others + manual approval). Grab the value from
//       DevTools > Application > Cookies > https://www.inaturalist.org.
//   (a) INAT_OAUTH_ACCESS_TOKEN=<token>     paste once; no password stored.
//   (b) INAT_OAUTH_CLIENT_ID / INAT_OAUTH_CLIENT_SECRET / INAT_USERNAME /
//       INAT_PASSWORD                       fully hands-off; re-mints forever.
//   (a) and (b) need a registered app (https://www.inaturalist.org/oauth/applications),
//   which iNaturalist gates — use the cookie until you have one.
//
// The refreshed JWT is written to INATURALIST_API_TOKEN in `.env`. Restart the
// Expo dev server afterwards (stop + `npm start`) so app.config.js re-reads it.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const OAUTH_TOKEN_URL = 'https://www.inaturalist.org/oauth/token';
const API_TOKEN_URL = 'https://www.inaturalist.org/users/api_token';
// A descriptive, honest User-Agent (with the Mozilla compatibility token some
// edge filters expect) so the plain fetch isn't mistaken for a naive bot.
const USER_AGENT = 'Mozilla/5.0 (compatible; LifeDex-dev-token-refresher/0.1)';

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
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', 'User-Agent': USER_AGENT },
      body,
    });
    if (!res.ok) throw new Error(`OAuth token request failed: HTTP ${res.status} ${await safeBody(res)}`);
    const j = await res.json();
    if (typeof j.access_token !== 'string') throw new Error('OAuth response had no access_token');
    return j.access_token;
  }

  throw new Error(
    'No iNaturalist credentials found in .env. Set ONE of:\n' +
      '  INAT_SESSION_COOKIE=<_inaturalist_session value>   (no OAuth app needed)\n' +
      '  INAT_OAUTH_ACCESS_TOKEN=<token>                    (needs a registered app)\n' +
      '  --- or the password grant (needs a registered app) ---\n' +
      '  INAT_OAUTH_CLIENT_ID / INAT_OAUTH_CLIENT_SECRET / INAT_USERNAME / INAT_PASSWORD\n' +
      'iNaturalist gates OAuth-app creation, so the session cookie is the usual dev path.',
  );
}

/** GET a fresh ~24h api_token JWT using the given auth headers. */
async function mintJwt(authHeaders) {
  const res = await fetch(API_TOKEN_URL, {
    headers: { Accept: 'application/json', 'User-Agent': USER_AGENT, ...authHeaders },
  });
  if (!res.ok) throw new Error(`api_token request failed: HTTP ${res.status} ${await safeBody(res)}`);
  const j = await res.json();
  if (typeof j.api_token !== 'string') throw new Error('api_token response was missing api_token');
  return j.api_token;
}

/** Mint a JWT via the first configured credential: session cookie, else OAuth. */
async function mintFreshJwt(env) {
  const cookie = env.INAT_SESSION_COOKIE;
  if (cookie) {
    // Accept either a bare value or a full "name=value; ..." cookie string.
    const header = cookie.includes('=') ? cookie : `_inaturalist_session=${cookie}`;
    return mintJwt({ Cookie: header });
  }
  const access = await getAccessToken(env);
  return mintJwt({ Authorization: `Bearer ${access}` });
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

  const jwt = await mintFreshJwt(env);
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
