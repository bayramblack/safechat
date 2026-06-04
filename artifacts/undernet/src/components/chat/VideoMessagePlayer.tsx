import { memo } from "react";

interface VideoMessagePlayerProps {
  src: string;
  isMine: boolean;
}

function VideoMessagePlayerImpl({ src }: VideoMessagePlayerProps) {
  return (
    <div className="mb-1.5 -mx-1 -mt-0.5">
      <video
        src={src}
        controls
        playsInline
        preload="metadata"
        className="rounded-xl w-full max-w-full max-h-60"
      />
    </div>
  );
}

export const VideoMessagePlayer = memo(VideoMessagePlayerImpl);
