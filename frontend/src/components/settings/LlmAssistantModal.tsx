import React, { useState } from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "../ui/dialog"
import { Button } from "../ui/button"
import { Badge } from "../ui/badge"
import { useApp } from "../../context/AppContext"
import {
  Cpu,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Terminal,
  ExternalLink,
  Sparkles,
  ShieldCheck,
  Copy,
  Check,
} from "lucide-react"
import { toast } from "sonner"

export const LlmAssistantModal: React.FC = () => {
  const { isLlmModalOpen, setIsLlmModalOpen, llmStatus, refreshLlmStatus } = useApp()
  const [isChecking, setIsChecking] = useState(false)
  const [copiedCmd, setCopiedCmd] = useState<string | null>(null)

  const handleRefresh = async () => {
    setIsChecking(true)
    try {
      await refreshLlmStatus()
      toast.success("Checked local LLM connection")
    } catch {
      toast.error("Failed to query LLM status")
    } finally {
      setIsChecking(false)
    }
  }

  const copyToClipboard = (cmd: string) => {
    navigator.clipboard.writeText(cmd)
    setCopiedCmd(cmd)
    toast.success("Command copied to clipboard!")
    setTimeout(() => setCopiedCmd(null), 2000)
  }

  const isConnected = !!llmStatus?.connected

  return (
    <Dialog open={isLlmModalOpen} onOpenChange={setIsLlmModalOpen}>
      <DialogContent className="max-w-lg bg-surface-raised border-border text-foreground shadow-2xl p-6 max-h-[90vh] overflow-y-auto">
        <DialogHeader className="space-y-1.5 pb-2 border-b border-border/40">
          <div className="flex items-center gap-2">
            <div className={`h-8 w-8 rounded-lg border flex items-center justify-center ${
              isConnected
                ? "bg-emerald-500/10 border-emerald-500/20 text-emerald-400"
                : "bg-amber-500/10 border-amber-500/20 text-amber-400"
            }`}>
              <Cpu className="h-4 w-4" />
            </div>
            <div>
              <DialogTitle className="text-base font-semibold text-foreground">
                Local Offline LLM Configuration & Models
              </DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground">
                100% LAN-native, zero-cloud private intelligence running on your machine.
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        {/* Current Connection Status Box */}
        <div className={`p-3.5 rounded-xl border flex items-start justify-between gap-3 ${
          isConnected
            ? "bg-emerald-500/5 border-emerald-500/20 text-foreground"
            : "bg-surface-subtle border-border text-foreground"
        }`}>
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold">Ollama Status:</span>
              {isConnected ? (
                <Badge variant="default" className="text-[10px] bg-emerald-500/20 text-emerald-400 border-emerald-500/30">
                  <CheckCircle2 className="h-3 w-3 mr-1 inline" />
                  Connected ({llmStatus?.active_model})
                </Badge>
              ) : (
                <Badge variant="outline" className="text-[10px] text-amber-400 border-amber-500/30 bg-amber-500/10">
                  <AlertCircle className="h-3 w-3 mr-1 inline" />
                  Offline — Safe Extractive Mode Active
                </Badge>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {isConnected
                ? `Active model: ${llmStatus?.active_model} at ${llmStatus?.endpoint || "http://127.0.0.1:11434"}. Full generative synthesis active.`
                : "Ollama is not running. DARS-RAG is currently using Safe Extractive Mode to provide 100% verified citation quotes without hallucination."}
            </p>
          </div>

          <Button
            size="sm"
            variant="outline"
            onClick={handleRefresh}
            disabled={isChecking}
            className="text-xs h-7 gap-1 px-2.5 shrink-0"
          >
            <RefreshCw className={`h-3 w-3 ${isChecking ? "animate-spin" : ""}`} />
            <span>Check</span>
          </Button>
        </div>

        {/* Recommended Models Section */}
        <div className="space-y-2 pt-1">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-emerald-400" />
              <span>Which Model Should You Install?</span>
            </h4>
            <span className="text-[10px] text-muted-foreground">Local & Offline</span>
          </div>

          <div className="grid grid-cols-1 gap-2">
            {/* Llama 3.2 */}
            <div className="p-3 rounded-lg border border-border/70 bg-surface-subtle/50 hover:bg-surface-subtle transition-all space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-foreground">1. Llama 3.2 (Recommended for Everyone)</span>
                  <Badge variant="secondary" className="text-[9px] py-0 px-1.5 bg-emerald-500/10 text-emerald-400 border-emerald-500/20">
                    Fastest (~2.0 GB RAM)
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard("ollama run llama3.2")}
                  className="h-6 text-[10px] gap-1 px-2 text-muted-foreground hover:text-foreground"
                >
                  {copiedCmd === "ollama run llama3.2" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  <span>Copy command</span>
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Meta's newest lightweight model. Runs effortlessly on CPU or GPU. Ultra-fast answers with high citation precision.
              </p>
              <div className="flex items-center gap-2 font-mono text-[11px] bg-background/80 p-1.5 rounded border border-border/40 text-emerald-300">
                <Terminal className="h-3 w-3 shrink-0" />
                <span>ollama run llama3.2</span>
              </div>
            </div>

            {/* Mistral */}
            <div className="p-3 rounded-lg border border-border/70 bg-surface-subtle/50 hover:bg-surface-subtle transition-all space-y-1.5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs font-medium text-foreground">2. Mistral 7B</span>
                  <Badge variant="secondary" className="text-[9px] py-0 px-1.5">
                    High Reasoning (~4.1 GB RAM)
                  </Badge>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => copyToClipboard("ollama run mistral")}
                  className="h-6 text-[10px] gap-1 px-2 text-muted-foreground hover:text-foreground"
                >
                  {copiedCmd === "ollama run mistral" ? <Check className="h-3 w-3 text-emerald-400" /> : <Copy className="h-3 w-3" />}
                  <span>Copy command</span>
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Exceptional at technical documentation synthesis, table extraction, and complex legal analysis.
              </p>
              <div className="flex items-center gap-2 font-mono text-[11px] bg-background/80 p-1.5 rounded border border-border/40 text-muted-foreground">
                <Terminal className="h-3 w-3 shrink-0" />
                <span>ollama run mistral</span>
              </div>
            </div>
          </div>
        </div>

        {/* How to Connect Step-by-Step */}
        <div className="space-y-2 pt-2 border-t border-border/40">
          <h4 className="text-xs font-semibold text-foreground flex items-center gap-1.5">
            <Terminal className="h-3.5 w-3.5 text-foreground" />
            <span>How to Connect in 3 Simple Steps:</span>
          </h4>

          <div className="space-y-2 text-xs text-muted-foreground">
            <div className="flex items-start gap-2.5 p-2 rounded-lg bg-surface-subtle/40 border border-border/40">
              <span className="h-5 w-5 rounded-full bg-emerald-500/10 text-emerald-400 font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                1
              </span>
              <div>
                <span className="font-medium text-foreground">Install Ollama:</span>
                <p className="text-[11px] mt-0.5">
                  Download the installer from{" "}
                  <a
                    href="https://ollama.com/download"
                    target="_blank"
                    rel="noreferrer"
                    className="text-emerald-400 underline inline-flex items-center gap-0.5"
                  >
                    ollama.com/download <ExternalLink className="h-2.5 w-2.5 inline" />
                  </a>
                  {" "}and run the setup.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2 rounded-lg bg-surface-subtle/40 border border-border/40">
              <span className="h-5 w-5 rounded-full bg-emerald-500/10 text-emerald-400 font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                2
              </span>
              <div>
                <span className="font-medium text-foreground">Pull & Run the Model:</span>
                <p className="text-[11px] mt-0.5">
                  Open PowerShell and run: <code className="text-emerald-300 font-mono bg-background px-1 py-0.5 rounded">ollama run llama3.2</code>
                </p>
              </div>
            </div>

            <div className="flex items-start gap-2.5 p-2 rounded-lg bg-surface-subtle/40 border border-border/40">
              <span className="h-5 w-5 rounded-full bg-emerald-500/10 text-emerald-400 font-mono text-[11px] font-bold flex items-center justify-center shrink-0">
                3
              </span>
              <div>
                <span className="font-medium text-foreground">Auto-Detection:</span>
                <p className="text-[11px] mt-0.5">
                  DARS-RAG continuously monitors <code className="font-mono text-foreground">http://127.0.0.1:11434</code> and will immediately switch from Safe Extractive Mode to full Neural Grounded RAG!
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Security / Offline Guarantee */}
        <div className="p-3 rounded-xl bg-surface-subtle/60 border border-border/50 text-[11px] text-muted-foreground flex items-start gap-2.5">
          <ShieldCheck className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
          <p className="text-[11px] leading-relaxed">
            <span className="font-medium text-foreground">LAN-Native Isolation:</span> No document contents or prompt tokens ever leave your local computer. Both dense vector search (FastEmbed ONNX) and inference (Ollama) run 100% offline.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  )
}
