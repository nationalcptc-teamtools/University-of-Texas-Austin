from dataclasses import dataclass
import os


def resolve_path(path: str) -> str:
    return os.path.abspath(os.path.join(os.path.dirname(__file__), "..", path))


class MachineScope:
    ip: str
    name: str
    services: list[dict[str, str]]

    def __init__(self, ip: str = "", name: str = ""):
        self.ip = ip
        self.name = name
        self.services = []

    def to_json(self) -> dict:
        return {
            "ip": self.ip.strip(),
            "name": self.name.strip(),
            "services": [
                {"name": svc["name"].strip(), "port": svc["port"].strip()}
                for svc in self.services
                if svc["name"].strip() and svc["port"].strip()
            ],
        }

    def from_json(self, data: dict):
        self.ip = data.get("ip", "")
        self.name = data.get("name", "")
        self.services = data.get("services", [])

    @staticmethod
    def build_from_json(data: dict) -> "MachineScope":
        instance = MachineScope()
        instance.from_json(data)
        return instance


@dataclass
class Finding:
    id: str
    title: str
    risk: int
    impact: int
    likelihood: int
    cvss_vector: dict[str, str]
    scope: list[MachineScope]
    description: str
    business_impact: str
    exploit_details: str | list[str]
    exploit_details_raw: bool
    remediation: str
    references: list[dict[str,str]]
    mitre_techniques: list[str]

    def __init__(self, id: str):
        self.id = id
        self.title = ""
        self.risk = 0
        self.impact = 0
        self.likelihood = 0
        self.cvss_vector = {
            "AV": "",
            "AC": "",
            "AT": "",
            "PR": "",
            "UI": "",
            "VC": "",
            "VI": "",
            "VA": "",
            "SC": "",
            "SI": "",
            "SA": "",
        }
        self.scope = []
        self.description = ""
        self.business_impact = ""
        self.exploit_details = [""]
        self.exploit_details_raw = False
        self.remediation = ""
        self.references = []
        self.mitre_techniques = []

    def to_json(self) -> dict:
        return {
            "title": self.title.strip(),
            "risk": self.risk + 1,
            "impact": self.impact + 1,
            "likelihood": self.likelihood + 1,
            "cvss_vector": self.cvss_vector,
            "scope": [x.to_json() for x in self.scope],
            "description": self.description.strip(),
            "business_impact": self.business_impact.strip(),
            "exploit_details": self.exploit_details,
            "remediation": self.remediation.strip(),
            "references": self.references,
            "mitre_techniques": sorted(self.mitre_techniques),
        }

    def from_json(self, data: dict):
        self.title = data.get("title", "")
        self.risk = min(data.get("risk", 1) - 1, 3)
        self.impact = min(data.get("impact", 1) - 1, 3)
        self.likelihood = min(data.get("likelihood", 1) - 1, 3)
        self.cvss_vector = data.get("cvss_vector", self.cvss_vector)
        self.scope = [
            MachineScope.build_from_json(svc) for svc in data.get("scope", [])
        ]
        self.description = data.get("description", "")
        self.business_impact = data.get("business_impact", "")
        self.exploit_details = data.get("exploit_details", [""])
        self.exploit_details_raw = isinstance(self.exploit_details, str)
        self.remediation = data.get("remediation", "")
        self.references = data.get("references", [])
        self.mitre_techniques = data.get("mitre_techniques", [])

    @staticmethod
    def build_from_json(id: str, data: dict) -> "Finding":
        instance = Finding(id)
        instance.from_json(data)
        return instance


CVSS_SECTIONS = {
    "AV": {
        "name": "Attack Vector",
        "values": {
            "N": "Network",
            "A": "Adjacent",
            "L": "Local",
            "P": "Physical",
        },
        "help": "The context by which vulnerability exploitation is possible. Network indicates 'remote exploitability' while Adjacent indicates the attacker must be on the same network segment or within proximity. Likely would be Network or Adjacent for most findings.",
    },
    "AC": {
        "name": "Attack Complexity",
        "values": {
            "L": "Low",
            "H": "High",
        },
    },
    "AT": {
        "name": "Attack Requirements",
        "values": {
            "N": "None",
            "P": "Present",
        },
    },
    "PR": {
        "name": "Privileges Required",
        "values": {
            "N": "None",
            "L": "Low",
            "H": "High",
        },
    },
    "UI": {
        "name": "User Interaction",
        "values": {
            "N": "None",
            "P": "Passive",
            "A": "Active",
        },
    },
    "VC": {
        "name": "Confidentiality",
        "values": {
            "N": "None",
            "L": "Low",
            "H": "High",
        },
    },
    "VI": {
        "name": "Integrity",
        "values": {
            "N": "None",
            "L": "Low",
            "H": "High",
        },
    },
    "VA": {
        "name": "Availability",
        "values": {
            "N": "None",
            "L": "Low",
            "H": "High",
        },
    },
    "SC": {
        "name": "Confidentiality",
        "values": {
            "N": "None",
            "L": "Low",
            "H": "High",
        },
    },
    "SI": {
        "name": "Integrity",
        "values": {
            "N": "None",
            "L": "Low",
            "H": "High",
        },
    },
    "SA": {
        "name": "Availability",
        "values": {
            "N": "None",
            "L": "Low",
            "H": "High",
        },
    },
}
