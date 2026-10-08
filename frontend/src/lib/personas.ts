import { DemoPersona } from "../types"

export const DEMO_PERSONAS: DemoPersona[] = [
  {
    username: "alice",
    name: "Alice",
    roleTitle: "Finance Lead",
    roles: ["role:analyst", "role:viewer"],
    clearanceLevel: 2,
    description: "Finance Analyst with L2 clearance. Authorized for Project Alpha budget and finance reports.",
    accessibleVaults: ["project-alpha", "finance-q3", "company-public"],
  },
  {
    username: "bob",
    name: "Bob",
    roleTitle: "HR Specialist",
    roles: ["role:hr", "role:viewer"],
    clearanceLevel: 2,
    description: "HR Lead with L2 clearance. Authorized for employee compensation and personnel records.",
    accessibleVaults: ["hr-policies-2026", "company-public"],
  },
  {
    username: "charlie",
    name: "Charlie",
    roleTitle: "Engineering Analyst",
    roles: ["role:engineer", "role:viewer"],
    clearanceLevel: 1,
    description: "Software Engineer with L1 clearance. Has delegated access to Project Alpha engineering specs.",
    accessibleVaults: ["project-alpha", "engineering-core", "company-public"],
  },
  {
    username: "diana",
    name: "Diana",
    roleTitle: "Security Admin",
    roles: ["role:admin", "role:analyst", "role:hr"],
    clearanceLevel: 3,
    description: "System Administrator & Security Officer with L3 clearance. Full governance and audit capabilities.",
    accessibleVaults: ["project-alpha", "finance-q3", "hr-policies-2026", "engineering-core", "company-public"],
  },
  {
    username: "eve",
    name: "Eve",
    roleTitle: "External Contractor",
    roles: ["role:guest"],
    clearanceLevel: 0,
    description: "External Guest with L0 clearance. Strictly limited to public company documentation.",
    accessibleVaults: ["company-public"],
  },
]
