// GitHub Sync Script - Uses GitHub API to push files directly
import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
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
    throw new Error('X_REPLIT_TOKEN not found');
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

async function getGitHubClient() {
  const accessToken = await getAccessToken();
  return new Octokit({ auth: accessToken });
}

// Get all tracked files from git
function getTrackedFiles(): string[] {
  const output = execSync('git ls-files', { encoding: 'utf-8' });
  return output.trim().split('\n').filter(f => f.length > 0);
}

async function main() {
  const repoName = process.argv[2] || 'pico-hardware-wallet';
  
  console.log('Connecting to GitHub...');
  const octokit = await getGitHubClient();
  
  const { data: user } = await octokit.rest.users.getAuthenticated();
  const owner = user.login;
  console.log(`Authenticated as: ${owner}`);
  
  // Ensure repo exists
  try {
    await octokit.rest.repos.get({ owner, repo: repoName });
    console.log(`Repository ${owner}/${repoName} exists`);
  } catch (error: any) {
    if (error.status === 404) {
      console.log(`Creating repository ${owner}/${repoName}...`);
      await octokit.rest.repos.createForAuthenticatedUser({
        name: repoName,
        description: 'Multi-chain cryptocurrency hardware wallet application',
        private: false,
        auto_init: true
      });
      // Wait for repo to be ready
      await new Promise(r => setTimeout(r, 2000));
    } else {
      throw error;
    }
  }

  // Get tracked files
  const files = getTrackedFiles();
  console.log(`Found ${files.length} tracked files`);

  // Create tree entries
  const treeEntries: any[] = [];
  
  for (const filePath of files) {
    try {
      const content = fs.readFileSync(filePath);
      const { data: blob } = await octokit.rest.git.createBlob({
        owner,
        repo: repoName,
        content: content.toString('base64'),
        encoding: 'base64'
      });
      
      treeEntries.push({
        path: filePath,
        mode: '100644',
        type: 'blob',
        sha: blob.sha
      });
      
      process.stdout.write('.');
    } catch (e) {
      // Skip files that can't be read
    }
  }
  
  console.log(`\nCreated ${treeEntries.length} blobs`);

  // Get or create base commit
  let baseSha: string | undefined;
  try {
    const { data: ref } = await octokit.rest.git.getRef({
      owner,
      repo: repoName,
      ref: 'heads/main'
    });
    baseSha = ref.object.sha;
  } catch (e) {
    // No main branch yet
  }

  // Create tree
  console.log('Creating tree...');
  const { data: tree } = await octokit.rest.git.createTree({
    owner,
    repo: repoName,
    tree: treeEntries,
    base_tree: baseSha
  });

  // Create commit
  console.log('Creating commit...');
  const commitMessage = execSync('git log -1 --format=%s', { encoding: 'utf-8' }).trim();
  const { data: commit } = await octokit.rest.git.createCommit({
    owner,
    repo: repoName,
    message: commitMessage || 'Sync from Replit',
    tree: tree.sha,
    parents: baseSha ? [baseSha] : []
  });

  // Update ref
  console.log('Updating branch...');
  try {
    await octokit.rest.git.updateRef({
      owner,
      repo: repoName,
      ref: 'heads/main',
      sha: commit.sha,
      force: true
    });
  } catch (e) {
    await octokit.rest.git.createRef({
      owner,
      repo: repoName,
      ref: 'refs/heads/main',
      sha: commit.sha
    });
  }

  console.log(`\nSuccess! https://github.com/${owner}/${repoName}`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
