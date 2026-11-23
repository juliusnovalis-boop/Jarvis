INSERT INTO node_jobs (node_id, kind, payload, status) VALUES
 (1, 'open',      '{"app":"calc"}', 'pending'),
 (1, 'file',      '{"op":"mkdir","path":"documents/DossierTestJarvis"}', 'pending'),
 (1, 'hotkey',    '{"action":"save"}', 'pending'),
 (1, 'clipboard', '{"action":"read"}', 'pending')
RETURNING id, kind;
