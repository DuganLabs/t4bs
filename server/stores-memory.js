/* In-memory stores for local Vite dev. The puzzle list is intentionally hard-coded
   here (server-only) and never imported by anything in /src. */

const PUZZLES_DEV = [
  { id:1,  category:"MOVIE QUOTES",    phrase:"MAY THE FORCE BE WITH YOU", anchors:[{wi:0,li:0},{wi:2,li:2}], submittedBy:"house" },
  { id:2,  category:"FAMOUS SPEECHES", phrase:"I HAVE A DREAM",            anchors:[{wi:1,li:0},{wi:3,li:0}], submittedBy:"house" },
  { id:3,  category:"BEATLES SONGS",   phrase:"HERE COMES THE SUN",        anchors:[{wi:0,li:0},{wi:3,li:1}], submittedBy:"house" },
  { id:4,  category:"SHAKESPEARE",     phrase:"TO BE OR NOT TO BE",        anchors:[{wi:1,li:0},{wi:5,li:0}], submittedBy:"house" },
  { id:5,  category:"PROVERBS",        phrase:"PRACTICE MAKES PERFECT",    anchors:[{wi:0,li:0},{wi:1,li:0}], submittedBy:"house" },
  { id:6,  category:"FILM TITLES",     phrase:"GONE WITH THE WIND",        anchors:[{wi:0,li:0},{wi:3,li:0}], submittedBy:"house" },
  { id:7,  category:"ROCK ANTHEMS",    phrase:"BORN IN THE USA",           anchors:[{wi:0,li:0},{wi:3,li:0}], submittedBy:"house" },
  { id:8,  category:"MOTIVATIONAL",    phrase:"NEVER GIVE UP",             anchors:[{wi:0,li:0},{wi:2,li:0}], submittedBy:"house" },
  { id:9,  category:"FAIRY TALES",     phrase:"ONCE UPON A TIME",          anchors:[{wi:0,li:0},{wi:3,li:0}], submittedBy:"house" },
  { id:10, category:"CARPE DIEM",      phrase:"SEIZE THE DAY",             anchors:[{wi:0,li:0},{wi:2,li:0}], submittedBy:"house" },
];

export function memoryPuzzles() {
  const list = [...PUZZLES_DEV];
  let nextId = 1000;
  return {
    async listApproved() { return list; },
    async getApproved(id) { return list.find(p => p.id === Number(id)) || null; },
    async insertApproved({ category, phrase, anchors, submittedBy }) {
      const id = nextId++;
      list.push({ id, category, phrase, anchors, submittedBy });
      return id;
    },
  };
}

export function memorySessions() {
  const map = new Map();
  return {
    async create(id, state) { map.set(id, state); },
    async get(id) { return map.get(id) || null; },
    async save(id, state) { map.set(id, state); },
  };
}

/* Submission + user stores for the local mock — minimal, in-memory. */
export function memorySubmissions(puzzlesStore) {
  const list = [];
  let nextId = 5000;
  return {
    async create(sub) { const id = nextId++; list.push({ id, status: "pending", ...sub }); return id; },
    async listPending() { return list.filter(s => s.status === "pending"); },
    async decide(id, status) {
      const s = list.find(x => x.id === id);
      if (!s) return null;
      s.status = status;
      if (status === "approved" && puzzlesStore?.insertApproved) {
        await puzzlesStore.insertApproved({
          category: s.category, phrase: s.phrase, anchors: s.anchors, submittedBy: s.submittedBy,
        });
      }
      return { id, status };
    },
  };
}

export function memoryUsers() {
  const byHandle = new Map();
  const byId = new Map();
  return {
    async getByHandle(h) { return byHandle.get(h) || null; },
    async getById(id) { return byId.get(id) || null; },
    async create({ id, handle }) {
      const u = { id, handle, createdAt: Date.now() };
      byHandle.set(handle, u); byId.set(id, u);
      return u;
    },
  };
}
