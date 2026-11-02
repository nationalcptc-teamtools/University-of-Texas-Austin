import { Banner } from "@cloudflare/kumo";
import type { Problems } from "../preview/context.ts";

/** What stops the PDF building: each broken field and its error, or else Typst's errors. */
export function ProblemsBanner({ problems }: { problems: Problems }) {
  const { broken, errors } = problems;
  const lines =
    broken.length > 0
      ? broken.map(({ label, error }) => ({ label, error }))
      : errors.map((error) => ({ label: "", error }));
  if (lines.length === 0) return null;
  return (
    <div className="sticky top-0 z-10 max-h-48 overflow-y-auto rounded-lg bg-kumo-base shadow-md ring ring-kumo-line">
      <Banner
        variant="error"
        title="Fix these Typst errors to export the PDF."
        description={
          <ul className="list-disc pl-4">
            {lines.map(({ label, error }, index) => (
              <li key={index}>
                {label && <span className="font-medium">{label}: </span>}
                {error}
              </li>
            ))}
          </ul>
        }
      />
    </div>
  );
}
