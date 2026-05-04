import type { Immutable } from "immer";
import type { Transactor } from ".";

export type LastReturn<Txs extends readonly Transactor<any, any>[]> =
  Txs extends readonly [...any[], Transactor<any, infer R>] ? R : void;

export type Unsubscriber = () => void;
export type Subscriber<T> = (value: Immutable<T>, txId: number) => void;
