import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";

/**
 * Extension to make opencode-go provider use OPENCODEGO_API_KEY
 * instead of the default OPENCODE_API_KEY.
 *
 * Place this file in ~/.pi/agent/extensions/ to auto-load,
 * or use: pi -e ./opencode-go-api-key.ts
 */
export default function (pi: ExtensionAPI) {
  // Set the runtime API key from OPENCODEGO_API_KEY env var on session start
  pi.on("session_start", async (_event, ctx: ExtensionContext) => {
    const apiKey = process.env.OPENCODEGO_API_KEY;
    if (apiKey) {
      ctx.modelRegistry.authStorage.setRuntimeApiKey("opencode-go", apiKey);
    }
  });
}
