import json

with open('C:/Users/kavie/sceneread/n8n_wf_current.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

# Gemini Structure jsonBody - exact same prompt, wrapped in Gemini format
gemini_structure_body = (
    '={\n'
    '  "contents": [{\n'
    '    "parts": [{\n'
    '      "text": {{ JSON.stringify("Parse this script into structured JSON.\\n\\nUSER_ROLE: " + $json.userRole + "\\nUSER_GENDER: " + ($json.userGender || "unknown") + "\\nACCENT_HINT: " + ($json.accentHint || "auto-detect") + "\\n\\nSCRIPT:\\n" + $json.textContent + "\\n\\nReturn JSON:\\n{\\n  \\"title\\": \\"string\\",\\n  \\"detected_accent\\": \\"australian|american|british|indian - Use ACCENT_HINT if provided, otherwise detect from title/setting. Default: american\\",\\n  \\"season\\": number | null,\\n  \\"episode_number\\": number | null,\\n  \\"episode_title\\": \\"string | null\\",\\n  \\"scene_description\\": \\"string - brief context\\",\\n  \\"characters\\": [{\\"name\\": \\"UPPERCASE\\", \\"gender\\": \\"male|female|unknown\\", \\"is_user_character\\": boolean}],\\n  \\"scenes\\": [{\\"scene_number\\": number, \\"int_ext\\": \\"INT|EXT|I/E|null\\", \\"location\\": \\"string\\", \\"time_of_day\\": \\"string|null\\"}],\\n  \\"lines\\": [{\\"scene_number\\": number, \\"character\\": \\"NAME\\", \\"content\\": \\"string\\", \\"parenthetical\\": \\"string|null\\", \\"type\\": \\"dialogue|action\\", \\"sort_order\\": number}]\\n}\\n\\nCRITICAL RULES:\\n1. Extract EVERY line verbatim - no skipping, summarizing, or condensing\\n2. This includes ALL action lines, even short ones like \'Dr. Victoria Javadi smiles.\' or \'DR. TRINITY SANTOS passes by.\'\\n3. Use NARRATOR as the character for ALL action/description lines\\n4. Character matching USER_ROLE gets is_user_character: true AND use USER_GENDER for their gender if provided (not \'unknown\')\\n5. If no scenes exist, use scene_number: 1 for all lines\\n6. Do NOT skip transitions between speakers - every beat matters for actors\\n7. Character extensions like (CONT\'D), (V.O.), (O.S.) should be removed from character name, not kept in content\\n8. Never split a character\'s continuous dialogue into multiple lines. If a character speaks without interruption, keep it as one line regardless of length.\\n\\nPARENTHETICAL RULES:\\n1. Parentheticals are directions in parentheses at the START of a line like (angrily), (whispers), (beat), (Sigh)\\n2. Extract START-OF-LINE parentheticals into the \'parenthetical\' field (without the parentheses)\\n3. Remove the extracted parenthetical from \'content\' - content should be clean dialogue only\\n4. If parenthetical is in the MIDDLE or END of dialogue, leave it in content and set parenthetical to null\\n5. Examples:\\n   - \'(Sigh) I think she\'s terrible\' -> content: \'I think she\'s terrible\', parenthetical: \'Sigh\'\\n   - \'(angrily) What do you mean?\' -> content: \'What do you mean?\', parenthetical: \'angrily\'\\n   - \'How are you (sighs) doing?\' -> content: \'How are you (sighs) doing?\', parenthetical: null\\n   - \'I don\'t know (beat) maybe\' -> content: \'I don\'t know (beat) maybe\', parenthetical: null") }}\n'
    '    }]\n'
    '  }],\n'
    '  "generationConfig": {\n'
    '    "temperature": 0.05,\n'
    '    "maxOutputTokens": 8192,\n'
    '    "responseMimeType": "application/json"\n'
    '  }\n'
    '}'
)

# Gemini Emotions jsonBody - fixed em-dashes (replaced with --)
gemini_emotions_body = (
    '={\n'
    '  "contents": [{\n'
    '    "parts": [{\n'
    '      "text": {{ JSON.stringify("Analyze this script data and return emotions for each line, character traits, AND practice segments for user lines.\\n\\nCHARACTERS:\\n" + JSON.stringify($json.characters) + "\\n\\nLINES:\\n" + JSON.stringify($json.linesForEmotion) + "\\n\\nReturn JSON:\\n{\\n  \\"emotions\\": [\\"emotion1\\", \\"emotion2\\", ...],\\n  \\"characters\\": [{\\"name\\": \\"UPPERCASE\\", \\"age_range\\": \\"child|teen|young_adult|adult|mature|elderly\\", \\"archetype\\": \\"protagonist|mentor|authority|friend|love_interest|comic_relief|antagonist|supporting\\", \\"vocal_quality\\": \\"warm|sharp|soft|commanding|energetic|calm|gravelly|bright\\"}],\\n  \\"segments\\": {\\"LINE_INDEX\\": [\\"segment1\\", \\"segment2\\", ...], ...}\\n}\\n\\nEMOTION RULES:\\n- Emotions array must match lines array length and order\\n- Options: neutral, happy, sad, angry, excited, fearful, surprised, whisper, shouting, sarcastic, nervous, confident, pleading, menacing, tender, bitter, hopeful\\n- Parentheticals are hints: (angrily)=angry, (softly)=tender, (whispered)=whisper\\n- Action/narrator lines = neutral\\n- Default to neutral if unclear\\n\\nCHARACTER TRAIT RULES:\\n- age_range: Dr./Detective/Officer titles = adult+, interns/residents = young_adult, parents of teens = mature\\n- archetype: Base on role in scene - who drives action (protagonist), who guides (mentor), who opposes (antagonist)\\n- vocal_quality: Match personality from dialogue - nervous speakers = soft, authority figures = commanding, friendly = warm\\n\\nSEGMENT RULES (USER CHARACTER LINES ONLY):\\n- Only generate segments for lines where character has is_user_character: true\\n- segments object keys are the line idx (as string)\\n- MINIMUM segment size: 3 words. NEVER create a segment with fewer than 3 words\\n- If splitting at a sentence boundary would create a segment under 3 words, merge it with the previous segment\\n- Split at natural actor breath/thought points: sentence endings (. ! ?), clauses (, ; : --)\\n- Segment length MUST be 3-5 words. Never exceed 5 words per segment.\\n- Preserve emotional beats -- don\'t split mid-thought\\n- Short lines (under 5 words) = single segment with full text\\n- Never create segments that are ONLY filler sounds (um, uh, sigh, etc.) -- merge them with the following words\\n- GOOD example: idx 5, text \\"I know I might look too young, but I studied hard. I earned this.\\"\\n  Result: {\\"5\\": [\\"I know I might look too young,\\", \\"but I studied hard. I earned this.\\"]}\\n- BAD example: {\\"5\\": [\\"I\'m fine.\\", \\"Thanks.\\"]} -- \\"Thanks.\\" is 1 word. Correct: {\\"5\\": [\\"I\'m fine. Thanks.\\"]}\\n- BAD example: {\\"5\\": [\\"I know I might look too young,\\", \\"but I studied hard.\\", \\"I earned this.\\"]} -- \\"I earned this.\\" is 3 words but could merge with previous. Prefer fewer, meatier segments") }}\n'
    '    }]\n'
    '  }],\n'
    '  "generationConfig": {\n'
    '    "temperature": 0.1,\n'
    '    "maxOutputTokens": 4096,\n'
    '    "responseMimeType": "application/json"\n'
    '  }\n'
    '}'
)

for n in wf['nodes']:
    if n['name'] == 'OpenAI Structure':
        n['name'] = 'Gemini Structure'
        n['parameters']['url'] = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
        n['parameters']['authentication'] = 'predefinedCredentialType'
        n['parameters']['nodeCredentialType'] = 'googlePalmApi'
        n['parameters']['jsonBody'] = gemini_structure_body
        n['parameters']['headerParameters'] = {"parameters": [{"name": "Content-Type", "value": "application/json"}]}
        n['parameters']['options'] = {"timeout": 60000}
        n['credentials'] = {"googlePalmApi": {"id": "w44nbVwdCVaD86z7", "name": "Google Gemini(PaLM) Api account"}}
        print(f'Updated: {n["name"]}')

    elif n['name'] == 'OpenAI Emotions':
        n['name'] = 'Gemini Emotions'
        n['parameters']['url'] = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent'
        n['parameters']['authentication'] = 'predefinedCredentialType'
        n['parameters']['nodeCredentialType'] = 'googlePalmApi'
        n['parameters']['jsonBody'] = gemini_emotions_body
        n['parameters']['headerParameters'] = {"parameters": [{"name": "Content-Type", "value": "application/json"}]}
        n['parameters']['options'] = {"timeout": 60000}
        n['credentials'] = {"googlePalmApi": {"id": "w44nbVwdCVaD86z7", "name": "Google Gemini(PaLM) Api account"}}
        print(f'Updated: {n["name"]}')

# Fix connections (rename node references)
conns = wf.get('connections', {})
new_conns = {}
rename_map = {
    'OpenAI Structure': 'Gemini Structure',
    'OpenAI Emotions': 'Gemini Emotions',
}
for src, dests in conns.items():
    new_src = rename_map.get(src, src)
    if isinstance(dests, dict):
        for conn_type, conn_lists in dests.items():
            for conn_list in conn_lists:
                for conn in conn_list:
                    old_name = conn.get('node', '')
                    if old_name in rename_map:
                        conn['node'] = rename_map[old_name]
    new_conns[new_src] = dests
wf['connections'] = new_conns

# Rename workflow
wf['name'] = 'SceneRead Upload v16 (Gemini + Retry)'

# Build PUT payload
payload = {
    "name": wf["name"],
    "nodes": wf["nodes"],
    "connections": wf["connections"],
    "settings": {"executionOrder": wf.get("settings", {}).get("executionOrder", "v1")},
}

with open('C:/Users/kavie/sceneread/n8n_gemini_revert.json', 'w', encoding='utf-8') as f:
    json.dump(payload, f)

print('Saved payload to n8n_gemini_revert.json')
