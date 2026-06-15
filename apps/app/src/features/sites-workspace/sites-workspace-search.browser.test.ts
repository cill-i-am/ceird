import { decodeSitesWorkspaceSearch } from "./sites-workspace-search";

describe("sites workspace search", () => {
  it("decodes supported shell states", () => {
    expect(decodeSitesWorkspaceSearch({ shell: "loading" })).toStrictEqual({
      shell: "loading",
    });
    expect(decodeSitesWorkspaceSearch({ shell: "empty" })).toStrictEqual({
      shell: "empty",
    });
    expect(decodeSitesWorkspaceSearch({ shell: "ready" })).toStrictEqual({
      shell: "ready",
    });
  });

  it("drops unknown shell states so the route fails closed", () => {
    expect(decodeSitesWorkspaceSearch({ shell: "legacy-sites" })).toStrictEqual(
      {
        shell: undefined,
      }
    );
  });
});
