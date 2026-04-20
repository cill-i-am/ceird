"use client";

import { UnfoldMoreIcon, LogoutIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
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
              <SidebarMenuButton
                size="lg"
                className="aria-expanded:bg-muted aria-expanded:text-foreground"
              />
            }
          >
            <Avatar>
              <AvatarImage src={user.image ?? undefined} alt={user.name} />
              <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
            </Avatar>
            <div className="grid flex-1 text-left text-sm leading-tight">
              <span className="truncate font-medium">{user.name}</span>
              <span className="truncate text-xs">{user.email}</span>
            </div>
            <HugeiconsIcon
              icon={UnfoldMoreIcon}
              strokeWidth={2}
              className="ml-auto size-4"
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "right"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuGroup>
              <DropdownMenuLabel className="p-0 font-normal">
                <div className="flex items-center gap-2 px-1 py-1.5 text-left text-sm">
                  <Avatar>
                    <AvatarImage
                      src={user.image ?? undefined}
                      alt={user.name}
                    />
                    <AvatarFallback>{getInitials(user.name)}</AvatarFallback>
                  </Avatar>
                  <div className="grid flex-1 text-left text-sm leading-tight">
                    <span className="truncate font-medium">{user.name}</span>
                    <span className="truncate text-xs">{user.email}</span>
                  </div>
                </div>
              </DropdownMenuLabel>
            </DropdownMenuGroup>
            <DropdownMenuSeparator />
            <DropdownMenuGroup>
              <DropdownMenuItem
                disabled={isSigningOut}
                onSelect={async (event) => {
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
