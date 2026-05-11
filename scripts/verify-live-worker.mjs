const workerBase = (process.env.WORKER_BASE || 'https://simset-showroom-proxy.simset-admin.workers.dev').replace(/\/+$/, '');

async function request(path) {
  const response = await fetch(`${workerBase}${path}`, {
    headers: {
      apikey: 'worker-managed-key',
      Authorization: 'Bearer worker-managed-key',
    },
  });
  const text = await response.text();
  return { status: response.status, text: text.slice(0, 300) };
}

const publicEquipment = await request('/rest/v1/equipments?select=id&limit=1');
if (publicEquipment.status >= 400) {
  if (publicEquipment.status === 401 && publicEquipment.text.includes('Invalid API key')) {
    throw new Error(
      `Worker is deployed but SUPABASE_KEY is missing or invalid. Run "wrangler secret put SUPABASE_KEY" in cloudflare-worker, then redeploy or re-run this check. Response: ${publicEquipment.text}`
    );
  }
  throw new Error(`Expected public equipment endpoint to be reachable, got ${publicEquipment.status}: ${publicEquipment.text}`);
}

const forbidden = await request('/rest/v1/secret_admin_table');
if (forbidden.status !== 403) {
  throw new Error(`Expected forbidden endpoint to return 403, got ${forbidden.status}: ${forbidden.text}`);
}

console.log(`Live Worker checks passed for ${workerBase}`);
