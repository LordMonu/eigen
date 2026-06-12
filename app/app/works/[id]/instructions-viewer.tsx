// app/app/works/[id]/instructions-viewer.tsx
// Renders a clickable file-icon card that opens a modal with the .md/.txt
// content. Server component fetches the content once (using cookie auth);
// the client component handles the open/close interaction.
import { createClient } from '@/lib/supabase-server'
import { InstructionsModal } from './instructions-modal'

export async function InstructionsViewer({ path }: { path: string }) {
  const supabase = await createClient()
  const { data, error } = await supabase.storage
    .from('work-instructions')
    .download(path)

  const filename = path.split('/').pop() || 'instructions.txt'
  const ext = filename.split('.').pop()?.toLowerCase() || 'txt'

  if (error || !data) {
    return (
      <div className="px-4 py-3 text-neutral-500 text-sm">
        Could not load instructions ({error?.message || 'unknown'})
      </div>
    )
  }

  const content = await data.text()

  return (
    <InstructionsModal filename={filename} ext={ext} content={content} />
  )
}
