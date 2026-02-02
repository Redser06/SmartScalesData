"use client";

import { useChat } from '@ai-sdk/react';
import { useRef, useEffect, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import { X, Send, Bot, User, Sparkles } from "lucide-react";

export default function ChatInterface() {
    const [isOpen, setIsOpen] = useState(false);
    const [mounted, setMounted] = useState(false);
    const [localInput, setLocalInput] = useState('');

    const { messages, sendMessage, status, error } = useChat({
        onError: (err) => console.error("Chat error:", err),
    });

    const isLoading = status === 'streaming' || status === 'submitted';

    const messagesEndRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        setMounted(true);
    }, []);

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages, isOpen]);

    if (!mounted) return null;

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!localInput.trim() || isLoading) return;
        const text = localInput;
        setLocalInput('');
        await sendMessage({ text });
    };

    const handleSuggestion = async (text: string) => {
        if (isLoading) return;
        await sendMessage({ text });
    };

    // Helper to extract text content from message parts
    const getMessageText = (message: typeof messages[number]): string => {
        return message.parts
            .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
            .map(part => part.text)
            .join('');
    };

    return (
        <div className="fixed bottom-6 right-6 z-50">
            {!isOpen && (
                <Button
                    onClick={() => setIsOpen(true)}
                    className="h-14 w-14 rounded-full bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 text-white p-0 flex items-center justify-center transition-all hover:scale-105"
                >
                    <Sparkles className="h-6 w-6" />
                </Button>
            )}

            {isOpen && (
                <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-[380px] h-[600px] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-200">
                    {/* Header */}
                    <div className="bg-zinc-950 p-4 border-b border-zinc-800 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                            <div className="h-8 w-8 rounded-full bg-indigo-500/10 flex items-center justify-center">
                                <Bot className="h-5 w-5 text-indigo-400" />
                            </div>
                            <div>
                                <h3 className="font-semibold text-white text-sm">Gemini Assistant</h3>
                                <span className="text-xs text-green-400 flex items-center gap-1">
                                    <span className={`h-1.5 w-1.5 rounded-full ${error ? 'bg-red-500' : 'bg-green-400'}`}></span>
                                    {error ? 'Error' : 'Online'}
                                </span>
                            </div>
                        </div>
                        <Button variant="ghost" size="icon" onClick={() => setIsOpen(false)} className="text-zinc-400 hover:text-white hover:bg-zinc-800">
                            <X className="h-4 w-4" />
                        </Button>
                    </div>

                    {/* Messages */}
                    <ScrollArea className="flex-1 p-4 bg-zinc-900/50">
                        {messages.length === 0 && (
                            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500 space-y-4">
                                <Sparkles className="h-12 w-12 text-zinc-700" />
                                <p className="text-sm">Hi! I can analyze your weight history or log new entries for you.</p>
                                <div className="grid gap-2 w-full">
                                    <button onClick={() => handleSuggestion("How much weight have I lost this month?")} className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg transition-colors text-zinc-300">
                                        "How much lost this month?"
                                    </button>
                                    <button onClick={() => handleSuggestion("Log my weight as 99.5kg")} className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg transition-colors text-zinc-300">
                                        "Log weight 99.5kg"
                                    </button>
                                </div>
                            </div>
                        )}
                        <div className="space-y-4">
                            {messages.map((m) => {
                                const text = getMessageText(m);
                                // Skip assistant messages with no text (tool-only responses)
                                if (m.role === 'assistant' && !text) return null;

                                return (
                                    <div
                                        key={m.id}
                                        className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}
                                    >
                                        {m.role !== 'user' && (
                                            <div className="h-8 w-8 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0 mt-1">
                                                <Bot className="h-4 w-4 text-indigo-400" />
                                            </div>
                                        )}
                                        <div
                                            className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-sm ${m.role === 'user'
                                                ? 'bg-indigo-600 text-white rounded-tr-none'
                                                : 'bg-zinc-800 text-zinc-200 rounded-tl-none'
                                                }`}
                                        >
                                            {text}
                                        </div>
                                        {m.role === 'user' && (
                                            <div className="h-8 w-8 rounded-full bg-zinc-800 flex items-center justify-center shrink-0 mt-1">
                                                <User className="h-4 w-4 text-zinc-400" />
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                            {isLoading && (
                                <div className="flex gap-3 justify-start">
                                    <div className="h-8 w-8 rounded-full bg-indigo-500/10 flex items-center justify-center shrink-0 mt-1">
                                        <Bot className="h-4 w-4 text-indigo-400" />
                                    </div>
                                    <div className="bg-zinc-800 rounded-2xl rounded-tl-none px-4 py-3 flex items-center gap-1.5">
                                        <span className="h-1.5 w-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                                        <span className="h-1.5 w-1.5 bg-zinc-500 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                                        <span className="h-1.5 w-1.5 bg-zinc-500 rounded-full animate-bounce"></span>
                                    </div>
                                </div>
                            )}
                            <div ref={messagesEndRef} />
                        </div>
                    </ScrollArea>

                    {/* Input */}
                    <div className="p-4 bg-zinc-950 border-t border-zinc-800">
                        <form onSubmit={handleSubmit} className="flex gap-2">
                            <Input
                                value={localInput}
                                onChange={(e) => setLocalInput(e.target.value)}
                                placeholder="Ask or log..."
                                className="bg-zinc-900 border-zinc-800 text-zinc-200 focus-visible:ring-indigo-600 rounded-xl"
                            />
                            <Button type="submit" size="icon" disabled={isLoading || !localInput.trim()} className="bg-indigo-600 hover:bg-indigo-700 rounded-xl">
                                <Send className="h-4 w-4" />
                            </Button>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
