'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { ClientFormDialog } from '../client-form-dialog'
import type { ClientStatus } from '@/lib/client-helpers'

interface Props {
  client: {
    id: string
    name: string
    industry: string | null
    status: ClientStatus
  }
}

export function EditClientButton({ client }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        variant="outline"
        size="sm"
        onClick={() => setOpen(true)}
        className="h-8"
      >
        Edit
      </Button>
      <ClientFormDialog
        open={open}
        onOpenChange={setOpen}
        mode="edit"
        initialData={client}
      />
    </>
  )
}
