export const maxDuration = 30;

import { type NextRequest } from "next/server";
import { getAuth } from "@/lib/auth";
import { getToken } from "@/lib/token";
import { createOctokitInstance } from "@/lib/utils/octokit";

/**
 * Fetches GitHub Actions build status for a specific branch
 * 
 * GET /api/[owner]/[repo]/[branch]/status
 * 
 * Returns the combined status and individual check runs from GitHub Actions
 */
export async function GET(
  request: NextRequest,
  { params }: { params: { owner: string, repo: string, branch: string } }
) {
  try {
    const { user, session } = await getAuth();
    if (!session) return new Response(null, { status: 401 });

    const token = await getToken(user, params.owner, params.repo);
    if (!token) throw new Error("Token not found");

    const octokit = createOctokitInstance(token);

    // Get the latest commit SHA for the branch
    const branchData = await octokit.rest.repos.getBranch({
      owner: params.owner,
      repo: params.repo,
      branch: decodeURIComponent(params.branch),
    });

    const sha = branchData.data.commit.sha;

    // Fetch check runs for this commit
    const checkRunsResponse = await octokit.rest.checks.listForRef({
      owner: params.owner,
      repo: params.repo,
      ref: sha,
      per_page: 100,
    });

    // Fetch commit status (for services that use status API instead of checks)
    const statusResponse = await octokit.rest.repos.getCombinedStatusForRef({
      owner: params.owner,
      repo: params.repo,
      ref: sha,
    });

    // Determine overall status
    let overallStatus = "success";
    let overallConclusion = "success";

    // Check for any failing or pending check runs
    if (checkRunsResponse.data.check_runs.length > 0) {
      const checkRuns = checkRunsResponse.data.check_runs;
      
      const hasFailure = checkRuns.some(run => 
        run.conclusion === "failure" || run.conclusion === "cancelled" || run.conclusion === "timed_out"
      );
      const hasPending = checkRuns.some(run => 
        run.status === "queued" || run.status === "in_progress"
      );

      if (hasFailure) {
        overallStatus = "failure";
        overallConclusion = "failure";
      } else if (hasPending) {
        overallStatus = "pending";
        overallConclusion = "pending";
      }
    }

    // Also consider commit statuses
    if (statusResponse.data.state === "pending") {
      overallStatus = "pending";
      overallConclusion = "pending";
    } else if (statusResponse.data.state === "failure" || statusResponse.data.state === "error") {
      overallStatus = "failure";
      overallConclusion = "failure";
    }

    return Response.json({
      status: "success",
      data: {
        sha,
        overallStatus,
        overallConclusion,
        checkRuns: checkRunsResponse.data.check_runs.map(run => ({
          id: run.id,
          name: run.name,
          status: run.status,
          conclusion: run.conclusion,
          startedAt: run.started_at,
          completedAt: run.completed_at,
          detailsUrl: run.details_url,
          htmlUrl: run.html_url,
        })),
        commitStatuses: statusResponse.data.statuses.map(status => ({
          id: status.id,
          state: status.state,
          description: status.description,
          context: status.context,
          targetUrl: status.target_url,
          createdAt: status.created_at,
        })),
        totalCount: checkRunsResponse.data.total_count + statusResponse.data.statuses.length,
      },
    });
  } catch (error: any) {
    console.error("Error fetching build status:", {
      owner: params.owner,
      repo: params.repo,
      branch: params.branch,
      error: error.message,
      stack: error.stack,
    });
    return Response.json({
      status: "error",
      message: error.message || "Unknown error occurred",
      details: process.env.NODE_ENV === "development" ? error.stack : undefined,
    }, { status: 500 });
  }
}
