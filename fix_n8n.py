import json

with open('C:/Users/kavie/sceneread/n8n_wf.json', 'r', encoding='utf-8') as f:
    wf = json.load(f)

for n in wf['nodes']:
    if n['name'] == 'OpenAI Emotions':
        body = n['parameters']['jsonBody']

        start = body.find('{{ ')
        end = body.rfind(' }}')

        before = body[:start+3]
        expr = body[start+3:end]
        after = body[end:]

        newlines_in_expr = expr.count('\n')
        print(f'Actual newlines in expression: {newlines_in_expr}')

        # Replace actual newlines with \n escape sequences
        fixed_expr = expr.replace('\n', '\\n')

        fixed_body = before + fixed_expr + after
        n['parameters']['jsonBody'] = fixed_body

        new_expr = fixed_body[fixed_body.find('{{ ')+3:fixed_body.rfind(' }}')]
        print(f'After fix - newlines in expression: {new_expr.count(chr(10))}')

payload = {
    "name": wf["name"],
    "nodes": wf["nodes"],
    "connections": wf["connections"],
    "settings": {"executionOrder": wf.get("settings", {}).get("executionOrder", "v1")},
}

with open('C:/Users/kavie/sceneread/n8n_workflow_put2.json', 'w', encoding='utf-8') as f:
    json.dump(payload, f)

print('Saved fixed payload')
