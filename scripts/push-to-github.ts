// GitHub Push Script - Uses Replit's GitHub integration
import { Octokit } from '@octokit/rest';
import * as fs from 'fs';
import * as path from 'path';

let connectionSettings: any;

async function getAccessToken() {
  if (connectionSettings && connectionSettings.settings.expires_at && new Date(connectionSettings.settings.expires_at).getTime() > Date.now()) {
    return connectionSettings.settings.access_token;
  }
  
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  if (!xReplitToken) {
    throw new Error('X_REPLIT_TOKEN not found for repl/depl');
  }

  connectionSettings = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    {
      headers: {
        'Accept': 'application/json',
        'X_REPLIT_TOKEN': xReplitToken
      }
    }
  ).then(res => res.json()).then(data => data.items?.[0]);

  const accessToken = connectionSettings?.settings?.access_token || connectionSettings.settings?.oauth?.credentials?.access_token;

  if (!connectionSettings || !accessToken) {
    throw new Error('GitHub not connected');
  }
  return accessToken;
}

async function getUncachableGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

function getAllFiles(dir: string, baseDir: string = dir): { path: string; content: string }[] {
  const files: { path: string; content: string }[] = [];
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  
  const ignoreDirs = ['node_modules', '.git', 'dist', 'android', '.replit', '.cache', '.config', '.upm', '.local', 'attached_assets'];
  const ignoreFiles = ['.replit', 'replit.nix', '.gitignore', 'package-lock.json'];
  
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    const relativePath = path.relative(baseDir, fullPath);
    
    if (entry.isDirectory()) {
      if (!ignoreDirs.includes(entry.name) && (!entry.name.startsWith('.') || entry.name === '.github')) {
        files.push(...getAllFiles(fullPath, baseDir));
      }
    } else {
      if (!ignoreFiles.includes(entry.name) && !entry.name.endsWith('.log')) {
        try {
          const content = fs.readFileSync(fullPath, 'utf-8');
          files.push({ path: relativePath, content });
        } catch (e) {
          // Skip binary files
        }
      }
    }
  }
  
  return files;
}

async function sleep(ms: number) {
  return new Promise(r => setTimeout(r, ms));
}

async function main() {
  const repoName = process.argv[2] || 'pico-wallet';
  
  console.log('Getting GitHub client...');
  const octokit = await getUncachableGitHubClient();
  
  console.log('Fetching authenticated user...');
  const { data: user } = await octokit.rest.users.getAuthenticated();
  console.log(`Authenticated as: ${user.login}`);
  
  // Delete existing repo to start fresh
  console.log('Deleting existing repository to start fresh...');
  try {
    await octokit.rest.repos.delete({ owner: user.login, repo: repoName });
    console.log('Deleted existing repo');
    await sleep(2000);
  } catch (e) {
    console.log('No existing repo to delete or no permission');
  }
  
  // Create new repo with auto_init
  console.log(`Creating repository ${user.login}/${repoName}...`);
  try {
    await octokit.rest.repos.createForAuthenticatedUser({
      name: repoName,
      description: 'Multi-chain cryptocurrency hardware wallet application',
      private: false,
      auto_init: true
    });
    console.log('Repository created with initial README');
    await sleep(3000);
  } catch (e: any) {
    if (e.status !== 422) throw e;
    console.log('Repo already exists');
  }
  
  // Collect files
  console.log('Collecting files...');
  const files = getAllFiles('.');
  console.log(`Found ${files.length} files to upload`);
  
  // Upload files using Contents API (one at a time)
  let uploaded = 0;
  let failed = 0;
  
  for (const file of files) {
    try {
      // Get existing file SHA if it exists
      let sha: string | undefined;
      try {
        const { data } = await octokit.rest.repos.getContent({
          owner: user.login,
          repo: repoName,
          path: file.path
        });
        if (!Array.isArray(data) && 'sha' in data) {
          sha = data.sha;
        }
      } catch (e) {
        // File doesn't exist yet
      }
      
      await octokit.rest.repos.createOrUpdateFileContents({
        owner: user.login,
        repo: repoName,
        path: file.path,
        message: `Add ${file.path}`,
        content: Buffer.from(file.content).toString('base64'),
        sha
      });
      
      uploaded++;
      if (uploaded % 20 === 0) {
        console.log(`  Uploaded ${uploaded}/${files.length} files...`);
      }
    } catch (e: any) {
      failed++;
      if (e.status !== 422) {
        console.log(`  Failed: ${file.path} - ${e.message}`);
      }
    }
  }
  
  console.log(`\nUploaded ${uploaded} files, ${failed} skipped/failed`);
  console.log(`\nSuccess! Code pushed to: https://github.com/${user.login}/${repoName}`);
  console.log(`\nGitHub Actions will now build the APK automatically.`);
  console.log(`Check: https://github.com/${user.login}/${repoName}/actions`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
