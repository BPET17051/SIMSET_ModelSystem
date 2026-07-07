const fs = require('fs');
const path = require('path');

const workflowPath = path.resolve(__dirname, '..', '.github', 'workflows', 'deploy-production.yml');
const content = fs.readFileSync(workflowPath, 'utf8');

const checks = [
  { label: 'workflow_dispatch trigger', pattern: /on:\s*\n\s*workflow_dispatch:/m },
  { label: 'preflight job exists', pattern: /\njobs:\s*\n\s*preflight:/m },
  { label: 'deploy job exists', pattern: /\n\s*deploy:\s*\n/m },
  { label: 'deploy depends on preflight', pattern: /needs:\s*preflight/m },
  { label: 'production environment configured', pattern: /environment:\s*\n\s*name:\s*production/m },
  { label: 'encoding guard step', pattern: /python\s+\.agent\/scripts\/encoding_guard\.py\s+website/m },
  { label: 'current MVP contract step', pattern: /npm run verify:current-mvp/m },
  { label: 'main smoke step', pattern: /npm run smoke:main-pages/m },
  { label: 'cloudflare deploy command', pattern: /wrangler pages deploy website --project-name simset-showroom/m },
  { label: 'cloudflare token secret', pattern: /CLOUDFLARE_API_TOKEN:\s*\$\{\{\s*secrets\.CLOUDFLARE_API_TOKEN\s*\}\}/m },
  { label: 'cloudflare account secret', pattern: /CLOUDFLARE_ACCOUNT_ID:\s*\$\{\{\s*secrets\.CLOUDFLARE_ACCOUNT_ID\s*\}\}/m },
];

const failures = checks
  .filter((check) => !check.pattern.test(content))
  .map((check) => check.label);

if (failures.length > 0) {
  console.error('FAIL: Deploy workflow smoke');
  failures.forEach((failure) => console.error(`- Missing or invalid: ${failure}`));
  process.exit(1);
}

console.log('PASS: Deploy workflow smoke');
