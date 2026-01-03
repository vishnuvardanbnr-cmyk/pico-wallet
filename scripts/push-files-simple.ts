import { getUncachableGitHubClient } from '../server/github-client';
import * as fs from 'fs';

async function pushFiles() {
  const octokit = await getUncachableGitHubClient();
  const owner = 'vishnuvardanbnr-cmyk';
  const repo = 'vaultkey-wallet';
  
  const files = [
    { path: 'script/build.ts', localPath: 'script/build.ts' },
  ];
  
  for (const file of files) {
    const content = fs.readFileSync(file.localPath, 'utf-8');
    
    // Check if file exists
    let sha: string | undefined;
    try {
      const { data } = await octokit.repos.getContent({ owner, repo, path: file.path });
      if ('sha' in data) {
        sha = data.sha;
        console.log(`${file.path} exists, will update`);
      }
    } catch (e) {
      console.log(`${file.path} does not exist, will create`);
    }
    
    await octokit.repos.createOrUpdateFileContents({
      owner,
      repo,
      path: file.path,
      message: `Add ${file.path}`,
      content: Buffer.from(content).toString('base64'),
      sha: sha,
    });
    console.log(`Pushed ${file.path}`);
  }
  
  // Update workflow separately
  const workflow = `name: Build Android APK

on:
  push:
    branches: [main, master]
  workflow_dispatch:

jobs:
  build:
    runs-on: ubuntu-latest
    
    steps:
      - name: Checkout code
        uses: actions/checkout@v4

      - name: Setup Node.js
        uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Setup Java 21
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '21'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Install dependencies
        run: npm ci

      - name: Build web assets
        run: npm run build

      - name: Sync Capacitor
        run: npx cap sync android

      - name: Make gradlew executable
        run: chmod +x android/gradlew

      - name: Build Debug APK
        working-directory: android
        run: ./gradlew assembleDebug

      - name: Upload Debug APK
        uses: actions/upload-artifact@v4
        with:
          name: VaultKey-debug
          path: android/app/build/outputs/apk/debug/app-debug.apk
          retention-days: 30
`;

  // Get current workflow SHA
  let workflowSha: string | undefined;
  try {
    const { data } = await octokit.repos.getContent({ 
      owner, repo, path: '.github/workflows/android-build.yml' 
    });
    if ('sha' in data) {
      workflowSha = data.sha;
    }
  } catch (e) {
    console.log('Workflow file not found');
  }
  
  await octokit.repos.createOrUpdateFileContents({
    owner,
    repo,
    path: '.github/workflows/android-build.yml',
    message: 'Use npm run build (like V1)',
    content: Buffer.from(workflow).toString('base64'),
    sha: workflowSha,
  });
  console.log('Pushed workflow file');
}

pushFiles().catch(console.error);
