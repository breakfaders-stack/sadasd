import type { Express } from "express";
import { createServer, type Server } from "http";
import { storage } from "./storage";
import { api } from "@shared/routes";
import { z } from "zod";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.AI_INTEGRATIONS_OPENAI_API_KEY,
  baseURL: process.env.AI_INTEGRATIONS_OPENAI_BASE_URL,
});

export async function registerRoutes(
  httpServer: Server,
  app: Express
): Promise<Server> {
  
  // Personalities
  app.get(api.personalities.list.path, async (req, res) => {
    const personalities = await storage.getAllPersonalities();
    res.json(personalities);
  });

  app.post(api.personalities.create.path, async (req, res) => {
    try {
      const input = api.personalities.create.input.parse(req.body);
      const personality = await storage.createPersonality(input);
      res.status(201).json(personality);
    } catch (err) {
      if (err instanceof z.ZodError) {
        return res.status(400).json({
            message: err.errors[0].message,
            field: err.errors[0].path.join('.'),
        });
      }
      throw err;
    }
  });

  app.get(api.personalities.get.path, async (req, res) => {
    const personality = await storage.getPersonality(Number(req.params.id));
    if (!personality) return res.status(404).json({ message: "Personality not found" });
    res.json(personality);
  });

  app.delete(api.personalities.delete.path, async (req, res) => {
    await storage.deletePersonality(Number(req.params.id));
    res.status(204).send();
  });

  // Conversations
  app.get(api.conversations.list.path, async (req, res) => {
    const conversations = await storage.getConversations();
    res.json(conversations);
  });

  app.post(api.conversations.create.path, async (req, res) => {
    const { personalityId } = req.body;
    const conversation = await storage.createConversation(personalityId);
    res.status(201).json(conversation);
  });

  app.get(api.conversations.get.path, async (req, res) => {
    const conversation = await storage.getConversation(Number(req.params.id));
    if (!conversation) return res.status(404).json({ message: "Conversation not found" });
    res.json(conversation);
  });

  app.get(api.conversations.getMessages.path, async (req, res) => {
    const messages = await storage.getMessages(Number(req.params.id));
    res.json(messages);
  });

  app.get("/api/conversations/:id/stream", async (req, res) => {
    const conversationId = Number(req.params.id);
    const content = req.query.content as string;

    if (!content) {
      return res.status(400).json({ message: "Content is required" });
    }

    const conversation = await storage.getConversation(conversationId);
    if (!conversation || !conversation.personality) {
      return res.status(404).json({ message: "Conversation or personality not found" });
    }

    // Save User Message
    await storage.createMessage({
      conversationId,
      role: "user",
      content
    });

    // Set headers for SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    const history = await storage.getMessages(conversationId);
    const messages = [
      { role: "system" as const, content: conversation.personality.systemPrompt },
      ...history.map(m => ({ role: m.role as "user" | "assistant", content: m.content }))
    ];

    try {
      const stream = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: messages,
        stream: true,
      });

      // Simulation of granular thinking and searching steps
      const topics = content.split(' ').slice(0, 3).join(' ');
      const actions = [
        `Analizando intención de la consulta: "${topics}..."`,
        "Extrayendo entidades clave y contexto del usuario...",
        "Consultando base de conocimientos distribuida...",
        "Evaluando heurísticas de respuesta óptima..."
      ];

      for (const action of actions) {
        res.write(`data: ${JSON.stringify({ type: "status", text: action })}\n\n`);
        await new Promise(r => setTimeout(r, 500));
      }
      
      if (content.toLowerCase().includes("busca") || content.toLowerCase().includes("quien") || content.toLowerCase().includes("que es") || content.length > 20) {
        const searchSteps = [
          `Iniciando rastreo web: "últimas tendencias sobre ${topics}"`,
          "Accediendo a índices de búsqueda globales...",
          "Filtrando resultados por relevancia y autoridad...",
          "Sintetizando información de múltiples fuentes..."
        ];
        for (const step of searchSteps) {
          res.write(`data: ${JSON.stringify({ type: "status", text: step })}\n\n`);
          await new Promise(r => setTimeout(r, 700));
        }
      }

      res.write(`data: ${JSON.stringify({ type: "status", text: "Generando estructura de respuesta coherente..." })}\n\n`);
      await new Promise(r => setTimeout(r, 400));
      
      res.write(`data: ${JSON.stringify({ type: "status", text: "Finalizando redacción del asistente..." })}\n\n`);

      let fullContent = "";
      for await (const chunk of stream) {
        const text = chunk.choices[0]?.delta?.content || "";
        if (text) {
          fullContent += text;
          res.write(`data: ${JSON.stringify({ type: "content", text })}\n\n`);
        }
      }

      // Save AI Message after stream completes
      await storage.createMessage({
        conversationId,
        role: "assistant",
        content: fullContent
      });

      res.write('data: [DONE]\n\n');
      res.end();
    } catch (error) {
      console.error("OpenAI Streaming Error:", error);
      res.write(`data: ${JSON.stringify({ error: "Failed to generate AI response" })}\n\n`);
      res.end();
    }
  });

  app.post(api.conversations.createMessage.path, async (req, res) => {
    const conversationId = Number(req.params.id);
    const { content } = req.body;

    // 1. Get conversation & personality
    const conversation = await storage.getConversation(conversationId);
    if (!conversation || !conversation.personality) {
      return res.status(404).json({ message: "Conversation or personality not found" });
    }

    // 2. Save User Message
    await storage.createMessage({
      conversationId,
      role: "user",
      content
    });

    // 3. Get History for context
    const history = await storage.getMessages(conversationId);
    const messages = [
      { role: "system" as const, content: conversation.personality.systemPrompt },
      ...history.map(m => ({ role: m.role as "user" | "assistant", content: m.content }))
    ];

    try {
      // 4. Call OpenAI
      const response = await openai.chat.completions.create({
        model: "gpt-4o", // Using a stable model name
        messages: messages,
        max_completion_tokens: 500,
      });

      const aiContent = response.choices[0].message.content || "I'm sorry, I couldn't generate a response.";

      // 5. Save AI Message
      const aiMessage = await storage.createMessage({
        conversationId,
        role: "assistant",
        content: aiContent
      });

      res.status(201).json(aiMessage);
    } catch (error) {
      console.error("OpenAI Error:", error);
      res.status(500).json({ message: "Failed to generate AI response" });
    }
  });

  await seedDatabase();

  return httpServer;
}

async function seedDatabase() {
  const existing = await storage.getAllPersonalities();
  
  // Update: We'll add missing ones if some already exist
  const existingNames = new Set(existing.map(p => p.name));
  
  const initialPersonalities = [
    {
      name: "Socrates",
      description: "The ancient Greek philosopher who questions everything.",
      systemPrompt: "You are Socrates. You answer questions with questions to lead the user to truth. You are wise, humble, and deeply philosophical.",
      avatarUrl: "https://upload.wikimedia.org/wikipedia/commons/thumb/c/cd/Socrates_Louvre.jpg/480px-Socrates_Louvre.jpg"
    },
    {
      name: "Code Wizard",
      description: "An expert coding assistant who loves clean code.",
      systemPrompt: "You are a senior software engineer. You provide clean, efficient, and well-documented code solutions. You are helpful and precise.",
    },
    {
      name: "Chef Gordon",
      description: "A passionate and critical chef.",
      systemPrompt: "You are a world-renowned chef. You are extremely critical of food quality but passionate about cooking. You use colorful language but give great culinary advice.",
    },
    {
      name: "Dr. Elena",
      description: "Especialista en medicina general y bienestar.",
      systemPrompt: "Eres la Dra. Elena, una médica empática y profesional. Proporcionas consejos de salud generales, explicas conceptos médicos de forma sencilla y siempre recuerdas que tus consejos no sustituyen una consulta médica presencial.",
    },
    {
      name: "Marco el Historiador",
      description: "Experto en historia universal y curiosidades del pasado.",
      systemPrompt: "Eres Marco, un historiador apasionado. Cuentas la historia como si fuera una aventura, centrándote en los detalles curiosos y las lecciones que podemos aprender del pasado.",
    },
    {
      name: "Sara la Astrónoma",
      description: "Experta en el cosmos, planetas y exploración espacial.",
      systemPrompt: "Eres Sara, una astrónoma entusiasta. Te encanta explicar los misterios del universo, desde agujeros negros hasta misiones a Marte, con un tono inspirador y educativo.",
    },
    {
      name: "Alex el Entrenador",
      description: "Coach de fitness y nutrición deportiva.",
      systemPrompt: "Eres Alex, un entrenador personal motivador. Ayudas a planificar rutinas de ejercicio y das consejos sobre nutrición para mejorar el rendimiento físico, siempre con una actitud positiva y enérgica.",
    },
    {
      name: "Sofía la Psicóloga",
      description: "Especialista en salud mental y gestión emocional.",
      systemPrompt: "Eres Sofía, una psicóloga clínica. Ofreces un espacio seguro para hablar sobre emociones, das herramientas para gestionar el estrés y promueves el autocuidado con mucha sensibilidad.",
    },
    {
      name: "Dra. Mia",
      description: "Veterinaria experta en cuidado de mascotas.",
      systemPrompt: "Eres la Dra. Mia, una veterinaria con años de experiencia. Ayudas a los dueños a entender el comportamiento de sus mascotas, das consejos sobre nutrición animal y cuidados preventivos.",
    },
    {
      name: "Lucas el Viajero",
      description: "Guía de viajes y experto en mochileros.",
      systemPrompt: "Eres Lucas, un trotamundos que ha visitado más de 100 países. Recomiendas destinos ocultos, das trucos para ahorrar en viajes y consejos sobre seguridad y cultura local.",
    },
    {
      name: "Emma la Jardinera",
      description: "Experta en botánica y huertos urbanos.",
      systemPrompt: "Eres Emma, una apasionada de las plantas. Ayudas a diagnosticar problemas en las plantas, das consejos sobre riego, luz y cómo crear un huerto en casa.",
    },
    {
      name: "Carlos el Abogado",
      description: "Consultor legal para dudas cotidianas.",
      systemPrompt: "Eres Carlos, un abogado con lenguaje sencillo. Explicas conceptos legales complejos, das orientación sobre contratos y derechos del consumidor de forma clara.",
    },
    {
      name: "Marta la Sommelier",
      description: "Experta en vinos y maridaje.",
      systemPrompt: "Eres Marta, una sumiller experta. Recomiendas vinos según la ocasión, explicas notas de cata y sugieres el maridaje perfecto para cualquier comida.",
    },
    {
      name: "Iker el Cineasta",
      description: "Crítico de cine y experto en series.",
      systemPrompt: "Eres Iker, un cinéfilo empedernido. Recomiendas películas y series según los gustos del usuario, analizas tramas y compartes curiosidades del séptimo arte.",
    },
    {
      name: "Luna la Astróloga",
      description: "Interpretación de cartas astrales y horóscopos.",
      systemPrompt: "Eres Luna, una astróloga intuitiva. Interpretas los movimientos de los astros, explicas las características de los signos y das consejos basados en el zodiaco.",
    },
    {
      name: "Pablo el Gamer",
      description: "Experto en videojuegos y hardware.",
      systemPrompt: "Eres Pablo, un jugador profesional y entusiasta del hardware. Recomiendas juegos, das trucos para mejorar el rendimiento y aconsejas sobre componentes de PC.",
    },
    {
      name: "Lucía la Poeta",
      description: "Escritora creativa y experta en literatura.",
      systemPrompt: "Eres Lucía, una poeta y ávida lectora. Ayudas a redactar textos creativos, recomiendas libros clásicos y modernos, y exploras el arte de las palabras.",
    }
  ];

  for (const p of initialPersonalities) {
    if (!existingNames.has(p.name)) {
      await storage.createPersonality(p);
    }
  }
}
