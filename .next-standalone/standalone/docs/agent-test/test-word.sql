INSERT INTO node_jobs (node_id, kind, payload, status) VALUES
 (1, 'word_edit', '{"mode":"append","filename":"TestJarvis","text":"Bonjour Libreville, ce document est géré par Jarvis.","close":true}', 'pending')
RETURNING id;
