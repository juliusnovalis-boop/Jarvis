UPDATE node_jobs SET status='error', result='Payload JSON corrompu lors du test manuel (remplace par un job valide).' WHERE id=112;
INSERT INTO node_jobs (node_id, kind, payload, status) VALUES
 (1, 'close_app', '{"app":"calculatrice"}', 'pending')
RETURNING id;
