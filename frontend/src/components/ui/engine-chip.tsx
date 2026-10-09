import React from "react"
import { cn } from "../../lib/utils"
import { Engine, Wave, Iris, Reel } from "../../glyphs"

export interface EngineInfo {
  name: string
  version: string
  modality: string
  glyph: React.ComponentType<{ size?: number | string; className?: string; accent?: string }>
  dotClass: string
}

export function detectEngineForFile(fileName?: string): EngineInfo {
  if (!fileName) {
    return {
      name: "Gemma 3",
      version: "4B",
      modality: "Document LLM",
      glyph: Engine,
      dotClass: "bg-trust",
    }
  }
  const ext = fileName.split(".").pop()?.toLowerCase() || ""
  if (["mp3", "wav", "m4a", "ogg", "flac", "aac"].includes(ext)) {
    return {
      name: "Whisper",
      version: "Base",
      modality: "Speech-to-text",
      glyph: Wave,
      dotClass: "bg-hold animate-pulse",
    }
  }
  if (["png", "jpg", "jpeg", "webp", "bmp", "tiff"].includes(ext)) {
    return {
      name: "Qwen 2.5-VL",
      version: "3B",
      modality: "Vision",
      glyph: Iris,
      dotClass: "bg-permit animate-pulse",
    }
  }
  if (["mp4", "mkv", "avi", "mov", "webm"].includes(ext)) {
    return {
      name: "Whisper + Qwen-VL",
      version: "Multi",
      modality: "Video",
      glyph: Reel,
      dotClass: "bg-beam animate-pulse",
    }
  }
  return {
    name: "Gemma 3",
    version: "4B",
    modality: "Document LLM",
    glyph: Engine,
    dotClass: "bg-trust",
  }
}

export interface EngineChipProps extends React.HTMLAttributes<HTMLDivElement> {
  fileName?: string
  compact?: boolean
}

export const EngineChip: React.FC<EngineChipProps> = ({
  fileName,
  compact = false,
  className,
  ...props
}) => {
  const info = detectEngineForFile(fileName)
  const GlyphComponent = info.glyph

  if (compact) {
    return (
      <div
        className={cn(
          "inline-flex items-center gap-1.5 px-2 py-0.5 rounded-md border border-border/60 bg-secondary/70 text-xs text-foreground font-mono",
          className
        )}
        title={`${info.name} ${info.version} • ${info.modality}`}
        {...props}
      >
        <GlyphComponent size={13} className="text-muted-foreground" />
        <span className="font-sans font-medium">{info.name}</span>
        <span className="w-1.5 h-1.5 rounded-full bg-trust/80" />
      </div>
    )
  }

  return (
    <div
      className={cn(
        "inline-flex items-center gap-2 px-2.5 py-1 rounded-lg border border-border/80 bg-secondary/80 text-xs text-foreground transition-all hover:bg-accent cursor-pointer",
        className
      )}
      title={`${info.name} • ${info.modality}`}
      {...props}
    >
      <GlyphComponent size={15} className="text-muted-foreground" />
      <span className="font-medium font-sans">{info.name}</span>
      <span className="text-[10px] text-muted-foreground font-mono">
        {info.version}
      </span>
      <span className="w-1.5 h-1.5 rounded-full bg-trust" />
      <span className="text-[11px] text-muted-foreground hidden sm:inline">
        {info.modality}
      </span>
    </div>
  )
}
