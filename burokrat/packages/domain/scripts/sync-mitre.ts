import { writeFile } from "node:fs/promises";

const SOURCE =
  "https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json";
const OUTPUT = new URL("../data/mitre_techniques.json", import.meta.url);

type Technique = { id: string; name: string; url: string };
type StixObject = {
  type: string;
  name?: string;
  revoked?: boolean;
  x_mitre_deprecated?: boolean;
  external_references?: { source_name: string; external_id: string; url?: string }[];
};

const response = await fetch(SOURCE);
if (!response.ok) throw new Error(`${SOURCE} answered ${response.status}`);
const { objects } = (await response.json()) as { objects: StixObject[] };

const techniques = new Map<string, Technique>();
for (const object of objects) {
  if (object.type !== "attack-pattern" || object.revoked || object.x_mitre_deprecated) continue;
  const reference = object.external_references?.find((ref) => ref.source_name === "mitre-attack");
  if (!reference || techniques.has(reference.external_id)) continue;
  const id = reference.external_id;
  techniques.set(id, {
    id,
    name: object.name ?? "",
    url: reference.url ?? `https://attack.mitre.org/techniques/${id}/`,
  });
}

const sorted = [...techniques.values()].sort((a, b) => (a.id < b.id ? -1 : 1));
await writeFile(OUTPUT, `${JSON.stringify(sorted, null, 2)}\n`);
console.log(`Wrote ${sorted.length} techniques to ${OUTPUT.pathname}`);
