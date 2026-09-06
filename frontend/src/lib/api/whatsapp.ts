import client from './client';
import type { Paginated } from '@/types';
import type { WhatsAppChat } from '@/features/whatsapp/types';

export const getWhatsAppChatsApi = async (params?: { status?: string }) => {
  const { data } = await client.get<Paginated<WhatsAppChat>>('/whatsapp/chats', { params });
  return data;
};

export const getWhatsAppChatDetailApi = async (chatId: number) => {
  const { data } = await client.get<WhatsAppChat>(`/whatsapp/chats/${chatId}`);
  return data;
};

export const takeoverChatApi = async (chatId: number) => {
  const { data } = await client.post(`/whatsapp/chats/${chatId}/takeover`);
  return data;
};

export const releaseChatApi = async (chatId: number) => {
  const { data } = await client.post(`/whatsapp/chats/${chatId}/release`);
  return data;
};

export const sendWhatsAppMessageApi = async (chatId: number, message: string) => {
  const { data } = await client.post(`/whatsapp/chats/${chatId}/send`, { message });
  return data;
};

export const approveBookingApi = async (bookingId: number) => {
  const { data } = await client.post(`/whatsapp/bookings/${bookingId}/approve`);
  return data;
};

export const rejectBookingApi = async (bookingId: number, reason: string) => {
  const { data } = await client.post(`/whatsapp/bookings/${bookingId}/reject`, { reason });
  return data;
};
