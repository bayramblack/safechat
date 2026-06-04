import { socketService } from "./socket";
import { stopAllMediaTracks } from "./media-cleanup";

export type CallState =
  | "idle"
  | "outgoing"
  | "incoming"
  | "connecting"
  | "active"
  | "ended"
  | "missed"
  | "rejected";

export type CallType = "voice" | "video";

export interface CallInfo {
  peerAddress: string;
  peerUsername?: string;
  peerAvatarUrl?: string;
  state: CallState;
  startTime?: number;
  isMuted: boolean;
  isSpeaker: boolean;
  callSessionId?: number;
  peerId?: number;
  conversationId?: number;
  callType: CallType;
  isVideoEnabled: boolean;
  isRemoteVideoEnabled: boolean;
  facingMode: "user" | "environment";
}

type CallStateHandler = (info: CallInfo) => void;

class WebRTCService {
  private peerConnection: RTCPeerConnection | null = null;
  private localStream: MediaStream | null = null;
  private localVideoStream: MediaStream | null = null;
  private remoteAudio: HTMLAudioElement | null = null;
  private remoteVideoStream: MediaStream | null = null;
  private callInfo: CallInfo = {
    peerAddress: "",
    state: "idle",
    isMuted: false,
    isSpeaker: false,
    callType: "voice",
    isVideoEnabled: false,
    isRemoteVideoEnabled: false,
    facingMode: "user",
  };
  private handlers: Set<CallStateHandler> = new Set();
  private boundHandlers: Record<string, (...args: unknown[]) => void> = {};
  private pendingCandidates: RTCIceCandidateInit[] = [];
  private outboundCandidates: RTCIceCandidateInit[] = [];
  private videoSender: RTCRtpSender | null = null;

  private eventsRegistered = false;

  private readonly iceConfig: RTCConfiguration = {
    iceServers: [
      { urls: "stun:stun.l.google.com:19302" },
      { urls: "stun:stun1.l.google.com:19302" },
      { urls: "stun:stun2.l.google.com:19302" },
      { urls: "stun:stun3.l.google.com:19302" },
      { urls: "stun:stun4.l.google.com:19302" },
      {
        urls: "turn:openrelay.metered.ca:80",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
      {
        urls: "turn:openrelay.metered.ca:443?transport=tcp",
        username: "openrelayproject",
        credential: "openrelayproject",
      },
    ],
  };

  private remoteVideoHandlers: Set<(stream: MediaStream | null) => void> = new Set();
  private localVideoHandlers: Set<(stream: MediaStream | null) => void> = new Set();

  constructor() {
    this.setupSocketListeners();
  }

  private setupSocketListeners(): void {
    this.boundHandlers = {
      call_initiate: (data: unknown) => this.handleIncomingCall(data as { callSessionId: number; callerId: number; conversationId: number; offer?: RTCSessionDescriptionInit; callType?: CallType; callerUsername?: string | null; callerWalletAddress?: string; callerAvatarUrl?: string | null }),
      call_accept: (data: unknown) => this.handleCallAccepted(data as { callSessionId: number }),
      call_reject: (data: unknown) => this.handleCallRejected(data as { callSessionId: number }),
      call_end: (data: unknown) => this.handleCallEnded(data as { callSessionId: number }),
      call_ringing: (data: unknown) => this.handleRinging(data as { callSessionId: number }),
      ice_candidate: (data: unknown) => this.handleIceCandidate(data as { callSessionId: number; candidate: RTCIceCandidateInit; fromUserId: number }),
      call_offer: (data: unknown) => this.handleRemoteOffer(data as { callSessionId: number; offer: RTCSessionDescriptionInit; fromUserId: number }),
      call_answer: (data: unknown) => this.handleRemoteAnswer(data as { callSessionId: number; answer: RTCSessionDescriptionInit; fromUserId: number }),
      enable_video: (data: unknown) => this.handleRemoteVideoEnabled(data as { callSessionId: number; fromUserId: number }),
      disable_video: (data: unknown) => this.handleRemoteVideoDisabled(data as { callSessionId: number; fromUserId: number }),
    };
  }

  registerSocketEvents(): void {
    if (this.eventsRegistered) return;
    this.eventsRegistered = true;
    Object.entries(this.boundHandlers).forEach(([event, handler]) => {
      socketService.on(event, handler);
    });
  }

  unregisterSocketEvents(): void {
    if (!this.eventsRegistered) return;
    this.eventsRegistered = false;
    Object.entries(this.boundHandlers).forEach(([event, handler]) => {
      socketService.off(event, handler);
    });
  }

  onCallStateChange(handler: CallStateHandler): () => void {
    this.handlers.add(handler);
    return () => this.handlers.delete(handler);
  }

  onRemoteVideoStream(handler: (stream: MediaStream | null) => void): () => void {
    this.remoteVideoHandlers.add(handler);
    return () => this.remoteVideoHandlers.delete(handler);
  }

  onLocalVideoStream(handler: (stream: MediaStream | null) => void): () => void {
    this.localVideoHandlers.add(handler);
    return () => this.localVideoHandlers.delete(handler);
  }

  private notifyRemoteVideo(stream: MediaStream | null): void {
    this.remoteVideoHandlers.forEach((h) => h(stream));
  }

  private notifyLocalVideo(stream: MediaStream | null): void {
    this.localVideoHandlers.forEach((h) => h(stream));
  }

  private notify(): void {
    this.handlers.forEach((h) => h({ ...this.callInfo }));
  }

  getCallInfo(): CallInfo {
    return { ...this.callInfo };
  }

  getLocalVideoStream(): MediaStream | null {
    return this.localVideoStream;
  }

  getRemoteVideoStream(): MediaStream | null {
    return this.remoteVideoStream;
  }

  private async checkPermission(name: "microphone" | "camera"): Promise<boolean> {
    try {
      if (navigator.permissions && navigator.permissions.query) {
        const result = await navigator.permissions.query({ name: name as PermissionName });
        return result.state !== "denied";
      }
      return true;
    } catch {
      return true;
    }
  }

  private createPeerConnection(): RTCPeerConnection {
    const pc = new RTCPeerConnection(this.iceConfig);

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        if (this.callInfo.callSessionId && this.callInfo.peerId) {
          socketService.emit("ice_candidate", {
            callSessionId: this.callInfo.callSessionId,
            targetUserId: this.callInfo.peerId,
            candidate: event.candidate.toJSON(),
          });
        } else {
          this.outboundCandidates.push(event.candidate.toJSON());
        }
      }
    };

    pc.ontrack = (event) => {
      const track = event.track;
      if (track.kind === "video") {
        const stream = event.streams[0] || new MediaStream([track]);
        this.remoteVideoStream = stream;
        this.callInfo.isRemoteVideoEnabled = true;
        this.notify();
        this.notifyRemoteVideo(stream);

        track.onended = () => {
          this.remoteVideoStream = null;
          this.callInfo.isRemoteVideoEnabled = false;
          this.notify();
          this.notifyRemoteVideo(null);
        };

        track.onmute = () => {
          this.callInfo.isRemoteVideoEnabled = false;
          this.notify();
          this.notifyRemoteVideo(null);
        };

        track.onunmute = () => {
          this.callInfo.isRemoteVideoEnabled = true;
          this.notify();
          this.notifyRemoteVideo(this.remoteVideoStream);
        };
      } else if (track.kind === "audio") {
        if (!this.remoteAudio) {
          this.remoteAudio = document.createElement("audio");
          this.remoteAudio.autoplay = true;
          this.remoteAudio.setAttribute("playsinline", "true");
          document.body.appendChild(this.remoteAudio);
        }
        const stream = event.streams[0] || new MediaStream([track]);
        this.remoteAudio.srcObject = stream;
        try {
          this.remoteAudio.play().catch((e) => {
            console.warn("[WebRTC] Remote audio play() failed (may need user interaction):", e);
          });
        } catch (e) {
          console.warn("[WebRTC] Remote audio play() threw:", e);
        }
      }
    };

    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") {
        if (this.callInfo.state !== "active") {
          this.callInfo.state = "active";
          this.callInfo.startTime = Date.now();
          this.notify();
        }
      } else if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        this.endCall();
      }
    };

    return pc;
  }

  private async addPendingCandidates(): Promise<void> {
    if (!this.peerConnection || !this.peerConnection.remoteDescription) return;
    for (const candidate of this.pendingCandidates) {
      try {
        await this.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
      } catch {
      }
    }
    this.pendingCandidates = [];
  }

  async startCall(conversationId: number, receiverId: number, peerAddress: string, callType: CallType = "voice", peerUsername?: string, peerAvatarUrl?: string): Promise<void> {
    const micAllowed = await this.checkPermission("microphone");
    if (!micAllowed) {
      throw new Error("Microphone permission denied");
    }

    if (callType === "video") {
      const camAllowed = await this.checkPermission("camera");
      if (!camAllowed) {
        throw new Error("Camera permission denied");
      }
    }

    this.callInfo = {
      peerAddress,
      peerUsername,
      peerAvatarUrl,
      state: "outgoing",
      isMuted: false,
      isSpeaker: false,
      peerId: receiverId,
      conversationId,
      callType,
      isVideoEnabled: callType === "video",
      isRemoteVideoEnabled: false,
      facingMode: "user",
    };
    this.pendingCandidates = [];
    this.notify();

    try {
      const constraints: MediaStreamConstraints = { audio: true };
      if (callType === "video") {
        constraints.video = { facingMode: "user" };
      }

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.peerConnection = this.createPeerConnection();

      this.localStream.getAudioTracks().forEach((track) => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      if (callType === "video") {
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
          this.localVideoStream = new MediaStream([videoTrack]);
          this.videoSender = this.peerConnection.addTrack(videoTrack, this.localStream);
          this.notifyLocalVideo(this.localVideoStream);
        }
      }

      const offer = await this.peerConnection.createOffer();
      await this.peerConnection.setLocalDescription(offer);

      socketService.emit("call_initiate", {
        conversationId,
        receiverId,
        offer: { type: offer.type, sdp: offer.sdp },
        callType,
      });
    } catch (err) {
      this.endCall();
      throw err;
    }
  }

  private flushOutboundCandidates(): void {
    if (!this.callInfo.callSessionId || !this.callInfo.peerId) return;
    for (const candidate of this.outboundCandidates) {
      socketService.emit("ice_candidate", {
        callSessionId: this.callInfo.callSessionId,
        targetUserId: this.callInfo.peerId,
        candidate,
      });
    }
    this.outboundCandidates = [];
  }

  private handleRinging(data: { callSessionId: number }): void {
    if (this.callInfo.state === "outgoing") {
      this.callInfo.callSessionId = data.callSessionId;
      this.flushOutboundCandidates();
      this.notify();
    }
  }

  private handleIncomingCall(data: {
    callSessionId: number;
    callerId: number;
    conversationId: number;
    offer?: RTCSessionDescriptionInit;
    callType?: CallType;
    callerUsername?: string | null;
    callerWalletAddress?: string;
    callerAvatarUrl?: string | null;
  }): void {
    if (this.callInfo.state !== "idle") {
      socketService.emit("call_reject", { callSessionId: data.callSessionId });
      return;
    }

    const incomingType = data.callType || "voice";

    this.callInfo = {
      peerAddress: data.callerWalletAddress || `user:${data.callerId}`,
      peerUsername: data.callerUsername || undefined,
      peerAvatarUrl: data.callerAvatarUrl || undefined,
      state: "incoming",
      isMuted: false,
      isSpeaker: false,
      callSessionId: data.callSessionId,
      peerId: data.callerId,
      conversationId: data.conversationId,
      callType: incomingType,
      isVideoEnabled: false,
      isRemoteVideoEnabled: false,
      facingMode: "user",
    };
    this.pendingCandidates = [];
    this.notify();
  }

  async acceptCall(): Promise<void> {
    if (!this.callInfo.callSessionId) return;
    const micAllowed = await this.checkPermission("microphone");
    if (!micAllowed) {
      this.rejectCall();
      return;
    }

    const isVideo = this.callInfo.callType === "video";
    if (isVideo) {
      const camAllowed = await this.checkPermission("camera");
      if (!camAllowed) {
        this.callInfo.callType = "voice";
      }
    }

    this.callInfo.state = "connecting";
    this.notify();

    try {
      const constraints: MediaStreamConstraints = { audio: true };
      if (this.callInfo.callType === "video") {
        constraints.video = { facingMode: "user" };
        this.callInfo.isVideoEnabled = true;
      }

      this.localStream = await navigator.mediaDevices.getUserMedia(constraints);
      this.peerConnection = this.createPeerConnection();

      this.localStream.getAudioTracks().forEach((track) => {
        this.peerConnection!.addTrack(track, this.localStream!);
      });

      if (this.callInfo.callType === "video") {
        const videoTrack = this.localStream.getVideoTracks()[0];
        if (videoTrack) {
          this.localVideoStream = new MediaStream([videoTrack]);
          this.videoSender = this.peerConnection.addTrack(videoTrack, this.localStream);
          this.notifyLocalVideo(this.localVideoStream);
        }
      }

      this.notify();

      socketService.emit("call_accept", {
        callSessionId: this.callInfo.callSessionId,
      });
    } catch {
      this.endCall();
    }
  }

  private async handleCallAccepted(data: { callSessionId: number }): Promise<void> {
    if (this.callInfo.callSessionId !== data.callSessionId) return;
    this.callInfo.state = "connecting";
    this.notify();

    if (this.peerConnection && this.peerConnection.localDescription) {
      socketService.emit("call_offer", {
        callSessionId: data.callSessionId,
        targetUserId: this.callInfo.peerId,
        offer: {
          type: this.peerConnection.localDescription.type,
          sdp: this.peerConnection.localDescription.sdp,
        },
      });
    }
  }

  private async handleRemoteOffer(data: { callSessionId: number; offer: RTCSessionDescriptionInit; fromUserId: number }): Promise<void> {
    if (this.callInfo.callSessionId !== data.callSessionId) return;
    if (!this.peerConnection) return;

    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.offer));
      await this.addPendingCandidates();

      const answer = await this.peerConnection.createAnswer();
      await this.peerConnection.setLocalDescription(answer);

      socketService.emit("call_answer", {
        callSessionId: data.callSessionId,
        targetUserId: data.fromUserId,
        answer: { type: answer.type, sdp: answer.sdp },
      });

      this.callInfo.state = "active";
      this.callInfo.startTime = Date.now();
      this.notify();
    } catch {
      this.endCall();
    }
  }

  private async handleRemoteAnswer(data: { callSessionId: number; answer: RTCSessionDescriptionInit; fromUserId: number }): Promise<void> {
    if (this.callInfo.callSessionId !== data.callSessionId) return;
    if (!this.peerConnection) return;

    try {
      await this.peerConnection.setRemoteDescription(new RTCSessionDescription(data.answer));
      await this.addPendingCandidates();

      this.callInfo.state = "active";
      this.callInfo.startTime = Date.now();
      this.notify();
    } catch {
      this.endCall();
    }
  }

  private async handleIceCandidate(data: { callSessionId: number; candidate: RTCIceCandidateInit; fromUserId: number }): Promise<void> {
    if (this.callInfo.callSessionId !== data.callSessionId) return;

    if (!this.peerConnection || !this.peerConnection.remoteDescription) {
      this.pendingCandidates.push(data.candidate);
      return;
    }

    try {
      await this.peerConnection.addIceCandidate(new RTCIceCandidate(data.candidate));
    } catch {
    }
  }

  private handleCallRejected(data: { callSessionId: number }): void {
    if (this.callInfo.callSessionId !== data.callSessionId) return;
    this.callInfo.state = "rejected";
    this.notify();
    this.cleanup();
    setTimeout(() => {
      this.resetCallInfo();
      this.notify();
    }, 1500);
  }

  private handleCallEnded(data: { callSessionId: number }): void {
    if (this.callInfo.callSessionId !== data.callSessionId) return;
    this.callInfo.state = "ended";
    this.notify();
    this.cleanup();
    setTimeout(() => {
      this.resetCallInfo();
      this.notify();
    }, 1500);
  }

  private handleRemoteVideoEnabled(data: { callSessionId: number; fromUserId: number }): void {
    if (this.callInfo.callSessionId !== data.callSessionId) return;
    this.callInfo.isRemoteVideoEnabled = true;
    if (this.callInfo.callType === "voice") {
      this.callInfo.callType = "video";
    }
    this.notify();
  }

  private async handleRemoteVideoDisabled(data: { callSessionId: number; fromUserId: number }): Promise<void> {
    if (this.callInfo.callSessionId !== data.callSessionId) return;
    this.callInfo.isRemoteVideoEnabled = false;
    this.remoteVideoStream = null;
    this.notifyRemoteVideo(null);

    if (this.callInfo.isVideoEnabled) {
      if (this.localVideoStream) {
        this.localVideoStream.getTracks().forEach((t) => t.stop());
        this.localVideoStream = null;
      }
      if (this.videoSender && this.peerConnection) {
        await this.videoSender.replaceTrack(null);
      }
      this.callInfo.isVideoEnabled = false;
      this.notifyLocalVideo(null);
    }

    this.callInfo.callType = "voice";
    this.notify();
  }

  rejectCall(): void {
    if (this.callInfo.callSessionId) {
      socketService.emit("call_reject", { callSessionId: this.callInfo.callSessionId });
    }
    this.callInfo.state = "rejected";
    this.notify();
    this.cleanup();
    setTimeout(() => {
      this.resetCallInfo();
      this.notify();
    }, 500);
  }

  private static detectPlatform(): { isIOS: boolean; isAndroid: boolean; isMobile: boolean } {
    const ua = navigator.userAgent || "";
    const isIOS = /iPad|iPhone|iPod/.test(ua) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
    const isAndroid = /Android/i.test(ua);
    return { isIOS, isAndroid, isMobile: isIOS || isAndroid };
  }

  private static get canSetSinkId(): boolean {
    return typeof HTMLMediaElement.prototype.setSinkId === "function";
  }

  toggleMute(): void {
    this.callInfo.isMuted = !this.callInfo.isMuted;
    if (this.localStream) {
      const audioTracks = this.localStream.getAudioTracks();
      audioTracks.forEach((track) => {
        track.enabled = !this.callInfo.isMuted;
      });

      if (this.peerConnection) {
        const senders = this.peerConnection.getSenders().filter((s) => s.track?.kind === "audio");
        for (const sender of senders) {
          const localTrack = audioTracks[0];
          if (localTrack && sender.track !== localTrack) {
            try {
              sender.replaceTrack(localTrack).catch((e: unknown) => {
                console.warn("[WebRTC] Failed to replace sender audio track:", e);
              });
            } catch (e) {
              console.warn("[WebRTC] replaceTrack threw:", e);
            }
          }
        }
      }
    }
    this.notify();
  }

  supportsSpeakerToggle(): boolean {
    const { isMobile } = WebRTCService.detectPlatform();
    return isMobile || WebRTCService.canSetSinkId;
  }

  async toggleSpeaker(): Promise<void> {
    const platform = WebRTCService.detectPlatform();
    const newSpeaker = !this.callInfo.isSpeaker;

    if (!WebRTCService.canSetSinkId) {
      this.callInfo.isSpeaker = newSpeaker;
      if (platform.isIOS) {
        console.warn("[WebRTC] setSinkId not supported on iOS; speaker toggle is visual-only");
      } else if (platform.isAndroid) {
        console.warn("[WebRTC] setSinkId not supported on this Android device; speaker toggle is visual-only");
      }
      this.notify();
      return;
    }

    const audioEl = this.remoteAudio as HTMLAudioElement & { setSinkId?: (id: string) => Promise<void> } | null;
    if (!audioEl || typeof audioEl.setSinkId !== "function") {
      this.callInfo.isSpeaker = newSpeaker;
      this.notify();
      return;
    }

    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const audioOutputs = devices.filter((d) => d.kind === "audiooutput");
      if (newSpeaker) {
        const speaker = audioOutputs.find((d) => d.label.toLowerCase().includes("speaker")) || audioOutputs[0];
        if (speaker) {
          await audioEl.setSinkId(speaker.deviceId);
        }
      } else {
        await audioEl.setSinkId("");
      }
      this.callInfo.isSpeaker = newSpeaker;
    } catch (e) {
      console.warn("[WebRTC] setSinkId failed, toggling visual state only:", e);
      this.callInfo.isSpeaker = newSpeaker;
    }
    this.notify();
  }

  async enableVideo(): Promise<void> {
    if (!this.peerConnection || this.callInfo.state !== "active") return;

    try {
      const videoStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: this.callInfo.facingMode },
      });
      const videoTrack = videoStream.getVideoTracks()[0];
      if (!videoTrack) return;

      this.localVideoStream = new MediaStream([videoTrack]);

      if (this.videoSender) {
        await this.videoSender.replaceTrack(videoTrack);
      } else {
        this.videoSender = this.peerConnection.addTrack(videoTrack, videoStream);

        const offer = await this.peerConnection.createOffer();
        await this.peerConnection.setLocalDescription(offer);

        socketService.emit("call_offer", {
          callSessionId: this.callInfo.callSessionId,
          targetUserId: this.callInfo.peerId,
          offer: { type: offer.type, sdp: offer.sdp },
        });
      }

      this.callInfo.isVideoEnabled = true;
      this.callInfo.callType = "video";
      this.notify();
      this.notifyLocalVideo(this.localVideoStream);

      if (this.callInfo.callSessionId && this.callInfo.peerId) {
        socketService.emit("enable_video", {
          callSessionId: this.callInfo.callSessionId,
          targetUserId: this.callInfo.peerId,
        });
      }
    } catch {
    }
  }

  async disableVideo(): Promise<void> {
    if (this.localVideoStream) {
      this.localVideoStream.getTracks().forEach((t) => t.stop());
      this.localVideoStream = null;
    }

    if (this.videoSender && this.peerConnection) {
      await this.videoSender.replaceTrack(null);
    }

    this.callInfo.isVideoEnabled = false;
    if (!this.callInfo.isRemoteVideoEnabled) {
      this.callInfo.callType = "voice";
    }
    this.notify();
    this.notifyLocalVideo(null);

    if (this.callInfo.callSessionId && this.callInfo.peerId) {
      socketService.emit("disable_video", {
        callSessionId: this.callInfo.callSessionId,
        targetUserId: this.callInfo.peerId,
      });
    }
  }

  async toggleVideo(): Promise<void> {
    if (this.callInfo.isVideoEnabled) {
      await this.disableVideo();
    } else {
      await this.enableVideo();
    }
  }

  async switchCamera(): Promise<void> {
    if (!this.callInfo.isVideoEnabled || !this.localVideoStream) return;

    const newMode = this.callInfo.facingMode === "user" ? "environment" : "user";

    try {
      this.localVideoStream.getTracks().forEach((t) => t.stop());

      const newStream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: newMode },
      });
      const newTrack = newStream.getVideoTracks()[0];
      if (!newTrack) {
        await this.disableVideo();
        return;
      }

      this.localVideoStream = new MediaStream([newTrack]);
      this.callInfo.facingMode = newMode;

      if (this.videoSender) {
        await this.videoSender.replaceTrack(newTrack);
      }

      this.notify();
      this.notifyLocalVideo(this.localVideoStream);
    } catch {
      this.callInfo.isVideoEnabled = false;
      this.localVideoStream = null;
      this.notifyLocalVideo(null);
      this.notify();
    }
  }

  endCall(): void {
    if (this.callInfo.callSessionId) {
      socketService.emit("call_end", { callSessionId: this.callInfo.callSessionId });
    }
    this.callInfo.state = "ended";
    this.notify();
    this.cleanup();
    setTimeout(() => {
      this.resetCallInfo();
      this.notify();
    }, 1500);
  }

  private resetCallInfo(): void {
    this.callInfo = {
      peerAddress: "",
      state: "idle",
      isMuted: false,
      isSpeaker: false,
      callType: "voice",
      isVideoEnabled: false,
      isRemoteVideoEnabled: false,
      facingMode: "user",
    };
  }

  private releaseAllMedia(): void {
    const tracksToStop: MediaStreamTrack[] = [];

    if (this.localStream) {
      this.localStream.getTracks().forEach((t) => tracksToStop.push(t));
    }
    if (this.localVideoStream) {
      this.localVideoStream.getTracks().forEach((t) => tracksToStop.push(t));
    }

    if (this.peerConnection) {
      try {
        const senders = this.peerConnection.getSenders();
        for (const sender of senders) {
          if (sender.track) {
            tracksToStop.push(sender.track);
            try { sender.replaceTrack(null); } catch {}
          }
          try { this.peerConnection!.removeTrack(sender); } catch {}
        }
      } catch {}
      this.peerConnection.close();
      this.peerConnection = null;
    }

    if (this.remoteAudio) {
      this.remoteAudio.pause();
      this.remoteAudio.srcObject = null;
      this.remoteAudio.remove();
      this.remoteAudio = null;
    }

    const stopped = new Set<string>();
    for (const track of tracksToStop) {
      if (!stopped.has(track.id)) {
        track.stop();
        stopped.add(track.id);
      }
    }

    if (this.localStream) {
      this.localStream = null;
    }
    if (this.localVideoStream) {
      this.localVideoStream = null;
      this.notifyLocalVideo(null);
    }

    this.videoSender = null;
    this.remoteVideoStream = null;
    this.notifyRemoteVideo(null);

    stopAllMediaTracks();
  }

  private cleanup(): void {
    this.pendingCandidates = [];
    this.outboundCandidates = [];
    this.releaseAllMedia();
  }

  cleanupMedia(): void {
    this.releaseAllMedia();
  }

  getCallDuration(): number {
    if (!this.callInfo.startTime) return 0;
    return Math.floor((Date.now() - this.callInfo.startTime) / 1000);
  }

  formatDuration(seconds: number): string {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  }
}

export const webrtcService = new WebRTCService();
