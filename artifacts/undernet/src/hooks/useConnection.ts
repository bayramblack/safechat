import { useState, useEffect } from "react";
import { socketService, type ConnectionStatus } from "@/lib/socket";

export function useConnection() {
  const [status, setStatus] = useState<ConnectionStatus>(socketService.getStatus());

  useEffect(() => {
    const unsub = socketService.onStatus(setStatus);
    return unsub;
  }, []);

  return status;
}
