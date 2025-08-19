import json
import os
import google.generativeai as genai
from dotenv import load_dotenv

def generate_podcast_script(results_filepath: str, bulb_filepath: str, model):
    """
    Reads context from results and bulb files to generate a two-speaker podcast script.
    """
    # 1. Read the source files
    try:
        with open(results_filepath, 'r') as f:
            # Assumes the first line is the original query
            original_query = json.loads(f.readline())['original_query']
            retrieved_chunks = [json.loads(line) for line in f]
        
        with open(bulb_filepath, 'r') as f:
            bulb_insight = json.load(f)['insight']

    except (FileNotFoundError, KeyError, json.JSONDecodeError) as e:
        print(f"Error reading or parsing the source files: {e}")
        return None

    # Format the retrieved chunks for the prompt
    formatted_chunks = "\n".join([f"- {chunk['document']}" for chunk in retrieved_chunks])

    # 2. Construct the detailed podcast prompt with specific length instructions
    prompt = f"""
    You are a creative podcast scriptwriter. Your task is to create an engaging and informative podcast script for two speakers: Alex (the curious Host) and Ben (the knowledgeable Expert).

    Use the following information to write the script:
    - The **[Original Topic]** is the user's initial point of interest.
    - The **[Retrieved Information]** contains relevant text chunks from the user's document library.
    - The **[Key Insight]** is a high-level analysis that connects these chunks.

    **Instructions:**
    1.  **Structure:** Create a podcast script with a reading time between 2 and 5 minutes (approximately 300-750 words).
    2.  **Roles:**
        -   **Alex (Host):** Should ask questions based on the [Original Topic].
        -   **Ben (Expert):** Should answer by synthesizing information from the [Retrieved Information] and the [Key Insight], making comparisons and explaining connections.
    3.  **Tone:** Make the conversation natural, engaging, and easy for a general audience to understand.

    ---
    **[Original Topic]:**
    "{original_query}"

    **[Retrieved Information]:**
    {formatted_chunks}

    **[Key Insight]:**
    "{bulb_insight}"
    ---

    **Podcast Script:**
    """

    print("\n--- Sending comprehensive prompt to Gemini for podcast generation ---")
    try:
        # 3. Call the Gemini API
        response = model.generate_content(prompt)
        return response.text
    except Exception as e:
        print(f"An error occurred while calling the Gemini API: {e}")
        return None

# --- Main execution block ---
if __name__ == "__main__":
    # Load environment variables
    load_dotenv()

    # Configure the Gemini API
    try:
        api_key = os.getenv("GOOGLE_API_KEY")
        if not api_key:
            raise ValueError("GOOGLE_API_KEY not found.")
        genai.configure(api_key=api_key)
        gemini_model = genai.GenerativeModel('gemini-pro')
    except Exception as e:
        print(f"Error during Gemini setup: {e}")
        exit()

    # Define the paths to your input files
    results_file = "results.jsonl"
    bulb_file = "bulb.jsonl"
    
    # Generate the podcast script
    podcast_script = generate_podcast_script(results_file, bulb_file, gemini_model)
    
    # Display the final result
    if podcast_script:
        print("\n--- Generated Podcast Script ---")
        print(podcast_script)