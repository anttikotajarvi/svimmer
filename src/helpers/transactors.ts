import type { Draft } from "immer"
import type { Transactor } from ".."
import type { LastReturn } from "../generic"
/**
 * Gives easy type inference and ergonomics.
 * @example
 * ```ts
 * type Person = {
*   name:string;
*   age: number;
* }
* const setAge = (age:number) => transactor((draft:Person) => {
*   const prev = draft.age;
*   draft.age = age;
*   return prev;
* })
* // Type of setAge is inferred as: (age: number) => Transactor<Person, number>
* ```
 */
export function transactor<T, R>(
  fn: (draft: Draft<T>) => R
): Transactor<T, R> {
  return fn;
}


/**
 * Compose multiple transactors into a new transactor.
 *
 * Each transactor runs in order against the same draft.
 * The final transactor's return value becomes the return value of the composed transactor.
 *
 * Useful for building small reusable mutators and then combining them into one atomic write.
 *
 * @example
 * ```ts
 * const setName = (name: string): Transactor<Person, void> =>
 *   draft => {
 *     draft.name = name;
 *   };
 *
 * const incrementAge: Transactor<Person, number> =
 *   draft => {
 *     draft.age += 1;
 *     return draft.age;
 *   };
 *
 * // Runs both mutators on the same draft.
 * // Returns the result of `incrementAge`.
 * const newAge = person.transact(begin(
 *   setName("Carl"),
 *   incrementAge
 * ));
 * ```
 */
export function begin<T, Txs extends readonly Transactor<T, any>[]>(
  ...txs: Txs
): Transactor<T, LastReturn<Txs>> {
  return (draft) => {
    let out: unknown = undefined

    for (const tx of txs) {
      out = tx(draft)
    }

    return out as LastReturn<Txs>
  }
}

