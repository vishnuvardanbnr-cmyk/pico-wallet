import { getUncachableGitHubClient } from '../server/github-client';

async function checkLogs() {
  const octokit = await getUncachableGitHubClient();
  const owner = 'vishnuvardanbnr-cmyk';
  const repo = 'vaultkey-wallet';
  
  const { data: runs } = await octokit.actions.listWorkflowRunsForRepo({
    owner, repo, per_page: 1
  });
  
  if (runs.workflow_runs.length > 0) {
    const run = runs.workflow_runs[0];
    console.log('Run status:', run.status, run.conclusion);
    
    const { data: jobs } = await octokit.actions.listJobsForWorkflowRun({
      owner, repo, run_id: run.id
    });
    
    for (const job of jobs.jobs) {
      console.log('Job:', job.name, job.status, job.conclusion);
      
      if (job.conclusion === 'failure') {
        const { data: logs } = await octokit.actions.downloadJobLogsForWorkflowRun({
          owner, repo, job_id: job.id
        });
        const lines = String(logs).split('\n');
        // Get last 80 lines
        console.log('\n=== Last 80 lines ===');
        console.log(lines.slice(-80).join('\n'));
      }
    }
  }
}

checkLogs().catch(console.error);
