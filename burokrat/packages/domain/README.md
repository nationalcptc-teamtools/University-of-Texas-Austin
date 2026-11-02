# @burokrat/domain

What a finding and a report are, shared by the server, the browser and `@burokrat/typst`.

- `content.ts`: Zod schemas for finding and report content and for their docs, the prose fields
  and their labels.
- `docs.ts`: builds the Loro doc for a new finding or report.
- `mirror.ts`: the `loro-mirror` schemas the editors bind to.
- `risk.ts`, `cvss.ts`, `mitre.ts`: risk levels and matrix, CVSS 4.0 scoring, MITRE ATT&CK
  techniques.
- `templates.ts`: the report template and a blank finding, from `data/`.
- `finding-templates.ts`: the finding templates, one file each in `data/finding_templates/`.
  Exported as `@burokrat/domain/finding-templates`, apart from the index, since it needs Vite.

`data/mitre_techniques.json` is generated. Refresh it from mitre/cti with:

```bash
pnpm --filter @burokrat/domain sync-mitre
```
