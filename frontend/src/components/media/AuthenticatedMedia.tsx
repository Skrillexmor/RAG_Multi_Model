import React, { useState, useEffect, useRef, useCallback } from "react"
import { api } from "../../lib/api"
import {
  FileImage,
  FileAudio,
  FileVideo,
  AlertCircle,
  Loader2,
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Volume2,
} from "lucide-react"

export interface AuthenticatedMediaProps {
  mediaUrl?: string | null
  alt?: string
  modality?: "image" | "audio" | "video" | string
  className?: string
  imageClassName?: string
  allowZoom?: boolean
  showMeta?: boolean
  fallbackText?: string
}

export function useAuthenticatedMedia(mediaUrl?: string | null, modality?: string) {
  const [blobUrl, setBlobUrl] = useState<string | null>(null)
  const [ticketUrl, setTicketUrl] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const abortControllerRef = useRef<AbortController | null>(null)

  const loadMedia = useCallback(async () => {
    if (!mediaUrl) {
      setBlobUrl(null)
      setTicketUrl(null)
      setError(null)
      return
    }

    // Clean up previous blob
    if (blobUrl) {
      URL.revokeObjectURL(blobUrl)
      setBlobUrl(null)
    }

    if (abortControllerRef.current) {
      abortControllerRef.current.abort()
    }
    const abortController = new AbortController()
    abortControllerRef.current = abortController

    setIsLoading(true)
    setError(null)

    try {
      // Normalize endpoint path
      let cleanPath = mediaUrl
      if (cleanPath.startsWith("http://") || cleanPath.startsWith("https://")) {
        const u = new URL(cleanPath)
        cleanPath = u.pathname
      }
      if (!cleanPath.startsWith("/api/media/")) {
        cleanPath = `/api/media/${cleanPath.replace(/^\/+/, "")}`
      }

      const filePath = cleanPath.replace(/^\/api\/media\//, "")

      const detectedModality = (modality || "").toLowerCase()
      const isAudioOrVideo =
        detectedModality.includes("audio") ||
        detectedModality.includes("video") ||
        /\.(mp3|wav|ogg|m4a|mp4|webm|mov)$/i.test(filePath)

      // If audio/video, obtain a media ticket for range-request streaming
      if (isAudioOrVideo) {
        try {
          const ticketRes = await api.getMediaTicket(filePath)
          if (!abortController.signal.aborted) {
            const finalUrl = ticketRes.media_url.includes("?ticket=")
              ? ticketRes.media_url
              : `${ticketRes.media_url}?ticket=${encodeURIComponent(ticketRes.ticket)}`
            setTicketUrl(finalUrl)
            setIsLoading(false)
            return
          }
        } catch {
          // If ticket issue fails, fall back to blob fetch
        }
      }

      // Fetch blob with Authorization: Bearer
      const blob = await api.fetchMediaBlob(cleanPath, abortController.signal)
      if (!abortController.signal.aborted) {
        const objectUrl = URL.createObjectURL(blob)
        setBlobUrl(objectUrl)
        setIsLoading(false)
      }
    } catch (err: any) {
      if (abortController.signal.aborted) return
      setError(err?.message || "Failed to load authenticated media")
      setIsLoading(false)
    }
  }, [mediaUrl, modality])

  useEffect(() => {
    loadMedia()
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
      if (blobUrl) {
        URL.revokeObjectURL(blobUrl)
      }
    }
  }, [mediaUrl, modality])

  return {
    sourceUrl: ticketUrl || blobUrl,
    blobUrl,
    ticketUrl,
    isLoading,
    error,
    retry: loadMedia,
  }
}

export function AuthenticatedMedia({
  mediaUrl,
  alt = "Evidence media",
  modality,
  className = "",
  imageClassName = "",
  allowZoom = true,
  showMeta = false,
  fallbackText,
}: AuthenticatedMediaProps) {
  const { sourceUrl, isLoading, error, retry } = useAuthenticatedMedia(mediaUrl, modality)
  const [isZoomed, setIsZoomed] = useState(false)

  if (!mediaUrl) {
    return (
      <div className={`flex flex-col items-center justify-center p-6 rounded-lg border border-dashed border-border/60 bg-muted/20 text-muted-foreground text-xs ${className}`}>
        <FileImage className="w-8 h-8 mb-2 opacity-40" />
        <span>{fallbackText || "No media attachment associated with this item"}</span>
      </div>
    )
  }

  // Detect modality
  const lowerModality = (modality || "").toLowerCase()
  const lowerUrl = mediaUrl.toLowerCase()
  const isAudio = lowerModality.includes("audio") || /\.(mp3|wav|ogg|m4a|aac)$/i.test(lowerUrl)
  const isVideo = lowerModality.includes("video") || /\.(mp4|webm|mov|mkv)$/i.test(lowerUrl)

  if (isLoading) {
    return (
      <div className={`flex flex-col items-center justify-center p-8 rounded-lg border border-border/40 bg-muted/20 animate-pulse ${className}`}>
        <Loader2 className="w-6 h-6 animate-spin text-primary mb-2" />
        <span className="text-xs text-muted-foreground font-mono">Authenticating and retrieving media...</span>
      </div>
    )
  }

  if (error) {
    return (
      <div className={`flex flex-col items-center justify-center p-6 rounded-lg border border-destructive/30 bg-destructive/5 text-destructive text-xs space-y-2 ${className}`}>
        <AlertCircle className="w-6 h-6 text-destructive" />
        <span className="font-semibold text-center">{error}</span>
        <button
          onClick={retry}
          type="button"
          className="inline-flex items-center gap-1.5 px-3 py-1 mt-1 rounded bg-secondary hover:bg-secondary/80 text-foreground border border-border/50 text-xs font-mono transition-colors"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          Retry
        </button>
      </div>
    )
  }

  if (!sourceUrl) {
    return null
  }

  // Audio rendering
  if (isAudio) {
    return (
      <div className={`flex flex-col gap-2 p-3 rounded-lg border border-border bg-card/60 ${className}`}>
        <div className="flex items-center gap-2 text-xs font-medium text-foreground">
          <Volume2 className="w-4 h-4 text-emerald-500" />
          <span>Audio Evidence Player</span>
          <span className="ml-auto text-[10px] text-muted-foreground font-mono">Authenticated stream</span>
        </div>
        <audio
          controls
          preload="metadata"
          src={sourceUrl}
          className="w-full h-10 rounded focus:outline-none focus:ring-1 focus:ring-ring"
        >
          Your browser does not support audio playback.
        </audio>
        {showMeta && (
          <div className="text-[11px] text-muted-foreground font-mono truncate">
            Source: {mediaUrl}
          </div>
        )}
      </div>
    )
  }

  // Video rendering
  if (isVideo) {
    return (
      <div className={`flex flex-col gap-2 rounded-lg overflow-hidden border border-border bg-black/40 ${className}`}>
        <video
          controls
          preload="metadata"
          src={sourceUrl}
          className="w-full max-h-[480px] object-contain rounded"
        >
          Your browser does not support video playback.
        </video>
        {showMeta && (
          <div className="p-2 text-[11px] text-muted-foreground font-mono truncate bg-card/40">
            Source: {mediaUrl}
          </div>
        )}
      </div>
    )
  }

  // Image rendering
  return (
    <div className={`relative group rounded-lg overflow-hidden border border-border/60 bg-muted/10 ${className}`}>
      <div className="relative overflow-hidden flex items-center justify-center">
        <img
          src={sourceUrl}
          alt={alt}
          className={`max-w-full object-contain rounded transition-transform duration-200 ${
            isZoomed ? "scale-150 cursor-zoom-out" : "cursor-zoom-in"
          } ${imageClassName}`}
          onClick={() => allowZoom && setIsZoomed(!isZoomed)}
        />
        {allowZoom && (
          <button
            type="button"
            onClick={() => setIsZoomed(!isZoomed)}
            className="absolute top-2 right-2 p-1.5 rounded-md bg-background/80 backdrop-blur-sm border border-border text-foreground/80 opacity-0 group-hover:opacity-100 hover:bg-background transition-opacity shadow-sm"
            title={isZoomed ? "Zoom out" : "Zoom in"}
          >
            {isZoomed ? <ZoomOut className="w-3.5 h-3.5" /> : <ZoomIn className="w-3.5 h-3.5" />}
          </button>
        )}
      </div>
      {showMeta && (
        <div className="p-2 border-t border-border/40 bg-card/40 text-[10px] text-muted-foreground font-mono truncate">
          {alt || mediaUrl}
        </div>
      )}
    </div>
  )
}
