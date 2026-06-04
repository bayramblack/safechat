import { useEffect, useRef, useState, memo, type CSSProperties } from "react";
import { Pause, Play } from "lucide-react";

interface VoiceMessagePlayerProps {
  src: string;
  duration?: number;
  isMine: boolean;
}

function VoiceMessagePlayerImpl({ src, duration, isMine }: VoiceMessagePlayerProps) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const [playing, setPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [audioDuration, setAudioDuration] = useState(duration || 0);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    const onTime = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setProgress(audio.currentTime / audio.duration);
        setAudioDuration(Math.round(audio.duration));
      }
    };
    const onEnd = () => {
      setPlaying(false);
      setProgress(0);
    };
    const onLoaded = () => {
      if (audio.duration && isFinite(audio.duration)) setAudioDuration(Math.round(audio.duration));
    };
    audio.addEventListener("timeupdate", onTime);
    audio.addEventListener("ended", onEnd);
    audio.addEventListener("loadedmetadata", onLoaded);
    return () => {
      audio.removeEventListener("timeupdate", onTime);
      audio.removeEventListener("ended", onEnd);
      audio.removeEventListener("loadedmetadata", onLoaded);
    };
  }, []);

  const toggle = () => {
    if (!audioRef.current) return;
    if (playing) {
      audioRef.current.pause();
      setPlaying(false);
    } else {
      audioRef.current.play();
      setPlaying(true);
    }
  };

  const formatSec = (s: number) => {
    const m = Math.floor(s / 60);
    const sec = s % 60;
    return `${m}:${sec.toString().padStart(2, "0")}`;
  };

  return (
    <div className="flex items-center gap-2 min-w-[140px]">
      <audio ref={audioRef} src={src} preload="metadata" />
      <button
        onClick={toggle}
        className={`w-8 h-8 rounded-full flex items-center justify-center shrink-0 ${
          isMine ? "bg-primary-foreground/20" : "bg-primary/20"
        }`}
      >
        {playing ? (
          <Pause className={`w-4 h-4 ${isMine ? "text-primary-foreground" : "text-primary"}`} />
        ) : (
          <Play className={`w-4 h-4 ${isMine ? "text-primary-foreground" : "text-primary"}`} />
        )}
      </button>
      <div className="flex-1 flex flex-col gap-1">
        <div
          className={`h-1.5 rounded-full overflow-hidden ${isMine ? "bg-primary-foreground/20" : "bg-primary/20"}`}
          style={{ "--progress": progress * 100 } as CSSProperties}
        >
          <div
            className={`progress-fill h-full rounded-full ${isMine ? "bg-primary-foreground/60" : "bg-primary/60"}`}
          />
        </div>
        <span className={`text-[10px] ${isMine ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
          {formatSec(audioDuration)}
        </span>
      </div>
    </div>
  );
}

export const VoiceMessagePlayer = memo(VoiceMessagePlayerImpl);
