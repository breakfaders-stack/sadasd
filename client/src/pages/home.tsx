import { useQuery } from "@tanstack/react-query";
import { api, buildUrl } from "@shared/routes";
import { Personality } from "@shared/schema";
import { Link, useLocation } from "wouter";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Plus, MessageSquare } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { apiRequest, queryClient } from "@/lib/queryClient";
import { ThemeToggle } from "@/components/theme-toggle";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { insertPersonalitySchema } from "@shared/schema";
import { useState } from "react";

export default function Home() {
  const [, setLocation] = useLocation();
  const [open, setOpen] = useState(false);
  
  const { data: personalities, isLoading } = useQuery<Personality[]>({
    queryKey: [api.personalities.list.path],
  });

  const form = useForm({
    resolver: zodResolver(insertPersonalitySchema),
    defaultValues: {
      name: "",
      description: "",
      systemPrompt: "",
      avatarUrl: "",
    },
  });

  const createPersonality = useMutation({
    mutationFn: async (values: any) => {
      const res = await apiRequest("POST", api.personalities.create.path, values);
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.personalities.list.path] });
      setOpen(false);
      form.reset();
    },
  });

  const startConversation = useMutation({
    mutationFn: async (personalityId: number) => {
      const res = await apiRequest("POST", api.conversations.create.path, { personalityId });
      return res.json();
    },
    onSuccess: (data) => {
      setLocation(`/chat/${data.id}`);
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto p-4 space-y-8">
      <header className="flex items-center justify-between">
        <h1 className="text-3xl font-bold tracking-tight">AI Personalities</h1>
        <div className="flex items-center gap-2">
          <ThemeToggle />
          <Dialog open={open} onOpenChange={setOpen}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" data-testid="button-create">
                <Plus className="mr-2 h-4 w-4" />
                Create
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Personality</DialogTitle>
              </DialogHeader>
              <Form {...form}>
                <form onSubmit={form.handleSubmit((v) => createPersonality.mutate(v))} className="space-y-4">
                  <FormField
                    control={form.control}
                    name="name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Name</FormLabel>
                        <FormControl>
                          <Input placeholder="Socrates" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="description"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Description</FormLabel>
                        <FormControl>
                          <Input placeholder="Wise philosopher" {...field} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="systemPrompt"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>System Prompt</FormLabel>
                        <FormControl>
                          <Textarea 
                            placeholder="You are Socrates..." 
                            className="min-h-[100px]"
                            {...field} 
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <Button type="submit" className="w-full" disabled={createPersonality.isPending}>
                    Create
                  </Button>
                </form>
              </Form>
            </DialogContent>
          </Dialog>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {personalities?.map((personality) => (
          <Card key={personality.id} className="hover-elevate cursor-pointer overflow-hidden" onClick={() => startConversation.mutate(personality.id)}>
            <CardHeader className="flex flex-row items-center gap-4">
              <Avatar className="h-12 w-12">
                <AvatarImage src={personality.avatarUrl || ""} alt={personality.name} />
                <AvatarFallback>{personality.name.substring(0, 2).toUpperCase()}</AvatarFallback>
              </Avatar>
              <div className="flex-1">
                <CardTitle>{personality.name}</CardTitle>
                <CardDescription className="line-clamp-1">{personality.description}</CardDescription>
              </div>
            </CardHeader>
            <CardContent>
              <Button className="w-full" variant="secondary">
                <MessageSquare className="mr-2 h-4 w-4" />
                Chat Now
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
}
