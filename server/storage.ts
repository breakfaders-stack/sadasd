import { db } from "./db";
import {
  personalities, conversations, messages,
  type Personality, type InsertPersonality,
  type Conversation,
  type Message, type InsertMessage
} from "@shared/schema";
import { eq, desc } from "drizzle-orm";

export interface IStorage {
  // Personalities
  getAllPersonalities(): Promise<Personality[]>;
  getPersonality(id: number): Promise<Personality | undefined>;
  createPersonality(personality: InsertPersonality): Promise<Personality>;
  deletePersonality(id: number): Promise<void>;

  // Conversations
  createConversation(personalityId: number): Promise<Conversation>;
  getConversations(): Promise<(Conversation & { personality: Personality | null, lastMessage: Message | null })[]>;
  getConversation(id: number): Promise<(Conversation & { personality: Personality | null }) | undefined>;
  
  // Messages
  getMessages(conversationId: number): Promise<Message[]>;
  createMessage(message: InsertMessage): Promise<Message>;
}

export class DatabaseStorage implements IStorage {
  async getAllPersonalities(): Promise<Personality[]> {
    return await db.select().from(personalities);
  }

  async getPersonality(id: number): Promise<Personality | undefined> {
    const [personality] = await db.select().from(personalities).where(eq(personalities.id, id));
    return personality;
  }

  async createPersonality(personality: InsertPersonality): Promise<Personality> {
    const [newPersonality] = await db.insert(personalities).values(personality).returning();
    return newPersonality;
  }

  async deletePersonality(id: number): Promise<void> {
    await db.delete(personalities).where(eq(personalities.id, id));
  }

  async createConversation(personalityId: number): Promise<Conversation> {
    const [conversation] = await db.insert(conversations).values({ personalityId }).returning();
    return conversation;
  }

  async getConversations(): Promise<(Conversation & { personality: Personality | null, lastMessage: Message | null })[]> {
    // Ideally use a join, but for MVP separate queries or basic join
    const convs = await db.select().from(conversations).orderBy(desc(conversations.updatedAt));
    
    // Enrich with personality and last message
    // This is N+1 but fine for MVP with small data
    const results = await Promise.all(convs.map(async (conv) => {
      const [personality] = conv.personalityId 
        ? await db.select().from(personalities).where(eq(personalities.id, conv.personalityId))
        : [null];
      
      const [lastMessage] = await db.select().from(messages)
        .where(eq(messages.conversationId, conv.id))
        .orderBy(desc(messages.createdAt))
        .limit(1);

      return { ...conv, personality: personality || null, lastMessage: lastMessage || null };
    }));

    return results;
  }

  async getConversation(id: number): Promise<(Conversation & { personality: Personality | null }) | undefined> {
    const [conv] = await db.select().from(conversations).where(eq(conversations.id, id));
    if (!conv) return undefined;

    const [personality] = conv.personalityId 
      ? await db.select().from(personalities).where(eq(personalities.id, conv.personalityId))
      : [null];

    return { ...conv, personality: personality || null };
  }

  async getMessages(conversationId: number): Promise<Message[]> {
    return await db.select().from(messages)
      .where(eq(messages.conversationId, conversationId))
      .orderBy(messages.createdAt);
  }

  async createMessage(message: InsertMessage): Promise<Message> {
    const [newMessage] = await db.insert(messages).values(message).returning();
    // Update conversation timestamp
    if (message.conversationId) {
        await db.update(conversations)
            .set({ updatedAt: new Date() })
            .where(eq(conversations.id, message.conversationId));
    }
    return newMessage;
  }
}

export const storage = new DatabaseStorage();
