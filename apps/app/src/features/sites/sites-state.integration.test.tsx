import { decodeOrganizationId } from "@ceird/identity-core";
import { SiteCommentSchema } from "@ceird/sites-core";
import type {
  AddSiteCommentInput,
  AddSiteCommentResponse,
  CreateSiteInput,
  CreateSiteResponse,
  SiteComment,
  SiteIdType,
  UpdateSiteInput,
  UpdateSiteResponse,
} from "@ceird/sites-core";
/* oxlint-disable vitest/prefer-import-in-mock */
import {
  RegistryProvider,
  useAtomSet,
  useAtomValue,
} from "@effect-atom/atom-react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { Effect, Exit, Schema } from "effect";
import type * as EffectPackage from "effect";
import { useState } from "react";

import {
  addSiteCommentMutationAtomFamily,
  createSiteMutationAtom,
  refreshSiteCommentsAtomFamily,
  seedSitesOptionsState,
  siteCommentsStateAtomFamily,
  sitesNoticeAtom,
  sitesOptionsStateAtom,
  updateSiteMutationAtomFamily,
} from "./sites-state";

type EffectClientMock = (...args: unknown[]) => unknown;

const organizationId = decodeOrganizationId("org_123");
const existingSiteId = "11111111-1111-4111-8111-111111111111" as SiteIdType;
const createdSiteId = "22222222-2222-4222-8222-222222222222" as SiteIdType;

const {
  mockedAddSiteComment,
  mockedCreateSite,
  mockedGetSiteOptions,
  mockedListSiteComments,
  mockedMakeBrowserAppApiClient,
  mockedUpdateSite,
} = vi.hoisted(() => ({
  mockedAddSiteComment: vi.fn<EffectClientMock>(),
  mockedCreateSite: vi.fn<EffectClientMock>(),
  mockedGetSiteOptions: vi.fn<EffectClientMock>(),
  mockedListSiteComments: vi.fn<EffectClientMock>(),
  mockedMakeBrowserAppApiClient: vi.fn<EffectClientMock>(),
  mockedUpdateSite: vi.fn<EffectClientMock>(),
}));

vi.mock("#/features/api/app-api-client", async () => {
  const { Effect: EffectModule } =
    await vi.importActual<typeof EffectPackage>("effect");

  return {
    makeBrowserAppApiClient: mockedMakeBrowserAppApiClient,
    provideBrowserAppApiHttp: (effect: unknown) => effect,
    runBrowserAppApiRequest: (
      _operation: string,
      execute: (client: unknown) => unknown
    ) =>
      (mockedMakeBrowserAppApiClient() as Effect.Effect<unknown, unknown>).pipe(
        EffectModule.flatMap(
          (client) => execute(client) as Effect.Effect<unknown, unknown>
        )
      ),
  };
});

describe("sites state integration", () => {
  beforeEach(() => {
    mockedAddSiteComment.mockReset();
    mockedCreateSite.mockReset();
    mockedGetSiteOptions.mockReset();
    mockedListSiteComments.mockReset();
    mockedMakeBrowserAppApiClient.mockReset();
    mockedUpdateSite.mockReset();

    mockedMakeBrowserAppApiClient.mockImplementation(() =>
      Effect.succeed({
        sites: {
          addSiteComment: mockedAddSiteComment,
          createSite: mockedCreateSite,
          getSiteOptions: mockedGetSiteOptions,
          listSiteComments: mockedListSiteComments,
          updateSite: mockedUpdateSite,
        },
      })
    );
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it(
    "uses refreshed site options after creating a site",
    {
      timeout: 10_000,
    },
    async () => {
      mockedCreateSite.mockReturnValue(
        Effect.succeed(buildSite(createdSiteId, "Draft Site"))
      );
      mockedGetSiteOptions.mockReturnValue(
        Effect.succeed({
          serviceAreas: [],
          sites: [
            buildSite(existingSiteId, "Existing Site"),
            buildSite(createdSiteId, "Canonical Site"),
          ],
        })
      );

      const user = userEvent.setup();
      renderSitesStateProbe();

      await user.click(screen.getByRole("button", { name: "Create site" }));

      await waitFor(() => {
        expect(screen.getByTestId("site-names")).toHaveTextContent(
          "Existing Site | Canonical Site"
        );
      });
      expect(mockedGetSiteOptions).toHaveBeenCalledOnce();
      expect(screen.getByTestId("notice")).toHaveTextContent(
        "created:Draft Site"
      );
    }
  );

  it(
    "optimistically upserts an updated site when options refresh fails",
    {
      timeout: 10_000,
    },
    async () => {
      mockedUpdateSite.mockReturnValue(
        Effect.succeed(buildSite(existingSiteId, "Updated Site"))
      );
      mockedGetSiteOptions.mockReturnValue(
        Effect.fail(new Error("refresh failed"))
      );

      const user = userEvent.setup();
      renderSitesStateProbe();

      await user.click(screen.getByRole("button", { name: "Update site" }));

      await waitFor(() => {
        expect(screen.getByTestId("site-names")).toHaveTextContent(
          "Updated Site"
        );
      });
      expect(mockedGetSiteOptions).toHaveBeenCalledOnce();
      expect(screen.getByTestId("notice")).toHaveTextContent(
        "updated:Updated Site"
      );
    }
  );

  it(
    "refreshes site comments into site comment state",
    {
      timeout: 10_000,
    },
    async () => {
      const firstComment = buildSiteComment(
        "33333333-3333-4333-8333-333333333333",
        "First note"
      );
      const secondComment = buildSiteComment(
        "44444444-4444-4444-8444-444444444444",
        "Second note"
      );
      mockedListSiteComments.mockReturnValue(
        Effect.succeed({
          comments: [firstComment, secondComment],
        })
      );

      const user = userEvent.setup();
      renderSitesStateProbe();

      await user.click(
        screen.getByRole("button", { name: "Refresh comments" })
      );

      await waitFor(() => {
        expect(screen.getByTestId("comment-bodies")).toHaveTextContent(
          "First note | Second note"
        );
      });
      expect(mockedListSiteComments).toHaveBeenCalledWith({
        path: { siteId: existingSiteId },
      });
    }
  );

  it(
    "replaces optimistic site comment state with the canonical refresh after adding",
    {
      timeout: 10_000,
    },
    async () => {
      const optimisticComment = buildSiteComment(
        "44444444-4444-4444-8444-444444444444",
        "New note"
      );
      const canonicalComment = buildSiteComment(
        "55555555-5555-4555-8555-555555555555",
        "Canonical note"
      );
      mockedAddSiteComment.mockReturnValue(Effect.succeed(optimisticComment));
      mockedListSiteComments.mockReturnValue(
        Effect.succeed({
          comments: [canonicalComment],
        })
      );

      const user = userEvent.setup();
      renderSitesStateProbe({
        comments: [
          buildSiteComment(
            "33333333-3333-4333-8333-333333333333",
            "Existing note"
          ),
        ],
      });

      await user.click(screen.getByRole("button", { name: "Add comment" }));

      await waitFor(() => {
        expect(screen.getByTestId("comment-bodies")).toHaveTextContent(
          "Canonical note"
        );
      });
      expect(mockedAddSiteComment).toHaveBeenCalledWith({
        path: { siteId: existingSiteId },
        payload: buildAddSiteCommentInput("New note"),
      });
      expect(mockedListSiteComments).toHaveBeenCalledWith({
        path: { siteId: existingSiteId },
      });
    }
  );

  it(
    "keeps the optimistic added site comment when canonical refresh fails",
    {
      timeout: 10_000,
    },
    async () => {
      const commentId = "33333333-3333-4333-8333-333333333333";
      mockedAddSiteComment.mockReturnValue(
        Effect.succeed(buildSiteComment(commentId, "Updated note"))
      );
      mockedListSiteComments.mockReturnValue(
        Effect.fail(new Error("refresh failed"))
      );

      const user = userEvent.setup();
      renderSitesStateProbe({
        comments: [buildSiteComment(commentId, "Existing note")],
      });

      await user.click(screen.getByRole("button", { name: "Add comment" }));

      await waitFor(() => {
        expect(screen.getByTestId("comment-bodies")).toHaveTextContent(
          "Updated note"
        );
      });
      expect(screen.getByTestId("last-exit")).toHaveTextContent("success");
      expect(screen.getByTestId("comment-bodies")).not.toHaveTextContent(
        "Existing note"
      );
    }
  );

  it(
    "orders optimistic site comments by creation time and id",
    {
      timeout: 10_000,
    },
    async () => {
      mockedAddSiteComment.mockReturnValue(
        Effect.succeed(
          buildSiteComment(
            "55555555-5555-4555-8555-555555555555",
            "Middle note",
            "2026-05-16T10:30:00.000Z"
          )
        )
      );
      mockedListSiteComments.mockReturnValue(
        Effect.fail(new Error("refresh failed"))
      );

      const user = userEvent.setup();
      renderSitesStateProbe({
        comments: [
          buildSiteComment(
            "77777777-7777-4777-8777-777777777777",
            "Later note",
            "2026-05-16T11:00:00.000Z"
          ),
          buildSiteComment(
            "33333333-3333-4333-8333-333333333333",
            "Earlier note",
            "2026-05-16T09:00:00.000Z"
          ),
        ],
      });

      await user.click(screen.getByRole("button", { name: "Add comment" }));

      await waitFor(() => {
        expect(screen.getByTestId("comment-bodies")).toHaveTextContent(
          "Earlier note | Middle note | Later note"
        );
      });
    }
  );

  it(
    "orders same-time optimistic site comments by id",
    {
      timeout: 10_000,
    },
    async () => {
      mockedAddSiteComment.mockReturnValue(
        Effect.succeed(
          buildSiteComment(
            "44444444-4444-4444-8444-444444444444",
            "Middle id note"
          )
        )
      );
      mockedListSiteComments.mockReturnValue(
        Effect.fail(new Error("refresh failed"))
      );

      const user = userEvent.setup();
      renderSitesStateProbe({
        comments: [
          buildSiteComment(
            "77777777-7777-4777-8777-777777777777",
            "Later id note"
          ),
          buildSiteComment(
            "33333333-3333-4333-8333-333333333333",
            "Earlier id note"
          ),
        ],
      });

      await user.click(screen.getByRole("button", { name: "Add comment" }));

      await waitFor(() => {
        expect(screen.getByTestId("comment-bodies")).toHaveTextContent(
          "Earlier id note | Middle id note | Later id note"
        );
      });
    }
  );

  it(
    "preserves site comment state when refreshing comments fails",
    {
      timeout: 10_000,
    },
    async () => {
      mockedListSiteComments.mockReturnValue(
        Effect.fail(new Error("refresh failed"))
      );

      const user = userEvent.setup();
      renderSitesStateProbe({
        comments: [
          buildSiteComment(
            "33333333-3333-4333-8333-333333333333",
            "Existing note"
          ),
        ],
      });

      await user.click(
        screen.getByRole("button", { name: "Refresh comments" })
      );

      await waitFor(() => {
        expect(screen.getByTestId("last-exit")).toHaveTextContent("failure");
      });
      expect(screen.getByTestId("comment-bodies")).toHaveTextContent(
        "Existing note"
      );
    }
  );

  it(
    "preserves site comment state when adding a comment fails",
    {
      timeout: 10_000,
    },
    async () => {
      mockedAddSiteComment.mockReturnValue(
        Effect.fail(new Error("add failed"))
      );

      const user = userEvent.setup();
      renderSitesStateProbe({
        comments: [
          buildSiteComment(
            "33333333-3333-4333-8333-333333333333",
            "Existing note"
          ),
        ],
      });

      await user.click(screen.getByRole("button", { name: "Add comment" }));

      await waitFor(() => {
        expect(screen.getByTestId("last-exit")).toHaveTextContent("failure");
      });
      expect(screen.getByTestId("comment-bodies")).toHaveTextContent(
        "Existing note"
      );
      expect(mockedListSiteComments).not.toHaveBeenCalled();
    }
  );
});

function renderSitesStateProbe({
  comments = [],
}: {
  readonly comments?: readonly SiteComment[];
} = {}) {
  return render(
    <RegistryProvider
      initialValues={[
        [
          sitesOptionsStateAtom,
          seedSitesOptionsState(organizationId, {
            serviceAreas: [],
            sites: [buildSite(existingSiteId, "Existing Site")],
          }),
        ],
        [siteCommentsStateAtomFamily(existingSiteId), comments],
      ]}
    >
      <SitesStateProbe />
    </RegistryProvider>
  );
}

function SitesStateProbe() {
  const [lastExit, setLastExit] = useState("");
  const createSite = useAtomSet(createSiteMutationAtom, {
    mode: "promiseExit",
  });
  const updateSite = useAtomSet(updateSiteMutationAtomFamily(existingSiteId), {
    mode: "promiseExit",
  });
  const refreshComments = useAtomSet(
    refreshSiteCommentsAtomFamily(existingSiteId),
    {
      mode: "promiseExit",
    }
  );
  const addComment = useAtomSet(
    addSiteCommentMutationAtomFamily(existingSiteId),
    {
      mode: "promiseExit",
    }
  );
  const options = useAtomValue(sitesOptionsStateAtom).data;
  const comments = useAtomValue(siteCommentsStateAtomFamily(existingSiteId));
  const notice = useAtomValue(sitesNoticeAtom);

  return (
    <div>
      <button
        type="button"
        onClick={() => {
          void createSite(buildCreateSiteInput("Draft Site"));
        }}
      >
        Create site
      </button>
      <button
        type="button"
        onClick={() => {
          void updateSite(buildUpdateSiteInput("Updated Site"));
        }}
      >
        Update site
      </button>
      <button
        type="button"
        onClick={() => {
          void refreshComments().then((exit) => {
            setLastExit(Exit.isFailure(exit) ? "failure" : "success");
          });
        }}
      >
        Refresh comments
      </button>
      <button
        type="button"
        onClick={() => {
          void addComment(buildAddSiteCommentInput("New note")).then((exit) => {
            setLastExit(Exit.isFailure(exit) ? "failure" : "success");
          });
        }}
      >
        Add comment
      </button>
      <output data-testid="site-names">
        {options.sites.map((site) => site.name).join(" | ")}
      </output>
      <output data-testid="comment-bodies">
        {comments.map((comment) => comment.body).join(" | ")}
      </output>
      <output data-testid="notice">
        {notice ? `${notice.kind}:${notice.name}` : ""}
      </output>
      <output data-testid="last-exit">{lastExit}</output>
    </div>
  );
}

function buildCreateSiteInput(name: string): CreateSiteInput {
  return {
    addressLine1: "1 Custom House Quay",
    country: "IE",
    county: "Dublin",
    eircode: "D01 X2X2",
    name,
  };
}

function buildAddSiteCommentInput(body: string): AddSiteCommentInput {
  return {
    body,
  };
}

function buildUpdateSiteInput(name: string): UpdateSiteInput {
  return {
    addressLine1: "1 Custom House Quay",
    country: "IE",
    county: "Dublin",
    eircode: "D01 X2X2",
    name,
  };
}

function buildSiteComment(
  id: string,
  body: string,
  createdAt = "2026-05-16T10:00:00.000Z"
): AddSiteCommentResponse & SiteComment {
  return Schema.decodeUnknownSync(SiteCommentSchema)({
    authorName: "Alex Example",
    authorUserId: "user_123",
    body,
    createdAt,
    id,
    siteId: existingSiteId,
  });
}

function buildSite(
  id: SiteIdType,
  name: string
): CreateSiteResponse & UpdateSiteResponse {
  return {
    addressLine1: "1 Custom House Quay",
    country: "IE",
    county: "Dublin",
    eircode: "D01 X2X2",
    geocodedAt: "2026-04-27T10:00:00.000Z",
    geocodingProvider: "stub",
    id,
    latitude: 53.3498,
    longitude: -6.2603,
    name,
  };
}
