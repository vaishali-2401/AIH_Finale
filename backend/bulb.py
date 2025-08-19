import json
import os
import google.generativeai as genai

import json
import os
import google.generativeai as genai

def generate_insights_from_file(jsonl_filepath: str, model):
    """
    Reads a JSONL file to get the original query and retrieved chunks,
    generates an insight, and returns it as a string.
    """
    try:
        with open(jsonl_filepath, 'r') as f:
            # 1. Read the first line to get the original query
            first_line = f.readline()
            if not first_line:
                print("Error: The results file is empty.")
                return None
            selected_text = json.loads(first_line)['original_query']
            
            # 2. Read the rest of the lines for the search results
            retrieved_chunks = [json.loads(line) for line in f]
            
    except (FileNotFoundError, json.JSONDecodeError, KeyError) as e:
        print(f"Error reading or parsing '{jsonl_filepath}': {e}")
        return None # Return None on error

    # 3. Format the retrieved chunks for the prompt
    formatted_chunks = "\n".join([f"- {chunk['document']}" for chunk in retrieved_chunks])

    prompt = f"""
    You are a research assistant. Compare the [Original Text] with the following [Retrieved Chunks].
    Identify and summarize any overlapping ideas, contradictory viewpoints, or illustrative examples.
    Ground your answer only in the provided texts.

    **Original Text:**
    "{selected_text}"

    **Retrieved Chunks:**
    {formatted_chunks}
    """

    print("\n--- Sending Prompt to Gemini for Analysis ---")
    try:
        # 4. Call the LLM and return the result
        response = model.generate_content(prompt)
        return response.text.strip()
    except Exception as e:
        print(f"An error occurred while calling the Gemini API: {e}")
        return None