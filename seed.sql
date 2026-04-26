-- Initial puzzles. Apply once after schema:
-- wrangler d1 execute tabs-db --remote --file=./seed.sql

INSERT OR IGNORE INTO puzzles (id, category, phrase, anchors, submitted_by, status) VALUES
  (1,  'MOVIE QUOTES',    'MAY THE FORCE BE WITH YOU', '[]', 'house', 'approved'),
  (2,  'FAMOUS SPEECHES', 'I HAVE A DREAM',            '[]', 'house', 'approved'),
  (3,  'BEATLES SONGS',   'HERE COMES THE SUN',        '[]', 'house', 'approved'),
  (4,  'SHAKESPEARE',     'TO BE OR NOT TO BE',        '[]', 'house', 'approved'),
  (5,  'PROVERBS',        'PRACTICE MAKES PERFECT',    '[]', 'house', 'approved'),
  (6,  'FILM TITLES',     'GONE WITH THE WIND',        '[]', 'house', 'approved'),
  (7,  'ROCK ANTHEMS',    'BORN IN THE USA',           '[]', 'house', 'approved'),
  (8,  'MOTIVATIONAL',    'NEVER GIVE UP',             '[]', 'house', 'approved'),
  (9,  'FAIRY TALES',     'ONCE UPON A TIME',          '[]', 'house', 'approved'),
  (10, 'CARPE DIEM',      'SEIZE THE DAY',             '[]', 'house', 'approved');
