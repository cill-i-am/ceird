import {
  JOB_COLLABORATOR_ACCESS_LEVELS,
  JobCollaboratorAccessLevelSchema,
  UserId,
} from "@ceird/jobs-core";
import type {
  JobCollaborator,
  JobCollaboratorAccessLevel,
  UserIdType,
} from "@ceird/jobs-core";
import { Briefcase01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Option, Schema } from "effect";
import * as React from "react";

import { Alert, AlertDescription, AlertTitle } from "#/components/ui/alert";
import { Badge } from "#/components/ui/badge";
import { Button } from "#/components/ui/button";
import { CommandSelect } from "#/components/ui/command-select";
import type { CommandSelectGroup } from "#/components/ui/command-select";
import {
  Field,
  FieldContent,
  FieldGroup,
  FieldLabel,
} from "#/components/ui/field";
import { Input } from "#/components/ui/input";
import { Separator } from "#/components/ui/separator";
import { submitClientForm } from "#/lib/client-form-submit";

import { DetailEmpty, DetailSection } from "./jobs-detail-section";
import type { ExternalMemberOption } from "./jobs-detail-types";

const COLLABORATOR_ACCESS_LEVEL_LABELS = {
  comment: "Comment-only",
  read: "Read-only",
} satisfies Record<JobCollaboratorAccessLevel, string>;
const decodeUserId = Schema.decodeUnknownSync(UserId);

export function JobCollaboratorsSummary({
  collaborators,
  externalMemberById,
}: {
  readonly collaborators: readonly JobCollaborator[];
  readonly externalMemberById: ReadonlyMap<UserIdType, ExternalMemberOption>;
}) {
  return (
    <ul className="flex flex-col gap-3">
      {collaborators.map((collaborator) => {
        const externalMember = collaborator.userId
          ? externalMemberById.get(collaborator.userId)
          : undefined;

        return (
          <li
            key={collaborator.id}
            className="flex items-center justify-between gap-3 border-b py-3 first:pt-0 last:border-b-0 last:pb-0"
          >
            <div className="min-w-0">
              <p className="truncate text-sm font-medium">
                {externalMember?.name ?? "External collaborator"}
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {collaborator.roleLabel}
              </p>
            </div>
            <Badge variant="secondary">
              {COLLABORATOR_ACCESS_LEVEL_LABELS[collaborator.accessLevel]}
            </Badge>
          </li>
        );
      })}
    </ul>
  );
}

export function JobCollaboratorsSection({
  collaborators,
  detachCollaborator,
  errorMessage,
  externalMemberById,
  externalMembers,
  isLoading,
  onAccessLevelChange,
  onAttach,
  onRoleLabelChange,
  onUserChange,
  selectedAccessLevel,
  selectedRoleLabel,
  selectedUserId,
  updateCollaborator,
  updatingOrRemoving,
}: {
  readonly collaborators: readonly JobCollaborator[];
  readonly detachCollaborator: (
    collaboratorId: JobCollaborator["id"]
  ) => Promise<unknown>;
  readonly errorMessage: string | null;
  readonly externalMemberById: ReadonlyMap<UserIdType, ExternalMemberOption>;
  readonly externalMembers: readonly ExternalMemberOption[];
  readonly isLoading: boolean;
  readonly onAccessLevelChange: (value: JobCollaboratorAccessLevel) => void;
  readonly onAttach: () => void | Promise<void>;
  readonly onRoleLabelChange: (value: string) => void;
  readonly onUserChange: (value: string) => void;
  readonly selectedAccessLevel: JobCollaboratorAccessLevel;
  readonly selectedRoleLabel: string;
  readonly selectedUserId: UserIdType | "";
  readonly updateCollaborator: (input: {
    readonly collaboratorId: JobCollaborator["id"];
    readonly input: {
      readonly accessLevel: JobCollaboratorAccessLevel;
      readonly roleLabel: string;
    };
  }) => Promise<unknown>;
  readonly updatingOrRemoving: boolean;
}) {
  const collaboratorOptions = React.useMemo(() => {
    const assignedUserIds = new Set(
      collaborators
        .map((collaborator) => collaborator.userId)
        .filter((userId): userId is UserIdType => userId !== undefined)
    );

    return externalMembers
      .filter((member) => !assignedUserIds.has(member.userId))
      .map((member) => ({
        label: member.name,
        value: member.userId,
      }));
  }, [collaborators, externalMembers]);
  const collaboratorSelectionGroups = React.useMemo(
    () =>
      [
        {
          label: "External collaborators",
          options: collaboratorOptions,
        },
      ] satisfies readonly CommandSelectGroup[],
    [collaboratorOptions]
  );
  const accessLevelGroups = React.useMemo(getCollaboratorAccessLevelGroups, []);

  return (
    <DetailSection title="Collaborators">
      <div className="flex flex-col gap-5">
        {errorMessage ? (
          <Alert>
            <HugeiconsIcon icon={Briefcase01Icon} strokeWidth={2} />
            <AlertTitle>Collaborator access could not be updated.</AlertTitle>
            <AlertDescription>{errorMessage}</AlertDescription>
          </Alert>
        ) : null}

        <form
          className="flex flex-col gap-4"
          onSubmit={(event) => submitClientForm(event, onAttach)}
        >
          <FieldGroup>
            <div className="grid gap-4 md:grid-cols-3">
              <Field>
                <FieldLabel htmlFor="job-collaborator-user">
                  External collaborator
                </FieldLabel>
                <FieldContent>
                  <CommandSelect
                    id="job-collaborator-user"
                    value={selectedUserId}
                    placeholder="Choose collaborator"
                    emptyText="No external collaborators available."
                    groups={collaboratorSelectionGroups}
                    disabled={isLoading || collaboratorOptions.length === 0}
                    onValueChange={onUserChange}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="job-collaborator-role-label">
                  Role label
                </FieldLabel>
                <FieldContent>
                  <Input
                    id="job-collaborator-role-label"
                    value={selectedRoleLabel}
                    disabled={isLoading}
                    onChange={(event) => onRoleLabelChange(event.target.value)}
                  />
                </FieldContent>
              </Field>
              <Field>
                <FieldLabel htmlFor="job-collaborator-access-level">
                  Access level
                </FieldLabel>
                <FieldContent>
                  <CommandSelect
                    id="job-collaborator-access-level"
                    value={selectedAccessLevel}
                    placeholder="Choose access"
                    emptyText="No access levels available."
                    groups={accessLevelGroups}
                    disabled={isLoading}
                    onValueChange={(value) => {
                      const accessLevel =
                        decodeOptionalJobCollaboratorAccessLevel(value);

                      if (accessLevel !== undefined) {
                        onAccessLevelChange(accessLevel);
                      }
                    }}
                  />
                </FieldContent>
              </Field>
            </div>
          </FieldGroup>
          <div className="flex">
            <Button
              type="submit"
              loading={isLoading}
              className="w-full sm:w-fit"
            >
              Grant access
            </Button>
          </div>
        </form>

        <Separator />

        {collaborators.length === 0 ? (
          <DetailEmpty title="No external collaborators yet." />
        ) : (
          <ul className="flex flex-col gap-4">
            {collaborators.map((collaborator) => (
              <JobCollaboratorRow
                key={collaborator.id}
                collaborator={collaborator}
                disabled={updatingOrRemoving}
                externalMember={
                  collaborator.userId
                    ? externalMemberById.get(collaborator.userId)
                    : undefined
                }
                accessLevelGroups={accessLevelGroups}
                detachCollaborator={detachCollaborator}
                updateCollaborator={updateCollaborator}
              />
            ))}
          </ul>
        )}
      </div>
    </DetailSection>
  );
}

function JobCollaboratorRow({
  accessLevelGroups,
  collaborator,
  detachCollaborator,
  disabled,
  externalMember,
  updateCollaborator,
}: {
  readonly accessLevelGroups: readonly CommandSelectGroup[];
  readonly collaborator: JobCollaborator;
  readonly detachCollaborator: (
    collaboratorId: JobCollaborator["id"]
  ) => Promise<unknown>;
  readonly disabled: boolean;
  readonly externalMember: ExternalMemberOption | undefined;
  readonly updateCollaborator: (input: {
    readonly collaboratorId: JobCollaborator["id"];
    readonly input: {
      readonly accessLevel: JobCollaboratorAccessLevel;
      readonly roleLabel: string;
    };
  }) => Promise<unknown>;
}) {
  const name = externalMember?.name ?? "External collaborator";
  const [roleLabel, setRoleLabel] = React.useState(collaborator.roleLabel);
  const [accessLevel, setAccessLevel] =
    React.useState<JobCollaboratorAccessLevel>(collaborator.accessLevel);

  React.useEffect(() => {
    setRoleLabel(collaborator.roleLabel);
    setAccessLevel(collaborator.accessLevel);
  }, [collaborator.accessLevel, collaborator.roleLabel]);

  return (
    <li className="rounded-md border p-3">
      <div className="flex flex-col gap-4">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {externalMember?.email ?? "External member"}
          </p>
        </div>
        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_minmax(0,180px)]">
          <Field>
            <FieldLabel htmlFor={`job-collaborator-role-${collaborator.id}`}>
              Role label for {name}
            </FieldLabel>
            <FieldContent>
              <Input
                id={`job-collaborator-role-${collaborator.id}`}
                value={roleLabel}
                disabled={disabled}
                onChange={(event) => setRoleLabel(event.target.value)}
              />
            </FieldContent>
          </Field>
          <Field>
            <FieldLabel htmlFor={`job-collaborator-access-${collaborator.id}`}>
              Access level for {name}
            </FieldLabel>
            <FieldContent>
              <CommandSelect
                id={`job-collaborator-access-${collaborator.id}`}
                value={accessLevel}
                placeholder="Choose access"
                emptyText="No access levels available."
                groups={accessLevelGroups}
                disabled={disabled}
                onValueChange={(value) => {
                  const nextAccessLevel =
                    decodeOptionalJobCollaboratorAccessLevel(value);

                  if (nextAccessLevel !== undefined) {
                    setAccessLevel(nextAccessLevel);
                  }
                }}
              />
            </FieldContent>
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            type="button"
            variant="secondary"
            disabled={disabled || roleLabel.trim().length === 0}
            onClick={() =>
              updateCollaborator({
                collaboratorId: collaborator.id,
                input: {
                  accessLevel,
                  roleLabel: roleLabel.trim(),
                },
              })
            }
          >
            Save {name} access
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={disabled}
            onClick={() => detachCollaborator(collaborator.id)}
          >
            Remove {name} access
          </Button>
        </div>
      </div>
    </li>
  );
}

function getCollaboratorAccessLevelGroups() {
  return [
    {
      label: "Access",
      options: JOB_COLLABORATOR_ACCESS_LEVELS.map((accessLevel) => ({
        label: COLLABORATOR_ACCESS_LEVEL_LABELS[accessLevel],
        value: accessLevel,
      })),
    },
  ] satisfies readonly CommandSelectGroup[];
}

function decodeOptionalJobCollaboratorAccessLevel(
  input: unknown
): JobCollaboratorAccessLevel | undefined {
  const decoded = Schema.decodeUnknownOption(JobCollaboratorAccessLevelSchema)(
    input
  );

  return Option.getOrUndefined(decoded);
}

export function toExternalMemberOptions(
  members: readonly {
    readonly email: string;
    readonly id: UserIdType;
    readonly name: string;
  }[]
): readonly ExternalMemberOption[] {
  return members
    .map((candidate) => ({
      email: candidate.email,
      name: candidate.name,
      userId: candidate.id,
    }))
    .toSorted((left, right) => left.name.localeCompare(right.name));
}

export function decodeCollaboratorUserId(value: string): UserIdType | "" {
  return value === "" ? "" : decodeUserId(value);
}
