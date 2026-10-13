"use client";

import { useChat } from '@ai-sdk/react';
import { useRef, useEffect, useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X, Send, Bot, User, Sparkles } from 'lucide-react';
import { getPendingProposals } from '@/app/actions';
import { ProposalApprovalCard } from '@/components/proposal-approval-card';
import type { ScenarioProposalItem } from '@/types/journey';

interface ChatInterfaceProps {
  pendingProposals?: ScenarioProposalItem[];
  onProposalResolved?: () => void;
}

export default function ChatInterface({
  pendingProposals: externalProposals,
  onProposalResolved,
}: ChatInterfaceProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [localInput, setLocalInput] = useState('');
  const [localProposals, setLocalProposals] = useState<ScenarioProposalItem[]>([]);

  const refreshProposals = useCallback(async () => {
    try {
      const list = await getPendingProposals();
      setLocalProposals(list);
    } catch {
      // Ignore if unauthenticated
    }
  }, []);

  const { messages, sendMessage, status, error } = useChat({
    onError: (err) => console.error('Chat error:', err),
    onFinish: () => {
      void refreshProposals();
    },
  });

  const isLoading = status === 'streaming' || status === 'submitted';
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isOpen, localProposals.length]);

  const activeProposals =
    externalProposals && externalProposals.length > 0 ? externalProposals : localProposals;

  const handleResolved = () => {
    void refreshProposals();
    if (onProposalResolved) {
      onProposalResolved();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!localInput.trim() || isLoading) return;
    const text = localInput;
    setLocalInput('');
    await sendMessage({ text });
    await refreshProposals();
  };

  const handleSuggestion = async (text: string) => {
    if (isLoading) return;
    await sendMessage({ text });
    await refreshProposals();
  };

  const getMessageText = (message: (typeof messages)[number]): string => {
    return message.parts
      .filter((part): part is { type: 'text'; text: string } => part.type === 'text')
      .map((part) => part.text)
      .join('');
  };

  return (
    <div className="fixed bottom-6 right-6 z-50">
      {!isOpen && (
        <Button
          onClick={() => setIsOpen(true)}
          className="h-14 w-14 rounded-full bg-indigo-600 hover:bg-indigo-700 shadow-lg shadow-indigo-600/20 text-white p-0 flex items-center justify-center transition-all hover:scale-105 relative"
        >
          <Sparkles className="h-6 w-6" />
          {activeProposals.length > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-emerald-500 text-[10px] font-bold flex items-center justify-center text-black">
              {activeProposals.length}
            </span>
          )}
        </Button>
      )}

      {isOpen && (
        <div className="bg-zinc-900 border border-zinc-700 rounded-2xl w-[400px] h-[640px] shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-bottom-5 fade-in duration-200">
          {/* Header */}
          <div className="bg-zinc-950 p-4 border-b border-zinc-800 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="h-8 w-8 rounded-full bg-indigo-500/10 flex items-center justify-center">
                <Bot className="h-5 w-5 text-indigo-400" />
              </div>
              <div>
                <h3 className="font-semibold text-white text-sm">Gemini 3.8 Coach</h3>
                <span className="text-xs text-green-400 flex items-center gap-1">
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${error ? 'bg-red-500' : 'bg-green-400'}`}
                  ></span>
                  {error ? 'Error' : 'Grounded & Proposal-Safe'}
                </span>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setIsOpen(false)}
              className="text-zinc-400 hover:text-white hover:bg-zinc-800"
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          {/* Messages & Pending Proposal Cards */}
          <ScrollArea className="flex-1 p-4 bg-zinc-900/50">
            {messages.length === 0 && activeProposals.length === 0 && (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 text-zinc-500 space-y-4">
                <Sparkles className="h-12 w-12 text-zinc-700" />
                <p className="text-sm">
                  Hi! I analyze your calibrated composition &amp; trajectory bands, and create
                  confirmable proposals for new weight entries or target updates.
                </p>
                <div className="grid gap-2 w-full">
                  <button
                    type="button"
                    onClick={() =>
                      handleSuggestion('Reconcile my BMI vs FFMI and explain my trajectory.')
                    }
                    className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg transition-colors text-zinc-300"
                  >
                    &ldquo;Reconcile my BMI vs FFMI&rdquo;
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSuggestion('Propose logging my weight at 88.5kg')}
                    className="text-xs bg-zinc-800 hover:bg-zinc-700 px-3 py-2 rounded-lg transition-colors text-zinc-300"
                  >
                    &ldquo;Propose logging 88.5kg&rdquo;
                  </button>
                </div>
              </div>
            )}

            <div className="space-y-4">
              {messages.map((m) => {
                const text = getMessageText(m);
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
                      className={`max-w-[82%] rounded-2xl px-4 py-2.5 text-sm ${
                        m.role === 'user'
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

              {activeProposals.length > 0 && (
                <div className="space-y-2.5 pt-2">
                  {activeProposals.map((proposal) => (
                    <ProposalApprovalCard
                      key={proposal.id}
                      proposal={proposal}
                      onResolved={handleResolved}
                    />
                  ))}
                </div>
              )}

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
                placeholder="Ask coach or propose an entry..."
                className="bg-zinc-900 border-zinc-800 text-zinc-200 focus-visible:ring-indigo-600 rounded-xl"
              />
              <Button
                type="submit"
                size="icon"
                disabled={isLoading || !localInput.trim()}
                className="bg-indigo-600 hover:bg-indigo-700 rounded-xl"
              >
                <Send className="h-4 w-4" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
