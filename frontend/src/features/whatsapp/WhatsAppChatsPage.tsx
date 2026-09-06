import { useState, useEffect } from 'react';
import { ChatList } from './ChatList';
import { ChatWindow } from './ChatWindow';
import { BookingApprovalModal } from './BookingApprovalModal';
import { Card } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { Select } from '@/components/ui/Select';
import { RefreshCwIcon } from '@/components/shared/icons';
import { getWhatsAppChatsApi, getWhatsAppChatDetailApi } from '@/lib/api/whatsapp';
import { useToast } from '@/components/ui/Toast';
import { echo } from '@/lib/websocket';
import type { WhatsAppChat, WhatsAppBooking } from './types';

const STATUS_OPTIONS = [
  { value: '', label: 'Semua Chat' },
  { value: 'bot_active', label: 'Bot Aktif' },
  { value: 'admin_takeover', label: 'Admin Takeover' },
];

export function WhatsAppChatsPage() {
  const toast = useToast();
  const [chats, setChats] = useState<WhatsAppChat[]>([]);
  const [selectedChat, setSelectedChat] = useState<WhatsAppChat | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [selectedBooking, setSelectedBooking] = useState<WhatsAppBooking | null>(null);

  const fetchChats = async () => {
    try {
      const data = await getWhatsAppChatsApi({ status: statusFilter || undefined });
      setChats(data.data);
    } catch {
      toast.error('Gagal memuat daftar chat');
    } finally {
      setLoading(false);
    }
  };

  const fetchChatDetail = async (chatId: number) => {
    try {
      const data = await getWhatsAppChatDetailApi(chatId);
      setSelectedChat(data);
    } catch {
      toast.error('Gagal memuat detail chat');
    }
  };

  useEffect(() => {
    fetchChats();
  }, [statusFilter]);

  useEffect(() => {
    echo.private('whatsapp-chats')
      .listen('.App\\Events\\WhatsApp\\NewWhatsAppMessage', (data: { chat_id: number }) => {
        if (selectedChat && data.chat_id === selectedChat.id) {
          fetchChatDetail(selectedChat.id);
        }

        const audio = new Audio('/notification.mp3');
        audio.play().catch(() => {});

        toast.info('Pesan baru diterima');
      })
      .listen('.App\\Events\\WhatsApp\\NewWhatsAppBooking', (data: { booking: { customer_name: string } }) => {
        toast.success(`Booking baru dari ${data.booking.customer_name}`);
        fetchChats();
      });

    return () => {
      echo.leave('whatsapp-chats');
    };
  }, [selectedChat?.id]);

  const handleSelectChat = (chatId: number) => {
    fetchChatDetail(chatId);
  };

  const handleRefresh = () => {
    setLoading(true);
    fetchChats();
    if (selectedChat) {
      fetchChatDetail(selectedChat.id);
    }
  };

  return (
    <div className="h-[calc(100vh-120px)]">
      {/* Filter Bar */}
      <div className="flex items-center justify-between mb-4">
        <div className="w-48">
          <Select
            options={STATUS_OPTIONS}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          />
        </div>
        <Button onClick={handleRefresh} disabled={loading}>
          <RefreshCwIcon className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </Button>
      </div>

      {/* 2-Column Layout */}
      <div className="grid grid-cols-12 gap-4 h-[calc(100%-60px)]">
        {/* Left: Chat List */}
        <div className="col-span-4 overflow-y-auto">
          <ChatList
            chats={chats}
            selectedChatId={selectedChat?.id ?? null}
            onSelectChat={handleSelectChat}
          />
        </div>

        {/* Right: Chat Window */}
        <div className="col-span-8">
          {selectedChat ? (
            <Card className="h-full flex flex-col">
              <ChatWindow chat={selectedChat} onUpdate={handleRefresh} />
            </Card>
          ) : (
            <Card className="h-full flex items-center justify-center">
              <p className="text-text-secondary">
                Pilih chat untuk melihat percakapan
              </p>
            </Card>
          )}
        </div>
      </div>

      {/* Booking Approval Modal */}
      <BookingApprovalModal
        booking={selectedBooking}
        open={!!selectedBooking}
        onClose={() => setSelectedBooking(null)}
        onUpdate={handleRefresh}
      />
    </div>
  );
}
