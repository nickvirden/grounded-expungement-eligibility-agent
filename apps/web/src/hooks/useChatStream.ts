'use client';

import { describeChatError } from '@/lib/chatStreamError';
import type { EligibilityReport, SseEvent } from '@/lib/schemas';
import { useCallback, useRef, useState } from 'react';

export type MessageRole = 'user' | 'agent';

export interface ChatMessage {
  id: string;
  role: MessageRole;
  content: string;
  isStreaming?: boolean;
}

export interface UseChatStreamResult {
  messages: ChatMessage[];
  intakeId: string | null;
  report: EligibilityReport | null;
  isLoading: boolean;
  error: string | null;
  send: (state: string, narrative: string) => Promise<void>;
  reset: () => void;
}

/**
 * Manages the agent chat session lifecycle:
 *  1. POST /api/chat → create intake, returns intake_id
 *  2. ReadableStream via GET /api/chat/[id]/stream → parse SSE events
 *  3. Accumulate text_chunks into a streaming agent message
 *  4. Set `report` on `final` event
 */
export function useChatStream(): UseChatStreamResult {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [intakeId, setIntakeId] = useState<string | null>(null);
  const [report, setReport] = useState<EligibilityReport | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Stable ID for the current streaming agent message
  const streamingMsgId = useRef<string>('agent-stream');
  const abortRef = useRef<AbortController | null>(null);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    setMessages([]);
    setIntakeId(null);
    setReport(null);
    setIsLoading(false);
    setError(null);
  }, []);

  const send = useCallback(async (state: string, narrative: string) => {
    abortRef.current?.abort();
    const abort = new AbortController();
    abortRef.current = abort;

    setIsLoading(true);
    setError(null);
    setReport(null);

    const userMsg: ChatMessage = {
      id: `user-${Date.now()}`,
      role: 'user',
      content: narrative,
    };
    setMessages([userMsg]);

    try {
      // Step 1: create intake
      const createRes = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ state, narrative }),
        signal: abort.signal,
      });

      if (!createRes.ok) {
        throw new Error(describeChatError(createRes.status, 'create'));
      }

      const { intake_id, stream_token: streamToken } = (await createRes.json()) as {
        intake_id: string;
        stream_token?: string | null;
      };
      setIntakeId(intake_id);

      // Step 2: open SSE stream. streamToken can be absent if this web build
      // ships before the API build that starts returning it (the two Vercel
      // projects don't deploy atomically) -- sending no Authorization header
      // in that case, rather than crashing on an assumed-present field.
      const streamRes = await fetch(`/api/chat/${intake_id}/stream`, {
        headers: streamToken ? { Authorization: `Bearer ${streamToken}` } : undefined,
        signal: abort.signal,
      });

      if (!streamRes.ok || !streamRes.body) {
        throw new Error(describeChatError(streamRes.status, 'stream'));
      }

      const msgId = `agent-stream-${Date.now()}`;
      streamingMsgId.current = msgId;

      // Seed the streaming agent bubble
      setMessages((prev) => [
        ...prev,
        { id: msgId, role: 'agent', content: '', isStreaming: true },
      ]);

      // Step 3: read SSE events
      const reader = streamRes.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += value;
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data:')) continue;
          const raw = line.slice(5).trim();
          if (!raw || raw === '[DONE]') continue;

          let event: SseEvent;
          try {
            event = JSON.parse(raw) as SseEvent;
          } catch {
            continue;
          }

          if (event.type === 'text_chunk') {
            setMessages((prev) =>
              prev.map((m) => (m.id === msgId ? { ...m, content: m.content + event.text } : m)),
            );
          } else if (event.type === 'final') {
            setReport(event.report);
            setMessages((prev) =>
              prev.map((m) => (m.id === msgId ? { ...m, isStreaming: false } : m)),
            );
          } else if (event.type === 'error') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === msgId
                  ? {
                      ...m,
                      content: m.content || `Error: ${event.message}`,
                      isStreaming: false,
                    }
                  : m,
              ),
            );
            setError(event.message);
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && err.name === 'AbortError') return;
      const msg = err instanceof Error ? err.message : 'Something went wrong';
      setError(msg);
    } finally {
      setIsLoading(false);
      // Mark streaming bubble as done
      setMessages((prev) => prev.map((m) => (m.isStreaming ? { ...m, isStreaming: false } : m)));
    }
  }, []);

  return { messages, intakeId, report, isLoading, error, send, reset };
}
