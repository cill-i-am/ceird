import type { OrganizationRole } from "@ceird/identity-core";
import {
  ArrowReloadHorizontalIcon,
  CheckmarkCircle01Icon,
  Copy01Icon,
  Delete02Icon,
  Key02Icon,
  QrCode01Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { useBlocker } from "@tanstack/react-router";
import { REGEXP_ONLY_DIGITS } from "input-otp";
import * as React from "react";
import { QRCode } from "react-qr-code";

import { AppUtilityPanel } from "#/components/app-utility-panel";
import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { Checkbox } from "#/components/ui/checkbox";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import {
  InputOTP,
  InputOTPGroup,
  InputOTPSlot,
} from "#/components/ui/input-otp";
import { activeElementIsInside } from "#/hotkeys/focus";
import { authClient } from "#/lib/auth-client";
import { beginMutationFeedback } from "#/lib/mutation-feedback";

export interface UserTwoFactorPanelUser {
  readonly email: string;
  readonly emailVerified?: boolean | null;
  readonly twoFactorEnabled: boolean;
}

export interface UserTwoFactorPanelProps {
  readonly currentOrganizationRole?: OrganizationRole | undefined;
  readonly onTwoFactorStatusChange?: (() => Promise<void> | void) | undefined;
  readonly submitControlsRef?:
    | React.Ref<UserTwoFactorPanelSubmitControls>
    | undefined;
  readonly user: UserTwoFactorPanelUser;
}

export interface UserTwoFactorPanelSubmitControls {
  submitActiveForm: () => boolean;
}

type BackupCodeMode = "enrollment" | "regeneration";
type PendingAction = "disable" | "enable" | "regenerate" | "verify" | null;
type PanelMessage = {
  readonly text: string;
  readonly tone: "destructive" | "neutral";
} | null;
type SetupState =
  | {
      readonly status: "password";
    }
  | {
      readonly backupCodes: readonly string[];
      readonly status: "verify";
      readonly totpURI: string;
    }
  | {
      readonly backupCodes: readonly string[];
      readonly mode: BackupCodeMode;
      readonly status: "backupCodes";
    };
type ManagementFlow = "disable" | "regenerate" | null;
interface TwoFactorPanelState {
  readonly backupCodesAcknowledged: boolean;
  readonly disableConfirmed: boolean;
  readonly enabled: boolean;
  readonly managementFlow: ManagementFlow;
  readonly managementPassword: string;
  readonly message: PanelMessage;
  readonly pendingAction: PendingAction;
  readonly setupPassword: string;
  readonly setupState: SetupState;
  readonly totpCode: string;
}
type TwoFactorPanelAction =
  | {
      readonly enabled: boolean;
      readonly type: "sync-enabled";
    }
  | {
      readonly message: PanelMessage;
      readonly type: "set-message";
    }
  | {
      readonly pendingAction: PendingAction;
      readonly type: "set-pending-action";
    }
  | {
      readonly password: string;
      readonly type: "change-setup-password";
    }
  | {
      readonly code: string;
      readonly type: "change-totp-code";
    }
  | {
      readonly backupCodes: readonly string[];
      readonly totpURI: string;
      readonly type: "enrollment-created";
    }
  | {
      readonly backupCodes: readonly string[];
      readonly mode: BackupCodeMode;
      readonly type: "show-backup-codes";
    }
  | {
      readonly acknowledged: boolean;
      readonly type: "set-backup-codes-acknowledged";
    }
  | {
      readonly type: "finish-backup-code-review";
    }
  | {
      readonly password: string;
      readonly type: "change-management-password";
    }
  | {
      readonly flow: Exclude<ManagementFlow, null>;
      readonly type: "select-management-flow";
    }
  | {
      readonly confirmed: boolean;
      readonly type: "set-disable-confirmed";
    }
  | {
      readonly type: "reset-management-flow";
    }
  | {
      readonly type: "two-factor-disabled";
    };

const TWO_FACTOR_DESCRIPTION =
  "Add an authenticator app so signing in requires a time-based code after your password.";
const OWNER_ADMIN_PROMPT =
  "Owners and admins should protect this account with 2FA before inviting teammates or changing workspace access.";
const BACKUP_CODE_WARNING =
  "Save these backup codes now. Each code works once, and they are the only self-service recovery path if you lose your authenticator.";

export function UserTwoFactorPanel({
  currentOrganizationRole,
  onTwoFactorStatusChange,
  submitControlsRef,
  user,
}: UserTwoFactorPanelProps) {
  const twoFactorPanel = useUserTwoFactorPanelController({
    onTwoFactorStatusChange,
    submitControlsRef,
    user,
  });
  const {
    disableFormRef,
    regenerateFormRef,
    setupFormRef,
    state,
    verifyFormRef,
  } = twoFactorPanel;
  const {
    backupCodesAcknowledged,
    disableConfirmed,
    enabled,
    managementFlow,
    managementPassword,
    message,
    pendingAction,
    setupPassword,
    setupState,
    totpCode,
  } = state;
  const emailVerified = user.emailVerified === true;
  const showPrivilegedPrompt =
    !enabled &&
    (currentOrganizationRole === "owner" ||
      currentOrganizationRole === "admin");

  return (
    <AppUtilityPanel
      title="Two-factor authentication"
      description={TWO_FACTOR_DESCRIPTION}
      actions={<TwoFactorStatusBadge enabled={enabled} />}
    >
      {message ? <TwoFactorMessage message={message} /> : null}

      {emailVerified || enabled ? null : (
        <Alert variant="warning">
          <AlertTitle>Verify your email before setting up 2FA.</AlertTitle>
          <AlertDescription>
            We use your verified email for account recovery and security
            notices.
          </AlertDescription>
        </Alert>
      )}

      {setupState.status === "backupCodes" ? (
        <BackupCodesReview
          acknowledged={backupCodesAcknowledged}
          backupCodes={setupState.backupCodes}
          mode={setupState.mode}
          onAcknowledgedChange={twoFactorPanel.setBackupCodesAcknowledged}
          onDone={twoFactorPanel.finishBackupCodeReview}
        />
      ) : null}

      {emailVerified && !enabled && setupState.status === "password" ? (
        <SetupPasswordForm
          formRef={setupFormRef}
          password={setupPassword}
          pending={pendingAction === "enable"}
          privilegedPrompt={showPrivilegedPrompt}
          onPasswordChange={twoFactorPanel.changeSetupPassword}
          onSubmit={(event) => void twoFactorPanel.startEnrollment(event)}
        />
      ) : null}

      {emailVerified && setupState.status === "verify" ? (
        <EnrollmentVerificationForm
          code={totpCode}
          formRef={verifyFormRef}
          pending={pendingAction === "verify"}
          totpURI={setupState.totpURI}
          onCodeChange={twoFactorPanel.changeTotpCode}
          onSubmit={(event) => void twoFactorPanel.verifyEnrollment(event)}
        />
      ) : null}

      {enabled && setupState.status !== "backupCodes" ? (
        <EnabledManagement
          disableConfirmed={disableConfirmed}
          disableFormRef={disableFormRef}
          flow={managementFlow}
          password={managementPassword}
          pendingAction={pendingAction}
          regenerateFormRef={regenerateFormRef}
          onCancel={twoFactorPanel.resetManagementFlow}
          onDisableConfirmedChange={twoFactorPanel.setDisableConfirmed}
          onDisableSubmit={(event) =>
            void twoFactorPanel.disableTwoFactor(event)
          }
          onFlowChange={twoFactorPanel.selectManagementFlow}
          onPasswordChange={twoFactorPanel.changeManagementPassword}
          onRegenerateSubmit={(event) =>
            void twoFactorPanel.regenerateBackupCodes(event)
          }
        />
      ) : null}
    </AppUtilityPanel>
  );
}

function useUserTwoFactorPanelController({
  onTwoFactorStatusChange,
  submitControlsRef,
  user,
}: Pick<
  UserTwoFactorPanelProps,
  "onTwoFactorStatusChange" | "submitControlsRef" | "user"
>) {
  const [state, dispatch] = React.useReducer(
    twoFactorPanelReducer,
    user.twoFactorEnabled === true,
    createInitialTwoFactorPanelState
  );
  const pendingActionRef = React.useRef<PendingAction>(null);
  const setupFormRef = React.useRef<HTMLFormElement | null>(null);
  const verifyFormRef = React.useRef<HTMLFormElement | null>(null);
  const regenerateFormRef = React.useRef<HTMLFormElement | null>(null);
  const disableFormRef = React.useRef<HTMLFormElement | null>(null);
  const backupCodeReviewPending =
    state.setupState.status === "backupCodes" && !state.backupCodesAcknowledged;

  const setPendingAction = React.useCallback(
    (nextPendingAction: PendingAction) => {
      pendingActionRef.current = nextPendingAction;
      dispatch({
        pendingAction: nextPendingAction,
        type: "set-pending-action",
      });
    },
    []
  );

  React.useEffect(() => {
    dispatch({
      enabled: user.twoFactorEnabled === true,
      type: "sync-enabled",
    });
  }, [user.twoFactorEnabled]);

  const shouldBlockBackupCodeNavigation = React.useCallback(() => {
    if (!backupCodeReviewPending) {
      return false;
    }

    return !globalThis.window.confirm(
      "Save your backup codes before leaving this page. If you leave now, you will not be able to view them again."
    );
  }, [backupCodeReviewPending]);

  useBlocker({
    disabled: !backupCodeReviewPending,
    enableBeforeUnload: () => backupCodeReviewPending,
    shouldBlockFn: shouldBlockBackupCodeNavigation,
  });

  React.useImperativeHandle(
    submitControlsRef,
    () => ({
      submitActiveForm() {
        if (activeElementIsInside(setupFormRef)) {
          requestSubmitWhenIdle(setupFormRef, pendingActionRef);
          return true;
        }

        if (activeElementIsInside(verifyFormRef)) {
          requestSubmitWhenIdle(verifyFormRef, pendingActionRef);
          return true;
        }

        if (activeElementIsInside(regenerateFormRef)) {
          requestSubmitWhenIdle(regenerateFormRef, pendingActionRef);
          return true;
        }

        if (activeElementIsInside(disableFormRef)) {
          requestSubmitWhenIdle(disableFormRef, pendingActionRef);
          return true;
        }

        return false;
      },
    }),
    []
  );

  const setMessage = React.useCallback((message: PanelMessage) => {
    dispatch({ message, type: "set-message" });
  }, []);

  const startEnrollment = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (!state.setupPassword.trim() || pendingActionRef.current !== null) {
        return;
      }

      setPendingAction("enable");
      setMessage(null);

      const result = await authClient.twoFactor.enable({
        password: state.setupPassword,
      });

      if (result.error || !result.data) {
        setMessage({
          text: getTwoFactorMutationFailureMessage(result.error),
          tone: "destructive",
        });
        setPendingAction(null);
        return;
      }

      dispatch({
        backupCodes: result.data.backupCodes,
        totpURI: result.data.totpURI,
        type: "enrollment-created",
      });
      setPendingAction(null);
    },
    [setMessage, setPendingAction, state.setupPassword]
  );

  const verifyEnrollment = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (
        state.setupState.status !== "verify" ||
        state.totpCode.length !== 6 ||
        pendingActionRef.current !== null
      ) {
        return;
      }

      setPendingAction("verify");
      setMessage(null);

      const result = await authClient.twoFactor.verifyTotp({
        code: state.totpCode,
      });

      if (result.error || !result.data) {
        setMessage({
          text: getTwoFactorCodeFailureMessage(result.error),
          tone: "destructive",
        });
        setPendingAction(null);
        return;
      }

      const mutationFeedback = beginMutationFeedback();
      await mutationFeedback.waitForSuccess();
      dispatch({
        backupCodes: state.setupState.backupCodes,
        mode: "enrollment",
        type: "show-backup-codes",
      });
      await onTwoFactorStatusChange?.();
      setPendingAction(null);
    },
    [
      onTwoFactorStatusChange,
      setMessage,
      setPendingAction,
      state.setupState,
      state.totpCode,
    ]
  );

  const regenerateBackupCodes = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (
        !state.managementPassword.trim() ||
        pendingActionRef.current !== null
      ) {
        return;
      }

      setPendingAction("regenerate");
      setMessage(null);

      const result = await authClient.twoFactor.generateBackupCodes({
        password: state.managementPassword,
      });

      if (result.error || !result.data) {
        setMessage({
          text: getTwoFactorMutationFailureMessage(result.error),
          tone: "destructive",
        });
        setPendingAction(null);
        return;
      }

      const mutationFeedback = beginMutationFeedback();
      await mutationFeedback.waitForSuccess();
      dispatch({
        backupCodes: result.data.backupCodes,
        mode: "regeneration",
        type: "show-backup-codes",
      });
      setPendingAction(null);
    },
    [setMessage, setPendingAction, state.managementPassword]
  );

  const disableTwoFactor = React.useCallback(
    async (event: React.FormEvent<HTMLFormElement>) => {
      event.preventDefault();

      if (
        !state.managementPassword.trim() ||
        !state.disableConfirmed ||
        pendingActionRef.current !== null
      ) {
        return;
      }

      setPendingAction("disable");
      setMessage(null);

      const result = await authClient.twoFactor.disable({
        password: state.managementPassword,
      });

      if (result.error || !result.data?.status) {
        setMessage({
          text: getTwoFactorMutationFailureMessage(result.error),
          tone: "destructive",
        });
        setPendingAction(null);
        return;
      }

      const mutationFeedback = beginMutationFeedback();
      await mutationFeedback.waitForSuccess();
      dispatch({ type: "two-factor-disabled" });
      setPendingAction(null);
      await onTwoFactorStatusChange?.();
    },
    [
      onTwoFactorStatusChange,
      setMessage,
      setPendingAction,
      state.disableConfirmed,
      state.managementPassword,
    ]
  );

  return {
    backupCodeReviewPending,
    changeManagementPassword: (password: string) =>
      dispatch({ password, type: "change-management-password" }),
    changeSetupPassword: (password: string) =>
      dispatch({ password, type: "change-setup-password" }),
    changeTotpCode: (code: string) =>
      dispatch({ code, type: "change-totp-code" }),
    disableFormRef,
    disableTwoFactor,
    finishBackupCodeReview: () =>
      dispatch({ type: "finish-backup-code-review" }),
    regenerateBackupCodes,
    regenerateFormRef,
    resetManagementFlow: () => dispatch({ type: "reset-management-flow" }),
    selectManagementFlow: (flow: Exclude<ManagementFlow, null>) =>
      dispatch({ flow, type: "select-management-flow" }),
    setBackupCodesAcknowledged: (acknowledged: boolean) =>
      dispatch({ acknowledged, type: "set-backup-codes-acknowledged" }),
    setDisableConfirmed: (confirmed: boolean) =>
      dispatch({ confirmed, type: "set-disable-confirmed" }),
    setupFormRef,
    startEnrollment,
    state,
    verifyEnrollment,
    verifyFormRef,
  };
}

function createInitialTwoFactorPanelState(
  enabled: boolean
): TwoFactorPanelState {
  return {
    backupCodesAcknowledged: false,
    disableConfirmed: false,
    enabled,
    managementFlow: null,
    managementPassword: "",
    message: null,
    pendingAction: null,
    setupPassword: "",
    setupState: { status: "password" },
    totpCode: "",
  };
}

function twoFactorPanelReducer(
  state: TwoFactorPanelState,
  action: TwoFactorPanelAction
): TwoFactorPanelState {
  switch (action.type) {
    case "sync-enabled": {
      return { ...state, enabled: action.enabled };
    }
    case "set-message": {
      return { ...state, message: action.message };
    }
    case "set-pending-action": {
      return { ...state, pendingAction: action.pendingAction };
    }
    case "change-setup-password": {
      return { ...state, message: null, setupPassword: action.password };
    }
    case "change-totp-code": {
      return { ...state, message: null, totpCode: action.code };
    }
    case "enrollment-created": {
      return {
        ...state,
        backupCodesAcknowledged: false,
        setupPassword: "",
        setupState: {
          backupCodes: action.backupCodes,
          status: "verify",
          totpURI: action.totpURI,
        },
        totpCode: "",
      };
    }
    case "show-backup-codes": {
      return {
        ...state,
        backupCodesAcknowledged: false,
        managementFlow: null,
        managementPassword: "",
        setupState: {
          backupCodes: action.backupCodes,
          mode: action.mode,
          status: "backupCodes",
        },
      };
    }
    case "set-backup-codes-acknowledged": {
      return { ...state, backupCodesAcknowledged: action.acknowledged };
    }
    case "finish-backup-code-review": {
      if (
        !state.backupCodesAcknowledged ||
        state.setupState.status !== "backupCodes"
      ) {
        return state;
      }

      return {
        ...state,
        backupCodesAcknowledged: false,
        enabled: true,
        message: { text: "2FA is enabled.", tone: "neutral" },
        setupState: { status: "password" },
      };
    }
    case "change-management-password": {
      return { ...state, managementPassword: action.password, message: null };
    }
    case "select-management-flow": {
      return {
        ...state,
        disableConfirmed: false,
        managementFlow: action.flow,
        managementPassword: "",
        message: null,
      };
    }
    case "set-disable-confirmed": {
      return { ...state, disableConfirmed: action.confirmed };
    }
    case "reset-management-flow": {
      return {
        ...state,
        disableConfirmed: false,
        managementFlow: null,
        managementPassword: "",
      };
    }
    case "two-factor-disabled": {
      return {
        ...state,
        disableConfirmed: false,
        enabled: false,
        managementFlow: null,
        managementPassword: "",
        message: { text: "2FA is disabled.", tone: "neutral" },
        setupState: { status: "password" },
      };
    }
    default: {
      return assertNeverTwoFactorPanelAction(action);
    }
  }
}

function assertNeverTwoFactorPanelAction(action: never): never {
  throw new Error(
    `Unhandled two-factor panel action: ${JSON.stringify(action)}`
  );
}

function requestSubmitWhenIdle(
  formRef: React.RefObject<HTMLFormElement | null>,
  pendingActionRef: React.RefObject<PendingAction>
) {
  if (pendingActionRef.current === null) {
    formRef.current?.requestSubmit();
  }
}

function TwoFactorStatusBadge({ enabled }: { readonly enabled: boolean }) {
  return (
    <Badge variant={enabled ? "default" : "secondary"}>
      {enabled ? "Enabled" : "Not enrolled"}
    </Badge>
  );
}

function TwoFactorMessage({ message }: { readonly message: PanelMessage }) {
  if (!message) {
    return null;
  }

  return (
    <p
      className={
        message.tone === "destructive"
          ? "text-sm text-destructive"
          : "text-sm text-muted-foreground"
      }
      role={message.tone === "destructive" ? "alert" : "status"}
    >
      {message.text}
    </p>
  );
}

function SetupPasswordForm({
  formRef,
  password,
  pending,
  privilegedPrompt,
  onPasswordChange,
  onSubmit,
}: {
  readonly formRef: React.RefObject<HTMLFormElement | null>;
  readonly password: string;
  readonly pending: boolean;
  readonly privilegedPrompt: boolean;
  readonly onPasswordChange: (value: string) => void;
  readonly onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      ref={formRef}
      className="flex flex-col gap-4"
      method="post"
      noValidate
      onSubmit={onSubmit}
    >
      {privilegedPrompt ? (
        <Alert variant="info">
          <HugeiconsIcon icon={Key02Icon} strokeWidth={2} />
          <AlertTitle>Recommended for this account</AlertTitle>
          <AlertDescription>{OWNER_ADMIN_PROMPT}</AlertDescription>
        </Alert>
      ) : null}

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="two-factor-setup-password">
            Current password for 2FA setup
          </FieldLabel>
          <Input
            id="two-factor-setup-password"
            name="password"
            type="password"
            autoComplete="current-password"
            value={password}
            disabled={pending}
            onChange={(event) => onPasswordChange(event.target.value)}
          />
          <FieldDescription>
            We ask for your password before creating authenticator app setup
            material.
          </FieldDescription>
        </Field>
      </FieldGroup>

      <Button
        type="submit"
        size="lg"
        className="self-start max-sm:w-full max-sm:self-stretch"
        loading={pending}
        disabled={!password.trim() || pending}
      >
        <HugeiconsIcon
          icon={QrCode01Icon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        {pending ? "Creating setup..." : "Set up 2FA"}
      </Button>
    </form>
  );
}

function EnrollmentVerificationForm({
  code,
  formRef,
  pending,
  totpURI,
  onCodeChange,
  onSubmit,
}: {
  readonly code: string;
  readonly formRef: React.RefObject<HTMLFormElement | null>;
  readonly pending: boolean;
  readonly totpURI: string;
  readonly onCodeChange: (value: string) => void;
  readonly onSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <form
      ref={formRef}
      className="flex flex-col gap-5"
      method="post"
      noValidate
      onSubmit={onSubmit}
    >
      <div className="grid gap-4 md:grid-cols-[minmax(0,12rem)_minmax(0,1fr)] md:items-start">
        <div className="flex aspect-square w-48 max-w-full items-center justify-center rounded-[calc(var(--radius)*2)] border border-border/60 bg-white p-3 text-black">
          <QRCode
            value={totpURI}
            size={168}
            title="Authenticator app QR code"
          />
        </div>

        <div className="flex min-w-0 flex-col gap-3">
          <div className="flex items-center gap-2 text-sm font-medium text-foreground">
            <HugeiconsIcon icon={QrCode01Icon} strokeWidth={2} />
            Scan with your authenticator app
          </div>
          <p className="text-sm text-muted-foreground">
            If you cannot scan the QR code, enter this setup URI manually.
          </p>
          <code className="block max-h-28 overflow-auto rounded-[calc(var(--radius)*2)] border border-border/60 bg-muted/30 p-3 text-xs break-all text-muted-foreground">
            {totpURI}
          </code>
        </div>
      </div>

      <FieldGroup>
        <Field>
          <FieldLabel htmlFor="two-factor-authenticator-code">
            Authenticator code
          </FieldLabel>
          <InputOTP
            id="two-factor-authenticator-code"
            name="code"
            maxLength={6}
            pattern={REGEXP_ONLY_DIGITS}
            inputMode="numeric"
            autoComplete="one-time-code"
            pushPasswordManagerStrategy="none"
            value={code}
            disabled={pending}
            onChange={onCodeChange}
          >
            <InputOTPGroup>
              <InputOTPSlot index={0} />
              <InputOTPSlot index={1} />
              <InputOTPSlot index={2} />
              <InputOTPSlot index={3} />
              <InputOTPSlot index={4} />
              <InputOTPSlot index={5} />
            </InputOTPGroup>
          </InputOTP>
          <FieldDescription>
            Enter the six-digit code shown in your authenticator app.
          </FieldDescription>
        </Field>
      </FieldGroup>

      <Button
        type="submit"
        size="lg"
        className="self-start max-sm:w-full max-sm:self-stretch"
        loading={pending}
        disabled={code.length !== 6 || pending}
      >
        <HugeiconsIcon
          icon={CheckmarkCircle01Icon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        {pending ? "Verifying..." : "Verify code"}
      </Button>
    </form>
  );
}

function BackupCodesReview({
  acknowledged,
  backupCodes,
  mode,
  onAcknowledgedChange,
  onDone,
}: {
  readonly acknowledged: boolean;
  readonly backupCodes: readonly string[];
  readonly mode: BackupCodeMode;
  readonly onAcknowledgedChange: (acknowledged: boolean) => void;
  readonly onDone: () => void;
}) {
  const [copyMessage, setCopyMessage] = React.useState<string | null>(null);

  async function copyBackupCodes() {
    if (!globalThis.navigator?.clipboard) {
      setCopyMessage("Clipboard access is not available in this browser.");
      return;
    }

    try {
      await globalThis.navigator.clipboard.writeText(backupCodes.join("\n"));
      setCopyMessage("Backup codes copied.");
    } catch {
      setCopyMessage("Backup codes could not be copied.");
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <Alert variant="warning">
        <AlertTitle>
          {mode === "enrollment"
            ? "Save your backup codes"
            : "New backup codes generated"}
        </AlertTitle>
        <AlertDescription>{BACKUP_CODE_WARNING}</AlertDescription>
      </Alert>

      <div className="grid gap-2 rounded-[calc(var(--radius)*2)] border border-border/60 bg-muted/30 p-3 sm:grid-cols-2">
        {backupCodes.map((code) => (
          <code
            key={code}
            className="rounded-md bg-background/80 px-3 py-2 font-mono text-sm break-all text-foreground"
          >
            {code}
          </code>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => void copyBackupCodes()}
        >
          <HugeiconsIcon
            icon={Copy01Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Copy codes
        </Button>
        {copyMessage ? (
          <output aria-live="polite" className="text-sm text-muted-foreground">
            {copyMessage}
          </output>
        ) : null}
      </div>

      <Field orientation="horizontal">
        <Checkbox
          id="backup-codes-acknowledgement"
          checked={acknowledged}
          onCheckedChange={(checked) => onAcknowledgedChange(checked === true)}
        />
        <FieldContent>
          <FieldLabel htmlFor="backup-codes-acknowledgement">
            I saved my backup codes
          </FieldLabel>
          <FieldDescription>
            You will not be able to view these codes again from settings.
          </FieldDescription>
        </FieldContent>
      </Field>

      <Button
        type="button"
        size="lg"
        className="self-start max-sm:w-full max-sm:self-stretch"
        disabled={!acknowledged}
        onClick={onDone}
      >
        {mode === "enrollment" ? "I saved these backup codes" : "Done"}
      </Button>
    </div>
  );
}

function EnabledManagement({
  disableConfirmed,
  disableFormRef,
  flow,
  password,
  pendingAction,
  regenerateFormRef,
  onCancel,
  onDisableConfirmedChange,
  onDisableSubmit,
  onFlowChange,
  onPasswordChange,
  onRegenerateSubmit,
}: {
  readonly disableConfirmed: boolean;
  readonly disableFormRef: React.RefObject<HTMLFormElement | null>;
  readonly flow: ManagementFlow;
  readonly password: string;
  readonly pendingAction: PendingAction;
  readonly regenerateFormRef: React.RefObject<HTMLFormElement | null>;
  readonly onCancel: () => void;
  readonly onDisableConfirmedChange: (confirmed: boolean) => void;
  readonly onDisableSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  readonly onFlowChange: (flow: Exclude<ManagementFlow, null>) => void;
  readonly onPasswordChange: (value: string) => void;
  readonly onRegenerateSubmit: (
    event: React.FormEvent<HTMLFormElement>
  ) => void;
}) {
  if (flow === "regenerate") {
    return (
      <form
        ref={regenerateFormRef}
        className="flex flex-col gap-4"
        method="post"
        noValidate
        onSubmit={onRegenerateSubmit}
      >
        <Alert variant="warning">
          <AlertTitle>
            Previous backup codes will stop working immediately.
          </AlertTitle>
          <AlertDescription>
            Generate new codes only after you are ready to save the replacement
            set.
          </AlertDescription>
        </Alert>
        <PasswordField
          id="two-factor-regenerate-password"
          label="Current password for backup code regeneration"
          password={password}
          pending={pendingAction === "regenerate"}
          onPasswordChange={onPasswordChange}
        />
        <ManagementActionRow
          primaryLabel={
            pendingAction === "regenerate"
              ? "Regenerating..."
              : "Regenerate codes"
          }
          primaryIcon={ArrowReloadHorizontalIcon}
          primaryDisabled={!password.trim() || pendingAction !== null}
          primaryLoading={pendingAction === "regenerate"}
          primaryDestructive={false}
          cancelDisabled={pendingAction !== null}
          onCancel={onCancel}
        />
      </form>
    );
  }

  if (flow === "disable") {
    return (
      <form
        ref={disableFormRef}
        className="flex flex-col gap-4"
        method="post"
        noValidate
        onSubmit={onDisableSubmit}
      >
        <Alert variant="warning">
          <AlertTitle>
            Future sign-ins will only require your password.
          </AlertTitle>
          <AlertDescription>
            Keep backup codes saved until 2FA has been disabled successfully.
          </AlertDescription>
        </Alert>
        <PasswordField
          id="two-factor-disable-password"
          label="Current password to disable 2FA"
          password={password}
          pending={pendingAction === "disable"}
          onPasswordChange={onPasswordChange}
        />
        <Field orientation="horizontal">
          <Checkbox
            id="two-factor-disable-confirmation"
            checked={disableConfirmed}
            disabled={pendingAction === "disable"}
            onCheckedChange={(checked) =>
              onDisableConfirmedChange(checked === true)
            }
          />
          <FieldContent>
            <FieldLabel htmlFor="two-factor-disable-confirmation">
              I understand future sign-ins will only require my password
            </FieldLabel>
          </FieldContent>
        </Field>
        <ManagementActionRow
          primaryLabel={
            pendingAction === "disable" ? "Disabling..." : "Disable 2FA"
          }
          primaryIcon={Delete02Icon}
          primaryDisabled={
            !password.trim() || !disableConfirmed || pendingAction !== null
          }
          primaryLoading={pendingAction === "disable"}
          primaryDestructive
          cancelDisabled={pendingAction !== null}
          onCancel={onCancel}
        />
      </form>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      <output aria-live="polite" className="text-sm text-muted-foreground">
        Authenticator app verification is active for this account.
      </output>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          onClick={() => onFlowChange("regenerate")}
        >
          <HugeiconsIcon
            icon={ArrowReloadHorizontalIcon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Regenerate backup codes
        </Button>
        <Button
          type="button"
          variant="destructive"
          onClick={() => onFlowChange("disable")}
        >
          <HugeiconsIcon
            icon={Delete02Icon}
            strokeWidth={2}
            data-icon="inline-start"
          />
          Disable 2FA
        </Button>
      </div>
    </div>
  );
}

function PasswordField({
  id,
  label,
  password,
  pending,
  onPasswordChange,
}: {
  readonly id: string;
  readonly label: string;
  readonly password: string;
  readonly pending: boolean;
  readonly onPasswordChange: (value: string) => void;
}) {
  return (
    <FieldGroup>
      <Field>
        <FieldLabel htmlFor={id}>{label}</FieldLabel>
        <Input
          id={id}
          name="password"
          type="password"
          autoComplete="current-password"
          value={password}
          disabled={pending}
          onChange={(event) => onPasswordChange(event.target.value)}
        />
      </Field>
    </FieldGroup>
  );
}

function ManagementActionRow({
  primaryDisabled,
  primaryIcon,
  primaryLabel,
  primaryLoading,
  primaryDestructive,
  cancelDisabled,
  onCancel,
}: {
  readonly primaryDisabled: boolean;
  readonly primaryIcon: typeof ArrowReloadHorizontalIcon;
  readonly primaryLabel: string;
  readonly primaryLoading: boolean;
  readonly primaryDestructive: boolean;
  readonly cancelDisabled: boolean;
  readonly onCancel: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button
        type="submit"
        variant={primaryDestructive ? "destructive" : "default"}
        loading={primaryLoading}
        disabled={primaryDisabled}
      >
        <HugeiconsIcon
          icon={primaryIcon}
          strokeWidth={2}
          data-icon="inline-start"
        />
        {primaryLabel}
      </Button>
      <Button
        type="button"
        variant="ghost"
        disabled={cancelDisabled}
        onClick={onCancel}
      >
        Cancel
      </Button>
    </div>
  );
}

function getTwoFactorMutationFailureMessage(error: unknown) {
  if (isRateLimitError(error)) {
    return "Too many attempts. Please wait and try again.";
  }

  return "We couldn't update 2FA. Check your current password and try again.";
}

function getTwoFactorCodeFailureMessage(error: unknown) {
  if (isRateLimitError(error)) {
    return "Too many attempts. Please wait and try again.";
  }

  return "That code was not accepted. Check your authenticator and try again.";
}

function isRateLimitError(error: unknown) {
  return (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    error.status === 429
  );
}
