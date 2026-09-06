export interface WhatsAppChat {
  id: number;
  phone_number: string;
  last_message_at: string;
  last_message_from: 'customer' | 'admin' | 'bot';
  bot_active: boolean;
  admin_takeover: boolean;
  latest_message?: {
    message_text: string;
    created_at: string;
  };
  messages?: WhatsAppMessage[];
}

export interface WhatsAppMessage {
  id: number;
  chat_id: number;
  direction: 'inbound' | 'outbound';
  sender_type: 'customer' | 'admin' | 'bot';
  message_text: string | null;
  event_type: string | null;
  created_at: string;
}

export interface WhatsAppBooking {
  id: number;
  chat_id: number;
  customer_name: string;
  phone_number: string;
  booking_date: string;
  booking_time: string;
  tnkb: string;
  motorcycle_type: string;
  complaint: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
  approved_by?: number;
  approved_at?: string;
  rejection_reason?: string;
  service_order_id?: number;
}
