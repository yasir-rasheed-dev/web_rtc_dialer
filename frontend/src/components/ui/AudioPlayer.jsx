import { useEffect, useRef, useState } from "react";
import { Pause, Play, Volume2, VolumeX } from "lucide-react";

function formatTime(seconds) {
  if (!Number.isFinite(seconds) || seconds < 0) return "0:00";
  const total = Math.floor(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/**
 * Themed replacement for the browser's native `<audio controls>` (which
 * renders as an unstyled OS-chrome pill that ignores light/dark mode) —
 * used everywhere a call recording or voicemail gets played back. The real
 * `<audio>` element stays mounted but visually hidden; every control here
 * just drives it directly through a ref, matching the same "own the media
 * element, render custom chrome around it" pattern the app already uses in
 * DesktopCallBridge.jsx for live call audio.
 */
export default function AudioPlayer({ src, autoPlay = true, className = "" }) {
  const audioRef = useRef(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [muted, setMuted] = useState(false);
  const [seeking, setSeeking] = useState(false);

  // A single player instance gets reused across different tracks (the
  // parent just swaps `src` on the same mounted component) — reset the
  // transport state so the previous track's progress bar doesn't flash
  // before the new metadata loads.
  useEffect(() => {
    setPlaying(false);
    setDuration(0);
    setCurrentTime(0);
    setSeeking(false);
  }, [src]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;
    const onLoadedMetadata = () => setDuration(Number.isFinite(audio.duration) ? audio.duration : 0);
    const onTimeUpdate = () => {
      if (!seeking) setCurrentTime(audio.currentTime || 0);
    };
    const onPlay = () => setPlaying(true);
    const onPause = () => setPlaying(false);
    const onEnded = () => setPlaying(false);
    audio.addEventListener("loadedmetadata", onLoadedMetadata);
    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);
    audio.addEventListener("ended", onEnded);
    return () => {
      audio.removeEventListener("loadedmetadata", onLoadedMetadata);
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      audio.removeEventListener("ended", onEnded);
    };
  }, [seeking]);

  const togglePlay = () => {
    const audio = audioRef.current;
    if (!audio) return;
    if (audio.paused) audio.play().catch(() => undefined);
    else audio.pause();
  };

  const seekRatio = (ratio) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const next = Math.min(Math.max(ratio, 0), 1) * duration;
    audio.currentTime = next;
    setCurrentTime(next);
  };

  const toggleMute = () => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.muted = !audio.muted;
    setMuted(audio.muted);
  };

  const progress = duration ? Math.min(currentTime / duration, 1) : 0;

  return (
    <div className={`flex items-center gap-3 rounded-xl border border-border bg-surface-2 px-3 py-2.5 ${className}`}>
      {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
      <audio ref={audioRef} src={src} autoPlay={autoPlay} preload="metadata" className="hidden" />

      <button
        type="button"
        onClick={togglePlay}
        aria-label={playing ? "Pause" : "Play"}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand text-white shadow-[0_6px_16px_-4px_rgb(var(--rn-blue)/0.5)] transition-transform active:scale-95"
      >
        {playing ? <Pause size={15} fill="currentColor" /> : <Play size={15} fill="currentColor" className="ml-0.5" />}
      </button>

      <span className="w-8 shrink-0 text-right text-[11px] tabular-nums text-muted">{formatTime(currentTime)}</span>

      <input
        type="range"
        min={0}
        max={1000}
        step={1}
        value={Math.round(progress * 1000)}
        onChange={(event) => {
          setSeeking(true);
          seekRatio(Number(event.target.value) / 1000);
        }}
        onMouseUp={() => setSeeking(false)}
        onTouchEnd={() => setSeeking(false)}
        aria-label="Seek"
        className="h-1.5 flex-1 cursor-pointer appearance-none rounded-full outline-none [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-brand [&::-webkit-slider-thumb]:shadow-[0_0_0_3px_rgb(var(--rn-blue)/0.18)] [&::-moz-range-thumb]:h-3 [&::-moz-range-thumb]:w-3 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-0 [&::-moz-range-thumb]:bg-brand"
        style={{ background: `linear-gradient(to right, rgb(var(--rn-blue)) ${progress * 100}%, rgb(var(--rn-surface-3)) ${progress * 100}%)` }}
      />

      <span className="w-8 shrink-0 text-[11px] tabular-nums text-muted">{formatTime(duration)}</span>

      <button
        type="button"
        onClick={toggleMute}
        aria-label={muted ? "Unmute" : "Mute"}
        className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-muted transition-colors hover:bg-surface-3 hover:text-text"
      >
        {muted ? <VolumeX size={15} /> : <Volume2 size={15} />}
      </button>
    </div>
  );
}
