"use client";

import {
  AccountSetting01Icon,
  LogoutIcon,
  Settings02Icon,
  UnfoldMoreIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link } from "@tanstack/react-router";
import * as React from "react";

import { Avatar, AvatarFallback, AvatarImage } from "#/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "#/components/ui/dropdown-menu";
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "#/components/ui/sidebar";
import type { LoginNavigationTarget } from "#/features/auth/auth-navigation";
import { getLoginNavigationTarget } from "#/features/auth/auth-navigation";
import { hardRedirectToLogin } from "#/features/auth/hard-redirect-to-login";
import { signOut } from "#/features/auth/sign-out";

export interface NavUserAccount {
  name: string;
  email: string;
  image?: string | null;
}

export type NavUserNavigate = (options: LoginNavigationTarget) => Promise<void>;

function getInitials(name: string) {
  const initials = name
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

  return initials || "U";
}

export function NavUser({
  user,
  navigate,
}: {
  user: NavUserAccount;
  navigate: NavUserNavigate;
}) {
  const { isMobile } = useSidebar();
  const [isSigningOut, setIsSigningOut] = React.useState(false);
  const [errorMessage, setErrorMessage] = React.useState<string | null>(null);

  async function handleSignOut() {
    try {
      const result = await signOut();

      if (result.error) {
        setErrorMessage("Couldn't sign out. Please try again.");
        return;
      }

      try {
        await navigate(getLoginNavigationTarget());
      } catch {
        if (!hardRedirectToLogin()) {
          setErrorMessage(
            "Couldn't redirect after sign out. Please try again."
          );
        }
      }
    } catch {
      setErrorMessage("Couldn't sign out. Please try again.");
    }
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <SidebarMenuButton className="overflow-visible rounded-[calc(var(--radius)*2.2)] border border-transparent bg-sidebar/40 px-2.5 py-2 aria-expanded:bg-sidebar-accent aria-expanded:text-sidebar-accent-foreground" />
            }
          >
            <Avatar className="size-9 rounded-[calc(var(--radius)*2)] border border-sidebar-border/70">
              <AvatarImage src={user.image ?? undefined} alt={user.name} />
              <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs text-sidebar-foreground/65">
                {user.email}
              </span>
            </div>
            <HugeiconsIcon
              icon={UnfoldMoreIcon}
              strokeWidth={2}
              className="ml-auto size-4 text-sidebar-foreground/60"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-[calc(var(--radius)*2.2)]"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-3 px-1 py-1.5 text-left text-sm">
                  <Avatar className="size-9 rounded-[calc(var(--radius)*2)] border border-border/60">
                    <AvatarImage
                      src={user.image ?? undefined}
                      alt={user.name}
                    />
                    <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="text-[0.68rem] font-medium text-muted-foreground uppercase">
                      Signed in
                    </span>
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs">{user.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem render={<Link to="/organization/settings" />}>
                <HugeiconsIcon icon={Settings02Icon} strokeWidth={2} />
                Organization settings
              </DropdownMenuItem>
              <DropdownMenuItem
                render={
                  <Link to="/settings" search={{ emailChange: undefined }} />
                }
              >
                <HugeiconsIcon icon={AccountSetting01Icon} strokeWidth={2} />
                Settings
              </DropdownMenuItem>
              <DropdownMenuItem
                disabled={isSigningOut}
                onClick={async (event) => {
                  event.preventDefault();

                  if (isSigningOut) {
                    return;
                  }

                  setErrorMessage(null);
                  setIsSigningOut(true);

                  try {
                    await handleSignOut();
                  } finally {
                    setIsSigningOut(false);
                  }
                }}
              >
                <HugeiconsIcon icon={LogoutIcon} strokeWidth={2} />
                {isSigningOut ? "Signing out..." : "Sign out"}
              </DropdownMenuItem>
            </DropdownMenuGroup>
            {errorMessage ? (
              <>
                <DropdownMenuSeparator />
                <p className="px-3 py-1 text-xs text-destructive" role="status">
                  {errorMessage}
                </p>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  );
}
