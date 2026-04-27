/* oxlint-disable eslint/max-classes-per-file */
import { expect } from "@playwright/test";
import type { Locator, Page } from "@playwright/test";

import { APP_ORIGIN } from "../test-urls";
import { waitForSubmitHydration } from "./wait-for-submit-hydration";

export class JobsPage {
  readonly page: Page;
  readonly heading: Locator;
  readonly newJobButton: Locator;

  constructor(page: Page) {
    this.page = page;
    this.heading = page.getByRole("heading", {
      level: 1,
      name: "Jobs",
    });
    this.newJobButton = page
      .locator("header")
      .getByRole("link", { name: "New job" });
  }

  async openFromHome() {
    await this.page.getByRole("link", { name: "Open Jobs" }).click();
    await this.expectLoaded();
  }

  async expectLoaded() {
    await expect(this.page).toHaveURL(`${APP_ORIGIN}/jobs`);
    await expect(
      this.page.getByRole("dialog", { name: "New job" })
    ).toBeHidden();
    await expect(this.heading).toBeVisible();
  }

  async openCreateSheet() {
    await this.newJobButton.click();
  }

  jobCard(title: string): Locator {
    return this.page.getByRole("link", { name: new RegExp(title) });
  }

  async openJob(title: string) {
    await this.page.getByRole("link", { name: new RegExp(title) }).click();
  }
}

export class JobsCreateSheet {
  readonly page: Page;
  readonly root: Locator;
  readonly heading: Locator;
  readonly title: Locator;
  readonly priority: Locator;
  readonly site: Locator;
  readonly siteAddressLine1: Locator;
  readonly siteCounty: Locator;
  readonly siteEircode: Locator;
  readonly siteName: Locator;
  readonly contact: Locator;
  readonly contactName: Locator;
  readonly submit: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByRole("dialog", {
      name: "New job",
    });
    this.heading = this.root.getByRole("heading", {
      level: 2,
      name: "New job",
    });
    this.title = this.root.getByLabel("Title");
    this.priority = this.root.getByLabel("Priority", { exact: true });
    this.site = this.root.getByLabel("Site");
    const siteDialog = page.getByRole("dialog", { name: "New site" });
    this.siteAddressLine1 = siteDialog.getByLabel("Address line 1");
    this.siteCounty = siteDialog.getByLabel("County");
    this.siteEircode = siteDialog.getByLabel("Eircode");
    this.siteName = siteDialog.getByLabel("Site name");
    this.contact = this.root.getByLabel("Contact");
    this.contactName = page.getByPlaceholder("Contact");
    this.submit = this.root.getByRole("button", { name: "Create job" });
  }

  async expectOpen() {
    await expect(this.page).toHaveURL(/\/jobs\/new$/);
    await expect(this.heading).toBeVisible();
    await waitForSubmitHydration(this.page);
  }

  async chooseSiteOption(optionLabel: string) {
    await this.site.click();
    await chooseCommandOption(this.page, optionLabel);
  }

  async chooseContactOption(optionLabel: string) {
    await this.contact.click();
    await chooseCommandOption(this.page, optionLabel);
  }

  async choosePriorityOption(optionLabel: string) {
    await this.priority.click();
    await chooseCommandOption(this.page, optionLabel);
  }

  async createInlineContact(contactName: string) {
    await this.contact.click();
    await this.contactName.fill(contactName);
    await chooseCommandOption(
      this.page,
      `Create new contact: "${contactName}"`
    );
  }

  async closeSiteDialog() {
    await this.page
      .getByRole("dialog", { name: "New site" })
      .getByRole("button", { name: "Done" })
      .click();
  }
}

export class JobDetailSheet {
  readonly page: Page;
  readonly root: Locator;
  readonly commentItems: Locator;
  readonly visitItems: Locator;
  readonly statusSelect: Locator;
  readonly blockedReason: Locator;
  readonly pickStatusChange: Locator;
  readonly applyStatusChange: Locator;
  readonly commentBody: Locator;
  readonly addComment: Locator;
  readonly visitDate: Locator;
  readonly visitDuration: Locator;
  readonly visitNote: Locator;
  readonly logVisit: Locator;
  readonly reopenJob: Locator;

  constructor(page: Page) {
    this.page = page;
    this.root = page.getByRole("dialog");
    this.commentItems = this.root.locator("li");
    this.visitItems = this.root.locator("li");
    this.statusSelect = this.root.locator("#job-transition-status");
    this.blockedReason = this.root.getByLabel("Why is it blocked?");
    this.pickStatusChange = this.root.getByRole("button", {
      name: "Pick a status",
    });
    this.applyStatusChange = this.root.getByRole("button", {
      name: "Apply status change",
    });
    this.commentBody = this.root.getByLabel("Add a comment");
    this.addComment = this.root.getByRole("button", { name: "Add comment" });
    this.visitDate = this.root.getByLabel("Visit date");
    this.visitDuration = this.root.locator("#job-visit-duration");
    this.visitNote = this.root.getByLabel("Visit note");
    this.logVisit = this.root.getByRole("button", { name: "Log visit" });
    this.reopenJob = this.root.getByRole("button", { name: "Reopen job" });
  }

  commentItem(body: string): Locator {
    return this.commentItems.filter({ hasText: body }).first();
  }

  visitItem(note: string): Locator {
    return this.visitItems.filter({ hasText: note }).first();
  }

  async expectOpen(title: string) {
    await expect(this.page).toHaveURL(/\/jobs\/.+$/);
    await expect(
      this.page.getByRole("heading", { level: 2, name: title })
    ).toBeVisible();
    await waitForSubmitHydration(this.page);
  }

  async chooseStatusOption(optionLabel: string) {
    await this.statusSelect.click();
    await chooseCommandOption(this.page, optionLabel);
    await expect(this.statusSelect).toContainText(optionLabel);
  }

  async chooseVisitDurationOption(optionLabel: string) {
    await this.visitDuration.click();
    await chooseCommandOption(this.page, optionLabel);
    await expect(this.visitDuration).toContainText(optionLabel);
  }
}

async function chooseCommandOption(page: Page, optionLabel: string) {
  const option = page.getByRole("option", {
    exact: true,
    name: optionLabel,
  });

  await option.click();
  await expect(option).toBeHidden();
}
