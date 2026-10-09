import React from "react"
import { makeGlyph } from "./Glyph"

export const Aperture = makeGlyph(
  "aperture",
  <>
    <path d="M12 3a9 9 0 1 0 9 9" />
    <circle cx="12" cy="12" r="4" />
    <circle className="b" cx="17.2" cy="6.8" r="1.25" />
  </>
)

export const Ask = makeGlyph(
  "ask",
  <>
    <path d="M4 6.5A2.5 2.5 0 0 1 6.5 4h11A2.5 2.5 0 0 1 20 6.5v7a2.5 2.5 0 0 1-2.5 2.5H11l-4 3.5V16h-.5A2.5 2.5 0 0 1 4 13.5z" />
    <path className="b" d="M8.5 9.5h6" />
  </>
)

export const Sheet = makeGlyph(
  "sheet",
  <>
    <path d="M6 4.5A1.5 1.5 0 0 1 7.5 3H14l4.5 4.5v12A1.5 1.5 0 0 1 17 21H7.5A1.5 1.5 0 0 1 6 19.5z" />
    <path d="M14 3v4.5h4.5" />
    <path className="b" d="M9.5 13h5M9.5 16.5h3" />
  </>
)

export const Compartment = makeGlyph(
  "compartment",
  <>
    <rect x="3.5" y="3.5" width="17" height="17" rx="3.5" />
    <circle cx="12" cy="12" r="3.5" />
    <path className="b" d="M12 8.5V6.8" />
  </>
)

export const Grant = makeGlyph(
  "grant",
  <>
    <circle cx="8" cy="15" r="3.5" />
    <path d="M10.5 12.5 19 4" />
    <path d="m16 7 2.5 2.5" />
    <circle className="b" cx="8" cy="15" r="1" />
  </>
)

export const Mesh = makeGlyph(
  "mesh",
  <>
    <circle cx="12" cy="5" r="2" />
    <circle cx="5.5" cy="18" r="2" />
    <circle cx="18.5" cy="18" r="2" />
    <path d="M11 6.9 6.5 16M13 6.9l4.5 9.1M7.6 18h8.8" />
    <circle className="b" cx="12" cy="13.4" r=".9" />
  </>
)

export const Ledger = makeGlyph(
  "ledger",
  <>
    <rect x="3" y="8.5" width="10" height="7" rx="3.5" />
    <rect x="11" y="8.5" width="10" height="7" rx="3.5" />
    <path className="b" d="M12 18.5v2" />
  </>
)

export const Strata = makeGlyph(
  "strata",
  <>
    <path d="M4.5 7 12 4l7.5 3L12 10z" />
    <path d="m4.5 11.5 7.5 3 7.5-3" />
    <path d="m4.5 16 7.5 3 7.5-3" />
    <path className="b" d="M12 4v6" />
  </>
)

export const Verify = makeGlyph(
  "verify",
  <>
    <path d="M12 3 4.5 6v5.5c0 4.5 3 7.8 7.5 9.5 4.5-1.7 7.5-5 7.5-9.5V7.5" />
    <path className="b" d="m8.8 12 2.4 2.4 5-5.4" />
  </>
)

export const Tune = makeGlyph(
  "tune",
  <>
    <path d="M4 7h8.5M17.5 7H20M4 17h2.5M11.5 17H20" />
    <circle cx="15" cy="7" r="2.5" />
    <circle cx="9" cy="17" r="2.5" />
    <circle className="b" cx="15" cy="7" r=".8" />
  </>
)

export const Add = makeGlyph(
  "add",
  <>
    <path d="M12 5v5M12 14v5M5 12h5M14 12h5" />
    <circle className="b" cx="12" cy="12" r="1" />
  </>
)

export const Find = makeGlyph(
  "find",
  <>
    <path d="M16.5 10.5a6 6 0 1 1-6-6" />
    <path className="b" d="m15 15 5 5" />
  </>
)

export const Session = makeGlyph(
  "session",
  <>
    <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" />
    <path d="M12 7.5V12l3 2" />
    <circle className="b" cx="18" cy="6" r="1.25" />
  </>
)

export const Lock = makeGlyph(
  "lock",
  <>
    <rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5" />
    <path d="M8.5 10.5V8a3.5 3.5 0 0 1 6.5-1.8" />
    <circle className="b" cx="12" cy="15.2" r="1.2" />
  </>
)

export const Iris = makeGlyph(
  "iris",
  <>
    <path d="M3 12s3.2-6 9-6 9 6 9 6-3.2 6-9 6-9-6-9-6z" />
    <circle className="b" cx="12" cy="12" r="2.6" />
  </>
)

export const Wave = makeGlyph(
  "wave",
  <>
    <path d="M5 10v4M8.5 7v10M15.5 8v8M19 10.5v3" />
    <path className="b" d="M12 4.5v15" />
  </>
)

export const Reel = makeGlyph(
  "reel",
  <>
    <rect x="3.5" y="5.5" width="17" height="13" rx="2.5" />
    <path d="M7 5.5v13M17 5.5v13" />
    <path className="b" d="m10.8 9.6 3.4 2.4-3.4 2.4z" />
  </>
)

export const Brackets = makeGlyph(
  "brackets",
  <>
    <path d="M8.5 8 4.5 12l4 4M15.5 8l4 4-4 4" />
    <path className="b" d="m13.2 6.5-2.4 11" />
  </>
)

export const Frame = makeGlyph(
  "frame",
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2.5" />
    <path d="m4 16 4.5-4.5 4 4 2.5-2.5 5 5" />
    <circle className="b" cx="15.5" cy="9" r="1.3" />
  </>
)

export const Engine = makeGlyph(
  "engine",
  <>
    <path d="M12 3 4.2 7.5v9L12 21l7.8-4.5V9" />
    <circle className="b" cx="12" cy="12" r="2" />
    <path d="M12 10V6.5M13.7 13l3 1.7" />
  </>
)

export const GateOpen = makeGlyph(
  "gate-open",
  <>
    <path d="M12 3.5a8.5 8.5 0 1 0 8.5 8.5" />
    <path className="b" d="m8.6 12 2.4 2.4 4.8-5" />
  </>
)

export const GateClosed = makeGlyph(
  "gate-closed",
  <>
    <circle cx="12" cy="12" r="8.5" />
    <path className="b" d="M7 12h10" />
  </>
)

export const Alert = makeGlyph(
  "alert",
  <>
    <path d="M10.3 5.2 3.8 17a1.9 1.9 0 0 0 1.7 2.8h13a1.9 1.9 0 0 0 1.7-2.8L13.7 5.2a2 2 0 0 0-3.4 0z" />
    <path className="b" d="M12 10v3.6" />
    <circle className="b" cx="12" cy="16.6" r=".6" />
  </>
)

export const Hash = makeGlyph(
  "hash",
  <>
    <path d="M9.5 4 8 20M16 4l-1.5 16M4.5 9h15M4 15h15" />
    <circle className="b" cx="19.5" cy="4.5" r="1" />
  </>
)

export const Send = makeGlyph(
  "send",
  <>
    <path d="M12 19V7M6.5 12 12 6.5" />
    <path className="b" d="m17.5 12-5.5-5.5" />
  </>
)

export const Share = makeGlyph(
  "share",
  <>
    <circle cx="6" cy="12" r="2.5" />
    <circle cx="18" cy="6" r="2.5" />
    <circle cx="18" cy="18" r="2.5" />
    <path d="m8.2 10.8 7.6-3.6M8.2 13.2l7.6 3.6" />
  </>
)

export const People = makeGlyph(
  "people",
  <>
    <circle cx="9" cy="8.5" r="3" />
    <path d="M3.5 19a5.5 5.5 0 0 1 11 0" />
    <path className="b" d="M16 6a3 3 0 0 1 0 5.6M18 14.2a5.5 5.5 0 0 1 2.5 4.8" />
  </>
)

export const Lan = makeGlyph(
  "lan",
  <>
    <path d="M5 10a10 10 0 0 1 14 0M8 13.2a6 6 0 0 1 8 0" />
    <circle className="b" cx="12" cy="17" r="1.6" />
  </>
)

export const Upload = makeGlyph(
  "upload",
  <>
    <path d="M12 16V5M7 9.5 12 5" />
    <path d="M4.5 16v1.5A2 2 0 0 0 6.5 19.5h11a2 2 0 0 0 2-2V16" />
    <circle className="b" cx="17" cy="9.5" r="1" />
  </>
)

export const Download = makeGlyph(
  "download",
  <>
    <path d="M12 5v11M7 12l5 4.5" />
    <path d="M4.5 16v1.5A2 2 0 0 0 6.5 19.5h11a2 2 0 0 0 2-2V16" />
    <circle className="b" cx="17" cy="12" r="1" />
  </>
)

export const Refresh = makeGlyph(
  "refresh",
  <>
    <path d="M19 12a7 7 0 1 1-2.1-5" />
    <path className="b" d="M19 4.5v3.2h-3.2" />
  </>
)

export const Trash = makeGlyph(
  "trash",
  <>
    <path d="M5 7h14M9.5 7V5h5v2M7 7l.8 12a1.5 1.5 0 0 0 1.5 1.4h5.4a1.5 1.5 0 0 0 1.5-1.4L17 7" />
    <path className="b" d="M10.5 11v5M13.5 11v5" />
  </>
)

export const Edit = makeGlyph(
  "edit",
  <>
    <path d="M5 19l.7-3.6L16 5.2a1.8 1.8 0 0 1 2.6 0l.2.2a1.8 1.8 0 0 1 0 2.6L8.6 18.3z" />
    <path className="b" d="m14.5 6.7 2.8 2.8" />
  </>
)

export const Pin = makeGlyph(
  "pin",
  <>
    <path d="M9 4h6l-.8 5 2.8 3.5H7L9.8 9z" />
    <path className="b" d="M12 12.5V20" />
  </>
)

export const More = makeGlyph(
  "more",
  <>
    <circle cx="12" cy="5.5" r="1.3" />
    <circle cx="12" cy="12" r="1.3" />
    <circle cx="12" cy="18.5" r="1.3" />
  </>
)

export const Chevron = makeGlyph(
  "chevron",
  <path d="m9 6 6 6-6 6" />
)

export const Close = makeGlyph(
  "close",
  <path d="M6.5 6.5 17.5 17.5M17.5 6.5l-11 11" />
)

export const Copy = makeGlyph(
  "copy",
  <>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2.5" />
    <path d="M15.5 8.5V6.5a2 2 0 0 0-2-2h-7a2 2 0 0 0-2 2v7a2 2 0 0 0 2 2h2" />
  </>
)

export const Check = makeGlyph(
  "check",
  <path d="m5.5 12.5 4.2 4.2L18.5 7.5" />
)

export const Panel = makeGlyph(
  "panel",
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <path d="M9.5 4.5v15" />
    <path className="b" d="M6.3 9h.01M6.3 12h.01" />
  </>
)

export const Terminal = makeGlyph(
  "terminal",
  <>
    <rect x="3.5" y="4.5" width="17" height="15" rx="3" />
    <path d="m7.5 10 2.8 2-2.8 2" />
    <path className="b" d="M12.5 15h4" />
  </>
)

export const Pulse = makeGlyph(
  "pulse",
  <>
    <path d="M3.5 12h4l2-5 3.6 10 2.4-5h5" />
    <circle className="b" cx="20.5" cy="12" r=".4" />
  </>
)

export const Drive = makeGlyph(
  "drive",
  <>
    <rect x="3.5" y="8" width="17" height="8.5" rx="2.5" />
    <path d="M7 12.3h.01" />
    <path className="b" d="M16.5 12.3h.01" />
  </>
)
