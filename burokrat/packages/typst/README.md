# @burokrat/typst

Turns findings and reports into PDFs with Typst. The templates in `typ/` read their data from
`/data.json`, which `src/data.ts` shapes from `@burokrat/domain` content.

Entry points:

- `@burokrat/typst`: the server side. `TypstPool` compiles on Node worker threads, and `checkTypst`
  checks the fonts at boot.
- `@burokrat/typst/browser`: the data shaping only, for the live preview.
- `@burokrat/typst/sources`: the templates, fonts and the checked compile, for the preview's web
  worker.

When a document fails to compile, each text field is compiled on its own to name the broken ones.
The preview shows those fields as their error and source, and PDF export refuses with the list.

`fonts/` holds the report fonts and their licences.
