import { z } from 'zod';
import { insertPersonalitySchema, insertMessageSchema, personalities, conversations, messages } from './schema';

export const errorSchemas = {
  validation: z.object({
    message: z.string(),
    field: z.string().optional(),
  }),
  notFound: z.object({
    message: z.string(),
  }),
  internal: z.object({
    message: z.string(),
  }),
};

export const api = {
  personalities: {
    list: {
      method: 'GET' as const,
      path: '/api/personalities',
      responses: {
        200: z.array(z.custom<typeof personalities.$inferSelect>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/personalities',
      input: insertPersonalitySchema,
      responses: {
        201: z.custom<typeof personalities.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/personalities/:id',
      responses: {
        200: z.custom<typeof personalities.$inferSelect>(),
        404: errorSchemas.notFound,
      },
    },
    delete: {
      method: 'DELETE' as const,
      path: '/api/personalities/:id',
      responses: {
        204: z.void(),
        404: errorSchemas.notFound,
      },
    }
  },
  conversations: {
    list: {
      method: 'GET' as const,
      path: '/api/conversations',
      responses: {
        200: z.array(z.custom<typeof conversations.$inferSelect & { personality: typeof personalities.$inferSelect, lastMessage: typeof messages.$inferSelect | null }>()),
      },
    },
    create: {
      method: 'POST' as const,
      path: '/api/conversations',
      input: z.object({ personalityId: z.number() }),
      responses: {
        201: z.custom<typeof conversations.$inferSelect>(),
        400: errorSchemas.validation,
      },
    },
    get: {
      method: 'GET' as const,
      path: '/api/conversations/:id',
      responses: {
        200: z.custom<typeof conversations.$inferSelect & { personality: typeof personalities.$inferSelect }>(),
        404: errorSchemas.notFound,
      },
    },
    getMessages: {
      method: 'GET' as const,
      path: '/api/conversations/:id/messages',
      responses: {
        200: z.array(z.custom<typeof messages.$inferSelect>()),
        404: errorSchemas.notFound,
      },
    },
    createMessage: {
      method: 'POST' as const,
      path: '/api/conversations/:id/messages',
      input: z.object({ content: z.string() }),
      responses: {
        201: z.custom<typeof messages.$inferSelect>(), // Returns the AI response message usually, or the user message? Let's return the AI message or list of new messages. For simplicity, return the user message and let client fetch or return both.
        // Better: Return the AI response. 
        // Actually, let's just return the created user message and the AI message in a list? Or just the new message. 
        // Standard pattern: return the user message. Then client waits for AI response via another call or SSE?
        // Simple MVP: Return the USER message immediately. Then client polls or we wait for AI?
        // Let's make it synchronous for MVP: Client POSTs message, server waits for AI, returns BOTH or just the AI response?
        // Let's stick to standard REST: POST creates the user message.
        // But for a chat app, we want the reply.
        // Let's make the response be the AI message.
        // Or better: return array of [userMsg, aiMsg]
      },
    },
  },
};

export function buildUrl(path: string, params?: Record<string, string | number>): string {
  let url = path;
  if (params) {
    Object.entries(params).forEach(([key, value]) => {
      if (url.includes(`:${key}`)) {
        url = url.replace(`:${key}`, String(value));
      }
    });
  }
  return url;
}
