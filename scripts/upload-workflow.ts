// Upload GitHub Actions workflow file
import { Octokit } from '@octokit/rest';
import * as fs from 'fs';

async function main() {
  const hostname = process.env.REPLIT_CONNECTORS_HOSTNAME;
  const xReplitToken = process.env.REPL_IDENTITY 
    ? 'repl ' + process.env.REPL_IDENTITY 
    : process.env.WEB_REPL_RENEWAL 
    ? 'depl ' + process.env.WEB_REPL_RENEWAL 
    : null;

  const res = await fetch(
    'https://' + hostname + '/api/v2/connection?include_secrets=true&connector_names=github',
    { headers: { 'Accept': 'application/json', 'X_REPLIT_TOKEN': xReplitToken! } }
  );
  const data = await res.json();
  const conn = data.items?.[0];
  const token = conn?.settings?.access_token || conn?.settings?.oauth?.credentials?.access_token;
  
  const octokit = new Octokit({ auth: token });
  const { data: user } = await octokit.rest.users.getAuthenticated();
  
  const content = fs.readFileSync('.github/workflows/android-build.yml');
  
  console.log('Uploading workflow to', user.login + '/pico-hardware-wallet');
  
  await octokit.rest.repos.createOrUpdateFileContents({
    owner: user.login,
    repo: 'pico-hardware-wallet',
    path: '.github/workflows/android-build.yml',
    message: 'Add Android build workflow',
    content: content.toString('base64')
  });
  
  console.log('Done! https://github.com/' + user.login + '/pico-hardware-wallet/actions');
}

main().catch(e => console.error('Error:', e.message));
