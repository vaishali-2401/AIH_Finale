from pathlib import Path

import pymupdf
import pytest

from app.services.pdf_processing import (
    PdfProcessingError,
    _clean,
    is_likely_junk,
    process_pdf,
)
from tests.conftest import TRAVEL_GUIDE, make_pdf


def test_extracts_title_outline_and_sectioned_chunks(sample_pdfs):
    result = process_pdf(sample_pdfs["travel"], fallback_title="travel")

    assert result.title == "Riviera Travel Guide"
    assert result.page_count == 1
    # The document title is not repeated in the outline; sections become H1.
    assert result.outline == [
        {"level": "H1", "title": "Beaches of Nice", "page": 1},
        {"level": "H1", "title": "Getting Around", "page": 1},
    ]

    sections = [c.section for c in result.chunks]
    assert sections == ["Beaches of Nice", "Getting Around"]
    assert "pebbles" in result.chunks[0].text
    assert "Private beach clubs" in result.chunks[0].text  # small paragraphs are merged


def test_clean_expands_ligatures_and_joins_hyphenation():
    assert _clean("Black truﬄes, ﬁne  wine and choco- late") == ("Black truffles, fine wine and chocolate")


def test_rects_are_page_fractions(sample_pdfs):
    for chunk in process_pdf(sample_pdfs["travel"], "travel").chunks:
        assert chunk.page == 1
        for rect in chunk.rects:
            assert rect["page"] == 1
            assert 0 <= rect["x0"] < rect["x1"] <= 1
            assert 0 <= rect["y0"] < rect["y1"] <= 1


def test_long_documents_are_split_into_multiple_chunks(tmp_path):
    paragraph = "Lavender fields bloom across the Valensole plateau every summer. " * 12
    path = make_pdf(tmp_path / "long.pdf", "Long Guide", [("Lavender", [paragraph] * 6)])
    result = process_pdf(path, "long")
    assert len(result.chunks) > 1
    assert result.page_count >= 2
    assert {c.section for c in result.chunks} == {"Lavender"}
    assert max(c.page for c in result.chunks) >= 2


def test_uses_embedded_table_of_contents_when_present(tmp_path):
    path = make_pdf(tmp_path / "toc.pdf", "Guide", TRAVEL_GUIDE)
    doc = pymupdf.open(path)
    doc.set_toc([[1, "Bookmark One", 1], [2, "Bookmark Two", 1]])
    doc.saveIncr()
    doc.close()
    outline = process_pdf(path, "toc").outline
    assert outline == [
        {"level": "H1", "title": "Bookmark One", "page": 1},
        {"level": "H2", "title": "Bookmark Two", "page": 1},
    ]


def test_rejects_files_without_text(tmp_path):
    doc = pymupdf.open()
    doc.new_page()
    path = tmp_path / "blank.pdf"
    doc.save(path)
    with pytest.raises(PdfProcessingError, match="no extractable text"):
        process_pdf(path, "blank")


def test_rejects_corrupt_files(tmp_path):
    path = tmp_path / "broken.pdf"
    path.write_bytes(b"%PDF-1.7 this is not really a pdf")
    with pytest.raises(PdfProcessingError):
        process_pdf(Path(path), "broken")


@pytest.mark.parametrize(
    "text, junk",
    [
        ("Page 3 of 10", True),
        ("42", True),
        ("xiv", True),
        ("March 3, 2025", True),
        ("Copyright 2024 Example Inc.", True),
        ("----", True),
        ("Beaches of Nice", False),
        ("Mild Climate", False),  # made of roman-numeral letters, but a real heading
        ("Civic Life", False),
    ],
)
def test_is_likely_junk(text, junk):
    assert is_likely_junk(text) is junk
