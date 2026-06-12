'use client'

import { Button } from '@/components/ui/button'

interface Props {
  filename: string
  data: Record<string, string | number>[]
}

export function ExportButton({ filename, data }: Props) {
  function handleExport() {
    if (data.length === 0) {
      alert('No data to export')
      return
    }
    const headers = Object.keys(data[0])
    const csvRows = [
      headers.join(','),
      ...data.map((row) =>
        headers
          .map((h) => {
            const val = String(row[h] ?? '')
            if (val.includes(',') || val.includes('"') || val.includes('\n')) {
              return `"${val.replace(/"/g, '""')}"`
            }
            return val
          })
          .join(',')
      ),
    ]
    const csv = csvRows.join('\n')

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = filename
    document.body.appendChild(link)
    link.click()
    document.body.removeChild(link)
    URL.revokeObjectURL(url)
  }

  return (
    <Button
      size="sm"
      variant="outline"
      onClick={handleExport}
      className="border-neutral-700"
    >
      ⬇ Export CSV
    </Button>
  )
}
