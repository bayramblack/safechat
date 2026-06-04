import { useState, useEffect, useRef } from "react";
import { webrtcService, type CallInfo, type CallType } from "@/lib/webrtc";

export function useCall() {
  const [callInfo, setCallInfo] = useState<CallInfo>(webrtcService.getCallInfo());
  const [duration, setDuration] = useState(0);
  const [localVideoStream, setLocalVideoStream] = useState<MediaStream | null>(webrtcService.getLocalVideoStream());
  const [remoteVideoStream, setRemoteVideoStream] = useState<MediaStream | null>(webrtcService.getRemoteVideoStream());
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    const unsub = webrtcService.onCallStateChange((info) => {
      setCallInfo(info);
      if (info.state === "active" && !timerRef.current) {
        timerRef.current = setInterval(() => {
          setDuration(webrtcService.getCallDuration());
        }, 1000);
      }
      if (info.state !== "active" && timerRef.current) {
        clearInterval(timerRef.current);
        timerRef.current = null;
        setDuration(0);
      }
    });

    const unsubLocalVideo = webrtcService.onLocalVideoStream((stream) => {
      setLocalVideoStream(stream);
    });

    const unsubRemoteVideo = webrtcService.onRemoteVideoStream((stream) => {
      setRemoteVideoStream(stream);
    });

    return () => {
      unsub();
      unsubLocalVideo();
      unsubRemoteVideo();
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, []);

  return {
    callInfo,
    duration,
    localVideoStream,
    remoteVideoStream,
    startCall: (conversationId: number, receiverId: number, peerAddress: string, callType?: CallType, peerUsername?: string, peerAvatarUrl?: string) =>
      webrtcService.startCall(conversationId, receiverId, peerAddress, callType, peerUsername, peerAvatarUrl),
    acceptCall: () => webrtcService.acceptCall(),
    rejectCall: () => webrtcService.rejectCall(),
    endCall: () => webrtcService.endCall(),
    toggleMute: () => webrtcService.toggleMute(),
    toggleSpeaker: () => webrtcService.toggleSpeaker(),
    toggleVideo: () => webrtcService.toggleVideo(),
    switchCamera: () => webrtcService.switchCamera(),
    formatDuration: (s: number) => webrtcService.formatDuration(s),
  };
}
