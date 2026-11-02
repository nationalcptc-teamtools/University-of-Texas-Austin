import json
import os
import sys
import requests

PRIMARY_URL = "https://raw.githubusercontent.com/mitre/cti/master/enterprise-attack/enterprise-attack.json"
OUTFILE = "mitre_techniques.json"


def download_json(url: str, timeout: int = 30) -> dict:
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    return resp.json()


def find_external_id_and_url(
    ext_refs: list[dict],
) -> tuple[str | None, str | None]:
    tid = None
    url = None
    for ref in ext_refs:
        if (
            "external_id" in ref
            and isinstance(ref["external_id"], str)
            and ref["external_id"].upper().startswith("T")
        ):
            tid = ref["external_id"].upper()
            url = ref.get("url")
            break
    if not tid:
        for ref in ext_refs:
            for v in ref.values():
                if isinstance(v, str) and v.upper().startswith("T"):
                    tid = v.upper()
                    url = ref.get("url")
                    break
            if tid:
                break
    return tid, url


def extract_techniques(stix_data: dict) -> list[dict[str, str]]:
    out = []
    objs = stix_data.get("objects", [])
    for obj in objs:
        if obj.get("type") != "attack-pattern":
            continue
        name = obj.get("name")
        ext_refs = obj.get("external_references", []) or []
        tid, ref_url = find_external_id_and_url(ext_refs)
        if obj.get("revoked") is True:
            continue
        if obj.get("x_mitre_deprecated") is True:
            continue
        if not tid:
            tid = obj.get("external_id") or obj.get("id") or obj.get("x_mitre_id")
            if isinstance(tid, str) and not tid.upper().startswith("T"):
                tid = None
        if not tid:
            continue
        if not ref_url:
            ref_url = f"https://attack.mitre.org/techniques/{tid}/"
        out.append({"id": tid, "name": name or "", "url": ref_url})
    seen = set()
    unique = []
    for item in out:
        if item["id"] in seen:
            continue
        seen.add(item["id"])
        unique.append(item)

    def sort_key(it):
        return it["id"]

    unique.sort(key=sort_key)
    return unique


def main():
    try:
        print(f"Downloading STIX JSON from: {PRIMARY_URL}")
        stix = download_json(PRIMARY_URL)
        print("Downloaded successfully.")
    except Exception as e:
        print(f"Error downloading from primary URL: {e}")
        sys.exit(1)
    print("Extracting techniques...")
    techniques = extract_techniques(stix)
    print(f"Extracted {len(techniques)} techniques.")
    out_path = os.path.abspath(OUTFILE)
    with open(OUTFILE, "w", encoding="utf-8") as f:
        json.dump(techniques, f, indent=2)
    print(f"Wrote {len(techniques)} entries to {out_path}")


if __name__ == "__main__":
    main()
