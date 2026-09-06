<?php

namespace App\Http\Controllers\Api;

use App\Http\Controllers\Controller;
use App\Models\User;
use App\Models\WhatsAppBooking;
use App\Services\WhatsApp\BookingService;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\Auth;

class WhatsAppBookingController extends Controller
{
    public function __construct(
        private BookingService $bookingService,
    ) {}

    public function approve(WhatsAppBooking $booking): JsonResponse
    {
        /** @var User $admin */
        $admin = Auth::user();

        $this->bookingService->approve($booking, $admin);

        return response()->json(['message' => 'Booking approved successfully']);
    }

    public function reject(Request $request, WhatsAppBooking $booking): JsonResponse
    {
        $validated = $request->validate([
            'reason' => 'required|string|max:500',
        ]);

        /** @var User $admin */
        $admin = Auth::user();

        $this->bookingService->reject($booking, $admin, $validated['reason']);

        return response()->json(['message' => 'Booking rejected']);
    }
}
