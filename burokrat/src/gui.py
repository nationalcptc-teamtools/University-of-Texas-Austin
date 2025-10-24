import streamlit as st
import json
import os
from streamlit_pdf_viewer import pdf_viewer
import yaml
from util import *
from latex_manager import LatexManager


class ReportWriterGUI:
    def __init__(self):
        self.load_config()
        self.findings: list[Finding] = []
        self.load_findings()
        self.selected_finding: int = 0
        self.latex_manager = LatexManager()
        self.cur_timestep = 0

    def load_config(self):
        with open(resolve_path("config.yaml"), "r") as f:
            yaml_config = yaml.safe_load(f)
        self.vuln_file_prefix: str = yaml_config["vuln_file_prefix"]
        self.vuln_files_dir: str = resolve_path(yaml_config["vuln_files_dir"])
        self.vuln_pdfs_dir: str = resolve_path(yaml_config["vuln_pdfs_dir"])
        self.risk_levels: list[str] = yaml_config["risk_levels"]
        self.impact_levels: list[str] = yaml_config["impact_levels"]
        self.likelihood_levels: list[str] = yaml_config["likelihood_levels"]
        self.mitre_techniques_file: str = resolve_path(
            yaml_config["mitre_techniques_file"]
        )
        with open(self.mitre_techniques_file, "r") as f:
            self.mitre_techniques = json.load(f)
        self.mitre_id_to_name = {t["id"]: t["name"] for t in self.mitre_techniques}

    def load_findings(self):
        if not os.path.exists(self.vuln_files_dir):
            return
        for filename in os.listdir(self.vuln_files_dir):
            if filename.endswith(".json"):
                with open(os.path.join(self.vuln_files_dir, filename), "r") as f:
                    data = json.load(f)
                    id = filename.split(".json")[0]
                    self.findings.append(Finding.build_from_json(id, data))
        self.findings.sort(key=lambda x: x.id)

    def save_findings(self):
        os.makedirs(self.vuln_files_dir, exist_ok=True)
        for finding in self.findings:
            with open(
                os.path.join(self.vuln_files_dir, f"{finding.id}.json"), "w"
            ) as f:
                json.dump(finding.to_json(), f, indent=4)

    def update_timestep(self):
        self.cur_timestep += 1

    def generate_pdf(self):
        if len(self.findings) > 0:
            output_pdf_path = os.path.join(
                self.vuln_pdfs_dir,
                f"{self.findings[self.selected_finding].id}.pdf",
            )
            os.makedirs(self.vuln_pdfs_dir, exist_ok=True)
            success = self.latex_manager.generate_single_finding_pdf(
                self.findings[self.selected_finding], output_pdf_path
            )
            if not success:
                st.error("Failed to generate PDF. Please check LaTeX logs.")

    def get_next_finding_id(self) -> int:
        cur = 1
        existing_ids = {int(f.id.split("-")[-1]) for f in self.findings if f.id.startswith(self.vuln_file_prefix)}
        while cur in existing_ids:
            cur += 1
        return cur

    def render(self) -> bool:
        rerun = False

        st.set_page_config(layout="wide")
        user_input, pdf_preview = st.columns(2)
        with user_input:
            if st.button(
                "Create New Vulnerability",
                use_container_width=True,
                key=f"create-new-vuln-{self.cur_timestep}",
            ):
                new_finding_id = f"{self.vuln_file_prefix}-{self.get_next_finding_id():03d}"
                new_finding = Finding(new_finding_id)
                self.findings.append(new_finding)
                self.selected_finding = len(self.findings) - 1
                self.update_timestep()
                return True
            self.selected_finding = st.selectbox(
                "Vulnerability",
                range(len(self.findings)),
                format_func=lambda x: f"{self.findings[x].id} ({self.findings[x].title})",
                index=self.selected_finding,
                key=f"vuln-select-{self.cur_timestep}",
            )
            if len(self.findings) > 0:
                self.findings[self.selected_finding].title = st.text_input(
                    "Title",
                    value=self.findings[self.selected_finding].title,
                    key=f"title-{self.selected_finding}-{self.cur_timestep}",
                )
                self.findings[self.selected_finding].risk = st.selectbox(
                    "Overall Risk",
                    range(len(self.risk_levels)),
                    format_func=lambda x: self.risk_levels[x],
                    index=self.findings[self.selected_finding].risk,
                    key=f"risk-{self.selected_finding}-{self.cur_timestep}",
                )
                self.findings[self.selected_finding].impact = st.selectbox(
                    "Impact",
                    range(len(self.impact_levels)),
                    format_func=lambda x: self.impact_levels[x],
                    index=self.findings[self.selected_finding].impact,
                    key=f"impact-{self.selected_finding}-{self.cur_timestep}",
                )
                self.findings[self.selected_finding].likelihood = st.selectbox(
                    "Likelihood",
                    range(len(self.likelihood_levels)),
                    format_func=lambda x: self.likelihood_levels[x],
                    index=self.findings[self.selected_finding].likelihood,
                    key=f"likelihood-{self.selected_finding}-{self.cur_timestep}",
                )
                with st.expander("CVSS", expanded=False):
                    fix_str_error = lambda x: x if x else None
                    col1, col2 = st.columns(2)
                    for i, (part, details) in enumerate(CVSS_SECTIONS.items()):
                        sel_col = col1 if i % 2 == 0 else col2
                        self.findings[self.selected_finding].cvss_vector[part] = (
                            sel_col.segmented_control(
                                f"{details['name']} ({part})",
                                list(details["values"].keys()),
                                format_func=lambda x: details["values"][x],
                                key=f"cvss-{part}-{self.selected_finding}-{self.cur_timestep}",
                                default=fix_str_error(
                                    self.findings[
                                        self.selected_finding
                                    ].cvss_vector.get(part)
                                ),
                                width="stretch",
                                help=details.get("help", ""),
                            )
                        )
                with st.expander("Scope", expanded=False):
                    for i, machine in enumerate(
                        self.findings[self.selected_finding].scope
                    ):
                        col1, col2, col3 = st.columns(
                            [1, 2, 0.5], vertical_alignment="bottom"
                        )
                        machine.ip = col1.text_input(
                            f"IP Address",
                            label_visibility="collapsed" if i > 0 else "visible",
                            value=machine.ip,
                            placeholder="10.10.10.10",
                            key=f"machine-ip-{self.selected_finding}-{i}-{self.cur_timestep}",
                        )
                        machine.name = col2.text_input(
                            f"Machine Name",
                            label_visibility="collapsed" if i > 0 else "visible",
                            value=machine.name,
                            placeholder="hostname.domain.local",
                            key=f"machine-name-{self.selected_finding}-{i}-{self.cur_timestep}",
                        )
                        if col3.button(
                            "",
                            icon=":material/remove:",
                            key=f"machine-remove-{self.selected_finding}-{i}-{self.cur_timestep}",
                        ):
                            self.findings[self.selected_finding].scope.pop(i)
                            return True
                        for j, service in enumerate(machine.services):
                            scol1, scol2, scol3, scol4 = st.columns(
                                [1, 1, 1, 0.5], vertical_alignment="bottom"
                            )
                            machine.services[j]["name"] = scol2.text_input(
                                f"Service Name",
                                label_visibility="collapsed" if j > 0 else "visible",
                                value=service["name"],
                                placeholder="HTTP",
                                key=f"service-name-{self.selected_finding}-{i}-{j}-{self.cur_timestep}",
                            )
                            machine.services[j]["port"] = scol3.text_input(
                                f"Port",
                                label_visibility="collapsed" if j > 0 else "visible",
                                value=service["port"],
                                placeholder="TCP/80",
                                key=f"service-port-{self.selected_finding}-{i}-{j}-{self.cur_timestep}",
                            )
                            if scol4.button(
                                "",
                                icon=":material/remove:",
                                key=f"service-remove-{self.selected_finding}-{i}-{j}-{self.cur_timestep}",
                            ):
                                machine.services.pop(j)
                                self.findings[self.selected_finding].scope[i] = machine
                                self.update_timestep()
                                return True
                        col1, col2, col3 = st.columns([1, 2, 0.5])
                        if col2.button(
                            ":material/add: Add service",
                            key=f"add-service-{self.selected_finding}-{i}-{self.cur_timestep}",
                        ):
                            machine.services.append({"name": "", "port": ""})
                            self.findings[self.selected_finding].scope[i] = machine
                            return True
                        self.findings[self.selected_finding].scope[i] = machine
                    if st.button(
                        "Add machine",
                        icon=":material/add:",
                        key=f"add-machine-{self.selected_finding}-{self.cur_timestep}",
                    ):
                        self.findings[self.selected_finding].scope.append(
                            MachineScope()
                        )
                        return True
                self.findings[self.selected_finding].description = st.text_area(
                    "Description",
                    value=self.findings[self.selected_finding].description,
                    key=f"description-{self.selected_finding}-{self.cur_timestep}",
                )
                self.findings[self.selected_finding].business_impact = st.text_area(
                    "Business Impact",
                    value=self.findings[self.selected_finding].business_impact,
                    key=f"business-impact-{self.selected_finding}-{self.cur_timestep}",
                )
                self.findings[self.selected_finding].mitre_techniques = st.multiselect(
                    "Select MITRE Techniques",
                    list(self.mitre_id_to_name.keys()),
                    default=self.findings[self.selected_finding].mitre_techniques,
                    format_func=lambda tid: f"{tid} - {self.mitre_id_to_name.get(tid, '')}",
                    key=f"mitre-techniques-{self.selected_finding}-{self.cur_timestep}",
                )
                with st.expander("Exploit Details", expanded=False):
                    self.findings[self.selected_finding].exploit_details_raw = (
                        st.toggle(
                            "Raw LaTeX Mode",
                            value=self.findings[
                                self.selected_finding
                            ].exploit_details_raw,
                            key=f"exploit-details-raw-toggle-{self.selected_finding}-{self.cur_timestep}",
                        )
                    )
                    if self.findings[self.selected_finding].exploit_details_raw:
                        if isinstance(
                            self.findings[self.selected_finding].exploit_details, list
                        ):
                            self.findings[self.selected_finding].exploit_details = (
                                "\n".join(
                                    self.findings[self.selected_finding].exploit_details
                                )
                            )
                        self.findings[self.selected_finding].exploit_details = (
                            st.text_area(
                                "Exploit Details",
                                value=self.findings[
                                    self.selected_finding
                                ].exploit_details,
                                key=f"exploit-details-area-{self.selected_finding}-{self.cur_timestep}",
                            )
                        )
                    else:
                        if isinstance(
                            self.findings[self.selected_finding].exploit_details, str
                        ):
                            self.findings[self.selected_finding].exploit_details = (
                                self.findings[
                                    self.selected_finding
                                ].exploit_details.splitlines()
                            )
                        for i, detail in enumerate(
                            self.findings[self.selected_finding].exploit_details
                        ):
                            detail_area_col, detail_remove_col = st.columns(
                                [5, 0.5], vertical_alignment="top"
                            )
                            new_detail = detail_area_col.text_area(
                                f"Detail {i+1}",
                                label_visibility="collapsed",
                                value=detail,
                                key=f"exploit-detail-{self.selected_finding}-{i}-{self.cur_timestep}",
                            )
                            self.findings[self.selected_finding].exploit_details[
                                i
                            ] = new_detail
                            if detail_remove_col.button(
                                "",
                                icon=":material/remove:",
                                key=f"exploit-detail-remove-{self.selected_finding}-{i}-{self.cur_timestep}",
                            ):
                                self.findings[
                                    self.selected_finding
                                ].exploit_details.pop(i)
                                self.update_timestep()
                                return True
                        if st.button(
                            "Add Step",
                            icon=":material/add:",
                            key=f"add-step-{self.selected_finding}-{self.cur_timestep}",
                        ):
                            self.findings[self.selected_finding].exploit_details.append(
                                ""
                            )
                            return True
                self.findings[self.selected_finding].remediation = st.text_area(
                    "Remediation",
                    value=self.findings[self.selected_finding].remediation,
                    key=f"remediation-{self.selected_finding}-{self.cur_timestep}",
                )
                with st.expander("References", expanded=False):
                    ref_name_col, ref_url_col, ref_remove_col = st.columns([2, 2, 1])
                    for i, ref in enumerate(
                        self.findings[self.selected_finding].references
                    ):
                        with ref_name_col:
                            new_ref_name = st.text_input(
                                f"Reference Name {i+1}",
                                label_visibility="collapsed",
                                placeholder="Example Reference",
                                value=ref.get("name", ""),
                                key=f"ref_name-{self.selected_finding}-{i}-{self.cur_timestep}",
                            )
                            self.findings[self.selected_finding].references[i][
                                "name"
                            ] = new_ref_name
                        with ref_url_col:
                            new_ref_url = st.text_input(
                                f"Reference {i+1}",
                                label_visibility="collapsed",
                                placeholder="https://example.com",
                                value=ref.get("url", ""),
                                key=f"ref_url-{self.selected_finding}-{i}-{self.cur_timestep}",
                            )
                            self.findings[self.selected_finding].references[i][
                                "url"
                            ] = new_ref_url
                        with ref_remove_col:
                            if st.button(
                                "",
                                icon=":material/remove:",
                                key=f"remove_ref-{self.selected_finding}-{i}-{self.cur_timestep}",
                            ):
                                self.findings[self.selected_finding].references.pop(i)
                                self.update_timestep()
                                return True
                    if st.button(
                        "Add Reference",
                        icon=":material/add:",
                        key=f"add-reference-{self.selected_finding}-{self.cur_timestep}",
                    ):
                        self.findings[self.selected_finding].references.append(
                            {"name": "", "url": ""}
                        )
                        return True
                col1, col2 = st.columns(2)
                if col1.button(
                    "Save All Findings",
                    use_container_width=True,
                    key=f"save-all-findings-bottom-{self.cur_timestep}",
                ):
                    self.save_findings()
                if col2.button(
                    "Generate PDF for Current Finding",
                    use_container_width=True,
                    key=f"generate-pdf-bottom-{self.cur_timestep}",
                ):
                    self.generate_pdf()
        with pdf_preview:
            col1, col2 = st.columns(2)
            if col1.button(
                "Save All Findings",
                use_container_width=True,
                key=f"save-all-findings-{self.cur_timestep}",
            ):
                self.save_findings()
            if col2.button(
                "Generate PDF for Current Finding",
                use_container_width=True,
                key=f"generate-pdf-{self.cur_timestep}",
            ):
                self.generate_pdf()
            if len(self.findings) > 0:
                output_pdf_path = os.path.join(
                    self.vuln_pdfs_dir,
                    f"{self.findings[self.selected_finding].id}.pdf",
                )
                if os.path.exists(output_pdf_path):
                    pdf_viewer(
                        output_pdf_path,
                        key=f"pdf-viewer-{self.selected_finding}-{self.cur_timestep}",
                    )
        return rerun


if __name__ == "__main__":
    if "report_gui" not in st.session_state:
        st.session_state["report_gui"] = ReportWriterGUI()
    report_gui = st.session_state["report_gui"]
    require_rerun = report_gui.render()
    st.session_state["report_gui"] = report_gui
    if require_rerun:
        st.rerun()
