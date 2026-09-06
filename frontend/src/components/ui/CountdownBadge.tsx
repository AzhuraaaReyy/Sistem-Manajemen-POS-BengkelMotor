import { useEffect, useState } from "react";
import { Clock } from "lucide-react";
import { Badge } from "./Badge";

interface CountdownBadgeProps {
  expiresAt: string | Date;
  onExpired?: () => void;
}

export function CountdownBadge({ expiresAt, onExpired }: CountdownBadgeProps) {
  const [timeLeft, setTimeLeft] = useState(0);

  useEffect(() => {
    const expires = new Date(expiresAt).getTime();
    
    const tick = () => {
      const remaining = Math.max(0, Math.floor((expires - Date.now()) / 1000));
      setTimeLeft(remaining);
      
      if (remaining <= 0 && onExpired) {
        onExpired();
      }
    };

    tick();
    const interval = setInterval(tick, 1000);
    return () => clearInterval(interval);
  }, [expiresAt, onExpired]);

  const minutes = Math.floor(timeLeft / 60);
  const seconds = timeLeft % 60;
  const isWarning = timeLeft <= 180;
  const isExpired = timeLeft === 0;

  if (isExpired) {
    return (
      <Badge tone="danger" className="text-xs">
        Kedaluwarsa
      </Badge>
    );
  }

  return (
    <div className="flex items-center gap-1.5 text-xs">
      <Clock className="h-3 w-3" style={{ color: isWarning ? "var(--color-warning)" : "var(--color-primary)" }} />
      <span 
        className="font-mono font-medium tabular-nums"
        style={{ color: isWarning ? "var(--color-warning)" : "var(--color-primary)" }}
      >
        {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
      </span>
    </div>
  );
}
