// GitHub Push Script - Uses Replit's GitHub integration (API-based, no git)
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
      if (!ignoreDirs.includes(entry.name) && !entry.name.startsWith('.')) {
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

async function initializeEmptyRepo(octokit: Octokit, owner: string, repo: string) {
  console.log('Initializing empty repository with README...');
  
  // Create initial README
  await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: 'README.md',
    message: 'Initial commit',
    content: Buffer.from('# Pico Hardware Wallet\n\nMulti-chain cryptocurrency hardware wallet application.').toString('base64')
  });
  
  // Wait for commit to be ready
  await new Promise(r => setTimeout(r, 2000));
}

async function main() {
  const repoName = process.argv[2] || 'pico-wallet';
  
  console.log('Getting GitHub client...');
  const octokit = await getUncachableGitHubClient();
  
  console.log('Fetching authenticated user...');
  const { data: user } = await octokit.rest.users.getAuthenticated();
  console.log(`Authenticated as: ${user.login}`);
  
  // Check if repo exists, create if not
  let repoEmpty = false;
  try {
    await octokit.rest.repos.get({ owner: user.login, repo: repoName });
    console.log(`Repository ${user.login}/${repoName} exists`);
  } catch (error: any) {
    if (error.status === 404) {
      console.log(`Creating repository ${user.login}/${repoName}...`);
      await octokit.rest.repos.createForAuthenticatedUser({
        name: repoName,
        description: 'Multi-chain cryptocurrency hardware wallet application',
        private: false,
      });
      console.log('Repository created');
      repoEmpty = true;
      await new Promise(r => setTimeout(r, 2000));
    } else {
      throw error;
    }
  }
  
  // Get the current main branch ref
  let baseSha: string | undefined;
  let baseTreeSha: string | undefined;
  
  try {
    const { data: ref } = await octokit.rest.git.getRef({
      owner: user.login,
      repo: repoName,
      ref: 'heads/main'
    });
    baseSha = ref.object.sha;
    
    const { data: commit } = await octokit.rest.git.getCommit({
      owner: user.login,
      repo: repoName,
      commit_sha: baseSha
    });
    baseTreeSha = commit.tree.sha;
    console.log(`Found existing commit: ${baseSha.substring(0, 7)}`);
  } catch (e) {
    console.log('No existing main branch, initializing...');
    await initializeEmptyRepo(octokit, user.login, repoName);
    
    // Get the new ref
    const { data: ref } = await octokit.rest.git.getRef({
      owner: user.login,
      repo: repoName,
      ref: 'heads/main'
    });
    baseSha = ref.object.sha;
    
    const { data: commit } = await octokit.rest.git.getCommit({
      owner: user.login,
      repo: repoName,
      commit_sha: baseSha
    });
    baseTreeSha = commit.tree.sha;
    console.log(`Initialized with commit: ${baseSha.substring(0, 7)}`);
  }
  
  // Collect files
  console.log('Collecting files...');
  const files = getAllFiles('.');
  console.log(`Found ${files.length} files`);
  
  // Create blobs for each file
  console.log('Creating blobs...');
  const treeItems: any[] = [];
  let count = 0;
  
  for (const file of files) {
    try {
      const { data: blob } = await octokit.rest.git.createBlob({
        owner: user.login,
        repo: repoName,
        content: Buffer.from(file.content).toString('base64'),
        encoding: 'base64'
      });
      
      treeItems.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: blob.sha
      });
      count++;
      if (count % 50 === 0) {
        console.log(`  Created ${count}/${files.length} blobs...`);
      }
    } catch (e: any) {
      console.log(`  Skipped: ${file.path} (${e.message})`);
    }
  }
  console.log(`Created ${count} blobs`);
  
  // Create tree
  console.log('Creating tree...');
  const { data: tree } = await octokit.rest.git.createTree({
    owner: user.login,
    repo: repoName,
    tree: treeItems,
    base_tree: baseTreeSha
  });
  
  // Create commit
  console.log('Creating commit...');
  const { data: commit } = await octokit.rest.git.createCommit({
    owner: user.login,
    repo: repoName,
    message: 'Update: Connected DApps list with disconnect functionality\n\n- Auto-connect WalletConnect with selected wallet\n- Show connected DApps per wallet\n- Disconnect button for each DApp',
    tree: tree.sha,
    parents: baseSha ? [baseSha] : []
  });
  
  // Update ref
  console.log('Updating branch...');
  await octokit.rest.git.updateRef({
    owner: user.login,
    repo: repoName,
    ref: 'heads/main',
    sha: commit.sha,
    force: true
  });
  
  console.log(`\nSuccess! Code pushed to: https://github.com/${user.login}/${repoName}`);
  console.log(`Commit: ${commit.sha.substring(0, 7)}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
