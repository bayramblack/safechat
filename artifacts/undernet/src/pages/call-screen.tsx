import { useEffect, useState, useRef, useCallback } from "react";
import { Phone, PhoneOff, Mic, MicOff, Volume2, X, Video, VideoOff, SwitchCamera } from "lucide-react";
import { truncateAddress } from "@/lib/wallet";
import { useCall } from "@/hooks/useCall";
import { webrtcService } from "@/lib/webrtc";
import { triggerHaptic } from "@/lib/haptics";
import { useSwipeBack } from "@/hooks/useSwipeBack";

interface CallScreenProps {
  onClose: () => void;
  fromNotification?: boolean;
}

function useRingtone(isRinging: boolean, isIncoming: boolean) {
  const audioContextRef = useRef<AudioContext | null>(null);
  const oscillatorRef = useRef<OscillatorNode | null>(null);
  const gainRef = useRef<GainNode | null>(null);
  const ringtoneIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const vibrationIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopRingtone = useCallback(() => {
    if (ringtoneIntervalRef.current) {
      clearInterval(ringtoneIntervalRef.current);
      ringtoneIntervalRef.current = null;
    }
    if (oscillatorRef.current) {
      try { oscillatorRef.current.stop(); } catch {}
      oscillatorRef.current = null;
    }
    if (gainRef.current) {
      gainRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close().catch(() => {});
      audioContextRef.current = null;
    }
    if (vibrationIntervalRef.current) {
      clearInterval(vibrationIntervalRef.current);
      vibrationIntervalRef.current = null;
    }
    if (navigator.vibrate) {
      navigator.vibrate(0);
    }
  }, []);

  useEffect(() => {
    if (!isRinging || !isIncoming) {
      stopRingtone();
      return;
    }

    try {
      const ctx = new AudioContext();
      audioContextRef.current = ctx;

      if (ctx.state === "suspended") {
        ctx.resume().catch(() => {});
      }

      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);
      gainRef.current = gain;

      const playTone = () => {
        if (!audioContextRef.current || audioContextRef.current.state === "closed") return;
        if (audioContextRef.current.state === "suspended") {
          audioContextRef.current.resume().catch(() => {});
          return;
        }
        const now = audioContextRef.current.currentTime;
        const osc = audioContextRef.current.createOscillator();
        const toneGain = audioContextRef.current.createGain();
        osc.type = "sine";
        osc.frequency.setValueAtTime(440, now);
        osc.frequency.setValueAtTime(480, now + 0.2);
        osc.frequency.setValueAtTime(440, now + 0.4);
        toneGain.gain.setValueAtTime(0.15, now);
        toneGain.gain.setValueAtTime(0.15, now + 0.6);
        toneGain.gain.linearRampToValueAtTime(0, now + 0.8);
        osc.connect(toneGain);
        toneGain.connect(audioContextRef.current.destination);
        osc.start(now);
        osc.stop(now + 0.8);
      };

      playTone();
      ringtoneIntervalRef.current = setInterval(playTone, 2000);
    } catch {}

    if (navigator.vibrate) {
      navigator.vibrate([300, 200, 300, 200, 300]);
      vibrationIntervalRef.current = setInterval(() => {
        navigator.vibrate([300, 200, 300, 200, 300]);
      }, 2000);
    }

    return stopRingtone;
  }, [isRinging, isIncoming, stopRingtone]);

  return stopRingtone;
}

function getPeerDisplayName(callInfo: { peerUsername?: string; peerAddress: string }): string {
  if (callInfo.peerUsername) return callInfo.peerUsername;
  if (callInfo.peerAddress && callInfo.peerAddress.startsWith("0x") && callInfo.peerAddress.length > 10) {
    return truncateAddress(callInfo.peerAddress);
  }
  return "User";
}

function getAvatarInitial(callInfo: { peerUsername?: string; peerAddress: string }): string {
  if (callInfo.peerUsername) return callInfo.peerUsername.charAt(0).toUpperCase();
  if (callInfo.peerAddress && callInfo.peerAddress.startsWith("0x") && callInfo.peerAddress.length >= 4) {
    return callInfo.peerAddress.slice(2, 4).toUpperCase();
  }
  return "U";
}

export default function CallScreen({ onClose, fromNotification }: CallScreenProps) {
  const { callInfo, duration, localVideoStream, remoteVideoStream, acceptCall, rejectCall, endCall, toggleMute, toggleSpeaker, toggleVideo, switchCamera, formatDuration } = useCall();
  const swipeBackEnabled = callInfo.state !== "active" && callInfo.state !== "connecting" && callInfo.state !== "incoming";
  useSwipeBack(onClose, swipeBackEnabled);
  const [pulseAnim, setPulseAnim] = useState(true);
  const [waitingForSignal, setWaitingForSignal] = useState(!!fromNotification);
  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const isRinging = callInfo.state === "incoming" || callInfo.state === "outgoing";
  const isIncoming = callInfo.state === "incoming";
  const stopRingtone = useRingtone(isRinging, isIncoming);

  useEffect(() => {
    const terminalStates = ["ended", "rejected", "missed", "idle"];
    if (terminalStates.includes(callInfo.state)) {
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      webrtcService.cleanupMedia();
    }
  }, [callInfo.state]);

  useEffect(() => {
    return () => {
      if (localVideoRef.current) {
        localVideoRef.current.srcObject = null;
      }
      if (remoteVideoRef.current) {
        remoteVideoRef.current.srcObject = null;
      }
      webrtcService.cleanupMedia();
    };
  }, []);

  const handleAccept = useCallback(() => {
    triggerHaptic(15);
    stopRingtone();
    acceptCall();
  }, [stopRingtone, acceptCall]);

  const handleReject = useCallback(() => {
    triggerHaptic(15);
    stopRingtone();
    rejectCall();
  }, [stopRingtone, rejectCall]);

  const handleEnd = useCallback(() => {
    triggerHaptic(20);
    stopRingtone();
    endCall();
  }, [stopRingtone, endCall]);

  useEffect(() => {
    if (fromNotification && waitingForSignal) {
      if (callInfo.state !== "idle") {
        setWaitingForSignal(false);
        return;
      }
      const t = setTimeout(() => {
        setWaitingForSignal(false);
      }, 10000);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [fromNotification, waitingForSignal, callInfo.state]);

  useEffect(() => {
    if (waitingForSignal) return;
    if (callInfo.state === "idle" || callInfo.state === "ended") {
      const t = setTimeout(onClose, 1500);
      return () => clearTimeout(t);
    }
    return undefined;
  }, [callInfo.state, onClose, waitingForSignal]);

  useEffect(() => {
    const interval = setInterval(() => setPulseAnim((p) => !p), 2000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (localVideoRef.current) {
      if (localVideoStream) {
        localVideoRef.current.srcObject = localVideoStream;
        localVideoRef.current.play().catch(() => {});
      } else {
        localVideoRef.current.srcObject = null;
      }
    }
  }, [localVideoStream]);

  useEffect(() => {
    if (remoteVideoRef.current) {
      if (remoteVideoStream) {
        remoteVideoRef.current.srcObject = remoteVideoStream;
        remoteVideoRef.current.play().catch(() => {});
      } else {
        remoteVideoRef.current.srcObject = null;
      }
    }
  }, [remoteVideoStream]);

  const showSpeaker = webrtcService.supportsSpeakerToggle();
  const isVideoCall = callInfo.callType === "video";
  const hasRemoteVideo = callInfo.isRemoteVideoEnabled && remoteVideoStream;
  const hasLocalVideo = callInfo.isVideoEnabled && localVideoStream;
  const showVideoUI = hasRemoteVideo || hasLocalVideo;

  const displayName = getPeerDisplayName(callInfo);
  const avatarInitial = getAvatarInitial(callInfo);
  const peerAvatarUrl = callInfo.peerAvatarUrl;

  return (
    <div className="fixed inset-0 z-50 bg-background flex flex-col">
      {showVideoUI && (callInfo.state === "active" || callInfo.state === "connecting") ? (
        <>
          <div className="absolute inset-0 bg-black">
            {hasRemoteVideo ? (
              <video
                ref={remoteVideoRef}
                autoPlay
                playsInline
                className="w-full h-full object-cover"
              />
            ) : (
              <div className="w-full h-full flex items-center justify-center">
                <div className="w-28 h-28 rounded-full bg-card border-2 border-primary/30 flex items-center justify-center overflow-hidden">
                  {peerAvatarUrl ? (
                    <img src={peerAvatarUrl} alt={displayName} className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-3xl font-mono text-primary neon-glow">
                      {avatarInitial}
                    </span>
                  )}
                </div>
              </div>
            )}
          </div>

          {hasLocalVideo && (
            <div className="absolute top-16 right-4 w-28 h-40 rounded-2xl overflow-hidden border-2 border-white/20 shadow-lg z-10">
              <video
                ref={localVideoRef}
                autoPlay
                playsInline
                muted
                className={`w-full h-full object-cover ${callInfo.facingMode === "user" ? "-scale-x-100" : ""}`}
              />
            </div>
          )}

          <div className="absolute top-0 left-0 right-0 safe-top flex items-center justify-between px-4 z-20">
            <div>
              <p className="text-white text-sm font-medium drop-shadow-lg">
                {displayName}
              </p>
              <p className="text-white/70 text-xs drop-shadow-lg">
                {callInfo.state === "active" ? formatDuration(duration) : "Connecting..."}
              </p>
            </div>
          </div>

          <div className="absolute bottom-0 left-0 right-0 z-20 pb-safe-2">
            <div className="px-4 pb-4">
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => { triggerHaptic(8); toggleMute(); }}
                  className={`tap-scale w-12 h-12 rounded-full flex items-center justify-center transition-colors backdrop-blur-sm ${
                    callInfo.isMuted ? "bg-red-500/70 text-white" : "bg-white/20 text-white"
                  }`}
                >
                  {callInfo.isMuted ? <MicOff className="w-5 h-5" /> : <Mic className="w-5 h-5" />}
                </button>
                <button
                  onClick={() => { triggerHaptic(8); toggleVideo(); }}
                  className={`tap-scale w-12 h-12 rounded-full flex items-center justify-center transition-colors backdrop-blur-sm ${
                    !callInfo.isVideoEnabled ? "bg-red-500/70 text-white" : "bg-white/20 text-white"
                  }`}
                >
                  {callInfo.isVideoEnabled ? <Video className="w-5 h-5" /> : <VideoOff className="w-5 h-5" />}
                </button>
                {callInfo.isVideoEnabled && (
                  <button
                    onClick={() => { triggerHaptic(8); switchCamera(); }}
                    className="tap-scale w-12 h-12 rounded-full flex items-center justify-center bg-white/20 text-white backdrop-blur-sm transition-colors"
                  >
                    <SwitchCamera className="w-5 h-5" />
                  </button>
                )}
                {showSpeaker && (
                  <button
                    onClick={() => { triggerHaptic(8); toggleSpeaker(); }}
                    className={`tap-scale w-12 h-12 rounded-full flex items-center justify-center transition-colors backdrop-blur-sm ${
                      callInfo.isSpeaker ? "bg-primary/70 text-white" : "bg-white/20 text-white"
                    }`}
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>
                )}
                <button
                  onClick={handleEnd}
                  className="tap-scale w-14 h-14 rounded-full bg-destructive flex items-center justify-center shadow-lg"
                >
                  <PhoneOff className="w-6 h-6 text-destructive-foreground" />
                </button>
              </div>
            </div>
          </div>
        </>
      ) : (
        <>
          <div className="safe-top flex justify-end px-2">
            {callInfo.state !== "active" && callInfo.state !== "connecting" && (
              <button
                onClick={onClose}
                aria-label="Close"
                className="tap-scale w-11 h-11 inline-flex items-center justify-center rounded-full hover:bg-card transition-colors"
              >
                <X className="w-5 h-5 text-muted-foreground" />
              </button>
            )}
          </div>

          <div className="flex-1 flex flex-col items-center justify-center px-6">
            <div className="relative mb-8">
              <div
                className={`w-28 h-28 rounded-full bg-card border-2 border-primary/30 flex items-center justify-center overflow-hidden ${
                  isRinging ? "animate-pulse" : ""
                }`}
              >
                {peerAvatarUrl ? (
                  <img src={peerAvatarUrl} alt={displayName} className="w-full h-full object-cover" />
                ) : (
                  <span className="text-3xl font-bold text-primary neon-glow">
                    {avatarInitial}
                  </span>
                )}
              </div>
              {isRinging && pulseAnim && (
                <>
                  <div className="absolute inset-0 rounded-full border-2 border-primary/20 animate-ping" />
                  <div className="absolute -inset-3 rounded-full border border-primary/10 animate-ping ring-pulse-delayed" />
                </>
              )}
            </div>

            <h2 className="text-xl font-bold text-foreground mb-1">
              {displayName}
            </h2>

            <p className="text-sm text-muted-foreground mb-2">
              {callInfo.state === "outgoing" && (isVideoCall ? "Video calling..." : "Calling...")}
              {callInfo.state === "incoming" && (isVideoCall ? "Incoming video call" : "Incoming call")}
              {callInfo.state === "connecting" && "Connecting..."}
              {callInfo.state === "active" && formatDuration(duration)}
              {callInfo.state === "ended" && "Call ended"}
              {callInfo.state === "rejected" && "Call rejected"}
              {callInfo.state === "missed" && "Missed call"}
            </p>

            {isVideoCall && isRinging && (
              <div className="flex items-center gap-1.5 text-xs text-primary mb-4">
                <Video className="w-4 h-4" />
                <span>Video Call</span>
              </div>
            )}
          </div>

          <div className="px-4 pb-safe-3">
            {callInfo.state === "incoming" && (
              <div className="flex items-center justify-center gap-10">
                <button
                  onClick={handleReject}
                  className="tap-scale w-16 h-16 rounded-full bg-destructive flex items-center justify-center shadow-lg"
                >
                  <PhoneOff className="w-7 h-7 text-destructive-foreground" />
                </button>
                <button
                  onClick={handleAccept}
                  className="tap-scale w-16 h-16 rounded-full bg-primary flex items-center justify-center shadow-lg animate-bounce"
                >
                  {isVideoCall ? (
                    <Video className="w-7 h-7 text-primary-foreground" />
                  ) : (
                    <Phone className="w-7 h-7 text-primary-foreground" />
                  )}
                </button>
              </div>
            )}

            {callInfo.state === "outgoing" && (
              <div className="flex justify-center">
                <button
                  onClick={handleEnd}
                  className="tap-scale w-16 h-16 rounded-full bg-destructive flex items-center justify-center shadow-lg"
                >
                  <PhoneOff className="w-7 h-7 text-destructive-foreground" />
                </button>
              </div>
            )}

            {(callInfo.state === "active" || callInfo.state === "connecting") && (
              <div className="flex items-center justify-center gap-3">
                <button
                  onClick={() => { triggerHaptic(8); toggleMute(); }}
                  className={`tap-scale w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                    callInfo.isMuted ? "bg-destructive/20 text-destructive" : "bg-card border border-border text-foreground"
                  }`}
                >
                  {callInfo.isMuted ? <MicOff className="w-6 h-6" /> : <Mic className="w-6 h-6" />}
                </button>
                <button
                  onClick={() => { triggerHaptic(8); toggleVideo(); }}
                  className={`tap-scale w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                    callInfo.isVideoEnabled ? "bg-primary/20 text-primary" : "bg-card border border-border text-foreground"
                  }`}
                >
                  {callInfo.isVideoEnabled ? <Video className="w-6 h-6" /> : <VideoOff className="w-6 h-6" />}
                </button>
                {showSpeaker && (
                  <button
                    onClick={() => { triggerHaptic(8); toggleSpeaker(); }}
                    className={`tap-scale w-14 h-14 rounded-full flex items-center justify-center transition-colors ${
                      callInfo.isSpeaker ? "bg-primary/20 text-primary" : "bg-card border border-border text-foreground"
                    }`}
                  >
                    <Volume2 className="w-6 h-6" />
                  </button>
                )}
                <button
                  onClick={handleEnd}
                  className="tap-scale w-16 h-16 rounded-full bg-destructive flex items-center justify-center shadow-lg"
                >
                  <PhoneOff className="w-7 h-7 text-destructive-foreground" />
                </button>
              </div>
            )}

            {(callInfo.state === "ended" || callInfo.state === "rejected" || callInfo.state === "missed") && (
              <div className="flex justify-center">
                <p className="text-sm text-muted-foreground">Returning to chat...</p>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
