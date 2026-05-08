"""Audit and safely refresh NSTC past-paper question data.

This script compares the current shared question data against the local NSTC
PDFs, writes human and machine-readable audit reports, and can apply a
conservative PDF-derived refresh to the shared JSON files.

It intentionally reuses the existing PDF extraction primitives from
rebuild_content_from_public.py, but keeps the audit/apply workflow separate so
the report can be reviewed before mutating site data.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import re
import shutil
import sys
from copy import deepcopy
from dataclasses import dataclass
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import fitz
from PIL import Image


ROOT = Path(__file__).resolve().parents[1]
DATA_DIR = ROOT / "src" / "data"
PUBLIC_DIR = ROOT / "public"
REPORT_DIR = ROOT / "reports"
TMP_RENDER_DIR = ROOT / "tmp" / "pdfs" / "nstc-audit"
REBUILD_SCRIPT = ROOT / "scripts" / "rebuild_content_from_public.py"
QUESTION_STATUSES = {"verified", "corrected", "missing", "extra", "needs-human-review"}
PRIVATE_GLYPH_MAP = {
    "\uf020": " ",
    "\uf02b": "+",
    "\uf02e": ".",
    "\uf03d": "=",
    "\uf044": "Delta",
    "\uf057": "Omega",
    "\uf070": "pi",
    "\uf0a5": "infinity",
    "\uf0b4": "x",
    "\uf0d0": "angle",
}
MANUAL_FIGURE_CLIPS: dict[tuple[str, int], tuple[int, tuple[float, float, float, float]]] = {
    ("chemistry-2022-final-chemistry-2022-b9f5031", 52): (7, (100, 130, 555, 425)),
    ("physics-2022-final-physics-2022-b4137e5", 21): (4, (72, 92, 572, 216)),
    ("physics-2022-final-physics-2022-b4137e5", 22): (4, (72, 230, 572, 380)),
    ("physics-2022-final-physics-2022-b4137e5", 23): (4, (72, 395, 572, 548)),
    ("physics-2022-final-physics-2022-b4137e5", 28): (5, (370, 117, 572, 207)),
    ("physics-2022-final-physics-2022-b4137e5", 35): (5, (445, 676, 572, 751)),
    ("physics-2022-final-physics-2022-b4137e5", 37): (6, (392, 139, 565, 278)),
    ("physics-2022-final-physics-2022-b4137e5", 39): (6, (378, 453, 572, 520)),
    ("physics-2022-final-physics-2022-b4137e5", 50): (7, (445, 511, 572, 595)),
    ("physics-2022-final-physics-2022-b4137e5", 61): (9, (292, 220, 572, 337)),
    ("physics-2022-final-physics-2022-b4137e5", 63): (9, (356, 428, 572, 524)),
    ("physics-2023-final-physics-2023-ac5a924", 25): (4, (392, 287, 552, 379)),
    ("physics-2023-final-physics-2023-ac5a924", 27): (4, (36, 452, 552, 523)),
    ("physics-2023-final-physics-2023-ac5a924", 28): (4, (36, 523, 552, 602)),
    ("physics-2023-final-physics-2023-ac5a924", 31): (4, (405, 706, 552, 762)),
    ("physics-2023-final-physics-2023-ac5a924", 35): (5, (348, 211, 552, 269)),
    ("physics-2023-final-physics-2023-ac5a924", 37): (5, (120, 405, 455, 500)),
    ("physics-2023-final-physics-2023-ac5a924", 40): (6, (405, 38, 552, 122)),
    ("physics-2023-final-physics-2023-ac5a924", 67): (8, (455, 592, 552, 666)),
}

def load_rebuild_module() -> Any:
    spec = importlib.util.spec_from_file_location("rebuild_content_from_public", REBUILD_SCRIPT)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Unable to load {REBUILD_SCRIPT}")
    module = importlib.util.module_from_spec(spec)
    sys.modules[spec.name] = module
    spec.loader.exec_module(module)
    return module


REBUILD = load_rebuild_module()


@dataclass
class AuditOptions:
    report_only: bool
    apply: bool
    force: bool
    render_pages: bool
    no_ocr: bool


def read_json(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path: Path, data: Any) -> None:
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def compact(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def replace_private_glyphs(text: str) -> str:
    for old, new in PRIVATE_GLYPH_MAP.items():
        text = text.replace(old, new)
    return text


def replace_question_markers(text: str) -> str:
    return re.sub(r"@@Q0*(\d+)@@", lambda match: str(int(match.group(1))), text)


def trim_embedded_tail(text: str) -> str:
    text = re.split(r"\s+(?:={6,}|-{6,})", text, maxsplit=1)[0]
    text = re.split(r"\s+Part\s+III\s*[:\-]", text, maxsplit=1, flags=re.I)[0]
    text = re.split(r"\s+Part\s+II\s*[–-]\s*(?:BIOLOGY|CHEMISTRY|MATHEMATICS|PHYSICS)\b", text, maxsplit=1, flags=re.I)[0]
    text = re.split(r"\s+----?\s*End\s+of\s+paper", text, maxsplit=1, flags=re.I)[0]
    return text


def trim_descriptive_answer_leakage(text: str) -> str:
    match = re.search(r"\bAnswer\s*:", text, re.I)
    if not match:
        return text
    prefix = text[: match.end()]
    suffix = text[match.end() :]
    suffix = re.split(r"\s+(?=(?:[2-9]\d|[1-9])\s+[A-Z][\s\S]{0,240}?\s+\(a\))", suffix, maxsplit=1)[0]
    return prefix + suffix


def normalize_scientific_notation(text: str) -> str:
    text = re.sub(r"\b(\d)\.\s+(\d)(?=\b|\s*(?:[x×]|mL|M|atm|J|C|cm|mol|$))", r"\1.\2", text)
    text = re.sub(r"(\))\s+(\d)\b", r"\1\2", text)
    return re.sub(r"\b(\d+(?:\.\d+)?)\s*[x×]\s*10\s*([+-]?\d{1,2})\b", r"\1 x 10^\2", text)


def clean_option_text(text: str) -> str:
    text = replace_private_glyphs(text)
    text = trim_embedded_tail(text)
    text = re.sub(r"^\s*\(?[a-dA-D]\)\s+", "", text)
    text = re.sub(r"\s+\b(?:BIOLOGY|CHEMISTRY|MATHEMATICS|PHYSICS)\b\s*$", "", text, flags=re.I)
    text = re.sub(r"\s+\bPART\s+II\b.*$", "", text, flags=re.I)
    text = replace_question_markers(text)
    text = normalize_scientific_notation(text)
    # If a later question was flattened into option D, trim at the next
    # question-like run. Limit this to long options so values like 1.2 x 10^5
    # survive marker replacement.
    if len(text) > 140:
        text = re.split(r"\s+(?=\d{2}\s+.{8,}?\s+\(a\))", text, maxsplit=1)[0]
        text = re.split(r"\s+(?=Question\s+(?:No\.?\s*)?\d+\s*[:.])", text, maxsplit=1, flags=re.I)[0]
    text = re.sub(r"[\s;,.]+$", "", text)
    return compact(text.strip())


def clean_prompt_text(text: str) -> str:
    text = replace_private_glyphs(text)
    text = trim_embedded_tail(text)
    text = replace_question_markers(text)
    text = trim_descriptive_answer_leakage(text)
    text = normalize_scientific_notation(text)
    text = re.sub(r"\s+\b(?:BIOLOGY|CHEMISTRY|MATHEMATICS|PHYSICS)\b\s*$", "", text, flags=re.I)
    text = compact(text)
    fraction_match = re.fullmatch(r"(\d)(\d)\s+\1(\d)\s+is equal to", text)
    if fraction_match:
        base, top, bottom = fraction_match.groups()
        return f"{base}^{top} / {base}^{bottom} is equal to"
    return text


def normalize_option_group(options: list[str]) -> list[str]:
    if len(options) == 4 and not any(compact(option) for option in options[:3]) and compact(options[3]):
        parts = [compact(part) for part in re.split(r"(?<=\.)\s+", compact(options[3])) if compact(part)]
        if len(parts) >= 4:
            return [*parts[:3], compact(" ".join(parts[3:]))]
    return options


def has_extraction_artifact(question: dict[str, Any]) -> bool:
    joined = f"{question.get('prompt', '')} {' '.join(question.get('options', []))}"
    artifact_patterns = [
        r"@@Q\d+@@",
        r"@@PAGE\d+@@",
        r"\b(?:BIOLOGY|CHEMISTRY|MATHEMATICS|PHYSICS)\b\s*$",
        r"\bPART\s+(?:II|III)\b",
        r"End\s+of\s+paper",
        r"={6,}",
        r"[\uf000-\uf8ff]",
    ]
    return any(re.search(pattern, joined, re.I) for pattern in artifact_patterns)


def text_equal(left: str, right: str) -> bool:
    return compact(left) == compact(right)


def stable_question_key(question: dict[str, Any]) -> tuple[str, str, int, str]:
    return (
        str(question.get("paperId", "")),
        str(question.get("section", "")),
        int(question.get("number", 0) or 0),
        str(question.get("displayNumber", "")),
    )


def local_public_path(url: str | None) -> Path | None:
    if not url:
        return None
    return PUBLIC_DIR / url.lstrip("/")


def ensure_page_renders(paper: dict[str, Any]) -> list[str]:
    pdf_path = local_public_path(paper.get("resourceUrl"))
    if not pdf_path or not pdf_path.exists():
        return []
    out_dir = TMP_RENDER_DIR / paper["id"]
    out_dir.mkdir(parents=True, exist_ok=True)
    rendered: list[str] = []
    with fitz.open(str(pdf_path)) as doc:
        for index, page in enumerate(doc, 1):
            out = out_dir / f"page-{index}.png"
            if not out.exists():
                pix = page.get_pixmap(matrix=fitz.Matrix(2, 2), alpha=False)
                pix.save(str(out))
            rendered.append(str(out.relative_to(ROOT)))
    return rendered


def figure_exists(question: dict[str, Any]) -> bool:
    figure = question.get("figure")
    if not figure:
        return True
    path = local_public_path(str(figure))
    return bool(path and path.exists())


def figure_dimensions(question: dict[str, Any]) -> dict[str, int] | None:
    figure = question.get("figure")
    path = local_public_path(str(figure)) if figure else None
    if not path or not path.exists():
        return None
    try:
        with Image.open(path) as image:
            return {"width": image.width, "height": image.height}
    except Exception:
        return None


def apply_manual_figure_override(paper: dict[str, Any], question: dict[str, Any]) -> None:
    key = (str(question.get("paperId", "")), int(question.get("number", 0) or 0))
    override = MANUAL_FIGURE_CLIPS.get(key)
    if not override:
        return
    pdf_path = local_public_path(paper.get("resourceUrl"))
    if not pdf_path or not pdf_path.exists():
        return
    page_number, clip = override
    out_dir = PUBLIC_DIR / "paper-assets" / str(question["paperId"]) / "figures"
    out_dir.mkdir(parents=True, exist_ok=True)
    out_path = out_dir / f"q{question['number']}-p{page_number}-manual.webp"
    with fitz.open(str(pdf_path)) as document:
        if not 1 <= page_number <= len(document):
            return
        pixmap = document[page_number - 1].get_pixmap(matrix=fitz.Matrix(2, 2), clip=fitz.Rect(*clip), alpha=False)
        image = Image.frombytes("RGB", (pixmap.width, pixmap.height), pixmap.samples)
        image.save(out_path, "WEBP", quality=86, method=6)
    question["page"] = page_number
    question["figure"] = "/" + out_path.relative_to(PUBLIC_DIR).as_posix()


def looks_like_diagram_prompt(prompt: str) -> bool:
    return bool(
        re.search(r"\b(diagram|figure|graph|shown\s+(?:above|below)|circuit\s+diagram|following\s+(?:diagram|figure|graph|circuit|structure))\b", prompt, re.I)
    )


def remove_scanner_noise(text: str) -> str:
    text = replace_private_glyphs(text)
    text = re.sub(r"\b(?:Physics|Chemistry|Mathematics|Biology)\s+Page\s+\d+\s+of\s+\d+", " ", text, flags=re.I)
    text = re.sub(r"Name:_+\s*Roll No:_+", " ", text, flags=re.I)
    text = re.sub(r"\d{1,2}/\d{2}\s*\d{1,2}:\d{2}\s*CamScanner", " ", text, flags=re.I)
    text = re.sub(r"@@PAGE\d{2}@@", " ", text)
    return compact(text.replace("", " "))


def split_descriptive_prompt(question: dict[str, Any]) -> list[dict[str, Any]]:
    prompt = remove_scanner_noise(str(question.get("prompt", "")))
    if len(prompt) < 40:
        return []

    pattern = re.compile(r"(Question\s+(?:No\.?\s*)?(\d{1,2})\s*[:：])", re.I)
    matches = list(pattern.finditer(prompt))
    if not matches:
        return [question]

    # Drop solved example material when the section starts with instructions and
    # later repeats Question 1 as the actual first question.
    start_index = 0
    duplicate_q1 = [index for index, match in enumerate(matches) if int(match.group(2)) == 1]
    if "solved example" in prompt[: matches[0].start()].lower() or (len(duplicate_q1) > 1 and "solved example" in prompt[: matches[duplicate_q1[1]].start()].lower()):
        start_index = duplicate_q1[-1] if duplicate_q1 else 0

    split_questions: list[dict[str, Any]] = []
    active_matches = matches[start_index:]
    for index, match in enumerate(active_matches):
        number = int(match.group(2))
        end = active_matches[index + 1].start() if index + 1 < len(active_matches) else len(prompt)
        body = clean_prompt_text(prompt[match.start() : end])
        if len(body) < 20:
            continue
        item = deepcopy(question)
        item["id"] = f"{question['paperId']}-part-iii-{number}"
        item["number"] = number
        item["displayNumber"] = f"Descriptive {number}"
        item["prompt"] = body
        item["options"] = []
        item["answer"] = None
        item["solution"] = ""
        item["page"] = question.get("page")
        item["figure"] = question.get("figure", "")
        split_questions.append(item)
    return split_questions or [question]


def normalize_candidate_questions(paper: dict[str, Any], questions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    normalized: list[dict[str, Any]] = []
    for question in questions:
        question = deepcopy(question)
        raw_prompt = remove_scanner_noise(str(question.get("prompt", "")))
        question["prompt"] = raw_prompt if question.get("type") == "Long" else clean_prompt_text(raw_prompt)
        question["options"] = normalize_option_group([clean_option_text(remove_scanner_noise(str(option))) for option in question.get("options", [])])
        question.setdefault("paperSubject", paper["subject"])
        question.setdefault("displayNumber", str(question.get("number", "")))
        question.setdefault("answer", None)
        question.setdefault("solution", "")
        question.setdefault("figure", "")
        apply_manual_figure_override(paper, question)
        if question.get("type") == "Long":
            normalized.extend(split_descriptive_prompt(question))
        else:
            normalized.append(question)

    REBUILD.ensure_unique_ids(normalized)
    normalized.sort(key=lambda item: (str(item.get("section", "")), int(item.get("number", 0) or 0), str(item.get("displayNumber", ""))))
    return normalized


def parse_pdf_questions(paper: dict[str, Any], no_ocr: bool) -> list[dict[str, Any]]:
    if no_ocr and (paper.get("scanned") or str(paper.get("resourceUrl", "")).startswith("/resources/past-papers-4/")):
        return []
    extracted = REBUILD.parse_paper(deepcopy(paper))
    return normalize_candidate_questions(paper, extracted)


def question_delta_status(current: dict[str, Any] | None, candidate: dict[str, Any] | None) -> tuple[str, list[str]]:
    if current is None and candidate is None:
        return "needs-human-review", ["No current or PDF-derived question record exists."]
    if current is None:
        return "missing", ["Question exists in PDF-derived extraction but not current data."]
    if candidate is None:
        return "extra", ["Question exists in current data but not PDF-derived extraction."]

    reasons: list[str] = []
    if not text_equal(str(current.get("prompt", "")), str(candidate.get("prompt", ""))):
        reasons.append("Prompt text differs from PDF-derived extraction.")
    if [compact(str(option)) for option in current.get("options", [])] != [compact(str(option)) for option in candidate.get("options", [])]:
        reasons.append("Option choices differ from PDF-derived extraction.")
    if current.get("type") == "MCQ" and len(current.get("options", [])) != 4:
        reasons.append("Current MCQ does not have exactly four options.")
    if candidate.get("type") == "MCQ" and len(candidate.get("options", [])) != 4:
        reasons.append("PDF-derived MCQ does not have exactly four options.")
    if candidate.get("type") == "MCQ" and any(not compact(str(option)) for option in candidate.get("options", [])) and not candidate.get("figure"):
        reasons.append("PDF-derived MCQ has blank visual options without a figure crop.")
    if current.get("figure") != candidate.get("figure"):
        reasons.append("Figure attachment differs from PDF-derived extraction.")
    if not figure_exists(candidate):
        reasons.append("PDF-derived figure path is missing on disk.")
    if candidate.get("type") == "MCQ" and looks_like_diagram_prompt(str(candidate.get("prompt", ""))) and not candidate.get("figure"):
        reasons.append("Prompt references a visual, but no figure crop is attached.")
    if has_extraction_artifact(candidate):
        reasons.append("PDF-derived record still contains extraction artifacts.")

    return ("corrected", reasons) if reasons else ("verified", [])


def build_paper_audit(
    paper: dict[str, Any],
    current_questions: list[dict[str, Any]],
    options: AuditOptions,
) -> tuple[dict[str, Any], list[dict[str, Any]]]:
    rendered_pages = ensure_page_renders(paper) if options.render_pages else []
    candidate_questions = parse_pdf_questions(paper, options.no_ocr)

    current_by_key = {stable_question_key(question): question for question in current_questions}
    candidate_by_key = {stable_question_key(question): question for question in candidate_questions}
    all_keys = sorted(set(current_by_key) | set(candidate_by_key))
    records: list[dict[str, Any]] = []

    for key in all_keys:
        current = current_by_key.get(key)
        candidate = candidate_by_key.get(key)
        status, reasons = question_delta_status(current, candidate)
        source = candidate or current or {}
        record = {
            "paperId": paper["id"],
            "section": source.get("section", key[1]),
            "displayNumber": source.get("displayNumber", key[3]),
            "number": source.get("number", key[2]),
            "sourcePage": source.get("page"),
            "currentPrompt": current.get("prompt", "") if current else "",
            "verifiedPrompt": candidate.get("prompt", "") if candidate else "",
            "currentOptions": current.get("options", []) if current else [],
            "verifiedOptions": candidate.get("options", []) if candidate else [],
            "diagramPath": source.get("figure", ""),
            "diagramDimensions": figure_dimensions(source),
            "status": status,
            "reasons": reasons,
        }
        if record["status"] not in QUESTION_STATUSES:
            record["status"] = "needs-human-review"
        records.append(record)

    counts = {
        "currentTotal": len(current_questions),
        "verifiedTotal": len(candidate_questions),
        "currentMcq": sum(1 for question in current_questions if question.get("type") == "MCQ"),
        "verifiedMcq": sum(1 for question in candidate_questions if question.get("type") == "MCQ"),
        "currentLong": sum(1 for question in current_questions if question.get("type") == "Long"),
        "verifiedLong": sum(1 for question in candidate_questions if question.get("type") == "Long"),
        "partI": sum(1 for question in candidate_questions if question.get("section") == "Part I"),
        "partII": sum(1 for question in candidate_questions if question.get("section") == "Part II"),
        "partIII": sum(1 for question in candidate_questions if question.get("section") == "Part III"),
        "figures": sum(1 for question in candidate_questions if question.get("figure")),
        "incompleteMcqOptions": sum(1 for question in candidate_questions if question.get("type") == "MCQ" and len(question.get("options", [])) != 4),
    }

    paper_status = "verified"
    if not candidate_questions:
        paper_status = "needs-human-review"
    elif counts["verifiedMcq"] != 70 and paper["year"] < 2025:
        paper_status = "needs-human-review"
    elif any(record["status"] in {"missing", "extra", "needs-human-review"} for record in records):
        paper_status = "needs-human-review"
    elif any(record["status"] == "corrected" for record in records):
        paper_status = "corrected"

    summary = {
        "paperId": paper["id"],
        "title": paper["title"],
        "subject": paper["subject"],
        "year": paper["year"],
        "pdf": paper.get("resourceUrl"),
        "renderedPages": rendered_pages,
        "status": paper_status,
        "counts": counts,
        "statusCounts": {status: sum(1 for record in records if record["status"] == status) for status in sorted(QUESTION_STATUSES)},
    }
    return summary, candidate_questions


def preserve_existing_metadata(candidate: dict[str, Any], current: dict[str, Any] | None) -> dict[str, Any]:
    item = deepcopy(candidate)
    if current:
        item["id"] = current.get("id", item["id"])
        item["answer"] = current.get("answer", item.get("answer"))
        item["solution"] = current.get("solution", item.get("solution", ""))
    return item


def build_apply_payload(
    past_papers: list[dict[str, Any]],
    existing_questions: list[dict[str, Any]],
    candidate_by_paper: dict[str, list[dict[str, Any]]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    current_paper_questions = [question for question in existing_questions if question.get("paperId")]
    non_paper_questions = [question for question in existing_questions if not question.get("paperId")]
    current_by_key = {stable_question_key(question): question for question in current_paper_questions}

    updated_papers = deepcopy(past_papers)
    updated_questions: list[dict[str, Any]] = []

    for paper in updated_papers:
        candidates = candidate_by_paper.get(paper["id"], [])
        refreshed = [preserve_existing_metadata(candidate, current_by_key.get(stable_question_key(candidate))) for candidate in candidates]
        mcqs = [question for question in refreshed if question.get("type") == "MCQ"]
        long_questions = [question for question in refreshed if question.get("type") == "Long"]
        paper["questionCount"] = len(refreshed)
        paper["mcqCount"] = len(mcqs)
        paper["descriptiveCount"] = len(long_questions)
        paper["partICount"] = sum(1 for question in refreshed if question.get("section") == "Part I")
        paper["partIICount"] = sum(1 for question in refreshed if question.get("section") == "Part II")
        updated_questions.extend(refreshed)

    for question in non_paper_questions:
        question = deepcopy(question)
        question.setdefault("paperSubject", "")
        question.setdefault("displayNumber", str(question.get("number", "")))
        question.setdefault("section", "Resource")
        question.setdefault("sectionTitle", "Problem Set")
        updated_questions.append(question)

    REBUILD.ensure_unique_ids(updated_questions)
    updated_questions.sort(key=lambda question: (question.get("paperSubject") or question["subject"], question["year"], question["source"], question.get("section", ""), question["number"]))
    updated_papers.sort(key=lambda paper: (paper["year"], paper["subject"]))
    return updated_papers, updated_questions


def write_reports(audit: dict[str, Any]) -> None:
    REPORT_DIR.mkdir(parents=True, exist_ok=True)
    write_json(REPORT_DIR / "nstc-question-audit.json", audit)

    lines = [
        "# NSTC Question Audit",
        "",
        f"Generated: {audit['generatedAt']}",
        f"Mode: {audit['mode']}",
        f"Papers audited: {audit['summary']['papers']}",
        f"Current paper questions: {audit['summary']['currentPaperQuestions']}",
        f"PDF-derived paper questions: {audit['summary']['verifiedPaperQuestions']}",
        f"Verified records: {audit['summary']['statusCounts'].get('verified', 0)}",
        f"Corrected records: {audit['summary']['statusCounts'].get('corrected', 0)}",
        f"Missing records: {audit['summary']['statusCounts'].get('missing', 0)}",
        f"Extra records: {audit['summary']['statusCounts'].get('extra', 0)}",
        f"Needs human review: {audit['summary']['statusCounts'].get('needs-human-review', 0)}",
        "",
        "## Paper Summary",
        "",
        "| Paper | Status | Current | PDF-derived | MCQ | Long | Figures | Notes |",
        "| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |",
    ]
    for paper in audit["papers"]:
        counts = paper["counts"]
        notes = []
        if counts["incompleteMcqOptions"]:
            notes.append(f"{counts['incompleteMcqOptions']} incomplete MCQs")
        if paper["statusCounts"].get("needs-human-review"):
            notes.append(f"{paper['statusCounts']['needs-human-review']} review")
        if paper["statusCounts"].get("missing"):
            notes.append(f"{paper['statusCounts']['missing']} missing")
        if paper["statusCounts"].get("extra"):
            notes.append(f"{paper['statusCounts']['extra']} extra")
        lines.append(
            f"| {paper['title']} | {paper['status']} | {counts['currentTotal']} | {counts['verifiedTotal']} | "
            f"{counts['verifiedMcq']} | {counts['verifiedLong']} | {counts['figures']} | {', '.join(notes) or '-'} |"
        )

    lines.extend(["", "## Flagged Records", ""])
    flagged = [record for record in audit["records"] if record["status"] != "verified"]
    if not flagged:
        lines.append("No flagged records.")
    else:
        for record in flagged[:300]:
            label = f"{record['paperId']} {record['section']} {record['displayNumber']}"
            lines.append(f"- **{record['status']}** `{label}`: {'; '.join(record['reasons']) or 'No reason provided.'}")
        if len(flagged) > 300:
            lines.append(f"- ... {len(flagged) - 300} additional flagged records omitted from Markdown; see JSON report.")

    lines.extend(
        [
            "",
            "## Acceptance Notes",
            "",
            "- `verified` means current JSON matched the PDF-derived extraction after conservative whitespace normalization.",
            "- `corrected` means the PDF-derived extraction differs and can be applied if paper-level gates pass.",
            "- `needs-human-review` means automated extraction was insufficient for exhaustive acceptance.",
            "- Answer keys are intentionally left unset unless present in source data.",
        ]
    )
    (REPORT_DIR / "nstc-question-audit.md").write_text("\n".join(lines) + "\n", encoding="utf-8")


def run_audit(options: AuditOptions) -> dict[str, Any]:
    past_papers = read_json(DATA_DIR / "past-papers.json")
    existing_questions = read_json(DATA_DIR / "questions.json")
    current_by_paper: dict[str, list[dict[str, Any]]] = {}
    for question in existing_questions:
        if question.get("paperId"):
            current_by_paper.setdefault(question["paperId"], []).append(question)

    audit_papers: list[dict[str, Any]] = []
    audit_records: list[dict[str, Any]] = []
    candidate_by_paper: dict[str, list[dict[str, Any]]] = {}

    for paper in past_papers:
        summary, candidates = build_paper_audit(paper, current_by_paper.get(paper["id"], []), options)
        audit_papers.append(summary)
        candidate_by_paper[paper["id"]] = candidates
        # Rebuild records after summary call to avoid storing huge state in the
        # summary tuple. This keeps reporting deterministic and easy to inspect.
        current_questions = current_by_paper.get(paper["id"], [])
        current_by_key = {stable_question_key(question): question for question in current_questions}
        candidate_by_key = {stable_question_key(question): question for question in candidates}
        for key in sorted(set(current_by_key) | set(candidate_by_key)):
            current = current_by_key.get(key)
            candidate = candidate_by_key.get(key)
            status, reasons = question_delta_status(current, candidate)
            source = candidate or current or {}
            audit_records.append(
                {
                    "paperId": paper["id"],
                    "section": source.get("section", key[1]),
                    "displayNumber": source.get("displayNumber", key[3]),
                    "number": source.get("number", key[2]),
                    "sourcePage": source.get("page"),
                    "currentPrompt": current.get("prompt", "") if current else "",
                    "verifiedPrompt": candidate.get("prompt", "") if candidate else "",
                    "currentOptions": current.get("options", []) if current else [],
                    "verifiedOptions": candidate.get("options", []) if candidate else [],
                    "diagramPath": source.get("figure", ""),
                    "diagramDimensions": figure_dimensions(source),
                    "status": status,
                    "reasons": reasons,
                }
            )

    status_counts = {status: sum(1 for record in audit_records if record["status"] == status) for status in sorted(QUESTION_STATUSES)}
    audit = {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "mode": "apply" if options.apply else "report-only",
        "summary": {
            "papers": len(past_papers),
            "currentPaperQuestions": sum(len(items) for items in current_by_paper.values()),
            "verifiedPaperQuestions": sum(len(items) for items in candidate_by_paper.values()),
            "statusCounts": status_counts,
        },
        "papers": audit_papers,
        "records": audit_records,
    }

    write_reports(audit)

    if options.apply:
        blocking = [
            paper
            for paper in audit_papers
            if paper["status"] == "needs-human-review" or paper["counts"]["incompleteMcqOptions"] or not candidate_by_paper.get(paper["paperId"])
        ]
        if blocking and not options.force:
            blocked = ", ".join(paper["title"] for paper in blocking)
            raise SystemExit(f"Refusing --apply because these papers need review: {blocked}. Re-run with --force only after reviewing reports.")
        updated_papers, updated_questions = build_apply_payload(past_papers, existing_questions, candidate_by_paper)
        write_json(DATA_DIR / "past-papers.json", updated_papers)
        write_json(DATA_DIR / "questions.json", updated_questions)

    return audit


def parse_args() -> AuditOptions:
    parser = argparse.ArgumentParser(description="Audit local NSTC past-paper question extraction.")
    mode = parser.add_mutually_exclusive_group()
    mode.add_argument("--report-only", action="store_true", help="Write reports without changing site data.")
    mode.add_argument("--apply", action="store_true", help="Apply PDF-derived corrections to shared JSON data.")
    parser.add_argument("--force", action="store_true", help="Allow --apply even when review flags remain.")
    parser.add_argument("--render-pages", action="store_true", help="Render PDF pages to tmp/pdfs/nstc-audit for visual QA.")
    parser.add_argument("--no-ocr", action="store_true", help="Skip OCR-backed scanned paper parsing.")
    args = parser.parse_args()
    return AuditOptions(
        report_only=not args.apply,
        apply=bool(args.apply),
        force=bool(args.force),
        render_pages=bool(args.render_pages),
        no_ocr=bool(args.no_ocr),
    )


def main() -> None:
    options = parse_args()
    if options.render_pages and TMP_RENDER_DIR.exists():
        shutil.rmtree(TMP_RENDER_DIR)
    audit = run_audit(options)
    print(
        json.dumps(
            {
                "mode": audit["mode"],
                "papers": audit["summary"]["papers"],
                "currentPaperQuestions": audit["summary"]["currentPaperQuestions"],
                "verifiedPaperQuestions": audit["summary"]["verifiedPaperQuestions"],
                "statusCounts": audit["summary"]["statusCounts"],
                "reports": [
                    str((REPORT_DIR / "nstc-question-audit.md").relative_to(ROOT)),
                    str((REPORT_DIR / "nstc-question-audit.json").relative_to(ROOT)),
                ],
            },
            indent=2,
        )
    )


if __name__ == "__main__":
    main()

