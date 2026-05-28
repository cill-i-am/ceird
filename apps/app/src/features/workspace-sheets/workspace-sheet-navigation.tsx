"use client";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import * as React from "react";

import {
  closeWorkspaceSheetsSearch,
  decodeWorkspaceSheetSearch,
  openWorkspaceSheetSearch,
  popWorkspaceSheetSearch,
  pushWorkspaceSheetSearch,
  replaceTopWorkspaceSheetSearch,
} from "./workspace-sheet-search";
import type {
  WorkspaceSheet,
  WorkspaceSheetSearch,
} from "./workspace-sheet-search";

type WorkspaceSheetNavigationTo =
  | "/"
  | "/activity"
  | "/jobs"
  | "/members"
  | "/organization/settings"
  | "/sites";

interface WorkspaceSheetNavigationContextValue {
  readonly closeAll: () => void;
  readonly open: (sheet: WorkspaceSheet) => void;
  readonly pop: () => void;
  readonly push: (sheet: WorkspaceSheet) => void;
  readonly replaceTop: (sheet: WorkspaceSheet) => void;
  readonly stack: readonly WorkspaceSheet[];
}

const WorkspaceSheetNavigationContext =
  React.createContext<WorkspaceSheetNavigationContextValue | null>(null);

export function WorkspaceSheetNavigationProvider({
  children,
  stack,
}: {
  readonly children: React.ReactNode;
  readonly stack: readonly WorkspaceSheet[];
}) {
  const navigate = useNavigate({ from: "/" });
  const currentTo = useRouterState({
    select: (state) => getWorkspaceSheetNavigationTo(state.location.pathname),
  });
  const open = React.useCallback(
    (sheet: WorkspaceSheet) => {
      React.startTransition(() => {
        navigate({
          to: currentTo,
          search: (current) => openWorkspaceSheetSearch(current, sheet),
        });
      });
    },
    [currentTo, navigate]
  );
  const push = React.useCallback(
    (sheet: WorkspaceSheet) => {
      React.startTransition(() => {
        navigate({
          to: currentTo,
          search: (current) =>
            pushWorkspaceSheetSearch(withDecodedCurrentStack(current), sheet),
        });
      });
    },
    [currentTo, navigate]
  );
  const replaceTop = React.useCallback(
    (sheet: WorkspaceSheet) => {
      React.startTransition(() => {
        navigate({
          to: currentTo,
          search: (current) =>
            replaceTopWorkspaceSheetSearch(
              withDecodedCurrentStack(current),
              sheet
            ),
        });
      });
    },
    [currentTo, navigate]
  );
  const pop = React.useCallback(() => {
    React.startTransition(() => {
      navigate({
        to: currentTo,
        search: (current) =>
          popWorkspaceSheetSearch(withDecodedCurrentStack(current)),
      });
    });
  }, [currentTo, navigate]);
  const closeAll = React.useCallback(() => {
    React.startTransition(() => {
      navigate({
        to: currentTo,
        search: (current) =>
          closeWorkspaceSheetsSearch(withDecodedCurrentStack(current)),
      });
    });
  }, [currentTo, navigate]);
  const value = React.useMemo<WorkspaceSheetNavigationContextValue>(
    () => ({
      closeAll,
      open,
      pop,
      push,
      replaceTop,
      stack,
    }),
    [closeAll, open, pop, push, replaceTop, stack]
  );

  return (
    <WorkspaceSheetNavigationContext.Provider value={value}>
      {children}
    </WorkspaceSheetNavigationContext.Provider>
  );
}

export function useWorkspaceSheetNavigation() {
  const context = React.useContext(WorkspaceSheetNavigationContext);

  if (!context) {
    throw new Error(
      "Workspace sheet navigation must be used inside WorkspaceSheetNavigationProvider."
    );
  }

  return context;
}

export function useOpenWorkspaceSheet() {
  return useWorkspaceSheetNavigation().open;
}

export function usePushWorkspaceSheet() {
  return useWorkspaceSheetNavigation().push;
}

export function usePopWorkspaceSheet() {
  return useWorkspaceSheetNavigation().pop;
}

function withDecodedCurrentStack<T extends WorkspaceSheetSearch>(current: T) {
  const currentSearch = decodeWorkspaceSheetSearch(current);

  return {
    ...current,
    sheets: currentSearch.sheets,
  };
}

function getWorkspaceSheetNavigationTo(
  pathname: string
): WorkspaceSheetNavigationTo {
  switch (pathname) {
    case "/activity":
    case "/jobs":
    case "/members":
    case "/organization/settings":
    case "/sites": {
      return pathname;
    }
    default: {
      return "/";
    }
  }
}
