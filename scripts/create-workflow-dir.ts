// Create .github directory structure and upload workflow
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
  const owner = user.login;
  const repo = 'pico-hardware-wallet';
  
  console.log('Creating .github/FUNDING.yml placeholder first...');
  
  // First create a simple file to establish .github directory
  try {
    await octokit.rest.repos.createOrUpdateFileContents({
      owner, repo,
      path: '.github/FUNDING.yml',
      message: 'Add funding file',
      content: Buffer.from('# Funding\n').toString('base64')
    });
    console.log('Created .github/FUNDING.yml');
  } catch (e: any) {
    console.log('Funding file:', e.message?.slice(0, 50));
  }
  
  // Wait a moment
  await new Promise(r => setTimeout(r, 1000));
  
  // Now try workflow file
  console.log('Creating .github/workflows/android-build.yml...');
  const workflowContent = fs.readFileSync('.github/workflows/android-build.yml');
  
  try {
    await octokit.rest.repos.createOrUpdateFileContents({
      owner, repo,
      path: '.github/workflows/android-build.yml',
      message: 'Add Android build workflow',
      content: workflowContent.toString('base64')
    });
    console.log('Workflow uploaded successfully!');
  } catch (e: any) {
    console.log('Workflow error:', e.status, e.message?.slice(0, 100));
    
    // Check if it's a permissions issue
    if (e.status === 404 || e.status === 403) {
      console.log('\nThe GitHub integration may not have workflow write permissions.');
      console.log('You can manually add the workflow file by:');
      console.log('1. Go to https://github.com/' + owner + '/' + repo);
      console.log('2. Click "Add file" > "Create new file"');
      console.log('3. Name it: .github/workflows/android-build.yml');
      console.log('4. Copy the content from your local .github/workflows/android-build.yml');
    }
  }
  
  console.log('\nCheck: https://github.com/' + owner + '/' + repo + '/actions');
}

main().catch(e => console.error('Error:', e.message));
