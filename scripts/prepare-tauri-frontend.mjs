import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export function sanitizeTauriServerUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') {
    return ''
  }
  const trimmed = rawUrl.trim()
  if (!trimmed) {
    return ''
  }
  try {
    const url = new URL(trimmed)
    if (url.protocol !== 'http:' && url.protocol !== 'https:') {
      return ''
    }
    return url.origin
  } catch {
    return ''
  }
}

export function buildTauriBootstrapHtml(defaultServerUrl = '') {
  const bakedUrl = sanitizeTauriServerUrl(defaultServerUrl)
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>My Team</title>
  <style>
    :root {
      --bg: #0b0f17;
      --card-bg: rgba(255, 255, 255, 0.04);
      --card-border: rgba(255, 255, 255, 0.08);
      --accent: #10b981;
      --accent-hover: #059669;
      --text: #f8fafc;
      --text-muted: #94a3b8;
    }
    * {
      box-sizing: border-box;
      margin: 0;
      padding: 0;
    }
    body {
      background: var(--bg);
      color: var(--text);
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      padding: 1.5rem;
    }
    .card {
      background: var(--card-bg);
      border: 1px solid var(--card-border);
      border-radius: 1rem;
      padding: 2rem;
      width: 100%;
      max-width: 440px;
      box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
      backdrop-filter: blur(12px);
      text-align: center;
    }
    .logo {
      width: 64px;
      height: 64px;
      margin: 0 auto 1.25rem;
      border-radius: 16px;
      background: linear-gradient(135deg, #10b981 0%, #064e3b 100%);
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 8px 16px rgba(16, 185, 129, 0.25);
    }
    .logo svg {
      width: 32px;
      height: 32px;
      fill: none;
      stroke: white;
      stroke-width: 2;
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    h1 {
      font-size: 1.5rem;
      font-weight: 600;
      margin-bottom: 0.5rem;
    }
    p {
      color: var(--text-muted);
      font-size: 0.875rem;
      margin-bottom: 1.5rem;
      line-height: 1.4;
    }
    .form-group {
      text-align: left;
      margin-bottom: 1.25rem;
    }
    label {
      display: block;
      font-size: 0.75rem;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: var(--text-muted);
      margin-bottom: 0.5rem;
    }
    input {
      width: 100%;
      padding: 0.75rem 1rem;
      background: rgba(0, 0, 0, 0.3);
      border: 1px solid var(--card-border);
      border-radius: 0.5rem;
      color: var(--text);
      font-size: 0.9375rem;
      outline: none;
      transition: border-color 0.2s;
    }
    input:focus {
      border-color: var(--accent);
    }
    button {
      width: 100%;
      padding: 0.75rem;
      background: var(--accent);
      color: #042f2e;
      border: none;
      border-radius: 0.5rem;
      font-size: 0.9375rem;
      font-weight: 600;
      cursor: pointer;
      transition: background-color 0.2s;
    }
    button:hover {
      background: var(--accent-hover);
    }
    .error {
      color: #f87171;
      font-size: 0.8125rem;
      margin-top: 0.5rem;
      display: none;
    }
    .connecting {
      display: none;
      flex-direction: column;
      align-items: center;
      gap: 1rem;
    }
    .spinner {
      width: 36px;
      height: 36px;
      border: 3px solid rgba(255, 255, 255, 0.1);
      border-top-color: var(--accent);
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
    }
    @keyframes spin {
      to { transform: rotate(360deg); }
    }
  </style>
</head>
<body>
  <div class="card" id="setupCard">
    <div class="logo">
      <svg viewBox="0 0 24 24"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
    </div>
    <h1>My Team</h1>
    <p>Connect your desktop app to your live workspace server.</p>
    <form id="connectForm">
      <div class="form-group">
        <label for="serverUrl">Workspace Server URL</label>
        <input type="text" id="serverUrl" placeholder="https://my-team.vercel.app or http://localhost:3000" autocomplete="off" spellcheck="false" required>
        <div class="error" id="errorMsg">Please enter a valid http:// or https:// URL</div>
      </div>
      <button type="submit" id="submitBtn">Connect</button>
    </form>
  </div>

  <div class="card connecting" id="connectingCard">
    <div class="spinner"></div>
    <h1>Connecting to My Team...</h1>
    <p id="connectingTarget"></p>
  </div>

  <script>
    const STORAGE_KEY = 'my-team-desktop-server-url';
    const BAKED_SERVER_URL = ${JSON.stringify(bakedUrl)};

    function sanitize(urlStr) {
      if (!urlStr || typeof urlStr !== 'string') return '';
      try {
        const u = new URL(urlStr.trim());
        if (u.protocol !== 'http:' && u.protocol !== 'https:') return '';
        return u.origin;
      } catch {
        return '';
      }
    }

    const savedUrl = sanitize(localStorage.getItem(STORAGE_KEY));
    const targetUrl = savedUrl || BAKED_SERVER_URL;

    if (targetUrl) {
      document.getElementById('setupCard').style.display = 'none';
      const connCard = document.getElementById('connectingCard');
      connCard.style.display = 'flex';
      document.getElementById('connectingTarget').textContent = targetUrl;
      window.location.replace(targetUrl);
    } else {
      const form = document.getElementById('connectForm');
      const input = document.getElementById('serverUrl');
      const errorMsg = document.getElementById('errorMsg');

      form.addEventListener('submit', (e) => {
        e.preventDefault();
        errorMsg.style.display = 'none';
        const cleaned = sanitize(input.value);
        if (!cleaned) {
          errorMsg.style.display = 'block';
          return;
        }
        localStorage.setItem(STORAGE_KEY, cleaned);
        document.getElementById('setupCard').style.display = 'none';
        const connCard = document.getElementById('connectingCard');
        connCard.style.display = 'flex';
        document.getElementById('connectingTarget').textContent = cleaned;
        window.location.replace(cleaned);
      });
    }
  </script>
</body>
</html>
`
}

export function writeTauriFrontend(customUrl) {
  const rawUrl = customUrl !== undefined ? customUrl : (process.env.NUXT_PUBLIC_APP_URL || '')
  const html = buildTauriBootstrapHtml(rawUrl)
  const outDir = path.resolve(process.cwd(), 'src-tauri', 'frontend')
  fs.mkdirSync(outDir, { recursive: true })
  const outPath = path.join(outDir, 'index.html')
  fs.writeFileSync(outPath, html, 'utf8')
  console.log(`Generated ${outPath} (${Buffer.byteLength(html, 'utf8')} bytes)`)
  return outPath
}

const isMain = process.argv[1] && (
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url)) ||
  process.argv[1].endsWith('prepare-tauri-frontend.mjs')
)

if (isMain) {
  writeTauriFrontend()
}
