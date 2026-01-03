import { getUncachableGitHubClient } from '../server/github-client';
import * as fs from 'fs';

async function pushBuildConfig() {
  const octokit = await getUncachableGitHubClient();
  const owner = 'vishnuvardanbnr-cmyk';
  const repo = 'vaultkey-wallet';
  
  const { data: ref } = await octokit.git.getRef({ owner, repo, ref: 'heads/main' });
  const latestCommitSha = ref.object.sha;
  const { data: latestCommit } = await octokit.git.getCommit({ owner, repo, commit_sha: latestCommitSha });
  
  const buildTs = fs.readFileSync('script/build.ts', 'utf-8');
  
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
  
  const { data: buildBlob } = await octokit.git.createBlob({
    owner, repo, content: Buffer.from(buildTs).toString('base64'), encoding: 'base64'
  });
  const { data: workflowBlob } = await octokit.git.createBlob({
    owner, repo, content: Buffer.from(workflow).toString('base64'), encoding: 'base64'
  });
  
  const { data: tree } = await octokit.git.createTree({
    owner, repo,
    base_tree: latestCommit.tree.sha,
    tree: [
      { path: 'script/build.ts', mode: '100644', type: 'blob', sha: buildBlob.sha },
      { path: '.github/workflows/android-build.yml', mode: '100644', type: 'blob', sha: workflowBlob.sha }
    ]
  });
  
  const { data: commit } = await octokit.git.createCommit({
    owner, repo,
    message: 'Use npm run build (like V1) instead of CI-specific script',
    tree: tree.sha,
    parents: [latestCommitSha]
  });
  
  await octokit.git.updateRef({ owner, repo, ref: 'heads/main', sha: commit.sha });
  console.log('Pushed script/build.ts and updated workflow!');
}

pushBuildConfig().catch(console.error);
