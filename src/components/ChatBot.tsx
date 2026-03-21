'use client';
import { useState, useRef, useEffect } from 'react';
import { MessageCircle, X, Send, Leaf } from 'lucide-react';

type Msg = {
  role: 'user' | 'model';
  parts: [{ text: string }];
};

export default function ChatBot() {
  const [open, setOpen]         = useState(false);
  const [input, setInput]       = useState('');
  const [loading, setLoading]   = useState(false);
  const [messages, setMessages] = useState<Msg[]>([{
    role: 'model',
    parts: [{ text: "Hi! I'm EchoWise AI 🌿 Ask me anything about waste or recycling!" }]
  }]);
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  async function send() {
    if (!input.trim() || loading) return;
    const userMsg: Msg = { role: 'user', parts: [{ text: input }] };
    const updated = [...messages, userMsg];
    const currentInput = input;
    setMessages(updated);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: currentInput, history: messages }),
      });
      const text = await res.text();
      const data = text ? JSON.parse(text) : {};
      setMessages(prev => [
        ...prev,
        { role: 'model', parts: [{ text: data.reply ?? 'No response received.' }] }
      ]);
    } catch {
      setMessages(prev => [
        ...prev,
        { role: 'model', parts: [{ text: 'Sorry, something went wrong. Please try again.' }] }
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      {/* Small floating green icon - bottom right */}
      <button
        onClick={() => setOpen(o => !o)}
        className="fixed bottom-6 right-6 z-50
          w-14 h-14 rounded-full
          bg-green-600 hover:bg-green-700
          text-white shadow-lg
          flex items-center justify-center
          transition-all duration-200"
        aria-label="Chat"
      >
        {open ? <X size={22} /> : <MessageCircle size={22} />}
      </button>

      {/* Chat window */}
      {open && (
        <div className="fixed bottom-24 right-6 z-50
          w-80 rounded-2xl shadow-xl overflow-hidden
          bg-white dark:bg-gray-900
          border border-gray-200 dark:border-gray-700
          flex flex-col">

          <div className="bg-green-600 px-4 py-3 flex items-center gap-2">
            <Leaf size={16} className="text-white" />
            <span className="text-white text-sm font-medium">EchoWise AI</span>
          </div>

          <div className="overflow-y-auto p-3 space-y-2 max-h-72">
            {messages.map((m, i) => (
              <div key={i} className={`text-xs px-3 py-2 rounded-xl max-w-[90%]
                ${m.role === 'user'
                  ? 'bg-green-600 text-white ml-auto'
                  : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200'
                }`}>
                {m.parts[0].text}
              </div>
            ))}
            {loading && (
              <div className="text-xs px-3 py-2 bg-gray-100 dark:bg-gray-800 rounded-xl text-gray-400 animate-pulse">
                typing...
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          <div className="border-t border-gray-200 dark:border-gray-700 p-2 flex gap-2">
            <input
              className="flex-1 text-xs rounded-lg px-3 py-2 outline-none
                bg-gray-100 dark:bg-gray-800
                text-gray-700 dark:text-gray-200"
              placeholder="Ask about waste or recycling..."
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && send()}
            />
            <button onClick={send}
              className="bg-green-600 hover:bg-green-700 text-white rounded-lg p-2">
              <Send size={14} />
            </button>
          </div>

        </div>
      )}
    </>
  );
}