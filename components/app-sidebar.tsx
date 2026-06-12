'use client'

import { useState, useTransition } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  Atom,
  LayoutDashboard,
  Building2,
  ClipboardList,
  Sparkles,
  RefreshCw,
  BarChart3,
  Users,
  Settings,
  LogOut,
} from 'lucide-react'

import { createClient } from '@/lib/supabase-browser'
import { can } from '@/lib/rbac'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'

type Role = 'master' | 'manager' | 'creator'

export function AppSidebar({
  orgName,
  role,
  fullName,
}: {
  orgName: string
  role: Role
  fullName: string
}) {
  const pathname = usePathname()
  const router = useRouter()
  const [signingOut, setSigningOut] = useState(false)
  const [isPending, startTransition] = useTransition()

  const nav = [
    { title: 'Dashboard', href: '/app/dashboard', icon: LayoutDashboard },
    { title: 'Clients', href: '/app/clients', icon: Building2 },
    { title: 'Works', href: '/app/works', icon: ClipboardList },
    { title: 'Studio', href: '/app/studio', icon: Sparkles },
    { title: 'Sync & Assign', href: '/app/sync', icon: RefreshCw },
  ]
  if (can(role, 'reports', 'view')) {
    nav.push({ title: 'Reports', href: '/app/reports', icon: BarChart3 })
  }
  if (can(role, 'users', 'view')) {
    nav.push({ title: 'Users', href: '/app/users', icon: Users })
  }
  if (can(role, 'settings', 'view')) {
    nav.push({ title: 'Settings', href: '/app/settings', icon: Settings })
  }

  async function handleLogout() {
    setSigningOut(true)
    const supabase = createClient()
    await supabase.auth.signOut()
    startTransition(() => {
      router.push('/')
      router.refresh()
    })
  }

  return (
    <Sidebar>
      <SidebarHeader>
        <div className="flex items-center gap-2 px-2 py-1.5">
          <div className="flex size-8 items-center justify-center rounded-lg bg-lime-400 text-black">
            <Atom className="size-5" />
          </div>
          <div className="leading-tight">
            <div className="font-semibold text-white">Eigen</div>
            <div className="text-xs text-neutral-500 truncate max-w-[150px]">
              {orgName}
            </div>
          </div>
        </div>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Platform</SidebarGroupLabel>
          <SidebarMenu>
            {nav.map((item) => (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton
                  isActive={
                    pathname === item.href ||
                    pathname.startsWith(item.href + '/')
                  }
                  tooltip={item.title}
                  render={<Link href={item.href} />}
                >
                  <item.icon />
                  <span>{item.title}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </SidebarGroup>
      </SidebarContent>

      <SidebarFooter>
        <div className="flex items-center justify-between gap-2 px-2 py-1.5">
          <div className="min-w-0 flex-1">
            <div className="text-sm font-medium text-white truncate">
              {fullName}
            </div>
            <div className="text-xs text-neutral-500 capitalize">{role}</div>
          </div>

          <AlertDialog>
            <AlertDialogTrigger
              render={
                <Button
                  variant="ghost"
                  size="icon-sm"
                  aria-label="Sign out"
                  title="Sign out"
                  className="text-neutral-400 hover:text-white shrink-0"
                />
              }
            >
              <LogOut />
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Sign out of Eigen?</AlertDialogTitle>
                <AlertDialogDescription>
                  You&apos;ll be returned to the landing page and need to sign in
                  again to access {orgName}.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel disabled={signingOut || isPending}>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={handleLogout}
                  disabled={signingOut || isPending}
                  className="bg-lime-400 hover:bg-lime-300 text-black font-semibold"
                >
                  {signingOut || isPending ? 'Signing out…' : 'Confirm sign out'}
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}
