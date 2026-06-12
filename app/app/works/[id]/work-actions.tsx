'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Pencil } from 'lucide-react'
import { EditWorkDialog } from './edit-work-dialog'
import { DeleteWorkButton } from './delete-work-button'

interface WorkData {
  id: string
  title: string | null
  creator_id: string
  video_type: string | null
  max_credits: number | null
  start_date: string | null
  end_date: string | null
  start_time: string | null
  end_time: string | null
  notes: string | null
}

interface Props {
  work: WorkData
  canEdit: boolean
  canDelete: boolean
}

export function WorkActions({ work, canEdit, canDelete }: Props) {
  const [editOpen, setEditOpen] = useState(false)

  if (!canEdit && !canDelete) return null

  return (
    <div className="flex items-center gap-2">
      {canEdit && (
        <>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setEditOpen(true)}
          >
            <Pencil className="size-4 mr-1" />
            Edit
          </Button>
          <EditWorkDialog
            open={editOpen}
            onOpenChange={setEditOpen}
            work={work}
          />
        </>
      )}
      {canDelete && (
        <DeleteWorkButton
          workId={work.id}
          workTitle={work.title || work.video_type || 'Untitled Work'}
        />
      )}
    </div>
  )
}
