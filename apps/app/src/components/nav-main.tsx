import { ArrowRight01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Link, useRouterState } from "@tanstack/react-router";
import * as React from "react";

import { getPrimaryNavShortcut } from "#/components/app-navigation";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "#/components/ui/collapsible";
import {
  SidebarGroup,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuAction,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarMenuSub,
  SidebarMenuSubButton,
  SidebarMenuSubItem,
} from "#/components/ui/sidebar";
import { ShortcutHint } from "#/hotkeys/hotkey-display";

export function NavMain({
  items,
}: {
  items: {
    title: string;
    url: string;
    icon: React.ReactNode;
    isActive?: boolean;
    items?: {
      title: string;
      url: string;
    }[];
  }[];
}) {
  const pathname = useRouterState({
    select: (state) => state.location.pathname,
  });
  const [expandedItems, setExpandedItems] = React.useState<
    Record<string, true | undefined>
  >({});

  function isCurrentPath(url: string) {
    if (url === "/") {
      return pathname === "/";
    }

    return pathname === url || pathname.startsWith(`${url}/`);
  }

  return (
    <SidebarGroup className="gap-2 pt-0">
      <SidebarGroupLabel className="sr-only">Navigation</SidebarGroupLabel>
      <SidebarMenu>
        {items.map((item) => {
          const hasChildren = Boolean(item.items?.length);
          const itemKey = item.url;
          const isActive = item.isActive ?? isCurrentPath(item.url);
          const isOpen = isActive || expandedItems[itemKey] === true;
          const shortcut = getPrimaryNavShortcut(item.url);

          return (
            <Collapsible
              key={item.title}
              open={hasChildren ? isOpen : undefined}
              onOpenChange={
                hasChildren
                  ? (open) => {
                      setExpandedItems((current) => {
                        if (open) {
                          return {
                            ...current,
                            [itemKey]: true,
                          };
                        }

                        if (current[itemKey] === undefined) {
                          return current;
                        }

                        return Object.fromEntries(
                          Object.entries(current).filter(
                            ([key]) => key !== itemKey
                          )
                        ) as Record<string, true | undefined>;
                      });
                    }
                  : undefined
              }
              render={<SidebarMenuItem />}
            >
              <SidebarMenuButton
                isActive={isActive}
                size="sm"
                tooltip={getNavigationTooltip(item)}
                render={<Link to={item.url} />}
              >
                {item.icon}
                <span className="min-w-0 flex-1 truncate">{item.title}</span>
                {shortcut ? (
                  <ShortcutHint
                    decorative
                    className="ml-auto shrink-0 opacity-0 transition-opacity group-hover/menu-button:opacity-100 group-focus-visible/menu-button:opacity-100 group-data-[collapsible=icon]:hidden"
                    hotkey={shortcut.hotkey}
                    label={shortcut.label}
                  />
                ) : null}
              </SidebarMenuButton>
              {hasChildren ? (
                <>
                  <SidebarMenuAction
                    render={<CollapsibleTrigger />}
                    className="aria-expanded:rotate-90"
                  >
                    <HugeiconsIcon icon={ArrowRight01Icon} strokeWidth={2} />
                    <span className="sr-only">Toggle</span>
                  </SidebarMenuAction>
                  <CollapsibleContent>
                    <SidebarMenuSub>
                      {item.items?.map((subItem) => (
                        <SidebarMenuSubItem key={subItem.title}>
                          <SidebarMenuSubButton
                            isActive={isCurrentPath(subItem.url)}
                            render={<Link to={subItem.url} />}
                          >
                            <span>{subItem.title}</span>
                          </SidebarMenuSubButton>
                        </SidebarMenuSubItem>
                      ))}
                    </SidebarMenuSub>
                  </CollapsibleContent>
                </>
              ) : null}
            </Collapsible>
          );
        })}
      </SidebarMenu>
    </SidebarGroup>
  );
}

function getNavigationTooltip(item: {
  readonly title: string;
  readonly url: string;
}) {
  const shortcut = getPrimaryNavShortcut(item.url);

  if (!shortcut) {
    return item.title;
  }

  return {
    children: (
      <>
        <span>{item.title}</span>
        <ShortcutHint hotkey={shortcut.hotkey} label={shortcut.label} />
      </>
    ),
  };
}
