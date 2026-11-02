import techniques from "../data/mitre_techniques.json" with { type: "json" };

export type MitreTechnique = { id: string; name: string; url: string };

export const MITRE_TECHNIQUES: readonly MitreTechnique[] = techniques;

export const MITRE_BY_ID: ReadonlyMap<string, MitreTechnique> = new Map(
  MITRE_TECHNIQUES.map((technique) => [technique.id, technique]),
);
