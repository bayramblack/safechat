import { useCallback, useState } from "react";
import { getMyUserId } from "@/lib/chat-store";
import { useSwipeBack } from "@/hooks/useSwipeBack";
import { useChatMessages } from "@/hooks/useChatMessages";
import { useChatSocket } from "@/hooks/useChatSocket";
import { useTypingIndicator } from "@/hooks/useTypingIndicator";
import { useMessageSender } from "@/hooks/useMessageSender";
import { useFileUpload } from "@/hooks/useFileUpload";
import { useVoiceRecorder } from "@/hooks/useVoiceRecorder";
import { useVideoRecorder } from "@/hooks/useVideoRecorder";
import { ChatHeader } from "@/components/chat/ChatHeader";
import { MessageList } from "@/components/chat/MessageList";
import { MessageComposer } from "@/components/chat/MessageComposer";
import { ImagePreviewBar } from "@/components/chat/ImagePreviewBar";
import { UploadProgressBar } from "@/components/chat/UploadProgressBar";
import { VoiceRecordingBar } from "@/components/chat/VoiceRecordingBar";
import { VideoCaptureSheet } from "@/components/chat/VideoCaptureSheet";

interface ChatScreenProps {
  conversationId: number;
  myAddress: string;
  onBack: () => void;
  onCall: (conversationId: number, peerId: number, peerAddress: string) => void;
  onVideoCall: (conversationId: number, peerId: number, peerAddress: string) => void;
}

export default function ChatScreen({
  conversationId,
  onBack,
  onCall,
  onVideoCall,
}: ChatScreenProps) {
  const myUserId = getMyUserId();
  const chat = useChatMessages(conversationId);
  useChatSocket(conversationId);
  useSwipeBack(onBack);

  const [previewImage, setPreviewImage] = useState<{ url: string; file: File } | null>(null);

  const sendText = useMessageSender(conversationId);
  const { sendFile, progress, isUploading } = useFileUpload(conversationId);
  const { notifyTyping } = useTypingIndicator(conversationId);

  const handleVoiceComplete = useCallback(
    (file: File, duration: number) => {
      sendFile(file, "voice", duration);
    },
    [sendFile],
  );

  const handleVideoComplete = useCallback(
    (file: File, duration: number) => {
      sendFile(file, "video", duration);
    },
    [sendFile],
  );

  const voice = useVoiceRecorder({ onComplete: handleVoiceComplete });
  const video = useVideoRecorder({ onComplete: handleVideoComplete });

  const handlePickImage = useCallback((file: File) => {
    const url = URL.createObjectURL(file);
    setPreviewImage({ url, file });
  }, []);

  const handlePickFile = useCallback(
    (file: File) => {
      sendFile(file, "file");
    },
    [sendFile],
  );

  const sendImage = useCallback(() => {
    if (!previewImage) return;
    sendFile(previewImage.file, "image");
    URL.revokeObjectURL(previewImage.url);
    setPreviewImage(null);
  }, [previewImage, sendFile]);

  const cancelImage = useCallback(() => {
    if (previewImage) URL.revokeObjectURL(previewImage.url);
    setPreviewImage(null);
  }, [previewImage]);

  const handleCall = useCallback(() => {
    if (!chat) return;
    onCall(conversationId, chat.peerUserId, chat.peerAddress);
  }, [chat, conversationId, onCall]);

  const handleVideoCall = useCallback(() => {
    if (!chat) return;
    onVideoCall(conversationId, chat.peerUserId, chat.peerAddress);
  }, [chat, conversationId, onVideoCall]);

  if (!chat) return null;

  return (
    <div className="flex flex-col h-full bg-background">
      <ChatHeader
        peerAddress={chat.peerAddress}
        peerDisplayName={chat.peerDisplayName}
        peerAvatarUrl={chat.peerAvatarUrl}
        isOnline={chat.isOnline}
        isTyping={chat.isTyping}
        lastSeen={chat.lastSeen}
        onBack={onBack}
        onCall={handleCall}
        onVideoCall={handleVideoCall}
      />

      <MessageList
        messages={chat.messages}
        myUserId={myUserId}
        isTyping={chat.isTyping}
      />

      {isUploading && <UploadProgressBar progress={progress} />}

      {previewImage && (
        <ImagePreviewBar
          url={previewImage.url}
          onCancel={cancelImage}
          onSend={sendImage}
          disabled={isUploading}
        />
      )}

      {video.isCaptureOpen && (
        <VideoCaptureSheet
          videoRef={video.videoRef}
          isRecording={video.isRecording}
          isSwitchingCamera={video.isSwitching}
          recordingTime={video.seconds}
          previewUrl={video.previewUrl}
          uploading={isUploading}
          onSwitchCamera={video.switchCamera}
          onStartRecording={video.startRecording}
          onStopRecording={video.stopRecording}
          onCancel={video.cancel}
          onSend={video.sendCaptured}
        />
      )}

      {voice.isRecording && (
        <VoiceRecordingBar
          seconds={voice.seconds}
          onCancel={voice.cancel}
          onStop={voice.stop}
        />
      )}

      {!voice.isRecording && !video.isCaptureOpen && (
        <MessageComposer
          onSendText={sendText}
          onTyping={notifyTyping}
          onPickImage={handlePickImage}
          onPickFile={handlePickFile}
          onStartVoice={voice.start}
          onStopVoice={voice.stop}
          onCancelVoice={voice.cancel}
          onStartVideo={() => video.open("user")}
        />
      )}
    </div>
  );
}
