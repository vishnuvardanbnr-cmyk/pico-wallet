// Simple GitHub upload using Contents API
import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import * as fs from 'fs';

let connectionSettings: any;

async function getAccessToken() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) throw new Error('Not authenticated');

  const res = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    { headers: { 'Accept': 'application/json', 'X_REPLIT_TOKEN': xReplitToken } }
  );
  connectionSettings = (await res.json()).items?.[0];
  return connectionSettings?.settings?.access_token || connectionSettings?.settings?.oauth?.credentials?.access_token;
}

async function main() {
  const repoName = 'pico-hardware-wallet';
  const token = await getAccessToken();
  const octokit = new Octokit({ auth: token });
  
  const { data: user } = await octokit.rest.users.getAuthenticated();
  const owner = user.login;
  console.log(`Uploading to ${owner}/${repoName}`);

  // Get tracked files (skip large/binary files)
  const files = execSync('git ls-files', { encoding: 'utf-8' })
    .trim().split('\n')
    .filter(f => f && !f.includes('node_modules') && !f.endsWith('.png') && !f.endsWith('.jpg'));

  // Upload README first to initialize repo
  const readmeContent = fs.readFileSync('replit.md', 'utf-8');
  try {
    await octokit.rest.repos.createOrUpdateFileContents({
      owner, repo: repoName,
      path: 'README.md',
      message: 'Initial commit',
      content: Buffer.from(readmeContent).toString('base64')
    });
    console.log('Created README.md');
  } catch (e: any) {
    if (e.status !== 422) console.log('README exists');
  }

  // Wait and get SHA
  await new Promise(r => setTimeout(r, 2000));
  
  // Upload key files
  const keyFiles = [
    'package.json', 'tsconfig.json', 'vite.config.ts', 'tailwind.config.ts',
    'shared/schema.ts', 'server/index.ts', 'server/routes.ts',
    'client/src/App.tsx', 'client/src/pages/dapps.tsx', 'client/src/pages/dashboard.tsx',
    'client/src/lib/wallet-context.tsx', 'client/src/lib/soft-wallet.ts'
  ];

  for (const filePath of keyFiles) {
    try {
      if (!fs.existsSync(filePath)) continue;
      const content = fs.readFileSync(filePath, 'utf-8');
      
      // Check if file exists
      let sha: string | undefined;
      try {
        const { data } = await octokit.rest.repos.getContent({ owner, repo: repoName, path: filePath });
        sha = (data as any).sha;
      } catch (e) {}

      await octokit.rest.repos.createOrUpdateFileContents({
        owner, repo: repoName, path: filePath,
        message: `Update ${filePath}`,
        content: Buffer.from(content).toString('base64'),
        sha
      });
      console.log(`Uploaded ${filePath}`);
    } catch (e: any) {
      console.log(`Skipped ${filePath}: ${e.message?.slice(0, 50)}`);
    }
  }

  console.log(`\nDone! https://github.com/${owner}/${repoName}`);
}

main().catch(e => console.error(e.message));
