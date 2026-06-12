// app/app/layout.tsx — protected layout. requireActiveMembership() guards all /app/* routes.
import { requireActiveMembership } from '@/lib/auth-helpers'
import { AppSidebar } from '@/components/app-sidebar'
import { Separator } from '@/components/ui/separator'
import {
  SidebarInset,
  SidebarProvider,
  SidebarTrigger,
} from '@/components/ui/sidebar'
import { TooltipProvider } from '@/components/ui/tooltip'

export default async function AppLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const membership = await requireActiveMembership()

  return (
    <TooltipProvider delay={0}>
      <SidebarProvider>
        <AppSidebar
          orgName={membership.org_name}
          role={membership.role}
          fullName={membership.full_name}
        />
        <SidebarInset className="bg-black">
          <header className="flex h-14 shrink-0 items-center gap-2 border-b border-neutral-800 px-4">
            <SidebarTrigger className="text-neutral-400" />
            <Separator
              orientation="vertical"
              className="mx-1 h-5 bg-neutral-800"
            />
            <span className="text-sm font-medium text-neutral-300">
              {membership.org_name}
            </span>
          </header>
          <div className="flex-1 overflow-auto">{children}</div>
        </SidebarInset>
      </SidebarProvider>
    </TooltipProvider>
  )
}
