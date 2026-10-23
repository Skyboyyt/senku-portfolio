import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// Pages are rendered per request; no incremental cache is needed.
export default defineCloudflareConfig();
