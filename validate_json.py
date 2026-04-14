import json
import os

filepath = r"c:\Users\hp\Downloads\DOCEASE\medicament 1.json"

try:
    with open(filepath, 'r', encoding='utf-8') as f:
        data = json.load(f)
    
    full_content = "".join([p['content'] for p in data])
    
    # Save the full content to a temp file for inspection if needed
    with open("temp_full.json", "w", encoding='utf-8') as f:
        f.write(full_content)
        
    try:
        parsed = json.loads(full_content)
        print("SUCCESS: Full content is valid JSON.")
    except json.JSONDecodeError as e:
        print(f"ERROR at line {e.lineno}, col {e.colno}: {e.msg}")
        start = max(0, e.pos - 50)
        end = min(len(full_content), e.pos + 50)
        print(f"Context: ...{full_content[start:e.pos]} >>>HERE<<< {full_content[e.pos:end]}...")

except Exception as e:
    print(f"Error reading file: {e}")
