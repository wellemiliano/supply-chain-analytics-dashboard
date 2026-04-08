from __future__ import annotations

import json
from pathlib import Path
import xml.etree.ElementTree as ET


PROJECT_ROOT = Path(__file__).resolve().parents[1]
INPUT_CANDIDATES = [
    PROJECT_ROOT / "dados" / "dados_ficticios_supply_chain.xml",
    PROJECT_ROOT / "dados_ficticios_supply_chain.xml",
]
OUTPUT_PATH = PROJECT_ROOT / "data" / "records.json"


def resolve_input_path() -> Path:
    for path in INPUT_CANDIDATES:
        if path.exists():
            return path
    raise FileNotFoundError("XML source file not found.")


def load_records(xml_path: Path) -> list[dict[str, str]]:
    root = ET.parse(xml_path).getroot()
    records_node = root.find("records")
    if records_node is None:
        raise ValueError("Tag <records> not found.")

    rows: list[dict[str, str]] = []
    for record in records_node.findall("record"):
        row = {child.tag: (child.text or "").strip() for child in record}
        rows.append(row)
    return rows


def main() -> None:
    input_path = resolve_input_path()
    records = load_records(input_path)

    OUTPUT_PATH.parent.mkdir(parents=True, exist_ok=True)
    with OUTPUT_PATH.open("w", encoding="utf-8") as file:
        json.dump(records, file, ensure_ascii=False)

    print(f"Exported {len(records)} records to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
