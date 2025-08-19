import json
import os
import re
from pathlib import Path
import fitz  # PyMuPDF
import pymupdf4llm
from collections import Counter, defaultdict
import logging
from datetime import datetime

# Configure detailed logging to trace the script's execution.
# You can uncomment this line for debugging.
# logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

# Define constants for input and output directories.
# Auto-detect if running in Docker or locally based on environment
import sys
if getattr(sys, 'frozen', False) or os.environ.get('DOCKER_CONTAINER'):
    # Running in Docker or as frozen executable
    INPUT_DIR = Path("/app/input")
    OUTPUT_DIR = Path("/app/output")
else:
    # Running locally
    INPUT_DIR = Path("PDFs")
    OUTPUT_DIR = Path("output1a")

def is_likely_junk(text: str) -> bool:
    """
    Enhanced function to check if a string is likely a footer, page number, date, or other non-heading text.
    """
    text_clean = text.strip()
    
    # Filter out empty or very short text
    if len(text_clean) < 3:
        return True
    
    # Filter out lines that look like "Page X of Y" or just a number.
    if re.fullmatch(r'(Page\s*)?\d+(\s*of\s*\d+)?', text_clean, re.IGNORECASE):
        return True
    
    # Filter out dates in various formats
    date_patterns = [
        r'\d{1,2}[/-]\d{1,2}[/-]\d{2,4}',  # MM/DD/YYYY, MM-DD-YYYY
        r'\d{4}[/-]\d{1,2}[/-]\d{1,2}',    # YYYY/MM/DD, YYYY-MM-DD
        r'\b(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{1,2},?\s+\d{4}\b',  # Month DD, YYYY
        r'\b\d{1,2}\s+(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d{4}\b',  # DD Month YYYY
        r'\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\.?\s+\d{1,2},?\s+\d{4}\b',  # Abbreviated months
        r'^\d{4}$',  # Just a year
    ]
    
    for pattern in date_patterns:
        if re.search(pattern, text_clean, re.IGNORECASE):
            return True
    
    # Filter out copyright notices, version numbers, etc.
    if re.search(r'(copyright|©|\(c\)|version|ver\.|v\d+)', text_clean, re.IGNORECASE):
        return True
    
    # Filter out text that's mostly punctuation or special characters
    if len(re.sub(r'[^\w\s]', '', text_clean)) < len(text_clean) * 0.5:
        return True
    
    # Filter out very common junk patterns
    junk_patterns = [
        r'^\d+$',  # Just numbers
        r'^[ivxlcdm]+$',  # Roman numerals alone
        r'^[a-z]\.?$',  # Single letters
        r'^\W+$',  # Only special characters
    ]
    
    for pattern in junk_patterns:
        if re.match(pattern, text_clean.lower()):
            return True
    
    return False

def reconstruct_fragmented_text(text_blocks, same_line_threshold=3.0):
    """
    Reconstruct text that has been fragmented by PDF extraction.
    Groups text blocks that are on the same line and have the same style.
    """
    if not text_blocks:
        return []
    
    # Group by line (y-coordinate) and style
    lines = defaultdict(list)
    
    for block in text_blocks:
        # Use y-coordinate and style as grouping key
        line_key = (round(block['bbox'][1] / same_line_threshold), block['style'])
        lines[line_key].append(block)
    
    # Reconstruct text for each line
    reconstructed = []
    for (y_group, style), blocks in lines.items():
        # Sort by x-coordinate (left to right)
        blocks.sort(key=lambda b: b['bbox'][0])
        
        # Combine text intelligently - handle fragmentation better
        seen_texts = set()
        unique_parts = []
        
        for block in blocks:
            text = block['text'].strip()
            if text and text not in seen_texts:
                # Clean individual fragments first
                text = re.sub(r'(.{1,2})\1{3,}', r'\1', text)  # Remove excessive repetition
                if len(text) > 1:  # Keep only meaningful fragments
                    unique_parts.append(text)
                    seen_texts.add(text)
        
        # Smart joining - don't just concatenate, try to form proper words
        combined_text = ''
        for i, part in enumerate(unique_parts):
            if i == 0:
                combined_text = part
            else:
                # If previous text ends with an incomplete word and current starts with letters
                if (combined_text and combined_text[-1].isalpha() and 
                    part and part[0].islower() and len(combined_text.split()[-1]) < 8):
                    combined_text += part  # Join without space for word completion
                else:
                    combined_text += ' ' + part  # Normal space separation
        
        # Final cleanup
        combined_text = re.sub(r'\s+', ' ', combined_text).strip()
        combined_text = re.sub(r'\b(\w+)(\s+\1)+\b', r'\1', combined_text)  # Remove word repetition
        
        if combined_text and not is_likely_junk(combined_text) and len(combined_text) > 2:
            # Use the leftmost block's properties
            first_block = blocks[0]
            reconstructed.append({
                'text': combined_text,
                'style': style,
                'page': first_block['page'],
                'bbox': first_block['bbox'],
                'position_score': first_block['bbox'][1]  # Y-coordinate for sorting
            })
    
    return reconstructed

def analyze_document_structure(doc):
    """
    Analyze the entire document to understand its structure and determine
    appropriate font size mappings for titles and headings.
    """
    font_analysis = Counter()
    all_text_blocks = []
    
    # Collect all text with font information
    for page_num, page in enumerate(doc):
        blocks = page.get_text("dict", flags=fitz.TEXTFLAGS_TEXT)["blocks"]
        
        for block in blocks:
            if block['type'] == 0:  # Text block
                for line in block["lines"]:
                    for span in line["spans"]:
                        text = span['text'].strip()
                        if text:
                            style_key = (round(span['size']), 1 if span['flags'] & 16 else 0)
                            font_analysis[style_key] += len(text)
                            
                            all_text_blocks.append({
                                'text': text,
                                'style': style_key,
                                'page': page_num,  # Keep 0-based page numbering
                                'bbox': span['bbox']
                            })
    
    # Reconstruct fragmented text
    reconstructed_blocks = reconstruct_fragmented_text(all_text_blocks)
    
    # Determine font hierarchy
    if not font_analysis:
        return [], {}
    
    # Find body text (most common font)
    body_style = font_analysis.most_common(1)[0][0]
    body_size = body_style[0]
    
    # Create intelligent font mapping based on size relationships
    font_mapping = {}
    sorted_fonts = sorted(font_analysis.keys(), key=lambda x: x[0], reverse=True)
    
    for size, is_bold in sorted_fonts:
        if size >= body_size * 2:  # Significantly larger = document title
            font_mapping[(size, is_bold)] = "TITLE"
        elif size >= (body_size * 1.7):   # Large = H1
            font_mapping[(size, is_bold)] = "H1"
        elif size >= body_size * 1.5:   # Medium-large = H2
            font_mapping[(size, is_bold)] = "H2"
        elif size >= body_size * 1.2:   # Slightly larger = H3
            font_mapping[(size, is_bold)] = "H3"
        elif size == body_size and is_bold:  # Same size but bold = H4
            font_mapping[(size, is_bold)] = "H4"
    
    logging.info(f"Body text style: {body_style}")
    logging.info(f"Font mapping: {font_mapping}")
    
    return reconstructed_blocks, font_mapping

def is_likely_title(text, position_score, page_num, font_level):
    """
    Determine if text is likely to be a document title based on content and position.
    """
    text_lower = text.lower()
    
    # Must be on the first page or very early in the document
    if page_num > 2:
        return False
    
    # Must be in title-level font
    if font_level != "TITLE":
        return False
    
    # Position-based scoring (higher position = more likely title)
    if position_score > 300:  # Too far down the page
        return False
    
    # Content-based indicators
    title_indicators = [
        'rfp', 'request for proposal', 'proposal', 'report', 'study', 'analysis',
        'guide', 'manual', 'handbook', 'overview', 'introduction', 'summary',
        'business plan', 'strategic plan', 'white paper', 'research'
    ]
    
    # Boost score for title-like content
    content_score = sum(1 for indicator in title_indicators if indicator in text_lower)
    
    # Title should be substantial but not too long
    word_count = len(text.split())
    if word_count < 2 or word_count > 15:
        return False
    
    return content_score > 0 or position_score < 200  # Very high position

def create_text_to_page_mapping(doc, llm_content):
    """
    Create a mapping from text content to actual page numbers by analyzing both sources.
    """
    text_to_page = {}
    
    # First, extract all text blocks with their actual page numbers from PyMuPDF
    for page_num, page in enumerate(doc):
        page_text = page.get_text()
        # Split into lines and clean up
        lines = [line.strip() for line in page_text.split('\n') if line.strip()]
        
        for line in lines:
            # Store both exact match and cleaned version
            text_to_page[line.lower().strip()] = page_num
            # Also store without extra spaces and punctuation for better matching
            cleaned = re.sub(r'[^\w\s]', '', line.lower().strip())
            if cleaned:
                text_to_page[cleaned] = page_num
    
    # Also try to map based on content similarity
    llm_lines = llm_content.split('\n')
    for i, line in enumerate(llm_lines):
        line_clean = line.strip()
        if not line_clean:
            continue
            
        # Remove markdown formatting for comparison
        text_for_comparison = re.sub(r'[#*_`]', '', line_clean).strip().lower()
        
        # Try to find this text in our page mapping
        best_match_page = None
        best_similarity = 0
        
        for pdf_text, page_num in text_to_page.items():
            if text_for_comparison in pdf_text or pdf_text in text_for_comparison:
                # Calculate similarity (simple word overlap)
                text_words = set(text_for_comparison.split())
                pdf_words = set(pdf_text.split())
                if text_words and pdf_words:
                    similarity = len(text_words & pdf_words) / len(text_words | pdf_words)
                    if similarity > best_similarity:
                        best_similarity = similarity
                        best_match_page = page_num
        
        if best_match_page is not None and best_similarity > 0.3:  # Reasonable threshold
            text_to_page[text_for_comparison] = best_match_page
    
    return text_to_page

def find_page_for_text(text, text_to_page_mapping, fallback_line_num=0):
    """
    Find the actual page number for a given text using the mapping.
    """
    # Clean the text for comparison
    text_clean = re.sub(r'[#*_`]', '', text).strip().lower()
    text_no_punct = re.sub(r'[^\w\s]', '', text_clean)
    
    # Try exact match first
    if text_clean in text_to_page_mapping:
        return text_to_page_mapping[text_clean]
    
    # Try without punctuation
    if text_no_punct in text_to_page_mapping:
        return text_to_page_mapping[text_no_punct]
    
    # Try partial matches - look for text that contains our heading
    for mapped_text, page_num in text_to_page_mapping.items():
        if text_clean in mapped_text or mapped_text in text_clean:
            # Additional check for reasonable similarity
            text_words = set(text_clean.split())
            mapped_words = set(mapped_text.split())
            if text_words and mapped_words:
                similarity = len(text_words & mapped_words) / len(text_words | mapped_words)
                if similarity > 0.4:  # Good similarity threshold
                    return page_num
    
    # Fallback: estimate based on line number
    estimated_page = max(0, fallback_line_num // 35)
    return estimated_page

def extract_with_pymupdf4llm(pdf_path: Path) -> dict:
    """
    Use pymupdf4llm to extract text content with better structure understanding.
    """
    try:
        # Extract markdown-like content using pymupdf4llm
        md_text = pymupdf4llm.to_markdown(str(pdf_path))
        
        # Parse the markdown to identify potential headings
        lines = md_text.split('\n')
        potential_headings = []
        
        logging.info(f"Processing {len(lines)} lines from pymupdf4llm")
        
        for i, line in enumerate(lines):
            line = line.strip()
            if not line:
                continue
                
            # Look for markdown-style headings (#)
            if line.startswith('#'):
                level = len(line) - len(line.lstrip('#'))
                text = line.lstrip('#').strip()
                logging.info(f"Found heading candidate at line {i}: level={level}, text='{text}'")
                
                # Clean up markdown formatting
                text = re.sub(r'\*\*([^*]+)\*\*', r'\1', text)  # Remove **bold** markers
                text = re.sub(r'\s+', ' ', text)  # Normalize whitespace

                if not is_likely_junk(text) and len(text.strip()) > 0:
                    if level <= 4: # Cap at H4
                        potential_headings.append({
                            'level': min(level, 4),
                            'text': text,
                            'line_number': i
                        })
                        logging.info(f"Added markdown heading: level {level}, text '{text}'")
            
            # Look for bold text formatting (**) as headings
            elif re.match(r'^\*\*([^*]+)\*\*\s*$', line):
                bold_match = re.match(r'^\*\*([^*]+)\*\*\s*$', line)
                text = bold_match.group(1).strip()
                
                logging.info(f"Found bold text candidate at line {i}: text='{text}'")
                
                if not is_likely_junk(text) and len(text.strip()) > 2:
                    # Determine level based on content and position
                    if i < 5:  # Early lines are likely titles or main headings
                        level = 1
                    elif any(word in text.lower() for word in ['introduction', 'overview', 'guide', 'conclusion']):
                        level = 1  # Major sections
                    elif any(word in text.lower() for word in ['history', 'culture', 'attractions', 'dining', 'shopping']):
                        level = 2  # Sub-sections
                    elif len(text.split()) <= 3:  # Short titles are usually higher level
                        level = 2
                    else:
                        level = 3  # Detailed subsections
                    
                    potential_headings.append({
                        'level': level,
                        'text': text,
                        'line_number': i
                    })
                    logging.info(f"Added bold heading: level {level}, text '{text}'")
        
        logging.info(f"Total headings found: {len(potential_headings)}")
        
        return {
            'content': md_text,
            'potential_headings': potential_headings
        }
    except Exception as e:
        logging.error(f"Error with pymupdf4llm extraction: {e}")
        return {'content': '', 'potential_headings': []}

def extract_outline(pdf_path: Path) -> dict:
    """
    Core logic to perform a hybrid outline extraction from a PDF file.
    """
    document_title = ""
    outline = []

    try:
        doc = fitz.open(pdf_path)
        logging.info(f"Successfully opened '{pdf_path.name}', starting advanced analysis.")
        
        llm_data = extract_with_pymupdf4llm(pdf_path)
        
        text_to_page_mapping = create_text_to_page_mapping(doc, llm_data.get('content', ''))
        
        if not llm_data['potential_headings']:
            # Fallback for documents with no detected headings
            md_content = llm_data.get('content', '')
            lines = md_content.split('\n')
            meaningful_lines = [line for line in lines if line.strip()]
            
            if meaningful_lines:
                 # Check for a title in the first few bolded lines
                for line in lines[:10]:
                    bold_match = re.search(r'\*\*([^*]+)\*\*', line.strip())
                    if bold_match:
                        potential_title = bold_match.group(1).strip()
                        if len(potential_title.split()) >= 2 and len(potential_title) < 100:
                            document_title = potential_title
                            break
                return {"title": document_title, "outline": []}
            else:
                # Fallback to simple text extraction if pymupdf4llm fails
                page = doc[0]
                text_lines = [line.strip() for line in page.get_text().split('\n') if line.strip()]
                if text_lines:
                    document_title = text_lines[0]
                return {"title": document_title, "outline": []}

        # Build title and headings from extracted data
        title_parts = []
        main_headings = []
        
        for potential in llm_data['potential_headings']:
            text, level, line_num = potential['text'].strip(), potential['level'], potential['line_number']
            
            if not is_likely_junk(text):
                if line_num < 5 and level <= 2:
                    title_parts.append(text)
                else:
                    main_headings.append((text, level, line_num))
        
        if title_parts:
            document_title = " ".join(title_parts)
        
        # Process main headings
        for text, level, line_num in main_headings:
            if title_parts and any(part.lower() in text.lower() for part in title_parts):
                continue
                
            actual_page = find_page_for_text(text, text_to_page_mapping, line_num)
            
            level_map = {1: "H1", 2: "H2", 3: "H3", 4: "H4"}
            heading_level = level_map.get(level, "H4")
            
            outline.append({
                "level": heading_level,
                "text": text if text.endswith(" ") else text + " ",
                "page": actual_page
            })

    except Exception as e:
        logging.error(f"An unexpected error occurred while processing {pdf_path.name}: {e}", exc_info=True)
        return {"title": "", "outline": []}

    # Final sort and deduplication
    seen = set()
    unique_outline = []
    for item in outline:
        key = (item['level'], item['text'].lower().strip())
        if key not in seen:
            seen.add(key)
            unique_outline.append(item)
    
    level_order = {"H1": 1, "H2": 2, "H3": 3, "H4": 4}
    unique_outline.sort(key=lambda x: (x['page'], level_order.get(x['level'], 5)))

    logging.info(f"Finished processing '{pdf_path.name}'. Title: '{document_title}', Headings found: {len(unique_outline)}")
    return {"title": document_title, "outline": unique_outline}

def process_single_pdf(pdf_path: str | Path) -> dict:
    """
    Processes a single PDF file and returns its structured outline as a dictionary.
    """
    # FIX: Ensure pdf_path is a Path object
    pdf_path_obj = Path(pdf_path)

    logging.info(f"--- Starting processing for file: {pdf_path_obj.name} ---")
    structured_data = extract_outline(pdf_path_obj)
    return structured_data

def main():
    """
    Main orchestration function to process all PDFs in the input directory.
    """
    logging.info(f"Starting PDF processing from input directory: {INPUT_DIR}")
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    pdf_files = list(INPUT_DIR.glob("*.pdf"))
    if not pdf_files:
        logging.warning(f"No PDF files found in {INPUT_DIR}. Exiting.")
        return

    logging.info(f"Found {len(pdf_files)} PDF file(s) to process.")
    for file_path in pdf_files:
        output_filename = file_path.stem + ".json"
        output_path = OUTPUT_DIR / output_filename

        # Use the single-file processing function to get the data
        structured_data = process_single_pdf(file_path)

        # Write the returned dictionary to a JSON file
        try:
            with open(output_path, 'w', encoding='utf-8') as f:
                json.dump(structured_data, f, indent=2, ensure_ascii=False)
            logging.info(f"Successfully wrote output for '{file_path.name}' to '{output_path}'")
        except Exception as e:
            logging.error(f"Failed to write JSON for {file_path.name}: {e}")

if __name__ == "__main__":
    main()