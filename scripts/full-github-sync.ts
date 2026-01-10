// Full GitHub sync - uploads all tracked files
import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import * as fs from 'fs';

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
  const data = await res.json();
  const conn = data.items?.[0];
  return conn?.settings?.access_token || conn?.settings?.oauth?.credentials?.access_token;
}

async function uploadFile(octokit: Octokit, owner: string, repo: string, filePath: string): Promise<boolean> {
  try {
    const content = fs.readFileSync(filePath);
    
    let sha: string | undefined;
    try {
      const { data } = await octokit.rest.repos.getContent({ owner, repo, path: filePath });
      sha = (data as any).sha;
    } catch (e) {}

    await octokit.rest.repos.createOrUpdateFileContents({
      owner, repo, path: filePath,
      message: `Update ${filePath}`,
      content: content.toString('base64'),
      sha
    });
    return true;
  } catch (e: any) {
    if (e.status === 403 || e.status === 404) {
      // Permission denied or path issue
      return false;
    }
    throw e;
  }
}

async function main() {
  const repoName = 'pico-wallet';
  const token = await getAccessToken();
  const octokit = new Octokit({ auth: token });
  
  const { data: user } = await octokit.rest.users.getAuthenticated();
  const owner = user.login;
  console.log(`Full sync to ${owner}/${repoName}\n`);

  // Get all git-tracked files, excluding node_modules and build artifacts
  const allFiles = execSync('git ls-files', { encoding: 'utf-8' })
    .trim().split('\n')
    .filter(f => f && 
      !f.startsWith('node_modules/') && 
      !f.startsWith('.cache/') &&
      !f.startsWith('temp_repo/') &&
      !f.includes('/build/') &&
      !f.endsWith('.apk'));

  console.log(`Found ${allFiles.length} files to sync\n`);

  // Critical files first (needed for build)
  const criticalFiles = [
    'package.json',
    'package-lock.json',
    'tsconfig.json',
    'vite.config.ts',
    'tailwind.config.ts',
    'postcss.config.js',
    'drizzle.config.ts',
    'capacitor.config.ts',
    'index.html',
  ];

  console.log('Uploading critical build files...');
  for (const file of criticalFiles) {
    if (fs.existsSync(file)) {
      const success = await uploadFile(octokit, owner, repoName, file);
      console.log(success ? `✓ ${file}` : `✗ ${file}`);
      await new Promise(r => setTimeout(r, 200));
    }
  }

  // Upload all other source files
  const sourceFiles = allFiles.filter(f => 
    !criticalFiles.includes(f) &&
    (f.startsWith('client/') || 
     f.startsWith('server/') || 
     f.startsWith('shared/') ||
     f.startsWith('scripts/') ||
     f.startsWith('android/') ||
     f.endsWith('.ts') ||
     f.endsWith('.tsx') ||
     f.endsWith('.css') ||
     f.endsWith('.json') ||
     f.endsWith('.xml') ||
     f.endsWith('.gradle') ||
     f.endsWith('.properties') ||
     f.endsWith('.java') ||
     f.endsWith('.html') ||
     f === 'replit.md')
  );

  console.log(`\nUploading ${sourceFiles.length} source files...`);
  let uploaded = 0;
  let failed = 0;

  for (const file of sourceFiles) {
    if (fs.existsSync(file)) {
      try {
        const success = await uploadFile(octokit, owner, repoName, file);
        if (success) {
          uploaded++;
          process.stdout.write('.');
        } else {
          failed++;
        }
      } catch (e: any) {
        failed++;
        if (e.message?.includes('rate')) {
          console.log('\nRate limited, waiting 60s...');
          await new Promise(r => setTimeout(r, 60000));
        }
      }
      await new Promise(r => setTimeout(r, 150));
    }
  }

  console.log(`\n\nDone! Uploaded: ${uploaded}, Failed: ${failed}`);
  console.log(`Check build: https://github.com/${owner}/${repoName}/actions`);
}

main().catch(e => console.error('Error:', e.message));
