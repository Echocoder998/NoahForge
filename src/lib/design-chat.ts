import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { DesignOutput } from "./robots/design";
import type { ChatResult } from "./design-chat.server";

const ChatInput = z.object({
  messages: z
    .array(z.object({ role: z.enum(["user", "assistant"]), text: z.string().max(2000) }))
    .max(16),
  current: DesignOutput.nullable(),
  faults: z.array(z.string().max(300)).max(12),
});

export const designChat = createServerFn({ method: "POST" })
  .validator(ChatInput)
  .handler(async ({ data }): Promise<ChatResult> => {
    const { runDesignChat } = await import("./design-chat.server");
    return runDesignChat(data);
  });
