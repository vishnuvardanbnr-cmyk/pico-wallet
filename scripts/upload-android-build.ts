// Upload Android build files to GitHub
import { Octokit } from '@octokit/rest';
import { execSync } from 'child_process';
import * as fs from 'fs';
import * as path from 'path';

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

function getAllFiles(dir: string, fileList: string[] = []): string[] {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const filePath = path.join(dir, file);
    if (fs.statSync(filePath).isDirectory()) {
      getAllFiles(filePath, fileList);
    } else {
      fileList.push(filePath);
    }
  }
  return fileList;
}

async function uploadFile(octokit: Octokit, owner: string, repo: string, filePath: string) {
  try {
    const content = fs.readFileSync(filePath);
    
    let sha: string | undefined;
    try {
      const { data } = await octokit.rest.repos.getContent({ owner, repo, path: filePath });
      sha = (data as any).sha;
    } catch (e) {}

    await octokit.rest.repos.createOrUpdateFileContents({
      owner, repo, path: filePath,
      message: `Add ${filePath}`,
      content: content.toString('base64'),
      sha
    });
    console.log(`Uploaded ${filePath}`);
    return true;
  } catch (e: any) {
    console.log(`Failed ${filePath}: ${e.message?.slice(0, 60)}`);
    return false;
  }
}

async function main() {
  const repoName = 'pico-hardware-wallet';
  const token = await getAccessToken();
  const octokit = new Octokit({ auth: token });
  
  const { data: user } = await octokit.rest.users.getAuthenticated();
  const owner = user.login;
  console.log(`Uploading Android build files to ${owner}/${repoName}\n`);

  // Files needed for Android build
  const criticalFiles = [
    '.github/workflows/android-build.yml',
    'capacitor.config.ts',
    'android/build.gradle',
    'android/settings.gradle',
    'android/gradle.properties',
    'android/variables.gradle',
    'android/capacitor.settings.gradle',
    'android/gradlew',
    'android/gradlew.bat',
  ];

  // Upload critical files first
  for (const filePath of criticalFiles) {
    if (fs.existsSync(filePath)) {
      await uploadFile(octokit, owner, repoName, filePath);
      await new Promise(r => setTimeout(r, 300)); // Rate limit
    }
  }

  // Get Android app and gradle files
  const androidDirs = ['android/app', 'android/gradle'];
  for (const dir of androidDirs) {
    if (fs.existsSync(dir)) {
      const files = getAllFiles(dir).filter(f => 
        !f.includes('/build/') && 
        !f.includes('.gradle/') &&
        !f.endsWith('.apk')
      );
      
      for (const filePath of files) {
        await uploadFile(octokit, owner, repoName, filePath);
        await new Promise(r => setTimeout(r, 200));
      }
    }
  }

  console.log(`\nDone! Check: https://github.com/${owner}/${repoName}/actions`);
}

main().catch(e => console.error(e.message));
