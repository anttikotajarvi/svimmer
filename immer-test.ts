import { enableMapSet, enablePatches, produceWithPatches } from "immer";

enablePatches();
enableMapSet();
type Item = {
  name: string;
}
const secret = Symbol("secret");

const x = {
  [secret]: 123
};

const [newState, patches] = produceWithPatches(x, x => {
  x[secret] = 456
})
console.log(patches)

