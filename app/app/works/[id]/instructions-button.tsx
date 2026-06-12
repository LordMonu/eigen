'use client'

// app/app/works/[id]/instructions-button.tsx
// Compact icon button rendered in the work-detail header (next to status
// transitions / Edit / Delete). Click → modal showing both the uploaded
// .md/.txt file content (if any) AND the inline notes (if any).
import { useState } from 'react'
import { FileText, FileCode2, X, StickyNote } from 'lucide-react'

interface Props {
  filename: string | null
  fileExt: string | null
  fileContent: string | null
  notes: string | null
}

export function InstructionsButton({
  filename,
  fileExt,
  fileContent,
  notes,
}: Props) {
  const [open, setOpen] = useState(false)

  // "hasFile" means a file is registered for this work. The content may
  // still be null if the server couldn't download it — the modal will say
  // "couldn't load" in that case.
  const hasFile = !!filename
  const hasNotes = !!(notes && notes.trim())
  if (!hasFile && !hasNotes) return null

  const FileIcon = fileExt === 'md' ? FileCode2 : FileText
  const fileSizeKb = hasFile
    ? (new Blob([fileContent!]).size / 1024).toFixed(1)
    : null

  // Pick the trigger icon: file icon if a file exists, otherwise notes icon.
  const TriggerIcon = hasFile ? FileIcon : StickyNote

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={
          hasFile && hasNotes
            ? 'Instructions: file + notes'
            : hasFile
              ? `Instructions: ${filename || 'file'}`
              : 'Instructions: notes'
        }
        className="relative inline-flex items-center justify-center size-8 rounded-md border border-neutral-700 bg-neutral-900 text-lime-400 hover:bg-neutral-800 hover:border-lime-700 transition-colors"
      >
        <TriggerIcon className="size-4" />
        {hasFile && hasNotes && (
          <span
            className="absolute -top-1 -right-1 size-3 rounded-full bg-lime-400 border-2 border-neutral-950"
            aria-hidden
          />
        )}
      </button>

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
                <FileIcon className="size-4 text-lime-400" />
                <span className="text-sm font-medium text-white">
                  Instructions
                </span>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="p-1 rounded hover:bg-neutral-800 transition-colors"
              >
                <X className="size-4 text-neutral-400" />
              </button>
            </div>

            <div className="flex-1 overflow-auto divide-y divide-neutral-800">
              {hasFile && (
                <div>
                  <div className="px-4 py-2 flex items-center gap-2 bg-neutral-900/40 text-xs text-neutral-400">
                    <FileIcon className="size-3.5 text-lime-400" />
                    <span className="font-medium text-neutral-200">
                      {filename}
                    </span>
                    {fileContent && (
                      <span className="text-neutral-500">
                        · {(fileExt || 'txt').toUpperCase()} · {fileSizeKb} KB
                      </span>
                    )}
                  </div>
                  {fileContent ? (
                    <pre className="px-4 py-3 text-sm text-neutral-300 whitespace-pre-wrap font-mono">
                      {fileContent}
                    </pre>
                  ) : (
                    <p className="px-4 py-3 text-xs text-neutral-500 italic">
                      Couldn&apos;t load this file. Refresh the page or check
                      that the file is still in storage.
                    </p>
                  )}
                </div>
              )}
              {hasNotes && (
                <div>
                  <div className="px-4 py-2 flex items-center gap-2 bg-neutral-900/40 text-xs text-neutral-400">
                    <StickyNote className="size-3.5 text-yellow-400" />
                    <span className="font-medium text-neutral-200">Notes</span>
                  </div>
                  <p className="px-4 py-3 text-sm text-neutral-200 whitespace-pre-wrap font-mono">
                    {notes}
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  )
}
