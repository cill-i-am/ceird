/* oxlint-disable unicorn/no-array-sort */

"use client";

import { Atom } from "@effect-atom/atom-react";
import type {
  CreateRateCardInput,
  CreateRateCardResponse,
  CreateServiceAreaInput,
  CreateServiceAreaResponse,
  RateCard,
  RateCardIdType,
  RateCardListResponse,
  ServiceArea,
  ServiceAreaIdType,
  ServiceAreaListResponse,
  UpdateRateCardInput,
  UpdateRateCardResponse,
  UpdateServiceAreaInput,
  UpdateServiceAreaResponse,
} from "@task-tracker/jobs-core";
import { Effect } from "effect";

import { runBrowserJobsRequest } from "#/features/jobs/jobs-client";
import type { AppJobsError } from "#/features/jobs/jobs-errors";

export const organizationServiceAreasStateAtom =
  Atom.make<ServiceAreaListResponse>({
    items: [],
  });

export const organizationRateCardsStateAtom = Atom.make<RateCardListResponse>({
  items: [],
});

export const listServiceAreasAtom = Atom.fn<
  AppJobsError,
  ServiceAreaListResponse
>((_, get) =>
  listBrowserServiceAreas().pipe(
    Effect.tap((response) =>
      Effect.sync(() => {
        get.set(
          organizationServiceAreasStateAtom,
          mergeServiceAreaList(response, get(organizationServiceAreasStateAtom))
        );
      })
    )
  )
).pipe(Atom.keepAlive);

export const createServiceAreaMutationAtom = Atom.fn<
  AppJobsError,
  CreateServiceAreaResponse,
  CreateServiceAreaInput
>((input, get) =>
  createBrowserServiceArea(input).pipe(
    Effect.tap((serviceArea) =>
      Effect.sync(() => {
        get.set(
          organizationServiceAreasStateAtom,
          upsertServiceArea(get(organizationServiceAreasStateAtom), serviceArea)
        );
      })
    )
  )
).pipe(Atom.keepAlive);

export const updateServiceAreaMutationAtomFamily = Atom.family(
  (serviceAreaId: ServiceAreaIdType) =>
    Atom.fn<AppJobsError, UpdateServiceAreaResponse, UpdateServiceAreaInput>(
      (input, get) =>
        updateBrowserServiceArea(serviceAreaId, input).pipe(
          Effect.tap((serviceArea) =>
            Effect.sync(() => {
              get.set(
                organizationServiceAreasStateAtom,
                upsertServiceArea(
                  get(organizationServiceAreasStateAtom),
                  serviceArea
                )
              );
            })
          )
        )
    )
);

export const listRateCardsAtom = Atom.fn<AppJobsError, RateCardListResponse>(
  (_, get) =>
    listBrowserRateCards().pipe(
      Effect.tap((response) =>
        Effect.sync(() => {
          get.set(
            organizationRateCardsStateAtom,
            mergeRateCardList(response, get(organizationRateCardsStateAtom))
          );
        })
      )
    )
).pipe(Atom.keepAlive);

export const createRateCardMutationAtom = Atom.fn<
  AppJobsError,
  CreateRateCardResponse,
  CreateRateCardInput
>((input, get) =>
  createBrowserRateCard(input).pipe(
    Effect.tap((rateCard) =>
      Effect.sync(() => {
        get.set(
          organizationRateCardsStateAtom,
          upsertRateCard(get(organizationRateCardsStateAtom), rateCard)
        );
      })
    )
  )
).pipe(Atom.keepAlive);

export const updateRateCardMutationAtomFamily = Atom.family(
  (rateCardId: RateCardIdType) =>
    Atom.fn<AppJobsError, UpdateRateCardResponse, UpdateRateCardInput>(
      (input, get) =>
        updateBrowserRateCard(rateCardId, input).pipe(
          Effect.tap((rateCard) =>
            Effect.sync(() => {
              get.set(
                organizationRateCardsStateAtom,
                upsertRateCard(get(organizationRateCardsStateAtom), rateCard)
              );
            })
          )
        )
    )
);

function listBrowserServiceAreas() {
  return runBrowserJobsRequest(
    "OrganizationConfigurationBrowser.listServiceAreas",
    (client) => client.serviceAreas.listServiceAreas()
  );
}

function createBrowserServiceArea(input: CreateServiceAreaInput) {
  return runBrowserJobsRequest(
    "OrganizationConfigurationBrowser.createServiceArea",
    (client) =>
      client.serviceAreas.createServiceArea({
        payload: input,
      })
  );
}

function updateBrowserServiceArea(
  serviceAreaId: ServiceAreaIdType,
  input: UpdateServiceAreaInput
) {
  return runBrowserJobsRequest(
    "OrganizationConfigurationBrowser.updateServiceArea",
    (client) =>
      client.serviceAreas.updateServiceArea({
        path: { serviceAreaId },
        payload: input,
      })
  );
}

function listBrowserRateCards() {
  return runBrowserJobsRequest(
    "OrganizationConfigurationBrowser.listRateCards",
    (client) => client.rateCards.listRateCards()
  );
}

function createBrowserRateCard(input: CreateRateCardInput) {
  return runBrowserJobsRequest(
    "OrganizationConfigurationBrowser.createRateCard",
    (client) =>
      client.rateCards.createRateCard({
        payload: input,
      })
  );
}

function updateBrowserRateCard(
  rateCardId: RateCardIdType,
  input: UpdateRateCardInput
) {
  return runBrowserJobsRequest(
    "OrganizationConfigurationBrowser.updateRateCard",
    (client) =>
      client.rateCards.updateRateCard({
        path: { rateCardId },
        payload: input,
      })
  );
}

function upsertServiceArea(
  state: ServiceAreaListResponse,
  serviceArea: ServiceArea
): ServiceAreaListResponse {
  return {
    items: upsertByIdSortedByName(state.items, serviceArea),
  };
}

function upsertRateCard(
  state: RateCardListResponse,
  rateCard: RateCard
): RateCardListResponse {
  return {
    items: upsertByIdSortedByName(state.items, rateCard),
  };
}

function mergeServiceAreaList(
  response: ServiceAreaListResponse,
  current: ServiceAreaListResponse
): ServiceAreaListResponse {
  return {
    items: mergeByIdSortedByName(response.items, current.items),
  };
}

function mergeRateCardList(
  response: RateCardListResponse,
  current: RateCardListResponse
): RateCardListResponse {
  return {
    items: mergeByIdSortedByName(response.items, current.items),
  };
}

function upsertByIdSortedByName<
  Item extends { readonly id: string; readonly name: string },
>(items: readonly Item[], item: Item) {
  const next = [item, ...items.filter((current) => current.id !== item.id)];
  next.sort(compareByNameThenId);

  return next;
}

function mergeByIdSortedByName<
  Item extends { readonly id: string; readonly name: string },
>(base: readonly Item[], overrides: readonly Item[]) {
  const nextById = new Map(base.map((item) => [item.id, item]));

  for (const item of overrides) {
    nextById.set(item.id, item);
  }

  const next = [...nextById.values()];
  next.sort(compareByNameThenId);

  return next;
}

function compareByNameThenId<
  Item extends { readonly id: string; readonly name: string },
>(left: Item, right: Item) {
  const nameComparison = left.name.localeCompare(right.name);

  return nameComparison === 0
    ? left.id.localeCompare(right.id)
    : nameComparison;
}
