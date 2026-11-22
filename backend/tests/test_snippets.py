from app.services.pdf_processing import process_pdf
from app.services.snippets import focus
from tests.conftest import make_pdf

TEXT = (
    "• Marc Chagall Museum: Explore the works of Chagall. "
    "• Parc Phoenix: Botanical gardens. "
    "• Chez Pipo (Nice): Famous for its socca, a chickpea pancake. "
    "• Le Panier: A casual eatery in Marseille."
)


def rect(page, start, end):
    return {"page": page, "x0": 0.1, "y0": 0.1, "x1": 0.9, "y1": 0.2, "start": start, "end": end}


def test_snippet_centres_on_the_matching_sentence():
    result = focus(TEXT, [], "Where can I eat socca in Nice?", limit=80)
    assert "Chez Pipo" in result.snippet
    assert result.snippet.startswith("…")  # earlier sentences were skipped


def test_whole_text_when_short_enough():
    result = focus("Socca is a pancake.", [], "socca")
    assert result.snippet == "Socca is a pancake."


def test_no_lexical_overlap_shows_the_start():
    result = focus(TEXT, [], "quantum chromodynamics", limit=40)
    assert result.snippet.startswith("• Marc Chagall")


def test_only_rectangles_covering_the_match_are_kept():
    pipo = TEXT.index("Chez Pipo")
    pipo_end = TEXT.index("pancake.") + len("pancake.")
    rects = [
        rect(1, 0, 50),
        rect(1, 51, pipo - 3),
        rect(2, pipo - 2, pipo_end),
        rect(3, pipo_end + 1, len(TEXT)),
    ]
    result = focus(TEXT, rects, "socca in Nice")
    assert [r["page"] for r in result.rects] == [2]
    assert "start" not in result.rects[0]  # internal offsets are not exposed


def test_rectangles_without_offsets_are_all_kept():
    rects = [{**rect(1, -1, -1)}, {**rect(2, -1, -1)}]
    assert len(focus(TEXT, rects, "socca").rects) == 2


def test_processed_chunks_record_offsets_that_match_the_text(sample_pdfs):
    for chunk in process_pdf(sample_pdfs["travel"], "travel").chunks:
        for r in chunk.rects:
            assert 0 <= r["start"] < r["end"] <= len(chunk.text)
        # The first rectangle's text starts the chunk.
        assert chunk.rects[0]["start"] == 0


def test_long_single_block_pieces_have_unknown_offsets(tmp_path):
    long_paragraph = "Lavender fields bloom across the plateau every summer. " * 90
    path = make_pdf(tmp_path / "long.pdf", "Long", [("Lavender", [long_paragraph])])
    chunks = process_pdf(path, "long").chunks
    assert all(r["start"] == -1 for c in chunks for r in c.rects if c.text.count("Lavender") > 30)
