import React from "react"
import * as Set from "./set"

// Explicit exports for Gatelight Glyphs
export const Aperture = Set.Aperture
export const Ask = Set.Ask
export const Sheet = Set.Sheet
export const Compartment = Set.Compartment
export const Grant = Set.Grant
export const Mesh = Set.Mesh
export const Ledger = Set.Ledger
export const Strata = Set.Strata
export const Verify = Set.Verify
export const Tune = Set.Tune
export const Add = Set.Add
export const Find = Set.Find
export const Session = Set.Session
export const Lock = Set.Lock
export const Iris = Set.Iris
export const Wave = Set.Wave
export const Reel = Set.Reel
export const Brackets = Set.Brackets
export const Frame = Set.Frame
export const Engine = Set.Engine
export const GateOpen = Set.GateOpen
export const GateClosed = Set.GateClosed
export const Alert = Set.Alert
export const Hash = Set.Hash
export const Send = Set.Send
export const Share = Set.Share
export const People = Set.People
export const Lan = Set.Lan
export const Upload = Set.Upload
export const Download = Set.Download
export const Refresh = Set.Refresh
export const Trash = Set.Trash
export const Edit = Set.Edit
export const Pin = Set.Pin
export const More = Set.More
export const Chevron = Set.Chevron
export const Close = Set.Close
export const Copy = Set.Copy
export const Check = Set.Check
export const Panel = Set.Panel
export const Terminal = Set.Terminal
export const Pulse = Set.Pulse
export const Drive = Set.Drive

// Lucide drop-in compatibility aliases per DESIGN.md §5.3
export const Shield = Set.Aperture
export const ShieldCheck = Set.Verify
export const ShieldAlert = Set.Alert
export const AlertTriangle = Set.Alert
export const AlertOctagon = Set.Alert
export const AlertCircle = Set.Alert
export const MessageSquare = Set.Ask
export const HelpCircle = Set.Ask
export const BookOpen = Set.Ask
export const FileText = Set.Sheet
export const Folder = Set.Sheet
export const FolderLock = Set.Compartment
export const KeyRound = Set.Grant
export const Key = Set.Grant
export const History = Set.Ledger
export const Network = Set.Mesh
export const Settings = Set.Tune
export const Filter = Set.Tune
export const Plus = Set.Add
export const Search = Set.Find
export const Clock = Set.Session
export const Image = Set.Frame
export const ImageIcon = Set.Frame
export const Video = Set.Reel
export const Music = Set.Wave
export const Volume2 = Set.Wave
export const Code = Set.Brackets
export const Code2 = Set.Brackets
export const Cpu = Set.Engine
export const Share2 = Set.Share
export const Users = Set.People
export const User = Set.People
export const Wifi = Set.Lan
export const Radio = Set.Lan
export const RefreshCw = Set.Refresh
export const RotateCw = Set.Refresh
export const RotateCcw = Set.Refresh
export const Loader2 = Set.Refresh
export const Trash2 = Set.Trash
export const Edit2 = Set.Edit
export const MoreVertical = Set.More
export const MoreHorizontal = Set.More
export const ChevronRight = Set.Chevron
export const ChevronDown = (props: React.ComponentProps<typeof Set.Chevron>) => (
  <Set.Chevron style={{ transform: "rotate(90deg)" }} {...props} />
)
export const ChevronUp = (props: React.ComponentProps<typeof Set.Chevron>) => (
  <Set.Chevron style={{ transform: "rotate(-90deg)" }} {...props} />
)
export const ChevronLeft = (props: React.ComponentProps<typeof Set.Chevron>) => (
  <Set.Chevron style={{ transform: "rotate(180deg)" }} {...props} />
)
export const X = Set.Close
export const XCircle = Set.Close
export const CheckCircle = Set.Check
export const CheckCircle2 = Set.Check
export const FileCheck = Set.Verify
export const UserCheck = Set.Verify
export const PanelLeftClose = Set.Panel
export const PanelLeftOpen = (props: React.ComponentProps<typeof Set.Panel>) => (
  <Set.Panel style={{ transform: "scaleX(-1)" }} {...props} />
)
export const Activity = Set.Pulse
export const Zap = Set.Pulse
export const HardDrive = Set.Drive
export const Server = Set.Drive
export const Layers = Set.Strata

// Dynamic Glyph component and names map
export type GlyphName =
  | "aperture"
  | "ask"
  | "sheet"
  | "compartment"
  | "grant"
  | "mesh"
  | "ledger"
  | "strata"
  | "verify"
  | "tune"
  | "add"
  | "find"
  | "session"
  | "lock"
  | "iris"
  | "wave"
  | "reel"
  | "brackets"
  | "frame"
  | "engine"
  | "gate-open"
  | "gate-closed"
  | "alert"
  | "hash"
  | "send"
  | "share"
  | "people"
  | "lan"
  | "upload"
  | "download"
  | "refresh"
  | "trash"
  | "edit"
  | "pin"
  | "more"
  | "chevron"
  | "close"
  | "copy"
  | "check"
  | "panel"
  | "terminal"
  | "pulse"
  | "drive"
  | "storage"
  | "matrix"
  | "radar"
  | "gear"
  | "layers"

const glyphMap: Record<string, React.ComponentType<any>> = {
  aperture: Set.Aperture,
  ask: Set.Ask,
  sheet: Set.Sheet,
  compartment: Set.Compartment,
  grant: Set.Grant,
  mesh: Set.Mesh,
  ledger: Set.Ledger,
  strata: Set.Strata,
  verify: Set.Verify,
  tune: Set.Tune,
  add: Set.Add,
  find: Set.Find,
  session: Set.Session,
  lock: Set.Lock,
  iris: Set.Iris,
  wave: Set.Wave,
  reel: Set.Reel,
  brackets: Set.Brackets,
  frame: Set.Frame,
  engine: Set.Engine,
  "gate-open": Set.GateOpen,
  "gate-closed": Set.GateClosed,
  alert: Set.Alert,
  hash: Set.Hash,
  send: Set.Send,
  share: Set.Share,
  people: Set.People,
  lan: Set.Lan,
  upload: Set.Upload,
  download: Set.Download,
  refresh: Set.Refresh,
  trash: Set.Trash,
  edit: Set.Edit,
  pin: Set.Pin,
  more: Set.More,
  chevron: Set.Chevron,
  close: Set.Close,
  copy: Set.Copy,
  check: Set.Check,
  panel: Set.Panel,
  terminal: Set.Terminal,
  pulse: Set.Pulse,
  drive: Set.Drive,
  storage: Set.Drive,
  matrix: Set.Mesh,
  radar: Set.Pulse,
  gear: Set.Tune,
  layers: Set.Strata,
}

export interface DynamicGlyphProps extends React.SVGProps<SVGSVGElement> {
  name: GlyphName | string
  size?: number | string
  accent?: string
  busy?: boolean
}

export const Glyph: React.FC<DynamicGlyphProps> = ({ name, ...props }) => {
  const Comp = glyphMap[name] || Set.Aperture
  return <Comp {...props} />
}

// Fallback to lucide-react for anything else not explicitly exported above
export * from "lucide-react"

