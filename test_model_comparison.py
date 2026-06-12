"""
Compare gpt-4o-mini vs gpt-4.1-mini for SceneRead Structure and Emotions tasks.
Measures: response time, output quality, JSON validity.
"""
import json, time, sys, os
from urllib.request import Request, urlopen

API_KEY = os.environ["OPENAI_API_KEY"]
URL = "https://api.openai.com/v1/chat/completions"

with open('C:/Users/kavie/sceneread/test_structure_input.json') as f:
    struct_input = json.load(f)
with open('C:/Users/kavie/sceneread/test_emotions_input.json') as f:
    emo_input = json.load(f)

# Build Structure prompt (same as n8n workflow)
structure_prompt = (
    "Parse this script into structured JSON.\n\n"
    f"USER_ROLE: {struct_input['userRole']}\n"
    f"USER_GENDER: {struct_input.get('userGender', 'unknown')}\n"
    f"ACCENT_HINT: {struct_input.get('accentHint', 'auto-detect')}\n\n"
    f"SCRIPT:\n{struct_input['textContent']}\n\n"
    "Return JSON:\n"
    "{\n"
    '  "title": "string",\n'
    '  "detected_accent": "australian|american|british|indian - Use ACCENT_HINT if provided, otherwise detect from title/setting. Default: american",\n'
    '  "season": number | null,\n'
    '  "episode_number": number | null,\n'
    '  "episode_title": "string | null",\n'
    '  "scene_description": "string - brief context",\n'
    '  "characters": [{"name": "UPPERCASE", "gender": "male|female|unknown", "is_user_character": boolean}],\n'
    '  "scenes": [{"scene_number": number, "int_ext": "INT|EXT|I/E|null", "location": "string", "time_of_day": "string|null"}],\n'
    '  "lines": [{"scene_number": number, "character": "NAME", "content": "string", "parenthetical": "string|null", "type": "dialogue|action", "sort_order": number}]\n'
    "}\n\n"
    "CRITICAL RULES:\n"
    "1. Extract EVERY line verbatim - no skipping, summarizing, or condensing\n"
    "2. This includes ALL action lines, even short ones like 'Dr. Victoria Javadi smiles.' or 'DR. TRINITY SANTOS passes by.'\n"
    "3. Use NARRATOR as the character for ALL action/description lines\n"
    "4. Character matching USER_ROLE gets is_user_character: true AND use USER_GENDER for their gender if provided (not 'unknown')\n"
    "5. If no scenes exist, use scene_number: 1 for all lines\n"
    "6. Do NOT skip transitions between speakers - every beat matters for actors\n"
    "7. Character extensions like (CONT'D), (V.O.), (O.S.) should be removed from character name, not kept in content\n"
    "8. Never split a character's continuous dialogue into multiple lines. If a character speaks without interruption, keep it as one line regardless of length.\n\n"
    "PARENTHETICAL RULES:\n"
    "1. Parentheticals are directions in parentheses at the START of a line like (angrily), (whispers), (beat), (Sigh)\n"
    "2. Extract START-OF-LINE parentheticals into the 'parenthetical' field (without the parentheses)\n"
    "3. Remove the extracted parenthetical from 'content' - content should be clean dialogue only\n"
    "4. If parenthetical is in the MIDDLE or END of dialogue, leave it in content and set parenthetical to null\n"
    "5. Examples:\n"
    "   - '(Sigh) I think she's terrible' -> content: 'I think she's terrible', parenthetical: 'Sigh'\n"
    "   - '(angrily) What do you mean?' -> content: 'What do you mean?', parenthetical: 'angrily'\n"
    "   - 'How are you (sighs) doing?' -> content: 'How are you (sighs) doing?', parenthetical: null\n"
    "   - 'I don't know (beat) maybe' -> content: 'I don't know (beat) maybe', parenthetical: null"
)

# Build Emotions prompt (same as n8n workflow)
emotions_prompt = (
    "Analyze this script data and return emotions for each line, character traits, AND practice segments for user lines.\n\n"
    f"CHARACTERS:\n{json.dumps(emo_input['characters'])}\n\n"
    f"LINES:\n{json.dumps(emo_input['linesForEmotion'])}\n\n"
    "Return JSON:\n"
    "{\n"
    '  "emotions": ["emotion1", "emotion2", ...],\n'
    '  "characters": [{"name": "UPPERCASE", "age_range": "child|teen|young_adult|adult|mature|elderly", "archetype": "protagonist|mentor|authority|friend|love_interest|comic_relief|antagonist|supporting", "vocal_quality": "warm|sharp|soft|commanding|energetic|calm|gravelly|bright"}],\n'
    '  "segments": {"LINE_INDEX": ["segment1", "segment2", ...], ...}\n'
    "}\n\n"
    "EMOTION RULES:\n"
    "- Emotions array must match lines array length and order\n"
    "- Options: neutral, happy, sad, angry, excited, fearful, surprised, whisper, shouting, sarcastic, nervous, confident, pleading, menacing, tender, bitter, hopeful\n"
    "- Parentheticals are hints: (angrily)=angry, (softly)=tender, (whispered)=whisper\n"
    "- Action/narrator lines = neutral\n"
    "- Default to neutral if unclear\n\n"
    "CHARACTER TRAIT RULES:\n"
    "- age_range: Dr./Detective/Officer titles = adult+, interns/residents = young_adult, parents of teens = mature\n"
    "- archetype: Base on role in scene - who drives action (protagonist), who guides (mentor), who opposes (antagonist)\n"
    "- vocal_quality: Match personality from dialogue\n\n"
    "SEGMENT RULES (USER CHARACTER LINES ONLY):\n"
    "- Only generate segments for lines where character has is_user_character: true\n"
    "- segments object keys are the line idx (as string)\n"
    "- If a line has 5 or fewer words, return ONE segment with the full text. Never split short lines.\n"
    "- If a line has 6+ words, split into segments at natural pauses. Target 3-7 words per segment.\n"
    "- CRITICAL: No segment may have fewer than 3 words. If a split creates a segment under 3 words, merge it with its neighbor. Prefer fewer, longer segments over violating the 3-word minimum.\n"
    "- Each segment must be verbatim consecutive text from the line.\n"
    "- Never create segments that are ONLY filler sounds (um, uh, sigh) - merge them with adjacent words\n"
    '- GOOD example: idx 5, text "I know I might look too young, but I studied hard. I earned this."\n'
    '  Result: {"5": ["I know I might look too young,", "but I studied hard. I earned this."]}\n'
    '- BAD example: {"5": ["I\'m fine.", "Thanks."]}  --  "Thanks." is 1 word. Correct: {"5": ["I\'m fine. Thanks."]}\n'
    '- BAD example: {"5": ["I know I might look too young,", "but I studied hard.", "I earned this."]}  --  "I earned this." is 3 words but could merge with previous. Prefer fewer, meatier segments'
)

def call_openai(model, prompt, max_tokens, temperature):
    body = json.dumps({
        "model": model,
        "messages": [{"role": "user", "content": prompt}],
        "temperature": temperature,
        "max_tokens": max_tokens,
        "response_format": {"type": "json_object"}
    }).encode()
    req = Request(URL, data=body, headers={
        "Content-Type": "application/json",
        "Authorization": f"Bearer {API_KEY}"
    })
    start = time.time()
    resp = urlopen(req, timeout=120)
    elapsed = time.time() - start
    data = json.loads(resp.read())
    return elapsed, data

models = ["gpt-4.1-mini", "gpt-4o-mini"]
tasks = [
    ("Structure", structure_prompt, 8192, 0.05),
    ("Emotions", emotions_prompt, 4096, 0.1),
]

# Load 4.1-mini baseline outputs for comparison
with open('C:/Users/kavie/sceneread/test_structure_output_41mini.json') as f:
    baseline_structure = json.load(f)
with open('C:/Users/kavie/sceneread/test_emotions_output_41mini.json') as f:
    baseline_emotions = json.load(f)

baseline_structure_parsed = json.loads(baseline_structure['choices'][0]['message']['content'])
baseline_emotions_parsed = json.loads(baseline_emotions['choices'][0]['message']['content'])

print("=" * 60)
print("MODEL COMPARISON: gpt-4.1-mini vs gpt-4o-mini")
print("=" * 60)

results = {}

for model in models:
    print(f"\n{'-' * 50}")
    print(f"MODEL: {model}")
    print(f"{'-' * 50}")
    results[model] = {}

    for task_name, prompt, max_tok, temp in tasks:
        print(f"\n  [{task_name}] Calling {model}...")
        try:
            elapsed, data = call_openai(model, prompt, max_tok, temp)
            content = data['choices'][0]['message']['content']
            usage = data['usage']

            # Try parse JSON
            try:
                parsed = json.loads(content)
                valid_json = True
            except:
                parsed = None
                valid_json = False

            results[model][task_name] = {
                'time': elapsed,
                'valid_json': valid_json,
                'parsed': parsed,
                'prompt_tokens': usage['prompt_tokens'],
                'completion_tokens': usage['completion_tokens'],
            }

            print(f"  Time: {elapsed:.1f}s")
            print(f"  Tokens: {usage['prompt_tokens']} in / {usage['completion_tokens']} out")
            print(f"  Valid JSON: {valid_json}")

            if valid_json and task_name == "Structure" and parsed:
                lines = parsed.get('lines', [])
                chars = parsed.get('characters', [])
                print(f"  Lines extracted: {len(lines)} (expected 14)")
                print(f"  Characters: {[c['name'] for c in chars]}")
                # Compare to baseline
                bl_lines = baseline_structure_parsed.get('lines', [])
                matching = sum(1 for a, b in zip(lines, bl_lines) if a.get('content') == b.get('content'))
                print(f"  Content match vs baseline: {matching}/{len(bl_lines)}")

            elif valid_json and task_name == "Emotions" and parsed:
                emotions = parsed.get('emotions', [])
                segments = parsed.get('segments', {})
                chars = parsed.get('characters', [])
                print(f"  Emotions count: {len(emotions)} (expected 14)")
                print(f"  Emotions: {emotions}")
                print(f"  Segments keys: {list(segments.keys())}")
                print(f"  Characters: {[c['name'] for c in chars]}")
                # Compare to baseline
                bl_emo = baseline_emotions_parsed.get('emotions', [])
                matching = sum(1 for a, b in zip(emotions, bl_emo) if a == b)
                print(f"  Emotion match vs baseline: {matching}/{len(bl_emo)}")

        except Exception as e:
            print(f"  ERROR: {e}")
            results[model][task_name] = {'error': str(e)}

# Summary
print("\n" + "=" * 60)
print("SUMMARY")
print("=" * 60)
print(f"\n{'Task':<12} {'gpt-4.1-mini':>14} {'gpt-4o-mini':>14} {'Speedup':>10}")
print(f"{'-'*12} {'-'*14} {'-'*14} {'-'*10}")

for task_name in ["Structure", "Emotions"]:
    t1 = results.get("gpt-4.1-mini", {}).get(task_name, {}).get('time', 0)
    t2 = results.get("gpt-4o-mini", {}).get(task_name, {}).get('time', 0)
    speedup = t1 / t2 if t2 > 0 else 0
    print(f"{task_name:<12} {t1:>12.1f}s {t2:>12.1f}s {speedup:>9.1f}x")

total_1 = sum(results.get("gpt-4.1-mini", {}).get(t, {}).get('time', 0) for t in ["Structure", "Emotions"])
total_2 = sum(results.get("gpt-4o-mini", {}).get(t, {}).get('time', 0) for t in ["Structure", "Emotions"])
speedup = total_1 / total_2 if total_2 > 0 else 0
print(f"{'TOTAL':<12} {total_1:>12.1f}s {total_2:>12.1f}s {speedup:>9.1f}x")
