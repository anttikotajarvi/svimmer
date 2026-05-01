export type Employee = {
  id: string;
  name: string;
  age: number;
  title: string;
  active: boolean;
  tags: Set<string>;
  contact: {
    email: string;
    phone?: string;
  };
};

export type Project = {
  id: string;
  name: string;
  budget: number;
  members: string[]; // employee ids
  meta: Map<string, string>;
};

export type CompanyDoc = {
  companyName: string;          // primitive
  foundedYear: number;          // primitive
  remoteFriendly: boolean;      // primitive

  ceoId: string;                // primitive reference
  employees: Map<string, Employee>; // map of objects
  projects: Project[];          // array of objects
  announcements: string[];      // array of primitives

  office: {
    country: string;
    city: string;
    rooms: string[];
  };                            // nested object + array

  featureFlags: Map<string, boolean>; // map of primitives
  departments: Set<string>;           // set of primitives
  aliases: Record<string, string>;    // plain object dictionary

  stats: {
    headcount: number;
    revenue: number;
  };
};

type x = keyof Map<string, number>

export const companyFixture: CompanyDoc = {
  companyName: "Northwind Labs",
  foundedYear: 2018,
  remoteFriendly: true,

  ceoId: "e1",

  employees: new Map([
    [
      "e1",
      {
        id: "e1",
        name: "Alice North",
        age: 42,
        title: "CEO",
        active: true,
        tags: new Set(["leadership", "founder"]),
        contact: {
          email: "alice@northwind.test",
          phone: "123-456",
        },
      },
    ],
    [
      "e2",
      {
        id: "e2",
        name: "Bob Stone",
        age: 31,
        title: "Engineer",
        active: true,
        tags: new Set(["backend", "typescript"]),
        contact: {
          email: "bob@northwind.test",
        },
      },
    ],
    [
      "e3",
      {
        id: "e3",
        name: "Cara Field",
        age: 27,
        title: "Designer",
        active: false,
        tags: new Set(["ui", "brand"]),
        contact: {
          email: "cara@northwind.test",
        },
      },
    ],
  ]),

  projects: [
    {
      id: "p1",
      name: "Mercury",
      budget: 50000,
      members: ["e1", "e2"],
      meta: new Map([
        ["status", "active"],
        ["priority", "high"],
      ]),
    },
    {
      id: "p2",
      name: "Juniper",
      budget: 12000,
      members: ["e2", "e3"],
      meta: new Map([
        ["status", "paused"],
      ]),
    },
  ],

  announcements: [
    "All hands on Friday",
    "Office closed next Monday",
  ],

  office: {
    country: "FI",
    city: "Oulu",
    rooms: ["A1", "B1", "Meeting-Red"],
  },

  featureFlags: new Map([
    ["newDashboard", true],
    ["betaBilling", false],
  ]),

  departments: new Set(["engineering", "design", "operations"]),

  aliases: {
    mainProject: "Mercury",
    supportLead: "Alice North",
  },

  stats: {
    headcount: 3,
    revenue: 250000,
  },
};