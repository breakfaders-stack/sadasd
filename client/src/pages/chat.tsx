import { useQuery, useMutation } from "@tanstack/react-query";
import { useParams, useLocation } from "wouter";
import { api, buildUrl } from "@shared/routes";
import { Conversation, Message, Personality } from "@shared/schema";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ChevronLeft, Send } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

type ConversationWithPersonality = Conversation & { personality: Personality | null };

export default function Chat() {
  const { id } = useParams<{ id: string }>();
  const [, setLocation] = useLocation();
  const [input, setInput] = useState("");
  const [streamingMessage, setStreamingMessage] = useState("");
  const [streamingStatus, setStreamingStatus] = useState("");
  const [isStreaming, setIsStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const { data: conversation } = useQuery<ConversationWithPersonality>({
    queryKey: [buildUrl(api.conversations.get.path, { id: Number(id) })],
  });

  const { data: messages = [], refetch: refetchMessages } = useQuery<Message[]>({
    queryKey: [buildUrl(api.conversations.getMessages.path, { id: Number(id) })],
  });

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, streamingMessage]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isStreaming) return;

    const userContent = input;
    setInput("");
    setIsStreaming(true);
    setStreamingMessage("");
    setStreamingStatus("");

    // Optimized: Optimistically update UI or just let refetch handle it after user msg is saved
    // For MVP with SSE, we'll let the server save user msg then stream AI
    
    const eventSource = new EventSource(`/api/conversations/${id}/stream?content=${encodeURIComponent(userContent)}`);
    
    eventSource.onmessage = (event) => {
      if (event.data === "[DONE]") {
        eventSource.close();
        setIsStreaming(false);
        setStreamingMessage("");
        setStreamingStatus("");
        refetchMessages();
        return;
      }

      try {
        const data = JSON.parse(event.data);
        if (data.type === "status") {
          setStreamingStatus(data.text);
        } else if (data.type === "content") {
          setStreamingStatus("");
          setStreamingMessage((prev) => prev + data.text);
        } else if (data.text && !data.type) { // Fallback for old format if any
          setStreamingMessage((prev) => prev + data.text);
        } else if (data.error) {
          console.error(data.error);
          setIsStreaming(false);
          eventSource.close();
        }
      } catch (err) {
        console.error("Error parsing SSE data", err);
      }
    };

    eventSource.onerror = (err) => {
      console.error("EventSource failed:", err);
      eventSource.close();
      setIsStreaming(false);
      refetchMessages();
    };
  };

  if (!conversation) return null;

  return (
    <div className="flex flex-col h-screen max-w-2xl mx-auto border-x bg-background">
      {/* Header */}
      <header className="flex items-center gap-4 p-4 border-b">
        <Button variant="ghost" size="icon" onClick={() => setLocation("/")}>
          <ChevronLeft className="h-6 w-6" />
        </Button>
        <Avatar className="h-10 w-10">
          <AvatarImage src={conversation.personality?.avatarUrl || ""} />
          <AvatarFallback>{conversation.personality?.name.substring(0, 2).toUpperCase()}</AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <h2 className="font-semibold truncate">{conversation.personality?.name}</h2>
          <p className="text-xs text-muted-foreground truncate">{conversation.personality?.description}</p>
        </div>
        <ThemeToggle />
      </header>

      {/* Messages */}
      <ScrollArea className="flex-1 p-4">
        <div className="space-y-4">
          {messages.map((message) => (
            <div
              key={message.id}
              className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                  message.role === "user"
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {message.content}
              </div>
            </div>
          ))}
          {streamingStatus && (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-2xl px-4 py-2 bg-muted/50 border border-muted-foreground/20 text-muted-foreground text-xs font-mono animate-in fade-in slide-in-from-left-2 duration-300">
                <span className="flex items-center gap-2">
                  <span className="h-1.5 w-1.5 rounded-full bg-primary animate-pulse" />
                  {streamingStatus}
                </span>
              </div>
            </div>
          )}
          {streamingMessage && (
            <div className="flex justify-start">
              <div className="max-w-[80%] rounded-2xl px-4 py-2 bg-muted text-muted-foreground">
                {streamingMessage}
              </div>
            </div>
          )}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>

      {/* Input */}
      <footer className="p-4 border-t">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder="Type a message..."
            className="rounded-full"
            disabled={isStreaming}
          />
          <Button type="submit" size="icon" className="rounded-full" disabled={isStreaming}>
            <Send className="h-5 w-5" />
          </Button>
        </form>
      </footer>
    </div>
  );
}
