import { enableMapSet, enablePatches, produceWithPatches } from "immer";

enablePatches();
enableMapSet();
type Item = {
  name: string;
}
const x = {
  items: new Set<Item>()
}

const [newState, patches] = produceWithPatches(x, x => {
  x.items.add({
    name: "John"
  })
})
console.log(patches)

const [newState2, patches2] = produceWithPatches(newState, x => {
  x.items.forEach((x) => {
    if (x.name === "John") 
      x.name = "John B."
  })
})
console.log(patches2)

const z = {
  items: new Map<number, Item>()
}  
{
 const [newState, patches] = produceWithPatches(z, x => {
  x.items.set(5, { name: "Carl"})
 });
 console.log(patches) 

 const [newState2, patches2] = produceWithPatches(newState, x => {
    x.items.get(5)!.name = "Carl B.";
 })
 console.log(patches2)
}