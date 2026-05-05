## svimmer (beta)

Svimmer is a handle-based state model built on Immer.

You work with a single root store.
You then focus into state with handles.

---

## Core model

- State is accessed through **handles**.
- A handle points to a value path in the root state.
- Handles come in two permission levels:
  - **Reader**: can read and observe.
  - **Writer**: can read, observe, and mutate.

### Permissions are inherited

- `writer.focus(...)` returns a writer handle.
- `reader.focus(...)` returns a reader handle.

This keeps write permissions explicit and local.

---

## Quick API map

### `createSvimmerStore(initial)`
Creates the root writer handle.

### `read(accessor)`
Read data from the current handle.

### `focus(selector)`
Create a child handle from the current handle.
Returns `null` if the target does not exist.

### `transact(mutator)`
Mutate through Immer drafts on a writer handle.

### `set(value)`
Replace the current handle value.

### `follow(locator)` + `locatorFor<T>()`
Use dynamic handles that relocate when dependencies change.

### `subscribe(cb)`
Observe value updates.

### `onDestroy(cb)`
Observe lifecycle destruction when a handle path is removed.

---

## Value handles and `undefined`

Svimmer uses value handles, even though path tracking is internal.

Because of this model, Svimmer does **not** distinguish between:
- a property that is `undefined`
- a property that does not exist

In practice, `undefined` means “deleted”.

Effects:
- Setting a field to `undefined` removes it semantically.
- Removed paths trigger `onDestroy`.
- Removed paths cannot be focused into.
- `set(undefined)` is forbidden on value handles.

Why this rule exists:
- A child handle should not be able to delete itself from its parent via `set(undefined)`.

Recommendation:
- Prefer **nullable fields** (`null`) over optional fields when you want an empty value that still exists.

---

## Locators (dynamic handles)

Locators let you define reusable dynamic handle logic.

A locator is defined against a root type:
- You declare dependency selectors.
- You get dependency handles in `locate(...)`.
- `locate(...)` returns the current selector (or `null`).

This makes locators easy to define in external files and reuse across modules/components.

### Example: external locator definition

```ts
// locators/company.ts
import { locatorFor } from "svimmer";
import type { CompanyDoc } from "./types";

const companyLocator = locatorFor<CompanyDoc>();

export const ceoLocator = companyLocator(
  [x => x.ceoId],
  (ceoIdRef) => {
    const id = ceoIdRef.value();
    return x => x.employees.get(id) ?? undefined;
  },
);

export const betaProjectLocator = companyLocator(
  [x => x.featureFlags.get("betaBilling")],
  (flagRef) => {
    const enabled = flagRef?.value() ?? false;
    return enabled ? (x => x.projects[1]) : null;
  },
);
```

### Example: using a locator

```ts
const store = createSvimmerStore(initialCompany);

const ceo = store.follow(ceoLocator);
ceo.read(x => x?.name); // dynamic read

const betaProject = store.follow(betaProjectLocator);
betaProject.current(); // handle or null
```

`null` from `locate(...)` means there is currently no target.
When dependencies change, the dynamic handle relocates automatically.

---

## Recommended component architecture

- Keep values derived from handles inside components.
- Avoid passing raw derived values through many layers.
- Pass handles instead of snapshots when possible.
- Prefer passing the **lowest common parent** handle to a component.
- Avoid passing multiple sibling handles if one parent handle is enough.

This keeps component boundaries clean.
It also avoids “privileged controller components”.

With root writer in `App.svelte`, permissions become simple:
- pass reader handles for read-only areas
- pass writer handles where mutation is allowed

---

## Notes on `value()`

`value()` can be useful for:
- primitive reads
- creating snapshot copies
- serialization

Using `value()` as the default read path can produce stale/weird references.
Use `read(...)` as the normal access pattern.
