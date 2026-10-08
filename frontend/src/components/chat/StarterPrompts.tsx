import React from "react"
import { FileText, BookOpen, ListOrdered, Calendar, ArrowUpRight, HelpCircle } from "lucide-react"

interface StarterPromptsProps {
  onSelectPrompt: (prompt: string) => void
  scopedFileName?: string
}

export const StarterPrompts: React.FC<StarterPromptsProps> = ({
  onSelectPrompt,
  scopedFileName,
}) => {
  const filePrompts = [
    {
      title: "Executive Summary",
      description: `Provide a concise overview of the core points and purpose of ${scopedFileName || "this document"}.`,
      prompt: `Please provide a clear, concise executive summary of the main points covered in ${scopedFileName || "the uploaded document"}.`,
      icon: BookOpen,
      scope: scopedFileName || "Target Document",
    },
    {
      title: "Key Guidelines & Rules",
      description: "Extract the essential requirements, eligibility criteria, and guidelines.",
      prompt: `What are the key requirements, eligibility criteria, and important rules outlined in this document?`,
      icon: ListOrdered,
      scope: "Rules & Criteria",
    },
    {
      title: "Syllabus / Topics Covered",
      description: "Analyze the subjects, sections, and technical topics detailed in this file.",
      prompt: `List and breakdown the key topics, sections, or syllabus covered in this document.`,
      icon: FileText,
      scope: "Topics & Sections",
    },
    {
      title: "Important Dates & Notes",
      description: "Identify all significant dates, deadlines, and critical instructions.",
      prompt: `What are the important dates, deadlines, application details, and critical instructions mentioned?`,
      icon: Calendar,
      scope: "Dates & Notices",
    },
  ]

  const generalPrompts = [
    {
      title: "Knowledge Base Summary",
      description: "Summarize the key information and documents contained in this folder.",
      prompt: "Can you summarize the primary topics and documents available in this folder?",
      icon: BookOpen,
      scope: "Folder Overview",
    },
    {
      title: "Identify Key Sections",
      description: "List the principal topics and subject areas documented in uploaded files.",
      prompt: "What are the core topics, guidelines, and specifications documented in these files?",
      icon: ListOrdered,
      scope: "Topics Breakdown",
    },
    {
      title: "Extract Critical Requirements",
      description: "Find specific qualifications, instructions, or procedures.",
      prompt: "What are the most important requirements and actionable guidelines from the uploaded files?",
      icon: FileText,
      scope: "Actionable Insights",
    },
    {
      title: "Direct Inquiry",
      description: "Ask a specific question and receive a directly cited answer.",
      prompt: "What are the key findings or announcements from the latest uploaded document?",
      icon: HelpCircle,
      scope: "Specific Query",
    },
  ]

  const prompts = scopedFileName ? filePrompts : generalPrompts

  return (
    <div className="w-full max-w-2xl mx-auto mt-6">
      <div className="text-[11px] font-medium text-muted-foreground mb-3 text-center">
        {scopedFileName ? `Suggested queries for ${scopedFileName}` : "Suggested questions for this workspace"}
      </div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
        {prompts.map((p, idx) => {
          const Icon = p.icon
          return (
            <button
              key={idx}
              onClick={() => onSelectPrompt(p.prompt)}
              className="group text-left p-3.5 rounded-xl border border-border/70 bg-surface-raised/60 hover:bg-surface-raised hover:border-emerald-500/40 transition-all flex flex-col justify-between shadow-xs"
            >
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-foreground group-hover:text-emerald-400 transition-colors">
                    <Icon className="h-3.5 w-3.5 text-emerald-400" />
                    <span>{p.title}</span>
                  </div>
                  <ArrowUpRight className="h-3 w-3 text-muted-foreground/60 group-hover:text-foreground transition-colors" />
                </div>
                <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
                  {p.description}
                </p>
              </div>
              <div className="mt-2.5 text-[10px] text-muted-foreground/60 font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500/60" />
                <span className="truncate">{p.scope}</span>
              </div>
            </button>
          )
        })}
      </div>
    </div>
  )
}
