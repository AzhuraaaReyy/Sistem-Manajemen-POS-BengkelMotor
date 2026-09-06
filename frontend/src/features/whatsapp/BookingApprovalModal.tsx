import { useState } from 'react';
import { Modal } from '@/components/ui/Modal';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { useToast } from '@/components/ui/Toast';
import { formatDate } from '@/lib/formatters';
import { approveBookingApi, rejectBookingApi } from '@/lib/api/whatsapp';
import type { WhatsAppBooking } from './types';

interface BookingApprovalModalProps {
  booking: WhatsAppBooking | null;
  open: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export function BookingApprovalModal({
  booking,
  open,
  onClose,
  onUpdate,
}: BookingApprovalModalProps) {
  const toast = useToast();
  const [rejecting, setRejecting] = useState(false);
  const [rejectionReason, setRejectionReason] = useState('');
  const [loading, setLoading] = useState(false);

  const handleApprove = async () => {
    if (!booking) return;

    setLoading(true);
    try {
      await approveBookingApi(booking.id);
      toast.success('Booking disetujui & service order dibuat');
      onUpdate();
      onClose();
    } catch {
      toast.error('Gagal menyetujui booking');
    } finally {
      setLoading(false);
    }
  };

  const handleReject = async () => {
    if (!booking || !rejectionReason.trim()) {
      toast.error('Alasan penolakan wajib diisi');
      return;
    }

    setLoading(true);
    try {
      await rejectBookingApi(booking.id, rejectionReason.trim());
      toast.success('Booking ditolak');
      onUpdate();
      onClose();
      setRejecting(false);
      setRejectionReason('');
    } catch {
      toast.error('Gagal menolak booking');
    } finally {
      setLoading(false);
    }
  };

  if (!booking) return null;

  return (
    <Modal open={open} onClose={onClose} title="Detail Booking">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <p className="text-sm text-text-secondary">Nama</p>
            <p className="font-medium">{booking.customer_name}</p>
          </div>
          <div>
            <p className="text-sm text-text-secondary">No. WhatsApp</p>
            <p className="font-medium">{booking.phone_number}</p>
          </div>
          <div>
            <p className="text-sm text-text-secondary">Tanggal</p>
            <p className="font-medium">{formatDate(booking.booking_date)}</p>
          </div>
          <div>
            <p className="text-sm text-text-secondary">Waktu</p>
            <p className="font-medium">{booking.booking_time}</p>
          </div>
          <div>
            <p className="text-sm text-text-secondary">TNKB</p>
            <p className="font-medium">{booking.tnkb}</p>
          </div>
          <div>
            <p className="text-sm text-text-secondary">Tipe Motor</p>
            <p className="font-medium">{booking.motorcycle_type}</p>
          </div>
        </div>
        <div>
          <p className="text-sm text-text-secondary">Keluhan</p>
          <p className="font-medium">{booking.complaint}</p>
        </div>

        {booking.status === 'PENDING' && !rejecting && (
          <div className="flex gap-2 pt-4">
            <Button onClick={handleApprove} disabled={loading} className="flex-1">
              Setujui Booking
            </Button>
            <Button
              variant="danger"
              onClick={() => setRejecting(true)}
              disabled={loading}
              className="flex-1"
            >
              Tolak
            </Button>
          </div>
        )}

        {rejecting && (
          <div className="space-y-3 pt-4">
            <Input
              label="Alasan Penolakan"
              value={rejectionReason}
              onChange={(e) => setRejectionReason(e.target.value)}
              placeholder="Misal: Slot penuh, tanggal tidak tersedia..."
            />
            <div className="flex gap-2">
              <Button
                variant="danger"
                onClick={handleReject}
                disabled={loading || !rejectionReason.trim()}
                className="flex-1"
              >
                Konfirmasi Tolak
              </Button>
              <Button
                variant="secondary"
                onClick={() => {
                  setRejecting(false);
                  setRejectionReason('');
                }}
                disabled={loading}
                className="flex-1"
              >
                Batal
              </Button>
            </div>
          </div>
        )}

        {booking.status === 'APPROVED' && (
          <div className="bg-success-subtle p-3 rounded-lg">
            <p className="text-sm text-success">
              ✅ Booking sudah disetujui
            </p>
          </div>
        )}

        {booking.status === 'REJECTED' && (
          <div className="bg-danger-subtle p-3 rounded-lg">
            <p className="text-sm text-danger">
              ❌ Booking ditolak: {booking.rejection_reason}
            </p>
          </div>
        )}
      </div>
    </Modal>
  );
}
