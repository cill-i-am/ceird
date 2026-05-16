import { HotkeysProvider } from "@tanstack/react-hotkeys";
import {
  ClientOnly,
  HeadContent,
  Scripts,
  createRootRoute,
} from "@tanstack/react-router";
import * as React from "react";

import { Toaster } from "#/components/ui/sonner";

import { TooltipProvider } from "../components/ui/tooltip";

import appCss from "../styles.css?url";

const THEME_INIT_SCRIPT = `(function(){try{var stored=window.localStorage.getItem('theme');var mode=(stored==='light'||stored==='dark'||stored==='auto')?stored:'auto';var prefersDark=window.matchMedia('(prefers-color-scheme: dark)').matches;var resolved=mode==='auto'?(prefersDark?'dark':'light'):mode;var root=document.documentElement;root.classList.remove('light','dark');root.classList.add(resolved);if(mode==='auto'){root.removeAttribute('data-theme')}else{root.setAttribute('data-theme',mode)}root.style.colorScheme=resolved;}catch(e){}})();`;
let renderDevelopmentDevtools: (() => React.ReactNode) | null = null;

function DevelopmentDevtoolsPanel() {
  return renderDevelopmentDevtools?.() ?? null;
}

const DevelopmentDevtools = import.meta.env.DEV
  ? React.lazy(async () => {
      const [{ TanStackDevtools }, { TanStackRouterDevtoolsPanel }] =
        await Promise.all([
          import("@tanstack/react-devtools"),
          import("@tanstack/react-router-devtools"),
        ]);

      renderDevelopmentDevtools = () => (
        <TanStackDevtools
          config={{
            position: "top-right",
            triggerHidden: true,
          }}
          plugins={[
            {
              name: "Tanstack Router",
              render: <TanStackRouterDevtoolsPanel />,
            },
          ]}
        />
      );

      return {
        default: DevelopmentDevtoolsPanel,
      };
    })
  : null;

export const Route = createRootRoute({
  head: () => ({
    meta: [
      {
        charSet: "utf8",
      },
      {
        name: "viewport",
        content: "width=device-width, initial-scale=1",
      },
      {
        title: "Ceird",
      },
    ],
    links: [
      {
        rel: "icon",
        href: "/favicon.ico",
        sizes: "any",
      },
      {
        rel: "icon",
        type: "image/svg+xml",
        href: "/favicon.svg",
      },
      {
        rel: "apple-touch-icon",
        href: "/logo192.png",
      },
      {
        rel: "manifest",
        href: "/manifest.json",
      },
      {
        rel: "stylesheet",
        href: appCss,
      },
    ],
  }),
  shellComponent: RootDocument,
});

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script>{THEME_INIT_SCRIPT}</script>
        <HeadContent />
      </head>
      <body className="font-sans [overflow-wrap:anywhere] antialiased selection:bg-primary/20">
        <TooltipProvider>
          <HotkeysProvider>
            {children}
            <ClientOnly fallback={null}>
              <Toaster position="top-right" closeButton />
            </ClientOnly>
            <DevelopmentDevtoolsIsland />
            <Scripts />
          </HotkeysProvider>
        </TooltipProvider>
      </body>
    </html>
  );
}

function DevelopmentDevtoolsIsland() {
  if (!DevelopmentDevtools) {
    return null;
  }

  return (
    <ClientOnly fallback={null}>
      <React.Suspense fallback={null}>
        <DevelopmentDevtools />
      </React.Suspense>
    </ClientOnly>
  );
}
