import json
import os
import argparse
import subprocess


SEVERITY_COLORS = {
    "Critical": r"\criticalcolor",
    "High": r"\highcolor",
    "Medium": r"\mediumcolor",
    "Low": r"\lowcolor",
    "Informational": r"\infocolor",
}

SEVERITY_RANKING = {"Critical": 1, "High": 2, "Medium": 3, "Low": 4, "Informational": 5}

SEVERITY_COUNTS = {k: 1 for k in SEVERITY_RANKING.keys()}


def load_vuln_data(vuln_path: str) -> list[dict]:
    file_names = [x for x in os.listdir(vuln_path) if ".json" in x]
    vulns = []
    for name in file_names:
        file_path = os.path.join(vuln_path, name)
        with open(file_path, "r") as f:
            data = json.load(f)
            data["severity"] = {k: v.capitalize() for k, v in data["severity"].items()}
            vulns.append(data)
    return vulns


def generate_vuln_table(vulns: list[dict]) -> str:
    table = r"""
\begin{tabularx}{\textwidth}{|Z|V|X|}
\hline
\rowcolor{gray} \textbf{Risk} & \textbf{Vulnerability} & \makecell[c]{\textbf{Affected Scope}} \\
\hline
"""
    for vuln in vulns:
        table += (
            r"\cellcolor{"
            + SEVERITY_COLORS[vuln["severity"]["overall"]]
            + r"}\textcolor{white}{\large\textbf{"
            + vuln["severity"]["overall"]
            + "}} & "
            + vuln["title"]
            + r" & \makecell[l]{"
            + vuln["scope"]
            + r"} \\"
        )
        table += "\n\\hline\n"
    table += r"\end{tabularx}"
    return table


def generate_single_vuln_detail(vuln: dict) -> str:
    title = f'{SEVERITY_RANKING[vuln["severity"]["overall"]]}.{SEVERITY_COUNTS[vuln["severity"]["overall"]]} {vuln["title"]}'
    
    SEVERITY_COUNTS[vuln["severity"]["overall"]] += 1
    latex = f"""
\\vulnreport[
    title={{{title}}},
    category={{{vuln['severity']['overall']}}},
    impact={{{vuln['severity']['impact']}}},
    likelihood={{{vuln['severity']['likelihood']}}},
    scope={{{vuln['scope']}}},
    description={{{vuln['description']}}},
    impactdesc={{{vuln['impact']}}},
    confirmation={{{vuln['confirmation']}}},
    remediation={{{vuln['remediation']}}},
    references={{{vuln['references']}}}
]
"""
    return latex


def generate_all_vuln_details(vulns: list[dict]) -> str:
    res = ""
    for i, vuln in enumerate(vulns):
        if i > 0:
            res += "\n\\newpage\n"
        res += generate_single_vuln_detail(vuln)
    return res


def generate_tex_file(
    template_file: str, output_file: str, vuln_table: str, vuln_details: str
) -> None:
    with open(template_file, "r") as f:
        lines = f.readlines()
    with open(output_file, "w") as f:
        for line in lines:
            if "PYTHON_VULNTABLE_LOCATION" in line:
                f.write(vuln_table)
            elif "PYTHON_VULNDETAILS_LOCATION" in line:
                f.write(vuln_details)
            else:
                f.write(line)


def compile_pdf(tex_file: str, pdf_file: str) -> None:
    output_dir = os.path.dirname(pdf_file)
    subprocess.run(["pdflatex", "-output-directory", output_dir, tex_file])
    temp_pdf = os.path.join(
        output_dir, os.path.basename(tex_file).replace(".tex", ".pdf")
    )
    if not os.path.exists(temp_pdf):
        print(f"Error compiling pdf.\nSee {tex_file} for intermediate output.")
        return
    if temp_pdf == pdf_file:
        return
    if os.path.exists(pdf_file):
        os.remove(pdf_file)
    os.rename(temp_pdf, pdf_file)
    
def clean_files(tex_path: str) -> None:
    aux_file = tex_path.replace('.tex', '.aux')
    if os.path.exists(aux_file):
        os.remove(aux_file)
    log_file = tex_path.replace('.tex', '.log')
    if os.path.exists(log_file):
        os.remove(log_file)


if __name__ == "__main__":
    argparser = argparse.ArgumentParser()
    argparser.add_argument(
        "--template",
        "-i",
        default="cptc-py-template.tex",
        help="Input .tex file to use as a template (default is cptc-py-template.tex)",
    )
    argparser.add_argument(
        "--pdf_output",
        "-o",
        default="cptc-py-report.pdf",
        help="Output .pdf file to create (default is cptc-py-report.pdf)",
    )
    argparser.add_argument(
        "--tex_output",
        "-t",
        default="cptc-py-report.tex",
        help="Output .tex file to create (default is cptc-py-report.tex)",
    )
    argparser.add_argument(
        "--vulns",
        "-f",
        default="vuln_data",
        help='Folder containing vuln JSONs (default is "vuln_data")',
    )
    argparser.add_argument(
        '--clean',
        '-c',
        action='store_true',
        help='Clean up .aux and .log files after compiling.'
    )
    args = argparser.parse_args()

    vuln_data_path = os.path.abspath(os.path.expanduser(args.vulns))
    template_path = os.path.abspath(os.path.expanduser(args.template))
    tex_path = os.path.abspath(os.path.expanduser(args.tex_output))
    pdf_path = os.path.abspath(os.path.expanduser(args.pdf_output))

    vulns = load_vuln_data(vuln_data_path)
    vulns = sorted(
        vulns,
        key=lambda x: (
            SEVERITY_RANKING[x["severity"]["overall"]],
            SEVERITY_RANKING[x["severity"]["impact"]],
            SEVERITY_RANKING[x["severity"]["likelihood"]],
            x["title"],
        ),
    )

    vuln_table = generate_vuln_table(vulns)
    vuln_details = generate_all_vuln_details(vulns)

    generate_tex_file(template_path, tex_path, vuln_table, vuln_details)
    compile_pdf(tex_path, pdf_path)
    if args.clean:
        clean_files(tex_path)
