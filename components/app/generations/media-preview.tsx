"use client";

import { useState } from "react";
import { Play } from "lucide-react";

export function MediaPreview({
  url,
  mediaType,
  name,
  className,
}: {
  url: string;
  mediaType: string;
  name: string;
  className?: string;
}) {
  const [failed, setFailed] = useState(false);
  const looksAudio =
    /\b(text\s*to\s*speech|tts|voiceover|seed\s*audio|audio|speech|voice)\b/i.test(
      name,
    );
  const frameClassName = className ?? "w-32 h-22 2xl:w-40 2xl:h-28";

  if (mediaType === "feature" || !url) {
    return (
      <div
        className={`${frameClassName} flex items-center justify-center overflow-hidden rounded bg-neutral-800 border border-neutral-700 text-[9px] text-neutral-500 uppercase tracking-wide`}
        title={name}
      >
        feat
      </div>
    );
  }
  if (mediaType === "audio" || (failed && looksAudio)) {
    return (
      <div
        className={`${frameClassName} flex items-center justify-center overflow-hidden rounded bg-neutral-900 border border-neutral-700 text-[9px] text-sky-300 uppercase tracking-[0.2em]`}
        title={name}
      >
        audio
      </div>
    );
  }
  if (failed) {
    return (
      <div
        className={`${frameClassName} flex items-center justify-center overflow-hidden rounded bg-neutral-800 text-[10px] text-neutral-600`}
        title={name}
      >
        -
      </div>
    );
  }
  if (mediaType === "video") {
    return (
      <div
        className={`${frameClassName} relative overflow-hidden rounded-[inherit] bg-black`}
      >
        <video
          src={url}
          className="h-full w-full rounded-[inherit] object-cover bg-black"
          preload="none"
          muted
          playsInline
          onError={() => setFailed(true)}
          onMouseEnter={(e) => {
            void (e.currentTarget as HTMLVideoElement).play();
          }}
          onMouseLeave={(e) => {
            const video = e.currentTarget as HTMLVideoElement;
            video.pause();
            video.currentTime = 0;
          }}
        />
        <span className="pointer-events-none absolute inset-x-0 bottom-2 flex justify-center">
          <span className="flex size-8 items-center justify-center rounded-full border border-white/15 bg-black/55 text-white shadow-lg backdrop-blur-sm">
            <Play className="ml-0.5 size-3.5 fill-current" />
          </span>
        </span>
      </div>
    );
  }
  return (
    <div
      className={`${frameClassName} overflow-hidden rounded-[inherit] bg-neutral-800`}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={url}
        alt={name}
        className="h-full w-full rounded-[inherit] object-cover bg-neutral-800"
        loading="lazy"
        decoding="async"
        onError={() => setFailed(true)}
      />
    </div>
  );
}
