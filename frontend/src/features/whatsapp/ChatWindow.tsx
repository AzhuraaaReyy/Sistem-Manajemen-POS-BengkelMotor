import { useState, useEffect, useRef } from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { ChatStatusBadge } from './ChatStatusBadge';
import { formatTime } from '@/lib/formatters';
import { SendIcon, UserCheckIcon, UserXIcon } from '@/components/shared/icons';
import { useToast } from '@/components/ui/Toast';
import type { WhatsAppChat } from './types';
import {
  takeoverChatApi,
  releaseChatApi,
  sendWhatsAppMessageApi,
} from '@/lib/api/whatsapp';

interface ChatWindowProps {
  chat: WhatsAppChat;
  onUpdate: () => void;
}

export function ChatWindow({ chat, onUpdate }: ChatWindowProps) {
  const toast = useToast();
  const [message, setMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [chat.messages]);

  const handleTakeover = async () => {
    try {
      await takeoverChatApi(chat.id);
      toast.success('Chat berhasil diambil alih');
      onUpdate();
    } catch {
      toast.error('Gagal mengambil alih chat');
    }
  };

  const handleRelease = async () => {
    try {
      await releaseChatApi(chat.id);
      toast.success('Chat berhasil dilepas');
      onUpdate();
    } catch {
      toast.error('Gagal melepas chat');
    }
  };

  const handleSend = async () => {
    if (!message.trim()) return;

    setSending(true);
    try {
      await sendWhatsAppMessageApi(chat.id, message.trim());
      setMessage('');
      toast.success('Pesan dikirim');
      onUpdate();
    } catch {
      toast.error('Gagal mengirim pesan');
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="p-4 border-b border-border bg-surface-2">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="font-semibold text-text-primary">{chat.phone_number}</h3>
            <div className="flex items-center gap-2 mt-1">
              <ChatStatusBadge
                botActive={chat.bot_active}
                adminTakeover={chat.admin_takeover}
              />
            </div>
          </div>
          <div className="flex gap-2">
            {!chat.admin_takeover ? (
              <Button size="sm" onClick={handleTakeover}>
                <UserCheckIcon className="w-4 h-4 mr-2" />
                Ambil Alih
              </Button>
            ) : (
              <Button size="sm" variant="secondary" onClick={handleRelease}>
                <UserXIcon className="w-4 h-4 mr-2" />
                Lepas Kontrol
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {chat.messages?.map((msg) => (
          <div
            key={msg.id}
            className={`flex ${
              msg.sender_type === 'customer' ? 'justify-start' : 'justify-end'
            }`}
          >
            <div
              className={`max-w-[70%] rounded-lg p-3 ${
                msg.sender_type === 'customer'
                  ? 'bg-surface-2 text-text-primary'
                  : msg.sender_type === 'bot'
                  ? 'bg-success-subtle text-success'
                  : 'bg-primary text-white'
              }`}
            >
              {msg.event_type ? (
                <p className="text-xs italic opacity-75">
                  {msg.event_type === 'bot_activated' && '🤖 Bot diaktifkan'}
                  {msg.event_type === 'admin_takeover' && '👤 Admin mengambil alih'}
                  {msg.event_type === 'bot_greeting' && '👋 Bot greeting'}
                </p>
              ) : (
                <>
                  <p className="text-sm whitespace-pre-wrap">{msg.message_text}</p>
                  <p className="text-xs opacity-75 mt-1">
                    {formatTime(msg.created_at)}
                    {msg.sender_type === 'bot' && ' • Bot'}
                    {msg.sender_type === 'admin' && ' • Admin'}
                  </p>
                </>
              )}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-4 border-t border-border bg-surface-2">
        <div className="flex gap-2">
          <Input
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Ketik pesan..."
            disabled={sending}
          />
          <Button onClick={handleSend} disabled={sending || !message.trim()}>
            <SendIcon className="w-4 h-4" />
          </Button>
        </div>
      </div>
    </div>
  );
}
