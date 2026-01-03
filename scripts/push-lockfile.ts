import { getUncachableGitHubClient } from '../server/github-client';
import * as fs from 'fs';

(async () => {
  const octokit = await getUncachableGitHubClient();
  const owner = 'vishnuvardanbnr-cmyk';
  const repo = 'vaultkey-wallet';
  
  console.log('Getting latest commit...');
  const { data: ref } = await octokit.git.getRef({ owner, repo, ref: 'heads/main' });
  const latestCommitSha = ref.object.sha;
  
  const { data: latestCommit } = await octokit.git.getCommit({ owner, repo, commit_sha: latestCommitSha });
  
  console.log('Reading package-lock.json...');
  const content = fs.readFileSync('package-lock.json');
  
  console.log('Creating blob...');
  const { data: blob } = await octokit.git.createBlob({
    owner, repo,
    content: content.toString('base64'),
    encoding: 'base64'
  });
  
  console.log('Creating tree...');
  const { data: tree } = await octokit.git.createTree({
    owner, repo,
    base_tree: latestCommit.tree.sha,
    tree: [{
      path: 'package-lock.json',
      mode: '100644' as const,
      type: 'blob' as const,
      sha: blob.sha
    }]
  });
  
  console.log('Creating commit...');
  const { data: commit } = await octokit.git.createCommit({
    owner, repo,
    message: 'Add package-lock.json for npm ci',
    tree: tree.sha,
    parents: [latestCommitSha]
  });
  
  console.log('Updating main branch...');
  await octokit.git.updateRef({
    owner, repo,
    ref: 'heads/main',
    sha: commit.sha
  });
  
  console.log('Done! package-lock.json pushed. Build will restart automatically.');
})().catch(console.error);
