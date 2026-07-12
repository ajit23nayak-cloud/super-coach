import { mutation } from "./_generated/server";
import { v } from "convex/values";

// Stores one incoming health reading (the whole webhook payload, as-is).
export const record = mutation({
  args: { payload: v.any() },
  handler: async (ctx, args) => {
    await ctx.db.insert("healthReadings", {
      receivedAt: Date.now(),
      payload: args.payload,
    });
  },
});
