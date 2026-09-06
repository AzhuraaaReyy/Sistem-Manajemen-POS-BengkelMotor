import { Badge } from '@/components/ui/Badge';

interface ChatStatusBadgeProps {
  botActive: boolean;
  adminTakeover: boolean;
}

export function ChatStatusBadge({ botActive, adminTakeover }: ChatStatusBadgeProps) {
  if (adminTakeover) {
    return <Badge tone="info">Admin Takeover</Badge>;
  }

  if (botActive) {
    return <Badge tone="success">Bot Aktif</Badge>;
  }

  return <Badge tone="neutral">Menunggu</Badge>;
}
