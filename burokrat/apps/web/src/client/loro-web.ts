import init from "loro-crdt/web";

// @ts-expect-error loro-crdt/web's typings omit the default `init` export that exists at runtime
await init();

export * from "loro-crdt/web";
