"use client";

import { useEffect, useState } from "react";
import { useConfig } from "@/contexts/config-context";
import { useRepo } from "@/contexts/repo-context";
import { cn } from "@/lib/utils";
import { CheckCircle2, XCircle, Loader2, Clock, ExternalLink } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface CheckRun {
  id: number;
  name: string;
  status: string;
  conclusion: string | null;
  startedAt: string | null;
  completedAt: string | null;
  detailsUrl: string | null;
  htmlUrl: string;
}

interface CommitStatus {
  id: number;
  state: string;
  description: string | null;
  context: string;
  targetUrl: string | null;
  createdAt: string;
}

interface BuildStatusData {
  sha: string;
  overallStatus: string;
  overallConclusion: string;
  checkRuns: CheckRun[];
  commitStatuses: CommitStatus[];
  totalCount: number;
  permissionError?: boolean;
}

export function BuildStatus() {
  const { config } = useConfig();
  const { owner, repo } = useRepo();
  const [buildStatus, setBuildStatus] = useState<BuildStatusData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [failureCount, setFailureCount] = useState(0);

  useEffect(() => {
    if (!config?.branch) {
      console.log("[BuildStatus] No branch configured, skipping");
      return;
    }

    console.log("[BuildStatus] Starting status polling for", `${owner}/${repo}/${config.branch}`);
    let failures = 0;
    let isMounted = true;

    const fetchStatus = async () => {
      console.log(`[BuildStatus] Fetch attempt - failures: ${failures}, isMounted: ${isMounted}`);
      
      if (failures >= 3) {
        console.log("[BuildStatus] Max failures reached, stopping fetch");
        return;
      }
      
      try {
        if (buildStatus === null) {
          console.log("[BuildStatus] First load, setting loading state");
          setLoading(true);
        }
        setError(null);
        
        const url = `/api/${owner}/${repo}/${encodeURIComponent(config.branch)}/status`;
        console.log("[BuildStatus] Fetching:", url);
        
        const response = await fetch(url, { 
          signal: AbortSignal.timeout(10000) // 10 second timeout
        });
        
        console.log("[BuildStatus] Response status:", response.status, response.ok);
        
        if (!response.ok) {
          const errorText = await response.text().catch(() => "Unable to read response");
          console.error("[BuildStatus] Error response:", {
            status: response.status,
            statusText: response.statusText,
            body: errorText,
            failures: failures
          });
          
          failures = 999; // Stop polling immediately on any error
          throw new Error(`Failed to fetch build status: ${response.status}`);
        }
        
        const data = await response.json();
        console.log("[BuildStatus] Response data:", data);
        
        if (data.status === "success" && isMounted) {
          console.log("[BuildStatus] Success! Setting build status");
          setBuildStatus(data.data);
          failures = 0; // Reset on success
          
          // If there's a permission error, stop polling permanently
          if (data.data.permissionError) {
            console.warn("[BuildStatus] Permission error detected, stopping polling");
            failures = 999;
          }
        } else {
          throw new Error(data.message || "Failed to fetch build status");
        }
      } catch (err: any) {
        console.error("[BuildStatus] Fetch error:", {
          message: err.message,
          name: err.name,
          stack: err.stack,
          failures: failures,
          isMounted: isMounted
        });
        
        if (isMounted) {
          setError(err.message || "Network error");
          failures = Math.min(failures + 1, 999);
          console.log("[BuildStatus] Updated failure count to:", failures);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchStatus();

    // Poll for updates every 10 seconds
    const interval = setInterval(() => {
      console.log("[BuildStatus] Polling interval triggered");
      fetchStatus();
    }, 10000);

    return () => {
      console.log("[BuildStatus] Cleanup: stopping polling");
      isMounted = false;
      clearInterval(interval);
    };
  }, [config?.branch, owner, repo]);

  if (loading && !buildStatus) {
    return (
      <div className="px-3 py-2 border-b h-[72px]">
        <div className="flex items-center gap-2 rounded-lg border px-3 py-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading build status...</span>
        </div>
      </div>
    );
  }

  if (error || !buildStatus) {
    return <div className="h-[72px]" />; // Reserve space even when hidden
  }

  const getStatusIcon = () => {
    if (buildStatus.overallStatus === "pending") {
      return <Loader2 className="h-4 w-4 animate-spin text-yellow-600" />;
    }
    if (buildStatus.overallConclusion === "success") {
      return <CheckCircle2 className="h-4 w-4 text-green-600" />;
    }
    if (buildStatus.overallConclusion === "failure") {
      return <XCircle className="h-4 w-4 text-red-600" />;
    }
    return <Clock className="h-4 w-4 text-gray-600" />;
  };

  const formatDuration = (startedAt: string | null, completedAt: string | null) => {
    if (!startedAt || !completedAt) return null;
    const start = new Date(startedAt).getTime();
    const end = new Date(completedAt).getTime();
    const durationMs = end - start;
    const seconds = Math.floor(durationMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    
    if (minutes > 0) {
      return `${minutes}m ${remainingSeconds}s`;
    }
    return `${seconds}s`;
  };

  const formatTimeAgo = (timestamp: string | null) => {
    if (!timestamp) return null;
    const now = Date.now();
    const time = new Date(timestamp).getTime();
    const diffMs = now - time;
    const seconds = Math.floor(diffMs / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);
    
    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return `${seconds}s ago`;
  };

  const getMostRecentTimestamp = () => {
    const timestamps = buildStatus.checkRuns
      .map(run => run.completedAt || run.startedAt)
      .filter((t): t is string => t !== null);
    
    if (timestamps.length === 0) return null;
    return timestamps.sort((a, b) => new Date(b).getTime() - new Date(a).getTime())[0];
  };

  const getStatusText = () => {
    if (buildStatus.overallStatus === "pending") {
      return "Building...";
    }
    if (buildStatus.overallConclusion === "success") {
      return "Build passing";
    }
    if (buildStatus.overallConclusion === "failure") {
      return "Build failing";
    }
    return "No builds";
  };
  
  const getStatusSubtext = () => {
    const mostRecent = getMostRecentTimestamp();
    if (!mostRecent) return null;
    return formatTimeAgo(mostRecent);
  };

  const getStatusColor = () => {
    if (buildStatus.overallStatus === "pending") {
      return "border-yellow-600/30 bg-yellow-50 dark:bg-yellow-950/20";
    }
    if (buildStatus.overallConclusion === "success") {
      return "border-green-600/30 bg-green-50 dark:bg-green-950/20";
    }
    if (buildStatus.overallConclusion === "failure") {
      return "border-red-600/30 bg-red-50 dark:bg-red-950/20";
    }
    return "border-gray-600/30 bg-gray-50 dark:bg-gray-950/20";
  };

  const githubActionsUrl = `https://github.com/${owner}/${repo}/actions`;

  if (buildStatus.totalCount === 0 || buildStatus.permissionError) {
    return null; // Don't show anything if no checks or no permissions
  }

  return (
    <div className="px-3 py-2 border-b h-[72px]">
      <Tooltip>
        <TooltipTrigger asChild>
          <a
            href={githubActionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "flex items-center gap-2 rounded-lg border px-3 py-2 text-sm transition-colors hover:bg-accent",
              getStatusColor()
            )}
          >
            {getStatusIcon()}
            <div className="flex-1 min-w-0">
              <div className="font-medium truncate">{getStatusText()}</div>
              <div className="text-xs text-muted-foreground truncate">
                {getStatusSubtext() || `${buildStatus.checkRuns.length} check${buildStatus.checkRuns.length !== 1 ? 's' : ''}`}
              </div>
            </div>
            <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
          </a>
        </TooltipTrigger>
        <TooltipContent side="right" className="max-w-sm">
          <div className="space-y-2">
            <div className="font-semibold">Build Status</div>
            {buildStatus.checkRuns.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium">Checks:</div>
                {buildStatus.checkRuns.slice(0, 5).map((run) => {
                  const duration = formatDuration(run.startedAt, run.completedAt);
                  const timeInfo = run.status === "completed" 
                    ? duration 
                    : run.startedAt 
                      ? formatTimeAgo(run.startedAt)
                      : null;
                  
                  return (
                    <div key={run.id} className="flex items-start gap-2 text-xs">
                      <div className="mt-0.5">
                        {run.status === "completed" ? (
                          run.conclusion === "success" ? (
                            <CheckCircle2 className="h-3 w-3 text-green-600" />
                          ) : (
                            <XCircle className="h-3 w-3 text-red-600" />
                          )
                        ) : (
                          <Loader2 className="h-3 w-3 animate-spin text-yellow-600" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="truncate">{run.name}</div>
                        {timeInfo && (
                          <div className="text-muted-foreground truncate">
                            {run.status === "completed" ? `took ${timeInfo}` : `started ${timeInfo}`}
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {buildStatus.checkRuns.length > 5 && (
                  <div className="text-xs text-muted-foreground">
                    +{buildStatus.checkRuns.length - 5} more
                  </div>
                )}
              </div>
            )}
            {buildStatus.commitStatuses.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium">Statuses:</div>
                {buildStatus.commitStatuses.slice(0, 3).map((status) => (
                  <div key={status.id} className="flex items-center gap-2 text-xs">
                    {status.state === "success" ? (
                      <CheckCircle2 className="h-3 w-3 text-green-600" />
                    ) : status.state === "pending" ? (
                      <Clock className="h-3 w-3 text-yellow-600" />
                    ) : (
                      <XCircle className="h-3 w-3 text-red-600" />
                    )}
                    <span className="truncate">{status.context}</span>
                  </div>
                ))}
              </div>
            )}
            <div className="text-xs text-muted-foreground pt-1 border-t">
              Click to view details on GitHub
            </div>
          </div>
        </TooltipContent>
      </Tooltip>
    </div>
  );
}
