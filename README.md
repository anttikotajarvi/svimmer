## svimmer: preliminary design

### Core idea

A Svimmer store is a centralize document state.

State is accessed only through **nodes**.

A node is a handle to a **path** in the root state.

---

### Node kinds

#### Reader

* `read(accessor)`
* `focus(selector)`
* `subscribe(cb)`
* `onDestroy(cb)`

#### Writer

* everything from Reader
* `transact(mutator)`

A writer is a reader with write access.

---

### Primitives

#### Accessor

Reads from the current node value.

```ts
person.read(x => x.name)
person.read(keyOf<Person>()("name"))
```

#### Selector

Navigates from one node to a child node.

Selectors are branded accessors:

* selectors work in `read`
* only selectors work in `focus`

```ts
person.focus(selector<Person>(x => x.name))
person.focus(keyOf<Person>()("name"))
```

#### Transactor

Mutates the current node draft.

```ts
person.transact(d => {
  d.name = "Carl"
})
```

---

### Focus semantics

`focus` is **path-based**, not object-identity-based.

A focused node survives as long as its **path still exists**.

Replacing an object at the same path does **not** destroy the node.

Example:

```ts
ceo = { name: "John" } -> { name: "Carl" }
```

* `ceo` survives
* `ceo.name` survives
* both are updated
* no destroy

If a path disappears, the node is destroyed.

---

### Missing paths

`focus(...)` returns `null` when the target path does not exist.

Nonexistent nodes are not represented by placeholder handles.

Creation happens through parent writes, not through ghost children.

---

### Read semantics

`read(accessor)` is the normal API.

`read()` does not expose the full raw value.

Reason:

* keeps reads inside the node model
* avoids stale raw references becoming the normal pattern

A separate escape hatch like `value()` may exist later.

---

### Transaction semantics

All writes go through the root transaction boundary.

A child writer does not wrap parent writers recursively.

Each node resolves its own path against the current root draft.

This keeps:

* one real state owner
* one history boundary
* one patch source

---

### Reactivity model

Subscriptions are stored in a **branch trie** keyed by path.

Each branch slot may hold:

* subscribers
* destroy handlers
* cached reader
* cached writer
* child branch slots
* stale flag

Handles are cached per path.
Focus returns the canonical handle for that path.

---

### Notification model

Notifications are patch-driven.

Patches do **not** directly define lifecycle.
They only identify affected subtrees.

The system compares old/new values only where cached branch slots already exist.

This is used to detect:

#### touched

A surviving path whose value changed.

#### deleted root

The highest cached path in a lost subtree.

Deleted roots are expanded into deleted branches.

---

### Notify order

#### 1. Destroy

Deleted branches are notified **bottom-up**.

Each receives:

* `onDestroy`
* stale mark

#### 2. Update

Surviving touched branches are notified **top-down**.

Subscribers receive the branch’s cached reader.

#### 3. Cleanup

Deleted roots are removed from the branch trie.

---

### Destroy semantics

`onDestroy(cb)` is lifecycle-only.

It does **not** receive “last value”.

Reason:

* last value is ambiguous inside one transaction
* path loss is the real semantic event

After destroy:

* the node becomes stale
* later operations should fail

---

### Path model

Internally, nodes are rooted by path.

Selectors may later compile to paths through proxy tracking.

Current path steps support:

* `string`
* `number`
* `symbol`

Runtime routing uses the same path space as Immer patches.

---

### Container model

Children are recognized in:

* objects
* arrays
* maps

Sets are treated as terminal leaves.

Reason:

* set members do not have stable patch-addressable child identity

---

### Generic helpers

#### selectors

* `keyOf<T>()("name")`
* `atOf<T>()(0)`
* `mapGetOf<K, V>()(key)`

#### accessors

* `self`
* `lengthOf`
* `sizeOf`
* `isEmpty`
* `includes`
* `setHas`
* `mapHas`
* `some`
* `every`

These are convenience only.
Inline lambdas remain first-class.

---

### Design principles

* root owns state
* nodes are thin handles
* path identity matters
* reads, selectors, and transactors are explicit
* subscriptions are centralized
* lifecycle is path-existence-based
* history and reactivity come from the same transaction pipeline

---

### Non-goals for now

* placeholder nodes for missing paths
* create notifications
* aggressive caching
* object-identity semantics
