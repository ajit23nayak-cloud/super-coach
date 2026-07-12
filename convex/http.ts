import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";
import { api } from "./_generated/api";

const http = httpRouter();

// POST your Gabit health data here. The HC Webhook app will hit this URL.
http.route({
  path: "/health",
  method: "POST",
  handler: httpAction(async (ctx, request) => {
    const payload = await request.json();
    await ctx.runMutation(api.health.record, { payload });
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }),
});

export default http;
