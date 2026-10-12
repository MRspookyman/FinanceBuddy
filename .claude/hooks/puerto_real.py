# Hook PreToolUse (Bash y PowerShell): el 8765 es la app real del usuario, con sus datos. Ningún agente arranca nada ahí ni le
# manda peticiones. Buscar «8765» en el código sí se puede: solo se corta lo que lo usa como puerto.
import json, re, sys

try: orden = (json.load(sys.stdin).get("tool_input") or {}).get("command") or ""
except Exception: orden = ""
if re.search(r"(--puerto[ =]+8765\b|(127\.0\.0\.1|localhost|\[::1\]):8765\b)", orden):
    print(json.dumps({"hookSpecificOutput": {
        "hookEventName": "PreToolUse", "permissionDecision": "deny",
        "permissionDecisionReason": "El puerto 8765 es la app real del usuario (CLAUDE.md, «Cuidado con el puerto»). Usa otro: "
                                    "pruebas/run.py va en el 8799 y con datos de ejemplo."}}))
