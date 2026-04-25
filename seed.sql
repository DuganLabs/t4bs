-- Initial puzzles. Apply once after schema:
-- wrangler d1 execute tabs-db --remote --file=./seed.sql

INSERT OR IGNORE INTO puzzles (id, category, phrase, anchors, submitted_by, status) VALUES
  (1,  'MOVIE QUOTES',    'MAY THE FORCE BE WITH YOU', '[{"wi":0,"li":0},{"wi":2,"li":2}]', 'house', 'approved'),
  (2,  'FAMOUS SPEECHES', 'I HAVE A DREAM',            '[{"wi":1,"li":0},{"wi":3,"li":0}]', 'house', 'approved'),
  (3,  'BEATLES SONGS',   'HERE COMES THE SUN',        '[{"wi":0,"li":0},{"wi":3,"li":1}]', 'house', 'approved'),
  (4,  'SHAKESPEARE',     'TO BE OR NOT TO BE',        '[{"wi":1,"li":0},{"wi":5,"li":0}]', 'house', 'approved'),
  (5,  'PROVERBS',        'PRACTICE MAKES PERFECT',    '[{"wi":0,"li":0},{"wi":1,"li":0}]', 'house', 'approved'),
  (6,  'FILM TITLES',     'GONE WITH THE WIND',        '[{"wi":0,"li":0},{"wi":3,"li":0}]', 'house', 'approved'),
  (7,  'ROCK ANTHEMS',    'BORN IN THE USA',           '[{"wi":0,"li":0},{"wi":3,"li":0}]', 'house', 'approved'),
  (8,  'MOTIVATIONAL',    'NEVER GIVE UP',             '[{"wi":0,"li":0},{"wi":2,"li":0}]', 'house', 'approved'),
  (9,  'FAIRY TALES',     'ONCE UPON A TIME',          '[{"wi":0,"li":0},{"wi":3,"li":0}]', 'house', 'approved'),
  (10, 'CARPE DIEM',      'SEIZE THE DAY',             '[{"wi":0,"li":0},{"wi":2,"li":0}]', 'house', 'approved');
