UPDATE node_jobs SET status='error', result='Remplacé par le test PowerShell COM (PyWin32 absent du package embarqué).' WHERE id=114;
INSERT INTO node_jobs (node_id, kind, payload, status) VALUES
 (1, 'word_edit', '{"mode":"append","filename":"TestJarvis","text":"Bonjour Libreville, ce document est géré par Jarvis.","close":true}', 'pending')
RETURNING id;
