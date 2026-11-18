const path = require('path');
const http = require('http');
const fs = require('fs');
const fsp = require('fs/promises');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const WEB_ROOT = path.join(ROOT, 'website');
const PORT = Number(process.env.SMOKE_PORT || 4177);
const HOST = '127.0.0.1';
const BASE = `http://${HOST}:${PORT}/`;

const TEXT_EXTENSIONS = new Set([
  '.html',
  '.css',
  '.js',
  '.json',
  '.txt',
  '.svg',
  '.map',
  '.xml',
  '.webmanifest',
]);

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
};

function getMimeType(filePath) {
  return MIME_TYPES[path.extname(filePath).toLowerCase()] || 'application/octet-stream';
}

async function serveFile(filePath, response) {
  const ext = path.extname(filePath).toLowerCase();
  response.writeHead(200, { 'Content-Type': getMimeType(filePath), 'Cache-Control': 'no-store' });

  if (TEXT_EXTENSIONS.has(ext)) {
    response.end(await fsp.readFile(filePath, 'utf8'));
    return;
  }

  fs.createReadStream(filePath).pipe(response);
}

function createServer() {
  return http.createServer(async (request, response) => {
    try {
      const url = new URL(request.url, BASE);
      let pathname = decodeURIComponent(url.pathname);
      if (pathname === '/') pathname = '/index.html';

      const resolved = path.resolve(WEB_ROOT, `.${pathname}`);
      if (!resolved.startsWith(WEB_ROOT)) {
        response.writeHead(403);
        response.end('Forbidden');
        return;
      }

      const stat = await fsp.stat(resolved).catch(() => null);
      if (!stat) {
        response.writeHead(404);
        response.end('Not Found');
        return;
      }

      if (stat.isDirectory()) {
        await serveFile(path.join(resolved, 'index.html'), response);
        return;
      }

      await serveFile(resolved, response);
    } catch (error) {
      response.writeHead(500);
      response.end(`Server error: ${error.message}`);
    }
  });
}

const cases = [
  {
    name: 'Root nav redirects to borrow',
    path: 'index.html',
    selectors: ['nav#nav[aria-label="เมนูหลัก"]', '.nav-brand img', '#btn-login', '#user-profile', '#cart-icon-btn', '#cart-badge', 'footer.footer'],
  },
  {
    name: 'Borrow nav',
    path: 'borrow.html',
    selectors: ['nav#nav[aria-label="เมนูหลัก"]', '#btn-login', '#user-profile', '#cart-icon-btn', '#cart-badge', 'footer.footer'],
  },
  {
    name: 'History nav',
    path: 'history.html',
    selectors: ['nav#nav[aria-label="เมนูหลัก"]', '#history-user-chip', '#btn-history-login', '#btn-history-logout', 'footer.footer'],
  },
  {
    name: 'Tracking nav',
    path: 'tracking.html',
    selectors: ['nav#nav[aria-label="เมนูหลัก"]', '#tracking-user-chip', '#btn-history-login', '#btn-tracking-logout', 'footer.footer'],
  },
  {
    name: 'Success nav',
    path: 'success.html?tid=SMOKE-NAV-001',
    selectors: ['nav#nav[aria-label="เมนูหลัก"]', '.nav-brand img', '.live-pill[href="history.html"]', 'footer.footer'],
  },
];

async function runCase(browser, testCase) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const issues = [];

  page.on('pageerror', (error) => {
    issues.push(`[pageerror] ${error.message}`);
  });

  page.on('console', (msg) => {
    if (msg.type() !== 'error') return;
    issues.push(`[console] ${msg.text()}`);
  });

  try {
    await page.goto(new URL(testCase.path, BASE).toString(), {
      waitUntil: 'domcontentloaded',
      timeout: 30000,
    });

    await page.waitForSelector('nav#nav', { timeout: 15000 });

    for (const selector of testCase.selectors) {
      const count = await page.locator(selector).count();
      if (count === 0) {
        issues.push(`[assert] missing selector: ${selector}`);
      }
    }

    const unresolvedMount = await page.locator('[data-partial]').count();
    if (unresolvedMount > 0) {
      issues.push('[assert] unresolved data-partial mount remained in DOM');
    }
  } catch (error) {
    issues.push(`[exception] ${error.message}`);
  } finally {
    await page.close();
  }

  return {
    name: testCase.name,
    ok: issues.length === 0,
    issues,
  };
}

async function main() {
  const server = createServer();
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(PORT, HOST, resolve);
  });

  const browser = await chromium.launch({ headless: true });
  const results = [];

  try {
    for (const testCase of cases) {
      results.push(await runCase(browser, testCase));
    }
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }

  for (const result of results) {
    console.log(`${result.ok ? 'PASS' : 'FAIL'}: ${result.name}`);
    for (const issue of result.issues) {
      console.log(`  ${issue}`);
    }
  }

  if (results.some((result) => !result.ok)) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
