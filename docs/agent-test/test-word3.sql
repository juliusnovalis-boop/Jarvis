UPDATE node_jobs SET status='error', result='Remplace par la generation stdlib .docx.' WHERE id=115;
INSERT INTO node_jobs (node_id, kind, payload, status) VALUES
 (1, 'word_edit', '{"mode":"append","filename":"TestJarvis","text":"Bonjour Libreville.","close":true}', 'pending'),
 (1, 'word_edit', '{"mode":"append","filename":"TestJarvis","text":"Deuxieme ligne ajoutee par Jarvis."}', 'pending')
RETURNING id;
