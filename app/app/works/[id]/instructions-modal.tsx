'use client'

// app/app/works/[id]/instructions-modal.tsx
// Clickable file card that opens a modal with the .md / .txt contents.
import { useState } from 'react'
import { FileText, FileCode2, X } from 'lucide-react'

interface Props {
  filename: string
  ext: string
  content: string
}

export function InstructionsModal({ filename, ext, content }: Props) {
  const [open, setOpen] = useState(false)
  const Icon = ext === 'md' ? FileCode2 : FileText

  const sizeKb = (new Blob([content]).size / 1024).toFixed(1)

  return (
    <>
      {/* CARD — clickable */}
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-neutral-900/50 transition-colors text-left group"
      >
        <div className="size-10 rounded-lg bg-neutral-900 border border-neutral-800 flex items-center justify-center group-hover:border-lime-700 transition-colors shrink-0">
          <Icon className="size-5 text-lime-400" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium text-white truncate">
            {filename}
          </div>
          <div className="text-xs text-neutral-500">
            {ext.toUpperCase()} · {sizeKb} KB · click to open
          </div>
        </div>
      </button>

      {/* MODAL */}
      {open && (
        <div
          className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-neutral-950 border border-neutral-800 rounded-lg max-w-3xl w-full max-h-[85vh] flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-800">
              <div className="flex items-center gap-2">
                <Icon className="size-4 text-lime-400" />
                <span className="text-sm font-medium text-white">{filename}</span>
                <span className="text-xs text-neutral-500">· {ext.toUpperCase()} · {sizeKb} KB</span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-neutral-800 transition-colors"
              >
                <X className="size-4 text-neutral-400" />
              </button>
            </div>
            <pre className="p-4 text-sm text-neutral-300 whitespace-pre-wrap font-mono overflow-auto flex-1">
              {content}
            </pre>
          </div>
        </div>
      )}
    </>
  )
}
