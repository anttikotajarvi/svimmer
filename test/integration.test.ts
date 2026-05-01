import { describe, it, expect, vi } from "vitest";
import { createSvimmerStore, type SvimmerWriter } from "../src";
import { begin } from "../src/helpers/transactors";
import { type CompanyDoc, companyFixture, type Employee } from "./assets/company";
// Adjust these imports to your project structure.
function makeStore(): SvimmerWriter<CompanyDoc> {
  return createSvimmerStore<CompanyDoc>(structuredClone(companyFixture));
}

describe("Svimmer integration: read and focus", () => {
  it("reads root and nested values through focused nodes", () => {
    const store = makeStore();

    expect(store.read((x) => x.companyName)).toBe("Northwind Labs");
    expect(store.read((x) => x.office.city)).toBe("Oulu");

    const office = store.focus((x) => x.office);
    expect(office).not.toBeNull();
    expect(office!.read((x) => x.city)).toBe("Oulu");

    const firstProject = store.focus((x) => x.projects[0]);
    expect(firstProject).not.toBeNull();
    expect(firstProject!.read((x) => x.name)).toBe("Mercury");

    const ceo = store.focus((x) => x.employees.get("e1"));
    expect(ceo).not.toBeNull();
    expect(ceo!.read((x) => x.name)).toBe("Alice North");
  });

  it("returns null when focusing missing paths", () => {
    const store = makeStore();

    expect(store.focus((x) => x.employees.get("missing"))).toBeNull();
    expect(store.focus((x) => x.projects[99])).toBeNull();
    expect(store.focus((x) => x.aliases.doesNotExist)).toBeNull();
  });

  it("returns stable cached handles for the same path", () => {
    const store = makeStore();

    const office1 = store.focus((x) => x.office);
    const office2 = store.focus((x) => x.office);
    expect(office1).toBe(office2);

    const ceo1 = store.focus((x) => x.employees.get("e1"));
    const ceo2 = store.focus((x) => x.employees.get("e1"));
    expect(ceo1).toBe(ceo2);

    const name1 = ceo1!.focus((x) => x.name);
    const name2 = ceo2!.focus((x) => x.name);
    expect(name1).toBe(name2);
  });
});

describe("Svimmer integration: transact and composite writes", () => {
  it("mutates nested object, map entry, array item and set leaf through focused writers", () => {
    const store = makeStore();

    const office = store.focus((x) => x.office)!;
    office.transact((d) => {
      d.city = "Helsinki";
      d.rooms.push("Lab-1");
    });

    const bob = store.focus((x) => x.employees.get("e2"))!;
    bob!.transact((d) => {
      d.age += 1;
      d.tags.add("platform");
    });

    const mercury = store.focus((x) => x.projects[0])!;
    mercury.transact((d) => {
      d.budget += 5000;
      d.members.push("e3");
      d.meta.set("priority", "critical");
    });

    expect(store.read((x) => x.office.city)).toBe("Helsinki");
    expect(store.read((x) => x.office.rooms.includes("Lab-1"))).toBe(true);
    expect(store.read((x) => x.employees.get("e2")!.age)).toBe(32);
    expect(store.read((x) => x.employees.get("e2")!.tags.has("platform"))).toBe(true);
    expect(store.read((x) => x.projects[0]?.budget)).toBe(55_000);
    expect(store.read((x) => x.projects[0]?.members)).toEqual(["e1", "e2", "e3"]);
    expect(store.read((x) => x.projects[0]?.meta.get("priority"))).toBe("critical");
  });

  it("returns the mutator result", () => {
    const store = makeStore();
    const stats = store.focus((x) => x.stats)!;

    const nextRevenue = stats.transact((d) => {
      d.revenue += 10_000;
      return d.revenue;
    });

    expect(nextRevenue).toBe(260_000);
    expect(store.read((x) => x.stats.revenue)).toBe(260_000);
  });

  it("supports composite mutators with begin(...) and returns the last return value", () => {
    const store = makeStore();
    const bob = store.focus((x) => x.employees.get("e2"))!;

    const setTitle = (title: string) => (draft: Employee) => {
      draft.title = title;
    };
    const bumpAge = (by: number) => (draft: Employee) => {
      draft.age += by;
      return draft.age;
    };

    const result = bob.transact(begin(setTitle("Senior Engineer"), bumpAge(2)));

    expect(result).toBe(33);
    expect(store.read((x) => x.employees.get("e2")!.title)).toBe("Senior Engineer");
    expect(store.read((x) => x.employees.get("e2")!.age)).toBe(33);
  });
});

describe("Svimmer integration: subscriptions", () => {
  it("subscribes immediately and then notifies on descendant change", () => {
    const store = makeStore();
    const office = store.focus((x) => x.office)!;

    const seen: string[] = [];
    const unsub = office.subscribe((node) => {
      seen.push(node.read((x) => x.city));
    });

    expect(seen).toEqual(["Oulu"]);

    office.transact((d) => {
      d.city = "Tampere";
    });

    expect(seen).toEqual(["Oulu", "Tampere"]);

    unsub();

    office.transact((d) => {
      d.city = "Turku";
    });

    expect(seen).toEqual(["Oulu", "Tampere"]);
  });

  it("notifies parent and child subscribers but not unrelated sibling subscribers", () => {
    const store = makeStore();
    const ceo = store.focus((x) => x.employees.get("e1"))!;
    const ceoName = ceo.focus((x) => x.name)!;
    const designer = store.focus((x) => x.employees.get("e3"))!;

    const ceoHits = vi.fn((node) => node.read((x: Employee) => x.name));
    const nameHits = vi.fn((node) => node.read((x: string) => x));
    const designerHits = vi.fn((node) => node.read((x: Employee) => x.name));

    ceo.subscribe(ceoHits);
    ceoName.subscribe(nameHits);
    designer.subscribe(designerHits);

    ceo.transact((d) => {
      d.name = "Alice Bold";
    });

    expect(ceoHits).toHaveBeenCalledTimes(2);
    expect(nameHits).toHaveBeenCalledTimes(2);
    expect(designerHits).toHaveBeenCalledTimes(1);
  });
});

describe("Svimmer integration: destroy lifecycle and path survival", () => {
  it("fires onDestroy bottom-up when a whole subtree is removed", () => {
    const store = makeStore();

    const employee = store.focus((x) => x.employees.get("e1"))!;
    const contact = employee.focus((x) => x.contact)!;
    const phone = contact.focus((x) => x.phone)!;

    const order: string[] = [];
    employee.onDestroy(() => order.push("employee"));
    contact.onDestroy(() => order.push("contact"));
    phone.onDestroy(() => order.push("phone"));

    store.transact((draft) => {
      draft.employees.delete("e1");
    });

    expect(order).toEqual(["phone", "contact", "employee"]);
    expect(store.focus((x) => x.employees.get("e1"))).toBeNull();
  });

  it("does not destroy surviving paths when an ancestor object is replaced with a compatible shape", () => {
    const store = makeStore();

    const employee = store.focus((x) => x.employees.get("e1"))!;
    const name = employee.focus((x) => x.name)!;
    const email = employee.focus((x) => x.contact.email)!;

    const employeeDestroyed = vi.fn();
    const nameDestroyed = vi.fn();
    const emailDestroyed = vi.fn();

    employee.onDestroy(employeeDestroyed);
    name.onDestroy(nameDestroyed);
    email.onDestroy(emailDestroyed);

    store.transact((draft) => {
      draft.employees.set("e1", {
        id: "e1",
        name: "Alice Prime",
        age: 43,
        title: "CEO",
        active: true,
        tags: new Set(["leadership", "founder"]),
        contact: {
          email: "alice.prime@northwind.test",
          phone: "123-456",
        },
      });
    });

    expect(employeeDestroyed).not.toHaveBeenCalled();
    expect(nameDestroyed).not.toHaveBeenCalled();
    expect(emailDestroyed).not.toHaveBeenCalled();

    expect(employee.read((x) => x.name)).toBe("Alice Prime");
    expect(name.read((x) => x)).toBe("Alice Prime");
    expect(email.read((x) => x)).toBe("alice.prime@northwind.test");
  });

  it("destroys only missing descendants when a surviving branch loses a child path", () => {
    const store = makeStore();

    const employee = store.focus((x) => x.employees.get("e1"))!;
    const contact = employee.focus((x) => x.contact)!;
    const phone = contact.focus((x) => x.phone)!;
    const email = contact.focus((x) => x.email)!;

    const employeeDestroyed = vi.fn();
    const contactDestroyed = vi.fn();
    const phoneDestroyed = vi.fn();
    const emailDestroyed = vi.fn();

    employee.onDestroy(employeeDestroyed);
    contact.onDestroy(contactDestroyed);
    phone.onDestroy(phoneDestroyed);
    email.onDestroy(emailDestroyed);

    employee.transact((draft) => {
      draft.contact = {
        email: "alice@northwind.test",
      };
    });

    expect(employeeDestroyed).not.toHaveBeenCalled();
    expect(contactDestroyed).not.toHaveBeenCalled();
    expect(emailDestroyed).not.toHaveBeenCalled();
    expect(phoneDestroyed).toHaveBeenCalledTimes(1);

    expect(employee.read((x) => x.contact.email)).toBe("alice@northwind.test");
  });
});

describe("Svimmer integration: holistic multi-branch transaction", () => {
  it("updates several distant branches coherently in one transaction", () => {
    const store = makeStore();

    const statsHits = vi.fn((node) => node.read((x: CompanyDoc["stats"]) => x.revenue));
    const officeHits = vi.fn((node) => node.read((x: CompanyDoc["office"]) => x.city));
    const bobHits = vi.fn((node) => node.read((x: Employee) => x.age));

    store.focus((x) => x.stats)!.subscribe(statsHits);
    store.focus((x) => x.office)!.subscribe(officeHits);
    store.focus((x) => x.employees.get("e2"))!.subscribe(bobHits);

    store.transact((draft) => {
      draft.stats.revenue += 5000;
      draft.office.city = "Espoo";
      draft.employees.get("e2")!.age += 5;
      draft.announcements.push("Quarterly review complete");
      draft.featureFlags.set("betaBilling", true);
    });

    expect(store.read((x) => x.stats.revenue)).toBe(255_000);
    expect(store.read((x) => x.office.city)).toBe("Espoo");
    expect(store.read((x) => x.employees.get("e2")!.age)).toBe(36);
    expect(store.read((x) => x.announcements.at(-1))).toBe("Quarterly review complete");
    expect(store.read((x) => x.featureFlags.get("betaBilling"))).toBe(true);

    expect(statsHits).toHaveBeenCalledTimes(2);
    expect(officeHits).toHaveBeenCalledTimes(2);
    expect(bobHits).toHaveBeenCalledTimes(2);
  });
});

// Add later when `set(...)` / stale-call behavior is finalized:
// - whole-node replacement tests
// - root replacement tests
// - stale handle read/focus/transact failure tests
