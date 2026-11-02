import type { ProjectInfo } from "@burokrat/domain";
import { Input } from "@cloudflare/kumo";

/** A form field's text, or "" when it is missing. */
export function formString(form: FormData, key: string) {
  const value = form.get(key);
  return typeof value === "string" ? value : "";
}

/** The project's details as entered in {@link ProjectFields}. */
export function readProjectFields(form: FormData): ProjectInfo {
  const field = (key: keyof ProjectInfo) => formString(form, key).trim();
  return { name: field("name"), companyName: field("companyName"), teamName: field("teamName") };
}

/** What each of a project's fields is, for the setup form and the live settings. */
export const PROJECT_FIELDS = [
  { key: "name", label: "Name" },
  { key: "companyName", label: "Company", description: "Shown wherever the report says #company." },
  { key: "teamName", label: "Team", description: "Shown wherever the report says #team." },
] as const;

/** A project's name, company and team, for a form read with {@link readProjectFields}. */
export function ProjectFields({ autoFocus }: { autoFocus?: boolean }) {
  return PROJECT_FIELDS.map(({ key, label, ...field }) => (
    <Input
      key={key}
      label={label}
      name={key}
      required={key === "name"}
      maxLength={100}
      autoFocus={autoFocus && key === "name"}
      {...field}
    />
  ));
}
