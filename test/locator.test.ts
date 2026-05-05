import { describe, it, expect, vi, expectTypeOf } from "vitest";
import {
  createSvimmerStore,
  type SvimmerReader,
  type SvimmerWriter,
} from "../src";
import type { CompanyDoc, Employee, Project } from "./assets/company";
import { companyFixture } from "./assets/company";
import { locatorFor } from "../src/core/locator";

function makeStore(): SvimmerWriter<CompanyDoc> {
  return createSvimmerStore<CompanyDoc>(structuredClone(companyFixture));
}

const companyLocator = locatorFor<CompanyDoc>();
const employeeMapLocator = locatorFor<CompanyDoc["employees"]>();

describe("Svimmer locators / follow", () => {
  it("supports a total locator with a definite target", () => {
    const store = makeStore();

    const officeLocator = companyLocator(
      [x => x.companyName],
      (_companyNameRef) => {
        return x => x.office;
      },
    );

    const office = store.follow(officeLocator);

    expectTypeOf(office.current()).toEqualTypeOf<
      SvimmerWriter<CompanyDoc["office"]>
    >();

    expect(office.current().read(x => x.city)).toBe("Oulu");
    expect(office.read(x => x.rooms.length)).toBe(3);
  });

  it("supports a total locator whose selector targets T | undefined", () => {
    const store = makeStore();

    const ceoLocator = companyLocator(
      [x => x.ceoId],
      (ceoIdRef) => {
        const id = ceoIdRef.value();
        return x => x.employees.get(id);
      },
    );

    const ceo = store.follow(ceoLocator);

    expectTypeOf(ceo.current()).toEqualTypeOf<
      SvimmerWriter<Employee> | null
    >();

    expect(ceo.current()).not.toBeNull();
    expect(ceo.current()!.read(x => x.name)).toBe("Alice North");
    expect(ceo.read(x => x.title)).toBe("CEO");
  });

  it("can currently resolve to null based on dependency values", () => {
    const store = makeStore();

    const betaProjectLocator = companyLocator(
      [x => x.featureFlags.get("betaBilling")],
      (flagRef) => {
        const enabled = flagRef?.value() ?? false;
        return enabled ? (x => x.projects[1]) : null;
      },
    );

    const project = store.follow(betaProjectLocator);

    expectTypeOf(project.current()).toEqualTypeOf<
      SvimmerWriter<Project> | null
    >();

    expect(project.current()).toBeNull();
    expect(project.read(x => x.name)).toBeNull();

    store.transact((draft) => {
      draft.featureFlags.set("betaBilling", true);
    });

    expect(project.current()).not.toBeNull();
    expect(project.current()!.read(x => x.name)).toBe("Juniper");
    expect(project.read(x => x.budget)).toBe(12_000);
  });

  it("relocates when a dependency changes", () => {
    const store = makeStore();

    const ceoLocator = companyLocator(
      [x => x.ceoId],
      (ceoIdRef) => {
        const id = ceoIdRef.value();
        return x => x.employees.get(id);
      },
    );

    const ceo = store.follow(ceoLocator);

    expect(ceo.current()!.read(x => x.name)).toBe("Alice North");

    store.transact((draft) => {
      draft.ceoId = "e2";
    });

    expect(ceo.current()).not.toBeNull();
    expect(ceo.current()!.read(x => x.name)).toBe("Bob Stone");
    expect(ceo.read(x => x.age)).toBe(31);
  });

  it("forwards notifications from the current target and rewires away from the old one after relocation", () => {
    const store = makeStore();

    const ceoLocator = companyLocator(
      [x => x.ceoId],
      (ceoIdRef) => {
        const id = ceoIdRef.value();
        return x => x.employees.get(id);
      },
    );

    const ceo = store.follow(ceoLocator);
    const seen: string[] = [];

    ceo.subscribe((node) => {
      seen.push(node ? node.read(x => x.name) : "null");
    });

    expect(seen).toEqual(["Alice North"]);

    store.transact((draft) => {
      draft.employees.get("e1")!.name = "Alice Prime";
    });

    expect(seen).toEqual(["Alice North", "Alice Prime"]);

    store.transact((draft) => {
      draft.ceoId = "e2";
    });

    expect(seen).toEqual(["Alice North", "Alice Prime", "Bob Stone"]);

    store.transact((draft) => {
      draft.employees.get("e1")!.name = "Alice Ghost";
    });

    expect(seen).toEqual(["Alice North", "Alice Prime", "Bob Stone"]);

    store.transact((draft) => {
      draft.employees.get("e2")!.name = "Bob Prime";
    });

    expect(seen).toEqual(["Alice North", "Alice Prime", "Bob Stone", "Bob Prime"]);
  });

  it("becomes null when the current target disappears and can later relocate to a new target", () => {
    const store = makeStore();

    const ceoLocator = companyLocator(
      [x => x.ceoId],
      (ceoIdRef) => {
        const id = ceoIdRef.value();
        return x => x.employees.get(id);
      },
    );

    const ceo = store.follow(ceoLocator);
    const seen: string[] = [];

    ceo.subscribe((node) => {
      seen.push(node ? node.read(x => x.name) : "null");
    });

    expect(seen).toEqual(["Alice North"]);
    expect(ceo.current()).not.toBeNull();

    store.transact((draft) => {
      draft.employees.delete("e1");
    });

    expect(ceo.current()).toBeNull();
    expect(seen).toEqual(["Alice North", "null"]);

    store.transact((draft) => {
      draft.ceoId = "e2";
    });

    expect(ceo.current()).not.toBeNull();
    expect(ceo.current()!.read(x => x.name)).toBe("Bob Stone");
    expect(seen).toEqual(["Alice North", "null", "Bob Stone"]);
  });

  it("works from a local non-root handle as the locator root", () => {
    const store = makeStore();
    const employees = store.focus(x => x.employees)!;

    const bobLocator = employeeMapLocator(
      [x => x.get("e2")],
      (_bobRef) => {
        return x => x.get("e2");
      },
    );

    const bob = employees.follow(bobLocator);

    expectTypeOf(bob.current()).toEqualTypeOf<
      SvimmerWriter<Employee> | null
    >();

    expect(bob.current()).not.toBeNull();
    expect(bob.current()!.read(x => x.name)).toBe("Bob Stone");

    store.transact((draft) => {
      draft.employees.get("e2")!.title = "Principal Engineer";
    });

    expect(bob.read(x => x.title)).toBe("Principal Engineer");
  });

  it("exposes writer capability when followed from a writer root", () => {
    const store = makeStore();

    const ceoLocator = companyLocator(
      [x => x.ceoId],
      (ceoIdRef) => {
        const id = ceoIdRef.value();
        return x => x.employees.get(id);
      },
    );

    const ceo = store.follow(ceoLocator);

    expectTypeOf(ceo.current()).toEqualTypeOf<
      SvimmerWriter<Employee> | null
    >();

    const nextAge = ceo.transact((draft) => {
      draft.age += 8;
      return draft.age;
    });

    expect(nextAge).toBe(50);
    expect(store.read(x => x.employees.get("e1")!.age)).toBe(50);
    expect(ceo.read(x => x.age)).toBe(50);
  });

  it("supports read-only follow from a reader root", () => {
    const store = makeStore();
    const readerRoot: SvimmerReader<CompanyDoc> = store;

    const ceoLocator = companyLocator(
      [x => x.ceoId],
      (ceoIdRef) => {
        const id = ceoIdRef.value();
        return x => x.employees.get(id);
      },
    );

    const ceo = readerRoot.follow(ceoLocator);

    expectTypeOf(ceo.current()).toEqualTypeOf<
      SvimmerReader<Employee> | null
    >();

    expect(ceo.current()).not.toBeNull();
    expect(ceo.current()!.read(x => x.name)).toBe("Alice North");
    expect(ceo.read(x => x.age)).toBe(42);
  });

  it("does not duplicate relocation work when multiple dependencies fire in one transaction", () => {
    const store = makeStore();

    const ceoLocator = companyLocator(
      [x => x.ceoId, x => x.companyName],
      (ceoIdRef) => {
        const id = ceoIdRef.value();
        return x => x.employees.get(id);
      },
    );

    const dynamic = store.follow(ceoLocator);
    const seen: string[] = [];

    dynamic.subscribe((node) => {
      seen.push(node ? node.read(x => x.name) : "null");
    });

    expect(seen).toEqual(["Alice North"]);

    store.transact((draft) => {
      draft.ceoId = "e2";
      draft.companyName = "Northwind Labs 2";
    });

    expect(seen).toEqual(["Alice North", "Bob Stone"]);
  });

  it("preserves null as a real value through follow", () => {
    const store = makeStore();

    const selectedProjectNameLocator = companyLocator(
      [x => x.featureFlags.get("betaBilling")],
      (flagRef) => {
        const enabled = flagRef?.value() ?? false;
        return enabled
          ? (x => x.aliases.mainProject)
          : (_x) => null as null;
      },
    );

    const dynamic = store.follow(selectedProjectNameLocator);

    expectTypeOf(dynamic.current()).toEqualTypeOf<
      SvimmerWriter<string | null>
    >();

    expect(dynamic.read(x => x)).toBeNull();

    store.transact((draft) => {
      draft.featureFlags.set("betaBilling", true);
    });

    expect(dynamic.read(x => x)).toBe("Mercury");
  });
});