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
  const ignoreFiles = ['.replit', 'replit.nix', '.gitignore'];
  
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
  
  // Check if repo exists
  let repoExists = false;
  
  try {
    await octokit.rest.repos.get({ owner: user.login, repo: repoName });
    repoExists = true;
    console.log('Repository exists');
  } catch (e) {
    console.log('Repository does not exist, will create');
  }
  
  // Create repo if it doesn't exist
  if (!repoExists) {
    console.log(`Creating repository ${user.login}/${repoName}...`);
    await octokit.rest.repos.createForAuthenticatedUser({
      name: repoName,
      description: 'Multi-chain cryptocurrency hardware wallet application',
      private: false,
      auto_init: true
    });
    console.log('Repository created');
    await sleep(3000);
  }
  
  // Collect files
  console.log('Collecting files...');
  const files = getAllFiles('.');
  console.log(`Found ${files.length} files to upload`);

  // Upload files using Contents API (works with limited permissions)
  console.log('Uploading files...');
  let uploaded = 0;
  let errors = 0;
  
  for (const file of files) {
    try {
      // Check if file exists
      let existingSha: string | undefined;
      try {
        const { data: existing } = await octokit.rest.repos.getContent({
          owner: user.login,
          repo: repoName,
          path: file.path
        });
        if ('sha' in existing) {
          existingSha = existing.sha;
        }
      } catch (e) {
        // File doesn't exist yet
      }
      
      // Create or update file
      await octokit.rest.repos.createOrUpdateFileContents({
        owner: user.login,
        repo: repoName,
        path: file.path,
        message: `Update ${file.path}`,
        content: Buffer.from(file.content).toString('base64'),
        sha: existingSha
      });
      
      uploaded++;
      if (uploaded % 20 === 0) {
        console.log(`  Uploaded ${uploaded}/${files.length} files...`);
      }
    } catch (e: any) {
      errors++;
      console.log(`  Error uploading ${file.path}: ${e.message}`);
    }
  }
  
  console.log(`\nUpload complete: ${uploaded} files uploaded, ${errors} errors`);
  console.log(`\nCode pushed to: https://github.com/${user.login}/${repoName}`);
  console.log(`\nGitHub Actions will now build the APK.`);
  console.log(`Check: https://github.com/${user.login}/${repoName}/actions`);
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
