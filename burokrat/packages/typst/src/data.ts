import {
  compareFindings,
  IMPACT_DEFINITIONS,
  LEVELS,
  LEVELS_HIGH_FIRST,
  LIKELIHOOD_DEFINITIONS,
  MITRE_BY_ID,
  oneLine,
  overallRisk,
  RISK_COLORS,
  RISK_MATRIX,
  scoreCvss,
  compareServiceKeys,
  liveMachines,
  portLabel,
  type FindingContent,
  type Level,
  type MachineEntry,
  type MitreTechnique,
  type ReportContent,
} from "@burokrat/domain";

/** A text field's Typst markup, and Typst's message when it fails to compile on its own. */
export type FieldData = { source: string; error: string | null };
/** The images a field may show, by the name it uses for them. */
export type ImagesData = Record<string, { asset: string; caption: string }>;

export type FindingData = {
  standalone: boolean;
  title: string;
  category: Level;
  riskLabel: string;
  impact: string;
  likelihood: string;
  cvssScore: string;
  cvssVector: string;
  mitre: MitreTechnique[];
  scope: FindingContent["scope"];
  images: ImagesData;
  description: FieldData;
  businessImpact: FieldData;
  exploitDetails: FieldData;
  remediation: FieldData;
  references: { name: string; url: string; domain: string }[];
};

export type HostData = {
  ip: string;
  hostname: string;
  os: string;
  services: { port: string; name: string; product: string }[];
};

type ReportData = {
  cover: {
    title: string;
    subtitle: string;
    date: string;
    logo: string | null;
    background: string | null;
  };
  images: ImagesData;
  prologue: FieldData;
  epilogue: FieldData;
};

/** What the templates read from `/data.json`. */
export type TypstData = {
  company: string;
  team: string;
  risk: typeof RISK;
  findings: FindingData[];
  hosts: HostData[];
  report: ReportData | null;
};

export type ProjectInfo = { companyName: string; teamName: string };

/** The data for one compile plus the ids of the assets it shows. */
export type TypstInput = { data: TypstData; assetIds: string[] };

const RISK = {
  colors: RISK_COLORS,
  levels: LEVELS,
  matrix: RISK_MATRIX,
  definitions: {
    impact: LEVELS_HIGH_FIRST.map((level) => [level, IMPACT_DEFINITIONS[level]!] as const),
    likelihood: LEVELS_HIGH_FIRST.map((level) => [level, LIKELIHOOD_DEFINITIONS[level]!] as const),
  },
};

const HTTP_URL = /^https?:\/\/[^\s]+$/;

const field = (source: string): FieldData => ({ source, error: null });

/** Maps every image to its asset, since which ones a field shows is only known once it runs. */
function shapeImages(images: FindingContent["images"]): ImagesData {
  return Object.fromEntries(
    images.map(({ name, assetId, caption }) => [name, { asset: assetId, caption }]),
  );
}

function domainOf(url: string) {
  return new URL(url).hostname.replace(/^www\./, "");
}

function shapeFinding(content: FindingContent, standalone: boolean): FindingData {
  const { impact, likelihood } = content;
  const risk = overallRisk(impact, likelihood);
  const cvss = scoreCvss(content.cvss);
  return {
    standalone,
    title: oneLine(content.title),
    category: risk,
    riskLabel: LEVELS[risk].toUpperCase(),
    impact: LEVELS[impact],
    likelihood: LEVELS[likelihood],
    cvssScore: cvss ? cvss.score.toFixed(1) : "N/A",
    cvssVector: cvss?.vector ?? "N/A",
    mitre: Object.keys(content.mitre).flatMap((id) => {
      const technique = MITRE_BY_ID.get(id);
      return technique ? [technique] : [];
    }),
    scope: content.scope,
    images: shapeImages(content.images),
    description: field(content.description),
    businessImpact: field(content.businessImpact),
    exploitDetails: field(content.exploitDetails),
    remediation: field(content.remediation),
    references: content.references
      .filter(({ url }) => HTTP_URL.test(url) && URL.canParse(url))
      .map(({ name, url }) => ({ name, url, domain: domainOf(url) })),
  };
}

/** Every asset the data can show: each image list's, and the report cover's. */
function assetIdsOf({ findings, report }: TypstData) {
  const lists = [...findings.map(({ images }) => images), report?.images ?? {}];
  const ids = lists.flatMap((images) => Object.values(images).map(({ asset }) => asset));
  if (report?.cover.logo) ids.push(report.cover.logo);
  if (report?.cover.background) ids.push(report.cover.background);
  return [...new Set(ids)];
}

/** The machines in scope or to tread carefully on, by IP, with their services by port. */
function shapeHosts(machines: Record<string, MachineEntry>): HostData[] {
  return liveMachines(machines)
    .filter(({ scope }) => scope !== "out")
    .map(({ ip, hostname, os, services }) => ({
      ip,
      hostname,
      os,
      services: Object.keys(services)
        .sort(compareServiceKeys)
        .map((key) => ({
          port: portLabel(key),
          name: services[key]!.name,
          product: services[key]!.product,
        })),
    }));
}

function finish(
  project: ProjectInfo,
  findings: FindingData[],
  hosts: HostData[],
  report: ReportData | null,
) {
  const data: TypstData = {
    company: project.companyName,
    team: project.teamName,
    risk: RISK,
    findings,
    hosts,
    report,
  };
  return { data, assetIds: assetIdsOf(data) };
}

/** Data for a single finding's PDF. */
export function findingInput(project: ProjectInfo, content: FindingContent): TypstInput {
  return finish(project, [shapeFinding(content, true)], [], null);
}

/** Data for the full report: cover, prologue, findings by risk, epilogue. */
export function reportInput(
  project: ProjectInfo,
  findings: FindingContent[],
  report: ReportContent,
  machines: Record<string, MachineEntry>,
): TypstInput {
  const { cover } = report;
  return finish(
    project,
    findings.toSorted(compareFindings).map((content) => shapeFinding(content, false)),
    shapeHosts(machines),
    {
      cover: {
        title: cover.title,
        subtitle: cover.subtitle,
        date: cover.date,
        logo: (cover.mode === "simple" && cover.logoAssetId) || null,
        background: (cover.mode === "image" && cover.imageAssetId) || null,
      },
      images: shapeImages(report.images),
      prologue: field(report.prologue),
      epilogue: field(report.epilogue),
    },
  );
}
