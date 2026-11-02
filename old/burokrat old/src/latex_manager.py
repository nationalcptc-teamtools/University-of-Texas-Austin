import yaml
from util import *
import os
import subprocess
from cvss import CVSS4
import json
import argparse


FINDING_TEMPLATE = """
\\vulnreport[
    number={{{number}}},
    title={{{title}}},
    category={{{category}}},
    risk={{{risk}}},
    impact={{{impact}}},
    likelihood={{{likelihood}}},
    cvssscore={{{cvssscore}}},
    cvssvector={{{cvssvector}}},
    mitre={{{mitre}}},
    scope={{{scope}}},
    description={{{description}}},
    impactdesc={{{impactdesc}}},
    confirmation={{{confirmation}}},
    remediation={{{remediation}}},
    references={{{references}}}
]
"""

LATEX_ESCAPE_MAP = {
    "{": r"\{",
    "}": r"\}",
    "\\": r"\textbackslash{}",
    "&": r"\&",
    "%": r"\%",
    "$": r"\$",
    "#": r"\#",
    "_": r"\_",
    "~": r"\textasciitilde{}",
    "^": r"\^{}",
    # "'": r"\'",
    "\n": r"\\",
}

LATEX_SECTION_IDENTIFIER = "***"


class LatexManager:
    def __init__(self):
        self.load_config()

    def load_config(self):
        with open(resolve_path("config.yaml"), "r") as file:
            yaml_config = yaml.safe_load(file)
        self.latex_files_dir: str = resolve_path(yaml_config.get("latex_files_dir"))
        self.finding_tex_file: str = yaml_config.get("finding_tex_file")
        self.report_tex_file: str = yaml_config.get("report_tex_file")
        self.risk_levels: list[str] = yaml_config.get("risk_levels")
        self.impact_levels: list[str] = yaml_config.get("impact_levels")
        self.likelihood_levels: list[str] = yaml_config.get("likelihood_levels")
        self.mitre_techniques_file: str = yaml_config.get("mitre_techniques_file")
        with open(resolve_path(self.mitre_techniques_file), "r") as file:
            self.mitre_techniques: list[dict[str, str]] = json.load(file)
        self.mitre_techniques_dict: dict[str, dict[str, str]] = {
            technique["id"]: technique for technique in self.mitre_techniques
        }

    def _escape_latex_special_chars(self, text: str) -> str:
        return "".join(LATEX_ESCAPE_MAP.get(char, char) for char in text)

    def escape_latex(self, text: str) -> str:
        # Escape special LaTeX characters in the given text
        # anything enclosed in LATEX_SECTION_IDENTIFIER should not be escaped
        parts = text.split(LATEX_SECTION_IDENTIFIER)
        if len(parts) % 2 == 0:
            raise ValueError(
                "Mismatched LaTeX section identifiers (ensure that all sections are properly closed)."
            )
        for i in range(0, len(parts), 2):
            parts[i] = self._escape_latex_special_chars(parts[i])
        return "".join(parts)

    def convert_scope_to_latex(self, scope: list[MachineScope]) -> str:
        latex_scope = r"\begin{tabularx}{\dimexpr\textwidth-1cm}{p{8cm}XX}"
        latex_scope += "\n\\arrayrulecolor{gray}"
        for machine in scope:
            services = machine.services
            if len(services) == 0:
                services = [{"name": "N/A", "port": "N/A"}]
            if machine.ip and machine.name:
                latex_scope += f"{machine.ip} ({machine.name}) & {services[0]['name']} & {services[0]['port']} \\\\\n"
            elif machine.ip:
                latex_scope += f"{machine.ip} & {services[0]['name']} & {services[0]['port']} \\\\\n"
            elif machine.name:
                latex_scope += f"{machine.name} & {services[0]['name']} & {services[0]['port']} \\\\\n"
            for service in services[1:]:
                latex_scope += f" & {service['name']} & {service['port']} \\\\\n"
            latex_scope += r"\hline" + "\n"
        latex_scope += r"\end{tabularx}"
        return latex_scope

    def convert_exploit_details_to_latex(self, details: str | list[str]) -> str:
        if isinstance(details, str):
            return (
                details + r"\vspace{0.2cm}\\"
                if details.strip()
                else r"N/A\vspace{0.2cm}\\"
            )
        if len(details) == 0:
            return r"N/A\vspace{0.2cm}\\"
        latex_details = r"\vspace{-0.6cm}\begin{enumerate}[itemsep=0pt]" + "\n"
        for detail in details:
            latex_details += f"\\item {self.escape_latex(detail.strip())}\n"
        latex_details += r"\end{enumerate}"
        return latex_details

    def convert_references_to_latex(self, references: list[str]) -> str:
        if not references:
            return "N/A"
        latex_references = r"\vspace{-0.5cm}\begin{itemize}[itemsep=0pt]" + "\n"
        for ref in references:
            latex_references += f"\\item \\href{{{self.escape_latex(ref.get('url',''))}}}{{{self.escape_latex(ref.get('name',''))}}}\n"
        latex_references += r"\end{itemize}"
        return latex_references

    def calculate_cvss_score(self, cvss_vector: str) -> str:
        try:
            cvss = CVSS4(cvss_vector)
            return f"{cvss.scores()[0]:.1f}"
        except Exception:
            return "N/A"

    def convert_cvss_vector_to_latex(self, cvss_vector: str) -> str:
        if cvss_vector == "N/A":
            return "N/A"
        return cvss_vector[:33] + r"\\" + cvss_vector[33:]

    def generate_cvss_vector_str(self, cvss_vector: dict[str, str]) -> str:
        return (
            (
                "CVSS:4.0/"
                + "/".join(f"{key}:{value}" for key, value in cvss_vector.items())
            )
            if all(cvss_vector.values())
            else "N/A"
        )

    def convert_mitre_techniques_to_latex(self, mitre_techniques: list[str]) -> str:
        if not mitre_techniques:
            return "N/A" + r"\\"
        latex_mitre = r"\begin{tabularx}{\textwidth}{XX}" + "\n"
        for i, tid in enumerate(mitre_techniques):
            technique = self.mitre_techniques_dict.get(tid)
            if not technique:
                continue
            name = technique.get("name")
            url = technique.get("url")
            if not url or not url.startswith("http"):
                print(f"Warning: Invalid or missing URL for technique {tid}")
                name = "N/A"
                url = f"https://attack.mitre.org/techniques/{tid}/"
            latex_mitre += f"\\href{{{url}}}{{{tid}}} - {name} "
            if i % 2 == 0:
                latex_mitre += "& "
            else:
                latex_mitre += r"\\ " + "\n"
        if len(mitre_techniques) % 2 != 0:
            latex_mitre += r"\\ " + "\n"
        latex_mitre += r"\end{tabularx}\vspace{0.2cm}"
        return latex_mitre

    def convert_finding_to_latex(self, number: str, finding: Finding) -> str:
        cvss_vector_str = self.generate_cvss_vector_str(finding.cvss_vector)
        return FINDING_TEMPLATE.format(
            number=number,
            title=self.escape_latex(finding.title.strip()),
            category=finding.risk + 1,
            risk=self.risk_levels[finding.risk].upper(),
            impact=self.impact_levels[finding.impact],
            likelihood=self.likelihood_levels[finding.likelihood],
            cvssscore=self.calculate_cvss_score(cvss_vector_str),
            cvssvector=self.convert_cvss_vector_to_latex(cvss_vector_str),
            mitre=self.convert_mitre_techniques_to_latex(finding.mitre_techniques),
            scope=self.convert_scope_to_latex(finding.scope),
            description=self.escape_latex(finding.description.strip()),
            impactdesc=self.escape_latex(finding.business_impact.strip()),
            confirmation=self.convert_exploit_details_to_latex(finding.exploit_details),
            remediation=self.escape_latex(finding.remediation.strip()),
            references=self.convert_references_to_latex(finding.references),
        )

    def generate_single_finding_pdf(
        self, finding: Finding, output_file: str
    ) -> tuple[bool, str]:
        try:
            latex_content = self.convert_finding_to_latex("1.2.3", finding)
        except Exception as e:
            return False, str(e)
        finding_tex_path = os.path.join(self.latex_files_dir, self.finding_tex_file)
        with open(finding_tex_path, "w") as file:
            file.write(latex_content)
        report_tex_path = os.path.join(self.latex_files_dir, self.report_tex_file)
        command = f'latexmk -cd -pdf -latexoption="--halt-on-error" {report_tex_path}'
        print(f"Running command: {command}")
        # run latexmk and capture stderr so we can return it on failure
        result = subprocess.run(
            command,
            shell=True,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
            text=True,
        )
        if result.returncode != 0:
            stderr = (
                (result.stdout or "").strip() + "\n" + (result.stderr or "").strip()
            )
            return False, stderr
        generated_pdf = report_tex_path.replace(".tex", ".pdf")
        if os.path.exists(output_file):
            os.remove(output_file)
        os.rename(generated_pdf, output_file)
        subprocess.run(
            f"latexmk -C -cd {os.path.join(self.latex_files_dir, '*.tex')}",
            shell=True,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        return True, ""

    def sort_findings(self, findings: list[Finding]) -> list[Finding]:
        return sorted(
            findings,
            key=lambda f: (-f.risk, -f.impact, -f.likelihood, f.title),
            reverse=False,
        )

    def generate_report_latex(self, findings: list[Finding]) -> str:
        sorted_findings = self.sort_findings(findings)
        finding_latex = []
        for i, finding in enumerate(sorted_findings, start=1):
            finding_number = f"{i}"
            try:
                temp = self.convert_finding_to_latex(finding_number, finding)
            except Exception as e:
                print(f"Error converting finding {finding_number}: {e}")
                continue
            finding_latex.append(temp)

        final_latex = "\\section{Findings}\n"
        current_risk = -1
        for flatex, finding in zip(finding_latex, sorted_findings):
            if finding.risk != current_risk:
                current_risk = finding.risk
                risk_level = self.risk_levels[current_risk].title()
                final_latex += f"\\subsection{{{risk_level} Risk Findings}}\n"
            final_latex += flatex + "\n\n"
        return final_latex


if __name__ == "__main__":
    parser = argparse.ArgumentParser(
        description="Convert folder of JSON findings to LaTeX report."
    )
    parser.add_argument(
        "findings_folder", help="Path to folder containing JSON findings."
    )
    parser.add_argument("output_file", help="Path to output LaTeX file.")
    args = parser.parse_args()
    findings_folder = args.findings_folder
    output_file = args.output_file
    json_files = [x for x in os.listdir(findings_folder) if x.endswith(".json")]
    parsed_findings: list[Finding] = []
    for jf in json_files:
        jf_full_path = os.path.abspath(os.path.join(findings_folder, jf))
        try:
            with open(jf_full_path, "r") as file:
                finding_data = json.load(file)
            finding = Finding.build_from_json(jf.split(".")[0], finding_data)
        except Exception as e:
            print(f"Error loading finding from {jf_full_path}: {e}")
            continue
        parsed_findings.append(finding)
    latex_manager = LatexManager()
    report_latex = latex_manager.generate_report_latex(parsed_findings)
    with open(output_file, "w") as file:
        file.write(report_latex)
