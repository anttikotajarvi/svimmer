import { enableMapSet, enablePatches, produceWithPatches } from "immer";

enablePatches();
enableMapSet();
type Item = {
  name: string;
}
const x = {
  employees: {
    ceo: {
      name: "John"
    }
  }
} as any

const [newState, patches, inversePatches] = produceWithPatches<any>(x, _ => { 
  return {}
})
console.log(patches, newState)
/*
[
  {
    op: "replace",
    path: [ "employees", "ceo" ],
    value: {
      name: "John",
      age: 34,
    },
  }
] {
  employees: {
    ceo: {
      name: "John",
      age: 34,
    },
  },
}

*/
