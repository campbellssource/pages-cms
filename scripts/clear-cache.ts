/**
 * Script to clear the Pages CMS cache for a specific repository
 * Run with: npx tsx scripts/clear-cache.ts
 */

import { db } from "@/db";
import { eq, and } from "drizzle-orm";
import { cacheFileTable } from "@/db/schema";

const owner = "Flexible-Power-Systems";
const repo = "flexiblepowersystems.com";
const branch = "cms-fix";

async function clearCache() {
  console.log(`Clearing cache for ${owner}/${repo}/${branch}...`);
  
  const conditions = [
    eq(cacheFileTable.owner, owner.toLowerCase()),
    eq(cacheFileTable.repo, repo.toLowerCase()),
    eq(cacheFileTable.branch, branch)
  ];

  const result = await db.delete(cacheFileTable).where(and(...conditions));
  
  console.log("Cache cleared successfully!");
  console.log("The cache will be rebuilt on the next request to the CMS.");
  
  process.exit(0);
}

clearCache().catch((error) => {
  console.error("Error clearing cache:", error);
  process.exit(1);
});
