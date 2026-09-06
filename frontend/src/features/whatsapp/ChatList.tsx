import { ChatStatusBadge } from './ChatStatusBadge';
import { Card } from '@/components/ui/Card';
import { formatRelativeTime } from '@/lib/formatters';
import type { WhatsAppChat } from './types';

interface ChatListProps {
  chats: WhatsAppChat[];
  selectedChatId: number | null;
  onSelectChat: (chatId: number) => void;
}

export function ChatList({ chats, selectedChatId, onSelectChat }: ChatListProps) {
  return (
    <div className="space-y-2">
      {chats.map((chat) => (
        <div
          key={chat.id}
          className={`card p-4 cursor-pointer hover:border-primary transition-colors ${
            selectedChatId === chat.id ? 'border-primary bg-surface-2' : ''
          }`}
          onClick={() => onSelectChat(chat.id)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => e.key === 'Enter' && onSelectChat(chat.id)}
        >
          <div className="flex items-start justify-between">
            <div className="flex-1 min-w-0">
              <p className="font-medium text-text-primary truncate">
                {chat.phone_number}
              </p>
              {chat.latest_message && (
                <p className="text-sm text-text-secondary truncate mt-1">
                  {chat.latest_message.message_text}
                </p>
              )}
            </div>
            <div className="flex flex-col items-end gap-2 ml-3">
              <span className="text-xs text-text-secondary whitespace-nowrap">
                {formatRelativeTime(chat.last_message_at)}
              </span>
              <ChatStatusBadge
                botActive={chat.bot_active}
                adminTakeover={chat.admin_takeover}
              />
            </div>
          </div>
        </div>
      ))}

      {chats.length === 0 && (
        <Card className="p-8 text-center">
          <p className="text-text-secondary">Belum ada chat</p>
        </Card>
      )}
    </div>
  );
}
