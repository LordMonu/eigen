'use client'

import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { CreateWorkDialog } from '@/app/app/works/create-work-dialog'

interface Props {
  clientId: string
  clientName: string
}

export function CreateWorkButton({ clientId, clientName }: Props) {
  const [open, setOpen] = useState(false)
  return (
    <>
      <Button
        onClick={() => setOpen(true)}
        className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
        size="sm"
      >
        + Create Work
      </Button>
      <CreateWorkDialog
        open={open}
        onOpenChange={setOpen}
        clientId={clientId}
        clientName={clientName}
      />
    </>
  )
}
